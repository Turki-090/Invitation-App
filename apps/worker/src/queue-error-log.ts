import type { Logger } from "@dawah/observability";

const DEFAULT_INTERVAL_MILLISECONDS = 60_000;

/**
 * Reports a worker's queue connection errors at most once per interval.
 *
 * BullMQ retries a refused Redis command about ten times a second, so one
 * outage or one exhausted Redis plan otherwise writes thousands of identical
 * lines a minute. The first error is logged at once; repeats inside the
 * interval are only counted, and the count travels with the next line.
 */
export function createQueueErrorLogger(options: {
  readonly logger: Pick<Logger, "error">;
  readonly queue: string;
  readonly intervalMilliseconds?: number;
  readonly now?: () => number;
}): (error: Error) => void {
  const interval =
    options.intervalMilliseconds ?? DEFAULT_INTERVAL_MILLISECONDS;
  const now = options.now ?? Date.now;
  let lastLoggedAt: number | undefined;
  let suppressed = 0;

  return (error) => {
    const at = now();
    if (lastLoggedAt !== undefined && at - lastLoggedAt < interval) {
      suppressed += 1;
      return;
    }
    options.logger.error("queue.connection_error", {
      queue: options.queue,
      error,
      suppressedSinceLastLog: suppressed,
    });
    lastLoggedAt = at;
    suppressed = 0;
  };
}
