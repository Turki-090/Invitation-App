import { createHash } from "node:crypto";
import {
  validateImportRow,
  type ImportColumnMapping,
  type ImportField,
  type ImportRowIssue,
  type NormalizedImportInvitation,
} from "@dawah/domain";
import {
  ImportFileError,
  parseImportFile,
  validateImportUpload,
  type ImportParserLimits,
  type ParsedImportFile,
} from "@dawah/imports";
import type { PrivateObjectStorage } from "@dawah/storage";
import { UnrecoverableError, type Job } from "bullmq";

export const IMPORT_PARSER_VERSION = "dawah-imports/1";

export type ImportQueueJobName = "parse" | "validate";

export type ImportQueueJobData =
  | {
      operation: "PARSE";
      eventId: string;
      importJobId: string;
      expectedRevision: number;
    }
  | {
      operation: "VALIDATE";
      eventId: string;
      importJobId: string;
      expectedRevision: number;
    };

export interface ImportJobIdentity {
  eventId: string;
  importJobId: string;
  expectedRevision: number;
}

export type ImportJobStatus =
  | "UPLOADED"
  | "PARSING"
  | "AWAITING_MAPPING"
  | "VALIDATING"
  | "REVIEWING"
  | "READY"
  | "IMPORTING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface ImportSourceAssetRecord {
  bucket: string;
  byteSize: number | null;
  contentType: string | null;
  isPrivate: boolean;
  objectKey: string;
  originalFilename: string;
  sha256: string | null;
  status: "PENDING_UPLOAD" | "UPLOADED" | "READY" | "QUARANTINED" | "DELETED";
}

export interface ImportJobRecord {
  columnMapping: unknown;
  detectedHeaders: unknown;
  eventId: string;
  fileFormat: "CSV" | "XLSX";
  id: string;
  revision: number;
  sourceAsset: ImportSourceAssetRecord;
  status: ImportJobStatus;
}

export interface ImportRowRecord {
  correctedData: unknown | null;
  id: string;
  importJobId: string;
  sourceData: unknown;
  sourceRowNumber: number;
  validationErrors: unknown;
}

export interface ExistingInvitationRecord {
  id: string;
  phoneE164: string;
}

export interface PersistedImportIssue {
  code: string;
  column?: string;
  duplicateInvitationIds?: string[];
  duplicateRowNumbers?: number[];
  field: ImportField | "row";
  message: string;
}

export interface ParsedRowsPersistence {
  availableWorksheets: string[];
  suggestedMapping: Partial<ImportColumnMapping>;
  csvDelimiter: string | null;
  detectedEncoding: string | null;
  headers: string[];
  parserVersion: string;
  rows: Array<{
    errors: PersistedImportIssue[];
    sourceData: Record<string, string | number>;
    sourceRowNumber: number;
  }>;
  selectedWorksheet: string | null;
}

export type ValidatedRowStatus = "VALID" | "INVALID" | "DUPLICATE";

export interface ValidatedRowPersistence {
  duplicateInvitationGroupId: string | null;
  duplicateOfRowId: string | null;
  errors: PersistedImportIssue[];
  id: string;
  normalized: NormalizedImportInvitation | null;
  normalizedHash: string | null;
  phoneInput: string | null;
  status: ValidatedRowStatus;
  warnings: PersistedImportIssue[];
}

export interface ValidationPersistence {
  duplicateRows: number;
  invalidRows: number;
  rows: ValidatedRowPersistence[];
  status: "READY" | "REVIEWING";
  validRows: number;
}

/**
 * Persistence boundary for the processor. Keeping this boundary small lets the
 * parsing and validation behavior be tested without PostgreSQL while the
 * production adapter still performs revision-guarded transactions.
 */
