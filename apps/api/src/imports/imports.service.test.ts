import { Readable } from "node:stream";
import { NotFoundException } from "@nestjs/common";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImportsQueueService } from "./imports-queue.service";
import { ImportsService } from "./imports.service";

const eventId = "10000000-0000-4000-8000-000000000001";
const importJobId = "20000000-0000-4000-8000-000000000001";
const assetId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";
const rowOneId = "50000000-0000-4000-8000-000000000001";
const rowTwoId = "50000000-0000-4000-8000-000000000002";
const principal: AuthPrincipal = { subject: "stage-5-import-host" };
const now = new Date("2026-09-08T12:00:00.000Z");

describe("ImportsService", () => {
  it("rejects a spoofed spreadsheet before object storage or database writes", async () => {
    const storage = storageMock();
    const queue = queueMock();
    const prisma = prismaMock();
    const service = serviceWith(prisma, accessMock(), storage, queue);

    await expect(
      service.upload(
        principal,
        eventId,
        uploadFile({
          originalname: "guests.xlsx",
          mimetype:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: Buffer.from("displayName,phoneNumber\nSarah,0501234567"),
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: "IMPORT_CONTENT_TYPE_MISMATCH" },
    });

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("stores and audits a validated CSV before enqueueing its parse job", async () => {
    const sourceAsset = persistedAsset();
    let job = persistedJob({ sourceAsset });
    const createAsset = vi.fn().mockResolvedValue(sourceAsset);
    const createJob = vi.fn().mockImplementation(({ data }) => {
      job = persistedJob({ id: data.id, sourceAsset });
      return Promise.resolve(job);
    });
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      storedAsset: { create: createAsset },
      importJob: { create: createJob },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const storage = storageMock();
    const queue = queueMock();
    const service = serviceWith(prisma, accessMock(), storage, queue);
    const csv = Buffer.from(
      "displayName,phoneNumber\nSarah Al-Qahtani,0501234567\n",
      "utf8",
    );

    const result = await service.upload(
      principal,
      eventId,
      uploadFile({
        originalname: "guests.csv",
        mimetype: "text/csv",
        buffer: csv,
      }),
    );

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "stage5-private",
        body: csv,
        contentType: "text/csv",
        metadata: expect.objectContaining({ "event-id": eventId }),
      }),
    );
    expect(createAsset).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId,
        kind: "IMPORT_SOURCE",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "import.uploaded" }),
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      operation: "PARSE",
      eventId,
      importJobId: result.id,
      expectedRevision: 1,
    });
    expect(result).toMatchObject({ status: "UPLOADED", version: 1 });
  });

  it("rejects a mapping to an unknown parsed column without changing job state", async () => {
    const job = persistedJob({
      status: "AWAITING_MAPPING",
      detectedHeaders: ["Name", "Mobile"],
    });
    const prisma = prismaMock({
      importJob: { findFirst: vi.fn().mockResolvedValue(job) },
    });
    const queue = queueMock();
    const service = serviceWith(prisma, accessMock(), storageMock(), queue);

    await expect(
      service.updateMapping(principal, eventId, importJobId, {
        mapping: { displayName: "Name", phoneNumber: "Missing phone" },
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "IMPORT_MAPPING_COLUMN_UNKNOWN",
        details: { columns: ["Missing phone"] },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("merges a row correction, preserves parser findings, audits it, and requeues validation", async () => {
    const current = persistedJob({
      status: "REVIEWING",
      revision: 4,
      columnMapping: { displayName: "Name", phoneNumber: "Mobile" },
    });
    const updated = persistedJob({
      status: "VALIDATING",
      revision: 5,
      columnMapping: current.columnMapping,
    });
    const row = persistedRow({
      status: "INVALID",
      correctedData: { displayName: "Old name" },
      validationErrors: [
        {
          code: "ACTIVE_OR_COMPLEX_CELL_REJECTED",
          column: "Name",
          field: "row",
          message: "Active cells are rejected.",
        },
      ],
    });
    const updateRow = vi.fn().mockResolvedValue({});
    const transaction = {
      importJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
      importRow: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: updateRow,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = prismaMock({
      importJob: { findFirst: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const queue = queueMock();
    const service = serviceWith(prisma, accessMock(), storageMock(), queue);

    const result = await service.updateRow(
      principal,
      eventId,
      importJobId,
      row.id,
      {
        corrections: { displayName: "Correct name", phoneCountry: "SA" },
        expectedJobVersion: 4,
      },
    );

    expect(updateRow).toHaveBeenCalledWith({
      where: { id: row.id },
      data: expect.objectContaining({
        correctedData: {
          displayName: "Correct name",
          phoneCountry: "SA",
        },
        correctedBy: userId,
        status: "UNMAPPED",
        validationWarnings: [],
        duplicateResolution: null,
      }),
    });
    expect(updateRow.mock.calls[0]?.[0].data).not.toHaveProperty(
      "validationErrors",
    );
    expect(queue.enqueue).toHaveBeenCalledWith({
      operation: "VALIDATE",
      eventId,
      importJobId,
      expectedRevision: 5,
    });
    expect(result).toMatchObject({ status: "VALIDATING", version: 5 });
  });

  it("atomically confirms valid rows and explicitly skips reviewed duplicates", async () => {
    const valid = persistedRow();
    const duplicate = persistedRow({
      id: rowTwoId,
      sourceRowNumber: 3,
      status: "DUPLICATE",
      phoneE164: "+966501111112",
      normalizedHash: "b".repeat(64),
      duplicateInvitationGroupId: "60000000-0000-4000-8000-000000000001",
    });
    const job = persistedJob({
      status: "READY",
      totalRows: 2,
      validRows: 1,
      duplicateRows: 1,
      revision: 7,
    });
    const groupCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const memberCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const rowUpdate = vi.fn().mockResolvedValue({});
    const rowUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      importJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue({}),
      },
      importRow: {
        findMany: vi.fn().mockResolvedValue([valid, duplicate]),
        update: rowUpdate,
        updateMany: rowUpdateMany,
      },
      invitationGroup: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: groupCreateMany,
      },
      guestMember: { createMany: memberCreateMany },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = serviceWith(
      prisma,
      accessMock(),
      storageMock(),
      queueMock(),
    );

    const result = await service.confirm(principal, eventId, importJobId, {
      duplicatePolicy: "SKIP",
      expectedVersion: 7,
    });

    expect(groupCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId,
          displayName: valid.displayName,
          phoneE164: valid.phoneE164,
          createdBy: userId,
        }),
      ],
    });
    expect(memberCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: "Sarah Al-Qahtani",
          position: 1,
          isPrimary: true,
        }),
      ],
    });
    expect(rowUpdate).toHaveBeenCalledWith({
      where: { id: valid.id },
      data: expect.objectContaining({ status: "IMPORTED" }),
    });
    expect(rowUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [duplicate.id] } },
      data: expect.objectContaining({
        status: "SKIPPED",
        duplicateResolution: "SKIP",
      }),
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "import.confirmed",
        metadata: expect.objectContaining({
          importedRows: 1,
          skippedRows: 1,
          duplicatePolicy: "SKIP",
        }),
      }),
    });
    expect(result).toMatchObject({
      importJobId,
      importedRows: 1,
      skippedRows: 1,
      duplicateRowsImported: 0,
    });
    expect(result.invitationGroupIds).toHaveLength(1);
  });

  it("makes confirmation idempotent after completion", async () => {
    const completed = persistedJob({
      status: "COMPLETED",
      revision: 8,
      importedRows: 1,
      skippedRows: 0,
      completedAt: now,
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      importJob: { findFirst: vi.fn().mockResolvedValue(completed) },
      importRow: {
        findMany: vi.fn().mockResolvedValue([
          {
            importedInvitationGroupId: "70000000-0000-4000-8000-000000000001",
            duplicateResolution: null,
          },
        ]),
      },
      invitationGroup: { createMany: vi.fn() },
    };
    const prisma = prismaMock({
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const service = serviceWith(
      prisma,
      accessMock(),
      storageMock(),
      queueMock(),
    );

    const firstResult = await service.confirm(principal, eventId, importJobId, {
      duplicatePolicy: "IMPORT",
      expectedVersion: 1,
    });

    expect(firstResult).toMatchObject({ importedRows: 1, skippedRows: 0 });
    expect(transaction.invitationGroup.createMany).not.toHaveBeenCalled();
  });

  it("durably cancels a mutable job, audits it, and removes only its source object", async () => {
    const current = persistedJob({ status: "REVIEWING", revision: 2 });
    const cancelled = persistedJob({
      status: "CANCELLED",
      revision: 3,
      cancelledAt: now,
    });
    const audit = vi.fn().mockResolvedValue({});
    const updateAsset = vi.fn().mockResolvedValue({});
    const transaction = {
      importJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(cancelled),
      },
      storedAsset: { update: updateAsset },
      auditLog: { create: audit },
    };
    const prisma = prismaMock({
      importJob: { findFirst: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    });
    const storage = storageMock();
    const service = serviceWith(prisma, accessMock(), storage, queueMock());

    const result = await service.cancel(principal, eventId, importJobId);

    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "import.cancelled" }),
    });
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: current.sourceAsset.bucket,
      key: current.sourceAsset.objectKey,
    });
    expect(updateAsset).toHaveBeenCalledWith({
      where: { id: current.sourceAssetId },
      data: expect.objectContaining({ status: "DELETED" }),
    });
    expect(result.status).toBe("CANCELLED");
  });

  it("does not query import data when event access is denied", async () => {
    const access = accessMock();
    vi.mocked(access.resolve).mockRejectedValueOnce(
      new NotFoundException({
        code: "EVENT_NOT_FOUND",
        message: "The event does not exist or is not accessible.",
      }),
    );
    const prisma = prismaMock();
    const service = serviceWith(prisma, access, storageMock(), queueMock());

    await expect(
      service.list(principal, eventId, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });
    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.GUEST_IMPORT,
    );
    expect(prisma.importJob.findMany).not.toHaveBeenCalled();
  });
});

