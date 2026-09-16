import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  checkInDashboardSchema,
  checkInPartySchema,
  checkInResultSchema,
  publicEntryPassSchema,
  resolvedEntryPassSchema,
  searchCheckInPartiesResponseSchema,
  type CheckInDashboard,
  type CheckInParty,
  type CheckInResult,
  type CreateCheckInInput,
  type PublicEntryPass,
  type ResolvedEntryPass,
  type SearchCheckInPartiesQuery,
  type SearchCheckInPartiesResponse,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import {
  calculateCheckInIncrement,
  checkInRequestFingerprint,
  CheckInInvariantError,
  createEntryPassToken,
  hashCheckInIdempotencyKey,
  hashEntryPassToken,
  maskPhoneNumber,
  Permission,
  verifyEntryPassToken,
} from "@dawah/domain";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";

const CHECK_IN_OPERATION = "EVENT_CHECK_IN";
const IDEMPOTENCY_TTL_MILLISECONDS = 7 * 24 * 60 * 60_000;
const ENTRY_PASS_TTL_MILLISECONDS = 2 * 24 * 60 * 60_000;
const MAX_TRANSACTION_ATTEMPTS = 3;

const partySelect = Prisma.validator<Prisma.InvitationGroupSelect>()({
  id: true,
  eventId: true,
  displayName: true,
  phoneE164: true,
  rsvpStatus: true,
  expectedAttendees: true,
  cancelledAt: true,
  checkInState: {
    include: {
      lastCheckedInByUser: {
        select: { displayName: true, email: true },
      },
    },
  },
});

type PartyInvitation = Prisma.InvitationGroupGetPayload<{
  select: typeof partySelect;
}>;

interface DashboardAggregateRow {
  readonly expectedAttendance: number;
  readonly checkedInAttendance: number;
  readonly invitationGroups: number;
  readonly fullyCheckedInGroups: number;
  readonly partiallyCheckedInGroups: number;
  readonly notArrivedGroups: number;
}

@Injectable()
export class CheckInsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async issuePublicEntryPass(token: string): Promise<PublicEntryPass> {
    this.assertPublicFeatureEnabled();
    const tokenHash = this.publicCapabilityHash(token);

