import type { ObjectLocation } from "./types";

const encoder = new TextEncoder();
const bucketNamePattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const ipv4AddressPattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const keySegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const metadataKeyPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const reservedBucketPrefixes = ["xn--", "sthree-", "amzn-s3-demo-"];
const reservedBucketSuffixes = [
  "-s3alias",
  "--ol-s3",
  ".mrap",
  "--x-s3",
  "--table-s3",
];

export type StorageValidationErrorCode =
  | "INVALID_STORAGE_BUCKET"
  | "INVALID_STORAGE_KEY"
  | "INVALID_STORAGE_KEY_SEGMENT"
  | "INVALID_STORAGE_FILENAME"
  | "INVALID_STORAGE_BODY"
  | "INVALID_STORAGE_METADATA";

export class StorageValidationError extends Error {
  public constructor(
    public readonly code: StorageValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageValidationError";
  }
}

/** Validates the portable DNS subset shared by AWS S3 and common S3 providers. */
export function validateBucketName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 63 ||
    !bucketNamePattern.test(value) ||
    value.includes("..") ||
    ipv4AddressPattern.test(value) ||
    reservedBucketPrefixes.some((prefix) => value.startsWith(prefix)) ||
    reservedBucketSuffixes.some((suffix) => value.endsWith(suffix))
  ) {
    throw new StorageValidationError(
      "INVALID_STORAGE_BUCKET",
      "Storage bucket names must be 3-63 character, lowercase DNS-compatible names and must not use an S3-reserved form.",
    );
  }

  const labelsArePortable = value
    .split(".")
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );
  if (!labelsArePortable) {
    throw new StorageValidationError(
      "INVALID_STORAGE_BUCKET",
      "Storage bucket labels must start and end with a lowercase letter or digit.",
    );
  }

  return value;
}

/**
 * Restricts object keys to unambiguous, URL-safe path segments. This intentionally
 * excludes traversal segments, empty segments, backslashes, whitespace and
 * control characters even when a specific provider would accept them.
 */
export function validateObjectKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    encoder.encode(value).byteLength > 1_024 ||
    containsControlCharacter(value) ||
    value.includes("\\")
  ) {
    throwInvalidKey();
  }

  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        encoder.encode(segment).byteLength > 255 ||
        !keySegmentPattern.test(segment),
    )
  ) {
    throwInvalidKey();
  }

  return value;
}

export function validateObjectLocation(value: unknown): ObjectLocation {
  if (typeof value !== "object" || value === null) {
    throw new StorageValidationError(
      "INVALID_STORAGE_KEY",
      "A storage location with a valid bucket and key is required.",
    );
  }

  const candidate = value as Partial<ObjectLocation>;
  return {
    bucket: validateBucketName(candidate.bucket),
    key: validateObjectKey(candidate.key),
  };
}

export function validateKeySegment(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    encoder.encode(value).byteLength > 128 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(value)
  ) {
    throw new StorageValidationError(
      "INVALID_STORAGE_KEY_SEGMENT",
      `${label} must be a 1-128 character URL-safe identifier.`,
    );
  }
  return value;
}

export function extensionFromFilename(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    encoder.encode(value).byteLength > 255 ||
    containsControlCharacter(value) ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throwInvalidFilename();
  }

  const lastDot = value.lastIndexOf(".");
  const extension = value.slice(lastDot + 1);
  if (
    lastDot <= 0 ||
    lastDot === value.length - 1 ||
    !/^[A-Za-z0-9]{1,16}$/.test(extension)
  ) {
    throwInvalidFilename();
  }

  return extension.toLowerCase();
}

export function validateObjectBody(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new StorageValidationError(
      "INVALID_STORAGE_BODY",
      "Storage object bodies must be Uint8Array values.",
    );
  }
  return value;
}

export function normalizeMetadata(
  value: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  if (value === undefined) return Object.freeze({});

  const normalized: Record<string, string> = {};
  for (const [key, metadataValue] of Object.entries(value)) {
    if (
      !metadataKeyPattern.test(key) ||
      typeof metadataValue !== "string" ||
      encoder.encode(metadataValue).byteLength > 2_048 ||
      containsControlCharacter(metadataValue)
    ) {
      throw new StorageValidationError(
        "INVALID_STORAGE_METADATA",
        "Storage metadata must use lowercase hyphenated keys and short values without control characters.",
      );
    }
    normalized[key] = metadataValue;
  }
  return Object.freeze(normalized);
}

function throwInvalidKey(): never {
  throw new StorageValidationError(
    "INVALID_STORAGE_KEY",
    "Storage keys must contain only non-empty URL-safe path segments and be at most 1024 bytes.",
  );
}

function throwInvalidFilename(): never {
  throw new StorageValidationError(
    "INVALID_STORAGE_FILENAME",
    "Source filenames must be plain filenames with a 1-16 character alphanumeric extension.",
  );
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069))
    );
  });
}
