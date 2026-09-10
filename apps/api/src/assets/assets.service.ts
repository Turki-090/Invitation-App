import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AssetUploadFields,
  ListAssetsQuery,
  ListAssetsResponse,
  StoredAsset,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import { Permission, type Permission as PermissionValue } from "@dawah/domain";
import {
  generateEventImageObjectKey,
  generateInvitationAssetObjectKey,
  type PrivateObjectStorage,
} from "@dawah/storage";
import type {
  Event,
  StoredAsset as PersistedStoredAsset,
} from "@prisma/client";
import sharp from "sharp";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { PRIVATE_OBJECT_STORAGE } from "../storage/storage.constants";

type SupportedImage = {
  extension: ".jpg" | ".jpeg" | ".png" | ".webp";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  format: "jpeg" | "png" | "webp";
};

const supportedImages: readonly SupportedImage[] = [
  { extension: ".jpg", mediaType: "image/jpeg", format: "jpeg" },
  { extension: ".jpeg", mediaType: "image/jpeg", format: "jpeg" },
  { extension: ".png", mediaType: "image/png", format: "png" },
  { extension: ".webp", mediaType: "image/webp", format: "webp" },
];

@Injectable()
export class AssetsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(PRIVATE_OBJECT_STORAGE)
    private readonly storage: PrivateObjectStorage,
  ) {}

  public async list(
    principal: AuthPrincipal,
    eventId: string,
    query: ListAssetsQuery,
  ): Promise<ListAssetsResponse> {
    await this.access.resolve(principal, eventId, Permission.EVENT_VIEW);
    const items = await this.prisma.storedAsset.findMany({
      where: {
        eventId,
        kind: query.kind
          ? query.kind
          : { in: ["EVENT_IMAGE", "INVITATION_ASSET"] },
        ...(query.includeArchived ? {} : { deletedAt: null }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { items: items.map((asset) => this.toContract(asset)) };
  }

  public async upload(
    principal: AuthPrincipal,
    eventId: string,
    fields: AssetUploadFields,
    file?: Express.Multer.File,
  ): Promise<StoredAsset> {
    const permission = this.writePermission(fields.kind);
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      permission,
    );
    this.assertEventWritable(event);
    if (!file) {
      throw new BadRequestException({
        code: "ASSET_FILE_REQUIRED",
        message: "Attach one image in the file field.",
      });
    }
    const maximumFileBytes = this.config.get("ASSET_MAX_FILE_BYTES", {
      infer: true,
    });
    if (file.size <= 0 || file.size > maximumFileBytes) {
      throw new BadRequestException({
        code: "ASSET_FILE_SIZE_INVALID",
        message: `The image must be between 1 and ${maximumFileBytes} bytes.`,
      });
    }

    const filename = this.validateFilename(file.originalname);
    const supported = this.identifyImage(filename, file.mimetype, file.buffer);
    const sanitized = await this.sanitizeImage(file.buffer, supported);
    const assetId = randomUUID();
    const bucket = this.config.get("STORAGE_PRIVATE_BUCKET", { infer: true });
    const objectKey =
      fields.kind === "EVENT_IMAGE"
        ? generateEventImageObjectKey({ eventId, filename })
        : generateInvitationAssetObjectKey({
            eventId,
            templateId: assetId,
            filename,
          });
    const checksum = createHash("sha256").update(sanitized.body).digest("hex");
    await this.storage.putObject({
      bucket,
      key: objectKey,
      body: sanitized.body,
      contentType: supported.mediaType,
      metadata: { "event-id": eventId, "asset-id": assetId, sha256: checksum },
    });

    try {
      const asset = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.storedAsset.create({
          data: {
            id: assetId,
            eventId,
            createdBy: user.id,
            kind: fields.kind,
            status: "READY",
            storageProvider: "s3-compatible",
            bucket,
            objectKey,
            originalFilename: filename,
            contentType: supported.mediaType,
            byteSize: sanitized.body.byteLength,
            sha256: checksum,
            imageWidth: sanitized.width,
            imageHeight: sanitized.height,
            uploadedAt: new Date(),
            validatedAt: new Date(),
            metadata: { originalSizeBytes: file.size, sanitized: true },
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "asset.uploaded",
            targetType: "StoredAsset",
            targetId: assetId,
            metadata: {
              kind: fields.kind,
              mediaType: supported.mediaType,
              width: sanitized.width,
              height: sanitized.height,
              sizeBytes: sanitized.body.byteLength,
              checksumSha256: checksum,
            },
          },
        });
        return created;
      });
      return this.toContract(asset);
    } catch (error) {
      await this.storage
        .deleteObject({ bucket, key: objectKey })
        .catch(() => undefined);
      throw error;
    }
  }

  public async content(
    principal: AuthPrincipal,
    eventId: string,
    assetId: string,
  ): Promise<{ body: Uint8Array; mediaType: string }> {
    await this.access.resolve(principal, eventId, Permission.EVENT_VIEW);
    const asset = await this.findAsset(eventId, assetId);
    if (asset.deletedAt || asset.status !== "READY") this.throwNotFound();
    const object = await this.storage.getObject({
      bucket: asset.bucket,
      key: asset.objectKey,
    });
    if (!object) this.throwNotFound();
    return {
      body: object.body,
      mediaType: asset.contentType ?? "application/octet-stream",
    };
  }

  public async archive(
    principal: AuthPrincipal,
    eventId: string,
    assetId: string,
  ): Promise<StoredAsset> {
    await this.access.resolve(principal, eventId, Permission.EVENT_VIEW);
    const existing = await this.findAsset(eventId, assetId);
    const { event, user } = await this.access.resolve(
      principal,
      eventId,
      this.writePermission(existing.kind),
    );
    this.assertEventWritable(event);
    if (existing.deletedAt) return this.toContract(existing);
    const archived = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "stored_assets"
        WHERE "id" = ${assetId}::uuid AND "event_id" = ${eventId}::uuid
        FOR UPDATE
      `;
      const locked = await transaction.storedAsset.findFirstOrThrow({
        where: { id: assetId, eventId },
      });
      if (locked.deletedAt) return this.toContract(locked);
      const inUse = await transaction.invitationTemplate.count({
        where: { assetId, eventId, status: { not: "ARCHIVED" } },
      });
      const retainedBySnapshots =
        await transaction.invitationContentSnapshot.count({
          where: { assetId, eventId },
        });
      if (inUse > 0 || retainedBySnapshots > 0) {
        throw new ConflictException({
          code: "ASSET_IN_USE",
          message:
            retainedBySnapshots > 0
              ? "This image is retained by immutable invitation snapshots and cannot be archived."
              : "Archive templates that use this image before archiving it.",
        });
      }
      const archived = await transaction.storedAsset.update({
        where: { id: assetId },
        data: { status: "DELETED", deletedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "asset.archived",
          targetType: "StoredAsset",
          targetId: assetId,
          metadata: { kind: existing.kind },
        },
      });
      return this.toContract(archived);
    });
    await this.storage
      .deleteObject({ bucket: existing.bucket, key: existing.objectKey })
      .catch(() => undefined);
    return archived;
  }

  private async sanitizeImage(
    bytes: Buffer,
    image: SupportedImage,
  ): Promise<{ body: Uint8Array; width: number; height: number }> {
    const maximumPixels = this.config.get("ASSET_MAX_IMAGE_PIXELS", {
      infer: true,
    });
    try {
      const source = sharp(bytes, {
        failOn: "error",
        limitInputPixels: maximumPixels,
        sequentialRead: true,
      });
      const metadata = await source.metadata();
      if (
        metadata.format !== image.format ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) !== 1 ||
        metadata.width * metadata.height > maximumPixels
      ) {
        throw new Error("Image metadata does not match the accepted format.");
      }
      const pipeline = source.rotate();
      const output =
        image.format === "jpeg"
          ? pipeline.jpeg({ quality: 92, mozjpeg: true })
          : image.format === "png"
            ? pipeline.png({ compressionLevel: 9 })
            : pipeline.webp({ quality: 92 });
      const result = await output.toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height) throw new Error("No size");
      return {
        body: new Uint8Array(result.data),
        width: result.info.width,
        height: result.info.height,
      };
    } catch {
      throw new BadRequestException({
        code: "ASSET_IMAGE_INVALID",
        message:
          "The image is malformed, animated, or exceeds dimension limits.",
      });
    }
  }

  private identifyImage(
    filename: string,
    declaredMediaType: string,
    bytes: Uint8Array,
  ): SupportedImage {
    const extension = extname(filename).toLowerCase();
    const mediaType = declaredMediaType.split(";", 1)[0]?.trim().toLowerCase();
    const entry = supportedImages.find(
      (candidate) =>
        candidate.extension === extension && candidate.mediaType === mediaType,
    );
    if (!entry || !this.magicMatches(entry.format, bytes)) {
      throw new BadRequestException({
        code: "ASSET_TYPE_MISMATCH",
        message:
          "Use a JPEG, PNG, or WebP image whose extension and content agree.",
      });
    }
    return entry;
  }

  private magicMatches(
    format: SupportedImage["format"],
    bytes: Uint8Array,
  ): boolean {
    if (format === "jpeg") {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (format === "png") {
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      );
    }
    return (
      bytes.length >= 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  }

  private validateFilename(value: string): string {
    const filename = value.normalize("NFC").trim();
    if (
      filename.length === 0 ||
      filename.length > 255 ||
      filename.includes("/") ||
      filename.includes("\\") ||
      [...filename].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return (
          codePoint <= 0x1f ||
          (codePoint >= 0x7f && codePoint <= 0x9f) ||
          (codePoint >= 0x202a && codePoint <= 0x202e) ||
          (codePoint >= 0x2066 && codePoint <= 0x2069)
        );
      }) ||
      filename === "." ||
      filename === ".."
    ) {
      throw new BadRequestException({
        code: "ASSET_FILENAME_INVALID",
        message: "The original image filename is invalid.",
      });
    }
    return filename;
  }

  private writePermission(kind: string): PermissionValue {
    return kind === "EVENT_IMAGE"
      ? Permission.EVENT_EDIT
      : Permission.INVITATION_SEND;
  }

  private assertEventWritable(event: Event): void {
    if (event.status === "ARCHIVED") {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events are read-only.",
      });
    }
  }

  private async findAsset(
    eventId: string,
    assetId: string,
  ): Promise<PersistedStoredAsset> {
    const asset = await this.prisma.storedAsset.findFirst({
      where: {
        id: assetId,
        eventId,
        kind: { in: ["EVENT_IMAGE", "INVITATION_ASSET"] },
      },
    });
    if (!asset) this.throwNotFound();
    return asset;
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      code: "ASSET_NOT_FOUND",
      message: "The asset does not exist or is not accessible.",
    });
  }

  private toContract(asset: PersistedStoredAsset): StoredAsset {
    if (
      !asset.contentType ||
      !asset.byteSize ||
      !asset.sha256 ||
      !asset.imageWidth ||
      !asset.imageHeight ||
      (asset.kind !== "EVENT_IMAGE" && asset.kind !== "INVITATION_ASSET")
    ) {
      throw new ConflictException({
        code: "ASSET_METADATA_INCOMPLETE",
        message: "The stored image metadata is incomplete.",
      });
    }
    return {
      id: asset.id,
      eventId: asset.eventId,
      kind: asset.kind,
      originalFilename: asset.originalFilename,
      mediaType: asset.contentType as StoredAsset["mediaType"],
      sizeBytes: asset.byteSize,
      checksumSha256: asset.sha256,
      width: asset.imageWidth,
      height: asset.imageHeight,
      createdAt: asset.createdAt.toISOString(),
      archivedAt: asset.deletedAt?.toISOString() ?? null,
    };
  }
}
