import { createHash } from "node:crypto";
import { reduceMessageDeliveryStatus } from "@dawah/domain";
import {
  createSignedWhatsappMediaUrl,
  type ProviderMessageResult,
} from "@dawah/messaging";
import type { WhatsappSendJobData } from "@dawah/queue";
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  ClaimedMessage,
  SkippedMessage,
  WhatsappSendRepository,
} from "./whatsapp-send-processor";
import type {
  PersistedWebhookEvidence,
  WhatsappWebhookRepository,
} from "./whatsapp-webhook-processor";

export interface PrismaMessagingRepositoryOptions {
  readonly mediaPublicApiBaseUrl: string;
  readonly mediaSigningSecret: string;
  readonly mediaUrlTtlSeconds: number;
  readonly now?: () => Date;
}

export class PrismaMessagingRepository
  implements WhatsappSendRepository, WhatsappWebhookRepository
{
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly options?: PrismaMessagingRepositoryOptions,
  ) {}

  public async prepareBatchDispatch(
    batchId: string,
  ): Promise<readonly string[]> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "send_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE
      `;
      const batch = await transaction.sendBatch.findUnique({
        where: { id: batchId },
      });
      if (
        !batch ||
        ["COMPLETED", "PARTIALLY_FAILED", "FAILED", "CANCELLED"].includes(
          batch.status,
        )
      ) {
        return [];
      }
      await transaction.sendBatch.update({
        where: { id: batchId },
        data: {
          status: "DISPATCHING",
          dispatchStartedAt: batch.dispatchStartedAt ?? new Date(),
        },
      });
      const messages = await transaction.message.findMany({
        where: { sendBatchId: batchId, status: "QUEUED" },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return messages.map(({ id }) => id);
    });
  }

  public async markBatchDispatched(batchId: string): Promise<void> {
    await this.prisma.sendBatch.updateMany({
      where: { id: batchId, status: { in: ["QUEUED", "DISPATCHING"] } },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  }

  public async claimMessage(
    messageId: string,
    maximumAttempts: number,
  ): Promise<ClaimedMessage | SkippedMessage> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "messages" WHERE "id" = ${messageId}::uuid FOR UPDATE
      `;
      const message = await transaction.message.findUnique({
        where: { id: messageId },
        include: {
          contentSnapshot: {
            select: { id: true, assetId: true, assetSha256: true },
          },
        },
      });
      if (!message) return { outcome: "SKIP", reason: "MESSAGE_NOT_FOUND" };
      if (message.status === "SENDING") {
        const now = new Date();
        await transaction.messageAttempt.updateMany({
          where: {
            messageId,
            attemptNumber: message.attemptCount,
            status: "STARTED",
          },
          data: {
            status: "AMBIGUOUS",
            failureClass: "AMBIGUOUS",
            failureCode: "WORKER_INTERRUPTED",
            failureReason:
              "The worker stopped while provider acceptance was uncertain.",
            completedAt: now,
          },
        });
        await transaction.message.update({
          where: { id: messageId },
          data: {
            status: "FAILED",
            failureClass: "AMBIGUOUS",
            failureCode: "WORKER_INTERRUPTED",
            failureReason:
              "The provider outcome is uncertain. Do not retry automatically.",
            failedAt: now,
          },
        });
        await this.updateBatchState(transaction, message.sendBatchId);
        return { outcome: "SKIP", reason: "AMBIGUOUS_PRIOR_ATTEMPT" };
      }
      if (message.status !== "QUEUED") {
        return { outcome: "SKIP", reason: `STATUS_${message.status}` };
      }
      if (message.attemptCount >= maximumAttempts) {
        const now = new Date();
        await transaction.message.update({
          where: { id: messageId },
          data: {
            status: "FAILED",
            failureClass: "TRANSIENT",
            failureCode: "RETRY_LIMIT_REACHED",
            failureReason: "The bounded provider retry limit was reached.",
            failedAt: now,
          },
        });
        await this.updateBatchState(transaction, message.sendBatchId);
        return { outcome: "SKIP", reason: "RETRY_LIMIT_REACHED" };
      }

      const attemptNumber = message.attemptCount + 1;
      const header = this.mediaHeader(message.contentSnapshot);
      const requestFingerprint = fingerprint({
        messageId: message.id,
        provider: message.provider,
        templateName: message.providerTemplateName,
        locale: message.locale,
        variables: message.templateVariables,
        contentHash: message.contentHash,
      });
      const attempt = await transaction.messageAttempt.create({
        data: { messageId, attemptNumber, requestFingerprint },
      });
      await transaction.message.update({
        where: { id: messageId },
        data: {
          status: "SENDING",
          attemptCount: attemptNumber,
          sendingAt: new Date(),
          failureClass: null,
          failureCode: null,
          failureReason: null,
          failedAt: null,
        },
      });
      const parameterOrder = stringArray(message.templateParameterOrder);
      const variables = stringRecord(message.templateVariables);
      return {
        outcome: "SEND",
        messageId,
        attemptId: attempt.id,
        attemptNumber,
        purpose: toPurpose(message.messageType),
        input: {
          logicalMessageId: message.id,
          to: message.recipientPhoneE164,
          templateName: message.providerTemplateName,
          languageCode: message.locale === "ar_SA" ? "ar" : "en",
          bodyParameters: parameterOrder.map((key) => variables[key] ?? ""),
          ...(header ? { header } : {}),
        },
      };
    });
  }

  public async recordAccepted(
    claim: ClaimedMessage,
    result: ProviderMessageResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "messages" WHERE "id" = ${claim.messageId}::uuid FOR UPDATE
      `;
      const message = await transaction.message.findUniqueOrThrow({
        where: { id: claim.messageId },
      });
      const status = reduceMessageDeliveryStatus(message.status, "SENT");
      const providerIdMatches =
        !message.providerMessageId ||
        message.providerMessageId === result.providerMessageId;
      if (!providerIdMatches || message.attemptCount !== claim.attemptNumber) {
        return;
      }
      const isActiveClaim = message.status === "SENDING";
      const transition = await transaction.messageAttempt.updateMany({
        where: { id: claim.attemptId, status: "STARTED" },
        data: {
          status: "ACCEPTED",
          providerMessageId: result.providerMessageId,
          providerHttpStatus: 200,
          responseMetadata: { accepted: true },
          completedAt: result.acceptedAt,
        },
      });
      if (isActiveClaim && transition.count !== 1) return;
      await transaction.message.update({
        where: { id: claim.messageId },
        data: {
          providerMessageId: result.providerMessageId,
          status,
          providerStateAt:
            !message.providerStateAt ||
            result.acceptedAt > message.providerStateAt
              ? result.acceptedAt
              : message.providerStateAt,
          sentAt: message.sentAt ?? result.acceptedAt,
          ...(status === "FAILED"
            ? {}
            : {
                failureClass: null,
                failureCode: null,
                failureReason: null,
                failedAt: null,
              }),
        },
      });
      await this.updateBatchState(transaction, message.sendBatchId);
    });
  }

  public async recordFailure(
    claim: ClaimedMessage,
    failure: {
      readonly failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS";
      readonly providerCode: string;
      readonly httpStatus?: number;
      readonly retryAfterMilliseconds?: number;
      readonly retry: boolean;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "messages" WHERE "id" = ${claim.messageId}::uuid FOR UPDATE
      `;
      const message = await transaction.message.findUniqueOrThrow({
        where: { id: claim.messageId },
      });
      const isActiveClaim =
        message.status === "SENDING" &&
        message.attemptCount === claim.attemptNumber;
      const now = new Date();
      const attemptStatus = failure.retry
        ? "RETRYABLE_FAILURE"
        : failure.failureClass === "AMBIGUOUS"
          ? "AMBIGUOUS"
          : "PERMANENT_FAILURE";
      const reason = safeFailureReason(failure.failureClass);
      const transition = await transaction.messageAttempt.updateMany({
        where: { id: claim.attemptId, status: "STARTED" },
        data: {
          status: attemptStatus,
          failureClass: failure.failureClass,
          failureCode: failure.providerCode,
          failureReason: reason,
          ...(failure.httpStatus === undefined
            ? {}
            : { providerHttpStatus: failure.httpStatus }),
          ...(failure.retryAfterMilliseconds === undefined
            ? {}
            : { retryAfterMilliseconds: failure.retryAfterMilliseconds }),
          completedAt: now,
        },
      });
      if (transition.count !== 1) return;
      if (!isActiveClaim) return;
      await transaction.message.update({
        where: { id: claim.messageId },
        data: failure.retry
          ? {
              status: "QUEUED",
              failureClass: failure.failureClass,
              failureCode: failure.providerCode,
              failureReason: reason,
              failedAt: null,
            }
          : {
              status: "FAILED",
              failureClass: failure.failureClass,
              failureCode: failure.providerCode,
              failureReason: reason,
              failedAt: now,
            },
      });
      await this.updateBatchState(transaction, message.sendBatchId);
    });
  }

  public async recordExhaustedSendJob(
    job: WhatsappSendJobData,
    exhaustedAt = new Date(),
  ): Promise<void> {
    if (job.operation === "DISPATCH_BATCH") {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "messages"
          WHERE "send_batch_id" = ${job.batchId}::uuid
            AND "status" = 'QUEUED'
            AND "attempt_count" = 0
          ORDER BY "id"
          FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "send_batches" WHERE "id" = ${job.batchId}::uuid FOR UPDATE
        `;
        const batch = await transaction.sendBatch.findUnique({
          where: { id: job.batchId },
        });
        if (
          !batch ||
          batch.status === "CANCELLED" ||
          (batch.dispatchStartedAt !== null &&
            batch.dispatchStartedAt > exhaustedAt)
        ) {
          return;
        }
        const now = new Date();
        const failed = await transaction.message.updateMany({
          where: {
            sendBatchId: job.batchId,
            status: "QUEUED",
            attemptCount: 0,
          },
          data: {
            status: "FAILED",
            failureClass: "TRANSIENT",
            failureCode: "DISPATCH_RETRY_EXHAUSTED",
            failureReason:
              "Queue dispatch could not complete. Retry the original batch request.",
            failedAt: now,
          },
        });
        if (failed.count > 0) {
          await transaction.auditLog.create({
            data: {
              eventId: batch.eventId,
              actorType: "SYSTEM",
              action: "send_batch.dispatch_exhausted",
              targetType: "SendBatch",
              targetId: batch.id,
              metadata: { affectedMessages: failed.count },
            },
          });
        }
        await this.updateBatchState(transaction, batch.id);
      });
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "messages" WHERE "id" = ${job.messageId}::uuid FOR UPDATE
      `;
      const message = await transaction.message.findUnique({
        where: { id: job.messageId },
      });
      if (!message || !["QUEUED", "SENDING"].includes(message.status)) return;
      const now = new Date();
      const ambiguous = message.status === "SENDING";
      if (ambiguous) {
        await transaction.messageAttempt.updateMany({
          where: {
            messageId: message.id,
            attemptNumber: message.attemptCount,
            status: "STARTED",
          },
          data: {
            status: "AMBIGUOUS",
            failureClass: "AMBIGUOUS",
            failureCode: "JOB_RETRY_EXHAUSTED",
            failureReason:
              "The worker outcome is uncertain after queue retries were exhausted.",
            completedAt: now,
          },
        });
      }
      await transaction.message.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          failureClass: ambiguous ? "AMBIGUOUS" : "TRANSIENT",
          failureCode: "JOB_RETRY_EXHAUSTED",
          failureReason: ambiguous
            ? "The provider outcome is uncertain. Do not retry automatically."
            : "Message processing could not complete after bounded queue retries.",
          failedAt: now,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: message.eventId,
          actorType: "SYSTEM",
          action: "message.job_exhausted",
          targetType: "Message",
          targetId: message.id,
          metadata: { failureClass: ambiguous ? "AMBIGUOUS" : "TRANSIENT" },
        },
      });
      await this.updateBatchState(transaction, message.sendBatchId);
    });
  }

  public async claimWebhook(webhookEventId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "webhook_events" WHERE "id" = ${webhookEventId}::uuid FOR UPDATE
      `;
      const webhook = await transaction.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });
      if (!webhook || ["PROCESSED", "IGNORED"].includes(webhook.status)) {
        return { outcome: "SKIP" as const };
      }
      const evidence = parseEvidence(webhook.payload);
      await transaction.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          processingError: null,
        },
      });
      return { outcome: "PROCESS" as const, evidence };
    });
  }

  public async applyWebhook(
    webhookEventId: string,
    evidence: PersistedWebhookEvidence,
  ): Promise<"APPLIED" | "IGNORED"> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "webhook_events" WHERE "id" = ${webhookEventId}::uuid FOR UPDATE
      `;
      const webhook = await transaction.webhookEvent.findUnique({
        where: { id: webhookEventId },
        select: { status: true },
      });
      if (!webhook || ["PROCESSED", "IGNORED"].includes(webhook.status)) {
        return "IGNORED";
      }
      const providerMessageId =
        evidence.kind === "STATUS"
          ? evidence.providerMessageId
          : evidence.contextProviderMessageId;
      if (!providerMessageId) {
        await markWebhookIgnored(transaction, webhookEventId);
        return "IGNORED";
      }
      let message = await transaction.message.findFirst({
        where: { provider: "META_WHATSAPP", providerMessageId },
      });
      if (!message && evidence.kind === "STATUS" && evidence.logicalMessageId) {
        message = await transaction.message.findFirst({
          where: {
            id: evidence.logicalMessageId,
            provider: "META_WHATSAPP",
            OR: [{ providerMessageId: null }, { providerMessageId }],
          },
        });
      }
      if (!message) {
        await markWebhookIgnored(transaction, webhookEventId);
        return "IGNORED";
      }
      await transaction.$queryRaw`
        SELECT "id" FROM "messages" WHERE "id" = ${message.id}::uuid FOR UPDATE
      `;
      const current = await transaction.message.findUniqueOrThrow({
        where: { id: message.id },
      });
      const incomingStatus =
        evidence.kind === "RESPONSE" ? "RESPONDED" : evidence.status;
      const status = reduceMessageDeliveryStatus(
        current.status,
        incomingStatus,
      );
      const data: Prisma.MessageUpdateInput = {
        status,
        providerMessageId: current.providerMessageId ?? providerMessageId,
        providerStateAt:
          !current.providerStateAt ||
          evidence.occurredAt > current.providerStateAt
            ? evidence.occurredAt
            : current.providerStateAt,
      };
      if (evidence.kind === "RESPONSE") {
        data.respondedAt = current.respondedAt ?? evidence.occurredAt;
      } else if (evidence.status === "SENT") {
        data.sentAt = current.sentAt ?? evidence.occurredAt;
      } else if (evidence.status === "DELIVERED") {
        data.deliveredAt = current.deliveredAt ?? evidence.occurredAt;
      } else if (evidence.status === "READ") {
        data.readAt = current.readAt ?? evidence.occurredAt;
      } else if (evidence.status === "FAILED" && status === "FAILED") {
        data.failedAt = current.failedAt ?? evidence.occurredAt;
        data.failureClass = "PERMANENT";
        data.failureCode = evidence.failureCode ?? "PROVIDER_DELIVERY_FAILED";
        data.failureReason =
          evidence.failureReason ?? "The provider reported delivery failure.";
      }
      if (status !== "FAILED" && current.status === "FAILED") {
        data.failureClass = null;
        data.failureCode = null;
        data.failureReason = null;
        data.failedAt = null;
      }
      await transaction.message.update({ where: { id: message.id }, data });
      await transaction.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          eventId: message.eventId,
          messageId: message.id,
          status: "PROCESSED",
          processedAt: new Date(),
          processingError: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: message.eventId,
          actorType: "PROVIDER",
          action: "message.webhook_applied",
          targetType: "Message",
          targetId: message.id,
          metadata: {
            provider: "META_WHATSAPP",
            evidenceType: evidence.kind,
            resultingStatus: status,
            ...(evidence.kind === "STATUS" && evidence.failureCode
              ? { failureCode: evidence.failureCode }
              : {}),
          },
        },
      });
      await this.updateBatchState(transaction, message.sendBatchId);
      return "APPLIED";
    });
  }

  public async recordWebhookFailure(webhookEventId: string): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { id: webhookEventId, status: "PROCESSING" },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        processingError: "Webhook processing failed and is safe to retry.",
      },
    });
  }

  private mediaHeader(snapshot: {
    readonly id: string;
    readonly assetId: string | null;
    readonly assetSha256: string | null;
  }) {
    if (!snapshot.assetId) return undefined;
    if (!snapshot.assetSha256 || !this.options) {
      throw new Error(
        "An asset-backed message requires immutable media-link configuration.",
      );
    }
    return {
      kind: "IMAGE_LINK" as const,
      url: createSignedWhatsappMediaUrl({
        publicApiBaseUrl: this.options.mediaPublicApiBaseUrl,
        snapshotId: snapshot.id,
        assetSha256: snapshot.assetSha256,
        secret: this.options.mediaSigningSecret,
        ttlSeconds: this.options.mediaUrlTtlSeconds,
        ...(this.options.now ? { now: this.options.now() } : {}),
      }),
    };
  }

  private async updateBatchState(
    transaction: Prisma.TransactionClient,
    batchId: string,
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT "id" FROM "send_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE
    `;
    const batch = await transaction.sendBatch.findUnique({
      where: { id: batchId },
    });
    const rows = await transaction.message.groupBy({
      by: ["status"],
      where: { sendBatchId: batchId },
      _count: { _all: true },
    });
    if (!batch || batch.status === "CANCELLED") return;
    const counts = new Map(rows.map((row) => [row.status, row._count._all]));
    const active = (counts.get("QUEUED") ?? 0) + (counts.get("SENDING") ?? 0);
    if (active > 0) {
      await transaction.sendBatch.update({
        where: { id: batchId },
        data: {
          status: "IN_PROGRESS",
          startedAt: batch.startedAt ?? new Date(),
        },
      });
      return;
    }
    const failed = counts.get("FAILED") ?? 0;
    await transaction.sendBatch.update({
      where: { id: batchId },
      data: {
        status:
          failed === batch.totalMessages
            ? "FAILED"
            : failed > 0
              ? "PARTIALLY_FAILED"
              : "COMPLETED",
        startedAt: batch.startedAt ?? new Date(),
        completedAt: batch.completedAt ?? new Date(),
      },
    });
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
    .join(",")}}`;
}

