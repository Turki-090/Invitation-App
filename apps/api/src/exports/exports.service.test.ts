import { createHash, createHmac } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { Permission } from "@dawah/domain";
import type { PrivateObjectStorage } from "@dawah/storage";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ExportsQueueService } from "./exports-queue.service";
import { ExportsService } from "./exports.service";

const principal: AuthPrincipal = { subject: "stage9-exports" };
const eventId = "10000000-0000-4000-8000-000000000001";
const exportJobId = "20000000-0000-4000-8000-000000000001";
const assetId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";
const signingSecret = "stage9-export-download-signing-secret-value";
const downloadTtlSeconds = 300;
const body = new TextEncoder().encode("id,name\r\n1,Guest\r\n");
const sha256 = createHash("sha256").update(body).digest("hex");

describe("ExportsService", () => {
  it("queues a request and marks it failed when the queue is unavailable", async () => {
    const prisma = prismaMock();
    const queue = {
      enqueue: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as unknown as ExportsQueueService;

    await expect(
      service(prisma, queue).create(principal, eventId, {
        format: "CSV",
        preset: "FULL_GUEST_LIST",
      }),
    ).rejects.toMatchObject({
      response: { code: "EXPORT_QUEUE_UNAVAILABLE" },
    });
    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: exportJobId, eventId, status: "QUEUED" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("requires the guest-export capability", async () => {
    const prisma = prismaMock();
    const access = accessMock();

    await service(prisma, queueMock(), access).create(principal, eventId, {
      format: "XLSX",
      preset: "CHECK_IN_LIST",
    });

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.GUEST_EXPORT,
    );
  });

  it("lists only the requesting member's own exports", async () => {
    const prisma = prismaMock();

    await service(prisma).list(principal, eventId, { page: 1, pageSize: 20 });

    expect(prisma.exportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId, requestedByUserId: userId },
      }),
    );
  });

  it("reports a completed export as expired once its retention window closed", async () => {
    const prisma = prismaMock({
      job: completedJob({ expiresAt: new Date(Date.now() - 1_000) }),
    });

    const job = await service(prisma).get(principal, eventId, exportJobId);

    expect(job.status).toBe("EXPIRED");
    expect(job.output).toBeNull();
  });

  it("signs a download URL the service accepts back", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const storage = storageMock();
    const exports = service(prisma, queueMock(), accessMock(), storage);

    const job = await exports.get(principal, eventId, exportJobId);
    const url = new URL(job.output!.downloadUrl, "https://api.test");
    const file = await exports.download(principal, eventId, exportJobId, {
      expires: Number(url.searchParams.get("expires")),
      signature: url.searchParams.get("signature")!,
    });

    expect(file).toMatchObject({
      contentType: "text/csv; charset=utf-8",
      filename: "guest-export.csv",
    });
    expect(storage.getObject).toHaveBeenCalled();
  });

  it("rejects a tampered download signature", async () => {
    const prisma = prismaMock({ job: completedJob() });

    await expect(
      service(prisma).download(principal, eventId, exportJobId, {
        expires: Math.floor(Date.now() / 1_000) + 60,
        signature: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });
  });

  it("rejects a signature minted for another event's export", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const expires = Math.floor(Date.now() / 1_000) + 60;
    const foreignSignature = createHmac("sha256", signingSecret)
      .update(
        `${"11111111-0000-4000-8000-000000000001"}:${exportJobId}:${assetId}:${sha256}:${expires}`,
      )
      .digest("hex");

    await expect(
      service(prisma).download(principal, eventId, exportJobId, {
        expires,
        signature: foreignSignature,
      }),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });
  });

  it("refuses to serve bytes that no longer match the recorded checksum", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const storage = storageMock(new TextEncoder().encode("tampered"));
    const exports = service(prisma, queueMock(), accessMock(), storage);
    const job = await exports.get(principal, eventId, exportJobId);
    const url = new URL(job.output!.downloadUrl, "https://api.test");

    await expect(
      exports.download(principal, eventId, exportJobId, {
        expires: Number(url.searchParams.get("expires")),
        signature: url.searchParams.get("signature")!,
      }),
    ).rejects.toMatchObject({
      response: { code: "EXPORT_FILE_UNAVAILABLE" },
    });
  });

  it("rejects a download whose expiry was moved after signing", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const exports = service(prisma);
    const job = await exports.get(principal, eventId, exportJobId);
    const url = new URL(job.output!.downloadUrl, "https://api.test");

    await expect(
      exports.download(principal, eventId, exportJobId, {
        expires: Number(url.searchParams.get("expires")) + 60,
        signature: url.searchParams.get("signature")!,
      }),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });
  });

  it("rejects a signature minted for a different output asset", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const expires = Math.floor(Date.now() / 1_000) + 60;
    const otherAssetSignature = createHmac("sha256", signingSecret)
      .update(
        `${eventId}:${exportJobId}:${"30000000-0000-4000-8000-000000000002"}:${sha256}:${expires}`,
      )
      .digest("hex");

    await expect(
      service(prisma).download(principal, eventId, exportJobId, {
        expires,
        signature: otherAssetSignature,
      }),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });
  });

  it("refuses an export object whose stored size no longer matches the record", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const storage = storageMock();
    vi.mocked(storage.getObject).mockResolvedValue({
      body: body.slice(0, 4),
      contentType: "text/csv; charset=utf-8",
      metadata: { sha256 },
      size: 4,
    });
    const exports = service(prisma, queueMock(), accessMock(), storage);
    const job = await exports.get(principal, eventId, exportJobId);
    const url = new URL(job.output!.downloadUrl, "https://api.test");

    await expect(
      exports.download(principal, eventId, exportJobId, {
        expires: Number(url.searchParams.get("expires")),
        signature: url.searchParams.get("signature")!,
      }),
    ).rejects.toMatchObject({
      response: { code: "EXPORT_FILE_UNAVAILABLE" },
    });
  });

  it("maps a private object-store failure to a temporary unavailability", async () => {
    const prisma = prismaMock({ job: completedJob() });
    const storage = storageMock();
    vi.mocked(storage.getObject).mockRejectedValue(new Error("s3 is down"));
    const exports = service(prisma, queueMock(), accessMock(), storage);
    const job = await exports.get(principal, eventId, exportJobId);
    const url = new URL(job.output!.downloadUrl, "https://api.test");

    await expect(
      exports.download(principal, eventId, exportJobId, {
        expires: Number(url.searchParams.get("expires")),
        signature: url.searchParams.get("signature")!,
      }),
    ).rejects.toMatchObject({
      response: { code: "EXPORT_FILE_UNAVAILABLE" },
    });
  });

  it("hides an export requested by another member", async () => {
    const prisma = prismaMock({ job: null });

    await expect(
      service(prisma).get(principal, eventId, exportJobId),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });
    expect(prisma.exportJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: exportJobId, eventId, requestedByUserId: userId },
      }),
    );
  });
});

