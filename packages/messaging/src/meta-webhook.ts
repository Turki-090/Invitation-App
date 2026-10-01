import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { MessageDeliveryStatus } from "@dawah/domain";

export interface MetaStatusWebhookEvent {
  readonly kind: "STATUS";
  readonly providerEventId: string;
  readonly providerMessageId: string;
  readonly logicalMessageId?: string;
  readonly status: Extract<
    MessageDeliveryStatus,
    "SENT" | "DELIVERED" | "READ" | "FAILED"
  >;
  readonly occurredAt: Date;
  readonly failureCode?: string;
  readonly failureReason?: string;
}

export interface MetaResponseWebhookEvent {
  readonly kind: "RESPONSE";
  readonly providerEventId: string;
  readonly inboundMessageId: string;
  readonly contextProviderMessageId?: string;
  readonly occurredAt: Date;
  readonly responseType: "BUTTON" | "TEXT" | "UNKNOWN";
  readonly responseValue?: string;
}

export type MetaWebhookEvent =
  MetaStatusWebhookEvent | MetaResponseWebhookEvent;

/**
 * Why one item of an otherwise valid delivery was not turned into an event.
 * Values are bounded so they can be logged and counted without payload data.
 */
export type MetaWebhookSkipReason =
  "PHONE_NUMBER_MISMATCH" | "UNSUPPORTED_STATUS" | "MALFORMED_ITEM";

export interface MetaWebhookParseOptions {
  readonly phoneNumberId?: string;
  /** Called once per skipped change or item. */
  readonly onSkipped?: (reason: MetaWebhookSkipReason) => void;
}

export class MetaWebhookPayloadError extends Error {
  public constructor() {
    super("The Meta webhook payload is malformed or unsupported.");
    this.name = "MetaWebhookPayloadError";
  }
}

export function verifyMetaWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return (
    supplied.byteLength === expected.byteLength &&
    timingSafeEqual(supplied, expected)
  );
}

/**
 * Only a payload that is not a WhatsApp delivery at all is rejected. Meta
 * batches unrelated items into one signed POST and retries a rejected POST for
 * days, so one item from another phone number on the same app, or a status
 * this platform does not model, must not take the guest replies beside it down.
 */
export function parseMetaWebhookPayload(
  payload: unknown,
  options: MetaWebhookParseOptions = {},
): MetaWebhookEvent[] {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    throw new MetaWebhookPayloadError();
  }
  if (!Array.isArray(payload.entry)) throw new MetaWebhookPayloadError();

  const skip = (reason: MetaWebhookSkipReason): void =>
    options.onSkipped?.(reason);
  const collect = (
    items: unknown,
    parse: (value: unknown) => MetaWebhookEvent,
    result: MetaWebhookEvent[],
  ): void => {
    if (items === undefined) return;
    if (!Array.isArray(items)) return skip("MALFORMED_ITEM");
    for (const value of items) {
      try {
        result.push(parse(value));
      } catch (error) {
        if (!(error instanceof MetaWebhookItemError)) throw error;
        skip(error.reason);
      }
    }
  };

  const result: MetaWebhookEvent[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) {
      skip("MALFORMED_ITEM");
      continue;
    }
    for (const change of entry.changes) {
      if (
        !isRecord(change) ||
        change.field !== "messages" ||
        !isRecord(change.value)
      ) {
        continue;
      }
      if (options.phoneNumberId) {
        const metadata = change.value.metadata;
        if (
          !isRecord(metadata) ||
          metadata.phone_number_id !== options.phoneNumberId
        ) {
          skip("PHONE_NUMBER_MISMATCH");
          continue;
        }
      }
      collect(change.value.statuses, parseStatus, result);
      collect(change.value.messages, parseResponse, result);
    }
  }
  return result;
}

class MetaWebhookItemError extends Error {
  public constructor(public readonly reason: MetaWebhookSkipReason) {
    super("A Meta webhook item was skipped.");
    this.name = "MetaWebhookItemError";
  }
}

function parseStatus(value: unknown): MetaStatusWebhookEvent {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new MetaWebhookItemError("MALFORMED_ITEM");
  }
  const status = normalizeStatus(value.status);
  const occurredAt = parseTimestamp(value.timestamp);
  const error =
    Array.isArray(value.errors) && isRecord(value.errors[0])
      ? value.errors[0]
      : undefined;
  const failureCode =
    typeof error?.code === "number" || typeof error?.code === "string"
      ? String(error.code)
      : undefined;
  const logicalMessageId = uuidValue(value.biz_opaque_callback_data);
  const identity = [
    "status",
    value.id,
    status,
    occurredAt.toISOString(),
    failureCode ?? "",
  ].join("|");
  return {
    kind: "STATUS",
    providerEventId: `meta:${createHash("sha256").update(identity).digest("hex")}`,
    providerMessageId: value.id,
    ...(logicalMessageId ? { logicalMessageId } : {}),
    status,
    occurredAt,
    ...(failureCode ? { failureCode } : {}),
    ...(status === "FAILED"
      ? { failureReason: safeFailureReason(failureCode) }
      : {}),
  };
}

function parseResponse(value: unknown): MetaResponseWebhookEvent {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new MetaWebhookItemError("MALFORMED_ITEM");
  }
  const contextProviderMessageId =
    isRecord(value.context) && typeof value.context.id === "string"
      ? value.context.id
      : undefined;
  let responseType: MetaResponseWebhookEvent["responseType"] = "UNKNOWN";
  let responseValue: string | undefined;
  if (value.type === "button" && isRecord(value.button)) {
    responseType = "BUTTON";
    responseValue =
      stringValue(value.button.payload) ?? stringValue(value.button.text);
  } else if (value.type === "interactive" && isRecord(value.interactive)) {
    const reply = isRecord(value.interactive.button_reply)
      ? value.interactive.button_reply
      : isRecord(value.interactive.list_reply)
        ? value.interactive.list_reply
        : undefined;
    responseType = "BUTTON";
    responseValue = stringValue(reply?.id) ?? stringValue(reply?.title);
  } else if (value.type === "text" && isRecord(value.text)) {
    responseType = "TEXT";
    responseValue = stringValue(value.text.body);
  }
  return {
    kind: "RESPONSE",
    providerEventId: `meta:message:${value.id}`,
    inboundMessageId: value.id,
    ...(contextProviderMessageId ? { contextProviderMessageId } : {}),
    occurredAt: parseTimestamp(value.timestamp),
    responseType,
    ...(responseValue ? { responseValue: responseValue.slice(0, 500) } : {}),
  };
}

function normalizeStatus(value: unknown): MetaStatusWebhookEvent["status"] {
  if (value === "sent") return "SENT";
  if (value === "delivered") return "DELIVERED";
  if (value === "read") return "READ";
  if (value === "failed") return "FAILED";
  throw new MetaWebhookItemError("UNSUPPORTED_STATUS");
}

function parseTimestamp(value: unknown): Date {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new MetaWebhookItemError("MALFORMED_ITEM");
  }
  const date = new Date(Number(value) * 1_000);
  if (Number.isNaN(date.getTime())) {
    throw new MetaWebhookItemError("MALFORMED_ITEM");
  }
  return date;
}

function safeFailureReason(code: string | undefined): string {
  const known: Record<string, string> = {
    "131026": "The destination cannot receive this WhatsApp message.",
    "131047": "The message was sent outside the allowed conversation window.",
    "131048": "The provider temporarily limited message delivery.",
    "132000": "The approved template parameters do not match.",
    "132001": "The approved message template is unavailable.",
  };
  return (code && known[code]) || "The provider rejected the message.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function uuidValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}
