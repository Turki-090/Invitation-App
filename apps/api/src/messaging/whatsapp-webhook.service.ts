import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WhatsappWebhookAcknowledgement } from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import {
  MetaWebhookPayloadError,
  parseMetaWebhookPayload,
  verifyMetaWebhookSignature,
} from "@dawah/messaging";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sha256 } from "../preparation/invitation-source-hash";
import { MessagingQueueService } from "./messaging-queue.service";

@Injectable()
export class WhatsappWebhookService {
  private readonly appSecret: string;
  private readonly verifyToken: string;
  private readonly phoneNumberId: string;

  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingQueueService)
    private readonly queue: MessagingQueueService,
    @Inject(ConfigService)
    config: ConfigService<ApiEnvironment, true>,
  ) {
    this.appSecret = config.get("META_WHATSAPP_APP_SECRET", { infer: true });
    this.verifyToken = config.get("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", {
      infer: true,
    });
    this.phoneNumberId = config.get("META_WHATSAPP_PHONE_NUMBER_ID", {
      infer: true,
    });
  }

  public verifyChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    if (
      mode !== "subscribe" ||
      !token ||
      !challenge ||
      !constantTimeTextEqual(token, this.verifyToken)
    ) {
      throw new UnauthorizedException({
        code: "WEBHOOK_VERIFICATION_FAILED",
        message: "Webhook verification failed.",
      });
    }
    return challenge;
  }

  public async ingest(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    payload: unknown,
  ): Promise<WhatsappWebhookAcknowledgement> {
    if (
      !rawBody ||
      !verifyMetaWebhookSignature(rawBody, signature, this.appSecret)
    ) {
      throw new UnauthorizedException({
        code: "WEBHOOK_SIGNATURE_INVALID",
        message: "Webhook signature verification failed.",
      });
    }
    let events;
    try {
      events = parseMetaWebhookPayload(payload, {
        phoneNumberId: this.phoneNumberId,
      });
    } catch (error) {
      if (error instanceof MetaWebhookPayloadError) {
        throw new BadRequestException({
          code: "WEBHOOK_PAYLOAD_INVALID",
          message: "The webhook payload is malformed or unsupported.",
        });
      }
      throw error;
    }
    if (events.length === 0) {
      return { accepted: true, queuedEvents: 0, duplicateEvents: 0 };
    }
    const payloadHash = sha256(rawBody);
    const staleProcessingStartedAt = new Date(Date.now() - 5 * 60 * 1_000);
    const ids = new Map(
      events.map((event) => [event.providerEventId, randomUUID()]),
    );
    const created = await this.prisma.webhookEvent.createMany({
      data: events.map((event) => ({
        id: ids.get(event.providerEventId)!,
        provider: "META_WHATSAPP",
        providerEventId: event.providerEventId,
        eventType:
          event.kind === "STATUS"
            ? `MESSAGE_${event.status}`
            : "MESSAGE_RESPONSE",
        status: "RECEIVED",
        payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
        payloadHash,
        occurredAt: event.occurredAt,
      })),
      skipDuplicates: true,
    });
    const persisted = await this.prisma.webhookEvent.findMany({
      where: {
        provider: "META_WHATSAPP",
        providerEventId: {
          in: events.map(({ providerEventId }) => providerEventId),
        },
        OR: [
          { status: { in: ["RECEIVED", "QUEUED", "FAILED"] } },
          {
            status: "PROCESSING",
            processingStartedAt: { lte: staleProcessingStartedAt },
          },
        ],
      },
      select: { id: true },
    });
    const queuedAt = new Date();
    await this.prisma.webhookEvent.updateMany({
      where: {
        id: { in: persisted.map(({ id }) => id) },
        OR: [
          { status: { in: ["RECEIVED", "FAILED"] } },
          {
            status: "PROCESSING",
            processingStartedAt: { lte: staleProcessingStartedAt },
          },
        ],
      },
      data: {
        status: "QUEUED",
        queuedAt,
        processingStartedAt: null,
        processedAt: null,
        processingError: null,
      },
    });
    try {
      await this.queue.enqueueWebhooks(persisted.map(({ id }) => id));
    } catch {
      throw new ServiceUnavailableException({
        code: "WEBHOOK_QUEUE_UNAVAILABLE",
        message: "Webhook processing is temporarily unavailable.",
      });
    }
    return {
      accepted: true,
      queuedEvents: persisted.length,
      duplicateEvents: events.length - created.count,
    };
  }
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftHash = sha256(left);
  const rightHash = sha256(right);
  return timingSafeEqual(
    Buffer.from(leftHash, "hex"),
    Buffer.from(rightHash, "hex"),
  );
}