export interface ImportProcessorRepository {
  completeParse(
    identity: ImportJobIdentity,
    parsed: ParsedRowsPersistence,
    now: Date,
  ): Promise<boolean>;
  completeValidation(
    identity: ImportJobIdentity,
    validation: ValidationPersistence,
    now: Date,
  ): Promise<boolean>;
  findActiveInvitationsByPhone(
    eventId: string,
    phoneNumbers: readonly string[],
  ): Promise<ExistingInvitationRecord[]>;
  findJob(identity: ImportJobIdentity): Promise<ImportJobRecord | null>;
  listRows(identity: ImportJobIdentity): Promise<ImportRowRecord[]>;
  markFailed(
    identity: ImportJobIdentity,
    failure: { code: string; message: string },
    now: Date,
  ): Promise<void>;
  markParsing(identity: ImportJobIdentity, now: Date): Promise<boolean>;
  markValidating(identity: ImportJobIdentity): Promise<boolean>;
}

export interface ImportProcessorDependencies {
  limits: ImportParserLimits;
  now?: () => Date;
  repository: ImportProcessorRepository;
  storage: PrivateObjectStorage;
}

export interface ImportProcessorResult {
  operation: ImportQueueJobData["operation"];
  outcome: "COMPLETED" | "FAILED" | "SKIPPED";
  reason?: "ALREADY_PROCESSED" | "NOT_FOUND" | "STALE_REVISION";
  rowCount?: number;
}

type ImportBullJob = Pick<
  Job<ImportQueueJobData, ImportProcessorResult, ImportQueueJobName>,
  "data" | "name"
>;

export function createImportProcessor(
  dependencies: ImportProcessorDependencies,
): (job: ImportBullJob) => Promise<ImportProcessorResult> {
  const now = dependencies.now ?? (() => new Date());

  return async (job) => {
    const data = readQueueJob(job);
    const identity: ImportJobIdentity = {
      eventId: data.eventId,
      importJobId: data.importJobId,
      expectedRevision: data.expectedRevision,
    };

    return data.operation === "PARSE"
      ? processParse(identity, dependencies, now)
      : processValidation(identity, dependencies, now);
  };
}

async function processParse(
  identity: ImportJobIdentity,
  dependencies: ImportProcessorDependencies,
  now: () => Date,
): Promise<ImportProcessorResult> {
  const job = await dependencies.repository.findJob(identity);
  const skip = skipReason(job, identity);
  if (skip) return { operation: "PARSE", outcome: "SKIPPED", reason: skip };
  if (!job)
    return { operation: "PARSE", outcome: "SKIPPED", reason: "NOT_FOUND" };

  if (job.status !== "UPLOADED" && job.status !== "PARSING") {
    return {
      operation: "PARSE",
      outcome: "SKIPPED",
      reason: "ALREADY_PROCESSED",
    };
  }

  if (job.status === "UPLOADED") {
    const transitioned = await dependencies.repository.markParsing(
      identity,
      now(),
    );
    if (!transitioned) {
      return {
        operation: "PARSE",
        outcome: "SKIPPED",
        reason: "STALE_REVISION",
      };
    }
  }

  try {
    assertUsableSourceAsset(job.sourceAsset);
    const storedInfo = await dependencies.storage.headObject({
      bucket: job.sourceAsset.bucket,
      key: job.sourceAsset.objectKey,
    });
    if (!storedInfo) {
      throw new PermanentImportError(
        "IMPORT_SOURCE_NOT_FOUND",
        "The stored import source file could not be found.",
      );
    }
    assertStoredObjectSize(
      job.sourceAsset,
      storedInfo.size,
      dependencies.limits.maximumFileBytes,
    );
    const storedObject = await dependencies.storage.getObject({
      bucket: job.sourceAsset.bucket,
      key: job.sourceAsset.objectKey,
    });
    if (!storedObject) {
      throw new PermanentImportError(
        "IMPORT_SOURCE_NOT_FOUND",
        "The stored import source file could not be found.",
      );
    }
    assertStoredObjectIntegrity(job.sourceAsset, storedObject.body);

    const declaredMediaType = selectMediaType(
      job.sourceAsset.contentType,
      storedObject.contentType,
    );
    const validatedUpload = validateImportUpload(
      {
        bytes: storedObject.body,
        declaredMediaType,
        originalFilename: job.sourceAsset.originalFilename,
      },
      dependencies.limits,
    );
    if (validatedUpload.kind.toUpperCase() !== job.fileFormat) {
      throw new PermanentImportError(
        "IMPORT_FORMAT_MISMATCH",
        "The recorded import format does not match the stored file.",
      );
    }

    const parsed = await parseImportFile(validatedUpload, dependencies.limits);
    if (parsed.rows.length === 0) {
      throw new PermanentImportError(
        "IMPORT_NO_DATA_ROWS",
        "The import file has a header row but no guest rows.",
      );
    }
    const persistence = toParsedRowsPersistence(parsed, validatedUpload.kind);
    const completed = await dependencies.repository.completeParse(
      identity,
      persistence,
      now(),
    );
    return completed
      ? {
          operation: "PARSE",
          outcome: "COMPLETED",
          rowCount: persistence.rows.length,
        }
      : { operation: "PARSE", outcome: "SKIPPED", reason: "STALE_REVISION" };
  } catch (error) {
    const failure = permanentFailure(error);
    if (!failure) throw error;
    await dependencies.repository.markFailed(identity, failure, now());
    return { operation: "PARSE", outcome: "FAILED" };
  }
}

