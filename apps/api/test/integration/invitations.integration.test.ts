import {
  listInvitationsQuerySchema,
  type CreateInvitationInput,
} from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { EventAccessService } from "../../src/events/event-access.service";
import { InvitationsService } from "../../src/invitations/invitations.service";
import { TestDatabase } from "./database";
import {
  createEventFixture,
  createUserFixture,
  resetFactorySequence,
} from "./factories";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const database = new TestDatabase();
const prisma = database.prisma;
const prismaService = prisma as unknown as PrismaService;
const access = new EventAccessService(prismaService);
const invitations = new InvitationsService(prismaService, access);

const listQuery = (overrides: Record<string, unknown> = {}) =>
  listInvitationsQuerySchema.parse(overrides);

function singleInput(
  overrides: Partial<CreateInvitationInput> = {},
): CreateInvitationInput {
  return {
    displayName: "سارة القحطاني",
    contactName: "سارة القحطاني",
    phoneNumber: "051 234 5678",
    phoneCountry: "SA",
    invitationType: "SINGLE",
    maxCompanions: 0,
    members: [{ name: "سارة القحطاني", isPrimary: true }],
    duplicateOverride: false,
    ...overrides,
  };
}

describe("InvitationsService PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await database.clean();
    resetFactorySequence();
  });

  afterAll(async () => {
    await database.clean();
    await prisma.$disconnect();
  });

  it("creates all invitation aggregates transactionally with normalized phones and explicit units", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "invitation-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };

    const single = await invitations.create(principal, event.id, singleInput());
    const family = await invitations.create(
      principal,
      event.id,
      singleInput({
        displayName: "عائلة الدوسري",
        contactName: "عبدالله الدوسري",
        phoneNumber: "050 123 4567",
        phoneCountry: "AE",
        invitationType: "NAMED_GROUP",
        members: [
          { name: "عبدالله", isPrimary: true },
          { name: "منيرة", isPrimary: false },
          { name: "ريم", isPrimary: false },
        ],
      }),
    );
    const companions = await invitations.create(
      principal,
      event.id,
      singleInput({
        displayName: "محمد العتيبي",
        contactName: "محمد العتيبي",
        phoneNumber: "5001 2345",
        phoneCountry: "KW",
        invitationType: "PRIMARY_WITH_COMPANIONS",
        maxCompanions: 2,
        members: [{ name: "محمد العتيبي", isPrimary: true }],
      }),
    );

    expect(single).toMatchObject({
      eventId: event.id,
      phoneE164: "+966512345678",
      phoneCountry: "SA",
      namedGuestCount: 1,
      maximumAttendees: 1,
    });
    expect(family).toMatchObject({
      phoneE164: "+971501234567",
      phoneCountry: "AE",
      namedGuestCount: 3,
      maximumAttendees: 3,
    });
    expect(companions).toMatchObject({
      phoneE164: "+96550012345",
      phoneCountry: "KW",
      namedGuestCount: 1,
      maximumAttendees: 3,
    });

    const result = await invitations.list(principal, event.id, listQuery());
    expect(result.totals).toEqual({
      invitationGroups: 3,
      namedGuests: 5,
      expectedAttendees: 0,
    });
    expect(result.pagination).toMatchObject({ totalItems: 3, totalPages: 1 });
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "invitation.created" },
      }),
    ).toBe(3);
  });

  it("rolls back invalid aggregates and enforces database nonnegative and position constraints", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "rollback-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };

    await expect(
      invitations.create(
        principal,
        event.id,
        singleInput({
          members: [{ name: "غير أساسي", isPrimary: false }],
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: "SINGLE_INVITATION_STRUCTURE_INVALID" },
    });
    await expect(
      invitations.create(
        principal,
        event.id,
        singleInput({ phoneNumber: "123" }),
      ),
    ).rejects.toMatchObject({ response: { code: "PHONE_INVALID" } });
    expect(await prisma.invitationGroup.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);

    await expect(
      prisma.invitationGroup.create({
        data: {
          eventId: event.id,
          displayName: "قيد غير صالح",
          contactName: "قيد غير صالح",
          phoneE164: "+966501111111",
          phoneCountry: "SA",
          invitationType: "PRIMARY_WITH_COMPANIONS",
          maxCompanions: -1,
          createdBy: owner.id,
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.$transaction(async (transaction) => {
        const group = await transaction.invitationGroup.create({
          data: {
            eventId: event.id,
            displayName: "موضع غير صالح",
            contactName: "موضع غير صالح",
            phoneE164: "+966501111112",
            phoneCountry: "SA",
            invitationType: "SINGLE",
            createdBy: owner.id,
          },
        });
        await transaction.guestMember.create({
          data: {
            invitationGroupId: group.id,
            name: "موضع صفر",
            position: 0,
            isPrimary: true,
          },
        });
      }),
    ).rejects.toBeDefined();
  });

  it("rejects silent phone duplicates and append-audits an explicit override without phone PII", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "duplicate-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };
    const original = await invitations.create(
      principal,
      event.id,
      singleInput(),
    );

    await expect(
      invitations.create(
        principal,
        event.id,
        singleInput({ displayName: "مجموعة منفصلة" }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
        details: { overrideRequired: true },
      },
    });
    expect(await prisma.invitationGroup.count()).toBe(1);

    const duplicate = await invitations.create(
      principal,
      event.id,
      singleInput({
        displayName: "مجموعة منفصلة",
        duplicateOverride: true,
      }),
    );
    expect(duplicate.id).not.toBe(original.id);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: duplicate.id, action: "invitation.created" },
    });
    expect(audit.metadata).toMatchObject({
      duplicateOverride: true,
      duplicateInvitationIds: [original.id],
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("+966");
  });

  it("serializes concurrent same-phone creation so a race cannot bypass duplicate review", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "concurrent-duplicate-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };

    const results = await Promise.allSettled([
      invitations.create(
        principal,
        event.id,
        singleInput({ displayName: "Concurrent A" }),
      ),
      invitations.create(
        principal,
        event.id,
        singleInput({ displayName: "Concurrent B" }),
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      response: { code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE" },
    });
    expect(await prisma.invitationGroup.count()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "invitation.created" },
      }),
    ).toBe(1);
  });

  it("replaces members on edit, preserves aggregate invariants, and locks structure after RSVP", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "edit-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };
    const created = await invitations.create(
      principal,
      event.id,
      singleInput({
        displayName: "عائلة قابلة للتعديل",
        invitationType: "NAMED_GROUP",
        members: [
          { name: "الأول", isPrimary: true },
          { name: "الثاني", isPrimary: false },
        ],
      }),
    );

    const updated = await invitations.update(principal, event.id, created.id, {
      displayName: "ضيف مع مرافقين",
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 3,
      members: [{ name: "الضيف الأساسي", isPrimary: true }],
      duplicateOverride: false,
    });
    expect(updated).toMatchObject({
      displayName: "ضيف مع مرافقين",
      invitationType: "PRIMARY_WITH_COMPANIONS",
      namedGuestCount: 1,
      maximumAttendees: 4,
    });
    expect(updated.members.map((member) => member.name)).toEqual([
      "الضيف الأساسي",
    ]);

    await prisma.rsvp.create({
      data: {
        invitationGroupId: created.id,
        status: "ACCEPTED",
        companionCount: 1,
        source: "HOST_MANUAL",
      },
    });
    await expect(
      invitations.update(principal, event.id, created.id, {
        maxCompanions: 4,
        duplicateOverride: false,
      }),
    ).rejects.toMatchObject({
      response: { code: "INVITATION_RSVP_LOCKED" },
    });
    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: created.id },
      }),
    ).toMatchObject({ maxCompanions: 3 });
  });

  it("cancels individual and selected groups without deleting records or audit history", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "cancel-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };
    const first = await invitations.create(
      principal,
      event.id,
      singleInput({ phoneNumber: "+966501111111", displayName: "الأول" }),
    );
    const second = await invitations.create(
      principal,
      event.id,
      singleInput({ phoneNumber: "+966502222222", displayName: "الثاني" }),
    );
    const third = await invitations.create(
      principal,
      event.id,
      singleInput({ phoneNumber: "+966503333333", displayName: "الثالث" }),
    );

    const cancelled = await invitations.cancel(principal, event.id, first.id);
    expect(cancelled.cancelledAt).not.toBeNull();
    const bulk = await invitations.bulkCancel(principal, event.id, {
      invitationIds: [first.id, second.id],
    });
    expect(bulk).toEqual({
      requestedCount: 2,
      cancelledCount: 1,
      alreadyCancelledCount: 1,
      cancelledIds: [second.id],
      alreadyCancelledIds: [first.id],
    });
    expect(await prisma.invitationGroup.count()).toBe(3);
    expect(
      await invitations.list(
        principal,
        event.id,
        listQuery({ cancellationStatus: "ACTIVE" }),
      ),
    ).toMatchObject({
      totals: { invitationGroups: 1 },
      pagination: { totalItems: 1 },
      items: [{ id: third.id }],
    });
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "invitation.cancelled" },
      }),
    ).toBe(2);
  });

  it("paginates hundreds deterministically and searches and filters on the server", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "pagination-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };
    const rows = Array.from({ length: 125 }, (_, index) => {
      const number = index + 1;
      return {
        eventId: event.id,
        displayName: `Guest ${String(number).padStart(3, "0")}`,
        contactName: number === 73 ? "Special Contact" : `Contact ${number}`,
        phoneE164: `+96650${String(number).padStart(7, "0")}`,
        phoneCountry: "SA",
        invitationType:
          number % 2 === 0 ? ("NAMED_GROUP" as const) : ("SINGLE" as const),
        rsvpStatus:
          number % 5 === 0 ? ("ACCEPTED" as const) : ("PENDING" as const),
        expectedAttendees: number % 5 === 0 ? 1 : 0,
        createdBy: owner.id,
      };
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.invitationGroup.createMany({ data: rows });
      const persisted = await transaction.invitationGroup.findMany({
        where: { eventId: event.id },
        select: { id: true, displayName: true },
      });
      await transaction.guestMember.createMany({
        data: persisted.map((record) => ({
          invitationGroupId: record.id,
          name:
            record.displayName === "Guest 088"
              ? "Needle Member"
              : `${record.displayName} member`,
          position: 1,
          isPrimary: true,
        })),
      });
    });

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        invitations.list(
          principal,
          event.id,
          listQuery({
            page,
            pageSize: 50,
            sortBy: "DISPLAY_NAME",
            sortOrder: "ASC",
          }),
        ),
      ),
    );
    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 25]);
    expect(pages[0]?.pagination).toMatchObject({
      totalItems: 125,
      totalPages: 3,
    });
    const ids = pages.flatMap((page) => page.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(125);
    expect(pages[0]?.items[0]?.displayName).toBe("Guest 001");
    expect(pages[2]?.items.at(-1)?.displayName).toBe("Guest 125");

    expect(
      (
        await invitations.list(
          principal,
          event.id,
          listQuery({ search: "Special Contact" }),
        )
      ).items.map((item) => item.displayName),
    ).toEqual(["Guest 073"]);
    expect(
      (
        await invitations.list(
          principal,
          event.id,
          listQuery({ search: "Needle Member" }),
        )
      ).items.map((item) => item.displayName),
    ).toEqual(["Guest 088"]);
    expect(
      (
        await invitations.list(
          principal,
          event.id,
          listQuery({ invitationType: "NAMED_GROUP", rsvpStatus: "ACCEPTED" }),
        )
      ).pagination.totalItems,
    ).toBe(12);
  });

  it("enforces the permission matrix, masks phones, and never searches hidden phone data", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "permission-owner",
    });
    const staff = await createUserFixture(prisma, {
      authProviderId: "permission-staff",
    });
    const coHost = await createUserFixture(prisma, {
      authProviderId: "permission-cohost",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.eventMembership.createMany({
      data: [
        {
          eventId: event.id,
          userId: staff.id,
          role: "CHECK_IN_STAFF",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
        {
          eventId: event.id,
          userId: coHost.id,
          role: "CO_HOST",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      ],
    });
    const ownerPrincipal = { subject: owner.authProviderId };
    const created = await invitations.create(
      ownerPrincipal,
      event.id,
      singleInput({
        displayName: "Hidden phone guest",
        phoneNumber: "+966509876543",
      }),
    );

    const staffPrincipal = { subject: staff.authProviderId };
    expect(
      await invitations.get(staffPrincipal, event.id, created.id),
    ).toMatchObject({
      phoneE164: null,
      phoneMasked: "+966•••••6543",
      phoneIsMasked: true,
    });
    expect(
      (
        await invitations.list(
          staffPrincipal,
          event.id,
          listQuery({ search: "509876543" }),
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await invitations.list(
          staffPrincipal,
          event.id,
          listQuery({ search: "Hidden phone" }),
        )
      ).items,
    ).toHaveLength(1);
    await expect(
      invitations.create(staffPrincipal, event.id, singleInput()),
    ).rejects.toMatchObject({
      response: { code: "EVENT_PERMISSION_DENIED" },
    });

    const coHostPrincipal = { subject: coHost.authProviderId };
    expect(
      await invitations.get(coHostPrincipal, event.id, created.id),
    ).toMatchObject({
      phoneE164: "+966509876543",
      phoneIsMasked: false,
    });
    await expect(
      invitations.cancel(coHostPrincipal, event.id, created.id),
    ).rejects.toMatchObject({
      response: { code: "EVENT_PERMISSION_DENIED" },
    });
    await prisma.eventMembership.update({
      where: { eventId_userId: { eventId: event.id, userId: coHost.id } },
      data: { permissionsJson: [Permission.GUEST_DELETE] },
    });
    expect(
      (await invitations.cancel(coHostPrincipal, event.id, created.id))
        .cancelledAt,
    ).not.toBeNull();
  });

  it("uses anti-enumeration responses and rolls back every cross-tenant mutation", async () => {
    const ownerA = await createUserFixture(prisma, {
      authProviderId: "tenant-owner-a",
    });
    const ownerB = await createUserFixture(prisma, {
      authProviderId: "tenant-owner-b",
    });
    const eventA = await createEventFixture(prisma, ownerA);
    const eventB = await createEventFixture(prisma, ownerB);
    const principalA = { subject: ownerA.authProviderId };
    const principalB = { subject: ownerB.authProviderId };
    const invitationB = await invitations.create(
      principalB,
      eventB.id,
      singleInput(),
    );

    const attempts = [
      () => invitations.list(principalA, eventB.id, listQuery()),
      () => invitations.get(principalA, eventB.id, invitationB.id),
      () =>
        invitations.create(
          principalA,
          eventB.id,
          singleInput({ phoneNumber: "+966501111111" }),
        ),
      () =>
        invitations.update(principalA, eventB.id, invitationB.id, {
          displayName: "Cross-tenant edit",
          duplicateOverride: false,
        }),
      () => invitations.cancel(principalA, eventB.id, invitationB.id),
      () =>
        invitations.bulkCancel(principalA, eventB.id, {
          invitationIds: [invitationB.id],
        }),
      () => invitations.get(principalA, eventA.id, invitationB.id),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({
        response: { code: expect.stringMatching(/NOT_FOUND$/) },
      });
    }
    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: invitationB.id },
      }),
    ).toMatchObject({
      displayName: "سارة القحطاني",
      cancelledAt: null,
    });
    expect(
      await prisma.auditLog.count({
        where: { eventId: eventB.id, action: { not: "invitation.created" } },
      }),
    ).toBe(0);
  });
});
