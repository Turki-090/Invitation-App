import { createHash } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { verifyWhatsappMediaSignature } from "@dawah/messaging";
import type { PrivateObjectStorage } from "@dawah/storage";
import { PrismaService } from "../prisma/prisma.service";
import { PRIVATE_OBJECT_STORAGE } from "../storage/storage.constants";

const supportedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface WhatsappMediaContent {
  readonly body: Uint8Array;
  readonly mediaType: string;
}

@Injectable()
export class MessagingMediaService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PRIVATE_OBJECT_STORAGE)
    private readonly storage: PrivateObjectStorage,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async content(
    snapshotId: string,
    checksumValue: unknown,
    expiresValue: unknown,
    signatureValue: unknown,
  ): Promise<WhatsappMediaContent> {
    const expiresAtSeconds = strictInteger(expiresValue);
    const assetSha256 = typeof checksumValue === "string" ? checksumValue : "";
    const signature = typeof signatureValue === "string" ? signatureValue : "";
    if (
      !verifyWhatsappMediaSignature({
        snapshotId,
        assetSha256,
        expiresAtSeconds,
        signature,
        secret: this.config.get("META_WHATSAPP_MEDIA_SIGNING_SECRET", {
          infer: true,
        }),
      })
    ) {
      throw this.notFound();
    }
    const snapshot = await this.prisma.invitationContentSnapshot.findUnique({
      where: { id: snapshotId },
      include: { asset: true },
    });
    if (
      !snapshot?.asset ||
      !snapshot.assetId ||
      !snapshot.assetSha256 ||
      snapshot.assetSha256 !== assetSha256 ||
      snapshot.asset.status !== "READY" ||
      snapshot.asset.deletedAt !== null ||
      snapshot.asset.sha256 !== snapshot.assetSha256
    ) {
      throw this.notFound();
    }

    let object: Awaited<ReturnType<PrivateObjectStorage["getObject"]>>;
    try {
      object = await this.storage.getObject({
        bucket: snapshot.asset.bucket,
        key: snapshot.asset.objectKey,
      });
    } catch {
      throw this.unavailable();
    }
    const mediaType = snapshot.asset.contentType;
    if (
      !object ||
      !mediaType ||
      !supportedMediaTypes.has(mediaType) ||
      (object.contentType !== undefined && object.contentType !== mediaType) ||
      object.body.byteLength !== snapshot.asset.byteSize ||
      object.body.byteLength >
        this.config.get("ASSET_MAX_FILE_BYTES", { infer: true }) ||
      createHash("sha256").update(object.body).digest("hex") !==
        snapshot.assetSha256
    ) {
      throw this.unavailable();
    }
    return { body: object.body, mediaType };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "MESSAGE_MEDIA_NOT_FOUND",
      message: "The invitation image link is invalid or expired.",
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: "MESSAGE_MEDIA_UNAVAILABLE",
      message: "The invitation image is temporarily unavailable.",
    });
  }
}

function strictInteger(value: unknown): number {
  if (typeof value !== "string" || !/^\d{10,12}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
