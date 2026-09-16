import { createHash } from "node:crypto";
import { createStorageKeyFactory, type PrivateObjectStorage } from "@dawah/storage";
import { UnrecoverableError, type Job } from "bullmq";
import ExcelJS from "exceljs-hardened";

export type ExportFormat = "CSV" | "XLSX";
export type ExportPreset =
  | "FULL_GUEST_LIST"
  | "CONFIRMED_ATTENDANCE"
  | "PENDING_RSVP"
  | "CHECK_IN_LIST"
  | "FINAL_ATTENDANCE";

export interface ExportQueueJobData {
  readonly eventId: string;
  readonly exportJobId: string;
}

export interface ExportCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ExportRow {
  readonly cursor: ExportCursor;
  readonly invitationId: string;
  readonly displayName: string;
  readonly contactName: string;
  readonly phoneE164: string | null;
  readonly invitationType: string;
  readonly maxCompanions: number;
  readonly guestNames: readonly string[];
  readonly rsvpStatus: string;
  readonly expectedAttendees: number;
  readonly checkedInCount: number;
  readonly latestDeliveryStatus: string | null;
}

export interface ExportWorkItem {
  readonly eventId: string;
  readonly exportJobId: string;
  readonly requestedByUserId: string;
  readonly format: ExportFormat;
  readonly preset: ExportPreset;
  readonly includePhone: boolean;
}

export type ExportClaimResult =
  | { readonly outcome: "CLAIMED"; readonly job: ExportWorkItem }
  | {
      readonly outcome: "ACCESS_REVOKED";
      readonly eventId: string;
      readonly exportJobId: string;
    }
  | {
      readonly outcome: "SKIPPED";
      readonly reason: "NOT_FOUND" | "ALREADY_PROCESSED" | "EVENT_MISMATCH";
    };

export interface CompletedExportArtifact {
  readonly bucket: string;
  readonly objectKey: string;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly rowCount: number;
  readonly expiresAt: Date;
}

export interface CompleteExportResult {
  readonly outcome: "COMPLETED" | "ALREADY_COMPLETED" | "REJECTED";
  readonly retainedObjectKey: string | null;
}

export interface ExportProcessorRepository {
  claim(data: ExportQueueJobData, now: Date): Promise<ExportClaimResult>;
  listRows(
    job: ExportWorkItem,
    cursor: ExportCursor | null,
    pageSize: number,
  ): Promise<readonly ExportRow[]>;
  complete(
    job: ExportWorkItem,
    artifact: CompletedExportArtifact,
    now: Date,
  ): Promise<CompleteExportResult>;
  markFailed(
    data: ExportQueueJobData,
    failure: { readonly code: string; readonly message: string },
    now: Date,
  ): Promise<boolean>;
}

export interface ExportProcessorDependencies {
  readonly privateBucket: string;
  readonly repository: ExportProcessorRepository;
  readonly retentionHours: number;
  readonly storage: PrivateObjectStorage;
  readonly now?: () => Date;
  readonly pageSize?: number;
}

export interface ExportProcessorResult {
  readonly outcome: "COMPLETED" | "FAILED" | "SKIPPED";
  readonly reason?:
    | "ACCESS_REVOKED"
    | "ALREADY_PROCESSED"
    | "EVENT_MISMATCH"
    | "NOT_FOUND"
    | "STALE_COMPLETION";
  readonly rowCount?: number;
}

type ExportBullJob = Pick<
  Job<ExportQueueJobData, ExportProcessorResult, "generate">,
  "data" | "name"
>;

