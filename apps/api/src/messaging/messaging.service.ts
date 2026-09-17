import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  CreateSendBatchInput,
  ListSendBatchesQuery,
  ListSendBatchesResponse,
  MessageListQuery,
  MessageSummary,
  ResendMessageInput,
  ResendReadinessResponse,
  SendBatch as SendBatchContract,
  SendBatchDetail,
  SendBatchProgress,
  SendReadinessRequest,
  SendReadinessResponse,
} from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import {
  Prisma,
  type Event,
  type InvitationContentSnapshot,
  type InvitationTemplate,
  type MessageStatus,
  type SendBatch,
  type StoredAsset,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { CreditLedgerService } from "../credits/credit-ledger.service";
import { EventAccessService } from "../events/event-access.service";
import {
  invitationSourceHash,
  sha256,
  stableSerialize,
} from "../preparation/invitation-source-hash";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingQueueService } from "./messaging-queue.service";

const CONFIRMATION_WINDOW_MILLISECONDS = 5 * 60 * 1_000;
const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const INITIAL_SEND_OPERATION = "invitation.send";

type MessagingClient = PrismaService | Prisma.TransactionClient;
type TemplateWithAsset = InvitationTemplate & { asset: StoredAsset | null };
type InvitationWithMembers = Prisma.InvitationGroupGetPayload<{
  include: { members: true };
}>;

interface ReadyInvitation {
  readonly invitation: InvitationWithMembers;
  readonly snapshot: InvitationContentSnapshot;
}

interface SelectionState {
  readonly template: TemplateWithAsset;
  readonly ready: readonly ReadyInvitation[];
  readonly blocked: SendReadinessResponse["blocked"];
  readonly alreadySentInvitationIds: readonly string[];
  readonly selectedInvitationIds: readonly string[];
  readonly stateHash: string;
}

