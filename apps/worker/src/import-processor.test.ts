import { createHash } from "node:crypto";
import { defaultImportParserLimits } from "@dawah/imports";
import { InMemoryObjectStorage } from "@dawah/storage";
import { describe, expect, it, vi } from "vitest";
import {
  createImportProcessor,
  type ExistingInvitationRecord,
  type ImportJobIdentity,
  type ImportJobRecord,
  type ImportProcessorRepository,
  type ImportQueueJobData,
  type ImportRowRecord,
  type ParsedRowsPersistence,
  type ValidationPersistence,
} from "./import-processor";

const eventId = "10000000-0000-4000-8000-000000000001";
const importJobId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-08T08:00:00.000Z");

describe("import worker processor", () => {
  it("reads and parses a private CSV into immutable source rows", async () => {
    const bytes = new TextEncoder().encode(
      "Guest,Phone,Country\nSarah,0512345678,SA\nAhmed,0507654321,SA\n",
    );
    const storage = new InMemoryObjectStorage();
    await storage.putObject({
      bucket: "dawah-private",
      key: `events/${eventId}/imports/source.csv`,
      body: bytes,
      contentType: "text/csv",
    });
    const repository = new FakeRepository(
      importJob({
        sourceAsset: sourceAsset(bytes, "text/csv", "guests.csv"),
      }),
    );
    const processor = createImportProcessor({
      limits: defaultImportParserLimits,
      now: () => now,
      repository,
      storage,
    });

    const result = await processor(queueJob("parse", "PARSE", 1));

    expect(result).toEqual({
      operation: "PARSE",
      outcome: "COMPLETED",
      rowCount: 2,
    });
    expect(repository.parsed).toMatchObject({
      suggestedMapping: {
        displayName: "Guest",
        phoneNumber: "Phone",
        phoneCountry: "Country",
      },
      csvDelimiter: ",",
      detectedEncoding: "UTF-8",
      headers: ["Guest", "Phone", "Country"],
      rows: [
        {
          errors: [],
          sourceData: { Guest: "Sarah", Phone: "0512345678", Country: "SA" },
          sourceRowNumber: 2,
        },
        {
          errors: [],
          sourceData: { Guest: "Ahmed", Phone: "0507654321", Country: "SA" },
          sourceRowNumber: 3,
        },
      ],
    });
    expect(repository.job?.status).toBe("AWAITING_MAPPING");
    expect(repository.job?.revision).toBe(2);
  });

  it("records deterministic parser failures without retrying them", async () => {
    const bytes = new TextEncoder().encode('Guest,Phone\n"unterminated,123');
    const storage = new InMemoryObjectStorage();
    await storage.putObject({
      bucket: "dawah-private",
      key: `events/${eventId}/imports/source.csv`,
      body: bytes,
      contentType: "text/csv",
    });
    const repository = new FakeRepository(
      importJob({
        sourceAsset: sourceAsset(bytes, "text/csv", "guests.csv"),
      }),
    );
    const processor = createImportProcessor({
      limits: defaultImportParserLimits,
      now: () => now,
      repository,
      storage,
    });

    await expect(processor(queueJob("parse", "PARSE", 1))).resolves.toEqual({
      operation: "PARSE",
      outcome: "FAILED",
    });
    expect(repository.failure).toMatchObject({ code: "CSV_MALFORMED" });
    expect(repository.job?.status).toBe("FAILED");
  });

  it("rejects an oversized stored object from metadata before downloading it", async () => {
    const bytes = new TextEncoder().encode("name\nvalue");
    const storage = new InMemoryObjectStorage();
    await storage.putObject({
      bucket: "dawah-private",
      key: `events/${eventId}/imports/source.csv`,
      body: bytes,
      contentType: "text/csv",
    });
    const getObject = vi.spyOn(storage, "getObject");
    const repository = new FakeRepository(
      importJob({ sourceAsset: sourceAsset(bytes, "text/csv", "guests.csv") }),
    );
    const processor = createImportProcessor({
      limits: {
        ...defaultImportParserLimits,
        maximumFileBytes: bytes.byteLength - 1,
      },
      repository,
      storage,
    });

    await expect(processor(queueJob("parse", "PARSE", 1))).resolves.toEqual({
      operation: "PARSE",
      outcome: "FAILED",
    });
    expect(repository.failure).toMatchObject({
      code: "IMPORT_SOURCE_SIZE_MISMATCH",
    });
    expect(getObject).not.toHaveBeenCalled();
  });

  it("validates corrections and identifies file and event duplicates", async () => {
    const originalCorrectedSource = {
      Guest: { formula: "1+1" },
      Phone: "bad",
      Country: "SA",
    };
    const repository = new FakeRepository(
      importJob({
        status: "VALIDATING",
        revision: 7,
        detectedHeaders: ["Guest", "Phone", "Country"],
        columnMapping: {
          displayName: "Guest",
          phoneNumber: "Phone",
        },
      }),
      [
        {
          ...row("30000000-0000-4000-8000-000000000001", 2, {
            Guest: "Sarah",
            Phone: "0512345678",
            Country: "SA",
          }),
          validationErrors: [
            {
              code: "ACTIVE_OR_COMPLEX_CELL_REJECTED",
              column: "Unmapped notes",
              field: "row",
              message: "Active cells are rejected.",
            },
          ],
        },
        row("30000000-0000-4000-8000-000000000002", 3, {
          Guest: "Sarah duplicate",
          Phone: "051 234 5678",
          Country: "SA",
        }),
        row("30000000-0000-4000-8000-000000000003", 4, {
          Guest: "Existing UAE guest",
          Phone: "+971 50 123 4567",
          Country: "AE",
        }),
        row("30000000-0000-4000-8000-000000000004", 5, {
          Guest: "Broken",
          Phone: "123",
          Country: "SA",
        }),
        {
          ...row(
            "30000000-0000-4000-8000-000000000005",
            6,
            originalCorrectedSource,
          ),
          correctedData: {
            displayName: "Corrected guest",
            phoneNumber: "0507654321",
            phoneCountry: "AE",
          },
          validationErrors: [
            {
              code: "ACTIVE_OR_COMPLEX_CELL_REJECTED",
              column: "Guest",
              field: "row",
              message: "Active cells are rejected.",
            },
          ],
        },
      ],
    );
    repository.existingInvitations = [
      {
        id: "40000000-0000-4000-8000-000000000001",
        phoneE164: "+971501234567",
      },
    ];
    const processor = createImportProcessor({
      limits: defaultImportParserLimits,
      now: () => now,
      repository,
      storage: new InMemoryObjectStorage(),
    });

    const result = await processor(queueJob("validate", "VALIDATE", 7));

    expect(result).toEqual({
      operation: "VALIDATE",
      outcome: "COMPLETED",
      rowCount: 5,
    });
    expect(repository.validation).toMatchObject({
      duplicateRows: 2,
      invalidRows: 1,
      status: "REVIEWING",
      validRows: 2,
    });
    expect(
      repository.validation?.rows.map((candidate) => candidate.status),
    ).toEqual(["VALID", "DUPLICATE", "DUPLICATE", "INVALID", "VALID"]);
    expect(repository.validation?.rows[1]).toMatchObject({
      duplicateOfRowId: "30000000-0000-4000-8000-000000000001",
      warnings: [{ code: "DUPLICATE_IN_FILE", duplicateRowNumbers: [2] }],
    });
    expect(repository.validation?.rows[2]).toMatchObject({
      duplicateInvitationGroupId: "40000000-0000-4000-8000-000000000001",
      warnings: [{ code: "DUPLICATE_EXISTING_INVITATION" }],
    });
    expect(repository.validation?.rows[3]?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PHONE_INVALID" }),
      ]),
    );
    expect(repository.validation?.rows[4]).toMatchObject({
      normalized: {
        displayName: "Corrected guest",
        phoneCountry: "AE",
        phoneE164: "+971507654321",
      },
      status: "VALID",
    });
    expect(originalCorrectedSource).toEqual({
      Guest: { formula: "1+1" },
      Phone: "bad",
      Country: "SA",
    });
  });

  it("skips stale queue deliveries before touching storage", async () => {
    const repository = new FakeRepository(importJob({ revision: 2 }));
    const processor = createImportProcessor({
      limits: defaultImportParserLimits,
      repository,
      storage: new InMemoryObjectStorage(),
    });

    await expect(processor(queueJob("parse", "PARSE", 1))).resolves.toEqual({
      operation: "PARSE",
      outcome: "SKIPPED",
      reason: "STALE_REVISION",
    });
    expect(repository.parsed).toBeNull();
  });
});

