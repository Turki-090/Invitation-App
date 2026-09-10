export const MESSAGE_DELIVERY_STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
  "FAILED",
  "CANCELLED",
] as const;

export type MessageDeliveryStatus = (typeof MESSAGE_DELIVERY_STATUSES)[number];

export const MESSAGING_FAILURE_CLASSES = [
  "TRANSIENT",
  "PERMANENT",
  "AMBIGUOUS",
] as const;

export type MessagingFailureClass = (typeof MESSAGING_FAILURE_CLASSES)[number];

export interface MessagingFailureInput {
  readonly httpStatus?: number;
  readonly providerCode?: string;
  readonly providerCodes?: readonly string[];
  readonly networkError?: boolean;
  readonly timedOut?: boolean;
  readonly retryAfterMilliseconds?: number;
}

export interface MessagingRetryClassification {
  readonly failureClass: MessagingFailureClass;
  readonly retryable: boolean;
  readonly retryAfterMilliseconds?: number;
}

const positiveStatusRank: Partial<Record<MessageDeliveryStatus, number>> = {
  QUEUED: 0,
  SENDING: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  RESPONDED: 5,
};

/**
 * Reduces delivery evidence without trusting webhook arrival order.
 *
 * Positive provider evidence is monotonic. A definitive delivery failure may
 * replace local/HTTP acceptance (`SENT`), but never erases proof that the
 * message was delivered, read, or answered. Conversely, late positive evidence
 * can recover a message previously marked failed. Cancellation is an explicit
 * local terminal action.
 */
export function reduceMessageDeliveryStatus(
  current: MessageDeliveryStatus,
  incoming: MessageDeliveryStatus,
): MessageDeliveryStatus {
  if (current === "CANCELLED" || incoming === "CANCELLED") return "CANCELLED";

  if (incoming === "FAILED") {
    return (positiveStatusRank[current] ?? -1) >= positiveStatusRank.DELIVERED!
      ? current
      : "FAILED";
  }
  if (current === "FAILED") {
    return (positiveStatusRank[incoming] ?? -1) >= positiveStatusRank.DELIVERED!
      ? incoming
      : "FAILED";
  }

  const currentRank = positiveStatusRank[current] ?? -1;
  const incomingRank = positiveStatusRank[incoming] ?? -1;
  return incomingRank > currentRank ? incoming : current;
}

const transientProviderCodes = new Set([
  "1",
  "2",
  "4",
  "17",
  "341",
  "368",
  "80007",
  "130429",
  "131048",
  "131056",
]);

/**
 * Classifies provider failures conservatively. A timeout or transport break
 * after request dispatch has an unknown delivery outcome and must not be
 * retried blindly because doing so can duplicate a WhatsApp message.
 */
export function classifyMessagingRetry(
  failure: MessagingFailureInput,
): MessagingRetryClassification {
  if (failure.timedOut || failure.networkError) {
    return { failureClass: "AMBIGUOUS", retryable: false };
  }

  const retryAfterMilliseconds = normalizeRetryAfter(
    failure.retryAfterMilliseconds,
  );
  if (
    failure.httpStatus === 429 ||
    (failure.providerCode !== undefined &&
      transientProviderCodes.has(failure.providerCode)) ||
    failure.providerCodes?.some((code) => transientProviderCodes.has(code))
  ) {
    return {
      failureClass: "TRANSIENT",
      retryable: true,
      ...(retryAfterMilliseconds === undefined
        ? {}
        : { retryAfterMilliseconds }),
    };
  }

  if (
    failure.httpStatus === 408 ||
    (failure.httpStatus !== undefined && failure.httpStatus >= 500)
  ) {
    return { failureClass: "AMBIGUOUS", retryable: false };
  }

  return { failureClass: "PERMANENT", retryable: false };
}

function normalizeRetryAfter(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(Math.ceil(value), 15 * 60 * 1_000);
}
