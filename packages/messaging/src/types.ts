import type {
  MessagingFailureClass,
  MessagingRetryClassification,
} from "@dawah/domain";

export type MessagingPurpose = "INVITATION" | "REMINDER" | "RSVP_CONFIRMATION";

export interface MessagingTemplateSendInput {
  readonly logicalMessageId: string;
  readonly to: string;
  readonly templateName: string;
  readonly languageCode: string;
  readonly bodyParameters: readonly string[];
  /** Stable callback payloads for approved quick-reply template buttons. */
  readonly quickReplyPayloads?: readonly string[];
  readonly header?:
    | { readonly kind: "IMAGE_ID"; readonly mediaId: string }
    | { readonly kind: "IMAGE_LINK"; readonly url: string };
}

export interface ProviderMessageResult {
  readonly provider: "META_WHATSAPP";
  readonly providerMessageId: string;
  readonly acceptedAt: Date;
}

export interface MessagingProvider {
  sendInvitation(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult>;
  sendReminder(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult>;
  sendConfirmation(
    input: MessagingTemplateSendInput,
  ): Promise<ProviderMessageResult>;
}

export class MessagingProviderError extends Error {
  public readonly failureClass: MessagingFailureClass;
  public readonly retryable: boolean;
  public readonly retryAfterMilliseconds?: number;

  public constructor(
    public readonly providerCode: string,
    classification: MessagingRetryClassification,
    public readonly httpStatus?: number,
    options?: ErrorOptions,
  ) {
    super("The messaging provider could not accept the message.", options);
    this.name = "MessagingProviderError";
    this.failureClass = classification.failureClass;
    this.retryable = classification.retryable;
    this.retryAfterMilliseconds = classification.retryAfterMilliseconds;
  }
}
