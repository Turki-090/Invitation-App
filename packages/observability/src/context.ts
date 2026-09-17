import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Correlation identity carried through one request or one queue job.
 *
 * Only non-identifying operational keys belong here. `actorId` is the internal
 * user row identifier, never the auth-provider subject, email, or phone, so a
 * correlated log trail stays usable without becoming a personal-data store.
 */
export interface RequestContext {
  /** Correlates every log line, metric exemplar, and error report. */
  readonly requestId: string;
  /**
   * Spans an entire user-visible operation across API and worker processes,
   * including the jobs an API call enqueues. Defaults to the request id.
   */
  readonly correlationId: string;
  readonly actorId?: string;
  readonly eventId?: string;
  /** Route template (`/events/:eventId`), never the concrete path. */
  readonly route?: string;
  /** Queue name when the context belongs to a background job. */
  readonly queue?: string;
  readonly jobId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Header used to accept and echo a caller-supplied correlation identifier. */
export const requestIdHeader = "x-request-id";
export const correlationIdHeader = "x-correlation-id";

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  // A private copy is stored so that enrichment never writes back into the
  // caller's object.
  return storage.run({ ...context }, callback);
}

/**
 * Adds fields to the active context once authentication and routing have
 * resolved the actor and event that the rest of the request is attributed to.
 *
 * The stored object is mutated in place rather than replaced. Listeners
 * registered earlier in the request — the response `finish` handler that logs
 * the outcome, most importantly — captured a reference to that object, and
 * substituting a new one would leave them reporting the pre-authentication
 * context.
 */
export function enrichRequestContext(fields: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, fields);
}

/**
 * Correlation identifier of the active request, for stamping onto work that
 * leaves the process — a queue job, most importantly — so that an operation
 * started by a host request can be followed into the worker that completes it.
 */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function createRequestId(): string {
  return randomUUID();
}

/**
 * Accepts an inbound correlation identifier only when it is a bounded, opaque,
 * printable token. An unvalidated header would let a caller inject newlines or
 * arbitrary length into every log line it touches.
 */
export function sanitizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return undefined;
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return undefined;
  return trimmed;
}