function service(
  prisma: PrismaService,
  queue: ExportsQueueService = queueMock(),
  access: EventAccessService = accessMock(),
  storage: PrivateObjectStorage = storageMock(),
): ExportsService {
  return new ExportsService(prisma, access, queue, storage, configMock());
}

function accessMock(): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({ user: { id: userId } }),
    allows: vi.fn().mockReturnValue(true),
  } as unknown as EventAccessService;
}

function queueMock(): ExportsQueueService {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExportsQueueService;
}

function configMock(): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) =>
      key === "EXPORT_DOWNLOAD_SIGNING_SECRET"
        ? signingSecret
        : downloadTtlSeconds,
    ),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function storageMock(
  storedBody: Uint8Array = body,
): PrivateObjectStorage & { getObject: ReturnType<typeof vi.fn> } {
  return {
    getObject: vi.fn().mockResolvedValue({
      body: storedBody,
      contentType: "text/csv; charset=utf-8",
      metadata: { sha256 },
      size: storedBody.byteLength,
    }),
    headObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
  } as unknown as PrivateObjectStorage & {
    getObject: ReturnType<typeof vi.fn>;
  };
}

function prismaMock(overrides: { job?: unknown } = {}): PrismaService & {
  exportJob: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
} {
  const job = "job" in overrides ? overrides.job : queuedJob();
  const client = {
    exportJob: {
      create: vi.fn().mockResolvedValue(queuedJob()),
      findFirst: vi.fn().mockResolvedValue(job),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    ...client,
    $transaction: vi.fn((run: (transaction: unknown) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as PrismaService & {
    exportJob: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
}

function queuedJob() {
  return {
    id: exportJobId,
    eventId,
    requestedByUserId: userId,
    outputAssetId: null,
    outputAsset: null,
    format: "CSV" as const,
    preset: "FULL_GUEST_LIST" as const,
    status: "QUEUED" as const,
    rowCount: null,
    failureCode: null,
    failureMessage: null,
    requestedAt: new Date("2026-09-16T09:00:00.000Z"),
    processingAt: null,
    completedAt: null,
    failedAt: null,
    expiresAt: null,
  };
}

function completedJob(overrides: { expiresAt?: Date } = {}) {
  return {
    ...queuedJob(),
    status: "COMPLETED" as const,
    rowCount: 1,
    completedAt: new Date("2026-09-16T09:05:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1_000),
    outputAssetId: assetId,
    outputAsset: {
      id: assetId,
      eventId,
      bucket: "dawah-private",
      objectKey: `generated-files/${eventId}/exports/${sha256}.csv`,
      originalFilename: "guest-export.csv",
      contentType: "text/csv; charset=utf-8",
      byteSize: body.byteLength,
      sha256,
      isPrivate: true,
      status: "READY" as const,
      deletedAt: null,
    },
    requestedByUserId: userId,
  };
}
