import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ConfirmImportInput,
  ConfirmImportResult,
  GetImportJobQuery,
  ImportColumnMappingInput,
  ImportIssue,
  ImportJobDetailResponse,
  ImportJobSummary,
  ImportLimits,
  ImportRow,
  ListImportJobsQuery,
  ListImportJobsResponse,
  NormalizedImportInvitation,
  UpdateImportMappingInput,
  UpdateImportRowInput,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import { Permission } from "@dawah/domain";
import { ImportFileError, validateImportUpload } from "@dawah/imports";
import {
  generateImportObjectKey,
  type PrivateObjectStorage,
} from "@dawah/storage";
import {
  Prisma,
  type Event,
  type ImportJob,
  type ImportRow as PersistedImportRow,
  type StoredAsset as PersistedStoredAsset,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { PRIVATE_OBJECT_STORAGE } from "../storage/storage.constants";
import { ImportsQueueService } from "./imports-queue.service";

type ImportJobWithAsset = ImportJob & { sourceAsset: PersistedStoredAsset };
type ImportRowRecord = PersistedImportRow;

const terminalStatuses = new Set(["COMPLETED", "CANCELLED"]);

@Injectable()
export class ImportsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(PRIVATE_OBJECT_STORAGE)
    private readonly storage: PrivateObjectStorage,
    @Inject(ImportsQueueService) private readonly queue: ImportsQueueService,
  ) {}

  public async limits(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<ImportLimits> {
    await this.access.resolve(principal, eventId, Permission.GUEST_IMPORT);
    return {
      acceptedExtensions: [".xlsx", ".csv"],
      maximumFileBytes: this.config.get("IMPORT_MAX_FILE_BYTES", {
        infer: true,
      }),
      maximumRows: this.config.get("IMPORT_MAX_ROWS", { infer: true }),
      maximumColumns: this.config.get("IMPORT_MAX_COLUMNS", { infer: true }),
      maximumCellCharacters: this.config.get("IMPORT_MAX_CELL_CHARACTERS", {
        infer: true,
      }),
    };
  }

  public async upload(
    principal: AuthPrincipal,
    eventId: string,
    file?: Express.Multer.File,
  ): Promise<ImportJobSummary> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_IMPORT,
    );
    this.assertEventWritable(event);
    if (!file) {
      throw new BadRequestException({
        code: "IMPORT_FILE_REQUIRED",
        message: "Attach one .xlsx or .csv file in the file field.",
      });
    }

    let upload;
    try {
      upload = validateImportUpload(
        {
          bytes: file.buffer,
          declaredMediaType: file.mimetype,
          originalFilename: file.originalname,
        },
        {
          maximumFileBytes: this.config.get("IMPORT_MAX_FILE_BYTES", {
            infer: true,
          }),
          maximumRows: this.config.get("IMPORT_MAX_ROWS", { infer: true }),
          maximumColumns: this.config.get("IMPORT_MAX_COLUMNS", {
            infer: true,
          }),
          maximumCellCharacters: this.config.get("IMPORT_MAX_CELL_CHARACTERS", {
            infer: true,
          }),
          maximumWorksheets: 10,
          maximumArchiveEntryBytes: 32 * 1024 * 1024,
          maximumArchiveBytes: 128 * 1024 * 1024,
        },
      );
    } catch (error) {
      if (error instanceof ImportFileError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    const importJobId = randomUUID();
    const assetId = randomUUID();
    const bucket = this.config.get("STORAGE_PRIVATE_BUCKET", { infer: true });
    const objectKey = generateImportObjectKey({
      eventId,
      importId: importJobId,
      filename: upload.normalizedFilename,
    });
    const checksum = createHash("sha256").update(upload.bytes).digest("hex");

    await this.storage.putObject({
      bucket,
      key: objectKey,
      body: upload.bytes,
      contentType: file.mimetype,
      metadata: {
        "event-id": eventId,
        "import-job-id": importJobId,
        sha256: checksum,
      },
    });

    let job: ImportJobWithAsset;
    try {
      job = await this.prisma.$transaction(async (transaction) => {
        const asset = await transaction.storedAsset.create({
          data: {
            id: assetId,
            eventId,
            createdBy: user.id,
            kind: "IMPORT_SOURCE",
            status: "READY",
            storageProvider: "s3-compatible",
            bucket,
            objectKey,
            originalFilename: upload.normalizedFilename,
            contentType: file.mimetype,
            byteSize: upload.bytes.byteLength,
            sha256: checksum,
            uploadedAt: new Date(),
            validatedAt: new Date(),
            metadata: { parserKind: upload.kind },
          },
        });
        const created = await transaction.importJob.create({
          data: {
            id: importJobId,
            eventId,
            sourceAssetId: asset.id,
            createdBy: user.id,
            fileFormat: upload.kind === "xlsx" ? "XLSX" : "CSV",
            status: "UPLOADED",
            queuedAt: new Date(),
          },
          include: { sourceAsset: true },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "import.uploaded",
            targetType: "ImportJob",
            targetId: importJobId,
            metadata: {
              fileFormat: created.fileFormat,
              fileSizeBytes: upload.bytes.byteLength,
              checksumSha256: checksum,
            },
          },
        });
        return created;
      });
    } catch (error) {
      await this.storage
        .deleteObject({ bucket, key: objectKey })
        .catch(() => undefined);
      throw error;
    }

    try {
      await this.queue.enqueue({
        operation: "PARSE",
        eventId,
        importJobId,
        expectedRevision: job.revision,
      });
    } catch {
      await this.markQueueFailure(importJobId, job.revision);
      throw new ServiceUnavailableException({
        code: "IMPORT_QUEUE_UNAVAILABLE",
        message: "The import was stored safely but could not be queued.",
      });
    }
    return this.toSummary(job);
  }

  public async list(
    principal: AuthPrincipal,
    eventId: string,
    query: ListImportJobsQuery,
  ): Promise<ListImportJobsResponse> {
    await this.access.resolve(principal, eventId, Permission.GUEST_IMPORT);
    const where = {
      eventId,
      ...(query.status ? { status: query.status } : {}),
    } as const;
    const [items, totalItems] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        include: { sourceAsset: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.importJob.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toSummary(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async get(
    principal: AuthPrincipal,
    eventId: string,
    importJobId: string,
    query: GetImportJobQuery,
  ): Promise<ImportJobDetailResponse> {
    await this.access.resolve(principal, eventId, Permission.GUEST_IMPORT);
    const job = await this.findJob(this.prisma, eventId, importJobId);
    const where = {
      importJobId,
      eventId,
      ...(query.rowStatus ? { status: query.rowStatus } : {}),
    } as const;
    const [rows, totalItems] = await Promise.all([
      this.prisma.importRow.findMany({
        where,
        orderBy: { sourceRowNumber: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.importRow.count({ where }),
    ]);
    return {
      job: {
        ...this.toSummary(job),
        headers: this.stringArray(job.detectedHeaders),
        suggestedMapping: this.mapping(job.suggestedMapping),
        columnMapping: this.mapping(job.columnMapping),
      },
      rows: rows.map((row) => this.toRow(row)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async updateMapping(
    principal: AuthPrincipal,
    eventId: string,
    importJobId: string,
    input: UpdateImportMappingInput,
  ): Promise<ImportJobSummary> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_IMPORT,
    );
    this.assertEventWritable(event);
    const current = await this.findJob(this.prisma, eventId, importJobId);
    this.assertMutableJob(current);
    this.assertMappingColumns(current, input.mapping);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.importJob.updateMany({
        where: {
          id: importJobId,
          eventId,
          revision: input.expectedVersion,
          status: {
            in: ["AWAITING_MAPPING", "REVIEWING", "READY", "FAILED"],
          },
        },
        data: {
          columnMapping: input.mapping,
          status: "VALIDATING",
          revision: { increment: 1 },
          failureCode: null,
          failureMessage: null,
          failedAt: null,
        },
      });
      if (result.count !== 1) this.throwVersionConflict();
      const job = await transaction.importJob.findUniqueOrThrow({
        where: { id: importJobId },
        include: { sourceAsset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "import.mapping_updated",
          targetType: "ImportJob",
          targetId: importJobId,
          metadata: { mappedFields: Object.keys(input.mapping).sort() },
        },
      });
      return job;
    });
    await this.enqueueValidationOrFail(updated);
    return this.toSummary(updated);
  }

  public async updateRow(
    principal: AuthPrincipal,
    eventId: string,
    importJobId: string,
    rowId: string,
    input: UpdateImportRowInput,
  ): Promise<ImportJobSummary> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_IMPORT,
    );
    this.assertEventWritable(event);
    const current = await this.findJob(this.prisma, eventId, importJobId);
    this.assertMutableJob(current);
    if (!current.columnMapping) {
      throw new ConflictException({
        code: "IMPORT_MAPPING_REQUIRED",
        message: "Map the spreadsheet columns before correcting rows.",
      });
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const jobUpdate = await transaction.importJob.updateMany({
        where: {
          id: importJobId,
          eventId,
          revision: input.expectedJobVersion,
          status: { in: ["REVIEWING", "READY", "FAILED"] },
        },
        data: {
          status: "VALIDATING",
          revision: { increment: 1 },
          failureCode: null,
          failureMessage: null,
          failedAt: null,
        },
      });
      if (jobUpdate.count !== 1) this.throwVersionConflict();

      const row = await transaction.importRow.findFirst({
        where: { id: rowId, importJobId, eventId },
      });
      if (!row) this.throwRowNotFound();
      const previous = this.jsonObject(row.correctedData);
      await transaction.importRow.update({
        where: { id: rowId },
        data: {
          correctedData: { ...previous, ...input.corrections },
          correctedBy: user.id,
          correctedAt: new Date(),
          status: "UNMAPPED",
          validationWarnings: [],
          duplicateResolution: null,
          duplicateOfRowId: null,
          duplicateInvitationGroupId: null,
          revision: { increment: 1 },
        },
      });
      const job = await transaction.importJob.findUniqueOrThrow({
        where: { id: importJobId },
        include: { sourceAsset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "import.row_corrected",
          targetType: "ImportRow",
          targetId: rowId,
          metadata: {
            importJobId,
            sourceRowNumber: row.sourceRowNumber,
            correctedFields: Object.keys(input.corrections).sort(),
          },
        },
      });
      return job;
    });
    await this.enqueueValidationOrFail(updated);
    return this.toSummary(updated);
  }

  public async confirm(
    principal: AuthPrincipal,
    eventId: string,
    importJobId: string,
    input: ConfirmImportInput,
  ): Promise<ConfirmImportResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const { event, user } = await this.access.resolve(
          principal,
          eventId,
          Permission.GUEST_IMPORT,
          transaction,
        );
        this.assertEventWritable(event);
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`import:${eventId}:${importJobId}`}, 0)) IS NULL AS locked
        `;
        const job = await this.findJob(transaction, eventId, importJobId, true);
        if (job.status === "COMPLETED") {
          return this.completedResult(transaction, job);
        }
        if (job.revision !== input.expectedVersion) this.throwVersionConflict();
        if (job.status !== "READY") {
          throw new ConflictException({
            code: "IMPORT_NOT_READY",
            message:
              "The import must have no invalid rows before confirmation.",
          });
        }

        const rows = await transaction.importRow.findMany({
          where: { importJobId, eventId },
          orderBy: { sourceRowNumber: "asc" },
        });
        if (
          rows.length !== job.totalRows ||
          rows.some(
            (row) => row.status !== "VALID" && row.status !== "DUPLICATE",
          )
        ) {
          throw new ConflictException({
            code: "IMPORT_ROWS_NOT_READY",
            message:
              "Every import row must be valid or explicitly reviewed as a duplicate.",
          });
        }

        const candidateRows = rows.filter(
          (row) => row.status === "VALID" || input.duplicatePolicy === "IMPORT",
        );
        const phones = [
          ...new Set(candidateRows.map((row) => row.phoneE164!)),
        ].sort();
        for (const phone of phones) {
          await transaction.$queryRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`${eventId}:${phone}`}, 0)) IS NULL AS locked
          `;
        }
        const existingPhones = new Set(
          (
            await transaction.invitationGroup.findMany({
              where: { eventId, cancelledAt: null, phoneE164: { in: phones } },
              select: { phoneE164: true },
            })
          ).map(({ phoneE164 }) => phoneE164),
        );
        if (
          candidateRows.some(
            (row) =>
              row.status === "VALID" && existingPhones.has(row.phoneE164!),
          )
        ) {
          throw new ConflictException({
            code: "IMPORT_REVALIDATION_REQUIRED",
            message:
              "Guest data changed after validation; validate the import again.",
          });
        }

        await transaction.importJob.update({
          where: { id: importJobId },
          data: { status: "IMPORTING", importStartedAt: new Date() },
        });

        const invitations = candidateRows.map((row) => ({
          id: randomUUID(),
          row,
          normalized: this.requireNormalized(row),
        }));
        if (invitations.length > 0) {
          await transaction.invitationGroup.createMany({
            data: invitations.map(({ id, normalized }) => ({
              id,
              eventId,
              displayName: normalized.displayName,
              contactName: normalized.contactName,
              phoneE164: normalized.phoneE164,
              phoneCountry: normalized.phoneCountry,
              invitationType: normalized.invitationType,
              maxCompanions: normalized.maxCompanions,
              internalNote: normalized.internalNote,
              createdBy: user.id,
            })),
          });
          await transaction.guestMember.createMany({
            data: invitations.flatMap(({ id, normalized }) =>
              normalized.members.map((member, index) => ({
                invitationGroupId: id,
                name: member.name,
                position: index + 1,
                isPrimary: member.isPrimary,
              })),
            ),
          });
          for (const invitation of invitations) {
            await transaction.importRow.update({
              where: { id: invitation.row.id },
              data: {
                status: "IMPORTED",
                importedInvitationGroupId: invitation.id,
                importedAt: new Date(),
                duplicateResolution:
                  invitation.row.status === "DUPLICATE"
                    ? "IMPORT_AS_NEW"
                    : null,
              },
            });
          }
        }

        const skippedRows = rows.filter(
          (row) =>
            row.status === "DUPLICATE" && input.duplicatePolicy === "SKIP",
        );
        if (skippedRows.length > 0) {
          await transaction.importRow.updateMany({
            where: { id: { in: skippedRows.map((row) => row.id) } },
            data: {
              status: "SKIPPED",
              duplicateResolution: "SKIP",
              skippedAt: new Date(),
            },
          });
        }

        const completedAt = new Date();
        await transaction.importJob.update({
          where: { id: importJobId },
          data: {
            status: "COMPLETED",
            confirmedBy: user.id,
            confirmedAt: completedAt,
            completedAt,
            importedRows: invitations.length,
            skippedRows: skippedRows.length,
            revision: { increment: 1 },
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "import.confirmed",
            targetType: "ImportJob",
            targetId: importJobId,
            metadata: {
              importedRows: invitations.length,
              skippedRows: skippedRows.length,
              duplicatePolicy: input.duplicatePolicy,
              duplicateRowsImported: invitations.filter(
                ({ row }) => row.status === "DUPLICATE",
              ).length,
            },
          },
        });
        return {
          importJobId,
          importedRows: invitations.length,
          skippedRows: skippedRows.length,
          duplicateRowsImported: invitations.filter(
            ({ row }) => row.status === "DUPLICATE",
          ).length,
          invitationGroupIds: invitations.map(({ id }) => id),
          completedAt: completedAt.toISOString(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );
  }

  public async cancel(
    principal: AuthPrincipal,
    eventId: string,
    importJobId: string,
  ): Promise<ImportJobSummary> {
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_IMPORT,
    );
    this.assertEventWritable(event);
    const current = await this.findJob(this.prisma, eventId, importJobId);
    if (current.status === "COMPLETED") {
      throw new ConflictException({
        code: "IMPORT_ALREADY_COMPLETED",
        message: "A completed import cannot be cancelled.",
      });
    }
    if (current.status === "CANCELLED") {
      await this.deleteSourceObject(current);
      return this.toSummary(current);
    }

    const cancelled = await this.prisma.$transaction(async (transaction) => {
      const cancelledAt = new Date();
      const result = await transaction.importJob.updateMany({
        where: {
          id: importJobId,
          eventId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "CANCELLED",
          cancelledBy: user.id,
          cancelledAt,
          revision: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: "IMPORT_STATE_CHANGED",
          message: "The import changed while it was being cancelled.",
        });
      }
      await transaction.storedAsset.update({
        where: { id: current.sourceAssetId },
        data: { status: "DELETED", deletedAt: cancelledAt },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "import.cancelled",
          targetType: "ImportJob",
          targetId: importJobId,
        },
      });
      return transaction.importJob.findUniqueOrThrow({
        where: { id: importJobId },
        include: { sourceAsset: true },
      });
    });
    await this.deleteSourceObject(cancelled);
    return this.toSummary(cancelled);
  }

  private async enqueueValidationOrFail(
    job: ImportJobWithAsset,
  ): Promise<void> {
    try {
      await this.queue.enqueue({
        operation: "VALIDATE",
        eventId: job.eventId,
        importJobId: job.id,
        expectedRevision: job.revision,
      });
    } catch {
      await this.markQueueFailure(job.id, job.revision);
      throw new ServiceUnavailableException({
        code: "IMPORT_QUEUE_UNAVAILABLE",
        message: "The changes were saved, but validation could not be queued.",
      });
    }
  }

  private markQueueFailure(
    importJobId: string,
    revision: number,
  ): Promise<unknown> {
    return this.prisma.importJob.updateMany({
      where: { id: importJobId, revision },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureCode: "QUEUE_UNAVAILABLE",
        failureMessage: "The background import queue was unavailable.",
      },
    });
  }

  private async deleteSourceObject(job: ImportJobWithAsset): Promise<void> {
    try {
      await this.storage.deleteObject({
        bucket: job.sourceAsset.bucket,
        key: job.sourceAsset.objectKey,
      });
    } catch {
      // Cancellation is durable even if storage cleanup needs operational retry.
    }
  }

  private async completedResult(
    transaction: Prisma.TransactionClient,
    job: ImportJobWithAsset,
  ): Promise<ConfirmImportResult> {
    const imported = await transaction.importRow.findMany({
      where: { importJobId: job.id, status: "IMPORTED" },
      select: {
        importedInvitationGroupId: true,
        duplicateResolution: true,
      },
      orderBy: { sourceRowNumber: "asc" },
    });
    return {
      importJobId: job.id,
      importedRows: job.importedRows,
      skippedRows: job.skippedRows,
      duplicateRowsImported: imported.filter(
        ({ duplicateResolution }) => duplicateResolution === "IMPORT_AS_NEW",
      ).length,
      invitationGroupIds: imported.flatMap(({ importedInvitationGroupId }) =>
        importedInvitationGroupId ? [importedInvitationGroupId] : [],
      ),
      completedAt: (job.completedAt ?? job.updatedAt).toISOString(),
    };
  }

  private requireNormalized(row: ImportRowRecord): NormalizedImportInvitation {
    const members = this.members(row.members);
    if (
      !row.displayName ||
      !row.contactName ||
      !row.phoneE164 ||
      !row.phoneCountry ||
      !row.invitationType ||
      row.maxCompanions === null ||
      members.length === 0
    ) {
      throw new ConflictException({
        code: "IMPORT_NORMALIZED_DATA_MISSING",
        message: `Validated row ${row.sourceRowNumber} has incomplete normalized data.`,
      });
    }
    return {
      displayName: row.displayName,
      contactName: row.contactName,
      phoneE164: row.phoneE164,
      phoneCountry: row.phoneCountry,
      invitationType: row.invitationType,
      maxCompanions: row.maxCompanions,
      members,
      internalNote: row.internalNote,
    };
  }

  private assertMappingColumns(
    job: ImportJobWithAsset,
    mapping: ImportColumnMappingInput,
  ): void {
    const headers = new Set(this.stringArray(job.detectedHeaders));
    const unknown = Object.values(mapping).filter(
      (column) => !headers.has(column),
    );
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: "IMPORT_MAPPING_COLUMN_UNKNOWN",
        message: "Every mapped column must exist in the parsed header row.",
        details: { columns: [...new Set(unknown)] },
      });
    }
  }

  private assertMutableJob(job: ImportJobWithAsset): void {
    if (terminalStatuses.has(job.status)) {
      throw new ConflictException({
        code: "IMPORT_TERMINAL",
        message: "A completed or cancelled import cannot be changed.",
      });
    }
    if (
      ["PARSING", "VALIDATING", "IMPORTING", "UPLOADED"].includes(job.status)
    ) {
      throw new ConflictException({
        code: "IMPORT_BUSY",
        message: "Wait for the current import operation to finish.",
      });
    }
  }

  private assertEventWritable(event: Event): void {
    if (event.status === "ARCHIVED") {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events are read-only.",
      });
    }
  }

  private findJob(
    client: PrismaService | Prisma.TransactionClient,
    eventId: string,
    importJobId: string,
    includeRows = false,
  ): Promise<ImportJobWithAsset> {
    return client.importJob
      .findFirst({
        where: { id: importJobId, eventId },
        include: { sourceAsset: true, ...(includeRows ? { rows: true } : {}) },
      })
      .then((job) => {
        if (!job) {
          throw new NotFoundException({
            code: "IMPORT_NOT_FOUND",
            message: "The import does not exist or is not accessible.",
          });
        }
        return job;
      });
  }

  private throwVersionConflict(): never {
    throw new ConflictException({
      code: "IMPORT_VERSION_CONFLICT",
      message: "The import changed; refresh before trying again.",
    });
  }

  private throwRowNotFound(): never {
    throw new NotFoundException({
      code: "IMPORT_ROW_NOT_FOUND",
      message: "The import row does not exist or is not accessible.",
    });
  }

  private toSummary(job: ImportJobWithAsset): ImportJobSummary {
    return {
      id: job.id,
      eventId: job.eventId,
      status: job.status,
      originalFilename: job.sourceAsset.originalFilename,
      mediaType: job.sourceAsset.contentType ?? "application/octet-stream",
      fileSizeBytes: job.sourceAsset.byteSize ?? 0,
      worksheetName: job.selectedWorksheet,
      totalRows: job.totalRows,
      validRows: job.validRows,
      invalidRows: job.invalidRows,
      duplicateRows: job.duplicateRows,
      importedRows: job.importedRows,
      skippedRows: job.skippedRows,
      version: job.revision,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
    };
  }

  private toRow(row: ImportRowRecord): ImportRow {
    let normalizedData: NormalizedImportInvitation | null = null;
    try {
      normalizedData = this.requireNormalized(row);
    } catch {
      normalizedData = null;
    }
    return {
      id: row.id,
      rowNumber: row.sourceRowNumber,
      status: row.status,
      sourceData: this.jsonScalarRecord(row.sourceData),
      correctedData: row.correctedData
        ? this.jsonScalarRecord(row.correctedData)
        : null,
      normalizedData,
      errors: this.issues(row.validationErrors),
      warnings: this.issues(row.validationWarnings),
      importedInvitationGroupId: row.importedInvitationGroupId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapping(
    value: Prisma.JsonValue | null,
  ): ImportColumnMappingInput | null {
    if (!value || Array.isArray(value) || typeof value !== "object")
      return null;
    return value as ImportColumnMappingInput;
  }

  private stringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  }

  private jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && !Array.isArray(value) && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  }

  private jsonScalarRecord(
    value: Prisma.JsonValue,
  ): Record<string, string | number | boolean | null> {
    const object = this.jsonObject(value);
    return Object.fromEntries(
      Object.entries(object).filter(
        (entry): entry is [string, string | number | boolean | null] =>
          entry[1] === null ||
          typeof entry[1] === "string" ||
          typeof entry[1] === "number" ||
          typeof entry[1] === "boolean",
      ),
    );
  }

  private issues(value: Prisma.JsonValue): ImportIssue[] {
    return Array.isArray(value) ? (value as ImportIssue[]) : [];
  }

  private members(
    value: Prisma.JsonValue,
  ): NormalizedImportInvitation["members"] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        Array.isArray(entry) ||
        typeof entry.name !== "string" ||
        typeof entry.isPrimary !== "boolean"
      ) {
        return [];
      }
      return [{ name: entry.name, isPrimary: entry.isPrimary }];
    });
  }
}
