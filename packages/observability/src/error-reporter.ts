import { randomUUID } from "node:crypto";
import { getRequestContext } from "./context";
import type { Logger } from "./logger";
import { redact, redactText } from "./redact";

export interface ErrorReportContext {
  /** Logical operation, e.g. `POST /events/:eventId/send-batches`. */
  readonly transaction?: string;
  readonly tags?: Readonly<Record<string, string>>;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly level?: "error" | "warning" | "fatal";
}

export interface ErrorReporter {
  readonly enabled: boolean;
  /** Fire-and-forget: reporting must never delay or fail the request path. */
  captureException(error: unknown, context?: ErrorReportContext): void;
  /** Waits for in-flight deliveries; used during graceful shutdown. */
  flush(timeoutMilliseconds?: number): Promise<boolean>;
}

export function createNoopErrorReporter(): ErrorReporter {
  return {
    enabled: false,
    captureException: () => undefined,
    flush: async () => true,
  };
}

export interface SentryDsn {
  readonly publicKey: string;
  readonly envelopeUrl: string;
}

/**
 * Parses a Sentry DSN into its public key and envelope endpoint. Returns
 * `undefined` for anything malformed so a bad configuration degrades to "no
 * error reporting" rather than failing service startup.
 */
export function parseSentryDsn(value: string): SentryDsn | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (publicKey === "" || !/^\d+$/.test(projectId)) return undefined;
  return {
    publicKey,
    envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
  };
}

export interface SentryErrorReporterOptions {
  readonly dsn: string;
  readonly environment: string;
  readonly release?: string;
  readonly service: string;
  /** 0–1. Applied per event, before any network work. */
  readonly sampleRate?: number;
  readonly requestTimeoutMilliseconds?: number;
  /** Ceiling on concurrent deliveries; further events are dropped. */
  readonly maximumConcurrentDeliveries?: number;
  readonly logger?: Logger;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => Date;
  readonly random?: () => number;
}

/**
 * Sentry error reporting over the public envelope endpoint.
 *
 * The transport is written against the documented HTTP contract instead of the
 * vendor SDK for the same reason the messaging and storage providers are:
 * error reporting is a replaceable boundary, and neither deployed service
 * should inherit an SDK's automatic instrumentation of request bodies, headers,
 * and breadcrumbs, which is exactly the material the security model forbids in
 * diagnostics. Every payload is redacted before it leaves the process.
 */
export function createSentryErrorReporter(
  options: SentryErrorReporterOptions,
): ErrorReporter {
  const dsn = parseSentryDsn(options.dsn);
  if (!dsn) {
    options.logger?.warn("observability.sentry_dsn_invalid");
    return createNoopErrorReporter();
  }

  const sampleRate = clampSampleRate(options.sampleRate ?? 1);
  const timeout = options.requestTimeoutMilliseconds ?? 5_000;
  const maximumConcurrent = options.maximumConcurrentDeliveries ?? 16;
  const send = options.fetchImplementation ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const inFlight = new Set<Promise<void>>();

  const deliver = (body: string): void => {
    if (inFlight.size >= maximumConcurrent) {
      // An error storm must not convert into unbounded socket and memory use.
      options.logger?.warn("observability.error_report_dropped", {
        reason: "delivery_saturated",
      });
      return;
    }
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), timeout);
    abortTimer.unref?.();
    const delivery = send(dsn.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=dawah/0.1.0, sentry_key=${dsn.publicKey}`,
      },
      body,
      signal: controller.signal,
    })
      .then(() => undefined)
      .catch((error: unknown) => {
        options.logger?.warn("observability.error_report_failed", {
          reason: error instanceof Error ? error.name : "unknown",
        });
      })
      .finally(() => {
        clearTimeout(abortTimer);
        inFlight.delete(delivery);
      });
    inFlight.add(delivery);
  };

  return {
    enabled: true,
    captureException: (error, context) => {
      if (sampleRate < 1 && random() >= sampleRate) return;
      try {
        deliver(
          buildEnvelope({
            error,
            context,
            environment: options.environment,
            release: options.release,
            service: options.service,
            sentAt: now(),
          }),
        );
      } catch {
        // Capturing must never raise into the caller's error path.
      }
    },
    flush: async (timeoutMilliseconds = 2_000) => {
      if (inFlight.size === 0) return true;
      const settled = Promise.allSettled(inFlight).then(() => true);
      return Promise.race([
        settled,
        new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), timeoutMilliseconds);
          timer.unref?.();
        }),
      ]);
    },
  };
}

function buildEnvelope(input: {
  error: unknown;
  context: ErrorReportContext | undefined;
  environment: string;
  release: string | undefined;
  service: string;
  sentAt: Date;
}): string {
  const eventId = randomUUID().replace(/-/g, "");
  const requestContext = getRequestContext();
  const normalized = normalizeError(input.error);

  const event: Record<string, unknown> = {
    event_id: eventId,
    timestamp: input.sentAt.toISOString(),
    platform: "node",
    level: input.context?.level ?? "error",
    environment: input.environment,
    logger: input.service,
    server_name: input.service,
    exception: {
      values: [
        {
          type: normalized.type,
          value: normalized.value,
          stacktrace: normalized.stack
            ? { frames: [], raw: normalized.stack }
            : undefined,
        },
      ],
    },
    tags: redact({
      service: input.service,
      ...input.context?.tags,
      ...(requestContext?.route ? { route: requestContext.route } : {}),
      ...(requestContext?.queue ? { queue: requestContext.queue } : {}),
    }),
    extra: redact({
      ...input.context?.extra,
      ...(requestContext
        ? {
            requestId: requestContext.requestId,
            correlationId: requestContext.correlationId,
            actorId: requestContext.actorId,
            eventId: requestContext.eventId,
            jobId: requestContext.jobId,
          }
        : {}),
    }),
  };
  if (input.release !== undefined) event.release = input.release;
  if (input.context?.transaction !== undefined) {
    event.transaction = redactText(input.context.transaction);
  }

  const payload = JSON.stringify(event);
  const header = JSON.stringify({
    event_id: eventId,
    sent_at: input.sentAt.toISOString(),
  });
  const itemHeader = JSON.stringify({
    type: "event",
    content_type: "application/json",
    length: Buffer.byteLength(payload),
  });
  return `${header}\n${itemHeader}\n${payload}\n`;
}

function normalizeError(error: unknown): {
  type: string;
  value: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      type: error.name,
      value: redactText(error.message),
      stack: error.stack ? redactText(error.stack) : undefined,
    };
  }
  return { type: "NonError", value: redactText(safeStringify(error)) };
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(redact(value)) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
