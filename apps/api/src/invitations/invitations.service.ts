import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  BulkCancelInvitationsInput,
  BulkCancelInvitationsResult,
  CreateInvitationInput,
  InvitationDetail,
  InvitationListItem,
  InvitationListResponse,
  ListInvitationsQuery,
  UpdateInvitationInput,
} from "@dawah/api-contract";
import {
  InvitationInvariantError,
  maskPhoneNumber,
  normalizePhoneNumber,
  Permission,
  PhoneNormalizationError,
  validateInvitationAggregate,
} from "@dawah/domain";
import type { Event, Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";

type InvitationWithMembers = Prisma.InvitationGroupGetPayload<{
  include: { members: true };
}>;

type InvitationWithMembersAndRsvp = Prisma.InvitationGroupGetPayload<{
  include: { members: true; rsvp: true };
}>;

type InvitationClient = PrismaService | Prisma.TransactionClient;
type DuplicateInvitation = {
  id: string;
  displayName: string;
  phoneE164: string;
};

@Injectable()
export class InvitationsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public async list(
    principal: AuthPrincipal,
    eventId: string,
    query: ListInvitationsQuery,
  ): Promise<InvitationListResponse> {
    const { membership } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_VIEW,
    );
    const mayViewPhone = this.access.allows(
      membership,
      Permission.GUEST_PHONE_VIEW,
    );
    const where = this.listWhere(eventId, query, mayViewPhone);
    const page = query.page;
    const pageSize = query.pageSize;
    const activeWhere = { eventId, cancelledAt: null } as const;

    const [records, total, groups, namedGuests] = await Promise.all([
      this.prisma.invitationGroup.findMany({
        where,
        include: { members: { orderBy: { position: "asc" } } },
        orderBy: this.orderBy(query.sortBy, query.sortOrder),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invitationGroup.count({ where }),
      this.prisma.invitationGroup.aggregate({
        where: activeWhere,
        _count: { _all: true },
        _sum: { expectedAttendees: true },
      }),
      this.prisma.guestMember.count({
        where: { invitationGroup: activeWhere },
      }),
    ]);

    return {
      items: records.map((record) => this.toListItem(record, mayViewPhone)),
      totals: {
        invitationGroups: groups._count._all,
        namedGuests,
        expectedAttendees: groups._sum.expectedAttendees ?? 0,
      },
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  public async get(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<InvitationDetail> {
    const { membership } = await this.access.resolve(
      principal,
      eventId,
      Permission.GUEST_VIEW,
    );
    const invitation = await this.findInvitation(
      this.prisma,
      eventId,
      invitationId,
    );
    return this.toDetail(
      invitation,
      this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
    );
  }

  public create(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateInvitationInput,
  ): Promise<InvitationDetail> {
    return this.withDomainErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const { event, membership, user } = await this.access.resolve(
          principal,
          eventId,
          Permission.GUEST_CREATE,
          transaction,
        );
        this.assertEventWritable(event);
        this.validateStructure(input);

        const phone = normalizePhoneNumber(
          input.phoneNumber,
          input.phoneCountry,
        );
        await this.lockPhone(transaction, eventId, phone.e164);
        const duplicates = await this.findPhoneDuplicates(
          transaction,
          eventId,
          phone.e164,
        );
        this.assertDuplicateDecision(duplicates, input.duplicateOverride);

        const invitation = await transaction.invitationGroup.create({
          data: {
            eventId,
            displayName: input.displayName,
            contactName: input.contactName,
            phoneE164: phone.e164,
            phoneCountry: phone.countryCode,
            invitationType: input.invitationType,
            maxCompanions: input.maxCompanions,
            internalNote: input.internalNote ?? null,
            createdBy: user.id,
            members: {
              create: input.members.map((member, index) => ({
                name: member.name,
                isPrimary: member.isPrimary,
                position: index + 1,
              })),
            },
          },
          include: { members: { orderBy: { position: "asc" } } },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "invitation.created",
            targetType: "InvitationGroup",
            targetId: invitation.id,
            metadata: {
              invitationType: invitation.invitationType,
              memberCount: invitation.members.length,
              duplicateOverride: duplicates.length > 0,
              ...(duplicates.length === 0
                ? {}
                : { duplicateInvitationIds: duplicates.map(({ id }) => id) }),
            },
          },
        });

        return this.toDetail(
          invitation,
          this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
        );
      }),
    );
  }

  public update(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
    input: UpdateInvitationInput,
  ): Promise<InvitationDetail> {
    return this.withDomainErrors(() =>
      this.prisma.$transaction(async (transaction) => {
        const { event, membership, user } = await this.access.resolve(
          principal,
          eventId,
          Permission.GUEST_EDIT,
          transaction,
        );
        this.assertEventWritable(event);
        const existing = await this.findInvitation(
          transaction,
          eventId,
          invitationId,
          true,
        );
        if (existing.cancelledAt) {
          throw new ConflictException({
            code: "INVITATION_CANCELLED",
            message: "A cancelled invitation cannot be edited.",
          });
        }

        const members = input.members ?? existing.members;
        const invitationType = input.invitationType ?? existing.invitationType;
        const maxCompanions = input.maxCompanions ?? existing.maxCompanions;
        this.validateStructure({ invitationType, maxCompanions, members });
        this.assertRsvpAllowsStructureEdit(existing, input);

        if (
          (input.phoneNumber === undefined) !==
          (input.phoneCountry === undefined)
        ) {
          throw new BadRequestException({
            code: "PHONE_UPDATE_INCOMPLETE",
            message: "Phone number and country must be updated together.",
          });
        }
        const phone =
          input.phoneNumber && input.phoneCountry
            ? normalizePhoneNumber(input.phoneNumber, input.phoneCountry)
            : null;
        let duplicates: DuplicateInvitation[] = [];
        if (phone) {
          await this.lockPhone(transaction, eventId, phone.e164);
          duplicates = await this.findPhoneDuplicates(
            transaction,
            eventId,
            phone.e164,
            invitationId,
          );
          this.assertDuplicateDecision(duplicates, input.duplicateOverride);
        }

        if (input.members !== undefined) {
          await transaction.guestMember.deleteMany({
            where: { invitationGroupId: invitationId },
          });
          await transaction.guestMember.createMany({
            data: input.members.map((member, index) => ({
              invitationGroupId: invitationId,
              name: member.name,
              isPrimary: member.isPrimary,
              position: index + 1,
            })),
          });
        }

        const invitation = await transaction.invitationGroup.update({
          where: { id: invitationId },
          data: {
            ...(input.displayName === undefined
              ? {}
              : { displayName: input.displayName }),
            ...(input.contactName === undefined
              ? {}
              : { contactName: input.contactName }),
            ...(phone
              ? {
                  phoneE164: phone.e164,
                  phoneCountry: phone.countryCode,
                }
              : {}),
            ...(input.invitationType === undefined
              ? {}
              : { invitationType: input.invitationType }),
            ...(input.maxCompanions === undefined
              ? {}
              : { maxCompanions: input.maxCompanions }),
            ...(input.internalNote === undefined
              ? {}
              : { internalNote: input.internalNote }),
          },
          include: { members: { orderBy: { position: "asc" } } },
        });
        await transaction.auditLog.create({
          data: {
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "invitation.updated",
            targetType: "InvitationGroup",
            targetId: invitation.id,
            metadata: {
              changedFields: Object.keys(input)
                .filter((field) => field !== "duplicateOverride")
                .sort(),
              duplicateOverride: duplicates.length > 0,
              ...(duplicates.length === 0
                ? {}
                : { duplicateInvitationIds: duplicates.map(({ id }) => id) }),
            },
          },
        });

        return this.toDetail(
          invitation,
          this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
        );
      }),
    );
  }

  public bulkCancel(
    principal: AuthPrincipal,
    eventId: string,
    input: BulkCancelInvitationsInput,
  ): Promise<BulkCancelInvitationsResult> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.GUEST_DELETE,
        transaction,
      );
      this.assertEventWritable(event);
      const invitationIds = [...new Set(input.invitationIds)];
      const invitations = await transaction.invitationGroup.findMany({
        where: { eventId, id: { in: invitationIds } },
        select: { id: true, cancelledAt: true },
      });
      if (invitations.length !== invitationIds.length) {
        this.notFound();
      }

      const cancelledIds: string[] = [];
      const alreadyCancelledIds: string[] = [];
      for (const invitationId of invitationIds) {
        const result = await transaction.invitationGroup.updateMany({
          where: { eventId, id: invitationId, cancelledAt: null },
          data: { cancelledAt: new Date() },
        });
        if (result.count === 1) {
          cancelledIds.push(invitationId);
        } else {
          alreadyCancelledIds.push(invitationId);
        }
      }
      if (cancelledIds.length > 0) {
        await transaction.auditLog.createMany({
          data: cancelledIds.map((id) => ({
            eventId,
            actorUserId: user.id,
            actorType: "USER",
            action: "invitation.cancelled",
            targetType: "InvitationGroup",
            targetId: id,
            metadata: { bulk: invitationIds.length > 1 },
          })),
        });
      }

      return {
        requestedCount: invitationIds.length,
        cancelledCount: cancelledIds.length,
        alreadyCancelledCount: alreadyCancelledIds.length,
        cancelledIds,
        alreadyCancelledIds,
      };
    });
  }

  public cancel(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<InvitationDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.GUEST_DELETE,
        transaction,
      );
      this.assertEventWritable(event);
      const existing = await this.findInvitation(
        transaction,
        eventId,
        invitationId,
      );
      if (existing.cancelledAt) {
        return this.toDetail(
          existing,
          this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
        );
      }

      const cancelled = await transaction.invitationGroup.updateMany({
        where: { id: invitationId, eventId, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (cancelled.count === 0) {
        const invitation = await this.findInvitation(
          transaction,
          eventId,
          invitationId,
        );
        return this.toDetail(
          invitation,
          this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
        );
      }
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "invitation.cancelled",
          targetType: "InvitationGroup",
          targetId: invitationId,
          metadata: { bulk: false },
        },
      });
      const invitation = await this.findInvitation(
        transaction,
        eventId,
        invitationId,
      );
      return this.toDetail(
        invitation,
        this.access.allows(membership, Permission.GUEST_PHONE_VIEW),
      );
    });
  }

  private listWhere(
    eventId: string,
    query: ListInvitationsQuery,
    maySearchPhone: boolean,
  ): Prisma.InvitationGroupWhereInput {
    const search = query.search?.trim();
    return {
      eventId,
      ...(query.cancellationStatus === "ALL"
        ? {}
        : query.cancellationStatus === "CANCELLED"
          ? { cancelledAt: { not: null } }
          : { cancelledAt: null }),
      ...(query.invitationType ? { invitationType: query.invitationType } : {}),
      ...(query.rsvpStatus ? { rsvpStatus: query.rsvpStatus } : {}),
      ...(search
        ? {
            OR: this.searchConditions(search, maySearchPhone),
          }
        : {}),
    };
  }

  private searchConditions(
    search: string,
    maySearchPhone: boolean,
  ): Prisma.InvitationGroupWhereInput[] {
    const conditions: Prisma.InvitationGroupWhereInput[] = [
      { displayName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      {
        members: { some: { name: { contains: search, mode: "insensitive" } } },
      },
    ];
    if (!maySearchPhone) return conditions;

    const compactPhone = search.replace(/[^+\d]/g, "");
    if (compactPhone.length > 0) {
      conditions.push({ phoneE164: { contains: compactPhone } });
      try {
        const normalized = normalizePhoneNumber(search);
        if (normalized.e164 !== compactPhone) {
          conditions.push({ phoneE164: normalized.e164 });
        }
      } catch (error) {
        if (!(error instanceof PhoneNormalizationError)) throw error;
      }
    }
    return conditions;
  }

  private orderBy(
    sortBy: ListInvitationsQuery["sortBy"],
    sortOrder: ListInvitationsQuery["sortOrder"],
  ): Prisma.InvitationGroupOrderByWithRelationInput[] {
    const direction = sortOrder === "ASC" ? "asc" : "desc";
    const safeField = {
      DISPLAY_NAME: "displayName",
      CREATED_AT: "createdAt",
      UPDATED_AT: "updatedAt",
      EXPECTED_ATTENDEES: "expectedAttendees",
    }[sortBy];
    const primary: Prisma.InvitationGroupOrderByWithRelationInput = {
      [safeField]: direction,
    };
    const tieBreaker: Prisma.InvitationGroupOrderByWithRelationInput = {
      id: direction,
    };
    return [primary, tieBreaker];
  }

  private validateStructure(input: {
    invitationType: CreateInvitationInput["invitationType"];
    maxCompanions: number;
    members: ReadonlyArray<{ isPrimary: boolean }>;
  }): void {
    validateInvitationAggregate({
      invitationType: input.invitationType,
      members: input.members,
      maxCompanions: input.maxCompanions,
    });
  }

  private assertRsvpAllowsStructureEdit(
    invitation: InvitationWithMembersAndRsvp,
    input: UpdateInvitationInput,
  ): void {
    if (
      invitation.rsvp &&
      (input.members !== undefined ||
        input.invitationType !== undefined ||
        input.maxCompanions !== undefined)
    ) {
      throw new ConflictException({
        code: "INVITATION_RSVP_LOCKED",
        message:
          "Invitation members and attendance limits cannot change after an RSVP exists.",
      });
    }
  }

  private async findInvitation(
    client: InvitationClient,
    eventId: string,
    invitationId: string,
    includeRsvp: true,
  ): Promise<InvitationWithMembersAndRsvp>;
  private async findInvitation(
    client: InvitationClient,
    eventId: string,
    invitationId: string,
    includeRsvp?: false,
  ): Promise<InvitationWithMembers>;
  private async findInvitation(
    client: InvitationClient,
    eventId: string,
    invitationId: string,
    includeRsvp = false,
  ): Promise<InvitationWithMembers | InvitationWithMembersAndRsvp> {
    const invitation = await client.invitationGroup.findFirst({
      where: { id: invitationId, eventId },
      include: {
        members: { orderBy: { position: "asc" } },
        ...(includeRsvp ? { rsvp: true } : {}),
      },
    });
    if (!invitation) this.notFound();
    return invitation as InvitationWithMembers | InvitationWithMembersAndRsvp;
  }

  private findPhoneDuplicates(
    client: InvitationClient,
    eventId: string,
    phoneE164: string,
    excludeInvitationId?: string,
  ): Promise<DuplicateInvitation[]> {
    return client.invitationGroup.findMany({
      where: {
        eventId,
        phoneE164,
        cancelledAt: null,
        ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
      },
      select: { id: true, displayName: true, phoneE164: true },
      orderBy: { id: "asc" },
    });
  }

  private assertDuplicateDecision(
    duplicates: DuplicateInvitation[],
    duplicateOverride: boolean | undefined,
  ): void {
    const duplicate = duplicates[0];
    if (!duplicate || duplicateOverride) return;
    throw new ConflictException({
      code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
      message:
        "Another active invitation in this event uses the same contact phone number.",
      details: {
        duplicateCount: duplicates.length,
        duplicates: duplicates.map((item) => ({
          id: item.id,
          displayName: item.displayName,
          phoneMasked: maskPhoneNumber(item.phoneE164),
        })),
        overrideRequired: true,
      },
    });
  }

  private lockPhone(
    transaction: Prisma.TransactionClient,
    eventId: string,
    phoneE164: string,
  ): Promise<Array<{ locked: boolean }>> {
    const lockKey = `${eventId}:${phoneE164}`;
    return transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked
    `;
  }

  private toListItem(
    invitation: InvitationWithMembers,
    mayViewPhone: boolean,
  ): InvitationListItem {
    return {
      id: invitation.id,
      eventId: invitation.eventId,
      displayName: invitation.displayName,
      contactName: invitation.contactName,
      ...this.phoneFields(invitation, mayViewPhone),
      invitationType: invitation.invitationType,
      namedGuestCount: invitation.members.length,
      maxCompanions: invitation.maxCompanions,
      maximumAttendees: this.maximumAttendees(invitation),
      rsvpStatus: invitation.rsvpStatus,
      expectedAttendees: invitation.expectedAttendees,
      cancelledAt: invitation.cancelledAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
    };
  }

  private toDetail(
    invitation: InvitationWithMembers,
    mayViewPhone: boolean,
  ): InvitationDetail {
    return {
      ...this.toListItem(invitation, mayViewPhone),
      internalNote: invitation.internalNote,
      members: invitation.members.map((member) => ({
        id: member.id,
        name: member.name,
        position: member.position,
        isPrimary: member.isPrimary,
      })),
    };
  }

  private phoneFields(
    invitation: Pick<InvitationWithMembers, "phoneE164" | "phoneCountry">,
    mayViewPhone: boolean,
  ) {
    return {
      phoneE164: mayViewPhone ? invitation.phoneE164 : null,
      phoneMasked: maskPhoneNumber(invitation.phoneE164),
      phoneCountry: invitation.phoneCountry,
      phoneIsMasked: !mayViewPhone,
    };
  }

  private maximumAttendees(
    invitation: Pick<
      InvitationWithMembers,
      "invitationType" | "maxCompanions" | "members"
    >,
  ): number {
    return invitation.invitationType === "PRIMARY_WITH_COMPANIONS"
      ? 1 + invitation.maxCompanions
      : invitation.members.length;
  }

  private assertEventWritable(event: Event): void {
    if (event.status === "ARCHIVED" || event.archivedAt) {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Recover the archived event before changing invitations.",
      });
    }
  }

  private async withDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof InvitationInvariantError ||
        error instanceof PhoneNormalizationError
      ) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: "INVITATION_NOT_FOUND",
      message: "The invitation does not exist or is not accessible.",
    });
  }
}
