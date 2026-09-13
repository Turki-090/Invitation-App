import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  CreateReminderRuleInput,
  ListReminderRunsQuery,
  ListReminderRunsResponse,
  ReminderReadinessRequest,
  ReminderReadinessResponse,
  ReminderRule as ReminderRuleContract,
  ReminderRun as ReminderRunContract,
  ReminderRunDetail,
  SendRemindersInput,
  UpdateReminderRuleInput,
} from "@dawah/api-contract";
import {
  evaluateReminderEligibility,
  Permission,
  type ReminderEligibilityReason,
} from "@dawah/domain";
import {
  Prisma,
  type Event,
  type InvitationContentSnapshot,
  type InvitationTemplate,
  type MessageStatus,
  type ReminderRule,
  type ReminderRun,
  type SendBatch,
  type StoredAsset,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { MessagingQueueService } from "../messaging/messaging-queue.service";
import {
  invitationSourceHash,
  sha256,
  stableSerialize,
} from "../preparation/invitation-source-hash";
import { PrismaService } from "../prisma/prisma.service";

const CONFIRMATION_WINDOW_MILLISECONDS = 5 * 60 * 1_000;
const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MANUAL_REMINDER_OPERATION = "reminder.send";
const SUCCESSFUL_INITIAL_STATUSES = new Set<MessageStatus>([
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
]);

type ReminderClient = PrismaService | Prisma.TransactionClient;
type TemplateWithAsset = InvitationTemplate & { asset: StoredAsset | null };
type InvitationWithMembers = Prisma.InvitationGroupGetPayload<{
  include: { members: true };
}>;

interface EvaluatedInvitation {
  readonly invitation: InvitationWithMembers;
  readonly snapshot: InvitationContentSnapshot | null;
  readonly initialMessage: {
    readonly status: MessageStatus;
    readonly sentAt: Date | null;
    readonly createdAt: Date;
  } | null;
  readonly lastReminderAt: Date | null;
  readonly eligible: boolean;
  readonly reasonCodes: readonly ReminderEligibilityReason[];
  readonly nextEligibleAt: Date | null;
}

interface ReminderSelectionState {
  readonly template: TemplateWithAsset;
  readonly selected: readonly EvaluatedInvitation[];
  readonly eligible: readonly EvaluatedInvitation[];
  readonly stateHash: string;
}

@Injectable()
export class RemindersService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(MessagingQueueService)
    private readonly queue: MessagingQueueService,
  ) {}

  public async readiness(
    principal: AuthPrincipal,
    eventId: string,
    input: ReminderReadinessRequest,
  ): Promise<ReminderReadinessResponse> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.REMINDER_SEND,
    );
    const state = await this.selectionState(
      this.prisma,
      event,
      input,
      new Date(),
    );
    return this.toReadiness(state, input, this.confirmationExpiry(new Date()));
  }

  public async send(
    principal: AuthPrincipal,
    eventId: string,
    input: SendRemindersInput,
    idempotencyKey: string,
  ): Promise<ReminderRunContract> {
    const keyHash = sha256(idempotencyKey);
    const requestHash = sha256(
      stableSerialize({ eventId, operation: MANUAL_REMINDER_OPERATION, input }),
    );
    const outcome = await this.prisma.$transaction(
      async (transaction) => {
        const { user } = await this.access.resolve(
          principal,
          eventId,
          Permission.REMINDER_SEND,
          transaction,
        );
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`idempotency:${eventId}:${MANUAL_REMINDER_OPERATION}:${keyHash}`}, 0)) IS NULL AS locked
        `;
        const replay = await this.idempotentReplay(
          transaction,
          eventId,
          keyHash,
          requestHash,
        );
        if (replay) return { runId: replay, batchId: null } as const;

        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`reminders:${eventId}`}, 0)) IS NULL AS locked
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "events" WHERE "id" = ${eventId}::uuid FOR SHARE
        `;
        const currentEvent = await transaction.event.findUniqueOrThrow({
          where: { id: eventId },
        });
        const evaluatedAt = new Date();
        const state = await this.selectionState(
          transaction,
          currentEvent,
          input,
          evaluatedAt,
          true,
        );
        if (
          !this.confirmationMatches(
            state.stateHash,
            input.confirmationToken,
            evaluatedAt,
          )
        ) {
          throw new ConflictException({
            code: "REMINDER_CONFIRMATION_STALE",
            message:
              "Reminder eligibility changed or the confirmation expired. Review the summary again.",
          });
        }
        if (state.eligible.length === 0) {
          throw new ConflictException({
            code: "NO_ELIGIBLE_REMINDERS",
            message: "There are no invitation groups eligible for a reminder.",
          });
        }

        const batchId = randomUUID();
        const runId = randomUUID();
        const messageIds = new Map<string, string>();
        for (const evaluation of state.eligible) {
          messageIds.set(evaluation.invitation.id, randomUUID());
        }
        const selectionHash = sha256(
          stableSerialize(
            state.selected.map((evaluation) => ({
              invitationId: evaluation.invitation.id,
              eligible: evaluation.eligible,
              reasonCodes: evaluation.reasonCodes,
              snapshotId: evaluation.snapshot?.id ?? null,
            })),
          ),
        );
        const batch = await transaction.sendBatch.create({
          data: {
            id: batchId,
            eventId,
            createdBy: user.id,
            status: "QUEUED",
            messageType: "REMINDER",
            requestHash,
            selectionHash,
            confirmationHash: input.confirmationToken,
            totalMessages: state.eligible.length,
            estimatedCreditUnits: state.eligible.length,
            queuedAt: evaluatedAt,
          },
        });
        await transaction.message.createMany({
          data: state.eligible.map((evaluation) => {
            const snapshot = evaluation.snapshot!;
            return {
              id: messageIds.get(evaluation.invitation.id)!,
              eventId,
              sendBatchId: batchId,
              invitationGroupId: evaluation.invitation.id,
              contentSnapshotId: snapshot.id,
              provider: state.template.provider,
              messageType: "REMINDER" as const,
              status: "QUEUED" as const,
              recipientPhoneE164: evaluation.invitation.phoneE164,
              providerTemplateName: state.template.providerTemplateName!,
              templateId: snapshot.templateId,
              templateVersion: snapshot.templateVersion,
              locale: snapshot.locale,
              templateVariables: snapshot.variables as Prisma.InputJsonValue,
              templateParameterOrder: state.template
                .variableSchema as Prisma.InputJsonValue,
              renderedContent:
                snapshot.renderedContent as Prisma.InputJsonValue,
              sourceHash: snapshot.sourceHash,
              contentHash: snapshot.contentHash,
              creditUnits: 1,
              queuedAt: evaluatedAt,
            };
          }),
        });
        const run = await transaction.reminderRun.create({
          data: {
            id: runId,
            eventId,
            sendBatchId: batchId,
            createdBy: user.id,
            source: "MANUAL",
            status: "QUEUED",
            requestHash,
            selectionHash,
            confirmationHash: input.confirmationToken,
            cooldownMinutes: input.cooldownHours * 60,
            selectedCount: state.selected.length,
            eligibleCount: state.eligible.length,
            excludedCount: state.selected.length - state.eligible.length,
            evaluatedAt,
          },
        });
        await transaction.reminderRunItem.createMany({
          data: state.selected.map((evaluation) => ({
            id: randomUUID(),
            eventId,
            reminderRunId: runId,
            invitationGroupId: evaluation.invitation.id,
            messageId: messageIds.get(evaluation.invitation.id) ?? null,
            outcome: evaluation.eligible
              ? ("ELIGIBLE" as const)
              : ("EXCLUDED" as const),
            reasonCodes: [...evaluation.reasonCodes],
            initialInvitationSentAt:
              evaluation.initialMessage?.sentAt ??
              evaluation.initialMessage?.createdAt ??
              null,
            lastReminderAt: evaluation.lastReminderAt,
          })),
        });
        for (const evaluation of state.eligible) {
          await transaction.reminderRecipientState.upsert({
            where: {
              eventId_invitationGroupId: {
                eventId,
                invitationGroupId: evaluation.invitation.id,
              },
            },
            create: {
              eventId,
              invitationGroupId: evaluation.invitation.id,
              lastReminderMessageId: messageIds.get(evaluation.invitation.id)!,
              lastQueuedAt: evaluatedAt,
            },
            update: {
              lastReminderMessageId: messageIds.get(evaluation.invitation.id)!,
              lastQueuedAt: evaluatedAt,
            },
          });
        }
        const initial = this.mapRun(
          run,
          batch,
          this.emptyCounts(state.eligible.length),
        );
        await transaction.idempotencyRecord.create({
          data: {
            eventId,
            sendBatchId: batchId,
            operation: MANUAL_REMINDER_OPERATION,
            keyHash,
            requestHash,
            status: "COMPLETED",
            responseStatus: 202,
            responseBody: initial as Prisma.InputJsonValue,
            expiresAt: new Date(
              evaluatedAt.getTime() + IDEMPOTENCY_TTL_MILLISECONDS,
            ),
            completedAt: evaluatedAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "reminder_run.queued",
            targetType: "ReminderRun",
            targetId: runId,
            metadata: {
              source: "MANUAL",
              sendBatchId: batchId,
              selectedCount: state.selected.length,
              eligibleCount: state.eligible.length,
              excludedCount: state.selected.length - state.eligible.length,
              cooldownMinutes: input.cooldownHours * 60,
              exclusionCounts: this.exclusionCounts(state.selected),
            },
          },
        });
        return { runId, batchId } as const;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );

    if (outcome.batchId) await this.enqueueDurableBatch(outcome.batchId);
    else {
      const replay = await this.prisma.reminderRun.findUnique({
        where: { id: outcome.runId },
        select: { sendBatchId: true },
      });
      if (replay?.sendBatchId)
        await this.enqueueDurableBatch(replay.sendBatchId);
    }
    return this.getRun(principal, eventId, outcome.runId);
  }

  public async listRuns(
    principal: AuthPrincipal,
    eventId: string,
    query: ListReminderRunsQuery,
  ): Promise<ListReminderRunsResponse> {
    await this.access.resolve(principal, eventId, Permission.REMINDER_SEND);
    const [runs, totalItems] = await Promise.all([
      this.prisma.reminderRun.findMany({
        where: { eventId },
        include: { sendBatch: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.reminderRun.count({ where: { eventId } }),
    ]);
    const counts = await this.batchCounts(
      runs.flatMap((run) => (run.sendBatchId ? [run.sendBatchId] : [])),
    );
    return {
      items: runs.map((run) =>
        this.mapRun(
          run,
          run.sendBatch,
          run.sendBatchId
            ? (counts.get(run.sendBatchId) ?? new Map())
            : new Map(),
        ),
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async getRun(
    principal: AuthPrincipal,
    eventId: string,
    runId: string,
  ): Promise<ReminderRunDetail> {
    await this.access.resolve(principal, eventId, Permission.REMINDER_SEND);
    const run = await this.prisma.reminderRun.findFirst({
      where: { id: runId, eventId },
      include: {
        sendBatch: true,
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!run) {
      throw new NotFoundException({
        code: "REMINDER_RUN_NOT_FOUND",
        message: "The reminder run does not exist or is not accessible.",
      });
    }
    const counts = run.sendBatchId
      ? await this.batchCounts([run.sendBatchId])
      : new Map<string, Map<MessageStatus, number>>();
    return {
      ...this.mapRun(
        run,
        run.sendBatch,
        run.sendBatchId
          ? (counts.get(run.sendBatchId) ?? new Map())
          : new Map(),
      ),
      items: run.items.map((item) => ({
        invitationId: item.invitationGroupId,
        outcome: item.outcome,
        reasonCodes:
          item.reasonCodes as ReminderRunDetail["items"][number]["reasonCodes"],
        messageId: item.messageId,
        initialInvitationSentAt:
          item.initialInvitationSentAt?.toISOString() ?? null,
        lastReminderAt: item.lastReminderAt?.toISOString() ?? null,
      })),
    };
  }

  public async listRules(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<ReminderRuleContract[]> {
    await this.access.resolve(principal, eventId, Permission.REMINDER_SEND);
    const rules = await this.prisma.reminderRule.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rules.map((rule) => this.mapRule(rule));
  }

  public async createRule(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateReminderRuleInput,
  ): Promise<ReminderRuleContract> {
    const rule = await this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.REMINDER_SEND,
        transaction,
      );
      this.assertEventConfigurable(event);
      await this.assertReminderTemplate(transaction, eventId, input.templateId);
      const created = await transaction.reminderRule.create({
        data: {
          eventId,
          templateId: input.templateId,
          createdBy: user.id,
          name: input.name,
          triggerKind: input.triggerKind,
          offsetMinutes: input.offsetDays * 24 * 60,
          cooldownMinutes: input.cooldownHours * 60,
          maximumReminders: input.maximumReminders,
          enabled: input.enabled,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "reminder_rule.created",
          targetType: "ReminderRule",
          targetId: created.id,
          metadata: {
            triggerKind: created.triggerKind,
            offsetMinutes: created.offsetMinutes,
            cooldownMinutes: created.cooldownMinutes,
            maximumReminders: created.maximumReminders,
            enabled: created.enabled,
          },
        },
      });
      return created;
    });
    return this.mapRule(rule);
  }

  public async updateRule(
    principal: AuthPrincipal,
    eventId: string,
    ruleId: string,
    input: UpdateReminderRuleInput,
  ): Promise<ReminderRuleContract> {
    const updated = await this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.REMINDER_SEND,
        transaction,
      );
      this.assertEventConfigurable(event);
      await transaction.$queryRaw`
        SELECT "id" FROM "reminder_rules"
        WHERE "id" = ${ruleId}::uuid AND "event_id" = ${eventId}::uuid
        FOR UPDATE
      `;
      const existing = await transaction.reminderRule.findFirst({
        where: { id: ruleId, eventId },
      });
      if (!existing) {
        throw new NotFoundException({
          code: "REMINDER_RULE_NOT_FOUND",
          message: "The reminder rule does not exist or is not accessible.",
        });
      }
      if (input.templateId) {
        await this.assertReminderTemplate(
          transaction,
          eventId,
          input.templateId,
        );
      }
      const rule = await transaction.reminderRule.update({
        where: { id: ruleId },
        data: {
          ...(input.templateId ? { templateId: input.templateId } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
          ...(input.offsetDays
            ? { offsetMinutes: input.offsetDays * 24 * 60 }
            : {}),
          ...(input.cooldownHours
            ? { cooldownMinutes: input.cooldownHours * 60 }
            : {}),
          ...(input.maximumReminders
            ? { maximumReminders: input.maximumReminders }
            : {}),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "reminder_rule.updated",
          targetType: "ReminderRule",
          targetId: rule.id,
          metadata: {
            previous: {
              templateId: existing.templateId,
              triggerKind: existing.triggerKind,
              offsetMinutes: existing.offsetMinutes,
              cooldownMinutes: existing.cooldownMinutes,
              maximumReminders: existing.maximumReminders,
              enabled: existing.enabled,
            },
            current: {
              templateId: rule.templateId,
              triggerKind: rule.triggerKind,
              offsetMinutes: rule.offsetMinutes,
              cooldownMinutes: rule.cooldownMinutes,
              maximumReminders: rule.maximumReminders,
              enabled: rule.enabled,
            },
          },
        },
      });
      return rule;
    });
    return this.mapRule(updated);
  }

  private async selectionState(
    client: ReminderClient,
    event: Event,
    input: ReminderReadinessRequest,
    now: Date,
    lock = false,
  ): Promise<ReminderSelectionState> {
    const selectedIds = input.invitationIds
      ? [...new Set(input.invitationIds)].sort()
      : undefined;
    if (lock) {
      const lockInvitations = selectedIds
        ? Prisma.sql`
            SELECT "id" FROM "invitation_groups"
            WHERE "event_id" = ${event.id}::uuid
              AND "id" IN (${Prisma.join(
                selectedIds.map((id) => Prisma.sql`${id}::uuid`),
              )})
            ORDER BY "id" FOR UPDATE
          `
        : Prisma.sql`
            SELECT "id" FROM "invitation_groups"
            WHERE "event_id" = ${event.id}::uuid
            ORDER BY "id" FOR UPDATE
          `;
      await client.$queryRaw(lockInvitations);
      await client.$queryRaw`
        SELECT "invitation_group_id" FROM "reminder_recipient_states"
        WHERE "event_id" = ${event.id}::uuid
        ORDER BY "invitation_group_id" FOR UPDATE
      `;
    }
    const template = await client.invitationTemplate.findFirst({
      where: { id: input.templateId, eventId: event.id, purpose: "REMINDER" },
      include: { asset: true },
    });
    if (!template) {
      throw new NotFoundException({
        code: "REMINDER_TEMPLATE_NOT_FOUND",
        message: "The reminder template does not exist or is not accessible.",
      });
    }
    const invitations = await client.invitationGroup.findMany({
      where: {
        eventId: event.id,
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
    const [snapshots, initialMessages, recipientStates] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : client.invitationContentSnapshot.findMany({
            where: {
              eventId: event.id,
              templateId: template.id,
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
            },
            select: {
              invitationGroupId: true,
              status: true,
              sentAt: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          }),
      ids.length === 0
        ? Promise.resolve([])
        : client.reminderRecipientState.findMany({
            where: { eventId: event.id, invitationGroupId: { in: ids } },
          }),
    ]);
    const snapshotBySource = new Map<string, InvitationContentSnapshot>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.invitationGroupId}:${snapshot.sourceHash}`;
      if (!snapshotBySource.has(key)) snapshotBySource.set(key, snapshot);
    }
    const initialByInvitation = new Map<
      string,
      (typeof initialMessages)[number]
    >();
    for (const message of initialMessages) {
      if (!initialByInvitation.has(message.invitationGroupId)) {
        initialByInvitation.set(message.invitationGroupId, message);
      }
    }
    const lastReminderByInvitation = new Map(
      recipientStates.map((state) => [
        state.invitationGroupId,
        state.lastQueuedAt,
      ]),
    );
    const providerReady =
      template.status === "APPROVED" &&
      template.provider === "META_WHATSAPP" &&
      Boolean(template.providerTemplateName?.trim());
    const cooldownMilliseconds = input.cooldownHours * 60 * 60 * 1_000;
    const selected = invitations.map((invitation): EvaluatedInvitation => {
      const initialMessage = initialByInvitation.get(invitation.id) ?? null;
      const sourceHash = invitationSourceHash(event, invitation, template);
      const snapshot =
        snapshotBySource.get(`${invitation.id}:${sourceHash}`) ?? null;
      const lastReminderAt =
        lastReminderByInvitation.get(invitation.id) ?? null;
      const result = evaluateReminderEligibility({
        eventStatus: event.status,
        invitationCancelled: invitation.cancelledAt !== null,
        rsvpStatus: invitation.rsvpStatus,
        hasSuccessfulInitialSend: Boolean(
          initialMessage &&
          SUCCESSFUL_INITIAL_STATUSES.has(initialMessage.status),
        ),
        initialDestinationReachable: !initialMessage
          ? true
          : !["FAILED", "CANCELLED"].includes(initialMessage.status),
        hasCurrentSnapshot: snapshot !== null,
        hasCurrentTemplate: providerReady,
        matchesAudience: this.matchesAudience(
          input.audience,
          initialMessage?.status ?? null,
          event,
          now,
        ),
        now,
        lastReminderSentAt: lastReminderAt,
        cooldownMilliseconds,
        sentReminderCount: 0,
      });
      return {
        invitation,
        snapshot,
        initialMessage,
        lastReminderAt,
        eligible: result.eligible,
        reasonCodes: result.reasonCodes,
        nextEligibleAt:
          lastReminderAt && result.reasonCodes.includes("COOLDOWN_ACTIVE")
            ? new Date(lastReminderAt.getTime() + cooldownMilliseconds)
            : null,
      };
    });
    const eligible = selected.filter((item) => item.eligible);
    const stateHash = sha256(
      stableSerialize({
        eventId: event.id,
        eventStatus: event.status,
        templateId: template.id,
        templateVersion: template.version,
        audience: input.audience,
        cooldownHours: input.cooldownHours,
        selected: selected.map((item) => ({
          invitationId: item.invitation.id,
          rsvpStatus: item.invitation.rsvpStatus,
          cancelledAt: item.invitation.cancelledAt?.toISOString() ?? null,
          initialStatus: item.initialMessage?.status ?? null,
          snapshotId: item.snapshot?.id ?? null,
          lastReminderAt: item.lastReminderAt?.toISOString() ?? null,
          reasonCodes: item.reasonCodes,
        })),
      }),
    );
    return { template, selected, eligible, stateHash };
  }

  private toReadiness(
    state: ReminderSelectionState,
    input: ReminderReadinessRequest,
    expiresAt: Date,
  ): ReminderReadinessResponse {
    const excluded = state.selected.filter((item) => !item.eligible);
    return {
      template: {
        id: state.template.id,
        displayName: state.template.displayName,
        locale: state.template.locale === "ar_SA" ? "ar-SA" : "en",
      },
      audience: input.audience,
      cooldownHours: input.cooldownHours,
      confirmationToken: this.confirmationToken(state.stateHash, expiresAt),
      expiresAt: expiresAt.toISOString(),
      summary: {
        selectedInvitations: state.selected.length,
        eligibleInvitations: state.eligible.length,
        excludedInvitations: excluded.length,
        recentlyRemindedInvitations: excluded.filter((item) =>
          item.reasonCodes.includes("COOLDOWN_ACTIVE"),
        ).length,
        estimatedCreditUnits: state.eligible.length,
      },
      eligibleInvitationIds: state.eligible.map((item) => item.invitation.id),
      excluded: excluded.map((item) => ({
        invitationId: item.invitation.id,
        reasonCodes: [...item.reasonCodes],
        nextEligibleAt: item.nextEligibleAt?.toISOString() ?? null,
      })),
    };
  }

  private matchesAudience(
    audience: ReminderReadinessRequest["audience"],
    initialStatus: MessageStatus | null,
    event: Event,
    now: Date,
  ): boolean {
    if (audience === "ALL_PENDING") return true;
    if (audience === "SENT_UNREAD") {
      return initialStatus === "SENT" || initialStatus === "DELIVERED";
    }
    if (audience === "READ_NO_RESPONSE") return initialStatus === "READ";
    if (!event.rsvpDeadline) return false;
    const today = this.dateInTimeZone(now, event.timezone);
    const deadline = event.rsvpDeadline.toISOString().slice(0, 10);
    const days =
      (Date.parse(`${deadline}T00:00:00.000Z`) -
        Date.parse(`${today}T00:00:00.000Z`)) /
      (24 * 60 * 60 * 1_000);
    return days >= 0 && days <= 2;
  }

  private async assertReminderTemplate(
    client: ReminderClient,
    eventId: string,
    templateId: string,
  ): Promise<void> {
    const template = await client.invitationTemplate.findFirst({
      where: {
        id: templateId,
        eventId,
        purpose: "REMINDER",
        status: "APPROVED",
        provider: "META_WHATSAPP",
        providerTemplateName: { not: null },
      },
      select: { id: true },
    });
    if (!template) {
      throw new ConflictException({
        code: "REMINDER_TEMPLATE_NOT_READY",
        message: "Select a configured, approved reminder template.",
      });
    }
  }

  private async idempotentReplay(
    transaction: Prisma.TransactionClient,
    eventId: string,
    keyHash: string,
    requestHash: string,
  ): Promise<string | null> {
    const existing = await transaction.idempotencyRecord.findFirst({
      where: { eventId, operation: MANUAL_REMINDER_OPERATION, keyHash },
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
    const run = await transaction.reminderRun.findUnique({
      where: { sendBatchId: existing.sendBatchId },
      select: { id: true },
    });
    if (!run) {
      throw new ConflictException({
        code: "IDEMPOTENT_RESPONSE_UNAVAILABLE",
        message: "The original reminder response is unavailable.",
      });
    }
    return run.id;
  }

  private async enqueueDurableBatch(batchId: string): Promise<void> {
    try {
      await this.queue.enqueueBatch(batchId, (exhaustedAt) =>
        this.recoverExhaustedDispatch(batchId, exhaustedAt),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: "REMINDER_DISPATCH_UNAVAILABLE",
        message:
          "The reminder run is saved but dispatch is temporarily unavailable. Retry with the same Idempotency-Key.",
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
        ORDER BY "id" FOR UPDATE
      `;
      const batch = await transaction.sendBatch.findUnique({
        where: { id: batchId },
      });
      if (
        !batch ||
        batch.messageType !== "REMINDER" ||
        batch.status === "CANCELLED"
      ) {
        return;
      }
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
      const recoveryFenceAt = new Date(
        Math.max(Date.now(), exhaustedAt.getTime() + 1),
      );
      await transaction.sendBatch.update({
        where: { id: batchId },
        data: {
          status: "QUEUED",
          dispatchStartedAt: recoveryFenceAt,
          completedAt: null,
        },
      });
      await transaction.reminderRun.updateMany({
        where: { sendBatchId: batchId },
        data: { status: "QUEUED", completedAt: null },
      });
      await transaction.auditLog.create({
        data: {
          eventId: batch.eventId,
          actorType: "SYSTEM",
          action: "reminder_run.dispatch_recovered",
          targetType: "SendBatch",
          targetId: batchId,
          metadata: { affectedMessages: recovered.count },
        },
      });
    });
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
      const values = result.get(row.sendBatchId) ?? new Map();
      values.set(row.status, row._count._all);
      result.set(row.sendBatchId, values);
    }
    return result;
  }

  private mapRun(
    run: ReminderRun,
    batch: SendBatch | null,
    counts: ReadonlyMap<MessageStatus, number>,
  ): ReminderRunContract {
    const progress = this.progress(counts);
    const status = batch
      ? this.derivedBatchStatus(batch, progress)
      : run.status;
    return {
      id: run.id,
      eventId: run.eventId,
      ruleId: run.ruleId,
      sendBatchId: run.sendBatchId,
      source: run.source,
      status,
      selectedCount: run.selectedCount,
      eligibleCount: run.eligibleCount,
      excludedCount: run.excludedCount,
      cooldownHours: run.cooldownMinutes / 60,
      progress,
      evaluatedAt: run.evaluatedAt.toISOString(),
      completedAt:
        batch?.completedAt?.toISOString() ??
        run.completedAt?.toISOString() ??
        null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  private progress(counts: ReadonlyMap<MessageStatus, number>) {
    const value = (status: MessageStatus) => counts.get(status) ?? 0;
    const sent = value("SENT");
    const delivered = value("DELIVERED");
    const read = value("READ");
    const responded = value("RESPONDED");
    const failed = value("FAILED");
    const cancelled = value("CANCELLED");
    return {
      queued: value("QUEUED"),
      sending: value("SENDING"),
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
    progress: ReturnType<RemindersService["progress"]>,
  ): ReminderRunContract["status"] {
    if (batch.status === "CANCELLED") return "CANCELLED";
    if (progress.queued > 0 || progress.sending > 0) {
      return batch.status === "QUEUED" || batch.status === "DISPATCHING"
        ? batch.status
        : "IN_PROGRESS";
    }
    if (progress.failed === batch.totalMessages) return "FAILED";
    if (progress.failed > 0) return "PARTIALLY_FAILED";
    return "COMPLETED";
  }

  private emptyCounts(queued: number): Map<MessageStatus, number> {
    return new Map([["QUEUED", queued]]);
  }

  private mapRule(rule: ReminderRule): ReminderRuleContract {
    return {
      id: rule.id,
      eventId: rule.eventId,
      templateId: rule.templateId,
      name: rule.name,
      triggerKind: rule.triggerKind,
      offsetDays: rule.offsetMinutes / (24 * 60),
      cooldownHours: rule.cooldownMinutes / 60,
      maximumReminders: rule.maximumReminders,
      enabled: rule.enabled,
      lastEvaluatedAt: rule.lastEvaluatedAt?.toISOString() ?? null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private exclusionCounts(
    selected: readonly EvaluatedInvitation[],
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const evaluation of selected) {
      for (const reason of evaluation.reasonCodes) {
        result[reason] = (result[reason] ?? 0) + 1;
      }
    }
    return result;
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

  private assertEventConfigurable(event: Pick<Event, "status">): void {
    if (event.status === "ARCHIVED") {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events are read-only.",
      });
    }
  }

  private dateInTimeZone(value: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: "year" | "month" | "day") =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
}