async function processValidation(
  identity: ImportJobIdentity,
  dependencies: ImportProcessorDependencies,
  now: () => Date,
): Promise<ImportProcessorResult> {
  const job = await dependencies.repository.findJob(identity);
  const skip = skipReason(job, identity);
  if (skip) return { operation: "VALIDATE", outcome: "SKIPPED", reason: skip };
  if (!job) {
    return { operation: "VALIDATE", outcome: "SKIPPED", reason: "NOT_FOUND" };
  }

  if (
    job.status !== "AWAITING_MAPPING" &&
    job.status !== "VALIDATING" &&
    job.status !== "REVIEWING" &&
    job.status !== "READY"
  ) {
    return {
      operation: "VALIDATE",
      outcome: "SKIPPED",
      reason: "ALREADY_PROCESSED",
    };
  }

  try {
    const rows = await dependencies.repository.listRows(identity);
    const headers = readDetectedHeaders(job.detectedHeaders);
    const mapping = readColumnMapping(job.columnMapping, headers);
    if (job.status !== "VALIDATING") {
      const transitioned =
        await dependencies.repository.markValidating(identity);
      if (!transitioned) {
        return {
          operation: "VALIDATE",
          outcome: "SKIPPED",
          reason: "STALE_REVISION",
        };
      }
    }

    const candidates = rows.map((row) => validateRow(row, mapping));
    const validPhoneNumbers = [
      ...new Set(
        candidates.flatMap((candidate) =>
          candidate.normalized ? [candidate.normalized.phoneE164] : [],
        ),
      ),
    ];
    const existingInvitations =
      await dependencies.repository.findActiveInvitationsByPhone(
        identity.eventId,
        validPhoneNumbers,
      );
    const validation = detectDuplicates(candidates, existingInvitations);
    const completed = await dependencies.repository.completeValidation(
      identity,
      validation,
      now(),
    );
    return completed
      ? {
          operation: "VALIDATE",
          outcome: "COMPLETED",
          rowCount: validation.rows.length,
        }
      : {
          operation: "VALIDATE",
          outcome: "SKIPPED",
          reason: "STALE_REVISION",
        };
  } catch (error) {
    const failure = permanentFailure(error);
    if (!failure) throw error;
    await dependencies.repository.markFailed(identity, failure, now());
    return { operation: "VALIDATE", outcome: "FAILED" };
  }
}

function readQueueJob(job: ImportBullJob): ImportQueueJobData {
  if (!isRecord(job.data)) {
    throw new UnrecoverableError("The import queue payload must be an object.");
  }
  const operation = job.data.operation;
  const expectedName = operation === "PARSE" ? "parse" : "validate";
  if (
    (operation !== "PARSE" && operation !== "VALIDATE") ||
    job.name !== expectedName ||
    !isNonEmptyString(job.data.eventId) ||
    !isNonEmptyString(job.data.importJobId) ||
    !Number.isInteger(job.data.expectedRevision) ||
    job.data.expectedRevision < 1
  ) {
    throw new UnrecoverableError("The import queue payload is invalid.");
  }
  return job.data as ImportQueueJobData;
}

