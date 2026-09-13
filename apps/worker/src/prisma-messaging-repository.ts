import { createHash } from "node:crypto";
import {
  evaluateGuestRsvpPolicy,
  hasPermission,
  InvitationInvariantError,
  mapInvitationReplyAction,
  MembershipRole,
  Permission,
  reduceMessageDeliveryStatus,
  RsvpReplyActionMappingKind,
  type PermissionConfiguration,
} from "@dawah/domain";
import {
  createSignedWhatsappMediaUrl,
  type ProviderMessageResult,
} from "@dawah/messaging";
import type { WhatsappSendJobData } from "@dawah/queue";
import {
  Prisma,
  PrismaClient,
  type MessageStatus,
  type SendBatch,
  type SendBatchStatus,
} from "@prisma/client";
import type {
  ClaimedMessage,
  ClaimedRsvpConfirmation,
  DeferredMessage,
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
  readonly rsvpConfirmationTemplateAr?: string;
  readonly rsvpConfirmationTemplateEn?: string;
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

      if (message.messageType === "REMINDER") {
        const ineligibleReason = await this.reminderClaimIneligibility(
          transaction,
          message,
        );
        if (ineligibleReason) {
          const cancelledAt = this.options?.now?.() ?? new Date();
          await transaction.message.update({
            where: { id: message.id },
            data: { status: "CANCELLED", cancelledAt },
          });
          await transaction.reminderRecipientState.deleteMany({
            where: { lastReminderMessageId: message.id },
          });
          await transaction.auditLog.create({
            data: {
              eventId: message.eventId,
              actorType: "SYSTEM",
              action: "reminder_message.cancelled_before_send",
              targetType: "Message",
              targetId: message.id,
              metadata: { reasonCode: ineligibleReason },
            },
          });
          await this.updateBatchState(transaction, message.sendBatchId);
          return { outcome: "SKIP", reason: ineligibleReason };
        }
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
      const quickReplyPayloads = snapshotReplyActionIds(
        message.renderedContent,
      );
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
          ...(quickReplyPayloads.length === 0 ? {} : { quickReplyPayloads }),
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

  public async listQueuedRsvpConfirmationIds(
    limit = 100,
  ): Promise<readonly string[]> {
    const confirmations = await this.prisma.rsvpConfirmation.findMany({
      where: { status: { in: ["PENDING", "QUEUED"] } },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(limit, 500)),
    });
    return confirmations.map(({ id }) => id);
  }

  public async claimRsvpConfirmation(
    confirmationId: string,
    maximumAttempts: number,
  ): Promise<ClaimedRsvpConfirmation | SkippedMessage | DeferredMessage> {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.rsvpConfirmation.findUnique({
        where: { id: confirmationId },
        select: { invitationGroupId: true },
      });
      if (!target) {
        return { outcome: "SKIP", reason: "CONFIRMATION_NOT_FOUND" };
      }
      await transaction.$queryRaw`
        SELECT "id" FROM "invitation_groups"
        WHERE "id" = ${target.invitationGroupId}::uuid
        FOR UPDATE
      `;
      await transaction.$queryRaw`
        SELECT "id" FROM "rsvp_confirmations"
        WHERE "id" = ${confirmationId}::uuid
        FOR UPDATE
      `;
      const confirmation = await transaction.rsvpConfirmation.findUnique({
        where: { id: confirmationId },
      });
      if (!confirmation) {
        return { outcome: "SKIP", reason: "CONFIRMATION_NOT_FOUND" };
      }
      if (confirmation.status === "SENDING") {
        const now = new Date();
        await transaction.rsvpConfirmation.update({
          where: { id: confirmation.id },
          data: {
            status: "FAILED",
            failureClass: "AMBIGUOUS",
            failureCode: "WORKER_INTERRUPTED",
            failureReason:
              "The provider outcome is uncertain. Do not retry automatically.",
            failedAt: now,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId: confirmation.eventId,
            actorType: "SYSTEM",
            action: "rsvp_confirmation.ambiguous",
            targetType: "RsvpConfirmation",
            targetId: confirmation.id,
            metadata: { reason: "WORKER_INTERRUPTED" },
          },
        });
        return { outcome: "SKIP", reason: "AMBIGUOUS_PRIOR_ATTEMPT" };
      }
      if (!["PENDING", "QUEUED"].includes(confirmation.status)) {
        return { outcome: "SKIP", reason: `STATUS_${confirmation.status}` };
      }
      const newer = await transaction.rsvpConfirmation.findFirst({
        where: {
          invitationGroupId: confirmation.invitationGroupId,
          sequence: { gt: confirmation.sequence },
        },
        select: { id: true },
        orderBy: { sequence: "desc" },
      });
      if (newer) {
        const now = new Date();
        await transaction.rsvpConfirmation.update({
          where: { id: confirmation.id },
          data: {
            status: "FAILED",
            failureClass: "PERMANENT",
            failureCode: "SUPERSEDED_BY_NEWER_RESPONSE",
            failureReason:
              "A newer RSVP confirmation replaced this unsent response.",
            failedAt: now,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId: confirmation.eventId,
            actorType: "SYSTEM",
            action: "rsvp_confirmation.superseded",
            targetType: "RsvpConfirmation",
            targetId: confirmation.id,
            metadata: { newerConfirmationId: newer.id },
          },
        });
        return { outcome: "SKIP", reason: "SUPERSEDED_BY_NEWER_RESPONSE" };
      }
      const earlierSending = await transaction.rsvpConfirmation.findFirst({
        where: {
          invitationGroupId: confirmation.invitationGroupId,
          id: { not: confirmation.id },
          status: "SENDING",
          sequence: { lt: confirmation.sequence },
        },
        select: { id: true },
      });
      if (earlierSending) {
        return {
          outcome: "DEFER",
          reason: "EARLIER_CONFIRMATION_SENDING",
        };
      }
      if (confirmation.attemptCount >= maximumAttempts) {
        const now = new Date();
        await transaction.rsvpConfirmation.update({
          where: { id: confirmation.id },
          data: {
            status: "FAILED",
            failureClass: "TRANSIENT",
            failureCode: "RETRY_LIMIT_REACHED",
            failureReason: "The bounded provider retry limit was reached.",
            failedAt: now,
          },
        });
        return { outcome: "SKIP", reason: "RETRY_LIMIT_REACHED" };
      }

      const attemptNumber = confirmation.attemptCount + 1;
      await transaction.rsvpConfirmation.update({
        where: { id: confirmation.id },
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
      const parameterOrder = stringArray(confirmation.templateParameterOrder);
      const variables = stringRecord(confirmation.templateVariables);
      return {
        outcome: "SEND",
        confirmationId: confirmation.id,
        attemptNumber,
        input: {
          logicalMessageId: confirmation.id,
          to: confirmation.recipientPhoneE164,
          templateName: confirmation.providerTemplateName,
          languageCode: confirmation.locale === "ar_SA" ? "ar" : "en",
          bodyParameters: parameterOrder.map((key) => variables[key] ?? ""),
        },
      };
    });
  }

  public async recordRsvpConfirmationAccepted(
    claim: ClaimedRsvpConfirmation,
    result: ProviderMessageResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "rsvp_confirmations"
        WHERE "id" = ${claim.confirmationId}::uuid
        FOR UPDATE
      `;
      const confirmation = await transaction.rsvpConfirmation.findUnique({
        where: { id: claim.confirmationId },
      });
      if (
        !confirmation ||
        confirmation.status !== "SENDING" ||
        confirmation.attemptCount !== claim.attemptNumber
      ) {
        return;
      }
      await transaction.rsvpConfirmation.update({
        where: { id: confirmation.id },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          sentAt: result.acceptedAt,
          failureClass: null,
          failureCode: null,
          failureReason: null,
          failedAt: null,
        },
      });
    });
  }

  public async recordRsvpConfirmationFailure(
    claim: ClaimedRsvpConfirmation,
    failure: {
      readonly failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS";
      readonly providerCode: string;
      readonly retry: boolean;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "rsvp_confirmations"
        WHERE "id" = ${claim.confirmationId}::uuid
        FOR UPDATE
      `;
      const confirmation = await transaction.rsvpConfirmation.findUnique({
        where: { id: claim.confirmationId },
      });
      if (
        !confirmation ||
        confirmation.status !== "SENDING" ||
        confirmation.attemptCount !== claim.attemptNumber
      ) {
        return;
      }
      const now = new Date();
      await transaction.rsvpConfirmation.update({
        where: { id: confirmation.id },
        data: failure.retry
          ? {
              status: "QUEUED",
              queuedAt: now,
              failureClass: failure.failureClass,
              failureCode: failure.providerCode,
              failureReason: safeFailureReason(failure.failureClass),
              failedAt: null,
            }
          : {
              status: "FAILED",
              failureClass: failure.failureClass,
              failureCode: failure.providerCode,
              failureReason: safeFailureReason(failure.failureClass),
              failedAt: now,
            },
      });
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

    if (job.operation === "SEND_RSVP_CONFIRMATION") {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "rsvp_confirmations"
          WHERE "id" = ${job.confirmationId}::uuid
          FOR UPDATE
        `;
        const confirmation = await transaction.rsvpConfirmation.findUnique({
          where: { id: job.confirmationId },
        });
        if (
          !confirmation ||
          !["PENDING", "QUEUED", "SENDING"].includes(confirmation.status)
        ) {
          return;
        }
        const ambiguous = confirmation.status === "SENDING";
        await transaction.rsvpConfirmation.update({
          where: { id: confirmation.id },
          data: {
            status: "FAILED",
            failureClass: ambiguous ? "AMBIGUOUS" : "TRANSIENT",
            failureCode: "JOB_RETRY_EXHAUSTED",
            failureReason: ambiguous
              ? "The provider outcome is uncertain. Do not retry automatically."
              : "Confirmation processing could not complete after bounded queue retries.",
            failedAt: exhaustedAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId: confirmation.eventId,
            actorType: "SYSTEM",
            action: "rsvp_confirmation.job_exhausted",
            targetType: "RsvpConfirmation",
            targetId: confirmation.id,
            metadata: {
              failureClass: ambiguous ? "AMBIGUOUS" : "TRANSIENT",
            },
          },
        });
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
        select: { status: true, ingestionSequence: true },
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
      const rsvpOutcome =
        evidence.kind === "RESPONSE"
          ? await this.applyWhatsappRsvp(
              transaction,
              webhookEventId,
              webhook.ingestionSequence,
              current,
              evidence,
            )
          : null;
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
            ...(rsvpOutcome ? { rsvpOutcome } : {}),
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

  private async applyWhatsappRsvp(
    transaction: Prisma.TransactionClient,
    webhookEventId: string,
    webhookIngestionSequence: bigint,
    message: {
      readonly id: string;
      readonly eventId: string;
      readonly invitationGroupId: string;
      readonly locale: "ar_SA" | "en";
      readonly recipientPhoneE164: string;
      readonly renderedContent: Prisma.JsonValue;
    },
    evidence: Extract<PersistedWebhookEvidence, { readonly kind: "RESPONSE" }>,
  ): Promise<string> {
    if (evidence.responseType !== "BUTTON" || !evidence.responseValue) {
      return "NO_MAPPABLE_ACTION";
    }
    const snapshot = readRsvpSnapshot(
      message.renderedContent,
      evidence.responseValue,
    );
    if (!snapshot) return "NO_MAPPABLE_ACTION";

    await transaction.$queryRaw`
      SELECT "id" FROM "invitation_groups"
      WHERE "id" = ${message.invitationGroupId}::uuid
        AND "event_id" = ${message.eventId}::uuid
      FOR UPDATE
    `;
    const invitation = await transaction.invitationGroup.findFirst({
      where: {
        id: message.invitationGroupId,
        eventId: message.eventId,
      },
      include: {
        event: true,
        members: { orderBy: [{ position: "asc" }, { id: "asc" }] },
        rsvp: { include: { members: true } },
      },
    });
    if (!invitation || invitation.cancelledAt) return "INVITATION_UNAVAILABLE";

    if (
      snapshot.binding.invitationId !== invitation.id ||
      snapshot.binding.invitationType !== invitation.invitationType ||
      snapshot.binding.maxCompanions !== invitation.maxCompanions ||
      !sameStrings(
        snapshot.binding.memberIds,
        invitation.members.map(({ id }) => id),
      )
    ) {
      return "STALE_INVITATION_SNAPSHOT";
    }

    let mapping: ReturnType<typeof mapInvitationReplyAction>;
    try {
      mapping = mapInvitationReplyAction({
        invitationType: invitation.invitationType,
        members: invitation.members,
        maxCompanions: invitation.maxCompanions,
        actionId: evidence.responseValue,
      });
    } catch (error) {
      if (error instanceof InvitationInvariantError) return error.code;
      throw error;
    }
    if (mapping.kind === RsvpReplyActionMappingKind.MEMBER_SELECTION_REQUIRED) {
      return "MEMBER_SELECTION_REQUIRED";
    }

    if (
      snapshot.action.attendingMemberCount !== mapping.attendingMemberCount ||
      snapshot.action.companionCount !== mapping.companionCount ||
      snapshot.action.expectedAttendeeCount !== mapping.expectedAttendeeCount
    ) {
      return "STALE_INVITATION_SNAPSHOT";
    }

    if (
      invitation.rsvp &&
      (evidence.occurredAt.getTime() < invitation.rsvp.respondedAt.getTime() ||
        (evidence.occurredAt.getTime() ===
          invitation.rsvp.respondedAt.getTime() &&
          (invitation.rsvp.responseWebhookSequence === null ||
            webhookIngestionSequence <=
              invitation.rsvp.responseWebhookSequence)))
    ) {
      return "STALE_RSVP_RESPONSE";
    }

    const policy = evaluateGuestRsvpPolicy({
      eventStatus: invitation.event.status,
      currentDate: dateInTimeZone(
        evidence.occurredAt,
        invitation.event.timezone,
      ),
      rsvpDeadline: invitation.event.rsvpDeadline
        ? invitation.event.rsvpDeadline.toISOString().slice(0, 10)
        : null,
      allowRsvpEdits: invitation.event.allowRsvpEdits,
      hasExistingRsvp: invitation.rsvp !== null,
    });
    if (
      (!invitation.rsvp && !policy.canRespond) ||
      (invitation.rsvp && !policy.canEdit)
    ) {
      return `POLICY_${policy.reason}`;
    }

    const keyHash = fingerprint({ source: "WHATSAPP", webhookEventId });
    const requestHash = fingerprint({
      actionId: mapping.actionId,
      attendingMemberIds: [...mapping.attendingMemberIds],
      companionCount: mapping.companionCount,
    });
    const existingSubmission = await transaction.rsvpSubmission.findUnique({
      where: {
        invitationGroupId_source_keyHash: {
          invitationGroupId: invitation.id,
          source: "WHATSAPP",
          keyHash,
        },
      },
    });
    if (existingSubmission) {
      return existingSubmission.requestHash === requestHash
        ? "IDEMPOTENT_REPLAY"
        : "IDEMPOTENCY_CONFLICT";
    }

    const attendingIds = new Set(mapping.attendingMemberIds);
    const previousAttendingMemberIds = invitation.members
      .filter((member) =>
        invitation.rsvp?.members.some(
          (response) =>
            response.guestMemberId === member.id && response.attending,
        ),
      )
      .map(({ id }) => id);
    const previousResponse = {
      status: invitation.rsvp?.status ?? "PENDING",
      attendingMemberIds: previousAttendingMemberIds,
      companionCount: invitation.rsvp?.companionCount ?? 0,
      expectedAttendees: invitation.expectedAttendees,
    } satisfies Prisma.InputJsonObject;
    const newResponse = {
      status: mapping.status,
      attendingMemberIds: [...mapping.attendingMemberIds],
      companionCount: mapping.companionCount,
      expectedAttendees: mapping.expectedAttendeeCount,
    } satisfies Prisma.InputJsonObject;
    const unchanged =
      fingerprint(previousResponse) === fingerprint(newResponse) &&
      invitation.rsvp !== null;
    if (unchanged) {
      await transaction.rsvp.update({
        where: { invitationGroupId: invitation.id },
        data: {
          source: "WHATSAPP",
          respondedAt: evidence.occurredAt,
          responseWebhookSequence: webhookIngestionSequence,
        },
      });
      await transaction.rsvpSubmission.create({
        data: {
          invitationGroupId: invitation.id,
          source: "WHATSAPP",
          keyHash,
          requestHash,
          response: newResponse,
        },
      });
      return "NO_CHANGE";
    }

    const rsvp = await transaction.rsvp.upsert({
      where: { invitationGroupId: invitation.id },
      create: {
        invitationGroupId: invitation.id,
        status: mapping.status,
        companionCount: mapping.companionCount,
        source: "WHATSAPP",
        respondedAt: evidence.occurredAt,
        responseWebhookSequence: webhookIngestionSequence,
      },
      update: {
        status: mapping.status,
        companionCount: mapping.companionCount,
        source: "WHATSAPP",
        respondedAt: evidence.occurredAt,
        responseWebhookSequence: webhookIngestionSequence,
      },
    });
    await transaction.rsvpMember.deleteMany({ where: { rsvpId: rsvp.id } });
    await transaction.rsvpMember.createMany({
      data: invitation.members.map((member) => ({
        invitationGroupId: invitation.id,
        rsvpId: rsvp.id,
        guestMemberId: member.id,
        attending: attendingIds.has(member.id),
      })),
    });
    await transaction.invitationGroup.update({
      where: { id: invitation.id },
      data: {
        rsvpStatus: mapping.status,
        expectedAttendees: mapping.expectedAttendeeCount,
      },
    });
    const history = await transaction.rsvpHistory.create({
      data: {
        invitationGroupId: invitation.id,
        previousStatus: previousResponse.status,
        newStatus: mapping.status,
        previousCount: previousResponse.expectedAttendees,
        newCount: mapping.expectedAttendeeCount,
        previousResponse,
        newResponse,
        source: "WHATSAPP",
        actorReference: message.id,
      },
    });
    const now = new Date();
    const variables = {
      guest_name: snapshot.recipientName,
      rsvp_status: localizedRsvpStatus(mapping.status, message.locale),
      expected_attendees: String(mapping.expectedAttendeeCount),
    } satisfies Prisma.InputJsonObject;
    await transaction.rsvpConfirmation.updateMany({
      where: {
        invitationGroupId: invitation.id,
        status: { in: ["PENDING", "QUEUED"] },
      },
      data: {
        status: "FAILED",
        failureClass: "PERMANENT",
        failureCode: "SUPERSEDED_BY_NEWER_RESPONSE",
        failureReason:
          "A newer RSVP confirmation replaced this unsent response.",
        failedAt: evidence.occurredAt,
      },
    });
    const confirmation = await transaction.rsvpConfirmation.create({
      data: {
        eventId: invitation.eventId,
        invitationGroupId: invitation.id,
        rsvpHistoryId: history.id,
        status: "QUEUED",
        recipientPhoneE164: message.recipientPhoneE164,
        locale: message.locale,
        providerTemplateName: this.confirmationTemplate(message.locale),
        templateVariables: variables,
        templateParameterOrder: [
          "guest_name",
          "rsvp_status",
          "expected_attendees",
        ],
        queuedAt: now,
      },
    });
    await transaction.rsvpSubmission.create({
      data: {
        invitationGroupId: invitation.id,
        rsvpHistoryId: history.id,
        source: "WHATSAPP",
        keyHash,
        requestHash,
        response: newResponse,
      },
    });
    await transaction.auditLog.create({
      data: {
        eventId: invitation.eventId,
        actorType: "PROVIDER",
        action: invitation.rsvp ? "rsvp.edited" : "rsvp.created",
        targetType: "InvitationGroup",
        targetId: invitation.id,
        metadata: {
          source: "WHATSAPP",
          historyId: history.id,
          confirmationId: confirmation.id,
          providerOccurredAt: evidence.occurredAt.toISOString(),
          previousStatus: previousResponse.status,
          newStatus: mapping.status,
          previousExpectedAttendees: previousResponse.expectedAttendees,
          newExpectedAttendees: mapping.expectedAttendeeCount,
        },
      },
    });
    return "RSVP_APPLIED";
  }

  private confirmationTemplate(locale: "ar_SA" | "en"): string {
    if (locale === "ar_SA") {
      return (
        this.options?.rsvpConfirmationTemplateAr ?? "dawah_rsvp_confirmation_ar"
      );
    }
    return (
      this.options?.rsvpConfirmationTemplateEn ?? "dawah_rsvp_confirmation_en"
    );
  }

  private async reminderClaimIneligibility(
    transaction: Prisma.TransactionClient,
    message: {
      readonly id: string;
      readonly eventId: string;
      readonly invitationGroupId: string;
      readonly templateId: string;
    },
  ): Promise<string | null> {
    await transaction.$queryRaw`
      SELECT "id" FROM "invitation_groups"
      WHERE "id" = ${message.invitationGroupId}::uuid
        AND "event_id" = ${message.eventId}::uuid
      FOR SHARE
    `;
    const [invitation, latestInitial, template, recipientState] =
      await Promise.all([
        transaction.invitationGroup.findFirst({
          where: {
            id: message.invitationGroupId,
            eventId: message.eventId,
          },
          include: { event: { select: { status: true } } },
        }),
        transaction.message.findFirst({
          where: {
            eventId: message.eventId,
            invitationGroupId: message.invitationGroupId,
            messageType: "INVITATION",
          },
          select: { status: true, sentAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        transaction.invitationTemplate.findFirst({
          where: {
            id: message.templateId,
            eventId: message.eventId,
            purpose: "REMINDER",
            status: "APPROVED",
            provider: "META_WHATSAPP",
            providerTemplateName: { not: null },
          },
          select: { id: true },
        }),
        transaction.reminderRecipientState.findUnique({
          where: {
            eventId_invitationGroupId: {
              eventId: message.eventId,
              invitationGroupId: message.invitationGroupId,
            },
          },
          select: { lastReminderMessageId: true },
        }),
      ]);

    if (!invitation || invitation.event.status !== "RSVP_OPEN") {
      return "EVENT_NOT_REMINDABLE";
    }
    if (invitation.cancelledAt) return "INVITATION_CANCELLED";
    if (invitation.rsvpStatus !== "PENDING") return "RSVP_NOT_PENDING";
    if (
      !latestInitial ||
      !latestInitial.sentAt ||
      !["SENT", "DELIVERED", "READ", "RESPONDED"].includes(latestInitial.status)
    ) {
      return "INITIAL_INVITATION_NOT_SENT";
    }
    if (!template) return "TEMPLATE_NOT_APPROVED";
    if (!recipientState) return "REMINDER_STATE_MISSING";
    if (recipientState.lastReminderMessageId !== message.id) {
      return "SUPERSEDED_BY_NEWER_REMINDER";
    }
    return null;
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
    const cancelled = counts.get("CANCELLED") ?? 0;
    const terminalStatus: SendBatchStatus =
      failed === batch.totalMessages
        ? "FAILED"
        : failed > 0
          ? "PARTIALLY_FAILED"
          : "COMPLETED";
    const completedAt = batch.completedAt ?? new Date();
    await transaction.sendBatch.update({
      where: { id: batchId },
      data: {
        status: terminalStatus,
        startedAt: batch.startedAt ?? new Date(),
        completedAt,
      },
    });
    await transaction.reminderRun.updateMany({
      where: { sendBatchId: batchId },
      data: { status: terminalStatus, completedAt },
    });
    if (batch.status !== terminalStatus) {
      await transaction.auditLog.create({
        data: {
          eventId: batch.eventId,
          actorType: "SYSTEM",
          action:
            batch.messageType === "REMINDER"
              ? "reminder_run.completed"
              : "send_batch.completed",
          targetType: "SendBatch",
          targetId: batch.id,
          metadata: {
            messageType: batch.messageType,
            status: terminalStatus,
            totalMessages: batch.totalMessages,
            failedMessages: failed,
            cancelledMessages: cancelled,
          },
        },
      });
    }
    await this.createBatchNotifications(
      transaction,
      batch,
      terminalStatus,
      counts,
    );
  }

  private async createBatchNotifications(
    transaction: Prisma.TransactionClient,
    batch: Pick<SendBatch, "id" | "eventId" | "messageType" | "totalMessages">,
    status: SendBatchStatus,
    counts: ReadonlyMap<MessageStatus, number>,
  ): Promise<void> {
    const requiredPermission =
      batch.messageType === "REMINDER"
        ? Permission.REMINDER_SEND
        : Permission.INVITATION_SEND;
    const memberships = await transaction.eventMembership.findMany({
      where: { eventId: batch.eventId, status: "ACTIVE" },
      select: { userId: true, role: true, permissionsJson: true },
    });
    const recipients = memberships.filter((membership) =>
      hasPermission(
        membership.role as MembershipRole,
        requiredPermission,
        permissionConfiguration(membership.permissionsJson),
      ),
    );
    if (recipients.length === 0) return;
    const failedMessages = counts.get("FAILED") ?? 0;
    const kind =
      status === "FAILED" || status === "PARTIALLY_FAILED"
        ? ("MESSAGE_BATCH_FAILED" as const)
        : batch.messageType === "REMINDER"
          ? ("REMINDER_BATCH_COMPLETED" as const)
          : ("MESSAGE_BATCH_COMPLETED" as const);
    await transaction.notification.createMany({
      data: recipients.map(({ userId }) => ({
        eventId: batch.eventId,
        userId,
        kind,
        sourceType: "SendBatch",
        sourceId: batch.id,
        data: {
          batchId: batch.id,
          messageType: batch.messageType,
          status,
          totalMessages: batch.totalMessages,
          failedMessages,
          cancelledMessages: counts.get("CANCELLED") ?? 0,
        },
      })),
      skipDuplicates: true,
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

const knownPermissions = new Set<string>(Object.values(Permission));

function permissionConfiguration(
  value: Prisma.JsonValue,
): PermissionConfiguration {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is (typeof Permission)[keyof typeof Permission] =>
        typeof entry === "string" && knownPermissions.has(entry),
    );
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.mode === "CUSTOM" &&
    Array.isArray(value.permissions)
  ) {
    return {
      mode: "CUSTOM",
      permissions: value.permissions.filter(
        (entry): entry is (typeof Permission)[keyof typeof Permission] =>
          typeof entry === "string" && knownPermissions.has(entry),
      ),
    };
  }
  return [];
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

interface SnapshottedRsvpContext {
  readonly recipientName: string;
  readonly binding: {
    readonly invitationId: string;
    readonly invitationType: string;
    readonly memberIds: readonly string[];
    readonly maxCompanions: number;
  };
  readonly action: {
    readonly attendingMemberCount: number | null;
    readonly companionCount: number | null;
    readonly expectedAttendeeCount: number | null;
  };
}

function snapshotReplyActionIds(
  renderedContent: Prisma.JsonValue,
): readonly string[] {
  if (
    typeof renderedContent !== "object" ||
    renderedContent === null ||
    Array.isArray(renderedContent) ||
    !Array.isArray(renderedContent.replyActions)
  ) {
    return [];
  }
  const ids = renderedContent.replyActions.map((action) => {
    if (
      typeof action !== "object" ||
      action === null ||
      Array.isArray(action) ||
      typeof action.id !== "string" ||
      !/^[A-Z0-9_]{1,128}$/.test(action.id)
    ) {
      throw new Error("Stored message reply actions are invalid.");
    }
    return action.id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("Stored message reply action IDs must be unique.");
  }
  return ids;
}

function readRsvpSnapshot(
  renderedContent: Prisma.JsonValue,
  actionId: string,
): SnapshottedRsvpContext | null {
  if (
    typeof renderedContent !== "object" ||
    renderedContent === null ||
    Array.isArray(renderedContent)
  ) {
    return null;
  }
  const binding = renderedContent.rsvpBinding;
  if (
    typeof binding !== "object" ||
    binding === null ||
    Array.isArray(binding) ||
    binding.version !== 1 ||
    typeof binding.invitationId !== "string" ||
    typeof binding.invitationType !== "string" ||
    typeof binding.maxCompanions !== "number" ||
    !Number.isSafeInteger(binding.maxCompanions) ||
    binding.maxCompanions < 0 ||
    !Array.isArray(binding.memberIds) ||
    binding.memberIds.length === 0 ||
    !binding.memberIds.every(
      (memberId): memberId is string =>
        typeof memberId === "string" && memberId.length > 0,
    ) ||
    typeof renderedContent.recipientName !== "string" ||
    renderedContent.recipientName.trim().length === 0
  ) {
    return null;
  }
  const actions = renderedContent.replyActions;
  if (!Array.isArray(actions)) return null;
  const action = actions.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      !Array.isArray(candidate) &&
      candidate.id === actionId,
  );
  if (typeof action !== "object" || action === null || Array.isArray(action)) {
    return null;
  }
  const attendingMemberCount = snapshotCount(action.attendingMemberCount);
  const companionCount = snapshotCount(action.companionCount);
  const expectedAttendeeCount = snapshotCount(action.expectedAttendeeCount);
  if (!attendingMemberCount || !companionCount || !expectedAttendeeCount) {
    return null;
  }
  return {
    recipientName: renderedContent.recipientName,
    binding: {
      invitationId: binding.invitationId,
      invitationType: binding.invitationType,
      memberIds: binding.memberIds,
      maxCompanions: binding.maxCompanions,
    },
    action: {
      attendingMemberCount: attendingMemberCount.value,
      companionCount: companionCount.value,
      expectedAttendeeCount: expectedAttendeeCount.value,
    },
  };
}

function snapshotCount(
  value: unknown,
): { readonly value: number | null } | null {
  if (value === null) return { value: null };
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? { value }
    : null;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) {
    throw new Error("The event time zone could not be formatted.");
  }
  return `${year}-${month}-${day}`;
}

function localizedRsvpStatus(
  status: "ACCEPTED" | "PARTIALLY_ACCEPTED" | "DECLINED",
  locale: "ar_SA" | "en",
): string {
  if (locale === "en") {
    if (status === "ACCEPTED") return "Attending";
    if (status === "PARTIALLY_ACCEPTED") return "Partially attending";
    return "Not attending";
  }
  if (status === "ACCEPTED") return "حضور مؤكد";
  if (status === "PARTIALLY_ACCEPTED") return "حضور جزئي";
  return "اعتذار عن الحضور";
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
