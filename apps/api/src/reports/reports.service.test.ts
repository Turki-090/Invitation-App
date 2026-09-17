import { ForbiddenException } from "@nestjs/common";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";

const principal: AuthPrincipal = { subject: "stage9-reports" };
const eventId = "10000000-0000-4000-8000-000000000001";

describe("ReportsService", () => {
  it("reconciles group, guest, delivery, and attendance totals", async () => {
    const prisma = prismaMock();
    const access = accessMock();

    const report = await new ReportsService(prisma, access).get(
      principal,
      eventId,
    );

    // Authorization runs on the pooled client, before the snapshot opens.
    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.REPORTS_VIEW,
    );
    expect(report).toMatchObject({
      eventId,
      invitationGroups: {
        active: 10,
        cancelled: 2,
        withInitialInvitation: 7,
        withoutInitialInvitation: 3,
      },
      namedGuests: 24,
      expectedAttendance: 30,
      rsvp: {
        acceptedGroups: 4,
        partiallyAcceptedGroups: 1,
        declinedGroups: 2,
        pendingGroups: 3,
      },
      invitationTypes: {
        singleGroups: 5,
        namedGroupGroups: 3,
        primaryWithCompanionsGroups: 2,
      },
      delivery: {
        latestInvitationMessages: 4,
        notSentGroups: 6,
        byStatus: { delivered: 2, read: 1, failed: 1 },
      },
      checkIn: {
        checkedInGroups: 3,
        checkedInAttendees: 8,
        notArrivedAttendees: 22,
        noShowAttendees: null,
      },
    });
  });

  it("counts one latest invitation message per group, aggregated in the database", async () => {
    const prisma = prismaMock();
    await new ReportsService(prisma, accessMock()).get(principal, eventId);

    const statement = String(prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(statement).toContain("DISTINCT ON");
    expect(statement).toContain("GROUP BY");
    expect(statement).toContain("cancelled_at");
  });

  it("finalizes no-shows only once the event is completed", async () => {
    const prisma = prismaMock();
    const report = await new ReportsService(
      prisma,
      accessMock("COMPLETED"),
    ).get(principal, eventId);

    expect(report.checkIn.noShowAttendees).toBe(22);
  });

  it("reads nothing for a membership denied the reports capability", async () => {
    const prisma = prismaMock();
    const access = accessMock();
    vi.mocked(access.resolve).mockRejectedValueOnce(
      new ForbiddenException({ code: "EVENT_PERMISSION_DENIED" }),
    );

    await expect(
      new ReportsService(prisma, access).get(principal, eventId),
    ).rejects.toMatchObject({
      response: { code: "EVENT_PERMISSION_DENIED" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("counts only active invitation groups in every active total", async () => {
    const prisma = prismaMock();
    await new ReportsService(prisma, accessMock()).get(principal, eventId);

    const activeWhere = { eventId, cancelledAt: null };
    expect(prisma.invitationGroup.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: activeWhere }),
    );
    expect(prisma.invitationGroup.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: activeWhere }),
    );
    expect(prisma.guestMember.count).toHaveBeenCalledWith({
      where: { invitationGroup: activeWhere },
    });
  });

  it("never reports negative derived counts", async () => {
    const prisma = prismaMock({
      checkInAttendees: 45,
      initialInvitationGroups: 14,
    });

    const report = await new ReportsService(prisma, accessMock()).get(
      principal,
      eventId,
    );

    expect(report.invitationGroups.withoutInitialInvitation).toBe(0);
    expect(report.checkIn.notArrivedAttendees).toBe(0);
    expect(report.delivery.notSentGroups).toBe(6);
  });
});

function accessMock(status = "EVENT_DAY"): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({ event: { id: eventId, status } }),
    allows: vi.fn().mockReturnValue(true),
  } as unknown as EventAccessService;
}

function prismaMock(
  overrides: {
    checkInAttendees?: number;
    initialInvitationGroups?: number;
  } = {},
): PrismaService & {
  $queryRaw: ReturnType<typeof vi.fn>;
  guestMember: { count: ReturnType<typeof vi.fn> };
  invitationGroup: {
    aggregate: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
} {
  const client = {
    invitationGroup: {
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: 10 },
        _sum: { expectedAttendees: 30 },
      }),
      count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) =>
        by[0] === "rsvpStatus"
          ? [
              { rsvpStatus: "ACCEPTED", _count: 4 },
              { rsvpStatus: "PARTIALLY_ACCEPTED", _count: 1 },
              { rsvpStatus: "DECLINED", _count: 2 },
              { rsvpStatus: "PENDING", _count: 3 },
            ]
          : [
              { invitationType: "SINGLE", _count: 5 },
              { invitationType: "NAMED_GROUP", _count: 3 },
              { invitationType: "PRIMARY_WITH_COMPANIONS", _count: 2 },
            ],
      ),
    },
    guestMember: { count: vi.fn().mockResolvedValue(24) },
    message: {
      count: vi.fn().mockResolvedValue(overrides.initialInvitationGroups ?? 7),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      { status: "DELIVERED", count: 2 },
      { status: "READ", count: 1 },
      { status: "FAILED", count: 1 },
    ]),
    checkInState: {
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: 3 },
        _sum: { checkedInCount: overrides.checkInAttendees ?? 8 },
      }),
    },
  };
  return {
    ...client,
    $transaction: vi.fn((run: (transaction: unknown) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as PrismaService & {
    $queryRaw: ReturnType<typeof vi.fn>;
    guestMember: { count: ReturnType<typeof vi.fn> };
    invitationGroup: {
      aggregate: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
  };
}