function skipReason(
  job: ImportJobRecord | null,
  identity: ImportJobIdentity,
): ImportProcessorResult["reason"] | null {
  if (!job) return "NOT_FOUND";
  if (job.revision !== identity.expectedRevision) return "STALE_REVISION";
  if (
    job.status === "CANCELLED" ||
    job.status === "COMPLETED" ||
    job.status === "IMPORTING" ||
    job.status === "FAILED"
  ) {
    return "ALREADY_PROCESSED";
  }
  return null;
}

function assertUsableSourceAsset(asset: ImportSourceAssetRecord): void {
  if (!asset.isPrivate) {
    throw new PermanentImportError(
      "IMPORT_SOURCE_NOT_PRIVATE",
      "Import source files must be stored privately.",
    );
  }
  if (asset.status !== "UPLOADED" && asset.status !== "READY") {
    throw new PermanentImportError(
      "IMPORT_SOURCE_UNAVAILABLE",
      "The import source file is not available for processing.",
    );
  }
}

function assertStoredObjectIntegrity(
  asset: ImportSourceAssetRecord,
  bytes: Uint8Array,
): void {
  if (asset.byteSize !== null && asset.byteSize !== bytes.byteLength) {
    throw new PermanentImportError(
      "IMPORT_SOURCE_SIZE_MISMATCH",
      "The stored import source size does not match its recorded size.",
    );
  }
  if (asset.sha256) {
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== asset.sha256.toLowerCase()) {
      throw new PermanentImportError(
        "IMPORT_SOURCE_DIGEST_MISMATCH",
        "The stored import source failed its integrity check.",
      );
    }
  }
}

function assertStoredObjectSize(
  asset: ImportSourceAssetRecord,
  storedSize: number,
  maximumFileBytes: number,
): void {
  if (
    !Number.isSafeInteger(storedSize) ||
    storedSize <= 0 ||
    storedSize > maximumFileBytes ||
    (asset.byteSize !== null && asset.byteSize !== storedSize)
  ) {
    throw new PermanentImportError(
      "IMPORT_SOURCE_SIZE_MISMATCH",
      "The stored import source size is invalid or does not match its recorded size.",
    );
  }
}

function selectMediaType(
  recordedMediaType: string | null,
  objectMediaType: string | undefined,
): string {
  if (
    recordedMediaType &&
    objectMediaType &&
    normalizeMediaType(recordedMediaType) !==
      normalizeMediaType(objectMediaType)
  ) {
    throw new PermanentImportError(
      "IMPORT_SOURCE_MEDIA_TYPE_MISMATCH",
      "The stored import source media type does not match its recorded type.",
    );
  }
  const mediaType = recordedMediaType ?? objectMediaType;
  if (!mediaType) {
    throw new PermanentImportError(
      "IMPORT_SOURCE_MEDIA_TYPE_MISSING",
      "The stored import source has no media type.",
    );
  }
  return mediaType;
}

function normalizeMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function toParsedRowsPersistence(
  parsed: ParsedImportFile,
  kind: "csv" | "xlsx",
): ParsedRowsPersistence {
  return {
    availableWorksheets: parsed.worksheetName ? [parsed.worksheetName] : [],
    suggestedMapping: parsed.suggestedMapping,
    csvDelimiter: kind === "csv" ? "," : null,
    detectedEncoding: kind === "csv" ? "UTF-8" : null,
    headers: parsed.headers,
    parserVersion: IMPORT_PARSER_VERSION,
    rows: parsed.rows.map((row) => ({
      errors: row.parserIssues.map((issue) => ({
        code: issue.code,
        ...(issue.column ? { column: issue.column } : {}),
        field: "row",
        message: issue.message,
      })),
      sourceData: row.values,
      sourceRowNumber: row.rowNumber,
    })),
    selectedWorksheet: parsed.worksheetName,
  };
}

function readDetectedHeaders(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((header) => !isNonEmptyString(header))
  ) {
    throw new PermanentImportError(
      "IMPORT_HEADERS_INVALID",
      "The import headers are missing or invalid.",
    );
  }
  return value;
}

