import { describe, expect, it } from "vitest";
import {
  createSignedWhatsappMediaUrl,
  verifyWhatsappMediaSignature,
} from "./media-link";

const now = new Date("2026-09-10T12:00:00.000Z");
const snapshotId = "11111111-1111-4111-8111-111111111111";
const assetSha256 = "a".repeat(64);
const secret = "stage6-test-media-signing-secret-123456789";

describe("signed WhatsApp media links", () => {
  it("creates an expiry-bounded URL that verifies against immutable snapshot data", () => {
    const value = createSignedWhatsappMediaUrl({
      publicApiBaseUrl: "https://api.dawah.sa/api/v1/",
      snapshotId,
      assetSha256,
      secret,
      ttlSeconds: 900,
      now,
    });
    const url = new URL(value);
    const expiresAtSeconds = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature")!;

    expect(url.pathname).toBe(`/api/v1/messaging/media/${snapshotId}`);
    expect(url.searchParams.get("checksum")).toBe(assetSha256);
    expect(expiresAtSeconds).toBe(Math.floor(now.getTime() / 1_000) + 900);
    expect(
      verifyWhatsappMediaSignature({
        snapshotId,
        assetSha256,
        expiresAtSeconds,
        signature,
        secret,
        now,
      }),
    ).toBe(true);
  });

  it("rejects expired, far-future, and tampered capabilities", () => {
    const url = new URL(
      createSignedWhatsappMediaUrl({
        publicApiBaseUrl: "https://api.dawah.sa/api/v1",
        snapshotId,
        assetSha256,
        secret,
        ttlSeconds: 60,
        now,
      }),
    );
    const expiresAtSeconds = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature")!;
    const valid = {
      snapshotId,
      assetSha256,
      expiresAtSeconds,
      signature,
      secret,
    };

    expect(
      verifyWhatsappMediaSignature({
        ...valid,
        now: new Date(now.getTime() + 61_000),
      }),
    ).toBe(false);
    expect(
      verifyWhatsappMediaSignature({
        ...valid,
        snapshotId: "22222222-2222-4222-8222-222222222222",
        now,
      }),
    ).toBe(false);
    expect(
      verifyWhatsappMediaSignature({
        ...valid,
        assetSha256: "b".repeat(64),
        now,
      }),
    ).toBe(false);
    expect(
      verifyWhatsappMediaSignature({
        ...valid,
        expiresAtSeconds: Math.floor(now.getTime() / 1_000) + 60 * 60 + 1,
        now,
      }),
    ).toBe(false);
  });

  it.each([
    "https://api.dawah.sa",
    "https://api.dawah.sa/api/v1?token=leaked",
    "https://user:password@api.dawah.sa/api/v1",
    "https://api.dawah.sa/api/v1#fragment",
  ])("rejects an unsafe or incomplete public API base: %s", (value) => {
    expect(() =>
      createSignedWhatsappMediaUrl({
        publicApiBaseUrl: value,
        snapshotId,
        assetSha256,
        secret,
        ttlSeconds: 900,
        now,
      }),
    ).toThrow(/media base URL/);
  });
});
