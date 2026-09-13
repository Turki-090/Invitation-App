import { createHash } from "node:crypto";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TeamService } from "./team.service";

const eventId = "10000000-0000-4000-8000-000000000001";
const invitationId = "20000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000001";
const actorUserId = "40000000-0000-4000-8000-000000000001";
const invitedUserId = "50000000-0000-4000-8000-000000000001";
const invitedPhone = "+966501234567";
const now = new Date("2026-09-12T12:00:00.000Z");

const managerPrincipal: AuthPrincipal = {
  subject: "stage-8-team-owner",
  phone: "+966555555555",
};

describe("TeamService", () => {
  it("normalizes an invitation phone, persists only the token hash, and returns the raw token once", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(teamInvitationFixture(data)),
      );
    const auditCreate = vi.fn().mockResolvedValue({});
    const transaction = transactionMock({
      teamInvitation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
      eventMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      auditLog: { create: auditCreate },
    });
    const access = managementAccessMock();
    const service = new TeamService(prismaWithTransaction(transaction), access);

    const before = Date.now();
    const result = await service.createInvitation(managerPrincipal, eventId, {
      phoneNumber: "050 123 4567",
      phoneCountry: "SA",
      role: "CHECK_IN_STAFF",
      permissionConfiguration: { mode: "DEFAULT", permissions: [] },
    });
    const after = Date.now();

    expect(access.resolve).toHaveBeenCalledWith(
      managerPrincipal,
      eventId,
      Permission.TEAM_MANAGE,
      transaction,
    );
    expect(result.acceptanceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const createArgument = create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    const expectedHash = createHash("sha256")
      .update(result.acceptanceToken)
      .digest("hex");
    expect(createArgument.data).toMatchObject({
      eventId,
      invitedByUserId: actorUserId,
      phoneE164: invitedPhone,
      phoneCountry: "SA",
      role: "CHECK_IN_STAFF",
      permissionsJson: [],
      tokenHash: expectedHash,
    });
    expect(createArgument.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgument.data.expiresAt).toBeInstanceOf(Date);
    const expiresAt = (createArgument.data.expiresAt as Date).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000);

    const persistedPayload = JSON.stringify(create.mock.calls[0]);
    const auditPayload = JSON.stringify(auditCreate.mock.calls[0]);
    expect(persistedPayload).not.toContain(result.acceptanceToken);
    expect(auditPayload).not.toContain(result.acceptanceToken);
    expect(auditPayload).not.toContain(invitedPhone);
    expect(result.maskedPhone).toBe("+966•••••4567");
  });

  it.each([Permission.BILLING_MANAGE, Permission.EVENT_DELETE])(
    "rejects the non-delegable %s capability",
    async (permission) => {
      const transaction = transactionMock();
      const service = new TeamService(
        prismaWithTransaction(transaction),
        managementAccessMock(),
      );

      await expect(async () =>
        service.createInvitation(managerPrincipal, eventId, {
          phoneNumber: "0501234567",
          phoneCountry: "SA",
          role: "CO_HOST",
          permissionConfiguration: {
            mode: "CUSTOM",
            permissions: [permission],
          },
        }),
      ).rejects.toMatchObject({
        response: { code: "NON_DELEGABLE_PERMISSION" },
      });
      expect(transaction.teamInvitation.create).not.toHaveBeenCalled();
    },
  );

  it("prevents a team manager from granting a capability they do not hold", async () => {
    const transaction = transactionMock();
    const access = managementAccessMock({
      role: "CO_HOST",
      permissionsJson: {
        mode: "CUSTOM",
        permissions: [Permission.EVENT_VIEW, Permission.TEAM_MANAGE],
      },
    });
    const service = new TeamService(prismaWithTransaction(transaction), access);

    await expect(
      service.createInvitation(managerPrincipal, eventId, {
        phoneNumber: "0501234567",
        phoneCountry: "SA",
        role: "CO_HOST",
        permissionConfiguration: {
          mode: "CUSTOM",
          permissions: [Permission.EVENT_VIEW, Permission.INVITATION_SEND],
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: "PERMISSION_DELEGATION_DENIED",
        details: { permissions: [Permission.INVITATION_SEND] },
      },
    });
    expect(transaction.teamInvitation.create).not.toHaveBeenCalled();
  });

  it("accepts only for the matching principal phone and creates idempotent join notifications", async () => {
    const token = "A".repeat(43);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = teamInvitationFixture({
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const createdMembership = membershipFixture();
    const membershipCreate = vi.fn().mockResolvedValue(createdMembership);
    const invitationUpdate = vi.fn().mockResolvedValue({
      ...invitation,
      status: "ACCEPTED",
      acceptedMembershipId: membershipId,
      acceptedAt: now,
    });
    const notificationCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const invitationFind = vi.fn().mockResolvedValue(invitation);
    const transaction = transactionMock({
      teamInvitation: {
        findFirst: invitationFind,
        findUnique: invitationFind,
        update: invitationUpdate,
      },
      eventMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: membershipCreate,
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: actorUserId },
            { userId: invitedUserId },
          ]),
      },
      notification: { createMany: notificationCreateMany },
      auditLog: { create: auditCreate },
    });
    const access = managementAccessMock();
    access.ensureUser = vi.fn().mockResolvedValue({
      id: invitedUserId,
      phoneE164: invitedPhone,
      displayName: "Sara",
      email: "sara@example.test",
    });
    const service = new TeamService(prismaWithTransaction(transaction), access);

    const result = await service.acceptInvitation(
      { subject: "stage-8-invitee", phone: invitedPhone },
      { token },
    );

    expect(result).toMatchObject({
      eventId,
      alreadyAccepted: false,
      membership: { id: membershipId, userId: invitedUserId, status: "ACTIVE" },
    });
    expect(access.ensureUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone: invitedPhone }),
      transaction,
    );
    expect(JSON.stringify(invitationFind.mock.calls)).toContain(tokenHash);
    expect(JSON.stringify(invitationFind.mock.calls)).not.toContain(token);
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId,
          userId: invitedUserId,
          role: invitation.role,
          status: "ACTIVE",
          invitedBy: actorUserId,
        }),
      }),
    );
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACCEPTED",
          acceptedMembershipId: membershipId,
          acceptedAt: expect.any(Date),
        }),
      }),
    );
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId,
          userId: actorUserId,
          kind: "TEAM_MEMBER_JOINED",
          sourceType: "EventMembership",
          sourceId: membershipId,
        }),
        expect.objectContaining({
          eventId,
          userId: invitedUserId,
          kind: "TEAM_MEMBER_JOINED",
          sourceType: "EventMembership",
          sourceId: membershipId,
        }),
      ],
      skipDuplicates: true,
    });
    expect(JSON.stringify(notificationCreateMany.mock.calls)).not.toContain(
      invitedPhone,
    );
    expect(JSON.stringify(notificationCreateMany.mock.calls)).not.toContain(
      token,
    );
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(invitedPhone);
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(token);
  });

  it("does not accept a valid credential for a different principal phone", async () => {
    const token = "B".repeat(43);
    const invitation = teamInvitationFixture({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const invitationFind = vi.fn().mockResolvedValue(invitation);
    const transaction = transactionMock({
      teamInvitation: {
        findFirst: invitationFind,
        findUnique: invitationFind,
      },
    });
    const access = managementAccessMock();
    access.ensureUser = vi.fn().mockResolvedValue({
      id: invitedUserId,
      phoneE164: invitedPhone,
    });
    const service = new TeamService(prismaWithTransaction(transaction), access);

    await expect(
      service.acceptInvitation(
        { subject: "wrong-phone", phone: "+966509999999" },
        { token },
      ),
    ).rejects.toMatchObject({
      response: { code: "TEAM_INVITATION_NOT_FOUND" },
    });
    expect(transaction.eventMembership.create).not.toHaveBeenCalled();
    expect(transaction.teamInvitation.update).not.toHaveBeenCalled();
    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });

  it("returns an already-accepted result without emitting notifications again", async () => {
    const token = "C".repeat(43);
    const acceptedMembership = membershipFixture();
    const acceptedInvitation = teamInvitationFixture({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: "ACCEPTED",
      acceptedAt: now,
      acceptedMembershipId: membershipId,
      acceptedMembership,
    });
    const invitationFind = vi.fn().mockResolvedValue(acceptedInvitation);
    const transaction = transactionMock({
      teamInvitation: {
        findFirst: invitationFind,
        findUnique: invitationFind,
      },
    });
    const access = managementAccessMock();
    access.ensureUser = vi.fn().mockResolvedValue({
      id: invitedUserId,
      phoneE164: invitedPhone,
    });
    const service = new TeamService(prismaWithTransaction(transaction), access);

    const result = await service.acceptInvitation(
      { subject: "stage-8-invitee", phone: invitedPhone },
      { token },
    );

    expect(result.alreadyAccepted).toBe(true);
    expect(result.membership.id).toBe(membershipId);
    expect(transaction.eventMembership.create).not.toHaveBeenCalled();
    expect(transaction.eventMembership.update).not.toHaveBeenCalled();
    expect(transaction.teamInvitation.update).not.toHaveBeenCalled();
    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });

  it.each(["updateMembership", "revokeMembership"] as const)(
    "protects the owner membership from %s",
    async (operation) => {
      const owner = membershipFixture({
        userId: actorUserId,
        role: "OWNER",
        user: {
          id: actorUserId,
          displayName: "Owner",
          email: "owner@example.test",
        },
      });
      const membershipFind = vi.fn().mockResolvedValue(owner);
      const transaction = transactionMock({
        eventMembership: {
          findFirst: membershipFind,
          findUnique: membershipFind,
        },
      });
      const access = managementAccessMock();
      const service = new TeamService(
        prismaWithTransaction(transaction),
        access,
      );

      const promise =
        operation === "updateMembership"
          ? service.updateMembership(managerPrincipal, eventId, membershipId, {
              role: "CO_HOST",
            })
          : service.revokeMembership(managerPrincipal, eventId, membershipId);

      await expect(promise).rejects.toMatchObject({
        response: { code: "OWNER_MEMBERSHIP_PROTECTED" },
      });
      expect(access.resolve).toHaveBeenCalledWith(
        managerPrincipal,
        eventId,
        Permission.TEAM_MANAGE,
        transaction,
      );
      expect(transaction.eventMembership.update).not.toHaveBeenCalled();
    },
  );
});

