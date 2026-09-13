import type { ReminderJobData, ReminderRunJob } from "@dawah/queue";
import type { Job } from "bullmq";

export interface ReminderRuleRunResult {
  readonly outcome: "CREATED" | "REPLAYED" | "SKIPPED";
  readonly batchId: string | null;
  readonly selectedCount?: number;
  readonly eligibleCount?: number;
  readonly excludedCount?: number;
}

export interface ReminderProcessorRepository {
  listDueRuleRuns(now: Date): Promise<readonly ReminderRunJob[]>;
  listPendingReminderBatchIds(): Promise<readonly string[]>;
  runScheduledRule(
    data: Extract<ReminderJobData, { readonly operation: "RUN" }>,
    now: Date,
  ): Promise<ReminderRuleRunResult>;
}

export interface ReminderProcessorOptions {
  readonly repository: ReminderProcessorRepository;
  readonly enqueueRuleRuns: (runs: readonly ReminderRunJob[]) => Promise<void>;
  readonly dispatchBatch: (batchId: string) => Promise<void>;
  readonly now?: () => Date;
}

export type ReminderProcessorResult =
  | {
      readonly operation: "SWEEP";
      readonly queuedRules: number;
      readonly recoveredBatches: number;
    }
  | ({ readonly operation: "RUN" } & ReminderRuleRunResult);

export function createReminderProcessor(options: ReminderProcessorOptions) {
  return async (
    job: Pick<Job<ReminderJobData>, "data">,
  ): Promise<ReminderProcessorResult> => {
    const now = options.now?.() ?? new Date();
    if (job.data.operation === "SWEEP") {
      const [runs, pendingBatchIds] = await Promise.all([
        options.repository.listDueRuleRuns(now),
        options.repository.listPendingReminderBatchIds(),
      ]);
      if (runs.length > 0) await options.enqueueRuleRuns(runs);
      await Promise.all(
        pendingBatchIds.map((batchId) => options.dispatchBatch(batchId)),
      );
      return {
        operation: "SWEEP",
        queuedRules: runs.length,
        recoveredBatches: pendingBatchIds.length,
      };
    }

    const result = await options.repository.runScheduledRule(job.data, now);
    if (result.batchId) await options.dispatchBatch(result.batchId);
    return { operation: "RUN", ...result };
  };
}
