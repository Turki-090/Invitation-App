import type { WorkerEnvironment } from "@dawah/config";
import type {
  MessagingProvider,
  MessagingTemplateSendInput,
  ProviderMessageResult,
} from "@dawah/messaging";
import { MessagingProviderError } from "@dawah/messaging";
import {
  createLogger,
  createNoopErrorReporter,
  createPlatformMetrics,
  createRequestId,
  recordBuildInfo,
  runWithRequestContext,
  sanitizeCorrelationId,
  createSentryErrorReporter,
  type ErrorReporter,
  type Logger,
  type PlatformMetrics,
} from "@dawah/observability";

const serviceName = "worker";
const providerName = "META_WHATSAPP";

export interface WorkerObservability {
  readonly logger: Logger;
  readonly metrics: PlatformMetrics;
  readonly errorReporter: ErrorReporter;
}

export function createWorkerObservability(
  environment: Pick<
    WorkerEnvironment,
    | "DAWAH_ENV"
    | "LOG_FORMAT"
    | "LOG_LEVEL"
    | "RELEASE_VERSION"
    | "SENTRY_DSN"
    | "SENTRY_SAMPLE_RATE"
  >,
): WorkerObservability {
  const logger = createLogger({
    service: serviceName,
    environment: environment.DAWAH_ENV,
    release: environment.RELEASE_VERSION,
    level: environment.LOG_LEVEL,
    format: environment.LOG_FORMAT,
  });
  const metrics = createPlatformMetrics();
  recordBuildInfo(metrics, {
    service: serviceName,
    environment: environment.DAWAH_ENV,
    release: environment.RELEASE_VERSION,
  });
  const errorReporter = environment.SENTRY_DSN
    ? createSentryErrorReporter({
        dsn: environment.SENTRY_DSN,
        service: serviceName,
        environment: environment.DAWAH_ENV,
        release: environment.RELEASE_VERSION,
        sampleRate: environment.SENTRY_SAMPLE_RATE,
        logger,
      })
    : createNoopErrorReporter();

  return { logger, metrics, errorReporter };
}

/**
 * The BullMQ job surface instrumentation needs, and nothing more. It carries no
 * `data` type so that each processor keeps its own precise payload type.
 */
export interface JobMetadata {
  readonly id?: string;
  readonly name: string;
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number };
}

/** Correlation and attribution fields read from a job payload when present. */
interface CorrelatedJobData {
  readonly correlationId?: unknown;
  readonly eventId?: unknown;
}

/**
 * Wraps a queue processor with correlation, timing, and failure accounting.
 *
 * A job is the second half of an operation a host started in the API, so the
 * correlation identifier travels in the job payload and is adopted here. That
 * is what lets one identifier answer "what happened to the batch I sent?"
 * across two processes. The wrapper never changes the processor's result or
 * swallows its error: BullMQ's retry and backoff behaviour must stay exactly as
 * the processor declared it.
 */
export function instrumentProcessor<TJob, TResult>(options: {
  readonly queue: string;
  readonly observability: WorkerObservability;
  readonly processor: (job: TJob) => Promise<TResult>;
}): (job: TJob & JobMetadata) => Promise<TResult> {
  const { logger, metrics, errorReporter } = options.observability;

  return async (job) => {
    const data = ((job as { data?: unknown }).data ?? {}) as CorrelatedJobData;
    const requestId = createRequestId();
    const correlationId =
      sanitizeCorrelationId(data.correlationId) ?? requestId;
    const eventId = typeof data.eventId === "string" ? data.eventId : undefined;
    const labels = { queue: options.queue, job: job.name };
    const startedAt = process.hrtime.bigint();

    return runWithRequestContext(
      {
        requestId,
        correlationId,
        queue: options.queue,
        jobId: job.id,
        eventId,
      },
      async () => {
        logger.debug("queue.job_started", { attempt: job.attemptsMade + 1 });
        try {
          const result = await options.processor(job);
          metrics.queueJobDuration.observe(labels, elapsedSeconds(startedAt));
          metrics.queueJobs.increment({ ...labels, outcome: "succeeded" });
          logger.info("queue.job_completed", {
            attempt: job.attemptsMade + 1,
            durationMs: Math.round(elapsedSeconds(startedAt) * 1_000),
          });
          return result;
        } catch (error) {
          metrics.queueJobDuration.observe(labels, elapsedSeconds(startedAt));
          const maximumAttempts =
            typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
          const exhausted = job.attemptsMade + 1 >= maximumAttempts;
          metrics.queueJobs.increment({
            ...labels,
            outcome: exhausted ? "exhausted" : "retried",
          });

          const fields = {
            attempt: job.attemptsMade + 1,
            maximumAttempts,
            error,
          };
          if (exhausted) {
            logger.error("queue.job_exhausted", fields);
            // Only a job that has run out of retries is an incident. Reporting
            // every intermediate attempt would turn one provider blip into a
            // flood of identical alerts.
            errorReporter.captureException(error, {
              transaction: `${options.queue}/${job.name}`,
              tags: { queue: options.queue },
              extra: { attempt: job.attemptsMade + 1, maximumAttempts },
            });
          } else {
            logger.warn("queue.job_failed", fields);
          }
          throw error;
        }
      },
    );
  };
}

/**
 * Counts outbound provider calls and their latency without changing the
 * provider contract. The messaging boundary stays provider-neutral, and the
 * worker still gets the send-success, failure-class, and rate-limit signals the
 * event-night runbook depends on.
 */
export function instrumentMessagingProvider(
  provider: MessagingProvider,
  metrics: PlatformMetrics,
): MessagingProvider {
  const wrap = async (
    operation: string,
    send: () => Promise<ProviderMessageResult>,
  ): Promise<ProviderMessageResult> => {
    const labels = { provider: providerName, operation };
    const startedAt = process.hrtime.bigint();
    try {
      const result = await send();
      metrics.providerRequestDuration.observe(
        labels,
        elapsedSeconds(startedAt),
      );
      metrics.providerRequests.increment({ ...labels, outcome: "succeeded" });
      return result;
    } catch (error) {
      metrics.providerRequestDuration.observe(
        labels,
        elapsedSeconds(startedAt),
      );
      metrics.providerRequests.increment({
        ...labels,
        outcome: providerOutcome(error),
      });
      throw error;
    }
  };

  return {
    sendInvitation: (input: MessagingTemplateSendInput) =>
      wrap("send_invitation", () => provider.sendInvitation(input)),
    sendReminder: (input: MessagingTemplateSendInput) =>
      wrap("send_reminder", () => provider.sendReminder(input)),
    sendConfirmation: (input: MessagingTemplateSendInput) =>
      wrap("send_confirmation", () => provider.sendConfirmation(input)),
  };
}

function providerOutcome(error: unknown): string {
  if (error instanceof MessagingProviderError) {
    return error.retryAfterMilliseconds !== undefined ||
      error.httpStatus === 429
      ? "rate_limited"
      : `failed_${error.failureClass.toLowerCase()}`;
  }
  return "failed";
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1e9;
}
