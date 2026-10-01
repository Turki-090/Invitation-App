import type { WhatsappSendJobData } from "@dawah/queue";

/** The slice of a BullMQ job that recovery reads. */
export interface RecoverableSendJob {
  readonly id?: string;
  readonly data: WhatsappSendJobData;
  readonly opts: { readonly attempts?: number };
  readonly attemptsMade: number;
  readonly finishedOn?: number;
}

/** The slice of a BullMQ job that re-enqueueing acts on. */
export interface EnqueuedJobHandle {
  getState(): Promise<string>;
  retry(
    state: "failed",
    options: { resetAttemptsMade: boolean; resetAttemptsStarted: boolean },
  ): Promise<void>;
  remove(): Promise<void>;
}

export interface MessagingRecoveryOptions {
  /** Failed send jobs, newest first, BullMQ `getFailed` paging semantics. */
  readonly listFailedSendJobs: (
    start: number,
    end: number,
  ) => Promise<readonly (RecoverableSendJob | undefined)[]>;
  readonly recordExhaustedSendJob: (
    job: WhatsappSendJobData,
    exhaustedAt: Date,
  ) => Promise<void>;
  readonly requeueStalledWebhooks: (now: Date) => Promise<readonly string[]>;
  /** Adds webhook jobs by deterministic id, returning the existing job for duplicates. */
  readonly addWebhookJobs: (
    webhookEventIds: readonly string[],
  ) => Promise<readonly EnqueuedJobHandle[]>;
  readonly now?: () => Date;
}

const exhaustedJobLookback = 24 * 3_600_000;
const pageSize = 100;

/**
 * Heals the two ways queued WhatsApp work can be stranded by an outage that
 * outlasts BullMQ's retries: guest replies whose webhook jobs were spent, and
 * exhausted send jobs whose "retry by hand" bookkeeping could not be written.
 *
 * Neither path sends anything new. Webhook application is idempotent, and
 * replaying exhaustion bookkeeping only marks still-queued messages failed so
 * the host can see them; the host's retry fences out a stale replay.
 */
export function createMessagingRecovery(options: MessagingRecoveryOptions) {
  const now = options.now ?? (() => new Date());
  // Bookkeeping already replayed by this process; a restart replays it once
  // more, which is harmless because the write is conditional.
  const reconciled = new Set<string>();

  return {
    async recoverWebhooks(): Promise<number> {
      const ids = await options.requeueStalledWebhooks(now());
      if (ids.length === 0) return 0;
      const jobs = await options.addWebhookJobs(ids);
      const spent: string[] = [];
      await Promise.all(
        jobs.map(async (job, index) => {
          const state = await job.getState();
          if (state === "failed") {
            await job.retry("failed", {
              resetAttemptsMade: true,
              resetAttemptsStarted: true,
            });
          } else if (state === "completed") {
            // A retained completed job would swallow the re-add.
            await job.remove();
            spent.push(ids[index]!);
          }
        }),
      );
      if (spent.length > 0) await options.addWebhookJobs(spent);
      return ids.length;
    },

    async reconcileExhaustedSends(): Promise<number> {
      const oldest = now().getTime() - exhaustedJobLookback;
      let replayed = 0;
      for (let start = 0; ; start += pageSize) {
        const page = await options.listFailedSendJobs(
          start,
          start + pageSize - 1,
        );
        if (page.length === 0) return replayed;
        for (const job of page) {
          if (!job?.id) continue;
          if ((job.finishedOn ?? 0) < oldest) return replayed;
          if (reconciled.has(job.id) || !exhausted(job)) continue;
          // RSVP confirmations have their own sweep that retries them.
          if (job.data.operation === "SEND_RSVP_CONFIRMATION") continue;
          await options.recordExhaustedSendJob(
            job.data,
            new Date(job.finishedOn ?? now().getTime()),
          );
          reconciled.add(job.id);
          replayed += 1;
        }
        if (reconciled.size > 50_000) reconciled.clear();
      }
    },

    /** Called when the live failure handler already wrote the bookkeeping. */
    markReconciled(jobId: string): void {
      reconciled.add(jobId);
    },
  };
}

function exhausted(job: RecoverableSendJob): boolean {
  const attempts =
    typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
  return job.attemptsMade >= attempts;
}