function readColumnMapping(
  value: unknown,
  headers: readonly string[],
): ImportColumnMapping {
  if (!isRecord(value)) {
    throw new PermanentImportError(
      "IMPORT_MAPPING_INVALID",
      "The import column mapping is missing or invalid.",
    );
  }
  const allowedFields = new Set<ImportField>([
    "displayName",
    "contactName",
    "phoneNumber",
    "phoneCountry",
    "invitationType",
    "maxCompanions",
    "members",
    "internalNote",
  ]);
  const result: Partial<Record<ImportField, string>> = {};
  for (const [field, header] of Object.entries(value)) {
    if (!allowedFields.has(field as ImportField) || !isNonEmptyString(header)) {
      throw new PermanentImportError(
        "IMPORT_MAPPING_INVALID",
        "The import column mapping contains an unsupported field or header.",
      );
    }
    if (!headers.includes(header)) {
      throw new PermanentImportError(
        "IMPORT_MAPPING_INVALID",
        `The mapped source column '${header}' does not exist.`,
      );
    }
    result[field as ImportField] = header;
  }
  if (!result.displayName || !result.phoneNumber) {
    throw new PermanentImportError(
      "IMPORT_MAPPING_INVALID",
      "Display name and phone number columns are required.",
    );
  }
  const mappedHeaders = Object.values(result);
  if (new Set(mappedHeaders).size !== mappedHeaders.length) {
    throw new PermanentImportError(
      "IMPORT_MAPPING_INVALID",
      "A source column cannot be mapped to more than one field.",
    );
  }
  return result as ImportColumnMapping;
}

interface ValidatedCandidate {
  errors: PersistedImportIssue[];
  id: string;
  normalized: NormalizedImportInvitation | null;
  normalizedHash: string | null;
  phoneInput: string | null;
  sourceRowNumber: number;
}

function validateRow(
  row: ImportRowRecord,
  mapping: ImportColumnMapping,
): ValidatedCandidate {
  const source = readSourceData(row.sourceData);
  const corrections = readCorrections(row.correctedData);
  const effectiveSource = { ...source };
  const effectiveMapping: ImportColumnMapping = { ...mapping };
  const correctedColumns = new Set<string>();
  for (const [field, value] of Object.entries(corrections)) {
    const importField = field as ImportField;
    let header = mapping[importField];
    if (!header) {
      header = `__dawah_correction:${field}`;
      while (Object.hasOwn(effectiveSource, header)) header = `_${header}`;
      effectiveMapping[importField] = header;
    }
    effectiveSource[header] = value;
    correctedColumns.add(header);
  }

  const mappedColumns = new Set(Object.values(mapping));
  const parserErrors = readParserErrors(row.validationErrors).filter(
    (issue) =>
      !issue.column ||
      (mappedColumns.has(issue.column) && !correctedColumns.has(issue.column)),
  );
  const validation = validateImportRow(effectiveSource, effectiveMapping);
  const errors = [
    ...parserErrors,
    ...validation.errors.map(toPersistedDomainIssue),
  ];
  const normalized = errors.length === 0 ? validation.normalized : null;
  return {
    errors,
    id: row.id,
    normalized,
    normalizedHash: normalized ? normalizedDigest(normalized) : null,
    phoneInput: normalized
      ? scalarText(effectiveSource[effectiveMapping.phoneNumber])
      : null,
    sourceRowNumber: row.sourceRowNumber,
  };
}

