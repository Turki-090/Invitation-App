import { createHash } from "node:crypto";
import { InMemoryObjectStorage } from "@dawah/storage";
import { describe, expect, it } from "vitest";
import {
  createExportProcessor,
  type CompletedExportArtifact,
  type CompleteExportResult,
  type ExportClaimResult,
  type ExportCursor,
  type ExportProcessorRepository,
  type ExportQueueJobData,
  type ExportRow,
  type ExportWorkItem,
} from "./export-processor";

const eventId = "10000000-0000-4000-8000-000000000001";
const exportJobId = "20000000-0000-4000-8000-000000000001";
const requestedByUserId = "30000000-0000-4000-8000-000000000001";
const privateBucket = "dawah-private";
const now = new Date("2026-09-16T09:00:00.000Z");

describe("export worker processor", () => {
  it("writes a checksum-verified CSV and completes the request", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(claimed("CSV"), [
      row(1, "أسرة الشمري", "+966500000001"),
      row(2, "Guest Two", "+966500000002"),
    ]);

    const result = await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 168,
      storage,
    })(queueJob());

    expect(result).toEqual({ outcome: "COMPLETED", rowCount: 2 });
    expect(repository.artifact).toMatchObject({
      bucket: privateBucket,
      contentType: "text/csv; charset=utf-8",
      rowCount: 2,
      expiresAt: new Date("2026-09-23T09:00:00.000Z"),
    });
    const stored = await storage.getObject({
      bucket: privateBucket,
      key: repository.artifact!.objectKey,
    });
    expect(createHash("sha256").update(stored!.body).digest("hex")).toBe(
      repository.artifact!.sha256,
    );
    // Excel needs the UTF-8 byte-order mark to read Arabic text correctly.
    expect(Array.from(stored!.body.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(stored!.body);
    expect(text).toContain("+966500000001");
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(3);
  });

  it("omits phone numbers when the requester may not view them", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(
      claimed("CSV", { includePhone: false }),
      [row(1, "Guest One", "+966500000001")],
    );

    await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    const stored = await storage.getObject({
      bucket: privateBucket,
      key: repository.artifact!.objectKey,
    });
    expect(new TextDecoder().decode(stored!.body)).not.toContain(
      "+966500000001",
    );
  });

  it("neutralizes spreadsheet formula injection in exported text", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(claimed("CSV"), [
      row(1, '=HYPERLINK("http://example.test")', "+966500000001"),
    ]);

    await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    const stored = await storage.getObject({
      bucket: privateBucket,
      key: repository.artifact!.objectKey,
    });
    expect(new TextDecoder().decode(stored!.body)).toContain("\"'=HYPERLINK");
  });

  it("fails the request when the requester lost export permission", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(
      { outcome: "ACCESS_REVOKED", eventId, exportJobId },
      [],
    );

    const result = await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    expect(result).toEqual({ outcome: "FAILED", reason: "ACCESS_REVOKED" });
    expect(repository.failure?.code).toBe("EXPORT_ACCESS_REVOKED");
    expect(storage.objectCount).toBe(0);
  });

  it("skips a request another worker already processed", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(
      { outcome: "SKIPPED", reason: "ALREADY_PROCESSED" },
      [],
    );

    const result = await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    expect(result).toEqual({
      outcome: "SKIPPED",
      reason: "ALREADY_PROCESSED",
    });
    expect(repository.artifact).toBeNull();
  });

  it("removes the generated object when the completion is rejected", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(claimed("CSV"), [row(1)], {
      outcome: "REJECTED",
      retainedObjectKey: null,
    });

    const result = await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    expect(result).toEqual({
      outcome: "SKIPPED",
      reason: "STALE_COMPLETION",
    });
    expect(storage.objectCount).toBe(0);
  });

  it("pages with a keyset cursor and rejects a repository that cannot advance", async () => {
    const storage = new InMemoryObjectStorage();
    const stuck: ExportProcessorRepository = {
      claim: () => Promise.resolve(claimed("CSV")),
      listRows: () => Promise.resolve([row(1), row(1)]),
      complete: () =>
        Promise.resolve({ outcome: "COMPLETED", retainedObjectKey: null }),
      markFailed: () => Promise.resolve(true),
    };

    await expect(
      createExportProcessor({
        now: () => now,
        pageSize: 2,
        privateBucket,
        repository: stuck,
        retentionHours: 24,
        storage,
      })(queueJob()),
    ).rejects.toThrow(/keyset cursor/);
  });

  it("rejects an invalid queue payload without retrying it", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(claimed("CSV"), []);
    const processor = createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    });

    await expect(
      processor({
        data: { eventId: "not-a-uuid", exportJobId } as ExportQueueJobData,
        name: "generate",
      }),
    ).rejects.toThrow(/export queue payload/);
  });

  it("builds a workbook for the XLSX format", async () => {
    const storage = new InMemoryObjectStorage();
    const repository = new FakeRepository(claimed("XLSX"), [row(1)]);

    const result = await createExportProcessor({
      now: () => now,
      privateBucket,
      repository,
      retentionHours: 24,
      storage,
    })(queueJob());

    expect(result.outcome).toBe("COMPLETED");
    expect(repository.artifact?.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const stored = await storage.getObject({
      bucket: privateBucket,
      key: repository.artifact!.objectKey,
    });
    // A workbook is a ZIP container; the magic bytes prove it is not CSV text.
    expect(Array.from(stored!.body.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
});

class FakeRepository implements ExportProcessorRepository {
  public artifact: CompletedExportArtifact | null = null;
  public failure: { code: string; message: string } | null = null;
  private served = false;

  public constructor(
    private readonly claimResult: ExportClaimResult,
    private readonly rows: readonly ExportRow[],
    private readonly completion: CompleteExportResult = {
      outcome: "COMPLETED",
      retainedObjectKey: null,
    },
  ) {}

  public claim(): Promise<ExportClaimResult> {
    return Promise.resolve(this.claimResult);
  }

  public listRows(): Promise<readonly ExportRow[]> {
    if (this.served) return Promise.resolve([]);
    this.served = true;
    return Promise.resolve(this.rows);
  }

  public complete(
    _job: ExportWorkItem,
    artifact: CompletedExportArtifact,
  ): Promise<CompleteExportResult> {
    this.artifact = artifact;
    return Promise.resolve(
      this.completion.outcome === "COMPLETED"
        ? { outcome: "COMPLETED", retainedObjectKey: artifact.objectKey }
        : this.completion,
    );
  }

  public markFailed(
    _data: ExportQueueJobData,
    failure: { readonly code: string; readonly message: string },
  ): Promise<boolean> {
    this.failure = { ...failure };
    return Promise.resolve(true);
  }
}

function claimed(
  format: ExportWorkItem["format"],
  overrides: Partial<ExportWorkItem> = {},
): ExportClaimResult {
  return {
    outcome: "CLAIMED",
    job: {
      eventId,
      exportJobId,
      requestedByUserId,
      format,
      preset: "FULL_GUEST_LIST",
      includePhone: true,
      ...overrides,
    },
  };
}

function row(
  index: number,
  displayName = `Guest ${index}`,
  phoneE164: string | null = "+966500000000",
): ExportRow {
  return {
    cursor: cursor(index),
    invitationId: `40000000-0000-4000-8000-00000000000${index}`,
    displayName,
    contactName: displayName,
    phoneE164,
    invitationType: "SINGLE",
    maxCompanions: 0,
    guestNames: [displayName],
    rsvpStatus: "ACCEPTED",
    expectedAttendees: 2,
    checkedInCount: 1,
    latestDeliveryStatus: "DELIVERED",
  };
}

function cursor(index: number): ExportCursor {
  return {
    createdAt: new Date(`2026-09-0${index}T00:00:00.000Z`),
    id: `40000000-0000-4000-8000-00000000000${index}`,
  };
}

function queueJob(): { data: ExportQueueJobData; name: "generate" } {
  return { data: { eventId, exportJobId }, name: "generate" };
}
