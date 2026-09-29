import type { WhatsappSendJobData } from "@dawah/queue";
import { describe, expect, it, vi } from "vitest";
import {
  createMessagingRecovery,
  type EnqueuedJobHandle,
  type MessagingRecoveryOptions,
  type RecoverableSendJob,
} from "./messaging-recovery";

const now = new Date("2026-10-01T18:00:00.000Z");

function handle(state: string): EnqueuedJobHandle & {
  retry: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    getState: vi.fn(async () => state),
    retry: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

function failedJob(
  id: string,
  data: WhatsappSendJobData,
  overrides: Partial<RecoverableSendJob> = {},
): RecoverableSendJob {
  return {
    id,
    data,
    opts: { attempts: 5 },
    attemptsMade: 5,
    finishedOn: now.getTime() - 60_000,
    ...overrides,
  };
}

function recovery(overrides: Partial<MessagingRecoveryOptions> = {}) {
  const options: MessagingRecoveryOptions = {
    listFailedSendJobs: vi.fn(async () => []),
    recordExhaustedSendJob: vi.fn(async () => undefined),
    requeueStalledWebhooks: vi.fn(async () => []),
    addWebhookJobs: vi.fn(async () => []),
    now: () => now,
    ...overrides,
  };
  return { options, recovery: createMessagingRecovery(options) };
}

describe("stranded webhook recovery", () => {
  it("retries spent jobs, re-adds completed ones, and leaves live ones alone", async () => {
    const failed = handle("failed");
    const completed = handle("completed");
    const waiting = handle("waiting");
    const addWebhookJobs = vi
      .fn()
      .mockResolvedValueOnce([failed, completed, waiting])
      .mockResolvedValueOnce([handle("waiting")]);
    const { options, recovery: subject } = recovery({
      requeueStalledWebhooks: vi.fn(async () => ["w1", "w2", "w3"]),
      addWebhookJobs,
    });

    await expect(subject.recoverWebhooks()).resolves.toBe(3);

    expect(options.requeueStalledWebhooks).toHaveBeenCalledWith(now);
    expect(failed.retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(completed.remove).toHaveBeenCalledOnce();
    expect(addWebhookJobs).toHaveBeenNthCalledWith(2, ["w2"]);
    expect(waiting.retry).not.toHaveBeenCalled();
    expect(waiting.remove).not.toHaveBeenCalled();
  });

  it("does nothing when no event is stranded", async () => {
    const { options, recovery: subject } = recovery();

    await expect(subject.recoverWebhooks()).resolves.toBe(0);
    expect(options.addWebhookJobs).not.toHaveBeenCalled();
  });
});

describe("exhausted send reconciliation", () => {
  const dispatch: WhatsappSendJobData = {
    operation: "DISPATCH_BATCH",
    batchId: "batch-1",
  };
  const message: WhatsappSendJobData = {
    operation: "SEND_MESSAGE",
    messageId: "message-1",
  };

  it("replays the bookkeeping of exhausted jobs once, at their exhaustion time", async () => {
    const finishedOn = now.getTime() - 120_000;
    const listFailedSendJobs = vi.fn(async (start: number) =>
      start === 0
        ? [
            failedJob("batch-job", dispatch, { finishedOn }),
            failedJob("message-job", message),
          ]
        : [],
    );
    const { options, recovery: subject } = recovery({ listFailedSendJobs });

    await expect(subject.reconcileExhaustedSends()).resolves.toBe(2);
    await expect(subject.reconcileExhaustedSends()).resolves.toBe(0);

    expect(options.recordExhaustedSendJob).toHaveBeenCalledTimes(2);
    expect(options.recordExhaustedSendJob).toHaveBeenCalledWith(
      dispatch,
      new Date(finishedOn),
    );
    expect(options.recordExhaustedSendJob).toHaveBeenCalledWith(
      message,
      new Date(now.getTime() - 60_000),
    );
  });

  it("skips jobs with retries left, confirmations, and work the live handler recorded", async () => {
    const confirmation: WhatsappSendJobData = {
      operation: "SEND_RSVP_CONFIRMATION",
      confirmationId: "confirmation-1",
    };
    const { options, recovery: subject } = recovery({
      listFailedSendJobs: vi.fn(async (start: number) =>
        start === 0
          ? [
              failedJob("retrying", message, { attemptsMade: 2 }),
              failedJob("confirmation", confirmation),
              failedJob("recorded", dispatch),
            ]
          : [],
      ),
    });
    subject.markReconciled("recorded");

    await expect(subject.reconcileExhaustedSends()).resolves.toBe(0);
    expect(options.recordExhaustedSendJob).not.toHaveBeenCalled();
  });

  it("stops at jobs older than the lookback and keeps paging before it", async () => {
    const recent = Array.from({ length: 100 }, (_, index) =>
      failedJob(`recent-${index}`, message, {
        finishedOn: now.getTime() - 1_000,
      }),
    );
    const listFailedSendJobs = vi.fn(async (start: number) =>
      start === 0
        ? recent
        : [
            failedJob("stale", message, {
              finishedOn: now.getTime() - 25 * 3_600_000,
            }),
            failedJob("beyond", message),
          ],
    );
    const { options, recovery: subject } = recovery({ listFailedSendJobs });

    await expect(subject.reconcileExhaustedSends()).resolves.toBe(100);
    expect(listFailedSendJobs).toHaveBeenCalledTimes(2);
    expect(listFailedSendJobs).toHaveBeenNthCalledWith(2, 100, 199);
    expect(options.recordExhaustedSendJob).toHaveBeenCalledTimes(100);
  });

  it("leaves a job to the next sweep when its bookkeeping still cannot be written", async () => {
    const recordExhaustedSendJob = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(undefined);
    const { recovery: subject } = recovery({
      listFailedSendJobs: vi.fn(async (start: number) =>
        start === 0 ? [failedJob("message-job", message)] : [],
      ),
      recordExhaustedSendJob,
    });

    await expect(subject.reconcileExhaustedSends()).rejects.toThrow(
      "database unavailable",
    );
    await expect(subject.reconcileExhaustedSends()).resolves.toBe(1);
  });
});
