import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  hasPermission,
  MembershipRole,
  Permission,
  type PermissionConfiguration,
  type Permission as PermissionValue,
} from "@dawah/domain";
import type { EventMembership, Prisma, User } from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

type EventAccessClient = PrismaService | Prisma.TransactionClient;
type EventAccessMembership = Pick<EventMembership, "role" | "permissionsJson">;

const knownPermissions = new Set<PermissionValue>(Object.values(Permission));

@Injectable()
export class EventAccessService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves the calling user, writing only when the row is missing or its
   * contact details actually changed. Every authenticated request passes
   * through here, and an unconditional write made concurrent requests from one
   * principal collide inside the repeatable-read and serializable transactions
   * that reports and check-in run in.
   */
  public async ensureUser(
    principal: AuthPrincipal,
    client: EventAccessClient = this.prisma,
  ): Promise<User> {
    const existing = await client.user.findUnique({
      where: { authProviderId: principal.subject },
    });
    if (existing && !this.contactChanged(existing, principal)) return existing;

    return client.user.upsert({
      where: { authProviderId: principal.subject },
      create: {
        authProviderId: principal.subject,
        email: principal.email,
        phoneE164: principal.phone,
      },
      update: {
        ...(principal.email ? { email: principal.email } : {}),
        ...(principal.phone ? { phoneE164: principal.phone } : {}),
      },
    });
  }

  private contactChanged(user: User, principal: AuthPrincipal): boolean {
    return (
      (principal.email !== undefined && principal.email !== user.email) ||
      (principal.phone !== undefined && principal.phone !== user.phoneE164)
    );
  }

  public resolve(
    principal: AuthPrincipal,
    eventId: string,
    permission: PermissionValue,
    client: EventAccessClient = this.prisma,
  ) {
    return this.resolveAny(principal, eventId, [permission], client);
  }

  public async resolveAny(
    principal: AuthPrincipal,
    eventId: string,
    permissions: readonly PermissionValue[],
    client: EventAccessClient = this.prisma,
  ) {
    if (permissions.length === 0) {
      throw new RangeError("At least one event permission is required.");
    }
    const user = await this.ensureUser(principal, client);
    if (client !== this.prisma) {
      await client.$queryRaw`
        SELECT "id"
        FROM "event_memberships"
        WHERE "event_id" = ${eventId}::uuid
          AND "user_id" = ${user.id}::uuid
          AND "status" = 'ACTIVE'
        FOR SHARE
      `;
    }
    const membership = await client.eventMembership.findFirst({
      where: { eventId, userId: user.id, status: "ACTIVE" },
      include: { event: true },
    });

    // Use the same response for a missing event and a non-member so callers
    // cannot probe event UUIDs across tenants.
    if (!membership) {
      throw new NotFoundException({
        code: "EVENT_NOT_FOUND",
        message: "The event does not exist or is not accessible.",
      });
    }

    if (
      !permissions.some((permission) => this.allows(membership, permission))
    ) {
      throw new ForbiddenException({
        code: "EVENT_PERMISSION_DENIED",
        message: "The event membership lacks the required permission.",
      });
    }

    return { user, membership, event: membership.event };
  }

  /**
   * Evaluates another capability for an already-resolved membership without
   * turning an optional capability (such as viewing full phone numbers) into
   * a failed request.
   */
  public allows(
    membership: EventAccessMembership,
    permission: PermissionValue,
  ): boolean {
    return hasPermission(
      membership.role as MembershipRole,
      permission,
      this.permissionConfiguration(membership.permissionsJson),
    );
  }

  public effectivePermissions(
    membership: EventAccessMembership,
  ): readonly PermissionValue[] {
    return Object.values(Permission).filter((permission) =>
      this.allows(membership, permission),
    );
  }

  public permissionConfiguration(
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
}
