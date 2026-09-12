import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  hostRsvpDetailSchema,
  issuedPublicInvitationCapabilitySchema,
  publicInvitationCapabilityStatusSchema,
  publicInvitationSchema,
  rsvpResultSchema,
  type HostRsvpDetail,
  type IssuePublicInvitationCapabilityInput,
  type IssuedPublicInvitationCapability,
  type PublicInvitation,
  type PublicInvitationCapabilityStatus,
  type PublicInvitationLocaleQuery,
  type RsvpResult,
  type SubmitRsvpInput,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";
import {
  evaluateGuestRsvpPolicy,
  InvitationInvariantError,
  Permission,
  resolveRsvpSelection,
} from "@dawah/domain";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { MessagingQueueService } from "../messaging/messaging-queue.service";
import { PrismaService } from "../prisma/prisma.service";

const invitationRsvpInclude = Prisma.validator<Prisma.InvitationGroupInclude>()(
  {
    event: true,
    members: { orderBy: [{ position: "asc" }, { id: "asc" }] },
    rsvp: { include: { members: true } },
    rsvpHistory: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1_000,
    },
  },
);

type InvitationForRsvp = Prisma.InvitationGroupGetPayload<{
  include: typeof invitationRsvpInclude;
}>;
type RsvpClient = PrismaService | Prisma.TransactionClient;
type PublicLocale = PublicInvitationLocaleQuery["locale"];
type StoredLocale = "ar_SA" | "en";
type ApplySource = "GUEST_WEB" | "HOST_MANUAL";

interface ApplyActor {
  readonly source: ApplySource;
  readonly actorType: "GUEST" | "USER";
  readonly actorReference: string;
  readonly actorUserId?: string;
}

interface AppliedRsvp {
  readonly result: RsvpResult;
  readonly confirmationId: string | null;
}

type ResponseSnapshot = {
  readonly status: "PENDING" | "ACCEPTED" | "PARTIALLY_ACCEPTED" | "DECLINED";
  readonly attendingMemberIds: readonly string[];
  readonly companionCount: number;
  readonly expectedAttendees: number;
} & Prisma.InputJsonObject;

@Injectable()
export class RsvpService {
  private readonly logger = new Logger(RsvpService.name);

  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(MessagingQueueService)
    private readonly messagingQueue: MessagingQueueService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async getPublicInvitation(
    token: string,
    locale: PublicLocale,
  ): Promise<PublicInvitation> {
    const capability = await this.findValidCapability(this.prisma, token);
    return this.toPublicInvitation(capability.invitationGroup, locale);
  }

