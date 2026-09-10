import {
  MessagingProviderError,
  type MessagingProvider,
  type MessagingTemplateSendInput,
  type ProviderMessageResult,
} from "@dawah/messaging";
import type { WhatsappSendJobData } from "@dawah/queue";
import type { Job } from "bullmq";

export interface ClaimedMessage {
  readonly outcome: "SEND";
  readonly messageId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly purpose: "INVITATION" | "REMINDER" | "RSVP_CONFIRMATION";
  readonly input: MessagingTemplateSendInput;
}

export interface SkippedMessage {
  readonly outcome: "SKIP";
  readonly reason: string;
}

export interface WhatsappSendRepository {
  prepareBatchDispatch(batchId: string): Promise<readonly string[]>;
  markBatchDispatched(batchId: string): Promise<void>;
  claimMessage(
    messageId: string,
    maximumAttempts: number,
  ): Promise<ClaimedMessage | SkippedMessage>;
  recordAccepted(
    claim: ClaimedMessage,
    result: ProviderMessageResult,
  ): Promise<void>;
  recordFailure(
    claim: ClaimedMessage,
    failure: {
      readonly failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS";
      readonly providerCode: string;
      readonly httpStatus?: number;
      readonly retryAfterMilliseconds?: number;
      readonly retry: boolean;
    },
  ): Promise<void>;
}

export interface WhatsappSendProcessorOptions {
  readonly repository: WhatsappSendRepository;
  readonly provider: MessagingProvider;
  readonly maximumAttempts: number;
  readonly enqueueMessages: (messageIds: readonly string[]) => Promise<void>;
  readonly rateLimit?: (milliseconds: number) => Promise<void>;
  readonly rateLimitError?: () => Error;
}

export interface WhatsappSendResult {
  readonly operation: "DISPATCH_BATCH" | "SEND_MESSAGE";
  readonly outcome: "DISPATCHED" | "ACCEPTED" | "RETRY" | "FAILED" | "SKIPPED";
  readonly count?: number;
}

export function createWhatsappSendProcessor(
  options: WhatsappSendProcessorOptions,
) {
  return async (
    job: Pick<Job<WhatsappSendJobData>, "data">,
  ): Promise<WhatsappSendResult> => {
    if (job.data.operation === "DISPATCH_BATCH") {
      const messageIds = await options.repository.prepareBatchDispatch(
        job.data.batchId,
      );
      await options.enqueueMessages(messageIds);
      await options.repository.markBatchDispatched(job.data.batchId);
      return {
        operation: "DISPATCH_BATCH",
        outcome: "DISPATCHED",
        count: messageIds.length,
      };
    }

    const claim = await options.repository.claimMessage(
      job.data.messageId,
      options.maximumAttempts,
    );
    if (claim.outcome === "SKIP") {
      return { operation: "SEND_MESSAGE", outcome: "SKIPPED" };
    }
    try {
      const result = await sendByPurpose(options.provider, claim);
      await options.repository.recordAccepted(claim, result);
      return { operation: "SEND_MESSAGE", outcome: "ACCEPTED" };
    } catch (error) {
      const providerError = normalizeProviderError(error);
      const retry =
        providerError.failureClass === "TRANSIENT" &&
        providerError.retryable &&
        claim.attemptNumber < options.maximumAttempts;
      await options.repository.recordFailure(claim, {
        failureClass: providerError.failureClass,
        providerCode: providerError.providerCode,
        ...(providerError.httpStatus === undefined
          ? {}
          : { httpStatus: providerError.httpStatus }),
        ...(providerError.retryAfterMilliseconds === undefined
          ? {}
          : {
              retryAfterMilliseconds: providerError.retryAfterMilliseconds,
            }),
        retry,
      });
      if (!retry) {
        return { operation: "SEND_MESSAGE", outcome: "FAILED" };
      }
      if (
        providerError.retryAfterMilliseconds &&
        options.rateLimit &&
        options.rateLimitError
      ) {
        await options.rateLimit(providerError.retryAfterMilliseconds);
        throw options.rateLimitError();
      }
      throw new RetryableMessagingError();
    }
  };
}

class RetryableMessagingError extends Error {
  public constructor() {
    super("Transient messaging provider failure.");
    this.name = "RetryableMessagingError";
  }
}

function sendByPurpose(
  provider: MessagingProvider,
  claim: ClaimedMessage,
): Promise<ProviderMessageResult> {
  if (claim.purpose === "REMINDER") return provider.sendReminder(claim.input);
  if (claim.purpose === "RSVP_CONFIRMATION") {
    return provider.sendConfirmation(claim.input);
  }
  return provider.sendInvitation(claim.input);
}

function normalizeProviderError(error: unknown): MessagingProviderError {
  if (error instanceof MessagingProviderError) return error;
  return new MessagingProviderError("PROVIDER_OUTCOME_UNKNOWN", {
    failureClass: "AMBIGUOUS",
    retryable: false,
  });
}
