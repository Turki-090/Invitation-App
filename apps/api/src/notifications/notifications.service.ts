import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ListNotificationsQuery,
  ListNotificationsResponse,
  Notification as NotificationContract,
  NotificationKind,
} from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
  ) {}

  public async list(
    principal: AuthPrincipal,
    query: ListNotificationsQuery,
  ): Promise<ListNotificationsResponse> {
    const user = await this.access.ensureUser(principal);
    if (query.eventId) {
      await this.access.resolve(
        principal,
        query.eventId,
        Permission.EVENT_VIEW,
      );
    }
    const memberships = await this.prisma.eventMembership.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
        ...(query.eventId ? { eventId: query.eventId } : {}),
      },
      select: { eventId: true, role: true, permissionsJson: true },
    });
    const accessibleEventIds = memberships
      .filter((membership) =>
        this.access.allows(membership, Permission.EVENT_VIEW),
      )
      .map(({ eventId }) => eventId);
    const where = {
      userId: user.id,
      eventId: { in: accessibleEventIds },
      ...(query.unreadOnly ? { readAt: null } : {}),
    } as const;
    const [items, totalItems, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          userId: user.id,
          eventId: { in: accessibleEventIds },
          readAt: null,
        },
      }),
    ]);
    return {
      items: items.map((notification) => this.map(notification)),
      unreadCount,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  public async markRead(
    principal: AuthPrincipal,
    notificationId: string,
  ): Promise<NotificationContract> {
    const user = await this.access.ensureUser(principal);
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });
    if (!notification) this.throwNotFound();
    try {
      await this.access.resolve(
        principal,
        notification.eventId,
        Permission.EVENT_VIEW,
      );
    } catch {
      this.throwNotFound();
    }
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return this.map(updated);
  }

  private map(notification: {
    id: string;
    eventId: string;
    kind: NotificationKind;
    sourceType: string;
    sourceId: string;
    data: unknown;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationContract {
    return {
      id: notification.id,
      eventId: notification.eventId,
      kind: notification.kind,
      sourceType: notification.sourceType,
      sourceId: notification.sourceId,
      data:
        typeof notification.data === "object" &&
        notification.data !== null &&
        !Array.isArray(notification.data)
          ? (notification.data as Record<string, unknown>)
          : {},
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      code: "NOTIFICATION_NOT_FOUND",
      message: "The notification does not exist or is not accessible.",
    });
  }
}