  public async submitGuest(
    token: string,
    locale: PublicLocale,
    input: SubmitRsvpInput,
  ): Promise<RsvpResult> {
    const applied = await this.withDomainErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const tokenHash = this.tokenHash(token);
        const initial = await transaction.publicInvitationCapability.findUnique(
          {
            where: { tokenHash },
            select: { invitationGroupId: true },
          },
        );
        if (!initial) this.publicNotFound();
        await this.lockInvitation(
          transaction,
          initial.invitationGroupId,
          undefined,
          true,
        );
        const capability = await this.findValidCapability(transaction, token);
        const invitation = capability.invitationGroup;
        return this.applyRsvp(
          transaction,
          invitation,
          input,
          this.toStoredLocale(locale),
          {
            source: "GUEST_WEB",
            actorType: "GUEST",
            actorReference: capability.id,
          },
        );
      }, this.transactionOptions()),
    );
    await this.enqueueConfirmation(applied.confirmationId);
    return applied.result;
  }

  public async getHostRsvp(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<HostRsvpDetail> {
    await this.access.resolve(principal, eventId, Permission.GUEST_VIEW);
    const invitation = await this.findHostInvitation(
      this.prisma,
      eventId,
      invitationId,
    );
    return this.toHostDetail(invitation);
  }

  public async submitHost(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
    input: SubmitRsvpInput,
  ): Promise<RsvpResult> {
    const applied = await this.withDomainErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const { user } = await this.access.resolve(
          principal,
          eventId,
          Permission.RSVP_EDIT,
          transaction,
        );
        await this.lockInvitation(transaction, invitationId, eventId);
        const invitation = await this.findHostInvitation(
          transaction,
          eventId,
          invitationId,
        );
        this.assertHostRsvpWritable(invitation);
        const latestMessage = await transaction.message.findFirst({
          where: { eventId, invitationGroupId: invitationId },
          select: { locale: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return this.applyRsvp(
          transaction,
          invitation,
          input,
          latestMessage?.locale ?? "ar_SA",
          {
            source: "HOST_MANUAL",
            actorType: "USER",
            actorUserId: user.id,
            actorReference: user.id,
          },
        );
      }, this.transactionOptions()),
    );
    await this.enqueueConfirmation(applied.confirmationId);
    return applied.result;
  }

  public async getCapabilityStatus(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<PublicInvitationCapabilityStatus> {
    await this.access.resolve(principal, eventId, Permission.GUEST_VIEW);
    const invitation = await this.prisma.invitationGroup.findFirst({
      where: { id: invitationId, eventId },
      select: {
        id: true,
        cancelledAt: true,
        event: { select: { status: true, archivedAt: true } },
        publicCapabilities: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    if (!invitation) this.invitationNotFound();
    return this.capabilityStatus(
      invitation.publicCapabilities[0] ?? null,
      !invitation.cancelledAt &&
        invitation.event.status !== "ARCHIVED" &&
        !invitation.event.archivedAt,
    );
  }

  public async issueCapability(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
    input: IssuePublicInvitationCapabilityInput,
  ): Promise<IssuedPublicInvitationCapability> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.GUEST_EDIT,
        transaction,
      );
      await this.lockInvitation(transaction, invitationId, eventId);
      const invitation = await transaction.invitationGroup.findFirst({
        where: { id: invitationId, eventId },
        select: { id: true, cancelledAt: true },
      });
      if (!invitation) this.invitationNotFound();
      if (invitation.cancelledAt) {
        throw new ConflictException({
          code: "INVITATION_CANCELLED",
          message: "A cancelled invitation cannot receive a public link.",
        });
      }
      if (event.status === "ARCHIVED" || event.archivedAt) {
        throw new ConflictException({
          code: "EVENT_ARCHIVED",
          message: "Recover the archived event before issuing a public link.",
        });
      }

      const now = new Date();
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : this.defaultCapabilityExpiry(event.eventDate, now);
      if (expiresAt.getTime() <= now.getTime() + 5 * 60_000) {
        throw new BadRequestException({
          code: "CAPABILITY_EXPIRY_INVALID",
          message: "Public invitation access must expire in the future.",
        });
      }
      const revoked = await transaction.publicInvitationCapability.updateMany({
        where: { invitationGroupId: invitation.id, revokedAt: null },
        data: { revokedAt: now },
      });
      const token = randomBytes(32).toString("base64url");
      const capability = await transaction.publicInvitationCapability.create({
        data: {
          invitationGroupId: invitation.id,
          tokenHash: this.tokenHash(token),
          expiresAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation.public_access_issued",
          targetType: "InvitationGroup",
          targetId: invitation.id,
          metadata: {
            capabilityId: capability.id,
            expiresAt: capability.expiresAt?.toISOString() ?? null,
            rotatedCapabilities: revoked.count,
          },
        },
      });
      return issuedPublicInvitationCapabilitySchema.parse({
        active: true,
        token,
        createdAt: capability.createdAt.toISOString(),
        expiresAt: capability.expiresAt?.toISOString() ?? null,
        revokedAt: null,
      });
    }, this.transactionOptions());
  }

  public async revokeCapability(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<PublicInvitationCapabilityStatus> {
    return this.prisma.$transaction(async (transaction) => {
      const { user } = await this.access.resolve(
        principal,
        eventId,
        Permission.GUEST_EDIT,
        transaction,
      );
      await this.lockInvitation(transaction, invitationId, eventId);
      const invitation = await transaction.invitationGroup.findFirst({
        where: { id: invitationId, eventId },
        select: {
          id: true,
          cancelledAt: true,
          event: { select: { status: true, archivedAt: true } },
        },
      });
      if (!invitation) this.invitationNotFound();
      const now = new Date();
      const revoked = await transaction.publicInvitationCapability.updateMany({
        where: { invitationGroupId: invitationId, revokedAt: null },
        data: { revokedAt: now },
      });
      const latest = await transaction.publicInvitationCapability.findFirst({
        where: { invitationGroupId: invitationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (revoked.count > 0) {
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "invitation.public_access_revoked",
            targetType: "InvitationGroup",
            targetId: invitationId,
            metadata: { revokedCapabilities: revoked.count },
          },
        });
      }
      return this.capabilityStatus(
        latest,
        !invitation.cancelledAt &&
          invitation.event.status !== "ARCHIVED" &&
          !invitation.event.archivedAt,
      );
    }, this.transactionOptions());
  }

  private async applyRsvp(
    transaction: Prisma.TransactionClient,
    invitation: InvitationForRsvp,
    input: SubmitRsvpInput,
    locale: StoredLocale,
    actor: ApplyActor,
  ): Promise<AppliedRsvp> {
    const keyHash = this.sha256(input.submissionId);
    const requestHash = this.sha256(
      this.stableSerialize({
        attendingMemberIds: [...input.attendingMemberIds].sort(),
        companionCount: input.companionCount,
      }),
    );
    const existingSubmission = await transaction.rsvpSubmission.findUnique({
      where: {
        invitationGroupId_source_keyHash: {
          invitationGroupId: invitation.id,
          source: actor.source,
          keyHash,
        },
      },
    });
    if (existingSubmission) {
      if (existingSubmission.requestHash !== requestHash) {
        throw new ConflictException({
          code: "RSVP_IDEMPOTENCY_CONFLICT",
          message: "This submission identifier was already used differently.",
        });
      }
      return {
        result: rsvpResultSchema.parse(existingSubmission.response),
        confirmationId: null,
      };
    }

    if (actor.source === "GUEST_WEB") {
      const policy = this.guestPolicy(invitation, new Date());
      if (
        (!invitation.rsvp && !policy.canRespond) ||
        (invitation.rsvp && !policy.canEdit)
      ) {
        throw new ConflictException({
          code: "RSVP_NOT_EDITABLE",
          message: "This invitation is not accepting this RSVP change.",
          details: {
            lifecycleState: policy.lifecycleState,
            reason: policy.reason,
          },
        });
      }
    }

    const selection = resolveRsvpSelection({
      invitationType: invitation.invitationType,
      members: invitation.members,
      maxCompanions: invitation.maxCompanions,
      attendingMemberIds: input.attendingMemberIds,
      companionCount: input.companionCount,
    });
    const previousResponse = this.responseSnapshot(invitation);
    const newResponse = {
      status: selection.status,
      attendingMemberIds: [...selection.attendingMemberIds],
      companionCount: selection.companionCount,
      expectedAttendees: selection.expectedAttendeeCount,
    } satisfies Prisma.InputJsonObject;
    const unchanged =
      invitation.rsvp !== null &&
      this.stableSerialize(previousResponse) ===
        this.stableSerialize(newResponse);
    const responseAt = new Date();
    if (unchanged) {
      const rsvp = await transaction.rsvp.update({
        where: { invitationGroupId: invitation.id },
        data: {
          source: actor.source,
          respondedAt: responseAt,
          responseWebhookSequence: null,
        },
      });
      const result = rsvpResultSchema.parse({
        submissionId: input.submissionId,
        status: rsvp.status,
        attendingMemberIds: previousResponse.attendingMemberIds,
        companionCount: rsvp.companionCount,
        expectedAttendees: invitation.expectedAttendees,
        respondedAt: rsvp.respondedAt.toISOString(),
        isEdited: invitation.rsvpHistory.length > 1,
        changed: false,
        confirmationQueued: false,
      });
      await transaction.rsvpSubmission.create({
        data: {
          invitationGroupId: invitation.id,
          source: actor.source,
          keyHash,
          requestHash,
          response: result as Prisma.InputJsonValue,
        },
      });
      return { result, confirmationId: null };
    }

    const wasEdited = invitation.rsvp !== null;
    const rsvp = await transaction.rsvp.upsert({
      where: { invitationGroupId: invitation.id },
      create: {
        invitationGroupId: invitation.id,
        status: selection.status,
        companionCount: selection.companionCount,
        source: actor.source,
        respondedAt: responseAt,
        responseWebhookSequence: null,
      },
      update: {
        status: selection.status,
        companionCount: selection.companionCount,
        source: actor.source,
        respondedAt: responseAt,
        responseWebhookSequence: null,
      },
    });
    const attendingIds = new Set(selection.attendingMemberIds);
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
        rsvpStatus: selection.status,
        expectedAttendees: selection.expectedAttendeeCount,
      },
    });
    const history = await transaction.rsvpHistory.create({
      data: {
        invitationGroupId: invitation.id,
        previousStatus: previousResponse.status,
        newStatus: selection.status,
        previousCount: previousResponse.expectedAttendees,
        newCount: selection.expectedAttendeeCount,
        previousResponse,
        newResponse,
        source: actor.source,
        actorReference: actor.actorReference,
      },
    });
    const variables = {
      guest_name: invitation.displayName,
      rsvp_status: this.localizedStatus(selection.status, locale),
      expected_attendees: String(selection.expectedAttendeeCount),
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
        failedAt: responseAt,
      },
    });
    const confirmation = await transaction.rsvpConfirmation.create({
      data: {
        eventId: invitation.eventId,
        invitationGroupId: invitation.id,
        rsvpHistoryId: history.id,
        status: "QUEUED",
        recipientPhoneE164: invitation.phoneE164,
        locale,
        providerTemplateName: this.confirmationTemplate(locale),
        templateVariables: variables,
        templateParameterOrder: [
          "guest_name",
          "rsvp_status",
          "expected_attendees",
        ],
        queuedAt: responseAt,
      },
    });
    const result = rsvpResultSchema.parse({
      submissionId: input.submissionId,
      status: selection.status,
      attendingMemberIds: [...selection.attendingMemberIds],
      companionCount: selection.companionCount,
      expectedAttendees: selection.expectedAttendeeCount,
      respondedAt: rsvp.respondedAt.toISOString(),
      isEdited: wasEdited,
      changed: true,
      confirmationQueued: true,
    });
    await transaction.rsvpSubmission.create({
      data: {
        invitationGroupId: invitation.id,
        rsvpHistoryId: history.id,
        source: actor.source,
        keyHash,
        requestHash,
        response: result as Prisma.InputJsonValue,
      },
    });
    await transaction.auditLog.create({
      data: {
        eventId: invitation.eventId,
        ...(actor.actorUserId ? { actorUserId: actor.actorUserId } : {}),
        actorType: actor.actorType,
        action: wasEdited ? "rsvp.edited" : "rsvp.created",
        targetType: "InvitationGroup",
        targetId: invitation.id,
        metadata: {
          source: actor.source,
          historyId: history.id,
          confirmationId: confirmation.id,
          previousStatus: previousResponse.status,
          newStatus: selection.status,
          previousExpectedAttendees: previousResponse.expectedAttendees,
          newExpectedAttendees: selection.expectedAttendeeCount,
        },
      },
    });
    return { result, confirmationId: confirmation.id };
  }

  private async findValidCapability(client: RsvpClient, token: string) {
    const capability = await client.publicInvitationCapability.findUnique({
      where: { tokenHash: this.tokenHash(token) },
      include: { invitationGroup: { include: invitationRsvpInclude } },
    });
    const now = new Date();
    if (
      !capability ||
      capability.revokedAt ||
      (capability.expiresAt && capability.expiresAt <= now) ||
      capability.invitationGroup.cancelledAt ||
      capability.invitationGroup.event.status === "ARCHIVED" ||
      capability.invitationGroup.event.archivedAt
    ) {
      this.publicNotFound();
    }
    return capability;
  }

  private async findHostInvitation(
    client: RsvpClient,
    eventId: string,
    invitationId: string,
  ): Promise<InvitationForRsvp> {
    const invitation = await client.invitationGroup.findFirst({
      where: { id: invitationId, eventId },
      include: invitationRsvpInclude,
    });
    if (!invitation) this.invitationNotFound();
    return invitation;
  }

  private toPublicInvitation(
    invitation: InvitationForRsvp,
    locale: PublicLocale,
  ): PublicInvitation {
    const english = locale === "en";
    return publicInvitationSchema.parse({
      locale,
      event: {
        name: english
          ? (invitation.event.nameEn ?? invitation.event.nameAr)
          : invitation.event.nameAr,
        eventType: invitation.event.eventType,
        eventDate: invitation.event.eventDate.toISOString().slice(0, 10),
        startTime: invitation.event.startTime.toISOString().slice(11, 16),
        endTime: invitation.event.endTime
          ? invitation.event.endTime.toISOString().slice(11, 16)
          : null,
        timezone: invitation.event.timezone,
        venueName: english
          ? (invitation.event.venueNameEn ?? invitation.event.venueNameAr)
          : invitation.event.venueNameAr,
        city: invitation.event.city,
        mapUrl: invitation.event.mapUrl,
        rsvpDeadline: invitation.event.rsvpDeadline
          ? invitation.event.rsvpDeadline.toISOString().slice(0, 10)
          : null,
      },
      invitation: {
        displayName: invitation.displayName,
        invitationType: invitation.invitationType,
        maxCompanions: invitation.maxCompanions,
        members: invitation.members.map((member) => ({
          id: member.id,
          name: member.name,
          isPrimary: member.isPrimary,
          position: member.position,
        })),
      },
      currentRsvp: this.publicRsvpState(invitation),
      policy: this.guestPolicy(invitation, new Date()),
    });
  }

  private toHostDetail(invitation: InvitationForRsvp): HostRsvpDetail {
    const current = this.publicRsvpState(invitation);
    return hostRsvpDetailSchema.parse({
      eventId: invitation.eventId,
      invitationId: invitation.id,
      displayName: invitation.displayName,
      invitationType: invitation.invitationType,
      maxCompanions: invitation.maxCompanions,
      members: invitation.members.map((member) => ({
        id: member.id,
        name: member.name,
        isPrimary: member.isPrimary,
        position: member.position,
      })),
      currentRsvp:
        current && invitation.rsvp
          ? { ...current, source: invitation.rsvp.source }
          : null,
      history: invitation.rsvpHistory.map((history) => ({
        id: history.id,
        previousStatus: history.previousStatus,
        newStatus: history.newStatus,
        previousCount: history.previousCount,
        newCount: history.newCount,
        previousResponse: history.previousResponse,
        newResponse: history.newResponse,
        source: history.source,
        actorReference: history.actorReference,
        createdAt: history.createdAt.toISOString(),
      })),
    });
  }

  private publicRsvpState(invitation: InvitationForRsvp) {
    if (!invitation.rsvp) return null;
    const attending = new Set(
      invitation.rsvp.members
        .filter(({ attending }) => attending)
        .map(({ guestMemberId }) => guestMemberId),
    );
    return {
      status: invitation.rsvp.status,
      attendingMemberIds: invitation.members
        .filter(({ id }) => attending.has(id))
        .map(({ id }) => id),
      companionCount: invitation.rsvp.companionCount,
      expectedAttendees: invitation.expectedAttendees,
      respondedAt: invitation.rsvp.respondedAt.toISOString(),
      updatedAt: invitation.rsvp.updatedAt.toISOString(),
      isEdited: invitation.rsvpHistory.length > 1,
    };
  }

  private responseSnapshot(invitation: InvitationForRsvp): ResponseSnapshot {
    const state = this.publicRsvpState(invitation);
    return state
      ? {
          status: state.status,
          attendingMemberIds: state.attendingMemberIds,
          companionCount: state.companionCount,
          expectedAttendees: state.expectedAttendees,
        }
      : {
          status: "PENDING",
          attendingMemberIds: [],
          companionCount: 0,
          expectedAttendees: 0,
        };
  }

  private guestPolicy(invitation: InvitationForRsvp, now: Date) {
    return evaluateGuestRsvpPolicy({
      eventStatus: invitation.event.status,
      currentDate: this.dateInTimeZone(now, invitation.event.timezone),
      rsvpDeadline: invitation.event.rsvpDeadline
        ? invitation.event.rsvpDeadline.toISOString().slice(0, 10)
        : null,
      allowRsvpEdits: invitation.event.allowRsvpEdits,
      hasExistingRsvp: invitation.rsvp !== null,
    });
  }

  private capabilityStatus(
    capability: {
      readonly createdAt: Date;
      readonly expiresAt: Date | null;
      readonly revokedAt: Date | null;
    } | null,
    invitationAvailable = true,
  ): PublicInvitationCapabilityStatus {
    return publicInvitationCapabilityStatusSchema.parse({
      active: Boolean(
        invitationAvailable &&
        capability &&
        !capability.revokedAt &&
        (!capability.expiresAt || capability.expiresAt > new Date()),
      ),
      createdAt: capability?.createdAt.toISOString() ?? null,
      expiresAt: capability?.expiresAt?.toISOString() ?? null,
      revokedAt: capability?.revokedAt?.toISOString() ?? null,
    });
  }

  private assertHostRsvpWritable(invitation: InvitationForRsvp): void {
    if (invitation.cancelledAt) {
      throw new ConflictException({
        code: "INVITATION_CANCELLED",
        message: "A cancelled invitation cannot receive an RSVP.",
      });
    }
    if (invitation.event.status === "ARCHIVED" || invitation.event.archivedAt) {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Recover the archived event before changing an RSVP.",
      });
    }
  }

  private async lockInvitation(
    transaction: Prisma.TransactionClient,
    invitationId: string,
    eventId?: string,
    publicAccess = false,
  ): Promise<void> {
    const rows = eventId
      ? await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "invitation_groups"
          WHERE "id" = ${invitationId}::uuid AND "event_id" = ${eventId}::uuid
          FOR UPDATE
        `
      : await transaction.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "invitation_groups"
          WHERE "id" = ${invitationId}::uuid
          FOR UPDATE
        `;
    if (rows.length === 0) {
      if (publicAccess) this.publicNotFound();
      this.invitationNotFound();
    }
  }

  private async enqueueConfirmation(
    confirmationId: string | null,
  ): Promise<void> {
    if (!confirmationId) return;
    try {
      await this.messagingQueue.enqueueRsvpConfirmation(confirmationId);
    } catch (error) {
      this.logger.warn(
        `Immediate RSVP confirmation enqueue failed; the durable outbox will retry: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private confirmationTemplate(locale: StoredLocale): string {
    return locale === "ar_SA"
      ? this.config.get("META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR", {
          infer: true,
        })
      : this.config.get("META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_EN", {
          infer: true,
        });
  }

  private localizedStatus(
    status: "ACCEPTED" | "PARTIALLY_ACCEPTED" | "DECLINED",
    locale: StoredLocale,
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

  private toStoredLocale(locale: PublicLocale): StoredLocale {
    return locale === "ar-SA" ? "ar_SA" : "en";
  }

  private defaultCapabilityExpiry(eventDate: Date, now: Date): Date {
    const afterEvent = new Date(eventDate.getTime() + 2 * 24 * 60 * 60_000);
    return afterEvent > now
      ? afterEvent
      : new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  }

  private tokenHash(token: string): string {
    if (typeof token !== "string" || token.length > 512) this.publicNotFound();
    return this.sha256(token);
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableSerialize(entry)).join(",")}]`;
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${this.stableSerialize(entry)}`,
      )
      .join(",")}}`;
  }

  private dateInTimeZone(value: Date, timeZone: string): string {
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

  private transactionOptions() {
    return {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 30_000,
    } as const;
  }

  private async withDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof InvitationInvariantError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }

  private publicNotFound(): never {
    throw new NotFoundException({
      code: "PUBLIC_INVITATION_NOT_FOUND",
      message: "This invitation link is invalid or no longer available.",
    });
  }

  private invitationNotFound(): never {
    throw new NotFoundException({
      code: "INVITATION_NOT_FOUND",
      message: "The invitation does not exist or is not accessible.",
    });
  }
}