const DEFAULT_PAGE_SIZE = 500;
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createExportProcessor(
  dependencies: ExportProcessorDependencies,
): (job: ExportBullJob) => Promise<ExportProcessorResult> {
  assertDependencies(dependencies);
  const now = dependencies.now ?? (() => new Date());
  const pageSize = dependencies.pageSize ?? DEFAULT_PAGE_SIZE;

  return async (bullJob) => {
    const data = readQueueJob(bullJob);
    const claimed = await dependencies.repository.claim(data, now());
    if (claimed.outcome === "SKIPPED") {
      return { outcome: "SKIPPED", reason: claimed.reason };
    }
    if (claimed.outcome === "ACCESS_REVOKED") {
      await dependencies.repository.markFailed(
        data,
        {
          code: "EXPORT_ACCESS_REVOKED",
          message:
            "The requester no longer has an active membership with export permission.",
        },
        now(),
      );
      return { outcome: "FAILED", reason: "ACCESS_REVOKED" };
    }

    const writer = createArtifactWriter(
      claimed.job.format,
      claimed.job.includePhone,
    );
    let cursor: ExportCursor | null = null;
    let rowCount = 0;
    for (;;) {
      const rows = await dependencies.repository.listRows(
        claimed.job,
        cursor,
        pageSize,
      );
      if (rows.length === 0) break;
      assertForwardProgress(rows, cursor, pageSize);
      writer.addRows(rows);
      rowCount += rows.length;
      cursor = rows.at(-1)!.cursor;
      if (rows.length < pageSize) break;
    }

    const body = await writer.finish();
    const sha256 = createHash("sha256").update(body).digest("hex");
    const extension = claimed.job.format.toLowerCase();
    const filename = `guest-export-${claimed.job.exportJobId}.${extension}`;
    const objectKey = createStorageKeyFactory(() => sha256).generatedFile({
      eventId: claimed.job.eventId,
      kind: "exports",
      filename,
    });
    const contentType =
      claimed.job.format === "CSV" ? CSV_CONTENT_TYPE : XLSX_CONTENT_TYPE;
    const expiresAt = new Date(
      now().getTime() + dependencies.retentionHours * 60 * 60 * 1_000,
    );

    await dependencies.storage.putObject({
      bucket: dependencies.privateBucket,
      key: objectKey,
      body,
      contentType,
      metadata: {
        export_job_id: claimed.job.exportJobId,
        sha256,
      },
    });
    const stored = await dependencies.storage.headObject({
      bucket: dependencies.privateBucket,
      key: objectKey,
    });
    if (
      !stored ||
      stored.size !== body.byteLength ||
      (stored.contentType !== undefined && stored.contentType !== contentType) ||
      stored.metadata.sha256 !== sha256
    ) {
      await safelyDelete(dependencies.storage, dependencies.privateBucket, objectKey);
      throw new Error("The generated export failed its private-storage integrity check.");
    }

    let completed: CompleteExportResult;
    try {
      completed = await dependencies.repository.complete(
        claimed.job,
        {
          bucket: dependencies.privateBucket,
          objectKey,
          originalFilename: filename,
          contentType,
          byteSize: body.byteLength,
          sha256,
          rowCount,
          expiresAt,
        },
        now(),
      );
    } catch (error) {
      await safelyDelete(dependencies.storage, dependencies.privateBucket, objectKey);
      throw error;
    }

    if (
      completed.outcome !== "COMPLETED" &&
      completed.retainedObjectKey !== objectKey
    ) {
      await safelyDelete(dependencies.storage, dependencies.privateBucket, objectKey);
    }
    if (completed.outcome !== "COMPLETED") {
      return {
        outcome: "SKIPPED",
        reason:
          completed.outcome === "ALREADY_COMPLETED"
            ? "ALREADY_PROCESSED"
            : "STALE_COMPLETION",
      };
    }
    return { outcome: "COMPLETED", rowCount };
  };
}

interface ArtifactWriter {
  addRows(rows: readonly ExportRow[]): void;
  finish(): Promise<Uint8Array>;
}

interface ExportColumn {
  readonly header: string;
  readonly key: string;
  readonly width: number;
  readonly value: (row: ExportRow) => string | number;
}