function stringArray(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error("Stored message parameter order is invalid.");
  }
  return value;
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored message variables are invalid.");
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function toPurpose(value: string): ClaimedMessage["purpose"] {
  if (value === "REMINDER") return "REMINDER";
  if (value === "RSVP_CONFIRMATION") return "RSVP_CONFIRMATION";
  return "INVITATION";
}

function safeFailureReason(
  failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS",
): string {
  if (failureClass === "TRANSIENT") {
    return "The provider temporarily rejected the message.";
  }
  if (failureClass === "AMBIGUOUS") {
    return "The provider outcome is uncertain. Do not retry automatically.";
  }
  return "The provider rejected this message. Review the template and destination.";
}

function parseEvidence(value: Prisma.JsonValue): PersistedWebhookEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored webhook evidence is invalid.");
  }
  if (value.kind === "STATUS") {
    if (
      typeof value.providerMessageId !== "string" ||
      !["SENT", "DELIVERED", "READ", "FAILED"].includes(String(value.status)) ||
      typeof value.occurredAt !== "string"
    ) {
      throw new Error("Stored status webhook evidence is invalid.");
    }
    return {
      kind: "STATUS",
      providerMessageId: value.providerMessageId,
      ...(typeof value.logicalMessageId === "string"
        ? { logicalMessageId: value.logicalMessageId }
        : {}),
      status: value.status as "SENT" | "DELIVERED" | "READ" | "FAILED",
      occurredAt: validDate(value.occurredAt),
      ...(typeof value.failureCode === "string"
        ? { failureCode: value.failureCode }
        : {}),
      ...(typeof value.failureReason === "string"
        ? { failureReason: value.failureReason }
        : {}),
    };
  }
  if (value.kind === "RESPONSE" && typeof value.occurredAt === "string") {
    return {
      kind: "RESPONSE",
      occurredAt: validDate(value.occurredAt),
      responseType:
        value.responseType === "BUTTON" || value.responseType === "TEXT"
          ? value.responseType
          : "UNKNOWN",
      ...(typeof value.contextProviderMessageId === "string"
        ? { contextProviderMessageId: value.contextProviderMessageId }
        : {}),
      ...(typeof value.responseValue === "string"
        ? { responseValue: value.responseValue }
        : {}),
    };
  }
  throw new Error("Stored webhook evidence is invalid.");
}

function validDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("Stored webhook timestamp is invalid.");
  return date;
}

async function markWebhookIgnored(
  transaction: Prisma.TransactionClient,
  webhookEventId: string,
): Promise<void> {
  await transaction.webhookEvent.update({
    where: { id: webhookEventId },
    data: { status: "IGNORED", processedAt: new Date(), processingError: null },
  });
}
