import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  createEventSchema,
  EVENT_TYPES,
  type CreateEventInput,
  type EventDashboardSummary,
  type EventDetail,
  type EventSummary,
  type TransitionEventStatusInput,
  type UpdateEventInput,
} from "@dawah/api-contract";
import {
  allowedEventStatusTransitions,
  canTransitionEventStatus,
  EventStatus as DomainEventStatus,
  isEventStatus,
  Permission,
} from "@dawah/domain";
import type {
  Event,
  EventMembership,
  EventStatus,
  Prisma,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { EventAccessService } from "./event-access.service";

type EventCapabilityMembership = Pick<
  EventMembership,
  "role" | "permissionsJson"
>;

type EventWithMembership = Event & {
  memberships: EventCapabilityMembership[];
};

@Injectable()
export class EventsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public async list(principal: AuthPrincipal): Promise<EventSummary[]> {
    const user = await this.access.ensureUser(principal);
    const events = await this.prisma.event.findMany({
      where: {
        memberships: { some: { userId: user.id, status: "ACTIVE" } },
        archivedAt: null,
      },
      include: {
        memberships: {
          where: { userId: user.id, status: "ACTIVE" },
          select: { role: true, permissionsJson: true },
        },
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    });
    return events
      .filter((event) => {
        const membership = event.memberships[0];
        return Boolean(
          membership && this.access.allows(membership, Permission.EVENT_VIEW),
        );
      })
      .map((event) => this.toSummary(event));
  }

  public async create(
    principal: AuthPrincipal,
    input: CreateEventInput,
  ): Promise<EventSummary> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await this.access.ensureUser(principal, transaction);
      const event = await transaction.event.create({
        data: {
          ownerUserId: user.id,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          eventType: input.eventType,
          eventDate: this.dateOnly(input.eventDate),
          startTime: this.timeOnly(input.startTime),
          endTime: input.endTime ? this.timeOnly(input.endTime) : null,
          timezone: input.timezone,
          venueNameAr: input.venueNameAr,
          venueNameEn: input.venueNameEn,
          city: input.city,
          latitude: input.latitude,
          longitude: input.longitude,
          mapUrl: input.mapUrl,
          rsvpDeadline: input.rsvpDeadline
            ? this.dateOnly(input.rsvpDeadline)
            : null,
          allowRsvpEdits: input.allowRsvpEdits,
          qrEnabled: input.qrEnabled,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
              acceptedAt: new Date(),
            },
          },
        },
        include: {
          memberships: {
            where: { userId: user.id, status: "ACTIVE" },
            select: { role: true, permissionsJson: true },
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.created",
          targetType: "Event",
          targetId: event.id,
          metadata: { status: event.status },
        },
      });
      return this.toSummary(event);
    });
  }

  public async get(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventDetail> {
    const { event, membership } = await this.access.resolve(
      principal,
      eventId,
      Permission.EVENT_VIEW,
    );
    return this.toDetail(event, membership);
  }

  public update(
    principal: AuthPrincipal,
    eventId: string,
    input: UpdateEventInput,
  ): Promise<EventDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.EVENT_EDIT,
        transaction,
      );
      this.assertNotArchived(event);
      this.validateMergedEvent(event, input);

      const updated = await transaction.event.update({
        where: { id: event.id },
        data: this.toUpdateData(input),
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.updated",
          targetType: "Event",
          targetId: event.id,
          metadata: { changedFields: Object.keys(input).sort() },
        },
      });
      return this.toDetail(updated, membership);
    });
  }

  public archive(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.EVENT_ARCHIVE,
        transaction,
      );
      if (event.status === "ARCHIVED" || event.archivedAt) {
        throw new ConflictException({
          code: "EVENT_ALREADY_ARCHIVED",
          message: "The event is already archived.",
        });
      }

      const updated = await transaction.event.update({
        where: { id: event.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.archived",
          targetType: "Event",
          targetId: event.id,
          metadata: { previousStatus: event.status },
        },
      });
      return this.toDetail(updated, membership);
    });
  }

  public recover(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.EVENT_ARCHIVE,
        transaction,
      );
      if (event.status !== "ARCHIVED" || !event.archivedAt) {
        throw new ConflictException({
          code: "EVENT_NOT_ARCHIVED",
          message: "Only an archived event can be recovered.",
        });
      }

      const archiveAudit = await transaction.auditLog.findFirst({
        where: {
          eventId: event.id,
          action: "event.archived",
          targetId: event.id,
        },
        orderBy: { createdAt: "desc" },
      });
      const previousStatus = this.recoveryStatus(archiveAudit?.metadata);
      const updated = await transaction.event.update({
        where: { id: event.id },
        data: { status: previousStatus, archivedAt: null },
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.recovered",
          targetType: "Event",
          targetId: event.id,
          metadata: { restoredStatus: previousStatus },
        },
      });
      return this.toDetail(updated, membership);
    });
  }

  public transitionStatus(
    principal: AuthPrincipal,
    eventId: string,
    input: TransitionEventStatusInput,
  ): Promise<EventDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.EVENT_EDIT,
        transaction,
      );
      this.assertNotArchived(event);
      if (!canTransitionEventStatus(event.status, input.status)) {
        throw new ConflictException({
          code: "INVALID_EVENT_STATUS_TRANSITION",
          message: "The requested event status transition is not allowed.",
          details: {
            from: event.status,
            to: input.status,
            allowed: allowedEventStatusTransitions(event.status),
          },
        });
      }

      const updated = await transaction.event.update({
        where: { id: event.id },
        data: { status: input.status },
      });
      await transaction.auditLog.create({
        data: {
          eventId: event.id,
          actorUserId: user.id,
          actorType: "USER",
          action: "event.status_changed",
          targetType: "Event",
          targetId: event.id,
          metadata: { previousStatus: event.status, newStatus: input.status },
        },
      });
      return this.toDetail(updated, membership);
    });
  }

  public async dashboard(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventDashboardSummary> {
    await this.access.resolve(principal, eventId, Permission.EVENT_VIEW);
    const where = { eventId, cancelledAt: null } as const;
    const [groups, namedGuests, rsvpGroups] = await Promise.all([
      this.prisma.invitationGroup.aggregate({
        where,
        _count: { _all: true },
        _sum: { expectedAttendees: true },
      }),
      this.prisma.guestMember.count({
        where: { invitationGroup: where },
      }),
      this.prisma.invitationGroup.groupBy({
        by: ["rsvpStatus"],
        where,
        orderBy: { rsvpStatus: "asc" },
        _count: true,
      }),
    ] as const);
    const countFor = (status: string) =>
      rsvpGroups.find((group) => group.rsvpStatus === status)?._count ?? 0;

    return {
      eventId,
      invitationGroups: groups._count._all,
      namedGuests,
      expectedAttendees: groups._sum.expectedAttendees ?? 0,
      rsvp: {
        acceptedGroups: countFor("ACCEPTED"),
        partialGroups: countFor("PARTIALLY_ACCEPTED"),
        declinedGroups: countFor("DECLINED"),
        pendingGroups: countFor("PENDING"),
      },
    };
  }

  private validateMergedEvent(event: Event, input: UpdateEventInput): void {
    const candidate = createEventSchema.safeParse({
      nameAr: input.nameAr ?? event.nameAr,
      nameEn:
        input.nameEn === undefined
          ? (event.nameEn ?? undefined)
          : (input.nameEn ?? undefined),
      eventType: input.eventType ?? this.eventType(event.eventType),
      eventDate: input.eventDate ?? this.dateValue(event.eventDate),
      startTime: input.startTime ?? this.timeValue(event.startTime),
      endTime:
        input.endTime === undefined
          ? event.endTime
            ? this.timeValue(event.endTime)
            : undefined
          : (input.endTime ?? undefined),
      timezone: input.timezone ?? event.timezone,
      venueNameAr: input.venueNameAr ?? event.venueNameAr,
      venueNameEn:
        input.venueNameEn === undefined
          ? (event.venueNameEn ?? undefined)
          : (input.venueNameEn ?? undefined),
      city: input.city ?? event.city,
      latitude:
        input.latitude === undefined
          ? (event.latitude?.toNumber() ?? undefined)
          : (input.latitude ?? undefined),
      longitude:
        input.longitude === undefined
          ? (event.longitude?.toNumber() ?? undefined)
          : (input.longitude ?? undefined),
      mapUrl:
        input.mapUrl === undefined
          ? (event.mapUrl ?? undefined)
          : (input.mapUrl ?? undefined),
      rsvpDeadline:
        input.rsvpDeadline === undefined
          ? event.rsvpDeadline
            ? this.dateValue(event.rsvpDeadline)
            : undefined
          : (input.rsvpDeadline ?? undefined),
      allowRsvpEdits: input.allowRsvpEdits ?? event.allowRsvpEdits,
      qrEnabled: input.qrEnabled ?? event.qrEnabled,
    });
    if (!candidate.success) {
      throw new BadRequestException({
        code: "EVENT_VALIDATION_FAILED",
        message: "The combined event settings are invalid.",
        details: { issues: candidate.error.issues },
      });
    }
  }

  private toUpdateData(input: UpdateEventInput): Prisma.EventUpdateInput {
    return {
      ...(input.nameAr === undefined ? {} : { nameAr: input.nameAr }),
      ...(input.nameEn === undefined ? {} : { nameEn: input.nameEn }),
      ...(input.eventType === undefined ? {} : { eventType: input.eventType }),
      ...(input.eventDate === undefined
        ? {}
        : { eventDate: this.dateOnly(input.eventDate) }),
      ...(input.startTime === undefined
        ? {}
        : { startTime: this.timeOnly(input.startTime) }),
      ...(input.endTime === undefined
        ? {}
        : { endTime: input.endTime ? this.timeOnly(input.endTime) : null }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.venueNameAr === undefined
        ? {}
        : { venueNameAr: input.venueNameAr }),
      ...(input.venueNameEn === undefined
        ? {}
        : { venueNameEn: input.venueNameEn }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
      ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
      ...(input.mapUrl === undefined ? {} : { mapUrl: input.mapUrl }),
      ...(input.rsvpDeadline === undefined
        ? {}
        : {
            rsvpDeadline: input.rsvpDeadline
              ? this.dateOnly(input.rsvpDeadline)
              : null,
          }),
      ...(input.allowRsvpEdits === undefined
        ? {}
        : { allowRsvpEdits: input.allowRsvpEdits }),
      ...(input.qrEnabled === undefined ? {} : { qrEnabled: input.qrEnabled }),
    };
  }

  private assertNotArchived(event: Event): void {
    if (event.status === "ARCHIVED" || event.archivedAt) {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Recover the archived event before changing it.",
      });
    }
  }

  private recoveryStatus(metadata: Prisma.JsonValue | undefined): EventStatus {
    if (
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      isEventStatus(metadata.previousStatus) &&
      metadata.previousStatus !== DomainEventStatus.ARCHIVED
    ) {
      return metadata.previousStatus;
    }
    return "DRAFT";
  }

  private toSummary(event: EventWithMembership): EventSummary {
    const membership = event.memberships[0];
    if (!membership) {
      throw new Error(
        "Event membership is missing from an authorized event query.",
      );
    }
    return {
      id: event.id,
      nameAr: event.nameAr,
      nameEn: event.nameEn,
      eventType: this.eventType(event.eventType),
      eventDate: this.dateValue(event.eventDate),
      timezone: event.timezone,
      venueNameAr: event.venueNameAr,
      venueNameEn: event.venueNameEn,
      city: event.city,
      status: event.status,
      role: membership.role,
      ...this.capabilities(membership),
    };
  }

  private toDetail(
    event: Event,
    membership: EventCapabilityMembership,
  ): EventDetail {
    return {
      id: event.id,
      nameAr: event.nameAr,
      nameEn: event.nameEn,
      eventType: this.eventType(event.eventType),
      eventDate: this.dateValue(event.eventDate),
      startTime: this.timeValue(event.startTime),
      endTime: event.endTime ? this.timeValue(event.endTime) : null,
      timezone: event.timezone,
      venueNameAr: event.venueNameAr,
      venueNameEn: event.venueNameEn,
      city: event.city,
      latitude: event.latitude?.toNumber() ?? null,
      longitude: event.longitude?.toNumber() ?? null,
      mapUrl: event.mapUrl,
      rsvpDeadline: event.rsvpDeadline
        ? this.dateValue(event.rsvpDeadline)
        : null,
      allowRsvpEdits: event.allowRsvpEdits,
      qrEnabled: event.qrEnabled,
      status: event.status,
      role: membership.role,
      ...this.capabilities(membership),
      availableTransitions: [...allowedEventStatusTransitions(event.status)],
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      archivedAt: event.archivedAt?.toISOString() ?? null,
    };
  }

  private capabilities(membership: EventCapabilityMembership) {
    const allows = (permission: (typeof Permission)[keyof typeof Permission]) =>
      this.access.allows(membership, permission);
    return {
      effectivePermissions: [...this.access.effectivePermissions(membership)],
      canViewGuests: allows(Permission.GUEST_VIEW),
      canManageGuests: [
        Permission.GUEST_CREATE,
        Permission.GUEST_EDIT,
        Permission.GUEST_DELETE,
        Permission.GUEST_IMPORT,
      ].some(allows),
      canPrepareInvitations: allows(Permission.INVITATION_SEND),
      canSendInvitations: allows(Permission.INVITATION_SEND),
      canSendReminders: allows(Permission.REMINDER_SEND),
      canViewReports: allows(Permission.REPORTS_VIEW),
      canExportGuests: allows(Permission.GUEST_EXPORT),
      canCheckIn: allows(Permission.CHECKIN_USE),
      canManageBilling: allows(Permission.BILLING_MANAGE),
      canManageTeam: allows(Permission.TEAM_MANAGE),
      canEditEvent: allows(Permission.EVENT_EDIT),
      canArchiveEvent: allows(Permission.EVENT_ARCHIVE),
    };
  }

  private eventType(value: string): (typeof EVENT_TYPES)[number] {
    return EVENT_TYPES.includes(value as (typeof EVENT_TYPES)[number])
      ? (value as (typeof EVENT_TYPES)[number])
      : "OTHER";
  }

  private dateValue(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private timeValue(value: Date): string {
    return value.toISOString().slice(11, 16);
  }

  private dateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private timeOnly(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }
}