    return this.withSerializableRetry(async (transaction) => {
      const initial = await transaction.publicInvitationCapability.findUnique({
        where: { tokenHash },
        select: { invitationGroupId: true },
      });
      if (!initial) this.publicInvitationNotFound();

      await this.lockInvitation(transaction, initial.invitationGroupId);
      const capability = await transaction.publicInvitationCapability.findUnique(
        {
          where: { tokenHash },
          include: {
            invitationGroup: {
              include: {
                event: true,
                entryPasses: {
                  where: { revokedAt: null },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                },
              },
            },
          },
        },
      );
      const now = new Date();
      if (
        !capability ||
        capability.revokedAt ||
        (capability.expiresAt && capability.expiresAt <= now)
      ) {
        this.publicInvitationNotFound();
      }

      const invitation = capability.invitationGroup;
      this.assertPublicPassEligible(invitation, now);
      const existing = invitation.entryPasses[0] ?? null;
      if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
        const existingToken = this.entryPassToken(existing.id);
        if (hashEntryPassToken(existingToken) !== existing.tokenHash) {
          throw new ConflictException({
            code: "ENTRY_PASS_KEY_ROTATED",
            message: "The existing entry pass must be reissued by support.",
          });
        }
        return publicEntryPassSchema.parse({
          token: existingToken,
          qrPayload: existingToken,
          issuedAt: existing.createdAt.toISOString(),
          expiresAt: existing.expiresAt?.toISOString() ?? null,
        });
      }

      if (existing) {
        await transaction.entryPass.update({
          where: { id: existing.id },
          data: { revokedAt: now },
        });
      }

      const passId = randomUUID();
      const passToken = this.entryPassToken(passId);
      const expiresAt = new Date(
        Math.max(
          invitation.event.eventDate.getTime() + ENTRY_PASS_TTL_MILLISECONDS,
          now.getTime() + 60 * 60_000,
        ),
      );
      const entryPass = await transaction.entryPass.create({
        data: {
          id: passId,
          eventId: invitation.eventId,
          invitationGroupId: invitation.id,
          tokenHash: hashEntryPassToken(passToken),
          expiresAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: invitation.eventId,
          actorType: "GUEST",
          action: "entry_pass.issued",
          targetType: "InvitationGroup",
          targetId: invitation.id,
          metadata: {
            entryPassId: entryPass.id,
            capabilityId: capability.id,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      return publicEntryPassSchema.parse({
        token: passToken,
        qrPayload: passToken,
        issuedAt: entryPass.createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
    });
  }

  public async resolveEntryPass(
    principal: AuthPrincipal,
    eventId: string,
    token: string,
  ): Promise<ResolvedEntryPass> {
    const { event, membership } = await this.access.resolve(
      principal,
      eventId,
      Permission.CHECKIN_USE,
    );
    this.assertHostFeatureEnabled(event, true);
    const passId = verifyEntryPassToken(token, this.signingSecret());
    if (!passId) this.entryPassNotFound();

    const entryPass = await this.prisma.entryPass.findFirst({
      where: { id: passId, eventId },
      include: { invitationGroup: { select: partySelect } },
    });
    const now = new Date();
    if (
      !entryPass ||
      entryPass.tokenHash !== hashEntryPassToken(token) ||
      entryPass.revokedAt ||
      (entryPass.expiresAt && entryPass.expiresAt <= now) ||
      !this.isInvitationEligible(entryPass.invitationGroup)
    ) {
      this.entryPassNotFound();
    }

    return resolvedEntryPassSchema.parse({
      ...this.toParty(
        entryPass.invitationGroup,
        this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
      ),
      resolvedAt: now.toISOString(),
    });
  }

  public async search(
    principal: AuthPrincipal,
    eventId: string,
    query: SearchCheckInPartiesQuery,
  ): Promise<SearchCheckInPartiesResponse> {
    const { event, membership } = await this.access.resolve(
      principal,
      eventId,
      Permission.CHECKIN_USE,
    );
    this.assertHostFeatureEnabled(event, true);
    const canViewPhone = this.access.allows(
      membership,
      Permission.GUEST_PHONE_VIEW,
    );
    const invitations = await this.prisma.invitationGroup.findMany({
      where: {
        eventId,
        cancelledAt: null,
        expectedAttendees: { gt: 0 },
        rsvpStatus: { in: ["ACCEPTED", "PARTIALLY_ACCEPTED"] },
        OR: [
          { displayName: { contains: query.query, mode: "insensitive" } },
          { contactName: { contains: query.query, mode: "insensitive" } },
          ...(canViewPhone
            ? [
                {
                  phoneE164: {
                    contains: query.query.replaceAll(" ", ""),
                  },
                } as const,
              ]
            : []),
        ],
      },
      select: partySelect,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: query.limit,
    });
    return searchCheckInPartiesResponseSchema.parse({
      items: invitations.map((invitation) =>
        this.toParty(invitation, canViewPhone),
      ),
    });
  }

  public async dashboard(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<CheckInDashboard> {
    const { event } = await this.access.resolve(
      principal,
      eventId,
      Permission.CHECKIN_USE,
    );
    this.assertHostFeatureEnabled(event, false);
    const [aggregateRows, duplicateAttempts, recent] = await Promise.all([
      this.prisma.$queryRaw<DashboardAggregateRow[]>`
        SELECT
          COALESCE(SUM(i."expected_attendees"), 0)::int AS "expectedAttendance",
          COALESCE(SUM(COALESCE(s."checked_in_count", 0)), 0)::int AS "checkedInAttendance",
          COUNT(*)::int AS "invitationGroups",
          COUNT(*) FILTER (
            WHERE COALESCE(s."checked_in_count", 0) = i."expected_attendees"
          )::int AS "fullyCheckedInGroups",
          COUNT(*) FILTER (
            WHERE COALESCE(s."checked_in_count", 0) > 0
              AND COALESCE(s."checked_in_count", 0) < i."expected_attendees"
          )::int AS "partiallyCheckedInGroups",
          COUNT(*) FILTER (
            WHERE COALESCE(s."checked_in_count", 0) = 0
          )::int AS "notArrivedGroups"
        FROM "invitation_groups" i
        LEFT JOIN "check_in_states" s
          ON s."invitation_group_id" = i."id"
          AND s."event_id" = i."event_id"
        WHERE i."event_id" = ${eventId}::uuid
          AND i."cancelled_at" IS NULL
          AND i."rsvp_status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
          AND i."expected_attendees" > 0
      `,
      this.prisma.auditLog.count({
        where: { eventId, action: "check_in.duplicate_attempt" },
      }),
      this.prisma.checkInRecord.findMany({
        where: { eventId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        include: {
          invitationGroup: {
            select: { displayName: true, expectedAttendees: true },
          },
          actor: { select: { displayName: true, email: true } },
        },
      }),
    ]);
    const aggregate = aggregateRows[0] ?? {
      expectedAttendance: 0,
      checkedInAttendance: 0,
      invitationGroups: 0,
      fullyCheckedInGroups: 0,
      partiallyCheckedInGroups: 0,
      notArrivedGroups: 0,
    };
    const remainingAttendance = Math.max(
      aggregate.expectedAttendance - aggregate.checkedInAttendance,
      0,
    );

    return checkInDashboardSchema.parse({
      eventId,
      expectedAttendance: aggregate.expectedAttendance,
      checkedInAttendance: aggregate.checkedInAttendance,
      remainingAttendance,
      checkInPercentage:
        aggregate.expectedAttendance === 0
          ? 0
          : Math.round(
              (aggregate.checkedInAttendance /
                aggregate.expectedAttendance) *
                100,
            ),
      invitationGroups: aggregate.invitationGroups,
      fullyCheckedInGroups: aggregate.fullyCheckedInGroups,
      partiallyCheckedInGroups: aggregate.partiallyCheckedInGroups,
      notArrivedGroups: aggregate.notArrivedGroups,
      duplicateAttempts,
      recentArrivals: recent.map((record) => ({
        recordId: record.id,
        invitationGroupId: record.invitationGroupId,
        displayName: record.invitationGroup.displayName,
        attendeeCount: record.attendeeCount,
        checkedInAttendance: record.newCount,
        confirmedAttendance: record.invitationGroup.expectedAttendees,
        source: record.source,
        checkedInAt: record.createdAt.toISOString(),
        checkedInBy: this.actorLabel(record.actor),
        deviceId: record.deviceId,
      })),
      calculatedAt: new Date().toISOString(),
    });
  }

  public async checkIn(
    principal: AuthPrincipal,
    eventId: string,
    idempotencyKey: string,
    input: CreateCheckInInput,
  ): Promise<CheckInResult> {
    const keyHash = hashCheckInIdempotencyKey(idempotencyKey);
    const requestHash = checkInRequestFingerprint({
      eventId,
      invitationGroupId: input.invitationGroupId,
      attendeeCount: input.attendeeCount,
      source: input.source,
      deviceId: input.deviceId,
    });

    return this.withSerializableRetry(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.CHECKIN_USE,
        transaction,
      );
      this.assertHostFeatureEnabled(event, true);

      const existing = await transaction.idempotencyRecord.findUnique({
        where: {
          eventId_operation_keyHash: {
            eventId,
            operation: CHECK_IN_OPERATION,
            keyHash,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: "IDEMPOTENCY_KEY_REUSED",
            message:
              "The Idempotency-Key was already used with a different check-in request.",
          });
        }
        if (existing.status !== "COMPLETED" || !existing.responseBody) {
          throw new ConflictException({
            code: "IDEMPOTENT_REQUEST_IN_PROGRESS",
            message: "The original check-in is still being processed.",
          });
        }
        const replay = checkInResultSchema.parse(existing.responseBody);
        return checkInResultSchema.parse({
          ...replay,
          idempotentReplay: true,
        });
      }

      const now = new Date();
      const idempotency = await transaction.idempotencyRecord.create({
        data: {
          eventId,
          operation: CHECK_IN_OPERATION,
          keyHash,
          requestHash,
          status: "IN_PROGRESS",
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
        },
      });

      await this.lockInvitation(transaction, input.invitationGroupId, eventId);
      const invitation = await transaction.invitationGroup.findFirst({
        where: { id: input.invitationGroupId, eventId },
        select: partySelect,
      });
      if (!invitation) this.invitationNotFound();
      if (!this.isInvitationEligible(invitation)) {
        throw new ConflictException({
          code: "CHECK_IN_NOT_ELIGIBLE",
          message: "Only an active invitation with confirmed attendance can be checked in.",
        });
      }

      let state = invitation.checkInState;
      if (!state) {
        state = await transaction.checkInState.create({
          data: {
            eventId,
            invitationGroupId: invitation.id,
          },
          include: {
            lastCheckedInByUser: {
              select: { displayName: true, email: true },
            },
          },
        });
      }

      if (state.checkedInCount >= invitation.expectedAttendees) {
        const result = checkInResultSchema.parse({
          outcome: "ALREADY_CHECKED_IN",
          invitationGroupId: invitation.id,
          displayName: invitation.displayName,
          confirmedAttendance: invitation.expectedAttendees,
          previousCheckedInAttendance: state.checkedInCount,
          checkedInAttendance: state.checkedInCount,
          remainingAttendance: 0,
          incrementedBy: 0,
          checkedInAt: state.lastCheckedInAt?.toISOString() ?? null,
          checkedInBy: this.actorLabel(state.lastCheckedInByUser),
          deviceId: state.lastDeviceId,
          recordId: null,
          idempotentReplay: false,
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "check_in.duplicate_attempt",
            targetType: "InvitationGroup",
            targetId: invitation.id,
            metadata: {
              source: input.source,
              deviceId: input.deviceId ?? null,
              checkedInAttendance: state.checkedInCount,
              confirmedAttendance: invitation.expectedAttendees,
            },
          },
        });
        await this.completeIdempotency(transaction, idempotency.id, result, now);
        return result;
      }

      let increment;
      try {
        increment = calculateCheckInIncrement({
          confirmedAttendance: invitation.expectedAttendees,
          checkedInAttendance: state.checkedInCount,
          attendeeCount: input.attendeeCount,
        });
      } catch (error) {
        if (error instanceof CheckInInvariantError) {
          throw new ConflictException({
            code: error.code,
            message: error.message,
          });
        }
        throw error;
      }

      const updatedState = await transaction.checkInState.update({
        where: { id: state.id },
        data: {
          checkedInCount: increment.checkedInAttendance,
          version: { increment: 1 },
          firstCheckedInAt: state.firstCheckedInAt ?? now,
          lastCheckedInAt: now,
          lastCheckedInByUserId: user.id,
          lastDeviceId: input.deviceId ?? null,
        },
      });
      const record = await transaction.checkInRecord.create({
        data: {
          eventId,
          invitationGroupId: invitation.id,
          checkInStateId: updatedState.id,
          actorUserId: user.id,
          actorMembershipId: membership.id,
          source: input.source,
          attendeeCount: input.attendeeCount,
          previousCount: increment.previousAttendance,
          newCount: increment.checkedInAttendance,
          deviceId: input.deviceId ?? null,
          idempotencyKeyHash: keyHash,
          requestHash,
        },
      });
      const result = checkInResultSchema.parse({
        outcome: increment.complete
          ? "CHECKED_IN"
          : "PARTIALLY_CHECKED_IN",
        invitationGroupId: invitation.id,
        displayName: invitation.displayName,
        confirmedAttendance: invitation.expectedAttendees,
        previousCheckedInAttendance: increment.previousAttendance,
        checkedInAttendance: increment.checkedInAttendance,
        remainingAttendance: increment.remainingAttendance,
        incrementedBy: input.attendeeCount,
        checkedInAt: record.createdAt.toISOString(),
        checkedInBy: this.actorLabel(user),
        deviceId: record.deviceId,
        recordId: record.id,
        idempotentReplay: false,
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "check_in.recorded",
          targetType: "InvitationGroup",
          targetId: invitation.id,
          metadata: {
            recordId: record.id,
            source: input.source,
            deviceId: input.deviceId ?? null,
            attendeeCount: input.attendeeCount,
            previousCheckedInAttendance: increment.previousAttendance,
            checkedInAttendance: increment.checkedInAttendance,
            confirmedAttendance: invitation.expectedAttendees,
          },
        },
      });
      await this.completeIdempotency(transaction, idempotency.id, result, now);
      return result;
    });
  }

  private async completeIdempotency(
    transaction: Prisma.TransactionClient,
    id: string,
    result: CheckInResult,
    completedAt: Date,
  ): Promise<void> {
    await transaction.idempotencyRecord.update({
      where: { id },
      data: {
        status: "COMPLETED",
        responseStatus: 200,
        responseBody: result as Prisma.InputJsonValue,
        completedAt,
      },
    });
  }

  private toParty(
    invitation: PartyInvitation,
    canViewPhone: boolean,
  ): CheckInParty {
    const checkedInAttendance = invitation.checkInState?.checkedInCount ?? 0;
    const remainingAttendance = Math.max(
      invitation.expectedAttendees - checkedInAttendance,
      0,
    );
    const status =
      checkedInAttendance === 0
        ? "NOT_ARRIVED"
        : remainingAttendance === 0
          ? "CHECKED_IN"
          : "PARTIALLY_CHECKED_IN";
    return checkInPartySchema.parse({
      invitationGroupId: invitation.id,
      displayName: invitation.displayName,
      phoneDisplay: canViewPhone
        ? invitation.phoneE164
        : maskPhoneNumber(invitation.phoneE164),
      phoneMasked: !canViewPhone,
      confirmedAttendance: invitation.expectedAttendees,
      checkedInAttendance,
      remainingAttendance,
      status,
      firstCheckedInAt:
        invitation.checkInState?.firstCheckedInAt?.toISOString() ?? null,
      lastCheckedInAt:
        invitation.checkInState?.lastCheckedInAt?.toISOString() ?? null,
      lastCheckedInBy: this.actorLabel(
        invitation.checkInState?.lastCheckedInByUser ?? null,
      ),
      lastDeviceId: invitation.checkInState?.lastDeviceId ?? null,
    });
  }

  private isInvitationEligible(
    invitation: Pick<
      PartyInvitation,
      "cancelledAt" | "expectedAttendees" | "rsvpStatus"
    >,
  ): boolean {
    return (
      !invitation.cancelledAt &&
      invitation.expectedAttendees > 0 &&
      (invitation.rsvpStatus === "ACCEPTED" ||
        invitation.rsvpStatus === "PARTIALLY_ACCEPTED")
    );
  }

  private assertPublicPassEligible(
    invitation: {
      readonly cancelledAt: Date | null;
      readonly expectedAttendees: number;
      readonly rsvpStatus: string;
      readonly event: {
        readonly archivedAt: Date | null;
        readonly qrEnabled: boolean;
        readonly status: string;
      };
    },
    _now: Date,
  ): void {
    if (
      invitation.cancelledAt ||
      invitation.expectedAttendees <= 0 ||
      !["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(invitation.rsvpStatus) ||
      !invitation.event.qrEnabled ||
      invitation.event.archivedAt ||
      !["ACTIVE", "RSVP_OPEN", "RSVP_CLOSED", "EVENT_DAY"].includes(
        invitation.event.status,
      )
    ) {
      this.publicInvitationNotFound();
    }
  }

  private assertPublicFeatureEnabled(): void {
    if (!this.config.get("CHECK_IN_ENABLED", { infer: true })) {
      this.publicInvitationNotFound();
    }
  }

  private assertHostFeatureEnabled(
    event: {
      readonly archivedAt: Date | null;
      readonly qrEnabled: boolean;
      readonly status: string;
    },
    requiresEventDay: boolean,
  ): void {
    if (!this.config.get("CHECK_IN_ENABLED", { infer: true })) {
      throw new ConflictException({
        code: "CHECK_IN_FEATURE_DISABLED",
        message: "Event-day check-in is not enabled in this environment.",
      });
    }
    if (!event.qrEnabled) {
      throw new ConflictException({
        code: "CHECK_IN_DISABLED",
        message: "Enable QR check-in for this event before using check-in tools.",
      });
    }
    if (
      event.archivedAt ||
      event.status === "ARCHIVED" ||
      (requiresEventDay && event.status !== "EVENT_DAY") ||
      (!requiresEventDay &&
        event.status !== "EVENT_DAY" &&
        event.status !== "COMPLETED")
    ) {
      throw new ConflictException({
        code: "CHECK_IN_EVENT_NOT_ACTIVE",
        message: requiresEventDay
          ? "Check-in operations are available only while the event is in event-day mode."
          : "The check-in dashboard is available on event day and after completion.",
      });
    }
  }

  private actorLabel(
    actor: { readonly displayName: string | null; readonly email: string | null } | null,
  ): string | null {
    const label = actor?.displayName?.trim() || actor?.email?.trim() || null;
    return label?.slice(0, 160) ?? null;
  }

  private async lockInvitation(
    transaction: Prisma.TransactionClient,
    invitationId: string,
    eventId?: string,
  ): Promise<void> {
    const rows = eventId
      ? await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "invitation_groups"
          WHERE "id" = ${invitationId}::uuid
            AND "event_id" = ${eventId}::uuid
          FOR UPDATE
        `
      : await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "invitation_groups"
          WHERE "id" = ${invitationId}::uuid
          FOR UPDATE
        `;
    if (rows.length === 0) this.invitationNotFound();
  }

  private async withSerializableRetry<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034")
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("The serializable transaction retry loop was exhausted.");
  }

  private publicCapabilityHash(token: string): string {
    if (typeof token !== "string" || token.length === 0 || token.length > 512) {
      this.publicInvitationNotFound();
    }
    return hashEntryPassToken(token);
  }

  private entryPassToken(passId: string): string {
    return createEntryPassToken(passId, this.signingSecret());
  }

  private signingSecret(): string {
    return this.config.get("CHECK_IN_TOKEN_SIGNING_SECRET", { infer: true });
  }

  private publicInvitationNotFound(): never {
    throw new NotFoundException({
      code: "PUBLIC_INVITATION_NOT_FOUND",
      message: "This invitation link is invalid or no longer available.",
    });
  }

  private entryPassNotFound(): never {
    throw new NotFoundException({
      code: "ENTRY_PASS_NOT_FOUND",
      message: "The entry pass is invalid or no longer available.",
    });
  }

  private invitationNotFound(): never {
    throw new NotFoundException({
      code: "INVITATION_NOT_FOUND",
      message: "The invitation does not exist or is not accessible.",
    });
  }
}