@Injectable()
export class MessagingService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(MessagingQueueService)
    private readonly queue: MessagingQueueService,
    @Inject(CreditLedgerService)
    private readonly credits: CreditLedgerService,
  ) {}

  public async readiness(
    principal: AuthPrincipal,
    eventId: string,
    input: SendReadinessRequest,
  ): Promise<SendReadinessResponse> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_SEND,
    );
    this.assertEventWritable(event);
    const state = await this.selectionState(
      this.prisma,
      event,
      input.templateId,
      input.invitationIds,
    );
    return this.toReadiness(state, this.confirmationExpiry(new Date()));
  }

  public async createBatch(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateSendBatchInput,
    idempotencyKey: string,
  ): Promise<SendBatchContract> {
    const keyHash = sha256(idempotencyKey);
    const requestHash = sha256(
      stableSerialize({ eventId, operation: INITIAL_SEND_OPERATION, input }),
    );
    const outcome = await this.prisma.$transaction(
      async (transaction) => {
        const { event, user } = await this.access.resolve(
          principal,
          eventId,
          Permission.INVITATION_SEND,
          transaction,
        );
        this.assertEventWritable(event);
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`idempotency:${eventId}:${INITIAL_SEND_OPERATION}:${keyHash}`}, 0)) IS NULL AS locked
        `;
        const replay = await this.idempotentReplay(
          transaction,
          eventId,
          INITIAL_SEND_OPERATION,
          keyHash,
          requestHash,
        );
        if (replay) return { batchId: replay, replay: true } as const;

        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`initial-send:${eventId}`}, 0)) IS NULL AS locked
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "events" WHERE "id" = ${eventId}::uuid FOR SHARE
        `;
        const currentEvent = await transaction.event.findUniqueOrThrow({
          where: { id: eventId },
        });
        this.assertEventWritable(currentEvent);
        const state = await this.selectionState(
          transaction,
          currentEvent,
          input.templateId,
          input.invitationIds,
          true,
        );
        const confirmationNow = new Date();
        if (
          !this.confirmationMatches(
            state.stateHash,
            input.confirmationToken,
            confirmationNow,
          )
        ) {
          throw new ConflictException({
            code: "SEND_CONFIRMATION_STALE",
            message:
              "Invitation readiness changed or the confirmation expired. Review the summary again.",
          });
        }
        if (state.ready.length === 0) {
          throw new ConflictException({
            code: "NO_SENDABLE_INVITATIONS",
            message: "There are no newly prepared invitations to send.",
          });
        }

        const now = new Date();
        const batchId = randomUUID();
        const batch = await transaction.sendBatch.create({
          data: {
            id: batchId,
            eventId,
            createdBy: user.id,
            status: "QUEUED",
            messageType: "INVITATION",
            requestHash,
            selectionHash: sha256(stableSerialize(state.selectedInvitationIds)),
            confirmationHash: input.confirmationToken,
            totalMessages: state.ready.length,
            estimatedCreditUnits: state.ready.length,
            queuedAt: now,
          },
        });
        await this.credits.reserveForSendBatch(
          transaction,
          {
            eventId,
            sendBatchId: batchId,
            units: state.ready.length,
            createdByUserId: user.id,
          },
          now,
        );
        await transaction.message.createMany({
          data: state.ready.map(({ invitation, snapshot }) => ({
            id: randomUUID(),
            eventId,
            sendBatchId: batchId,
            invitationGroupId: invitation.id,
            contentSnapshotId: snapshot.id,
            provider: state.template.provider,
            messageType: "INVITATION" as const,
            status: "QUEUED" as const,
            recipientPhoneE164: invitation.phoneE164,
            providerTemplateName: state.template.providerTemplateName!,
            templateId: snapshot.templateId,
            templateVersion: snapshot.templateVersion,
            locale: snapshot.locale,
            templateVariables: snapshot.variables as Prisma.InputJsonValue,
            templateParameterOrder: state.template
              .variableSchema as Prisma.InputJsonValue,
            renderedContent: snapshot.renderedContent as Prisma.InputJsonValue,
            sourceHash: snapshot.sourceHash,
            contentHash: snapshot.contentHash,
            creditUnits: 1,
            queuedAt: now,
          })),
        });
        const initial = this.mapBatch(
          batch,
          this.emptyCounts(batch.totalMessages),
        );
        await transaction.idempotencyRecord.create({
          data: {
            eventId,
            sendBatchId: batchId,
            operation: INITIAL_SEND_OPERATION,
            keyHash,
            requestHash,
            status: "COMPLETED",
            responseStatus: 202,
            responseBody: initial as Prisma.InputJsonValue,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
            completedAt: now,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "send_batch.created",
            targetType: "SendBatch",
            targetId: batchId,
            metadata: {
              messageType: "INVITATION",
              totalMessages: state.ready.length,
              estimatedCreditUnits: state.ready.length,
              blockedInvitations: state.blocked.length,
              alreadySentInvitations: state.alreadySentInvitationIds.length,
            },
          },
        });
        return { batchId, replay: false } as const;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );

    await this.enqueueDurableBatch(outcome.batchId);
    return this.getBatchSummary(principal, eventId, outcome.batchId);
  }

  public async listBatches(
    principal: AuthPrincipal,
    eventId: string,
    query: ListSendBatchesQuery,
  ): Promise<ListSendBatchesResponse> {
    await this.access.resolve(principal, eventId, Permission.INVITATION_SEND);
    const [items, totalItems] = await Promise.all([
      this.prisma.sendBatch.findMany({
        where: { eventId, messageType: "INVITATION" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.sendBatch.count({
        where: { eventId, messageType: "INVITATION" },
      }),
    ]);
    const counts = await this.batchCounts(items.map(({ id }) => id));
    return {
      items: items.map((batch) =>
        this.mapBatch(batch, counts.get(batch.id) ?? new Map()),
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async getBatch(
    principal: AuthPrincipal,
    eventId: string,
    batchId: string,
    query: MessageListQuery,
  ): Promise<SendBatchDetail> {
    await this.access.resolve(principal, eventId, Permission.INVITATION_SEND);
    const batch = await this.findBatch(eventId, batchId);
    const where = {
      eventId,
      sendBatchId: batchId,
      ...(query.status ? { status: query.status } : {}),
    } satisfies Prisma.MessageWhereInput;
    const [messages, totalItems, countMap] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          invitationGroup: { select: { displayName: true } },
          _count: { select: { resends: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.message.count({ where }),
      this.batchCounts([batchId]),
    ]);
    return {
      batch: this.mapBatch(batch, countMap.get(batchId) ?? new Map()),
      messages: messages.map((message) => this.mapMessage(message)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async resendReadiness(
    principal: AuthPrincipal,
    eventId: string,
    messageId: string,
  ): Promise<ResendReadinessResponse> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.INVITATION_RESEND,
    );
    this.assertEventWritable(event);
    return this.buildResendReadiness(this.prisma, event, messageId);
  }

  public async resend(
    principal: AuthPrincipal,
    eventId: string,
    messageId: string,
    input: ResendMessageInput,
    idempotencyKey: string,
  ): Promise<SendBatchContract> {
    const operation = `invitation.resend:${messageId}`;
    const keyHash = sha256(idempotencyKey);
    const requestHash = sha256(
      stableSerialize({ eventId, messageId, operation, input }),
    );
    const batchId = await this.prisma.$transaction(
      async (transaction) => {
        const { event, user } = await this.access.resolve(
          principal,
          eventId,
          Permission.INVITATION_RESEND,
          transaction,
        );
        this.assertEventWritable(event);
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`idempotency:${eventId}:${operation}:${keyHash}`}, 0)) IS NULL AS locked
        `;
        const replay = await this.idempotentReplay(
          transaction,
          eventId,
          operation,
          keyHash,
          requestHash,
        );
        if (replay) return replay;
        await transaction.$queryRaw`
          SELECT "id" FROM "messages"
          WHERE "id" = ${messageId}::uuid AND "event_id" = ${eventId}::uuid
          FOR UPDATE
        `;
        const lockTarget = await transaction.message.findFirst({
          where: { id: messageId, eventId, messageType: "INVITATION" },
          select: { invitationGroupId: true, templateId: true },
        });
        if (!lockTarget) {
          throw new NotFoundException({
            code: "MESSAGE_NOT_FOUND",
            message: "The message does not exist or is not accessible.",
          });
        }
        await transaction.$queryRaw`
          SELECT "id" FROM "events"
          WHERE "id" = ${eventId}::uuid
          FOR SHARE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "invitation_groups"
          WHERE "id" = ${lockTarget.invitationGroupId}::uuid
            AND "event_id" = ${eventId}::uuid
          FOR SHARE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "invitation_templates"
          WHERE "id" = ${lockTarget.templateId}::uuid
            AND "event_id" = ${eventId}::uuid
          FOR SHARE
        `;
        const currentEvent = await transaction.event.findUniqueOrThrow({
          where: { id: eventId },
        });
        const evaluation = await this.evaluateResend(
          transaction,
          currentEvent,
          messageId,
        );
        const { readiness } = evaluation;
        if (
          !readiness.eligible ||
          !evaluation.confirmationStateHash ||
          !this.confirmationMatches(
            evaluation.confirmationStateHash,
            input.confirmationToken,
            new Date(),
          )
        ) {
          throw new ConflictException({
            code: "RESEND_CONFIRMATION_STALE",
            message:
              readiness.reason ??
              "Message resend eligibility changed or the confirmation expired.",
          });
        }
        const { message: previous, snapshot, template } = evaluation;
        if (!snapshot || !template?.providerTemplateName) {
          throw new ConflictException({
            code: "RESEND_CONFIRMATION_STALE",
            message: "Prepare a current approved invitation snapshot first.",
          });
        }
        const now = new Date();
        const nextBatchId = randomUUID();
        const batch = await transaction.sendBatch.create({
          data: {
            id: nextBatchId,
            eventId,
            createdBy: user.id,
            status: "QUEUED",
            messageType: previous.messageType,
            requestHash,
            selectionHash: sha256(
              stableSerialize({
                invitationGroupId: previous.invitationGroupId,
                snapshotId: snapshot.id,
              }),
            ),
            confirmationHash: input.confirmationToken,
            totalMessages: 1,
            estimatedCreditUnits: 1,
            queuedAt: now,
          },
        });
        await this.credits.reserveForSendBatch(
          transaction,
          {
            eventId,
            sendBatchId: nextBatchId,
            units: 1,
            createdByUserId: user.id,
          },
          now,
        );
        await transaction.message.create({
          data: {
            id: randomUUID(),
            eventId,
            sendBatchId: nextBatchId,
            invitationGroupId: previous.invitationGroupId,
            contentSnapshotId: snapshot.id,
            predecessorMessageId: previous.id,
            provider: template.provider,
            messageType: previous.messageType,
            status: "QUEUED",
            recipientPhoneE164: previous.invitationGroup.phoneE164,
            providerTemplateName: template.providerTemplateName,
            templateId: snapshot.templateId,
            templateVersion: snapshot.templateVersion,
            locale: snapshot.locale,
            templateVariables: snapshot.variables as Prisma.InputJsonValue,
            templateParameterOrder:
              template.variableSchema as Prisma.InputJsonValue,
            renderedContent: snapshot.renderedContent as Prisma.InputJsonValue,
            sourceHash: snapshot.sourceHash,
            contentHash: snapshot.contentHash,
            creditUnits: 1,
            queuedAt: now,
          },
        });
        const initial = this.mapBatch(batch, this.emptyCounts(1));
        await transaction.idempotencyRecord.create({
          data: {
            eventId,
            sendBatchId: nextBatchId,
            operation,
            keyHash,
            requestHash,
            status: "COMPLETED",
            responseStatus: 202,
            responseBody: initial as Prisma.InputJsonValue,
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
            completedAt: now,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "message.resend_queued",
            targetType: "Message",
            targetId: previous.id,
            metadata: {
              sendBatchId: nextBatchId,
              contentSnapshotId: snapshot.id,
              creditUnits: 1,
            },
          },
        });
        return nextBatchId;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
    await this.enqueueDurableBatch(batchId);
    return this.getBatchSummary(principal, eventId, batchId);
  }

  private async selectionState(
    client: MessagingClient,
    event: Event,
    templateId: string,
    invitationIds: readonly string[] | undefined,
    lock = false,
  ): Promise<SelectionState> {
    const selectedIds = invitationIds
      ? [...new Set(invitationIds)].sort()
      : undefined;
    if (lock) {
      await client.$queryRaw`
        SELECT "id" FROM "invitation_templates"
        WHERE "id" = ${templateId}::uuid AND "event_id" = ${event.id}::uuid
        FOR SHARE
      `;
      const invitationLock = selectedIds
        ? Prisma.sql`
            SELECT "id" FROM "invitation_groups"
            WHERE "event_id" = ${event.id}::uuid
              AND "cancelled_at" IS NULL
              AND "id" IN (${Prisma.join(
                selectedIds.map((id) => Prisma.sql`${id}::uuid`),
              )})
            FOR SHARE
          `
        : Prisma.sql`
            SELECT "id" FROM "invitation_groups"
            WHERE "event_id" = ${event.id}::uuid AND "cancelled_at" IS NULL
            FOR SHARE
          `;
      await client.$queryRaw(invitationLock);
    }
    const template = await client.invitationTemplate.findFirst({
      where: { id: templateId, eventId: event.id, purpose: "INVITATION" },
      include: { asset: true },
    });
    if (!template) {
      throw new NotFoundException({
        code: "TEMPLATE_NOT_FOUND",
        message: "The invitation template does not exist or is not accessible.",
      });
    }
    const invitations = await client.invitationGroup.findMany({
      where: {
        eventId: event.id,
        cancelledAt: null,
        ...(selectedIds ? { id: { in: selectedIds } } : {}),
      },
      include: { members: { orderBy: { position: "asc" } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (selectedIds && invitations.length !== selectedIds.length) {
      throw new NotFoundException({
        code: "INVITATION_NOT_FOUND",
        message: "One or more invitations do not exist or are not accessible.",
      });
    }
    const ids = invitations.map(({ id }) => id);
    const [snapshots, previousMessages] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : client.invitationContentSnapshot.findMany({
            where: {
              eventId: event.id,
              templateId,
              invitationGroupId: { in: ids },
              isReady: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          }),
      ids.length === 0
        ? Promise.resolve([])
        : client.message.findMany({
            where: {
              eventId: event.id,
              invitationGroupId: { in: ids },
              messageType: "INVITATION",
              predecessorMessageId: null,
            },
            select: { invitationGroupId: true },
          }),
    ]);
    const alreadySent = new Set(
      previousMessages.map(({ invitationGroupId }) => invitationGroupId),
    );
    const snapshotBySource = new Map<string, InvitationContentSnapshot>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.invitationGroupId}:${snapshot.sourceHash}`;
      if (!snapshotBySource.has(key)) snapshotBySource.set(key, snapshot);
    }
    const ready: ReadyInvitation[] = [];
    const blocked: SendReadinessResponse["blocked"] = [];
    const providerReady =
      template.status === "APPROVED" &&
      template.provider === "META_WHATSAPP" &&
      Boolean(template.providerTemplateName?.trim());
    for (const invitation of invitations) {
      if (alreadySent.has(invitation.id)) continue;
      if (!providerReady) {
        blocked.push({
          invitationId: invitation.id,
          issues: [
            {
              code:
                template.status !== "APPROVED"
                  ? "TEMPLATE_NOT_APPROVED"
                  : "PROVIDER_TEMPLATE_NOT_CONFIGURED",
              field: "template.providerTemplateName",
              message:
                template.status !== "APPROVED"
                  ? "Approve the invitation template before sending."
                  : "Configure the approved Meta WhatsApp template name before sending.",
            },
          ],
        });
        continue;
      }
      const currentSourceHash = invitationSourceHash(
        event,
        invitation,
        template,
      );
      const snapshot = snapshotBySource.get(
        `${invitation.id}:${currentSourceHash}`,
      );
      if (!snapshot) {
        blocked.push({
          invitationId: invitation.id,
          issues: [
            {
              code: "CURRENT_SNAPSHOT_REQUIRED",
              field: "invitation.contentSnapshot",
              message: "Prepare a current invitation snapshot before sending.",
            },
          ],
        });
        continue;
      }
      ready.push({ invitation, snapshot });
    }
    const selectedInvitationIds = invitations.map(({ id }) => id).sort();
    const alreadySentInvitationIds = [...alreadySent].sort();
    const stateHash = sha256(
      stableSerialize({
        eventId: event.id,
        templateId,
        selectedInvitationIds,
        ready: ready.map(({ invitation, snapshot }) => ({
          invitationId: invitation.id,
          snapshotId: snapshot.id,
          sourceHash: snapshot.sourceHash,
          contentHash: snapshot.contentHash,
        })),
        blocked: blocked.map((item) => ({
          invitationId: item.invitationId,
          codes: item.issues.map(({ code }) => code),
        })),
        alreadySentInvitationIds,
      }),
    );
    return {
      template,
      ready,
      blocked,
      alreadySentInvitationIds,
      selectedInvitationIds,
      stateHash,
    };
  }

  private toReadiness(
    state: SelectionState,
    expiresAt: Date,
  ): SendReadinessResponse {
    return {
      templateId: state.template.id,
      confirmationToken: this.confirmationToken(state.stateHash, expiresAt),
      expiresAt: expiresAt.toISOString(),
      summary: {
        selectedInvitations: state.selectedInvitationIds.length,
        readyInvitations: state.ready.length,
        alreadySentInvitations: state.alreadySentInvitationIds.length,
        blockedInvitations: state.blocked.length,
        estimatedCreditUnits: state.ready.length,
      },
      blocked: [...state.blocked],
      alreadySentInvitationIds: [...state.alreadySentInvitationIds],
    };
  }

  private async buildResendReadiness(
    client: MessagingClient,
    event: Event,
    messageId: string,
  ): Promise<ResendReadinessResponse> {
    return (await this.evaluateResend(client, event, messageId)).readiness;
  }

  private async evaluateResend(
    client: MessagingClient,
    event: Event,
    messageId: string,
  ) {
    const message = await client.message.findFirst({
      where: { id: messageId, eventId: event.id, messageType: "INVITATION" },
      include: {
        invitationGroup: {
          include: { members: { orderBy: { position: "asc" } } },
        },
        contentSnapshot: true,
        resends: { select: { id: true }, take: 1 },
      },
    });
    if (!message) {
      throw new NotFoundException({
        code: "MESSAGE_NOT_FOUND",
        message: "The message does not exist or is not accessible.",
      });
    }
    const template = await client.invitationTemplate.findFirst({
      where: { id: message.templateId, eventId: event.id },
      include: { asset: true },
    });
    const currentSourceHash = template
      ? invitationSourceHash(event, message.invitationGroup, template)
      : null;
    const snapshot = currentSourceHash
      ? await client.invitationContentSnapshot.findFirst({
          where: {
            eventId: event.id,
            invitationGroupId: message.invitationGroupId,
            templateId: template!.id,
            sourceHash: currentSourceHash,
            isReady: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : null;
    let reasonCode: ResendReadinessResponse["reasonCode"] = null;
    let reason: string | null = null;
    if (message.status !== "FAILED") {
      reasonCode = "NOT_FAILED";
      reason = "Only a failed message can be resent.";
    } else if (message.failureClass === "AMBIGUOUS") {
      reasonCode = "AMBIGUOUS_OUTCOME";
      reason =
        "The provider outcome is uncertain; review it before attempting another send.";
    } else if (message.resends.length > 0) {
      reasonCode = "ALREADY_RESENT";
      reason = "This failed message already has a resend.";
    } else if (!template || template.status !== "APPROVED") {
      reasonCode = "TEMPLATE_NOT_APPROVED";
      reason = "The message template is no longer approved.";
    } else if (!snapshot) {
      reasonCode = "SNAPSHOT_STALE";
      reason =
        "Invitation content changed after the failed send; prepare a current snapshot first.";
    }
    const eligible = reasonCode === null;
    const confirmationStateHash = eligible
      ? sha256(
          stableSerialize({
            eventId: event.id,
            messageId,
            status: message.status,
            attemptCount: message.attemptCount,
            snapshotId: snapshot!.id,
            contentHash: snapshot!.contentHash,
          }),
        )
      : null;
    const expiresAt = eligible ? this.confirmationExpiry(new Date()) : null;
    const confirmationToken = eligible
      ? this.confirmationToken(confirmationStateHash!, expiresAt!)
      : null;
    return {
      message,
      template,
      snapshot,
      confirmationStateHash,
      readiness: {
        messageId,
        invitationGroupId: message.invitationGroupId,
        eligible,
        estimatedCreditUnits: eligible ? 1 : 0,
        confirmationToken,
        expiresAt: expiresAt?.toISOString() ?? null,
        reasonCode,
        reason,
      } satisfies ResendReadinessResponse,
    };
  }

  private async idempotentReplay(
    transaction: Prisma.TransactionClient,
    eventId: string,
    operation: string,
    keyHash: string,
    requestHash: string,
  ): Promise<string | null> {
    const existing = await transaction.idempotencyRecord.findFirst({
      where: { eventId, operation, keyHash },
    });
    if (!existing) return null;
    if (existing.expiresAt <= new Date()) {
      await transaction.idempotencyRecord.delete({
        where: { id: existing.id },
      });
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: "IDEMPOTENCY_KEY_REUSED",
        message:
          "The Idempotency-Key was already used with a different request.",
      });
    }
    if (existing.status !== "COMPLETED" || !existing.sendBatchId) {
      throw new ConflictException({
        code: "IDEMPOTENT_REQUEST_IN_PROGRESS",
        message: "The original request is still being processed.",
      });
    }
    return existing.sendBatchId;
  }

  private async enqueueDurableBatch(batchId: string): Promise<void> {
    try {
      await this.queue.enqueueBatch(batchId, (exhaustedAt) =>
        this.recoverExhaustedDispatch(batchId, exhaustedAt),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: "BATCH_DISPATCH_UNAVAILABLE",
        message:
          "The send batch is saved but dispatch is temporarily unavailable. Retry with the same Idempotency-Key.",
      });
    }
  }

  private async recoverExhaustedDispatch(
    batchId: string,
    exhaustedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "messages"
        WHERE "send_batch_id" = ${batchId}::uuid
          AND "status" = 'FAILED'
          AND "attempt_count" = 0
          AND "failure_code" = 'DISPATCH_RETRY_EXHAUSTED'
        ORDER BY "id"
        FOR UPDATE
      `;
      await transaction.$queryRaw`
        SELECT "id" FROM "send_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE
      `;
      const batch = await transaction.sendBatch.findUnique({
        where: { id: batchId },
      });
      if (!batch || batch.status === "CANCELLED") return;
      const recoveryFenceAt = new Date(
        Math.max(Date.now(), exhaustedAt.getTime() + 1),
      );
      const recovered = await transaction.message.updateMany({
        where: {
          sendBatchId: batchId,
          status: "FAILED",
          attemptCount: 0,
          failureCode: "DISPATCH_RETRY_EXHAUSTED",
        },
        data: {
          status: "QUEUED",
          failureClass: null,
          failureCode: null,
          failureReason: null,
          failedAt: null,
        },
      });
      await transaction.sendBatch.update({
        where: { id: batchId },
        data:
          recovered.count > 0 ||
          ["QUEUED", "DISPATCHING", "IN_PROGRESS"].includes(batch.status)
            ? {
                status: "QUEUED",
                dispatchStartedAt: recoveryFenceAt,
                completedAt: null,
              }
            : { dispatchStartedAt: recoveryFenceAt },
      });
      await transaction.auditLog.create({
        data: {
          eventId: batch.eventId,
          actorType: "SYSTEM",
          action: "send_batch.dispatch_recovered",
          targetType: "SendBatch",
          targetId: batch.id,
          metadata: {
            affectedMessages: recovered.count,
            recoveryFenceAt: recoveryFenceAt.toISOString(),
          },
        },
      });
    });
  }

  private async getBatchSummary(
    principal: AuthPrincipal,
    eventId: string,
    batchId: string,
  ): Promise<SendBatchContract> {
    await this.access.resolve(principal, eventId, Permission.INVITATION_SEND);
    const batch = await this.findBatch(eventId, batchId);
    const counts = await this.batchCounts([batchId]);
    return this.mapBatch(batch, counts.get(batchId) ?? new Map());
  }

  private async findBatch(
    eventId: string,
    batchId: string,
  ): Promise<SendBatch> {
    const batch = await this.prisma.sendBatch.findFirst({
      where: { id: batchId, eventId, messageType: "INVITATION" },
    });
    if (!batch) {
      throw new NotFoundException({
        code: "SEND_BATCH_NOT_FOUND",
        message: "The send batch does not exist or is not accessible.",
      });
    }
    return batch;
  }

  private async batchCounts(
    batchIds: readonly string[],
  ): Promise<Map<string, Map<MessageStatus, number>>> {
    const result = new Map<string, Map<MessageStatus, number>>();
    if (batchIds.length === 0) return result;
    const rows = await this.prisma.message.groupBy({
      by: ["sendBatchId", "status"],
      where: { sendBatchId: { in: [...batchIds] } },
      _count: { _all: true },
    });
    for (const row of rows) {
      const counts =
        result.get(row.sendBatchId) ?? new Map<MessageStatus, number>();
      counts.set(row.status, row._count._all);
      result.set(row.sendBatchId, counts);
    }
    return result;
  }

  private mapBatch(
    batch: SendBatch,
    counts: ReadonlyMap<MessageStatus, number>,
  ): SendBatchContract {
    const progress = this.progress(counts);
    return {
      id: batch.id,
      eventId: batch.eventId,
      status: this.derivedBatchStatus(batch, progress),
      messageType: batch.messageType,
      totalMessages: batch.totalMessages,
      estimatedCreditUnits: batch.estimatedCreditUnits,
      progress,
      queuedAt: batch.queuedAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      completedAt: batch.completedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
    };
  }

  private progress(
    counts: ReadonlyMap<MessageStatus, number>,
  ): SendBatchProgress {
    const value = (status: MessageStatus) => counts.get(status) ?? 0;
    const queued = value("QUEUED");
    const sending = value("SENDING");
    const sent = value("SENT");
    const delivered = value("DELIVERED");
    const read = value("READ");
    const responded = value("RESPONDED");
    const failed = value("FAILED");
    const cancelled = value("CANCELLED");
    return {
      queued,
      sending,
      sent,
      delivered,
      read,
      responded,
      failed,
      cancelled,
      completed: sent + delivered + read + responded + failed + cancelled,
    };
  }

  private derivedBatchStatus(
    batch: SendBatch,
    progress: SendBatchProgress,
  ): SendBatchContract["status"] {
    if (batch.status === "CANCELLED") return "CANCELLED";
    if (progress.queued > 0 || progress.sending > 0) {
      if (batch.status === "QUEUED" || batch.status === "DISPATCHING") {
        return batch.status;
      }
      return "IN_PROGRESS";
    }
    if (progress.failed === batch.totalMessages) return "FAILED";
    if (progress.failed > 0) return "PARTIALLY_FAILED";
    return "COMPLETED";
  }

  private mapMessage(message: {
    id: string;
    invitationGroupId: string;
    recipientPhoneE164: string;
    status: MessageStatus;
    locale: "ar_SA" | "en";
    providerMessageId: string | null;
    attemptCount: number;
    failureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS" | null;
    failureCode: string | null;
    failureReason: string | null;
    queuedAt: Date;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
    failedAt: Date | null;
    invitationGroup: { displayName: string };
    _count: { resends: number };
  }): MessageSummary {
    return {
      id: message.id,
      invitationGroupId: message.invitationGroupId,
      invitationDisplayName: message.invitationGroup.displayName,
      maskedPhone: this.maskPhone(message.recipientPhoneE164),
      status: message.status,
      locale: message.locale === "ar_SA" ? "ar-SA" : "en",
      providerMessageId: message.providerMessageId,
      attemptCount: message.attemptCount,
      failureClass: message.failureClass,
      failureCode: message.failureCode,
      failureReason: message.failureReason,
      canResend:
        message.status === "FAILED" &&
        message.failureClass !== "AMBIGUOUS" &&
        message._count.resends === 0,
      queuedAt: message.queuedAt.toISOString(),
      sentAt: message.sentAt?.toISOString() ?? null,
      deliveredAt: message.deliveredAt?.toISOString() ?? null,
      readAt: message.readAt?.toISOString() ?? null,
      failedAt: message.failedAt?.toISOString() ?? null,
    };
  }

  private emptyCounts(queued: number): Map<MessageStatus, number> {
    return new Map([["QUEUED", queued]]);
  }

  private confirmationExpiry(now: Date): Date {
    return new Date(
      Math.floor(now.getTime() / CONFIRMATION_WINDOW_MILLISECONDS) *
        CONFIRMATION_WINDOW_MILLISECONDS +
        2 * CONFIRMATION_WINDOW_MILLISECONDS,
    );
  }

  private confirmationToken(stateHash: string, expiresAt: Date): string {
    return sha256(`${stateHash}:${expiresAt.toISOString()}`);
  }

  private confirmationMatches(
    stateHash: string,
    submittedToken: string,
    now: Date,
  ): boolean {
    const currentExpiry = this.confirmationExpiry(now);
    if (this.confirmationToken(stateHash, currentExpiry) === submittedToken) {
      return true;
    }
    const priorExpiry = new Date(
      currentExpiry.getTime() - CONFIRMATION_WINDOW_MILLISECONDS,
    );
    return (
      priorExpiry > now &&
      this.confirmationToken(stateHash, priorExpiry) === submittedToken
    );
  }

  private maskPhone(value: string): string {
    return `${value.slice(0, Math.min(4, value.length - 4))}••••${value.slice(-4)}`;
  }

  private assertEventWritable(event: Pick<Event, "status">): void {
    if (event.status === "ARCHIVED") {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events are read-only.",
      });
    }
  }
}
