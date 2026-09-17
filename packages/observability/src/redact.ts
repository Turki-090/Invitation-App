/**
 * Log redaction.
 *
 * The security model prohibits PII, access tokens, OTPs, and raw invitation
 * capabilities from logs, and the PDPL position is that analytics and
 * diagnostics use internal identifiers and product events instead of guest
 * names or phone numbers. Redaction is therefore applied centrally, on the way
 * into the log line, rather than trusted to every call site.
 *
 * Two independent passes run over every logged structure:
 *
 * 1. Key-based: a field whose name identifies it as a secret or as personal
 *    data is replaced wholesale, whatever its value looks like.
 * 2. Value-based: every surviving string is scrubbed for phone numbers, email
 *    addresses, bearer credentials, signed-URL parameters, and long opaque
 *    tokens, because personal data also arrives inside free-text messages and
 *    error strings whose keys look innocent.
 */

export const redactedPlaceholder = "[redacted]";

/** Keys replaced because the value is a credential. Matched as substrings. */
const secretKeyFragments = [
  "apikey",
  "authorization",
  "bearer",
  "capability",
  "cookie",
  "credential",
  "dsn",
  "jwt",
  "otp",
  "passphrase",
  "password",
  "privatekey",
  "secret",
  "signature",
  "token",
] as const;

/**
 * Keys replaced because the value is personal data. Matched exactly after
 * normalization: a substring rule on `name` would also redact `queueName`,
 * `templateName`, and `eventName`, which are the operational fields an
 * incident responder needs.
 */
const personalKeys = new Set([
  "address",
  "city",
  "contactname",
  "displayname",
  "email",
  "firstname",
  "fullname",
  "guestname",
  "lastname",
  "latitude",
  "longitude",
  "membername",
  "name",
  "namear",
  "nameen",
  "note",
  "notes",
  "recipient",
  "recipientname",
  "to",
  "venue",
  "venuename",
  "venuenamear",
  "venuenameen",
]);

/** Keys replaced because the value is personal data. Matched as substrings. */
const personalKeyFragments = ["guestphone", "msisdn", "phone", "waid"] as const;

/** Query/search parameters whose values are stripped from logged URLs. */
const sensitiveParameterFragments = [
  "capability",
  "code",
  "expires",
  "key",
  "secret",
  "sig",
  "signature",
  "token",
] as const;

const emailPattern = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g;
/** International form. Saudi local mobile form is handled separately. */
const internationalPhonePattern = /\+\d[\d\s-]{6,18}\d/g;
const saudiLocalPhonePattern = /\b0?5\d{8}\b/g;
const bearerPattern = /\b(bearer|basic)\s+[\w\-._~+/]+=*/gi;
/**
 * Opaque high-entropy material: SHA-256 digests, invitation capabilities,
 * signed download keys, and JWTs. The 40-character floor keeps UUID entity
 * identifiers readable, which is what makes a redacted log still diagnosable.
 */
const opaqueTokenPattern = /\b[A-Za-z0-9_-]{40,}\b/g;
const jwtPattern = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

export interface RedactionLimits {
  /** Object/array nesting levels kept before the branch is summarized. */
  readonly maximumDepth: number;
  /** Array entries kept before the remainder is summarized. */
  readonly maximumArrayLength: number;
  /** Object keys kept before the remainder is summarized. */
  readonly maximumKeys: number;
  /** Characters kept per string value. */
  readonly maximumStringLength: number;
}

export const defaultRedactionLimits: RedactionLimits = {
  maximumDepth: 6,
  maximumArrayLength: 32,
  maximumKeys: 64,
  maximumStringLength: 2_048,
};

/**
 * Scrubs a single string. Exported because message text and error messages are
 * logged as bare strings, not only as object fields.
 */
export function redactText(value: string): string {
  return value
    .replace(
      bearerPattern,
      (_match, scheme: string) => `${scheme} ${redactedPlaceholder}`,
    )
    .replace(jwtPattern, redactedPlaceholder)
    .replace(emailPattern, redactedPlaceholder)
    .replace(internationalPhonePattern, redactedPlaceholder)
    .replace(saudiLocalPhonePattern, redactedPlaceholder)
    .replace(opaqueTokenPattern, redactedPlaceholder);
}