class FakeRepository implements ImportProcessorRepository {
  public existingInvitations: ExistingInvitationRecord[] = [];
  public failure: { code: string; message: string } | null = null;
  public parsed: ParsedRowsPersistence | null = null;
  public validation: ValidationPersistence | null = null;

  public constructor(
    public job: ImportJobRecord | null,
    public rows: ImportRowRecord[] = [],
  ) {}

  public async findJob(): Promise<ImportJobRecord | null> {
    return this.job;
  }

  public async markParsing(identity: ImportJobIdentity): Promise<boolean> {
    if (!this.matches(identity) || this.job?.status !== "UPLOADED")
      return false;
    this.job.status = "PARSING";
    return true;
  }

  public async completeParse(
    identity: ImportJobIdentity,
    parsed: ParsedRowsPersistence,
  ): Promise<boolean> {
    if (!this.matches(identity) || this.job?.status !== "PARSING") return false;
    this.parsed = parsed;
    this.job.status = "AWAITING_MAPPING";
    this.job.revision += 1;
    return true;
  }

  public async markValidating(identity: ImportJobIdentity): Promise<boolean> {
    if (!this.matches(identity) || !this.job) return false;
    this.job.status = "VALIDATING";
    return true;
  }

  public async listRows(): Promise<ImportRowRecord[]> {
    return this.rows;
  }

