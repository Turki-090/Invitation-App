import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeLoginPhone } from "@dawah/domain";

/**
 * Supabase Auth "send SMS" hook.
 *
 * Supabase generates the sign-in code, then calls this hook to have it
 * delivered. The request is the only thing standing between the public
 * internet and a code sent to an arbitrary number, so it is authenticated with
 * the Standard Webhooks scheme — an HMAC over `id.timestamp.body` — and the
 * timestamp is checked, because a valid signature alone would let a captured
 * request be replayed indefinitely.
 */

/** Replay window either side of the signed timestamp. */
export const supabaseAuthHookToleranceSeconds = 300;

export interface SupabaseAuthHookSignatureHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

export interface SupabaseAuthHookVerifyOptions {
  readonly now?: Date;
  readonly toleranceSeconds?: number;
}

export interface SupabaseSendSmsHookRequest {
  /** International format, including the leading `+`. */
  readonly phone: string;
  readonly otp: string;
}

export class SupabaseAuthHookPayloadError extends Error {
  public constructor() {
    super("The Supabase auth hook payload is malformed or unsupported.");
    this.name = "SupabaseAuthHookPayloadError";
  }
}

export function verifySupabaseAuthHookSignature(
  rawBody: Uint8Array,
  headers: SupabaseAuthHookSignatureHeaders,
  secret: string,
  options: SupabaseAuthHookVerifyOptions = {},
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const key = decodeSecret(secret);
  if (!key) return false;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  const tolerance =
    options.toleranceSeconds ?? supabaseAuthHookToleranceSeconds;
  if (!isFreshTimestamp(timestamp, nowSeconds, tolerance)) return false;

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  // The header carries a space-separated list so a secret can be rotated
  // without a window where neither key is accepted.
  return signature
    .split(" ")
    .filter((candidate) => candidate.startsWith("v1,"))
    .some((candidate) => matches(candidate.slice("v1,".length), expected));
}

export function parseSupabaseSendSmsHookPayload(
  payload: unknown,
): SupabaseSendSmsHookRequest {
  if (!isRecord(payload)) throw new SupabaseAuthHookPayloadError();
  const user = payload.user;
  const sms = payload.sms;
  if (!isRecord(user) || !isRecord(sms)) {
    throw new SupabaseAuthHookPayloadError();
  }

  const otp = typeof sms.otp === "string" ? sms.otp : "";
  if (!/^\d{4,10}$/.test(otp)) throw new SupabaseAuthHookPayloadError();

  const phone = normalizePhone(user.phone);
  if (!phone) throw new SupabaseAuthHookPayloadError();

  return { otp, phone };
}

/**
 * Supabase stores the identity's phone as bare digits, while every downstream
 * provider expects international format, so the `+` is restored here rather
 * than at each call site.
 */
function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim().replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  try {
    const normalized = normalizeLoginPhone(`+${digits}`);
    return normalized === `+${digits}` ? normalized : null;
  } catch {
    return null;
  }
}

function decodeSecret(secret: string): Buffer | null {
  const encoded = secret
    .trim()
    .replace(/^v1,/, "")
    .replace(/^whsec_/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64");
  return key.byteLength >= 16 && key.toString("base64") === encoded
    ? key
    : null;
}

function isFreshTimestamp(
  value: string,
  nowSeconds: number,
  toleranceSeconds: number,
): boolean {
  if (!/^\d{1,15}$/.test(value.trim())) return false;
  const signedAt = Number(value.trim());
  return Math.abs(nowSeconds - signedAt) <= toleranceSeconds;
}

function matches(candidate: string, expected: Buffer): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(candidate)) return false;
  const supplied = Buffer.from(candidate, "base64");
  return (
    supplied.byteLength === expected.byteLength &&
    timingSafeEqual(supplied, expected)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
