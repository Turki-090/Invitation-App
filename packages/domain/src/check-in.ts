import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ENTRY_PASS_PREFIX = "ep1";
const UUID_BYTES = 16;
const SIGNATURE_BYTES = 32;

export const entryPassTokenPattern =
  /^ep1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export interface CheckInIncrementInput {
  readonly confirmedAttendance: number;
  readonly checkedInAttendance: number;
  readonly attendeeCount: number;
}

export interface CheckInIncrementResult {
  readonly previousAttendance: number;
  readonly checkedInAttendance: number;
  readonly remainingAttendance: number;
  readonly complete: boolean;
}

export class CheckInInvariantError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CheckInInvariantError";
  }
}

/**
 * Applies one event-day arrival as an increment, never as a replacement total.
 * Persistence still enforces the same upper bound to protect concurrent callers.
 */
export function calculateCheckInIncrement(
  input: CheckInIncrementInput,
): CheckInIncrementResult {
  assertNonNegativeInteger(input.confirmedAttendance, "confirmedAttendance");
  assertNonNegativeInteger(input.checkedInAttendance, "checkedInAttendance");
  if (!Number.isSafeInteger(input.attendeeCount) || input.attendeeCount <= 0) {
    throw new CheckInInvariantError(
      "CHECK_IN_INCREMENT_INVALID",
      "The arriving attendee count must be a positive safe integer.",
    );
  }
  if (input.confirmedAttendance === 0) {
    throw new CheckInInvariantError(
      "CHECK_IN_NOT_ELIGIBLE",
      "An invitation without confirmed attendance cannot be checked in.",
    );
  }
  if (input.checkedInAttendance >= input.confirmedAttendance) {
    throw new CheckInInvariantError(
      "ALREADY_CHECKED_IN",
      "Every confirmed attendee for this invitation is already checked in.",
    );
  }

  const checkedInAttendance = input.checkedInAttendance + input.attendeeCount;
  if (checkedInAttendance > input.confirmedAttendance) {
    throw new CheckInInvariantError(
      "CHECK_IN_CAPACITY_EXCEEDED",
      "The check-in would exceed this invitation's confirmed attendance.",
    );
  }

  return {
    previousAttendance: input.checkedInAttendance,
    checkedInAttendance,
    remainingAttendance: input.confirmedAttendance - checkedInAttendance,
    complete: checkedInAttendance === input.confirmedAttendance,
  };
}

/**
 * Reconstructs a high-entropy, signed token from an otherwise meaningless pass
 * UUID. Only a SHA-256 digest of this complete token needs to be persisted.
 */
export function createEntryPassToken(passId: string, secret: string): string {
  const canonicalPassId = canonicalUuid(passId);
  assertSigningSecret(secret);
  const encodedId = Buffer.from(
    canonicalPassId.replaceAll("-", ""),
    "hex",
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${ENTRY_PASS_PREFIX}:${canonicalPassId}`, "utf8")
    .digest("base64url");
  return `${ENTRY_PASS_PREFIX}.${encodedId}.${signature}`;
}

/** Returns the embedded random pass UUID only after authenticating the token. */
export function verifyEntryPassToken(
  token: string,
  secret: string,
): string | null {
  if (!entryPassTokenPattern.test(token)) return null;
  assertSigningSecret(secret);
  const [, encodedId, submittedSignature] = token.split(".");
  if (!encodedId || !submittedSignature) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(encodedId, "base64url");
  } catch {
    return null;
  }
  if (bytes.byteLength !== UUID_BYTES) return null;
  const hex = bytes.toString("hex");
  const passId = canonicalUuidFromHex(hex);
  const expectedSignature = createHmac("sha256", secret)
    .update(`${ENTRY_PASS_PREFIX}:${passId}`, "utf8")
    .digest();

  let supplied: Buffer;
  try {
    supplied = Buffer.from(submittedSignature, "base64url");
  } catch {
    return null;
  }
  return supplied.byteLength === SIGNATURE_BYTES &&
    timingSafeEqual(expectedSignature, supplied)
    ? passId
    : null;
}

export function hashEntryPassToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashCheckInIdempotencyKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export interface CheckInRequestFingerprintInput {
  readonly eventId: string;
  readonly invitationGroupId: string;
  readonly attendeeCount: number;
  readonly source: "QR" | "MANUAL";
  readonly deviceId?: string | null;
}

/** Stable fingerprint used to reject an idempotency key reused for new input. */
export function checkInRequestFingerprint(
  input: CheckInRequestFingerprintInput,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        attendeeCount: input.attendeeCount,
        deviceId: input.deviceId ?? null,
        eventId: input.eventId.toLowerCase(),
        invitationGroupId: input.invitationGroupId.toLowerCase(),
        source: input.source,
      }),
      "utf8",
    )
    .digest("hex");
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CheckInInvariantError(
      "CHECK_IN_COUNT_INVALID",
      `${field} must be a non-negative safe integer.`,
    );
  }
}

function assertSigningSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new RangeError(
      "The entry-pass signing secret must be at least 32 bytes.",
    );
  }
}

function canonicalUuid(value: string): string {
  const canonical = value.toLowerCase();
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      canonical,
    )
  ) {
    throw new RangeError("A canonical UUID entry-pass ID is required.");
  }
  return canonical;
}

function canonicalUuidFromHex(hex: string): string {
  return canonicalUuid(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
}