/**
 * Rewrites a URL so the path and non-sensitive parameters stay readable while
 * signature, capability, and expiry parameters are removed. Signed private
 * asset and export URLs are otherwise a credential in plain text.
 */
export function redactUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return redactText(value);
  }

  if (url.username !== "" || url.password !== "") {
    url.username = "";
    url.password = "";
  }
  for (const parameter of Array.from(url.searchParams.keys())) {
    if (isSensitiveParameter(parameter)) {
      url.searchParams.set(parameter, redactedPlaceholder);
    } else {
      url.searchParams.set(
        parameter,
        redactText(url.searchParams.get(parameter) ?? ""),
      );
    }
  }
  if (url.hash !== "") url.hash = "";
  return redactText(url.toString());
}

/**
 * Deep-redacts an arbitrary value into something safe and bounded to serialize.
 * Cycles are replaced with `[circular]` so a logged Nest/Prisma object can
 * never stall or blow up the process.
 */
export function redact(
  value: unknown,
  limits: RedactionLimits = defaultRedactionLimits,
): unknown {
  return redactNode(value, limits, 0, new WeakSet<object>());
}

function redactNode(
  value: unknown,
  limits: RedactionLimits,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
      return truncate(redactText(value), limits.maximumStringLength);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "function":
      return "[function]";
    case "symbol":
      return "[symbol]";
    default:
      break;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return redactError(value, limits, depth, seen);
  if (value instanceof URL) return redactUrl(value.toString());
  if (value instanceof RegExp) return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `[buffer ${value.byteLength} bytes]`;
  }

  const object = value as object;
  if (seen.has(object)) return "[circular]";
  if (depth >= limits.maximumDepth) return "[truncated]";
  seen.add(object);

  try {
    if (Array.isArray(value)) {
      const kept = value
        .slice(0, limits.maximumArrayLength)
        .map((entry) => redactNode(entry, limits, depth + 1, seen));
      const dropped = value.length - kept.length;
      return dropped > 0 ? [...kept, `[+${dropped} more]`] : kept;
    }

    if (value instanceof Map) {
      return redactNode(Object.fromEntries(value), limits, depth, seen);
    }
    if (value instanceof Set) {
      return redactNode([...value], limits, depth, seen);
    }

    return redactObject(value as Record<string, unknown>, limits, depth, seen);
  } finally {
    seen.delete(object);
  }
}

function redactObject(
  value: Record<string, unknown>,
  limits: RedactionLimits,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [key, entry] of entries.slice(0, limits.maximumKeys)) {
    if (isRedactedKey(key)) {
      result[key] = redactedPlaceholder;
      continue;
    }
    if (typeof entry === "string" && isUrlKey(key)) {
      result[key] = truncate(redactUrl(entry), limits.maximumStringLength);
      continue;
    }
    result[key] = redactNode(entry, limits, depth + 1, seen);
  }
  const dropped = entries.length - Math.min(entries.length, limits.maximumKeys);
  if (dropped > 0) result["…"] = `[+${dropped} more]`;
  return result;
}

function redactError(
  value: Error,
  limits: RedactionLimits,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: value.name,
    message: truncate(redactText(value.message), limits.maximumStringLength),
  };
  if (value.stack !== undefined) {
    result.stack = truncate(
      redactText(value.stack),
      limits.maximumStringLength,
    );
  }
  if (value.cause !== undefined && depth < limits.maximumDepth) {
    result.cause = redactNode(value.cause, limits, depth + 1, seen);
  }
  return result;
}

export function isRedactedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (personalKeys.has(normalized)) return true;
  return (
    secretKeyFragments.some((fragment) => normalized.includes(fragment)) ||
    personalKeyFragments.some((fragment) => normalized.includes(fragment))
  );
}

function isUrlKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized.endsWith("url") ||
    normalized.endsWith("uri") ||
    normalized.endsWith("href")
  );
}

function isSensitiveParameter(parameter: string): boolean {
  const normalized = normalizeKey(parameter);
  return sensitiveParameterFragments.some((fragment) =>
    normalized.includes(fragment),
  );
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength)}…[+${value.length - maximumLength} chars]`;
}
