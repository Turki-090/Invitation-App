import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreateExportInput,
  ExportDownloadQuery,
  ExportJob as ExportJobContract,
  ListExportJobsQuery,
  ListExportJobsResponse,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import { Permission } from "@dawah/domain";
import type { PrivateObjectStorage } from "@dawah/storage";
import type {
  ExportJob as PersistedExportJob,
  StoredAsset,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { PRIVATE_OBJECT_STORAGE } from "../storage/storage.constants";
import { ExportsQueueService } from "./exports-queue.service";

type ExportWithAsset = PersistedExportJob & {
  readonly outputAsset: StoredAsset | null;
};

export interface ExportDownload {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
}

const supportedContentTypes = new Set([
  "text/csv; charset=utf-8",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

@Injectable()
export class ExportsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(ExportsQueueService) private readonly queue: ExportsQueueService,
    @Inject(PRIVATE_OBJECT_STORAGE)
    private readonly storage: PrivateObjectStorage,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async create(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateExportInput,
  ): Promise<ExportJobContract> {
    const { user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_EXPORT,
    );
    const job = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.exportJob.create({
        data: {
          eventId,
          requestedByUserId: user.id,
          format: input.format,
          preset: input.preset,
        },
        include: { outputAsset: true },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "export.requested",
          targetType: "ExportJob",
          targetId: created.id,
          metadata: { format: input.format, preset: input.preset },
        },
      });
      return created;
    });

    try {
      await this.queue.enqueue({ eventId, exportJobId: job.id });
    } catch {
      await this.markQueueFailure(job.id, eventId, user.id);
      throw new ServiceUnavailableException({
        code: "EXPORT_QUEUE_UNAVAILABLE",
        message: "The export request was saved but could not be queued.",
      });
    }
    return this.toContract(job);
  }

  public async list(
    principal: AuthPrincipal,
    eventId: string,
    query: ListExportJobsQuery,
  ): Promise<ListExportJobsResponse> {
    const { user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_EXPORT,
    );
    const where = {
      eventId,
      requestedByUserId: user.id,
      ...(query.status ? { status: query.status } : {}),
    } as const;
    const [items, totalItems] = await Promise.all([
      this.prisma.exportJob.findMany({
        where,
        include: { outputAsset: true },
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.exportJob.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toContract(item)),
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
    exportJobId: string,
  ): Promise<ExportJobContract> {
    const { user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_EXPORT,
    );
    return this.toContract(
      await this.findOwnedJob(eventId, exportJobId, user.id),
    );
  }

  public async download(
    principal: AuthPrincipal,
    eventId: string,
    exportJobId: string,
    query: ExportDownloadQuery,
  ): Promise<ExportDownload> {
    const { user } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_EXPORT,
    );
    const job = await this.findOwnedJob(eventId, exportJobId, user.id);
    const asset = job.outputAsset;
    if (
      job.status !== "COMPLETED" ||
      !job.expiresAt ||
      job.expiresAt.getTime() <= Date.now() ||
      !asset ||
      asset.status !== "READY" ||
      asset.deletedAt !== null ||
      !asset.isPrivate ||
      !asset.sha256 ||
      !asset.contentType ||
      !supportedContentTypes.has(asset.contentType) ||
      !this.verifyDownloadSignature(job, asset, query)
    ) {
      this.throwNotFound();
    }

    let object: Awaited<ReturnType<PrivateObjectStorage["getObject"]>>;
    try {
      object = await this.storage.getObject({
        bucket: asset.bucket,
        key: asset.objectKey,
      });
    } catch {
      throw this.unavailable();
    }
    if (
      !object ||
      object.body.byteLength !== asset.byteSize ||
      (object.contentType !== undefined &&
        object.contentType !== asset.contentType) ||
      createHash("sha256").update(object.body).digest("hex") !== asset.sha256
    ) {
      throw this.unavailable();
    }
    return {
      body: object.body,
      contentType: asset.contentType,
      filename: asset.originalFilename,
    };
  }

  private async findOwnedJob(
    eventId: string,
    exportJobId: string,
    requestedByUserId: string,
  ): Promise<ExportWithAsset> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportJobId, eventId, requestedByUserId },
      include: { outputAsset: true },
    });
    if (!job) this.throwNotFound();
    return job;
  }

  private toContract(job: ExportWithAsset): ExportJobContract {
    const now = new Date();
    const expired =
      job.expiresAt !== null && job.expiresAt.getTime() <= now.getTime();
    const status =
      expired && job.status === "COMPLETED" ? "EXPIRED" : job.status;
    const asset = status === "COMPLETED" ? job.outputAsset : null;
    return {
      id: job.id,
      eventId: job.eventId,
      format: job.format,
      preset: job.preset,
      status,
      rowCount: job.rowCount,
      output:
        asset?.contentType && asset.sha256 && asset.byteSize
          ? {
              filename: asset.originalFilename,
              contentType: asset.contentType,
              byteSize: asset.byteSize,
              sha256: asset.sha256,
              downloadUrl: this.signedDownloadUrl(job, asset, now),
            }
          : null,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      requestedAt: job.requestedAt.toISOString(),
      processingAt: job.processingAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      failedAt: job.failedAt?.toISOString() ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
    };
  }

  private signedDownloadUrl(
    job: ExportWithAsset,
    asset: StoredAsset,
    now: Date,
  ): string {
    const maximumExpiry =
      Math.floor(now.getTime() / 1_000) + this.downloadTtlSeconds();
    const jobExpiry = Math.floor((job.expiresAt?.getTime() ?? 0) / 1_000);
    const expires = Math.min(maximumExpiry, jobExpiry);
    const signature = this.downloadSignature(job, asset, expires);
    return `/api/v1/events/${encodeURIComponent(job.eventId)}/exports/${encodeURIComponent(job.id)}/download?expires=${expires}&signature=${signature}`;
  }

  private verifyDownloadSignature(
    job: ExportWithAsset,
    asset: StoredAsset,
    query: ExportDownloadQuery,
  ): boolean {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (
      query.expires <= nowSeconds ||
      query.expires > nowSeconds + this.downloadTtlSeconds() ||
      query.expires > Math.floor((job.expiresAt?.getTime() ?? 0) / 1_000)
    ) {
      return false;
    }
    const expected = Buffer.from(
      this.downloadSignature(job, asset, query.expires),
      "hex",
    );
    const submitted = Buffer.from(query.signature, "hex");
    return (
      expected.byteLength === submitted.byteLength &&
      timingSafeEqual(expected, submitted)
    );
  }

  private downloadSignature(
    job: ExportWithAsset,
    asset: StoredAsset,
    expires: number,
  ): string {
    return createHmac("sha256", this.signingSecret())
      .update(`${job.eventId}:${job.id}:${asset.id}:${asset.sha256}:${expires}`)
      .digest("hex");
  }

  private signingSecret(): string {
    return this.config.get("EXPORT_DOWNLOAD_SIGNING_SECRET", { infer: true });
  }

  private downloadTtlSeconds(): number {
    return this.config.get("EXPORT_DOWNLOAD_URL_TTL_SECONDS", { infer: true });
  }

  private async markQueueFailure(
    exportJobId: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const failedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.exportJob.updateMany({
        where: { id: exportJobId, eventId, status: "QUEUED" },
        data: {
          status: "FAILED",
          failedAt,
          failureCode: "EXPORT_QUEUE_UNAVAILABLE",
          failureMessage: "The export queue was unavailable.",
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: userId,
          actorType: "SYSTEM",
          action: "export.failed",
          targetType: "ExportJob",
          targetId: exportJobId,
          metadata: { failureCode: "EXPORT_QUEUE_UNAVAILABLE" },
        },
      });
    });
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      code: "EXPORT_NOT_FOUND",
      message: "The export does not exist or is not accessible.",
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: "EXPORT_FILE_UNAVAILABLE",
      message: "The export file is temporarily unavailable.",
    });
  }
}
