import { createHmac, timingSafeEqual } from "node:crypto";

export const WHATSAPP_MEDIA_MAX_TTL_SECONDS = 60 * 60;

interface WhatsappMediaSignatureInput {
  readonly snapshotId: string;
  readonly assetSha256: string;
  readonly secret: string;
}

interface CreateWhatsappMediaUrlInput extends WhatsappMediaSignatureInput {
  readonly publicApiBaseUrl: string;
  readonly ttlSeconds: number;
  readonly now?: Date;
}

interface VerifyWhatsappMediaSignatureInput extends WhatsappMediaSignatureInput {
  readonly expiresAtSeconds: number;
  readonly signature: string;
  readonly now?: Date;
}

export function createSignedWhatsappMediaUrl(
  input: CreateWhatsappMediaUrlInput,
): string {
  assertChecksum(input.assetSha256);
  if (
    !Number.isInteger(input.ttlSeconds) ||
    input.ttlSeconds < 60 ||
    input.ttlSeconds > WHATSAPP_MEDIA_MAX_TTL_SECONDS
  ) {
    throw new Error(
      "WhatsApp media URL TTL must be between 60 and 3600 seconds.",
    );
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const expiresAtSeconds = nowSeconds + input.ttlSeconds;
  const url = mediaApiBaseUrl(input.publicApiBaseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/messaging/media/${encodeURIComponent(input.snapshotId)}`;
  url.searchParams.set("checksum", input.assetSha256);
  url.searchParams.set("expires", String(expiresAtSeconds));
  url.searchParams.set(
    "signature",
    whatsappMediaSignature({ ...input, expiresAtSeconds }),
  );
  return url.toString();
}

export function verifyWhatsappMediaSignature(
  input: VerifyWhatsappMediaSignatureInput,
): boolean {
  if (
    !/^[a-f0-9]{64}$/.test(input.assetSha256) ||
    !/^[a-f0-9]{64}$/.test(input.signature) ||
    !Number.isSafeInteger(input.expiresAtSeconds)
  ) {
    return false;
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (
    input.expiresAtSeconds <= nowSeconds ||
    input.expiresAtSeconds > nowSeconds + WHATSAPP_MEDIA_MAX_TTL_SECONDS
  ) {
    return false;
  }
  const expected = Buffer.from(whatsappMediaSignature(input), "hex");
  const submitted = Buffer.from(input.signature, "hex");
  return (
    expected.byteLength === submitted.byteLength &&
    timingSafeEqual(expected, submitted)
  );
}

function whatsappMediaSignature(
  input: WhatsappMediaSignatureInput & { readonly expiresAtSeconds: number },
): string {
  return createHmac("sha256", input.secret)
    .update(
      `${input.snapshotId}:${input.assetSha256}:${input.expiresAtSeconds}`,
      "utf8",
    )
    .digest("hex");
}

function assertChecksum(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("A lowercase SHA-256 asset checksum is required.");
  }
}

function mediaApiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.replace(/\/+$/, "").endsWith("/api/v1")
  ) {
    throw new Error(
      "The WhatsApp media base URL must end in /api/v1 and cannot contain credentials, a query, or a fragment.",
    );
  }
  return url;
}
