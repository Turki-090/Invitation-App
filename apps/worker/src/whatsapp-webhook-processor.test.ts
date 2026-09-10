import { describe, expect, it, vi } from "vitest";
import {
  createWhatsappWebhookProcessor,
  type PersistedWebhookEvidence,
  type WhatsappWebhookRepository,
} from "./whatsapp-webhook-processor";

const webhookEventId = "10000000-0000-4000-8000-000000000001";
const occurredAt = new Date("2026-09-09T09:00:00.000Z");

describe("WhatsApp webhook processor", () => {
  it("delegates normalized status evidence to the repository reducer", async () => {
    const evidence: PersistedWebhookEvidence = {
      kind: "STATUS",
      providerMessageId: "wamid.message-1",
      status: "READ",
      occurredAt,
    };
    const repository = webhookRepository({
      claimWebhook: vi.fn(async () => ({
        outcome: "PROCESS" as const,
        evidence,
      })),
      applyWebhook: vi.fn(async () => "APPLIED" as const),
    });
    const processor = createWhatsappWebhookProcessor(repository);

    await expect(processor({ data: { webhookEventId } })).resolves.toEqual({
      outcome: "APPLIED",
    });
    expect(repository.applyWebhook).toHaveBeenCalledTimes(1);
    expect(repository.applyWebhook).toHaveBeenCalledWith(
      webhookEventId,
      evidence,
    );
    expect(repository.recordWebhookFailure).not.toHaveBeenCalled();
  });

  it("skips an already processed duplicate before applying evidence", async () => {
    const repository = webhookRepository({
      claimWebhook: vi.fn(async () => ({ outcome: "SKIP" as const })),
    });
    const processor = createWhatsappWebhookProcessor(repository);

    await expect(processor({ data: { webhookEventId } })).resolves.toEqual({
      outcome: "SKIPPED",
    });
    expect(repository.applyWebhook).not.toHaveBeenCalled();
    expect(repository.recordWebhookFailure).not.toHaveBeenCalled();
  });

  it("preserves the repository's ignored result for uncorrelated evidence", async () => {
    const evidence: PersistedWebhookEvidence = {
      kind: "RESPONSE",
      occurredAt,
      responseType: "BUTTON",
      responseValue: "accept",
    };
    const repository = webhookRepository({
      claimWebhook: vi.fn(async () => ({
        outcome: "PROCESS" as const,
        evidence,
      })),
      applyWebhook: vi.fn(async () => "IGNORED" as const),
    });
    const processor = createWhatsappWebhookProcessor(repository);

    await expect(processor({ data: { webhookEventId } })).resolves.toEqual({
      outcome: "IGNORED",
    });
    expect(repository.applyWebhook).toHaveBeenCalledWith(
      webhookEventId,
      evidence,
    );
  });

  it("records a processing failure before allowing BullMQ to retry", async () => {
    const evidence: PersistedWebhookEvidence = {
      kind: "STATUS",
      providerMessageId: "wamid.message-1",
      status: "DELIVERED",
      occurredAt,
    };
    const processingError = new Error("database unavailable");
    const repository = webhookRepository({
      claimWebhook: vi.fn(async () => ({
        outcome: "PROCESS" as const,
        evidence,
      })),
      applyWebhook: vi.fn(async () => {
        throw processingError;
      }),
    });
    const processor = createWhatsappWebhookProcessor(repository);

    await expect(processor({ data: { webhookEventId } })).rejects.toBe(
      processingError,
    );
    expect(repository.recordWebhookFailure).toHaveBeenCalledWith(
      webhookEventId,
    );
  });
});

function webhookRepository(
  overrides: Partial<WhatsappWebhookRepository> = {},
): WhatsappWebhookRepository {
  return {
    claimWebhook: vi.fn(async () => ({ outcome: "SKIP" as const })),
    applyWebhook: vi.fn(async () => "IGNORED" as const),
    recordWebhookFailure: vi.fn(async () => undefined),
    ...overrides,
  };
}
