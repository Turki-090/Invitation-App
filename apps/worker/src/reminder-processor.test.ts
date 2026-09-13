import type { ReminderJobData } from "@dawah/queue";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import {
  createReminderProcessor,
  type ReminderProcessorRepository,
} from "./reminder-processor";

const now = new Date("2026-09-12T12:34:56.000Z");

describe("automatic reminder processor", () => {
  it("discovers due rules and queues their deterministic run data", async () => {
    const runs = [
      {
        eventId: "event-id",
        ruleId: "rule-id",
        scheduleKey: "a".repeat(64),
        scheduledFor: "2026-09-12T12:00:00.000Z",
      },
    ];
    const repository = stubRepository({
      listDueRuleRuns: vi.fn(async () => runs),
    });
    const enqueueRuleRuns = vi.fn(async () => undefined);
    const dispatchBatch = vi.fn(async () => undefined);
    const processor = createReminderProcessor({
      repository,
      enqueueRuleRuns,
      dispatchBatch,
      now: () => now,
    });

    await expect(processor(job({ operation: "SWEEP" }))).resolves.toEqual({
      operation: "SWEEP",
      queuedRules: 1,
      recoveredBatches: 0,
    });
    expect(repository.listDueRuleRuns).toHaveBeenCalledWith(now);
    expect(enqueueRuleRuns).toHaveBeenCalledWith(runs);
    expect(dispatchBatch).not.toHaveBeenCalled();
  });

  it("redrives reminder batches committed before their dispatch job existed", async () => {
    const repository = stubRepository({
      listPendingReminderBatchIds: vi.fn(async () => [
        "batch-one",
        "batch-two",
      ]),
    });
    const dispatchBatch = vi.fn(async () => undefined);
    const processor = createReminderProcessor({
      repository,
      enqueueRuleRuns: vi.fn(async () => undefined),
      dispatchBatch,
      now: () => now,
    });

    await expect(processor(job({ operation: "SWEEP" }))).resolves.toEqual({
      operation: "SWEEP",
      queuedRules: 0,
      recoveredBatches: 2,
    });
    expect(dispatchBatch).toHaveBeenCalledTimes(2);
    expect(dispatchBatch).toHaveBeenCalledWith("batch-one");
    expect(dispatchBatch).toHaveBeenCalledWith("batch-two");
  });

  it("dispatches a newly created scheduled reminder batch", async () => {
    const repository = stubRepository({
      runScheduledRule: vi.fn(async () => ({
        outcome: "CREATED" as const,
        batchId: "batch-id",
        selectedCount: 3,
        eligibleCount: 2,
        excludedCount: 1,
      })),
    });
    const dispatchBatch = vi.fn(async () => undefined);
    const processor = createReminderProcessor({
      repository,
      enqueueRuleRuns: vi.fn(async () => undefined),
      dispatchBatch,
      now: () => now,
    });
    const data = runData();

    await expect(processor(job(data))).resolves.toEqual({
      operation: "RUN",
      outcome: "CREATED",
      batchId: "batch-id",
      selectedCount: 3,
      eligibleCount: 2,
      excludedCount: 1,
    });
    expect(repository.runScheduledRule).toHaveBeenCalledWith(data, now);
    expect(dispatchBatch).toHaveBeenCalledWith("batch-id");
  });

  it("redispatches the durable batch on a replay and skips empty runs", async () => {
    const repository = stubRepository({
      runScheduledRule: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "REPLAYED", batchId: "batch-id" })
        .mockResolvedValueOnce({ outcome: "CREATED", batchId: null }),
    });
    const dispatchBatch = vi.fn(async () => undefined);
    const processor = createReminderProcessor({
      repository,
      enqueueRuleRuns: vi.fn(async () => undefined),
      dispatchBatch,
      now: () => now,
    });

    await processor(job(runData()));
    await processor(job(runData()));

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch).toHaveBeenCalledWith("batch-id");
  });
});

function job(data: ReminderJobData): Pick<Job<ReminderJobData>, "data"> {
  return { data };
}

function runData(): Extract<ReminderJobData, { operation: "RUN" }> {
  return {
    operation: "RUN",
    eventId: "event-id",
    ruleId: "rule-id",
    scheduleKey: "a".repeat(64),
    scheduledFor: "2026-09-12T12:00:00.000Z",
  };
}

function stubRepository(
  overrides: Partial<ReminderProcessorRepository>,
): ReminderProcessorRepository {
  return {
    listDueRuleRuns: vi.fn(async () => []),
    listPendingReminderBatchIds: vi.fn(async () => []),
    runScheduledRule: vi.fn(async () => ({
      outcome: "SKIPPED" as const,
      batchId: null,
    })),
    ...overrides,
  };
}
