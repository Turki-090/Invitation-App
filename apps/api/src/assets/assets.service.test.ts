import { Readable } from "node:stream";
import { NotFoundException } from "@nestjs/common";
import { Permission } from "@dawah/domain";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AssetsService } from "./assets.service";

const eventId = "10000000-0000-4000-8000-000000000001";
const assetId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const principal: AuthPrincipal = { subject: "stage-5-assets-host" };
const now = new Date("2026-09-08T12:00:00.000Z");

describe("AssetsService", () => {
  it("rejects an image whose extension, declared MIME, and magic bytes disagree", async () => {
    const storage = storageMock();
    const prisma = prismaMock();
    const service = serviceWith(prisma, accessMock(), storage);

    await expect(
      service.upload(
        principal,
        eventId,
        { kind: "EVENT_IMAGE" },
        uploadFile({
          originalname: "invitation.png",
          mimetype: "image/png",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: "ASSET_TYPE_MISMATCH" },
    });

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a valid image when decoded dimensions exceed the pixel budget", async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 120, g: 50, b: 20, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const storage = storageMock();
    const prisma = prismaMock();
    const service = serviceWith(prisma, accessMock(), storage, {
      ASSET_MAX_IMAGE_PIXELS: 3,
    });

    await expect(
      service.upload(
        principal,
        eventId,
        { kind: "INVITATION_ASSET" },
        uploadFile({
          originalname: "invite.png",
          mimetype: "image/png",
          buffer: png,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: "ASSET_IMAGE_INVALID" } });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("sanitizes a valid image before storing it and persists verified metadata", async () => {
    const png = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 30, g: 90, b: 160, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const storage = storageMock();
    const createdAsset = persistedAsset({
      kind: "INVITATION_ASSET",
      originalFilename: "invite.png",
      contentType: "image/png",
      byteSize: 96,
      imageWidth: 3,
      imageHeight: 2,
      sha256: "a".repeat(64),
    });
    const create = vi.fn().mockResolvedValue(createdAsset);
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      storedAsset: { create },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = serviceWith(prisma, accessMock(), storage);

    const result = await service.upload(
      principal,
      eventId,
      { kind: "INVITATION_ASSET" },
      uploadFile({
        originalname: "invite.png",
        mimetype: "image/png",
        buffer: png,
      }),
    );

    expect(storage.putObject).toHaveBeenCalledOnce();
    const stored = storage.putObject.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      bucket: "stage5-private",
      contentType: "image/png",
      metadata: { "event-id": eventId },
    });
    expect(stored?.body).not.toBe(png);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId,
        kind: "INVITATION_ASSET",
        status: "READY",
        imageWidth: 3,
        imageHeight: 2,
        metadata: expect.objectContaining({ sanitized: true }),
      }),
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "asset.uploaded" }),
    });
    expect(result).toMatchObject({
      eventId,
      kind: "INVITATION_ASSET",
      width: 3,
      height: 2,
    });
  });

  it("checks event access before looking up an asset, preventing tenant probes", async () => {
    const prisma = prismaMock();
    const access = accessMock();
    vi.mocked(access.resolve).mockRejectedValueOnce(
      new NotFoundException({
        code: "EVENT_NOT_FOUND",
        message: "The event does not exist or is not accessible.",
      }),
    );
    const service = serviceWith(prisma, access, storageMock());

    await expect(
      service.archive(principal, eventId, assetId),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.EVENT_VIEW,
    );
    expect(prisma.storedAsset.findFirst).not.toHaveBeenCalled();
  });

  it("does not delete object bytes when the database archive transaction fails", async () => {
    const asset = persistedAsset();
    const databaseFailure = new Error("database unavailable");
    const prisma = prismaMock({
      storedAsset: { findFirst: vi.fn().mockResolvedValue(asset) },
      invitationTemplate: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockRejectedValue(databaseFailure),
    });
    const storage = storageMock();
    const service = serviceWith(prisma, accessMock(), storage);

    await expect(service.archive(principal, eventId, assetId)).rejects.toBe(
      databaseFailure,
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

function serviceWith(
  prisma: PrismaService,
  access: EventAccessService,
  storage: ReturnType<typeof storageMock>,
  overrides: Record<string, unknown> = {},
): AssetsService {
  const values: Record<string, unknown> = {
    ASSET_MAX_FILE_BYTES: 8 * 1024 * 1024,
    ASSET_MAX_IMAGE_PIXELS: 24_000_000,
    STORAGE_PRIVATE_BUCKET: "stage5-private",
    ...overrides,
  };
  return new AssetsService(
    prisma,
    access,
    { get: vi.fn((key: string) => values[key]) } as never,
    storage as never,
  );
}

function accessMock(): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({
      event: { status: "DRAFT" },
      membership: { role: "OWNER", permissionsJson: [] },
      user: { id: userId },
    }),
  } as unknown as EventAccessService;
}

function storageMock() {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

function prismaMock(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    storedAsset: {
      findFirst: vi.fn(),
      ...(overrides.storedAsset as object | undefined),
    },
    invitationTemplate: {
      count: vi.fn(),
      ...(overrides.invitationTemplate as object | undefined),
    },
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as PrismaService;
}

function uploadFile(
  overrides: Partial<Express.Multer.File>,
): Express.Multer.File {
  const buffer = overrides.buffer ?? Buffer.alloc(0);
  return {
    fieldname: "file",
    originalname: "image.png",
    encoding: "7bit",
    mimetype: "image/png",
    size: buffer.byteLength,
    destination: "",
    filename: "",
    path: "",
    stream: Readable.from(buffer),
    buffer,
    ...overrides,
  };
}

function persistedAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId,
    eventId,
    createdBy: userId,
    kind: "EVENT_IMAGE",
    status: "READY",
    storageProvider: "s3-compatible",
    bucket: "stage5-private",
    objectKey: `events/${eventId}/images/${assetId}.png`,
    originalFilename: "event.png",
    contentType: "image/png",
    byteSize: 96,
    sha256: "a".repeat(64),
    imageWidth: 3,
    imageHeight: 2,
    isPrivate: true,
    metadata: {},
    expiresAt: null,
    uploadedAt: now,
    validatedAt: now,
    quarantinedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
