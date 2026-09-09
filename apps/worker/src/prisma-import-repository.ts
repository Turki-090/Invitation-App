import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ExistingInvitationRecord,
  ImportJobIdentity,
  ImportJobRecord,
  ImportProcessorRepository,
  ImportRowRecord,
  ParsedRowsPersistence,
  ValidationPersistence,
  ValidatedRowPersistence,
} from "./import-processor";

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

export class PrismaImportProcessorRepository implements ImportProcessorRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findJob(
    identity: ImportJobIdentity,
  ): Promise<ImportJobRecord | null> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: identity.importJobId, eventId: identity.eventId },
      select: {
        id: true,
        eventId: true,
        status: true,
        revision: true,
        fileFormat: true,
        detectedHeaders: true,
        columnMapping: true,
        sourceAsset: {
          select: {
            bucket: true,
            objectKey: true,
            originalFilename: true,
            contentType: true,
            byteSize: true,
            sha256: true,
            isPrivate: true,
            status: true,
          },
        },
      },
    });
    return job as ImportJobRecord | null;
  }

  public async markParsing(
    identity: ImportJobIdentity,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.importJob.updateMany({
      where: {
        id: identity.importJobId,
        eventId: identity.eventId,
        revision: identity.expectedRevision,
        status: "UPLOADED",
      },
      data: {
        status: "PARSING",
        parsingStartedAt: now,
        failedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    });
    return result.count === 1;
  }

  public async completeParse(
    identity: ImportJobIdentity,
    parsed: ParsedRowsPersistence,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.importJob.findFirst({
          where: {
            id: identity.importJobId,
            eventId: identity.eventId,
            revision: identity.expectedRevision,
            status: "PARSING",
          },
          select: { id: true },
        });
        if (!current) return false;

        await transaction.importRow.deleteMany({
          where: {
            importJobId: identity.importJobId,
            eventId: identity.eventId,
          },
        });
        if (parsed.rows.length > 0) {
          await transaction.importRow.createMany({
            data: parsed.rows.map((row) => ({
              importJobId: identity.importJobId,
              eventId: identity.eventId,
              sourceRowNumber: row.sourceRowNumber,
              sourceData: asJson(row.sourceData),
              status: row.errors.length === 0 ? "UNMAPPED" : "INVALID",
              validationErrors: asJson(row.errors),
            })),
          });
        }

        const invalidRows = parsed.rows.filter(
          (row) => row.errors.length > 0,
        ).length;
        const updated = await transaction.importJob.updateMany({
          where: {
            id: identity.importJobId,
            eventId: identity.eventId,
            revision: identity.expectedRevision,
            status: "PARSING",
          },
          data: {
            status: "AWAITING_MAPPING",
            selectedWorksheet: parsed.selectedWorksheet,
            availableWorksheets: asJson(parsed.availableWorksheets),
            detectedHeaders: asJson(parsed.headers),
            suggestedMapping: asJson(parsed.suggestedMapping),
            columnMapping: Prisma.DbNull,
            csvDelimiter: parsed.csvDelimiter,
            detectedEncoding: parsed.detectedEncoding,
            parserVersion: parsed.parserVersion,
            totalRows: parsed.rows.length,
            validRows: 0,
            invalidRows,
            duplicateRows: 0,
            skippedRows: 0,
            importedRows: 0,
            parsedAt: now,
            failedAt: null,
            failureCode: null,
            failureMessage: null,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new StaleImportWriteError();
        return true;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof StaleImportWriteError) return false;
      throw error;
    }
  }

  public async markValidating(identity: ImportJobIdentity): Promise<boolean> {
    const result = await this.prisma.importJob.updateMany({
      where: {
        id: identity.importJobId,
        eventId: identity.eventId,
        revision: identity.expectedRevision,
        status: { in: ["AWAITING_MAPPING", "REVIEWING", "READY"] },
      },
      data: { status: "VALIDATING" },
    });
    return result.count === 1;
  }

  public async listRows(
    identity: ImportJobIdentity,
  ): Promise<ImportRowRecord[]> {
    const rows = await this.prisma.importRow.findMany({
      where: {
        importJobId: identity.importJobId,
        eventId: identity.eventId,
      },
      orderBy: { sourceRowNumber: "asc" },
      select: {
        id: true,
        importJobId: true,
        sourceRowNumber: true,
        sourceData: true,
        correctedData: true,
        validationErrors: true,
      },
    });
    return rows;
  }

  public async findActiveInvitationsByPhone(
    eventId: string,
    phoneNumbers: readonly string[],
  ): Promise<ExistingInvitationRecord[]> {
    if (phoneNumbers.length === 0) return [];
    return this.prisma.invitationGroup.findMany({
      where: {
        eventId,
        cancelledAt: null,
        phoneE164: { in: [...phoneNumbers] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, phoneE164: true },
    });
  }

  public async completeValidation(
    identity: ImportJobIdentity,
    validation: ValidationPersistence,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.importJob.findFirst({
          where: {
            id: identity.importJobId,
            eventId: identity.eventId,
            revision: identity.expectedRevision,
            status: "VALIDATING",
          },
          select: { id: true },
        });
        if (!current) return false;

        for (const chunk of chunks(validation.rows, 100)) {
          const results = await Promise.all(
            chunk.map((row) =>
              transaction.importRow.updateMany({
                where: {
                  id: row.id,
                  importJobId: identity.importJobId,
                  eventId: identity.eventId,
                },
                data: rowUpdate(row, now),
              }),
            ),
          );
          if (results.some((result) => result.count !== 1)) {
            throw new StaleImportWriteError();
          }
        }

        const updated = await transaction.importJob.updateMany({
          where: {
            id: identity.importJobId,
            eventId: identity.eventId,
            revision: identity.expectedRevision,
            status: "VALIDATING",
          },
          data: {
            status: validation.status,
            totalRows: validation.rows.length,
            validRows: validation.validRows,
            invalidRows: validation.invalidRows,
            duplicateRows: validation.duplicateRows,
            skippedRows: 0,
            validatedAt: now,
            reviewingAt: now,
            readyAt: validation.status === "READY" ? now : null,
            failedAt: null,
            failureCode: null,
            failureMessage: null,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new StaleImportWriteError();
        return true;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof StaleImportWriteError) return false;
      throw error;
    }
  }

  public async markFailed(
    identity: ImportJobIdentity,
    failure: { code: string; message: string },
    now: Date,
  ): Promise<void> {
    await this.prisma.importJob.updateMany({
      where: {
        id: identity.importJobId,
        eventId: identity.eventId,
        revision: identity.expectedRevision,
        status: {
          notIn: ["CANCELLED", "IMPORTING", "COMPLETED", "FAILED"],
        },
      },
      data: {
        status: "FAILED",
        failureCode: failure.code,
        failureMessage: failure.message,
        failedAt: now,
        revision: { increment: 1 },
      },
    });
  }
}

function rowUpdate(
  row: ValidatedRowPersistence,
  now: Date,
): Prisma.ImportRowUncheckedUpdateManyInput {
  const normalized = row.normalized;
  return {
    status: row.status,
    validationErrors: asJson(row.errors),
    validationWarnings: asJson(row.warnings),
    normalizedHash: row.normalizedHash,
    duplicateResolution: null,
    duplicateOfRowId: row.duplicateOfRowId,
    duplicateInvitationGroupId: row.duplicateInvitationGroupId,
    validatedAt: now,
    ...(normalized
      ? {
          displayName: normalized.displayName,
          contactName: normalized.contactName,
          phoneInput: row.phoneInput,
          phoneCountry: normalized.phoneCountry,
          phoneE164: normalized.phoneE164,
          invitationType: normalized.invitationType,
          maxCompanions: normalized.maxCompanions,
          members: asJson(normalized.members),
          internalNote: normalized.internalNote,
        }
      : { phoneE164: null }),
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

class StaleImportWriteError extends Error {}