function exportColumns(includePhone: boolean): readonly ExportColumn[] {
  return [
    { header: "معرّف الدعوة", key: "invitation_id", width: 38, value: (row) => row.invitationId },
    { header: "اسم المجموعة", key: "display_name", width: 30, value: (row) => safeSpreadsheetText(row.displayName) },
    { header: "اسم جهة الاتصال", key: "contact_name", width: 30, value: (row) => safeSpreadsheetText(row.contactName) },
    ...(includePhone
      ? [{ header: "رقم الهاتف", key: "phone", width: 20, value: (row: ExportRow) => safeSpreadsheetText(row.phoneE164 ?? "") }]
      : []),
    { header: "نوع الدعوة", key: "invitation_type", width: 24, value: (row) => row.invitationType },
    { header: "عدد المرافقين", key: "max_companions", width: 16, value: (row) => row.maxCompanions },
    { header: "أسماء الضيوف", key: "guest_names", width: 45, value: (row) => safeSpreadsheetText(row.guestNames.join("؛ ")) },
    { header: "حالة الرد", key: "rsvp_status", width: 22, value: (row) => row.rsvpStatus },
    { header: "الحضور المتوقع", key: "expected_attendees", width: 18, value: (row) => row.expectedAttendees },
    { header: "تم تسجيل دخولهم", key: "checked_in", width: 18, value: (row) => row.checkedInCount },
    { header: "المتبقي", key: "remaining", width: 14, value: (row) => Math.max(0, row.expectedAttendees - row.checkedInCount) },
    { header: "آخر حالة توصيل", key: "latest_delivery_status", width: 22, value: (row) => row.latestDeliveryStatus ?? "" },
  ];
}

function createArtifactWriter(
  format: ExportFormat,
  includePhone: boolean,
): ArtifactWriter {
  const columns = exportColumns(includePhone);
  if (format === "CSV") {
    const chunks = [
      `\uFEFF${columns.map((column) => csvCell(column.header)).join(",")}\r\n`,
    ];
    return {
      addRows(rows) {
        for (const row of rows) {
          chunks.push(
            `${columns.map((column) => csvCell(column.value(row))).join(",")}\r\n`,
          );
        }
      },
      async finish() {
        return Buffer.from(chunks.join(""), "utf8");
      },
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dawah";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  const worksheet = workbook.addWorksheet("الضيوف", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = columns.map(({ header, key, width }) => ({
    header,
    key,
    width,
  }));
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  return {
    addRows(rows) {
      for (const row of rows) {
        worksheet.addRow(
          Object.fromEntries(
            columns.map((column) => [column.key, column.value(row)]),
          ),
        );
      }
    },
    async finish() {
      const buffer = await workbook.xlsx.writeBuffer({ useStyles: true });
      return new Uint8Array(buffer);
    },
  };
}

function csvCell(value: string | number): string {
  const text = typeof value === "number" ? String(value) : safeSpreadsheetText(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function readQueueJob(job: ExportBullJob): ExportQueueJobData {
  if (
    job.name !== "generate" ||
    !isRecord(job.data) ||
    !isUuid(job.data.eventId) ||
    !isUuid(job.data.exportJobId)
  ) {
    throw new UnrecoverableError("The export queue payload is invalid.");
  }
  return job.data as ExportQueueJobData;
}

function assertForwardProgress(
  rows: readonly ExportRow[],
  previous: ExportCursor | null,
  pageSize: number,
): void {
  if (rows.length > pageSize) {
    throw new Error("The export repository returned an oversized page.");
  }
  let cursor = previous;
  for (const row of rows) {
    if (
      cursor &&
      (row.cursor.createdAt.getTime() < cursor.createdAt.getTime() ||
        (row.cursor.createdAt.getTime() === cursor.createdAt.getTime() &&
          row.cursor.id <= cursor.id))
    ) {
      throw new Error("The export repository did not advance its keyset cursor.");
    }
    cursor = row.cursor;
  }
}

function assertDependencies(dependencies: ExportProcessorDependencies): void {
  if (
    !Number.isInteger(dependencies.retentionHours) ||
    dependencies.retentionHours <= 0 ||
    (dependencies.pageSize !== undefined &&
      (!Number.isInteger(dependencies.pageSize) || dependencies.pageSize <= 0))
  ) {
    throw new RangeError("Export retention and page size must be positive integers.");
  }
}

async function safelyDelete(
  storage: PrivateObjectStorage,
  bucket: string,
  key: string,
): Promise<void> {
  try {
    await storage.deleteObject({ bucket, key });
  } catch {
    // Best-effort orphan cleanup. Retention lifecycle policies remain the
    // backstop when the storage provider itself is unavailable.
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
