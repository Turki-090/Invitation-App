import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AcceptTeamInvitationInput,
  AcceptTeamInvitationResult,
  CreateTeamInvitationInput,
  PermissionConfigurationInput,
  TeamInvitation,
  TeamInvitationCredential,
  TeamMember,
  TeamOverview,
  UpdateTeamMemberInput,
} from "@dawah/api-contract";
import {
  ALL_PERMISSIONS,
  effectivePermissions,
  isCustomPermissionConfiguration,
  maskPhoneNumber,
  MembershipRole,
  NON_DELEGABLE_PERMISSIONS,
  normalizePhoneNumber,
  Permission,
  type GccPhoneCountry,
  type Permission as PermissionValue,
  type PermissionConfiguration,
} from "@dawah/domain";
import type {
  Event,
  EventMembership,
  EventMembershipRole,
  Prisma,
  TeamInvitation as TeamInvitationRecord,
  User,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";

const INVITATION_VALIDITY_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const knownPermissions = new Set<PermissionValue>(ALL_PERMISSIONS);
const nonDelegablePermissions = new Set<PermissionValue>(
  NON_DELEGABLE_PERMISSIONS,
);

type MembershipWithUser = EventMembership & {
  user: Pick<User, "displayName" | "email">;
};

type PermissionPresentation = Pick<
  TeamMember,
  "permissionMode" | "configuredPermissions" | "effectivePermissions"
>;

type AcceptTransactionResult =
  { kind: "expired" } | { kind: "accepted"; value: AcceptTeamInvitationResult };

@Injectable()
export class TeamService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public async listTeam(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<TeamOverview> {
    await this.access.resolve(principal, eventId, Permission.TEAM_MANAGE);
    const [memberships, invitations] = await Promise.all([
      this.prisma.eventMembership.findMany({
        where: { eventId },
        include: {
          user: { select: { displayName: true, email: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.teamInvitation.findMany({
        where: { eventId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    const now = new Date();
    return {
      eventId,
      members: memberships.map((membership) => this.toTeamMember(membership)),
      invitations: invitations.map((invitation) =>
        this.toTeamInvitation(invitation, now),
      ),
    };
  }

  public async createInvitation(
    principal: AuthPrincipal,
    eventId: string,
    input: CreateTeamInvitationInput,
  ): Promise<TeamInvitationCredential> {
    const phone = this.normalizedGccPhone(
      input.phoneNumber,
      input.phoneCountry,
    );
    const storedPermissions = this.toStoredPermissionConfiguration(
      input.role,
      input.permissionConfiguration,
    );
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      this.assertEventWritable(event);
      this.assertCanDelegate(
        membership,
        input.role,
        this.permissionConfigurationFromInput(input.permissionConfiguration),
      );
      await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`team-invitation:${eventId}:${phone.e164}`}, 0)) IS NULL AS locked
        `;

      const activeMembership = await transaction.eventMembership.findFirst({
        where: {
          eventId,
          status: "ACTIVE",
          user: { phoneE164: phone.e164 },
        },
        select: { id: true },
      });
      if (activeMembership) {
        throw new ConflictException({
          code: "TEAM_MEMBER_ALREADY_ACTIVE",
          message:
            "This phone number already belongs to an active team member.",
        });
      }

      const now = new Date();
      await transaction.teamInvitation.updateMany({
        where: {
          eventId,
          phoneE164: phone.e164,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });
      const pendingInvitation = await transaction.teamInvitation.findFirst({
        where: {
          eventId,
          phoneE164: phone.e164,
          status: "PENDING",
        },
        select: { id: true },
      });
      if (pendingInvitation) {
        throw new ConflictException({
          code: "TEAM_INVITATION_ALREADY_PENDING",
          message:
            "A pending team invitation already exists for this phone number.",
        });
      }

      const acceptanceToken = this.createAcceptanceToken();
      const expiresAt = new Date(
        now.getTime() + INVITATION_VALIDITY_MILLISECONDS,
      );
      const invitation = await transaction.teamInvitation.create({
        data: {
          eventId,
          invitedByUserId: user.id,
          phoneE164: phone.e164,
          phoneCountry: phone.countryCode,
          role: input.role,
          permissionsJson: storedPermissions,
          tokenHash: this.hashAcceptanceToken(acceptanceToken),
          expiresAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "team.invitation_created",
          targetType: "TeamInvitation",
          targetId: invitation.id,
          metadata: {
            role: invitation.role,
            permissionMode: input.permissionConfiguration.mode,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      return {
        ...this.toTeamInvitation(invitation, now),
        acceptanceToken,
      };
    }, this.transactionOptions());
  }

  public resendInvitation(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<TeamInvitationCredential> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      this.assertEventWritable(event);
      const current = await this.lockInvitation(
        transaction,
        eventId,
        invitationId,
      );
      if (current.status === "ACCEPTED" || current.status === "REVOKED") {
        throw new ConflictException({
          code: "TEAM_INVITATION_NOT_RESENDABLE",
          message: "Only a pending or expired invitation can be resent.",
        });
      }
      this.assertMutableMembership(current);
      this.assertCanDelegate(
        membership,
        current.role as Exclude<EventMembershipRole, "OWNER">,
        this.parsePermissionConfiguration(current.permissionsJson),
      );

      const now = new Date();
      const acceptanceToken = this.createAcceptanceToken();
      const invitation = await transaction.teamInvitation.update({
        where: { id: current.id },
        data: {
          tokenHash: this.hashAcceptanceToken(acceptanceToken),
          status: "PENDING",
          expiresAt: new Date(now.getTime() + INVITATION_VALIDITY_MILLISECONDS),
          acceptedAt: null,
          acceptedMembershipId: null,
          revokedAt: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "team.invitation_resent",
          targetType: "TeamInvitation",
          targetId: invitation.id,
          metadata: {
            role: invitation.role,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
      });
      return {
        ...this.toTeamInvitation(invitation, now),
        acceptanceToken,
      };
    }, this.transactionOptions());
  }

  public revokeInvitation(
    principal: AuthPrincipal,
    eventId: string,
    invitationId: string,
  ): Promise<TeamInvitation> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      this.assertEventWritable(event);
      const current = await this.lockInvitation(
        transaction,
        eventId,
        invitationId,
      );
      if (current.status === "REVOKED") {
        return this.toTeamInvitation(current);
      }
      if (current.status === "ACCEPTED") {
        throw new ConflictException({
          code: "TEAM_INVITATION_ALREADY_ACCEPTED",
          message: "Revoke the accepted team membership instead.",
        });
      }

      const revokedAt = new Date();
      const invitation = await transaction.teamInvitation.update({
        where: { id: current.id },
        data: { status: "REVOKED", revokedAt },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "team.invitation_revoked",
          targetType: "TeamInvitation",
          targetId: invitation.id,
          metadata: { previousStatus: current.status },
        },
      });
      return this.toTeamInvitation(invitation, revokedAt);
    }, this.transactionOptions());
  }

  public updateMembership(
    principal: AuthPrincipal,
    eventId: string,
    membershipId: string,
    input: UpdateTeamMemberInput,
  ): Promise<TeamMember> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, membership, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      this.assertEventWritable(event);
      const current = await this.lockMembership(
        transaction,
        eventId,
        membershipId,
      );
      this.assertMutableMembership(current);
      if (current.status === "REVOKED") {
        throw new ConflictException({
          code: "TEAM_MEMBERSHIP_REVOKED",
          message: "A revoked membership cannot be updated.",
        });
      }

      const role: Exclude<EventMembershipRole, "OWNER"> =
        input.role ?? (current.role as Exclude<EventMembershipRole, "OWNER">);
      const permissionConfiguration = input.permissionConfiguration
        ? this.permissionConfigurationFromInput(input.permissionConfiguration)
        : this.parsePermissionConfiguration(current.permissionsJson);
      this.assertCanDelegate(membership, role, permissionConfiguration);
      const permissionsJson = input.permissionConfiguration
        ? this.toStoredPermissionConfiguration(
            role,
            input.permissionConfiguration,
          )
        : this.normalizeStoredPermissionConfiguration(
            role,
            current.permissionsJson,
          );
      const updated = await transaction.eventMembership.update({
        where: { id: current.id },
        data: { role, permissionsJson },
        include: {
          user: { select: { displayName: true, email: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "team.membership_updated",
          targetType: "EventMembership",
          targetId: updated.id,
          metadata: {
            changedFields: Object.keys(input).sort(),
            previousRole: current.role,
            newRole: updated.role,
            permissionMode: this.permissionPresentation(
              updated.role,
              updated.permissionsJson,
            ).permissionMode,
          },
        },
      });
      return this.toTeamMember(updated);
    }, this.transactionOptions());
  }

  public revokeMembership(
    principal: AuthPrincipal,
    eventId: string,
    membershipId: string,
  ): Promise<TeamMember> {
    return this.prisma.$transaction(async (transaction) => {
      const { event, user } = await this.access.resolve(
        principal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      this.assertEventWritable(event);
      const current = await this.lockMembership(
        transaction,
        eventId,
        membershipId,
      );
      this.assertMutableMembership(current);
      if (current.status === "REVOKED") {
        return this.toTeamMember(current);
      }

      const revokedAt = new Date();
      const revoked = await transaction.eventMembership.update({
        where: { id: current.id },
        data: {
          status: "REVOKED",
          revokedAt,
          revokedByUserId: user.id,
        },
        include: {
          user: { select: { displayName: true, email: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          eventId,
          actorUserId: user.id,
          actorType: "USER",
          action: "team.membership_revoked",
          targetType: "EventMembership",
          targetId: revoked.id,
          metadata: { previousStatus: current.status },
        },
      });
      return this.toTeamMember(revoked);
    }, this.transactionOptions());
  }

  public async acceptInvitation(
    principal: AuthPrincipal,
    input: AcceptTeamInvitationInput,
  ): Promise<AcceptTeamInvitationResult> {
    const tokenHash = this.hashAcceptanceToken(input.token);
    const result = await this.prisma.$transaction(
      async (transaction): Promise<AcceptTransactionResult> => {
        const invitation = await this.lockInvitationByToken(
          transaction,
          tokenHash,
        );
        if (
          invitation.status === "REVOKED" ||
          invitation.status === "EXPIRED"
        ) {
          this.throwInvitationNotFound();
        }
        const now = new Date();
        if (
          invitation.status === "PENDING" &&
          invitation.expiresAt.getTime() <= now.getTime()
        ) {
          await transaction.teamInvitation.update({
            where: { id: invitation.id },
            data: { status: "EXPIRED" },
          });
          return { kind: "expired" };
        }

        const acceptingUser = await this.access.ensureUser(
          principal,
          transaction,
        );
        const verifiedPhone =
          principal.phone ??
          (process.env.NODE_ENV === "test" ? acceptingUser.phoneE164 : null);
        if (!verifiedPhone || verifiedPhone !== invitation.phoneE164) {
          this.throwInvitationNotFound();
        }

        if (invitation.status === "ACCEPTED") {
          const acceptedMembership = invitation.acceptedMembership;
          if (
            !acceptedMembership ||
            acceptedMembership.userId !== acceptingUser.id
          ) {
            this.throwInvitationNotFound();
          }
          return {
            kind: "accepted",
            value: {
              eventId: invitation.eventId,
              membership: this.toTeamMember(acceptedMembership),
              alreadyAccepted: true,
            },
          };
        }
        if (invitation.role === "OWNER") {
          throw new ForbiddenException({
            code: "OWNER_MEMBERSHIP_PROTECTED",
            message: "Ownership cannot be granted through a team invitation.",
          });
        }

        await transaction.$queryRaw`
          SELECT "id"
          FROM "event_memberships"
          WHERE "event_id" = ${invitation.eventId}::uuid
            AND "user_id" = ${acceptingUser.id}::uuid
          FOR UPDATE
        `;
        const existing = await transaction.eventMembership.findFirst({
          where: {
            eventId: invitation.eventId,
            userId: acceptingUser.id,
          },
          include: {
            user: { select: { displayName: true, email: true } },
          },
        });
        if (existing?.role === "OWNER") {
          throw new ForbiddenException({
            code: "OWNER_MEMBERSHIP_PROTECTED",
            message: "The event owner membership cannot be replaced.",
          });
        }
        if (existing?.status === "ACTIVE") {
          throw new ConflictException({
            code: "TEAM_MEMBER_ALREADY_ACTIVE",
            message: "This user is already an active event team member.",
          });
        }

        const membership = existing
          ? await transaction.eventMembership.update({
              where: { id: existing.id },
              data: {
                role: invitation.role,
                status: "ACTIVE",
                permissionsJson: this.normalizeStoredPermissionConfiguration(
                  invitation.role,
                  invitation.permissionsJson,
                ),
                invitedBy: invitation.invitedByUserId,
                acceptedAt: now,
                revokedAt: null,
                revokedByUserId: null,
              },
              include: {
                user: { select: { displayName: true, email: true } },
              },
            })
          : await transaction.eventMembership.create({
              data: {
                eventId: invitation.eventId,
                userId: acceptingUser.id,
                role: invitation.role,
                status: "ACTIVE",
                permissionsJson: this.normalizeStoredPermissionConfiguration(
                  invitation.role,
                  invitation.permissionsJson,
                ),
                invitedBy: invitation.invitedByUserId,
                acceptedAt: now,
              },
              include: {
                user: { select: { displayName: true, email: true } },
              },
            });

        await transaction.teamInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: now,
            acceptedMembershipId: membership.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventId: invitation.eventId,
            actorUserId: acceptingUser.id,
            actorType: "USER",
            action: "team.member_joined",
            targetType: "EventMembership",
            targetId: membership.id,
            metadata: {
              invitationId: invitation.id,
              role: membership.role,
              reactivated: Boolean(existing),
            },
          },
        });

        const recipients = await transaction.eventMembership.findMany({
          where: { eventId: invitation.eventId, status: "ACTIVE" },
          select: { userId: true, role: true, permissionsJson: true },
        });
        const notificationRecipients = recipients.filter(
          (recipient) =>
            recipient.userId === membership.userId ||
            this.access.allows(recipient, Permission.TEAM_MANAGE),
        );
        await transaction.notification.createMany({
          data: notificationRecipients.map(({ userId }) => ({
            eventId: invitation.eventId,
            userId,
            kind: "TEAM_MEMBER_JOINED",
            sourceType: "EventMembership",
            sourceId: membership.id,
            data: { membershipId: membership.id, role: membership.role },
          })),
          skipDuplicates: true,
        });

        return {
          kind: "accepted",
          value: {
            eventId: invitation.eventId,
            membership: this.toTeamMember(membership),
            alreadyAccepted: false,
          },
        };
      },
      this.transactionOptions(),
    );
    if (result.kind === "expired") this.throwInvitationNotFound();
    return result.value;
  }

  private async lockInvitation(
    transaction: Prisma.TransactionClient,
    eventId: string,
    invitationId: string,
  ): Promise<TeamInvitationRecord> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "team_invitations"
      WHERE "id" = ${invitationId}::uuid
        AND "event_id" = ${eventId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) this.throwInvitationNotFound();
    const invitation = await transaction.teamInvitation.findFirst({
      where: { id: invitationId, eventId },
    });
    if (!invitation) this.throwInvitationNotFound();
    return invitation;
  }

  private async lockInvitationByToken(
    transaction: Prisma.TransactionClient,
    tokenHash: string,
  ): Promise<
    TeamInvitationRecord & {
      acceptedMembership: MembershipWithUser | null;
    }
  > {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "team_invitations"
      WHERE "token_hash" = ${tokenHash}
      FOR UPDATE
    `;
    if (rows.length === 0) this.throwInvitationNotFound();
    const invitation = await transaction.teamInvitation.findUnique({
      where: { tokenHash },
      include: {
        acceptedMembership: {
          include: {
            user: { select: { displayName: true, email: true } },
          },
        },
      },
    });
    if (!invitation) this.throwInvitationNotFound();
    return invitation;
  }

  private async lockMembership(
    transaction: Prisma.TransactionClient,
    eventId: string,
    membershipId: string,
  ): Promise<MembershipWithUser> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "event_memberships"
      WHERE "id" = ${membershipId}::uuid
        AND "event_id" = ${eventId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) this.throwMembershipNotFound();
    const membership = await transaction.eventMembership.findFirst({
      where: { id: membershipId, eventId },
      include: {
        user: { select: { displayName: true, email: true } },
      },
    });
    if (!membership) this.throwMembershipNotFound();
    return membership;
  }

  private assertMutableMembership(
    membership: Pick<EventMembership, "role">,
  ): void {
    if (membership.role === "OWNER") {
      throw new ForbiddenException({
        code: "OWNER_MEMBERSHIP_PROTECTED",
        message: "The event owner membership cannot be changed or revoked.",
      });
    }
  }

  private normalizedGccPhone(input: string, defaultCountry: GccPhoneCountry) {
    try {
      const phone = normalizePhoneNumber(input, defaultCountry);
      if (!phone.isGcc) {
        throw new BadRequestException({
          code: "TEAM_INVITATION_PHONE_COUNTRY_UNSUPPORTED",
          message: "Team invitations currently require a GCC phone number.",
        });
      }
      return phone;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: "TEAM_INVITATION_PHONE_INVALID",
        message:
          error instanceof Error
            ? error.message
            : "The phone number is invalid.",
      });
    }
  }

  private toStoredPermissionConfiguration(
    role: Exclude<EventMembershipRole, "OWNER">,
    input: PermissionConfigurationInput,
  ): Prisma.InputJsonValue {
    if (input.mode === "DEFAULT") return [];
    const forbidden = input.permissions.filter((permission) =>
      nonDelegablePermissions.has(permission),
    );
    if (forbidden.length > 0) {
      throw new BadRequestException({
        code: "NON_DELEGABLE_PERMISSION",
        message: "One or more permissions can only be held by the event owner.",
        details: { permissions: forbidden },
      });
    }
    const permissions = effectivePermissions(role as MembershipRole, {
      mode: "CUSTOM",
      permissions: input.permissions,
    });
    return { mode: "CUSTOM", permissions: [...permissions] };
  }

  private permissionConfigurationFromInput(
    input: PermissionConfigurationInput,
  ): PermissionConfiguration {
    return input.mode === "DEFAULT"
      ? []
      : { mode: "CUSTOM", permissions: input.permissions };
  }

  private assertCanDelegate(
    actor: Pick<EventMembership, "role" | "permissionsJson">,
    targetRole: Exclude<EventMembershipRole, "OWNER">,
    targetConfiguration: PermissionConfiguration,
  ): void {
    if (actor.role === "OWNER") return;
    const actorPermissions = new Set(
      effectivePermissions(
        actor.role as MembershipRole,
        this.parsePermissionConfiguration(actor.permissionsJson),
      ),
    );
    const excessivePermissions = effectivePermissions(
      targetRole as MembershipRole,
      targetConfiguration,
    ).filter((permission) => !actorPermissions.has(permission));
    if (excessivePermissions.length === 0) return;
    throw new ForbiddenException({
      code: "PERMISSION_DELEGATION_DENIED",
      message: "Team managers cannot grant permissions they do not hold.",
      details: { permissions: excessivePermissions },
    });
  }

  private normalizeStoredPermissionConfiguration(
    role: Exclude<EventMembershipRole, "OWNER">,
    raw: Prisma.JsonValue,
  ): Prisma.InputJsonValue {
    const configuration = this.parsePermissionConfiguration(raw);
    if (
      !isCustomPermissionConfiguration(configuration) &&
      configuration.length === 0
    ) {
      return [];
    }
    return {
      mode: "CUSTOM",
      permissions: [
        ...effectivePermissions(role as MembershipRole, configuration),
      ],
    };
  }

  private permissionPresentation(
    role: EventMembershipRole,
    raw: Prisma.JsonValue,
  ): PermissionPresentation {
    const configuration = this.parsePermissionConfiguration(raw);
    const resolved = [
      ...effectivePermissions(role as MembershipRole, configuration),
    ];
    const custom =
      isCustomPermissionConfiguration(configuration) ||
      (Array.isArray(configuration) && configuration.length > 0);
    return {
      permissionMode: custom ? "CUSTOM" : "DEFAULT",
      configuredPermissions: custom ? resolved : [],
      effectivePermissions: resolved,
    };
  }

  private parsePermissionConfiguration(
    value: Prisma.JsonValue,
  ): PermissionConfiguration {
    if (Array.isArray(value)) {
      return value.filter(
        (entry): entry is PermissionValue =>
          typeof entry === "string" &&
          knownPermissions.has(entry as PermissionValue),
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
          (entry): entry is PermissionValue =>
            typeof entry === "string" &&
            knownPermissions.has(entry as PermissionValue),
        ),
      };
    }
    return [];
  }

  private toTeamMember(membership: MembershipWithUser): TeamMember {
    return {
      id: membership.id,
      userId: membership.userId,
      displayName: membership.user.displayName,
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      ...this.permissionPresentation(
        membership.role,
        membership.permissionsJson,
      ),
      invitedByUserId: membership.invitedBy,
      acceptedAt: membership.acceptedAt?.toISOString() ?? null,
      createdAt: membership.createdAt.toISOString(),
      revokedAt: membership.revokedAt?.toISOString() ?? null,
    };
  }

  private toTeamInvitation(
    invitation: TeamInvitationRecord,
    now = new Date(),
  ): TeamInvitation {
    const status =
      invitation.status === "PENDING" && invitation.expiresAt <= now
        ? "EXPIRED"
        : invitation.status;
    return {
      id: invitation.id,
      eventId: invitation.eventId,
      maskedPhone: maskPhoneNumber(invitation.phoneE164),
      phoneCountry: invitation.phoneCountry as GccPhoneCountry,
      role: invitation.role as Exclude<EventMembershipRole, "OWNER">,
      status,
      ...this.permissionPresentation(
        invitation.role,
        invitation.permissionsJson,
      ),
      invitedByUserId: invitation.invitedByUserId,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
    };
  }

  private createAcceptanceToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashAcceptanceToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private assertEventWritable(
    event: Pick<Event, "status" | "archivedAt">,
  ): void {
    if (event.status === "ARCHIVED" || event.archivedAt) {
      throw new ConflictException({
        code: "EVENT_ARCHIVED",
        message: "Archived events cannot be changed.",
      });
    }
  }

  private throwInvitationNotFound(): never {
    throw new NotFoundException({
      code: "TEAM_INVITATION_NOT_FOUND",
      message: "The team invitation does not exist or is no longer available.",
    });
  }

  private throwMembershipNotFound(): never {
    throw new NotFoundException({
      code: "TEAM_MEMBERSHIP_NOT_FOUND",
      message: "The team membership does not exist for this event.",
    });
  }

  private transactionOptions() {
    return {
      isolationLevel: "ReadCommitted" as const,
      maxWait: 5_000,
      timeout: 15_000,
    };
  }
}