function serviceWith(
  prisma: PrismaService,
  access: EventAccessService,
  storage: ReturnType<typeof storageMock>,
  queue: ImportsQueueService,
): ImportsService {
  const values: Record<string, unknown> = {
    IMPORT_MAX_FILE_BYTES: 8 * 1024 * 1024,
    IMPORT_MAX_ROWS: 5_000,
    IMPORT_MAX_COLUMNS: 64,
    IMPORT_MAX_CELL_CHARACTERS: 1_000,
    STORAGE_PRIVATE_BUCKET: "stage5-private",
  };
  return new ImportsService(
    prisma,
    access,
    { get: vi.fn((key: string) => values[key]) } as never,
    storage as never,
    queue,
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

function queueMock(): ImportsQueueService {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as ImportsQueueService;
}

function prismaMock(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    importJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      ...(overrides.importJob as object | undefined),
    },
    storedAsset: {
      update: vi.fn(),
      ...(overrides.storedAsset as object | undefined),
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
    originalname: "guests.csv",
    encoding: "7bit",
    mimetype: "text/csv",
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
    kind: "IMPORT_SOURCE",
    status: "READY",
    storageProvider: "s3-compatible",
    bucket: "stage5-private",
    objectKey: `events/${eventId}/imports/${importJobId}/guests.csv`,
    originalFilename: "guests.csv",
    contentType: "text/csv",
    byteSize: 55,
    sha256: "a".repeat(64),
    imageWidth: null,
    imageHeight: null,
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

function persistedJob(overrides: Record<string, unknown> = {}) {
  const sourceAsset =
    (overrides.sourceAsset as ReturnType<typeof persistedAsset> | undefined) ??
    persistedAsset();
  return {
    id: importJobId,
    eventId,
    sourceAssetId: sourceAsset.id,
    createdBy: userId,
    confirmedBy: null,
    cancelledBy: null,
    fileFormat: "CSV",
    status: "UPLOADED",
    selectedWorksheet: null,
    availableWorksheets: [],
    detectedHeaders: [],
    suggestedMapping: null,
    columnMapping: null,
    csvDelimiter: ",",
    detectedEncoding: "utf-8",
    parserVersion: "stage5-v1",
    revision: 1,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    skippedRows: 0,
    importedRows: 0,
    queuedAt: now,
    parsingStartedAt: null,
    parsedAt: null,
    validatedAt: null,
    reviewingAt: null,
    readyAt: null,
    importStartedAt: null,
    confirmedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    failureCode: null,
    failureMessage: null,
    createdAt: now,
    updatedAt: now,
    sourceAsset,
    ...overrides,
  };
}

function persistedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: rowOneId,
    importJobId,
    eventId,
    sourceRowNumber: 2,
    sourceData: { Name: "Sarah Al-Qahtani", Mobile: "0501111111" },
    correctedData: null,
    displayName: "Sarah Al-Qahtani",
    contactName: "Sarah Al-Qahtani",
    phoneInput: "0501111111",
    phoneCountry: "SA",
    phoneE164: "+966501111111",
    invitationType: "SINGLE",
    maxCompanions: 0,
    members: [{ name: "Sarah Al-Qahtani", isPrimary: true }],
    internalNote: null,
    status: "VALID",
    validationErrors: [],
    validationWarnings: [],
    normalizedHash: "a".repeat(64),
    duplicateResolution: null,
    duplicateOfRowId: null,
    duplicateInvitationGroupId: null,
    importedInvitationGroupId: null,
    correctedBy: null,
    revision: 1,
    validatedAt: now,
    correctedAt: null,
    skippedAt: null,
    importedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
