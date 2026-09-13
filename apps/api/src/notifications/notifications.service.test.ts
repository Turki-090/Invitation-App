import { ForbiddenException } from "@nestjs/common";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

const principal: AuthPrincipal = { subject: "stage8-notifications" };
const userId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const hiddenEventId = "20000000-0000-4000-8000-000000000002";
const notificationId = "30000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-09-12T12:00:00.000Z");

describe("NotificationsService", () => {
  it("lists notifications only for memberships with event.view", async () => {
    const notification = persistedNotification();
    const findMany = vi.fn().mockResolvedValue([notification]);
    const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const prisma = prismaMock({
      eventMembership: {
        findMany: vi.fn().mockResolvedValue([
          { eventId, role: "CO_HOST", permissionsJson: [] },
          {
            eventId: hiddenEventId,
            role: "CHECK_IN_STAFF",
            permissionsJson: { mode: "CUSTOM", permissions: [] },
          },
        ]),
      },
      notification: { findMany, count },
    });
    const access = accessMock();
    vi.mocked(access.allows).mockImplementation(
      (membership) => membership.permissionsJson instanceof Array,
    );

    const result = await new NotificationsService(prisma, access).list(
      principal,
      { page: 1, pageSize: 20, unreadOnly: false },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventId: { in: [eventId] } }),
      }),
    );
    expect(result).toMatchObject({
      unreadCount: 1,
      items: [{ id: notificationId, eventId, readAt: null }],
      pagination: { totalItems: 1, totalPages: 1 },
    });
  });

  it("does not reveal a notification owned by another user", async () => {
    const prisma = prismaMock({
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const access = accessMock();

    await expect(
      new NotificationsService(prisma, access).markRead(
        principal,
        notificationId,
      ),
    ).rejects.toMatchObject({
      response: { code: "NOTIFICATION_NOT_FOUND" },
    });

    expect(access.resolve).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("conceals a notification after event access is revoked", async () => {
    const prisma = prismaMock({
      notification: {
        findFirst: vi.fn().mockResolvedValue(persistedNotification()),
      },
    });
    const access = accessMock();
    vi.mocked(access.resolve).mockRejectedValueOnce(
      new ForbiddenException("revoked"),
    );

    await expect(
      new NotificationsService(prisma, access).markRead(
        principal,
        notificationId,
      ),
    ).rejects.toMatchObject({
      response: { code: "NOTIFICATION_NOT_FOUND" },
    });

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.EVENT_VIEW,
    );
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});

function accessMock(): EventAccessService {
  return {
    ensureUser: vi.fn().mockResolvedValue({ id: userId }),
    resolve: vi.fn().mockResolvedValue({}),
    allows: vi.fn().mockReturnValue(true),
  } as unknown as EventAccessService;
}

function prismaMock(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    eventMembership: {
      findMany: vi.fn().mockResolvedValue([]),
      ...(overrides.eventMembership as object | undefined),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
      ...(overrides.notification as object | undefined),
    },
  } as unknown as PrismaService;
}

function persistedNotification() {
  return {
    id: notificationId,
    eventId,
    userId,
    kind: "REMINDER_BATCH_COMPLETED" as const,
    sourceType: "ReminderRun",
    sourceId: "40000000-0000-4000-8000-000000000001",
    data: { sent: 2 },
    readAt: null,
    createdAt,
  };
}
