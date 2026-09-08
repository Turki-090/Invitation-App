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

  public ensureUser(
    principal: AuthPrincipal,
    client: EventAccessClient = this.prisma,
  ): Promise<User> {
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

  public async resolve(
    principal: AuthPrincipal,
    eventId: string,
    permission: PermissionValue,
    client: EventAccessClient = this.prisma,
  ) {
    const user = await this.ensureUser(principal, client);
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

    if (!this.allows(membership, permission)) {
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
      this.permissionOverrides(membership.permissionsJson),
    );
  }

  private permissionOverrides(value: Prisma.JsonValue): PermissionValue[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is PermissionValue =>
        typeof entry === "string" &&
        knownPermissions.has(entry as PermissionValue),
    );
  }
}
