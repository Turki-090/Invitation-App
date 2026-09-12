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

export interface DeferredMessage {
  readonly outcome: "DEFER";
  readonly reason: string;
}

export interface ClaimedRsvpConfirmation {
  readonly outcome: "SEND";
  readonly confirmationId: string;
  readonly attemptNumber: number;
  readonly input: MessagingTemplateSendInput;
}

type ProviderFailure = {
  readonly failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS";
  readonly providerCode: string;
  readonly httpStatus?: number;
  readonly retryAfterMilliseconds?: number;
  readonly retry: boolean;
};

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
  recordFailure(claim: ClaimedMessage, failure: ProviderFailure): Promise<void>;
  claimRsvpConfirmation(
    confirmationId: string,
    maximumAttempts: number,
  ): Promise<ClaimedRsvpConfirmation | SkippedMessage | DeferredMessage>;
  recordRsvpConfirmationAccepted(
    claim: ClaimedRsvpConfirmation,
    result: ProviderMessageResult,
  ): Promise<void>;
  recordRsvpConfirmationFailure(
    claim: ClaimedRsvpConfirmation,
    failure: ProviderFailure,
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
  readonly operation:
    "DISPATCH_BATCH" | "SEND_MESSAGE" | "SEND_RSVP_CONFIRMATION";
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

    if (job.data.operation === "SEND_RSVP_CONFIRMATION") {
      const claim = await options.repository.claimRsvpConfirmation(
        job.data.confirmationId,
        options.maximumAttempts,
      );
      if (claim.outcome === "DEFER") throw new RetryableMessagingError();
      if (claim.outcome === "SKIP") {
        return { operation: "SEND_RSVP_CONFIRMATION", outcome: "SKIPPED" };
      }
      try {
        const result = await options.provider.sendConfirmation(claim.input);
        await options.repository.recordRsvpConfirmationAccepted(claim, result);
        return { operation: "SEND_RSVP_CONFIRMATION", outcome: "ACCEPTED" };
      } catch (error) {
        const failure = providerFailure(
          error,
          claim.attemptNumber,
          options.maximumAttempts,
        );
        await options.repository.recordRsvpConfirmationFailure(claim, failure);
        return handleFailure(options, failure, "SEND_RSVP_CONFIRMATION");
      }
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
      const failure = providerFailure(
        error,
        claim.attemptNumber,
        options.maximumAttempts,
      );
      await options.repository.recordFailure(claim, failure);
      return handleFailure(options, failure, "SEND_MESSAGE");
    }
  };
}

async function handleFailure(
  options: WhatsappSendProcessorOptions,
  failure: ProviderFailure,
  operation: "SEND_MESSAGE" | "SEND_RSVP_CONFIRMATION",
): Promise<WhatsappSendResult> {
  if (!failure.retry) return { operation, outcome: "FAILED" };
  if (
    failure.retryAfterMilliseconds &&
    options.rateLimit &&
    options.rateLimitError
  ) {
    await options.rateLimit(failure.retryAfterMilliseconds);
    throw options.rateLimitError();
  }
  throw new RetryableMessagingError();
}

function providerFailure(
  error: unknown,
  attemptNumber: number,
  maximumAttempts: number,
): ProviderFailure {
  const providerError = normalizeProviderError(error);
  return {
    failureClass: providerError.failureClass,
    providerCode: providerError.providerCode,
    ...(providerError.httpStatus === undefined
      ? {}
      : { httpStatus: providerError.httpStatus }),
    ...(providerError.retryAfterMilliseconds === undefined
      ? {}
      : { retryAfterMilliseconds: providerError.retryAfterMilliseconds }),
    retry:
      providerError.failureClass === "TRANSIENT" &&
      providerError.retryable &&
      attemptNumber < maximumAttempts,
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
