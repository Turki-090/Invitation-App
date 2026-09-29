import type { JobsOptions } from "bullmq";
import Redis from "ioredis";

export const queueNames = {
  health: "platform-health",
  whatsappSend: "whatsapp-send",
  whatsappWebhook: "whatsapp-webhook",
  reminders: "reminders",
  imports: "imports",
  exports: "exports",
  notifications: "notifications",
  eventMaintenance: "event-maintenance",
} as const;

/**
 * Five attempts at 5, 10, 20, then 40 seconds span about 75 seconds, which
 * outlasts a routine managed-database or Redis failover. A shorter window
 * exhausted every in-flight job during one, and exhaustion is what turns an
 * outage into messages a host has to retry by hand.
 */
export const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
} satisfies JobsOptions;

/**
 * Correlation carried from the request that enqueued a job into the worker
 * that runs it. It is optional because jobs also originate inside the worker —
 * scheduled sweeps and fan-out from a dispatch job — and because it must never
 * participate in a deterministic job id, which is what keeps enqueueing
 * idempotent.
 */
export interface JobCorrelation {
  readonly correlationId?: string;
}

export type WhatsappSendJobData = (
  | { readonly operation: "DISPATCH_BATCH"; readonly batchId: string }
  | { readonly operation: "SEND_MESSAGE"; readonly messageId: string }
  | {
      readonly operation: "SEND_RSVP_CONFIRMATION";
      readonly confirmationId: string;
    }
) &
  JobCorrelation;

export interface WhatsappWebhookJobData extends JobCorrelation {
  readonly webhookEventId: string;
}

export interface ExportJobData extends JobCorrelation {
  readonly eventId: string;
  readonly exportJobId: string;
}

export function exportJobId(exportJobId: string): string {
  return `export-${exportJobId}`;
}

export type ReminderJobData = (
  | { readonly operation: "SWEEP" }
  | {
      readonly operation: "RUN";
      readonly eventId: string;
      readonly ruleId: string;
      /** SHA-256 persistence key for one rule/evaluation slot. */
      readonly scheduleKey: string;
      /** ISO instant at the start of the deterministic evaluation slot. */
      readonly scheduledFor: string;
    }
) &
  JobCorrelation;

export interface ReminderRunJob {
  readonly eventId: string;
  readonly ruleId: string;
  readonly scheduleKey: string;
  readonly scheduledFor: string;
}

export const reminderSweepSchedulerId = "automatic-reminder-sweep";

export function reminderSweepJobData(): ReminderJobData {
  return { operation: "SWEEP" };
}

export function reminderRunJobId(ruleId: string, scheduleKey: string): string {
  return `reminder-run-${ruleId}-${scheduleKey}`;
}

export function reminderRunJobs(runs: readonly ReminderRunJob[]) {
  return runs.map((run) => ({
    name: "run" as const,
    data: { operation: "RUN" as const, ...run },
    opts: {
      jobId: reminderRunJobId(run.ruleId, run.scheduleKey),
      ...defaultJobOptions,
    },
  }));
}

export function whatsappBatchJobId(batchId: string): string {
  return `batch-${batchId}`;
}

export function whatsappMessageJobId(messageId: string): string {
  return `message-${messageId}`;
}

export function whatsappRsvpConfirmationJobId(confirmationId: string): string {
  return `rsvp-confirmation-${confirmationId}`;
}

export function whatsappMessageJobs(
  messageIds: readonly string[],
  maximumAttempts: number,
) {
  return messageIds.map((messageId) => ({
    name: "send" as const,
    data: { operation: "SEND_MESSAGE" as const, messageId },
    opts: {
      jobId: whatsappMessageJobId(messageId),
      attempts: maximumAttempts,
      backoff: defaultJobOptions.backoff,
    },
  }));
}

export function whatsappRsvpConfirmationJobs(
  confirmationIds: readonly string[],
  maximumAttempts: number,
) {
  return confirmationIds.map((confirmationId) => ({
    name: "send-rsvp-confirmation" as const,
    data: {
      operation: "SEND_RSVP_CONFIRMATION" as const,
      confirmationId,
    },
    opts: {
      jobId: whatsappRsvpConfirmationJobId(confirmationId),
      attempts: maximumAttempts,
      backoff: defaultJobOptions.backoff,
    },
  }));
}

export function whatsappWebhookJobId(webhookEventId: string): string {
  return `webhook-${webhookEventId}`;
}

/**
 * A long-lived producer connection. Commands fail immediately while it is
 * disconnected, so a request never hangs on Redis, but the connection itself
 * keeps reconnecting: one failover or idle disconnect must not leave a process
 * unable to enqueue until someone restarts it.
 */
export function createProducerRedis(
  redisUrl: string,
  connectionName: string,
): Redis {
  return new Redis(redisUrl, {
    ...producerConnectionOptions(connectionName),
    retryStrategy: producerReconnectDelay,
  });
}

/** Capped linear backoff between producer reconnection attempts. */
export function producerReconnectDelay(attempt: number): number {
  return Math.min(attempt * 500, 5_000);
}

function producerConnectionOptions(connectionName: string) {
  return {
    connectionName,
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  };
}

export function createWorkerRedis(
  redisUrl: string,
  connectionName: string,
): Redis {
  return new Redis(redisUrl, {
    connectionName,
    connectTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

export async function probeRedis(
  redisUrl: string,
  timeoutMilliseconds: number,
): Promise<boolean> {
  // A probe answers for this instant only, so it must never retry.
  const connection = new Redis(redisUrl, {
    ...producerConnectionOptions("dawah-readiness"),
    retryStrategy: () => null,
  });
  // The outcome is the return value; an unreachable server is not a log line.
  connection.on("error", () => undefined);
  let timeout: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      connection.connect().then(() => connection.ping()),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Redis readiness probe timed out.")),
          timeoutMilliseconds,
        );
      }),
    ]);
    return result === "PONG";
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
    connection.disconnect(false);
  }
}
