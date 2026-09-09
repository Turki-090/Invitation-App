import { Readable } from "node:stream";
import { InMemoryObjectStorage } from "@dawah/storage";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createImportProcessor } from "../../../worker/src/import-processor";
import { PrismaImportProcessorRepository } from "../../../worker/src/prisma-import-repository";
import { EventAccessService } from "../../src/events/event-access.service";
import type { ImportsQueueService } from "../../src/imports/imports-queue.service";
import { ImportsService } from "../../src/imports/imports.service";
import { PreparationService } from "../../src/preparation/preparation.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { TestDatabase } from "./database";
import {
  createEventFixture,
  createUserFixture,
  resetFactorySequence,
} from "./factories";

const database = new TestDatabase();
const prisma = database.prisma;
const prismaService = prisma as unknown as PrismaService;
const access = new EventAccessService(prismaService);

describe("Stage 5 PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await database.clean();
    resetFactorySequence();
  });

  afterAll(async () => {
    await database.clean();
    await prisma.$disconnect();
  });

  it("processes a representative mixed import through worker validation and confirms it atomically", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage5-import-owner",
    });
    const outsider = await createUserFixture(prisma, {
      authProviderId: "stage5-import-outsider",
    });
    const event = await createEventFixture(prisma, owner);
    const existingInvitation = await prisma.invitationGroup.create({
      data: {
        eventId: event.id,
        displayName: "Existing guest",
        contactName: "Existing guest",
        phoneE164: "+966502999999",
        phoneCountry: "SA",
        invitationType: "SINGLE",
        createdBy: owner.id,
        members: {
          create: {
            name: "Existing guest",
            position: 1,
            isPrimary: true,
          },
        },
      },
    });
    const storage = new InMemoryObjectStorage();
    const queue = queueRecorder();
    const imports = new ImportsService(
      prismaService,
      access,
      configFixture(),
      storage,
      queue.service,
    );
    const processImport = createImportProcessor({
      storage,
      repository: new PrismaImportProcessorRepository(prisma),
      limits: importLimits(),
      now: () => new Date("2026-09-08T12:00:00.000Z"),
    });
    const principal = { subject: owner.authProviderId };
    const validRowCount = 1_000;
    const csv = representativeCsv(validRowCount);

    const uploaded = await imports.upload(
      principal,
      event.id,
      uploadFile("guests.csv", "text/csv", csv),
    );
    expect(uploaded).toMatchObject({ status: "UPLOADED", version: 1 });
    expect(storage.objectCount).toBe(1);
    const parseJob = queue.jobs.shift();
    expect(parseJob).toMatchObject({
      operation: "PARSE",
      eventId: event.id,
      importJobId: uploaded.id,
      expectedRevision: 1,
    });
    await expect(
      processImport({ name: "parse", data: parseJob! }),
    ).resolves.toEqual({
      operation: "PARSE",
      outcome: "COMPLETED",
      rowCount: validRowCount + 3,
    });

    const parsed = await prisma.importJob.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    expect(parsed).toMatchObject({
      status: "AWAITING_MAPPING",
      revision: 2,
      totalRows: validRowCount + 3,
    });
    expect(
      await prisma.importRow.count({ where: { importJobId: uploaded.id } }),
    ).toBe(validRowCount + 3);

    const mapped = await imports.updateMapping(
      principal,
      event.id,
      uploaded.id,
      {
        mapping: {
          displayName: "Name",
          phoneNumber: "Mobile",
          phoneCountry: "Country",
        },
        expectedVersion: 2,
      },
    );
    expect(mapped).toMatchObject({ status: "VALIDATING", version: 3 });
    const validationJob = queue.jobs.shift();
    await expect(
      processImport({ name: "validate", data: validationJob! }),
    ).resolves.toEqual({
      operation: "VALIDATE",
      outcome: "COMPLETED",
      rowCount: validRowCount + 3,
    });

    const reviewed = await prisma.importJob.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    expect(reviewed).toMatchObject({
      status: "REVIEWING",
      revision: 4,
      totalRows: validRowCount + 3,
      validRows: validRowCount,
      invalidRows: 1,
      duplicateRows: 2,
    });
    const invalidRow = await prisma.importRow.findFirstOrThrow({
      where: { importJobId: uploaded.id, status: "INVALID" },
    });
    const sourceBeforeCorrection = structuredClone(invalidRow.sourceData);
    const duplicateRows = await prisma.importRow.findMany({
      where: { importJobId: uploaded.id, status: "DUPLICATE" },
      orderBy: { sourceRowNumber: "asc" },
    });
    expect(duplicateRows).toHaveLength(2);
    expect(duplicateRows.map((row) => row.validationWarnings)).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ code: "DUPLICATE_EXISTING_INVITATION" })],
        [expect.objectContaining({ code: "DUPLICATE_IN_FILE" })],
      ]),
    );
    expect(
      duplicateRows.some(
        (row) => row.duplicateInvitationGroupId === existingInvitation.id,
      ),
    ).toBe(true);

    const correcting = await imports.updateRow(
      principal,
      event.id,
      uploaded.id,
      invalidRow.id,
      {
        corrections: { phoneNumber: "0501888888" },
        expectedJobVersion: 4,
      },
    );
    expect(correcting).toMatchObject({ status: "VALIDATING", version: 5 });
    const revalidationJob = queue.jobs.shift();
    await expect(
      processImport({ name: "validate", data: revalidationJob! }),
    ).resolves.toMatchObject({
      operation: "VALIDATE",
      outcome: "COMPLETED",
      rowCount: validRowCount + 3,
    });

    const ready = await prisma.importJob.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    expect(ready).toMatchObject({
      status: "READY",
      revision: 6,
      validRows: validRowCount + 1,
      invalidRows: 0,
      duplicateRows: 2,
    });
    const correctedRow = await prisma.importRow.findUniqueOrThrow({
      where: { id: invalidRow.id },
    });
    expect(correctedRow.sourceData).toEqual(sourceBeforeCorrection);
    expect(correctedRow.correctedData).toEqual({
      phoneNumber: "0501888888",
    });
    expect(correctedRow).toMatchObject({
      status: "VALID",
      phoneE164: "+966501888888",
    });

    const confirmed = await imports.confirm(principal, event.id, uploaded.id, {
      duplicatePolicy: "SKIP",
      expectedVersion: 6,
    });
    expect(confirmed).toMatchObject({
      importedRows: validRowCount + 1,
      skippedRows: 2,
      duplicateRowsImported: 0,
    });
    expect(confirmed.invitationGroupIds).toHaveLength(validRowCount + 1);
    expect(
      await prisma.invitationGroup.count({ where: { eventId: event.id } }),
    ).toBe(validRowCount + 2);
    expect(
      await prisma.importRow.count({
        where: { importJobId: uploaded.id, status: "IMPORTED" },
      }),
    ).toBe(validRowCount + 1);
    expect(
      await prisma.importRow.count({
        where: { importJobId: uploaded.id, status: "SKIPPED" },
      }),
    ).toBe(2);

    const idempotent = await imports.confirm(principal, event.id, uploaded.id, {
      duplicatePolicy: "IMPORT",
      expectedVersion: 1,
    });
    expect(idempotent).toEqual(confirmed);
    expect(
      await prisma.invitationGroup.count({ where: { eventId: event.id } }),
    ).toBe(validRowCount + 2);
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "import.confirmed" },
      }),
    ).toBe(1);

    await expect(
      imports.get({ subject: outsider.authProviderId }, event.id, uploaded.id, {
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });

    const cancellable = await imports.upload(
      principal,
      event.id,
      uploadFile(
        "cancel.csv",
        "text/csv",
        Buffer.from("Name,Mobile,Country\nCancelled,0501777777,SA"),
      ),
    );
    expect(storage.objectCount).toBe(2);
    expect(
      (await imports.cancel(principal, event.id, cancellable.id)).status,
    ).toBe("CANCELLED");
    expect(storage.objectCount).toBe(1);
    const cancelledJob = await prisma.importJob.findUniqueOrThrow({
      where: { id: cancellable.id },
      include: { sourceAsset: true },
    });
    expect(cancelledJob).toMatchObject({
      status: "CANCELLED",
      sourceAsset: { status: "DELETED", deletedAt: expect.any(Date) },
    });
  });

  it("approves templates and preserves reproducible snapshots across template and guest edits", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage5-preparation-owner",
    });
    const outsider = await createUserFixture(prisma, {
      authProviderId: "stage5-preparation-outsider",
    });
    const event = await createEventFixture(prisma, owner);
    const invitation = await prisma.invitationGroup.create({
      data: {
        eventId: event.id,
        displayName: "Sarah Al-Qahtani",
        contactName: "Sarah Al-Qahtani",
        phoneE164: "+966501234567",
        phoneCountry: "SA",
        invitationType: "SINGLE",
        createdBy: owner.id,
        members: {
          create: {
            name: "Sarah Al-Qahtani",
            position: 1,
            isPrimary: true,
          },
        },
      },
    });
    const preparation = new PreparationService(prismaService, access);
    const principal = { subject: owner.authProviderId };

    const draft = await preparation.createTemplate(principal, event.id, {
      name: "English invitation",
      locale: "en",
      body: "Dear {{guest_name}}, welcome to {{event_name}} at {{venue}} on {{event_date}}.",
    });
    const approved = await preparation.approveTemplate(
      principal,
      event.id,
      draft.id,
      { expectedVersion: 1 },
    );
    expect(approved).toMatchObject({ status: "APPROVED", version: 1 });

    const readiness = await preparation.readiness(principal, event.id, {
      templateId: approved.id,
      page: 1,
      pageSize: 50,
    });
    expect(readiness.summary).toEqual({
      totalInvitations: 1,
      readyInvitations: 1,
      blockedInvitations: 0,
      snapshottedInvitations: 0,
    });
    expect(readiness.items[0]).toMatchObject({
      invitationId: invitation.id,
      ready: true,
      issues: [],
      latestSnapshotId: null,
    });

    const first = await preparation.createSnapshots(principal, event.id, {
      templateId: approved.id,
      invitationIds: [invitation.id],
    });
    const firstSnapshot =
      await prisma.invitationContentSnapshot.findUniqueOrThrow({
        where: { id: first.snapshotIds[0] },
      });
    const repeated = await preparation.createSnapshots(principal, event.id, {
      templateId: approved.id,
      invitationIds: [invitation.id],
    });
    expect(first).toMatchObject({ createdCount: 1, reusedCount: 0 });
    expect(repeated).toMatchObject({ createdCount: 0, reusedCount: 1 });
    expect(repeated.snapshotIds).toEqual(first.snapshotIds);

    const revised = await preparation.updateTemplate(
      principal,
      event.id,
      approved.id,
      {
        body: "Hello {{guest_name}} — {{event_name}} awaits you.",
        expectedVersion: 1,
      },
    );
    const revisedApproved = await preparation.approveTemplate(
      principal,
      event.id,
      revised.id,
      { expectedVersion: 2 },
    );
    expect(revisedApproved).toMatchObject({
      id: revised.id,
      status: "APPROVED",
      version: 2,
    });
    const revisedResult = await preparation.createSnapshots(
      principal,
      event.id,
      { templateId: revised.id, invitationIds: [invitation.id] },
    );
    expect(revisedResult).toMatchObject({ createdCount: 1, reusedCount: 0 });
    const revisedSnapshot =
      await prisma.invitationContentSnapshot.findUniqueOrThrow({
        where: { id: revisedResult.snapshotIds[0] },
      });
    expect(revisedSnapshot).toMatchObject({ templateVersion: 2 });
    expect(revisedSnapshot.renderedBody).toContain("Hello Sarah Al-Qahtani");

    await prisma.invitationGroup.update({
      where: { id: invitation.id },
      data: { displayName: "Sarah Updated" },
    });
    const changedSource = await preparation.createSnapshots(
      principal,
      event.id,
      { templateId: revised.id, invitationIds: [invitation.id] },
    );
    expect(changedSource).toMatchObject({ createdCount: 1, reusedCount: 0 });
    expect(await prisma.invitationContentSnapshot.count()).toBe(3);
    expect(
      await prisma.invitationContentSnapshot.findUniqueOrThrow({
        where: { id: firstSnapshot.id },
      }),
    ).toEqual(firstSnapshot);
    expect(
      (
        await prisma.invitationContentSnapshot.findUniqueOrThrow({
          where: { id: changedSource.snapshotIds[0] },
        })
      ).renderedBody,
    ).toContain("Sarah Updated");

    await expect(
      preparation.readiness({ subject: outsider.authProviderId }, event.id, {
        templateId: approved.id,
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });
  });
});