  public async findActiveInvitationsByPhone(
    _eventId: string,
    phoneNumbers: readonly string[],
  ): Promise<ExistingInvitationRecord[]> {
    return this.existingInvitations.filter((invitation) =>
      phoneNumbers.includes(invitation.phoneE164),
    );
  }

  public async completeValidation(
    identity: ImportJobIdentity,
    validation: ValidationPersistence,
  ): Promise<boolean> {
    if (!this.matches(identity) || this.job?.status !== "VALIDATING")
      return false;
    this.validation = validation;
    this.job.status = validation.status;
    this.job.revision += 1;
    return true;
  }

  public async markFailed(
    identity: ImportJobIdentity,
    failure: { code: string; message: string },
  ): Promise<void> {
    if (!this.matches(identity) || !this.job) return;
    this.failure = failure;
    this.job.status = "FAILED";
    this.job.revision += 1;
  }

  private matches(identity: ImportJobIdentity): boolean {
    return (
      this.job?.id === identity.importJobId &&
      this.job.eventId === identity.eventId &&
      this.job.revision === identity.expectedRevision
    );
  }
}

function importJob(overrides: Partial<ImportJobRecord> = {}): ImportJobRecord {
  const emptyBytes = new Uint8Array([1]);
  return {
    id: importJobId,
    eventId,
    status: "UPLOADED",
    revision: 1,
    fileFormat: "CSV",
    detectedHeaders: [],
    columnMapping: null,
    sourceAsset: sourceAsset(emptyBytes, "text/csv", "guests.csv"),
    ...overrides,
  };
}

function sourceAsset(
  bytes: Uint8Array,
  contentType: string,
  originalFilename: string,
): ImportJobRecord["sourceAsset"] {
  return {
    bucket: "dawah-private",
    byteSize: bytes.byteLength,
    contentType,
    isPrivate: true,
    objectKey: `events/${eventId}/imports/source.csv`,
    originalFilename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    status: "READY",
  };
}

function row(
  id: string,
  sourceRowNumber: number,
  sourceData: Record<string, unknown>,
): ImportRowRecord {
  return {
    correctedData: null,
    id,
    importJobId,
    sourceData,
    sourceRowNumber,
    validationErrors: [],
  };
}

function queueJob(
  name: "parse" | "validate",
  operation: ImportQueueJobData["operation"],
  expectedRevision: number,
) {
  return {
    name,
    data: { operation, eventId, importJobId, expectedRevision },
  } as Parameters<ReturnType<typeof createImportProcessor>>[0];
}
