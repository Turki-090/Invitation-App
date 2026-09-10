import { createHash } from "node:crypto";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { createSignedWhatsappMediaUrl } from "@dawah/messaging";
import type { PrivateObjectStorage } from "@dawah/storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { MessagingMediaService } from "./messaging-media.service";

const snapshotId = "11111111-1111-4111-8111-111111111111";
const secret = "stage6-test-media-signing-secret-123456789";
const body = Buffer.from("sanitized invitation image");
const checksum = createHash("sha256").update(body).digest("hex");

describe("MessagingMediaService", () => {
  const findUnique = vi.fn();
  const getObject = vi.fn();
  const config = {
    get: vi.fn((key: keyof ApiEnvironment) => {
      if (key === "META_WHATSAPP_MEDIA_SIGNING_SECRET") return secret;
      if (key === "ASSET_MAX_FILE_BYTES") return 8 * 1024 * 1024;
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService<ApiEnvironment, true>;
  const storage = {
    deleteObject: vi.fn(),
    getObject,
    headObject: vi.fn(),
    putObject: vi.fn(),
  } as unknown as PrivateObjectStorage;
  const service = new MessagingMediaService(
    {
      invitationContentSnapshot: { findUnique },
    } as unknown as PrismaService,
    storage,
    config,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      id: snapshotId,
      assetId: "22222222-2222-4222-8222-222222222222",
      assetSha256: checksum,
      asset: {
        status: "READY",
        deletedAt: null,
        sha256: checksum,
        bucket: "private-test",
        objectKey: "events/one/invitations/image.png",
        contentType: "image/png",
        byteSize: body.byteLength,
      },
    });
    getObject.mockResolvedValue({
      bucket: "private-test",
      key: "events/one/invitations/image.png",
      body,
      size: body.byteLength,
      contentType: "image/png",
      metadata: {},
    });
  });

  it("serves only a valid short-lived capability backed by matching private bytes", async () => {
    const url = signedUrl();

    await expect(
      service.content(
        snapshotId,
        url.searchParams.get("checksum"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
      ),
    ).resolves.toEqual({ body, mediaType: "image/png" });
    expect(getObject).toHaveBeenCalledWith({
      bucket: "private-test",
      key: "events/one/invitations/image.png",
    });
  });

  it("hides tampered capabilities without reading private storage", async () => {
    const url = signedUrl();

    await expect(
      service.content(
        snapshotId,
        url.searchParams.get("checksum"),
        url.searchParams.get("expires"),
        "0".repeat(64),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getObject).not.toHaveBeenCalled();
  });

  it("refuses storage content that no longer matches the immutable checksum", async () => {
    const url = signedUrl();
    getObject.mockResolvedValue({
      bucket: "private-test",
      key: "events/one/invitations/image.png",
      body: Buffer.from("tampered invitation image"),
      size: 25,
      contentType: "image/png",
      metadata: {},
    });

    await expect(
      service.content(
        snapshotId,
        url.searchParams.get("checksum"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("maps private object-store failures to safe temporary unavailability", async () => {
    const url = signedUrl();
    getObject.mockRejectedValue(
      new Error("private endpoint credentials leaked"),
    );

    await expect(
      service.content(
        snapshotId,
        url.searchParams.get("checksum"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "MESSAGE_MEDIA_UNAVAILABLE",
        message: "The invitation image is temporarily unavailable.",
      },
    });
  });
});

function signedUrl(): URL {
  return new URL(
    createSignedWhatsappMediaUrl({
      publicApiBaseUrl: "https://api.dawah.sa/api/v1",
      snapshotId,
      assetSha256: checksum,
      secret,
      ttlSeconds: 900,
    }),
  );
}