function representativeCsv(validRowCount: number): Buffer {
  const validRows = Array.from({ length: validRowCount }, (_, index) => {
    const localPhone = `0501${String(index).padStart(6, "0")}`;
    return `Guest ${index + 1},${localPhone},SA`;
  });
  return Buffer.from(
    [
      "Name,Mobile,Country",
      ...validRows,
      "Needs correction,not-a-phone,SA",
      "Existing guest,0502999999,SA",
      "Duplicate first row,0501000000,SA",
    ].join("\n"),
    "utf8",
  );
}

function importLimits() {
  return {
    maximumFileBytes: 8 * 1024 * 1024,
    maximumRows: 5_000,
    maximumColumns: 64,
    maximumCellCharacters: 1_000,
    maximumWorksheets: 10,
    maximumArchiveEntryBytes: 32 * 1024 * 1024,
    maximumArchiveBytes: 128 * 1024 * 1024,
  };
}

function configFixture() {
  const values: Record<string, unknown> = {
    IMPORT_MAX_FILE_BYTES: 8 * 1024 * 1024,
    IMPORT_MAX_ROWS: 5_000,
    IMPORT_MAX_COLUMNS: 64,
    IMPORT_MAX_CELL_CHARACTERS: 1_000,
    STORAGE_PRIVATE_BUCKET: "dawah-private-test",
  };
  return { get: (key: string) => values[key] } as never;
}

function queueRecorder() {
  const jobs: Array<{
    operation: "PARSE" | "VALIDATE";
    eventId: string;
    importJobId: string;
    expectedRevision: number;
  }> = [];
  return {
    jobs,
    service: {
      enqueue: vi.fn().mockImplementation((job) => {
        jobs.push(job);
        return Promise.resolve();
      }),
    } as unknown as ImportsQueueService,
  };
}

function uploadFile(
  originalname: string,
  mimetype: string,
  buffer: Buffer,
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: buffer.byteLength,
    destination: "",
    filename: "",
    path: "",
    stream: Readable.from(buffer),
    buffer,
  };
}
