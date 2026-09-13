import { createHash, randomUUID } from "node:crypto";
import {
  evaluateReminderEligibility,
  type ReminderEligibilityReason,
} from "@dawah/domain";
import type { ReminderJobData, ReminderRunJob } from "@dawah/queue";
import {
  Prisma,
  PrismaClient,
  type MessageStatus,
  type ReminderTriggerKind,
} from "@prisma/client";
import type {
  ReminderProcessorRepository,
  ReminderRuleRunResult,
} from "./reminder-processor";

const MINUTE_MILLISECONDS = 60_000;
const DAY_MINUTES = 24 * 60;
export const REMINDER_RULE_EVALUATION_INTERVAL_MILLISECONDS =
  60 * MINUTE_MILLISECONDS;
const SUCCESSFUL_MESSAGE_STATUSES = [
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
] as const satisfies readonly MessageStatus[];
const SUCCESSFUL_MESSAGE_STATUS_SET = new Set<MessageStatus>(
  SUCCESSFUL_MESSAGE_STATUSES,
);

type RunJobData = Extract<ReminderJobData, { readonly operation: "RUN" }>;

export class PrismaReminderRepository implements ReminderProcessorRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listDueRuleRuns(now: Date): Promise<readonly ReminderRunJob[]> {
    assertValidDate(now, "now");
    const scheduledFor = reminderEvaluationSlot(now);
    const rules = await this.prisma.reminderRule.findMany({
      where: {
        enabled: true,
        event: { status: "RSVP_OPEN" },
        OR: [
          { lastEvaluatedAt: null },
          { lastEvaluatedAt: { lt: scheduledFor } },
        ],
      },
      include: { event: true },
      orderBy: [{ lastEvaluatedAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    if (rules.length === 0) return [];

    const afterInitialEventIds = [
      ...new Set(
        rules
          .filter(
            ({ triggerKind }) => triggerKind === "AFTER_INITIAL_INVITATION",
          )
          .map(({ eventId }) => eventId),
      ),
    ];
    const acceptedInitialMessages =
      afterInitialEventIds.length === 0
        ? []
        : await this.prisma.message.findMany({
            where: {
              eventId: { in: afterInitialEventIds },
              messageType: "INVITATION",
              status: { in: [...SUCCESSFUL_MESSAGE_STATUSES] },
              sentAt: { not: null },
            },
            select: { eventId: true, sentAt: true },
            orderBy: [{ sentAt: "asc" }, { id: "asc" }],
          });
    const firstAcceptedAtByEvent = new Map<string, Date>();
    for (const message of acceptedInitialMessages) {
      if (message.sentAt && !firstAcceptedAtByEvent.has(message.eventId)) {
        firstAcceptedAtByEvent.set(message.eventId, message.sentAt);
      }
    }

    return rules
      .filter((rule) => {
        const dueAt = reminderRuleDueAt({
          triggerKind: rule.triggerKind,
          offsetMinutes: rule.offsetMinutes,
          eventTimezone: rule.event.timezone,
          rsvpDeadline: rule.event.rsvpDeadline,
          initialInvitationSentAt:
            firstAcceptedAtByEvent.get(rule.eventId) ?? null,
        });
        return dueAt !== null && dueAt <= now;
      })
      .map((rule) => ({
        eventId: rule.eventId,
        ruleId: rule.id,
        scheduleKey: scheduledReminderKey(
          rule.eventId,
          rule.id,
          rule.updatedAt,
          scheduledFor,
        ),
        scheduledFor: scheduledFor.toISOString(),
      }));
  }

  /**
   * Durable outbox reconciliation for the narrow failure window between a
   * committed reminder run and creation of its deterministic dispatch job.
   */
  public async listPendingReminderBatchIds(): Promise<readonly string[]> {
    const batches = await this.prisma.sendBatch.findMany({
      where: {
        messageType: "REMINDER",
        status: { in: ["QUEUED", "DISPATCHING", "IN_PROGRESS"] },
        messages: { some: { status: "QUEUED" } },
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    return batches.map(({ id }) => id);
  }

  public async runScheduledRule(
    data: RunJobData,
    now: Date,
  ): Promise<ReminderRuleRunResult> {
    assertValidDate(now, "now");
    const scheduledFor = new Date(data.scheduledFor);
    if (
      !UUID_PATTERN.test(data.eventId) ||
      !UUID_PATTERN.test(data.ruleId) ||
      !SHA256_PATTERN.test(data.scheduleKey) ||
      !Number.isFinite(scheduledFor.getTime()) ||
      scheduledFor.getTime() !==
        reminderEvaluationSlot(scheduledFor).getTime() ||
      scheduledFor > now
    ) {
      return { outcome: "SKIPPED", batchId: null };
    }

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`reminders:${data.eventId}`}, 0)) IS NULL AS locked
        `;
        const replay = await transaction.reminderRun.findFirst({
          where: {
            eventId: data.eventId,
            source: "SCHEDULED",
            scheduleKey: data.scheduleKey,
          },
          select: {
            sendBatchId: true,
            selectedCount: true,
            eligibleCount: true,
            excludedCount: true,
          },
        });
        if (replay) {
          return {
            outcome: "REPLAYED",
            batchId: replay.sendBatchId,
            selectedCount: replay.selectedCount,
            eligibleCount: replay.eligibleCount,
            excludedCount: replay.excludedCount,
          } as const;
        }

        await transaction.$queryRaw`
          SELECT "id" FROM "events" WHERE "id" = ${data.eventId}::uuid FOR SHARE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "reminder_rules"
          WHERE "id" = ${data.ruleId}::uuid AND "event_id" = ${data.eventId}::uuid
          FOR UPDATE
        `;
        const rule = await transaction.reminderRule.findFirst({
          where: { id: data.ruleId, eventId: data.eventId },
          include: {
            event: true,
            template: { include: { asset: true } },
          },
        });
        if (!rule || !rule.enabled) {
          return { outcome: "SKIPPED", batchId: null } as const;
        }
        const expectedScheduleKey = scheduledReminderKey(
          rule.eventId,
          rule.id,
          rule.updatedAt,
          scheduledFor,
        );
        if (expectedScheduleKey !== data.scheduleKey) {
          return { outcome: "SKIPPED", batchId: null } as const;
        }

        await transaction.$queryRaw`
          SELECT "id" FROM "invitation_groups"
          WHERE "event_id" = ${data.eventId}::uuid
          ORDER BY "id" FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT "invitation_group_id" FROM "reminder_recipient_states"
          WHERE "event_id" = ${data.eventId}::uuid
          ORDER BY "invitation_group_id" FOR UPDATE
        `;
        const invitations = await transaction.invitationGroup.findMany({
          where: { eventId: data.eventId },
          include: { members: { orderBy: { position: "asc" } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const invitationIds = invitations.map(({ id }) => id);
        const [snapshots, initialMessages, recipientStates, successfulItems] =
          invitationIds.length === 0
            ? ([[], [], [], []] as const)
            : await Promise.all([
                transaction.invitationContentSnapshot.findMany({
                  where: {
                    eventId: data.eventId,
                    templateId: rule.templateId,
                    invitationGroupId: { in: invitationIds },
                    isReady: true,
                  },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                }),
                transaction.message.findMany({
                  where: {
                    eventId: data.eventId,
                    invitationGroupId: { in: invitationIds },
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
                transaction.reminderRecipientState.findMany({
                  where: {
                    eventId: data.eventId,
                    invitationGroupId: { in: invitationIds },
                  },
                }),
                transaction.reminderRunItem.findMany({
                  where: {
                    eventId: data.eventId,
                    invitationGroupId: { in: invitationIds },
                    reminderRun: { ruleId: rule.id },
                    message: {
                      is: { status: { in: [...SUCCESSFUL_MESSAGE_STATUSES] } },
                    },
                  },
                  select: { invitationGroupId: true },
                }),
              ]);

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
        const sentCountByInvitation = new Map<string, number>();
        for (const item of successfulItems) {
          sentCountByInvitation.set(
            item.invitationGroupId,
            (sentCountByInvitation.get(item.invitationGroupId) ?? 0) + 1,
          );
        }
        const snapshotBySource = new Map<string, (typeof snapshots)[number]>();
        for (const snapshot of snapshots) {
          const key = `${snapshot.invitationGroupId}:${snapshot.sourceHash}`;
          if (!snapshotBySource.has(key)) snapshotBySource.set(key, snapshot);
        }
        const providerReady =
          rule.template.purpose === "REMINDER" &&
          rule.template.status === "APPROVED" &&
          rule.template.provider === "META_WHATSAPP" &&
          Boolean(rule.template.providerTemplateName?.trim());
        const cooldownMilliseconds = rule.cooldownMinutes * MINUTE_MILLISECONDS;
        const evaluations = invitations.map((invitation) => {
          const initialMessage = initialByInvitation.get(invitation.id) ?? null;
          const sourceHash = invitationSourceHash(
            rule.event,
            invitation,
            rule.template,
          );
          const snapshot =
            snapshotBySource.get(`${invitation.id}:${sourceHash}`) ?? null;
          const lastReminderAt =
            lastReminderByInvitation.get(invitation.id) ?? null;
          const initialInvitationSentAt = initialMessage?.sentAt ?? null;
          const dueAt = reminderRuleDueAt({
            triggerKind: rule.triggerKind,
            offsetMinutes: rule.offsetMinutes,
            eventTimezone: rule.event.timezone,
            rsvpDeadline: rule.event.rsvpDeadline,
            initialInvitationSentAt,
          });
          const result = evaluateReminderEligibility({
            eventStatus: rule.event.status,
            invitationCancelled: invitation.cancelledAt !== null,
            rsvpStatus: invitation.rsvpStatus,
            hasSuccessfulInitialSend: Boolean(
              initialMessage &&
              initialInvitationSentAt &&
              SUCCESSFUL_MESSAGE_STATUS_SET.has(initialMessage.status),
            ),
            initialDestinationReachable: !initialMessage
              ? true
              : !["FAILED", "CANCELLED"].includes(initialMessage.status),
            hasCurrentSnapshot: snapshot !== null,
            hasCurrentTemplate: providerReady,
            matchesAudience: true,
            now,
            lastReminderSentAt: lastReminderAt,
            cooldownMilliseconds,
            sentReminderCount: sentCountByInvitation.get(invitation.id) ?? 0,
            rule: {
              dueAt,
              maximumReminderCount: rule.maximumReminders,
            },
          });
          return {
            invitation,
            snapshot,
            initialInvitationSentAt,
            lastReminderAt,
            eligible: result.eligible,
            reasonCodes: result.reasonCodes,
          };
        });
        const eligible = evaluations.filter(
          (evaluation) => evaluation.eligible,
        );
        const evaluatedAt = now;
        const requestHash = hash({
          operation: "reminder.run.scheduled",
          eventId: data.eventId,
          ruleId: data.ruleId,
          scheduleKey: data.scheduleKey,
          scheduledFor: data.scheduledFor,
        });
        const selectionHash = hash(
          evaluations.map((evaluation) => ({
            invitationId: evaluation.invitation.id,
            eligible: evaluation.eligible,
            reasonCodes: evaluation.reasonCodes,
            snapshotId: evaluation.snapshot?.id ?? null,
            initialInvitationSentAt:
              evaluation.initialInvitationSentAt?.toISOString() ?? null,
            lastReminderAt: evaluation.lastReminderAt?.toISOString() ?? null,
          })),
        );
        const runId = randomUUID();
        const batchId = eligible.length > 0 ? randomUUID() : null;
        const messageIds = new Map(
          eligible.map((evaluation) => [
            evaluation.invitation.id,
            randomUUID(),
          ]),
        );

        if (batchId) {
          await transaction.sendBatch.create({
            data: {
              id: batchId,
              eventId: data.eventId,
              createdBy: rule.createdBy,
              status: "QUEUED",
              messageType: "REMINDER",
              requestHash,
              selectionHash,
              confirmationHash: data.scheduleKey,
              totalMessages: eligible.length,
              estimatedCreditUnits: eligible.length,
              queuedAt: evaluatedAt,
            },
          });
          await transaction.message.createMany({
            data: eligible.map((evaluation) => {
              const snapshot = evaluation.snapshot!;
              return {
                id: messageIds.get(evaluation.invitation.id)!,
                eventId: data.eventId,
                sendBatchId: batchId,
                invitationGroupId: evaluation.invitation.id,
                contentSnapshotId: snapshot.id,
                provider: rule.template.provider,
                messageType: "REMINDER" as const,
                status: "QUEUED" as const,
                recipientPhoneE164: evaluation.invitation.phoneE164,
                providerTemplateName: rule.template.providerTemplateName!,
                templateId: snapshot.templateId,
                templateVersion: snapshot.templateVersion,
                locale: snapshot.locale,
                templateVariables: snapshot.variables as Prisma.InputJsonValue,
                templateParameterOrder: rule.template
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
        }
        await transaction.reminderRun.create({
          data: {
            id: runId,
            eventId: data.eventId,
            ruleId: rule.id,
            sendBatchId: batchId,
            createdBy: rule.createdBy,
            source: "SCHEDULED",
            status: batchId ? "QUEUED" : "COMPLETED",
            requestHash,
            selectionHash,
            scheduleKey: data.scheduleKey,
            cooldownMinutes: rule.cooldownMinutes,
            selectedCount: evaluations.length,
            eligibleCount: eligible.length,
            excludedCount: evaluations.length - eligible.length,
            evaluatedAt,
            completedAt: batchId ? null : evaluatedAt,
          },
        });
        await transaction.reminderRunItem.createMany({
          data: evaluations.map((evaluation) => ({
            id: randomUUID(),
            eventId: data.eventId,
            reminderRunId: runId,
            invitationGroupId: evaluation.invitation.id,
            messageId: messageIds.get(evaluation.invitation.id) ?? null,
            outcome: evaluation.eligible
              ? ("ELIGIBLE" as const)
              : ("EXCLUDED" as const),
            reasonCodes: [...evaluation.reasonCodes],
            initialInvitationSentAt: evaluation.initialInvitationSentAt,
            lastReminderAt: evaluation.lastReminderAt,
          })),
        });
        for (const evaluation of eligible) {
          const messageId = messageIds.get(evaluation.invitation.id)!;
          await transaction.reminderRecipientState.upsert({
            where: {
              eventId_invitationGroupId: {
                eventId: data.eventId,
                invitationGroupId: evaluation.invitation.id,
              },
            },
            create: {
              eventId: data.eventId,
              invitationGroupId: evaluation.invitation.id,
              lastReminderMessageId: messageId,
              lastQueuedAt: evaluatedAt,
            },
            update: {
              lastReminderMessageId: messageId,
              lastQueuedAt: evaluatedAt,
            },
          });
        }
        await transaction.reminderRule.update({
          where: { id: rule.id },
          data: { lastEvaluatedAt: evaluatedAt },
        });
        await transaction.auditLog.create({
          data: {
            eventId: data.eventId,
            actorType: "SYSTEM",
            action: batchId ? "reminder_run.queued" : "reminder_run.evaluated",
            targetType: "ReminderRun",
            targetId: runId,
            metadata: {
              source: "SCHEDULED",
              ruleId: rule.id,
              sendBatchId: batchId,
              scheduleKey: data.scheduleKey,
              scheduledFor: data.scheduledFor,
              selectedCount: evaluations.length,
              eligibleCount: eligible.length,
              excludedCount: evaluations.length - eligible.length,
              cooldownMinutes: rule.cooldownMinutes,
              maximumReminders: rule.maximumReminders,
              exclusionCounts: exclusionCounts(evaluations),
            },
          },
        });
        return {
          outcome: "CREATED",
          batchId,
          selectedCount: evaluations.length,
          eligibleCount: eligible.length,
          excludedCount: evaluations.length - eligible.length,
        } as const;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );
  }
}

export interface ReminderRuleDueAtInput {
  readonly triggerKind: ReminderTriggerKind;
  readonly offsetMinutes: number;
  readonly eventTimezone: string;
  readonly rsvpDeadline: Date | null;
  readonly initialInvitationSentAt: Date | null;
}

export function reminderRuleDueAt(input: ReminderRuleDueAtInput): Date | null {
  if (!Number.isSafeInteger(input.offsetMinutes) || input.offsetMinutes < 0) {
    throw new RangeError("offsetMinutes must be a non-negative safe integer.");
  }
  if (input.triggerKind === "AFTER_INITIAL_INVITATION") {
    if (!input.initialInvitationSentAt) return null;
    assertValidDate(input.initialInvitationSentAt, "initialInvitationSentAt");
    return new Date(
      input.initialInvitationSentAt.getTime() +
        input.offsetMinutes * MINUTE_MILLISECONDS,
    );
  }
  if (!input.rsvpDeadline) return null;
  assertValidDate(input.rsvpDeadline, "rsvpDeadline");
  const deadline = input.rsvpDeadline.toISOString().slice(0, 10);
  const offsetDays = Math.floor(input.offsetMinutes / DAY_MINUTES);
  return zonedStartOfDay(
    addCalendarDays(deadline, -offsetDays),
    input.eventTimezone,
  );
}

export function reminderEvaluationSlot(now: Date): Date {
  assertValidDate(now, "now");
  return new Date(
    Math.floor(now.getTime() / REMINDER_RULE_EVALUATION_INTERVAL_MILLISECONDS) *
      REMINDER_RULE_EVALUATION_INTERVAL_MILLISECONDS,
  );
}

function scheduledReminderKey(
  eventId: string,
  ruleId: string,
  ruleUpdatedAt: Date,
  scheduledFor: Date,
): string {
  return hash({
    operation: "reminder.run.scheduled",
    eventId,
    ruleId,
    ruleUpdatedAt: ruleUpdatedAt.toISOString(),
    scheduledFor: scheduledFor.toISOString(),
  });
}

function invitationSourceHash(
  event: {
    readonly id: string;
    readonly nameAr: string;
    readonly nameEn: string | null;
    readonly eventDate: Date;
    readonly startTime: Date;
    readonly venueNameAr: string;
    readonly venueNameEn: string | null;
    readonly timezone: string;
  },
  invitation: {
    readonly id: string;
    readonly displayName: string;
    readonly phoneE164: string;
    readonly invitationType: string;
    readonly maxCompanions: number;
    readonly cancelledAt: Date | null;
    readonly members: readonly {
      readonly name: string;
      readonly isPrimary: boolean;
      readonly position: number;
    }[];
  },
  template: {
    readonly id: string;
    readonly version: number;
    readonly locale: string;
    readonly status: string;
    readonly contentHash: string;
    readonly provider: string;
    readonly providerTemplateName: string | null;
    readonly assetId: string | null;
    readonly asset: { readonly sha256: string | null } | null;
  },
): string {
  return hash({
    event: {
      id: event.id,
      nameAr: event.nameAr,
      nameEn: event.nameEn,
      date: event.eventDate.toISOString(),
      time: event.startTime.toISOString(),
      venueNameAr: event.venueNameAr,
      venueNameEn: event.venueNameEn,
      timezone: event.timezone,
    },
    invitation: {
      id: invitation.id,
      displayName: invitation.displayName,
      phoneE164: invitation.phoneE164,
      invitationType: invitation.invitationType,
      maxCompanions: invitation.maxCompanions,
      cancelledAt: invitation.cancelledAt?.toISOString() ?? null,
      members: invitation.members.map((member) => ({
        name: member.name,
        isPrimary: member.isPrimary,
        position: member.position,
      })),
    },
    template: {
      id: template.id,
      version: template.version,
      locale: template.locale,
      status: template.status,
      contentHash: template.contentHash,
      provider: template.provider,
      providerTemplateName: template.providerTemplateName,
      assetId: template.assetId,
      assetSha256: template.asset?.sha256 ?? null,
    },
  });
}

function exclusionCounts(
  evaluations: readonly {
    readonly reasonCodes: readonly ReminderEligibilityReason[];
  }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const evaluation of evaluations) {
    for (const reason of evaluation.reasonCodes) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedStartOfDay(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desiredWallClock = Date.UTC(year!, month! - 1, day!);
  let candidate = desiredWallClock;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let index = 0; index < 4; index += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter(({ type }) => type !== "literal")
        .map(({ type, value }) => [type, Number(value)]),
    );
    const representedWallClock = Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    );
    const adjustment = desiredWallClock - representedWallClock;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
    .join(",")}}`;
}

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError(`${name} must be a valid Date.`);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