function managementAccessMock(
  membership: Record<string, unknown> = {
    role: "OWNER",
    status: "ACTIVE",
    permissionsJson: [],
  },
): EventAccessService & {
  resolve: ReturnType<typeof vi.fn>;
  ensureUser: ReturnType<typeof vi.fn>;
} {
  return {
    resolve: vi.fn().mockResolvedValue({
      event: {
        id: eventId,
        status: "DRAFT",
        archivedAt: null,
      },
      membership,
      user: { id: actorUserId },
    }),
    ensureUser: vi.fn(),
    allows: vi.fn().mockReturnValue(true),
    effectivePermissions: vi.fn(),
    permissionConfiguration: vi.fn(),
  } as unknown as EventAccessService & {
    resolve: ReturnType<typeof vi.fn>;
    ensureUser: ReturnType<typeof vi.fn>;
  };
}

function prismaWithTransaction(
  transaction: ReturnType<typeof transactionMock>,
) {
  return {
    $transaction: vi.fn(
      async (
        operation: (
          client: ReturnType<typeof transactionMock>,
        ) => Promise<unknown>,
      ) => operation(transaction),
    ),
  } as unknown as PrismaService;
}

function transactionMock(overrides: Record<string, unknown> = {}) {
  const {
    teamInvitation: teamInvitationOverrides,
    eventMembership: eventMembershipOverrides,
    notification: notificationOverrides,
    auditLog: auditLogOverrides,
    ...otherOverrides
  } = overrides;
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: invitationId }]),
    teamInvitation: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...(teamInvitationOverrides as object | undefined),
    },
    eventMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      ...(eventMembershipOverrides as object | undefined),
    },
    notification: {
      createMany: vi.fn(),
      ...(notificationOverrides as object | undefined),
    },
    auditLog: {
      create: vi.fn(),
      ...(auditLogOverrides as object | undefined),
    },
    ...otherOverrides,
  };
}

function teamInvitationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: invitationId,
    eventId,
    invitedByUserId: actorUserId,
    acceptedMembershipId: null,
    phoneE164: invitedPhone,
    phoneCountry: "SA",
    role: "CHECK_IN_STAFF",
    permissionsJson: [],
    tokenHash: "a".repeat(64),
    status: "PENDING",
    expiresAt: new Date("2026-09-19T12:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function membershipFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: membershipId,
    eventId,
    userId: invitedUserId,
    role: "CHECK_IN_STAFF",
    status: "ACTIVE",
    permissionsJson: [],
    invitedBy: actorUserId,
    createdAt: now,
    acceptedAt: now,
    revokedAt: null,
    revokedByUserId: null,
    updatedAt: now,
    user: {
      id: invitedUserId,
      displayName: "Sara",
      email: "sara@example.test",
    },
    ...overrides,
  };
}
