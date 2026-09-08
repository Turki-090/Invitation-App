import { ConflictException } from "@nestjs/common";
import type {
  CreateInvitationInput,
  ListInvitationsQuery,
} from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { InvitationsService } from "./invitations.service";

const eventId = "10000000-0000-4000-8000-000000000001";
const invitationId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-07T12:00:00.000Z");
const principal: AuthPrincipal = { subject: "stage-4-test-host" };

const invitation = {
  id: invitationId,
  eventId,
  displayName: "Family contact",
  contactName: "Noura",
  phoneE164: "+966501234567",
  phoneCountry: "SA",
  invitationType: "SINGLE" as const,
  maxCompanions: 0,
  internalNote: null,
  rsvpStatus: "PENDING" as const,
  expectedAttendees: 0,
  createdBy: userId,
  createdAt: now,
  updatedAt: now,
  cancelledAt: null,
  members: [
    {
      id: memberId,
      invitationGroupId: invitationId,
      name: "Noura",
      position: 1,
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

describe("InvitationsService", () => {
  it("masks phones and excludes phone search for memberships without phone access", async () => {
    const findMany = vi.fn().mockResolvedValue([invitation]);
    const prisma = {
      invitationGroup: {
        findMany,
        count: vi.fn().mockResolvedValue(1),
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 1 },
          _sum: { expectedAttendees: 0 },
        }),
      },
      guestMember: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const access = {
      resolve: vi.fn().mockResolvedValue({
        membership: {
          role: "CHECK_IN_STAFF",
          permissionsJson: [],
        },
      }),
      allows: vi.fn().mockReturnValue(false),
    } as unknown as EventAccessService;
    const service = new InvitationsService(prisma, access);
    const query: ListInvitationsQuery = {
      page: 1,
      pageSize: 25,
      search: "0501234567",
      cancellationStatus: "ACTIVE",
      sortBy: "CREATED_AT",
      sortOrder: "DESC",
    };

    const result = await service.list(principal, eventId, query);

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.GUEST_VIEW,
    );
    expect(JSON.stringify(findMany.mock.calls[0]?.[0])).not.toContain(
      "phoneE164",
    );
    expect(result.items[0]).toMatchObject({
      phoneE164: null,
      phoneMasked: "+966•••••4567",
      phoneIsMasked: true,
    });
  });

  it("returns a masked, stable conflict when a phone requires explicit override", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]),
      invitationGroup: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: invitationId,
            displayName: invitation.displayName,
            phoneE164: invitation.phoneE164,
          },
        ]),
        create: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const access = createAccess();
    const service = new InvitationsService(prisma, access);

    let response: unknown;
    try {
      await service.create(principal, eventId, createInput(false));
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toEqual({
      code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
      message:
        "Another active invitation in this event uses the same contact phone number.",
      details: {
        duplicateCount: 1,
        duplicates: [
          {
            id: invitationId,
            displayName: invitation.displayName,
            phoneMasked: "+966•••••4567",
          },
        ],
        overrideRequired: true,
      },
    });
    expect(JSON.stringify(response)).not.toContain(invitation.phoneE164);
    expect(transaction.invitationGroup.create).not.toHaveBeenCalled();
  });

  it("normalizes the phone and writes the invitation and audit in one transaction", async () => {
    const create = vi.fn().mockResolvedValue(invitation);
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]),
      invitationGroup: {
        findMany: vi.fn().mockResolvedValue([]),
        create,
      },
      auditLog: { create: audit },
    };
    const prisma = {
      $transaction: vi.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const service = new InvitationsService(prisma, createAccess());

    const result = await service.create(principal, eventId, createInput(true));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId,
          phoneE164: "+966501234567",
          phoneCountry: "SA",
          members: {
            create: [{ name: "Noura", isPrimary: true, position: 1 }],
          },
        }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "invitation.created",
          metadata: expect.objectContaining({ duplicateOverride: false }),
        }),
      }),
    );
    expect(result.phoneE164).toBe("+966501234567");
    expect(result.phoneIsMasked).toBe(false);
  });
});

function createInput(duplicateOverride: boolean): CreateInvitationInput {
  return {
    displayName: "Family contact",
    contactName: "Noura",
    phoneNumber: "0501234567",
    phoneCountry: "SA",
    invitationType: "SINGLE",
    maxCompanions: 0,
    members: [{ name: "Noura", isPrimary: true }],
    duplicateOverride,
  };
}

function createAccess(): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({
      event: { status: "DRAFT", archivedAt: null },
      membership: { role: "OWNER", permissionsJson: [] },
      user: { id: userId },
    }),
    allows: vi.fn().mockReturnValue(true),
  } as unknown as EventAccessService;
}
