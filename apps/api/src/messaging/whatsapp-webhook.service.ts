import { randomUUID } from "node:crypto";
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
  verifyDialog360WebhookToken,
  type MetaWebhookSkipReason,
} from "@dawah/messaging";
import type { Logger } from "@dawah/observability";
import { Prisma } from "@prisma/client";
import { LOGGER } from "../observability/observability.tokens";
import { PrismaService } from "../prisma/prisma.service";
import { sha256 } from "../preparation/invitation-source-hash";
import { MessagingQueueService } from "./messaging-queue.service";

@Injectable()
export class WhatsappWebhookService {
  private readonly webhookToken: string;
  private readonly phoneNumberId: string | undefined;

  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MessagingQueueService)
    private readonly queue: MessagingQueueService,
    @Inject(ConfigService)
    config: ConfigService<ApiEnvironment, true>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.webhookToken = config.get("D360_WEBHOOK_TOKEN", { infer: true });
    this.phoneNumberId = config.get("META_WHATSAPP_PHONE_NUMBER_ID", {
      infer: true,
    });
  }

  public async ingest(
    rawBody: Buffer | undefined,
    webhookToken: string | undefined,
    payload: unknown,
  ): Promise<WhatsappWebhookAcknowledgement> {
    if (
      !rawBody ||
      !verifyDialog360WebhookToken(webhookToken, this.webhookToken)
    ) {
      throw new UnauthorizedException({
        code: "WEBHOOK_TOKEN_INVALID",
        message: "Webhook authentication failed.",
      });
    }
    let events;
    const skipped = new Map<MetaWebhookSkipReason, number>();
    try {
      events = parseMetaWebhookPayload(payload, {
        phoneNumberId: this.phoneNumberId,
        onSkipped: (reason) =>
          skipped.set(reason, (skipped.get(reason) ?? 0) + 1),
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
    if (skipped.size > 0) {
      // Still acknowledged: a rejection would make the provider redeliver the
      // whole POST for days, including the items beside these that did parse.
      this.logger.warn("whatsapp.webhook.items_skipped", {
        skipped: Object.fromEntries(skipped),
        acceptedItems: events.length,
      });
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
