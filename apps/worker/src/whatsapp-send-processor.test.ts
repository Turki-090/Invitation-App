import {
  MessagingProviderError,
  type MessagingProvider,
  type MessagingTemplateSendInput,
  type ProviderMessageResult,
} from "@dawah/messaging";
import { describe, expect, it, vi } from "vitest";
import {
  createWhatsappSendProcessor,
  type ClaimedMessage,
  type WhatsappSendRepository,
} from "./whatsapp-send-processor";

const batchId = "10000000-0000-4000-8000-000000000001";
const messageId = "20000000-0000-4000-8000-000000000001";
const acceptedAt = new Date("2026-09-09T09:00:00.000Z");

describe("WhatsApp send processor", () => {
  it("fans a batch out once and marks dispatch after enqueueing", async () => {
    const repository = sendRepository({
      prepareBatchDispatch: vi.fn(async () => [messageId, `${messageId}-2`]),
    });
    const enqueueMessages = vi.fn(async () => undefined);
    const processor = createWhatsappSendProcessor({
      repository,
      provider: messagingProvider(),
      maximumAttempts: 3,
      enqueueMessages,
    });

    await expect(
      processor({ data: { operation: "DISPATCH_BATCH", batchId } }),
    ).resolves.toEqual({
      operation: "DISPATCH_BATCH",
      outcome: "DISPATCHED",
      count: 2,
    });
    expect(repository.prepareBatchDispatch).toHaveBeenCalledWith(batchId);
    expect(enqueueMessages).toHaveBeenCalledWith([messageId, `${messageId}-2`]);
    expect(repository.markBatchDispatched).toHaveBeenCalledWith(batchId);
    expect(enqueueMessages.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.markBatchDispatched).mock.invocationCallOrder[0]!,
    );
  });

  it("treats a duplicate or terminal message delivery as a no-op", async () => {
    const repository = sendRepository({
      claimMessage: vi.fn(async () => ({
        outcome: "SKIP" as const,
        reason: "STATUS_SENT",
      })),
    });
    const provider = messagingProvider();
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 3,
      enqueueMessages: vi.fn(async () => undefined),
    });

    await expect(
      processor({ data: { operation: "SEND_MESSAGE", messageId } }),
    ).resolves.toEqual({ operation: "SEND_MESSAGE", outcome: "SKIPPED" });
    expect(repository.claimMessage).toHaveBeenCalledWith(messageId, 3);
    expect(provider.sendInvitation).not.toHaveBeenCalled();
    expect(provider.sendReminder).not.toHaveBeenCalled();
    expect(provider.sendConfirmation).not.toHaveBeenCalled();
    expect(repository.recordAccepted).not.toHaveBeenCalled();
    expect(repository.recordFailure).not.toHaveBeenCalled();
  });

  it("records provider acceptance against the claimed immutable message", async () => {
    const claim = claimedMessage();
    const repository = sendRepository({
      claimMessage: vi.fn(async () => claim),
    });
    const result: ProviderMessageResult = {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.accepted-1",
      acceptedAt,
    };
    const provider = messagingProvider({
      sendInvitation: vi.fn(async () => result),
    });
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 3,
      enqueueMessages: vi.fn(async () => undefined),
    });

    await expect(
      processor({ data: { operation: "SEND_MESSAGE", messageId } }),
    ).resolves.toEqual({ operation: "SEND_MESSAGE", outcome: "ACCEPTED" });
    expect(provider.sendInvitation).toHaveBeenCalledWith(claim.input);
    expect(repository.recordAccepted).toHaveBeenCalledWith(claim, result);
    expect(repository.recordFailure).not.toHaveBeenCalled();
  });

  it("records a bounded rate-limit retry and asks BullMQ to delay it", async () => {
    const claim = claimedMessage({ attemptNumber: 1 });
    const providerError = new MessagingProviderError(
      "131056",
      {
        failureClass: "TRANSIENT",
        retryable: true,
        retryAfterMilliseconds: 2_500,
      },
      429,
    );
    const repository = sendRepository({
      claimMessage: vi.fn(async () => claim),
    });
    const provider = messagingProvider({
      sendInvitation: vi.fn(async () => {
        throw providerError;
      }),
    });
    const rateLimit = vi.fn(async () => undefined);
    const rateLimitSignal = new Error("bullmq-rate-limit");
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 3,
      enqueueMessages: vi.fn(async () => undefined),
      rateLimit,
      rateLimitError: () => rateLimitSignal,
    });

    await expect(
      processor({ data: { operation: "SEND_MESSAGE", messageId } }),
    ).rejects.toBe(rateLimitSignal);
    expect(repository.recordFailure).toHaveBeenCalledWith(claim, {
      failureClass: "TRANSIENT",
      providerCode: "131056",
      httpStatus: 429,
      retryAfterMilliseconds: 2_500,
      retry: true,
    });
    expect(rateLimit).toHaveBeenCalledWith(2_500);
    expect(repository.recordAccepted).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous provider outcome", async () => {
    const claim = claimedMessage({ attemptNumber: 1 });
    const repository = sendRepository({
      claimMessage: vi.fn(async () => claim),
    });
    const provider = messagingProvider({
      sendInvitation: vi.fn(async () => {
        throw new Error("connection ended after request dispatch");
      }),
    });
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 3,
      enqueueMessages: vi.fn(async () => undefined),
    });

    await expect(
      processor({ data: { operation: "SEND_MESSAGE", messageId } }),
    ).resolves.toEqual({ operation: "SEND_MESSAGE", outcome: "FAILED" });
    expect(repository.recordFailure).toHaveBeenCalledWith(claim, {
      failureClass: "AMBIGUOUS",
      providerCode: "PROVIDER_OUTCOME_UNKNOWN",
      retry: false,
    });
  });
});

function claimedMessage(
  overrides: Partial<ClaimedMessage> = {},
): ClaimedMessage {
  return {
    outcome: "SEND",
    messageId,
    attemptId: "30000000-0000-4000-8000-000000000001",
    attemptNumber: 1,
    purpose: "INVITATION",
    input: {
      logicalMessageId: messageId,
      to: "+966501234567",
      templateName: "wedding_invitation_v1",
      languageCode: "ar",
      bodyParameters: ["Guest", "Host"],
    },
    ...overrides,
  };
}

function sendRepository(
  overrides: Partial<WhatsappSendRepository> = {},
): WhatsappSendRepository {
  return {
    prepareBatchDispatch: vi.fn(async () => []),
    markBatchDispatched: vi.fn(async () => undefined),
    claimMessage: vi.fn(async () => ({
      outcome: "SKIP" as const,
      reason: "MESSAGE_NOT_FOUND",
    })),
    recordAccepted: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
    ...overrides,
  };
}

function messagingProvider(
  overrides: Partial<MessagingProvider> = {},
): MessagingProvider {
  const notExpected = async (
    _input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult> => {
    throw new Error("Provider method was not expected to run.");
  };
  return {
    sendInvitation: vi.fn(notExpected),
    sendReminder: vi.fn(notExpected),
    sendConfirmation: vi.fn(notExpected),
    ...overrides,
  };
}