function detectDuplicates(
  candidates: readonly ValidatedCandidate[],
  existingInvitations: readonly ExistingInvitationRecord[],
): ValidationPersistence {
  const existingByPhone = new Map<string, ExistingInvitationRecord[]>();
  for (const invitation of existingInvitations) {
    const matches = existingByPhone.get(invitation.phoneE164) ?? [];
    matches.push(invitation);
    existingByPhone.set(invitation.phoneE164, matches);
  }

  const firstRowByPhone = new Map<
    string,
    { id: string; sourceRowNumber: number }
  >();
  const rows: ValidatedRowPersistence[] = [];
  for (const candidate of candidates) {
    if (!candidate.normalized) {
      rows.push({
        duplicateInvitationGroupId: null,
        duplicateOfRowId: null,
        errors: candidate.errors,
        id: candidate.id,
        normalized: null,
        normalizedHash: null,
        phoneInput: null,
        status: "INVALID",
        warnings: [],
      });
      continue;
    }

    const phone = candidate.normalized.phoneE164;
    const priorRow = firstRowByPhone.get(phone);
    const existing = existingByPhone.get(phone) ?? [];
    if (!priorRow) {
      firstRowByPhone.set(phone, {
        id: candidate.id,
        sourceRowNumber: candidate.sourceRowNumber,
      });
    }

    if (priorRow) {
      rows.push({
        duplicateInvitationGroupId: null,
        duplicateOfRowId: priorRow.id,
        errors: [],
        id: candidate.id,
        normalized: candidate.normalized,
        normalizedHash: candidate.normalizedHash,
        phoneInput: candidate.phoneInput,
        status: "DUPLICATE",
        warnings: [
          {
            code: "DUPLICATE_IN_FILE",
            duplicateRowNumbers: [priorRow.sourceRowNumber],
            field: "phoneNumber",
            message: "Another row in this import uses the same phone number.",
          },
        ],
      });
      continue;
    }

    if (existing.length > 0) {
      rows.push({
        duplicateInvitationGroupId: existing[0]?.id ?? null,
        duplicateOfRowId: null,
        errors: [],
        id: candidate.id,
        normalized: candidate.normalized,
        normalizedHash: candidate.normalizedHash,
        phoneInput: candidate.phoneInput,
        status: "DUPLICATE",
        warnings: [
          {
            code: "DUPLICATE_EXISTING_INVITATION",
            duplicateInvitationIds: existing
              .slice(0, 100)
              .map((invitation) => invitation.id),
            field: "phoneNumber",
            message: "An active invitation already uses this phone number.",
          },
        ],
      });
      continue;
    }

    rows.push({
      duplicateInvitationGroupId: null,
      duplicateOfRowId: null,
      errors: [],
      id: candidate.id,
      normalized: candidate.normalized,
      normalizedHash: candidate.normalizedHash,
      phoneInput: candidate.phoneInput,
      status: "VALID",
      warnings: [],
    });
  }

  const invalidRows = rows.filter((row) => row.status === "INVALID").length;
  const duplicateRows = rows.filter((row) => row.status === "DUPLICATE").length;
  return {
    duplicateRows,
    invalidRows,
    rows,
    status: invalidRows === 0 ? "READY" : "REVIEWING",
    validRows: rows.length - invalidRows - duplicateRows,
  };
}

function readSourceData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new PermanentImportError(
      "IMPORT_ROW_DATA_INVALID",
      "An imported source row is not a JSON object.",
    );
  }
  return value;
}

function readCorrections(
  value: unknown,
): Partial<Record<ImportField, unknown>> {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) {
    throw new PermanentImportError(
      "IMPORT_ROW_CORRECTION_INVALID",
      "An import row correction is not a JSON object.",
    );
  }
  return value;
}

const parserIssueCodes = new Set([
  "ACTIVE_OR_COMPLEX_CELL_REJECTED",
  "CELL_TOO_LONG",
]);

function readParserErrors(value: unknown): PersistedImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      !isNonEmptyString(candidate.code) ||
      !parserIssueCodes.has(candidate.code) ||
      !isNonEmptyString(candidate.message)
    ) {
      return [];
    }
    return [
      {
        code: candidate.code,
        ...(isNonEmptyString(candidate.column)
          ? { column: candidate.column }
          : {}),
        field: "row" as const,
        message: candidate.message,
      },
    ];
  });
}

function toPersistedDomainIssue(issue: ImportRowIssue): PersistedImportIssue {
  return {
    code: issue.code,
    field: issue.field,
    message: issue.message,
  };
}

function normalizedDigest(value: NormalizedImportInvitation): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        value.displayName,
        value.contactName,
        value.phoneE164,
        value.phoneCountry,
        value.invitationType,
        value.maxCompanions,
        value.members.map((member) => [member.name, member.isPrimary]),
        value.internalNote,
      ]),
    )
    .digest("hex");
}

function scalarText(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : null;
}

function permanentFailure(
  error: unknown,
): { code: string; message: string } | null {
  if (
    error instanceof ImportFileError ||
    error instanceof PermanentImportError
  ) {
    return {
      code: error.code.slice(0, 80),
      message: error.message.slice(0, 1_000),
    };
  }
  return null;
}

class PermanentImportError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PermanentImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
