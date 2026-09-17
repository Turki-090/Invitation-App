import {
  sampledQueueStates,
  type Logger,
  type PlatformMetrics,
} from "@dawah/observability";

/** The queue surface sampling needs; keeps the sampler testable without Redis. */
export interface SampledQueue {
  readonly name: string;
  getJobCounts(...states: string[]): Promise<Record<string, number>>;
  getJobs(
    states: string[],
    start: number,
    end: number,
    ascending: boolean,
  ): Promise<{ timestamp?: number }[]>;
}

export interface QueueDepthSampler {
  sample(): Promise<void>;
}

/**
 * Samples queue depth and backlog age at scrape time.
 *
 * Depth is read on demand rather than polled on a timer so that an unscraped
 * worker spends nothing on Redis round trips, and so the numbers an operator
 * reads are the numbers at the moment they looked. Backlog age matters more
 * than depth during an incident: a queue holding 500 jobs that are all seconds
 * old is healthy, and one holding 20 jobs that are an hour old is not.
 */
export function createQueueDepthSampler(options: {
  readonly queues: readonly SampledQueue[];
  readonly metrics: PlatformMetrics;
  readonly logger: Logger;
  readonly now?: () => number;
}): QueueDepthSampler {
  const now = options.now ?? Date.now;

  return {
    sample: async () => {
      await Promise.all(
        options.queues.map(async (queue) => {
          try {
            const counts = await queue.getJobCounts(...sampledQueueStates);
            for (const state of sampledQueueStates) {
              options.metrics.queueDepth.set(
                { queue: queue.name, state },
                counts[state] ?? 0,
              );
            }

            const [oldest] = await queue.getJobs(["waiting"], 0, 0, true);
            const enqueuedAt = oldest?.timestamp;
            options.metrics.queueOldestWaitingJobAge.set(
              { queue: queue.name },
              enqueuedAt === undefined
                ? 0
                : Math.max(0, (now() - enqueuedAt) / 1_000),
            );
          } catch (error) {
            // A scrape must still return the metrics that are available; an
            // unreachable Redis is already reported by readiness.
            options.logger.warn("metrics.queue_sample_failed", {
              queue: queue.name,
              error,
            });
          }
        }),
      );
    },
  };
}
