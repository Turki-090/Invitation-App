import { Permission } from "@dawah/domain";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { EventAccessService } from "../../src/events/event-access.service";
import { EventsService } from "../../src/events/events.service";
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
const events = new EventsService(prismaService, access);

const createInput = {
  nameAr: "حفل زواج تجريبي",
  nameEn: "Test wedding",
  eventType: "WEDDING" as const,
  eventDate: "2027-02-20",
  startTime: "20:30",
  endTime: "23:45",
  timezone: "Asia/Riyadh",
  venueNameAr: "قاعة التكامل",
  venueNameEn: "Integration Hall",
  city: "الرياض",
  latitude: 24.7136,
  longitude: 46.6753,
  mapUrl: "https://maps.google.com/?q=24.7136,46.6753",
  rsvpDeadline: "2027-02-15",
  allowRsvpEdits: true,
  qrEnabled: false,
};

describe("EventsService PostgreSQL integration", () => {
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

  it("lists only non-archived events with an active membership", async () => {
    const host = await createUserFixture(prisma, {
      authProviderId: "auth-host-a",
    });
    const otherHost = await createUserFixture(prisma, {
      authProviderId: "auth-host-b",
    });
    const accessible = await createEventFixture(prisma, host, {
      nameAr: "مناسبة المضيف أ",
    });
    const foreign = await createEventFixture(prisma, otherHost, {
      nameAr: "مناسبة المضيف ب",
    });
    const archived = await createEventFixture(prisma, host, {
      nameAr: "مناسبة مؤرشفة",
    });
    await prisma.event.update({
      where: { id: archived.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await prisma.eventMembership.create({
      data: {
        eventId: foreign.id,
        userId: host.id,
        role: "CO_HOST",
        status: "REVOKED",
      },
    });

    const result = await events.list({ subject: host.authProviderId });

    expect(result.map((event) => event.id)).toEqual([accessible.id]);
    expect(result[0]?.canSendInvitations).toBe(true);
  });

  it("creates the event, owner membership, and audit record atomically", async () => {
    const created = await events.create(
      { subject: "auth-new-owner", email: "new-owner@example.test" },
      createInput,
    );

    const persisted = await prisma.event.findUniqueOrThrow({
      where: { id: created.id },
      include: { memberships: true, auditLogs: true },
    });
    const detail = await events.get({ subject: "auth-new-owner" }, created.id);

    expect(persisted.memberships).toHaveLength(1);
    expect(persisted.memberships[0]).toMatchObject({
      role: "OWNER",
      status: "ACTIVE",
    });
    expect(persisted.auditLogs).toHaveLength(1);
    expect(persisted.auditLogs[0]).toMatchObject({
      action: "event.created",
      targetId: created.id,
    });
    expect(detail).toMatchObject({
      eventDate: "2027-02-20",
      startTime: "20:30",
      endTime: "23:45",
      timezone: "Asia/Riyadh",
      latitude: 24.7136,
      longitude: 46.6753,
      mapUrl: createInput.mapUrl,
      qrEnabled: false,
      canSendInvitations: true,
      availableTransitions: ["ACTIVE"],
    });
    expect(created.canSendInvitations).toBe(true);
  });

  it("updates settings transactionally, validates merged dates, and audits field names", async () => {
    const created = await events.create({ subject: "auth-owner" }, createInput);

    const updated = await events.update({ subject: "auth-owner" }, created.id, {
      eventDate: "2027-03-10",
      rsvpDeadline: "2027-03-01",
      mapUrl: null,
      qrEnabled: true,
    });

    expect(updated).toMatchObject({
      eventDate: "2027-03-10",
      rsvpDeadline: "2027-03-01",
      mapUrl: null,
      qrEnabled: true,
      canSendInvitations: true,
    });
    await expect(
      events.update({ subject: "auth-owner" }, created.id, {
        rsvpDeadline: "2027-03-11",
      }),
    ).rejects.toMatchObject({
      response: { code: "EVENT_VALIDATION_FAILED" },
    });
    const audits = await prisma.auditLog.findMany({
      where: { eventId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "event.created",
      "event.updated",
    ]);
    expect(audits[1]?.metadata).toEqual({
      changedFields: ["eventDate", "mapUrl", "qrEnabled", "rsvpDeadline"],
    });
  });

  it("enforces the lifecycle matrix and audits each accepted transition", async () => {
    const created = await events.create({ subject: "auth-owner" }, createInput);

    await expect(
      events.transitionStatus({ subject: "auth-owner" }, created.id, {
        status: "COMPLETED",
      }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_EVENT_STATUS_TRANSITION" },
    });

    const active = await events.transitionStatus(
      { subject: "auth-owner" },
      created.id,
      { status: "ACTIVE" },
    );
    const open = await events.transitionStatus(
      { subject: "auth-owner" },
      created.id,
      { status: "RSVP_OPEN" },
    );
    const closed = await events.transitionStatus(
      { subject: "auth-owner" },
      created.id,
      { status: "RSVP_CLOSED" },
    );

    expect(active.availableTransitions).toContain("RSVP_OPEN");
    expect(active.canSendInvitations).toBe(true);
    expect(open.status).toBe("RSVP_OPEN");
    expect(closed.availableTransitions).toContain("RSVP_OPEN");
    expect(
      await prisma.auditLog.count({
        where: { eventId: created.id, action: "event.status_changed" },
      }),
    ).toBe(3);
  });

  it("archives without deletion and recovers to the audited pre-archive status", async () => {
    const created = await events.create({ subject: "auth-owner" }, createInput);
    await events.transitionStatus({ subject: "auth-owner" }, created.id, {
      status: "ACTIVE",
    });
    await events.transitionStatus({ subject: "auth-owner" }, created.id, {
      status: "RSVP_OPEN",
    });

    const archived = await events.archive(
      { subject: "auth-owner" },
      created.id,
    );
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.canSendInvitations).toBe(true);
    expect(archived.archivedAt).not.toBeNull();
    expect(await events.list({ subject: "auth-owner" })).toEqual([]);
    await expect(
      events.update({ subject: "auth-owner" }, created.id, { city: "جدة" }),
    ).rejects.toMatchObject({ response: { code: "EVENT_ARCHIVED" } });

    const recovered = await events.recover(
      { subject: "auth-owner" },
      created.id,
    );
    expect(recovered).toMatchObject({ status: "RSVP_OPEN", archivedAt: null });
    expect(recovered.canSendInvitations).toBe(true);
    expect((await events.list({ subject: "auth-owner" }))[0]?.id).toBe(
      created.id,
    );
    expect(
      await prisma.auditLog.findMany({
        where: {
          eventId: created.id,
          action: { in: ["event.archived", "event.recovered"] },
        },
        orderBy: { createdAt: "asc" },
        select: { action: true, metadata: true },
      }),
    ).toEqual([
      {
        action: "event.archived",
        metadata: { previousStatus: "RSVP_OPEN" },
      },
      {
        action: "event.recovered",
        metadata: { restoredStatus: "RSVP_OPEN" },
      },
    ]);
  });

  it("returns explicit zero aggregates and excludes cancelled groups from populated totals", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "auth-owner",
    });
    const event = await createEventFixture(prisma, owner);

    expect(
      await events.dashboard({ subject: owner.authProviderId }, event.id),
    ).toEqual({
      eventId: event.id,
      invitationGroups: 0,
      namedGuests: 0,
      expectedAttendees: 0,
      rsvp: {
        acceptedGroups: 0,
        partialGroups: 0,
        declinedGroups: 0,
        pendingGroups: 0,
      },
    });

    await prisma.$transaction(async (transaction) => {
      const accepted = await transaction.invitationGroup.create({
        data: {
          eventId: event.id,
          displayName: "عائلة القبول",
          contactName: "خالد",
          phoneE164: "+966501111111",
          phoneCountry: "SA",
          invitationType: "NAMED_GROUP",
          rsvpStatus: "ACCEPTED",
          expectedAttendees: 2,
          createdBy: owner.id,
          members: {
            create: [
              { name: "خالد", position: 1, isPrimary: true },
              { name: "نورة", position: 2 },
            ],
          },
        },
        include: { members: true },
      });
      const acceptedRsvp = await transaction.rsvp.create({
        data: {
          invitationGroupId: accepted.id,
          status: "ACCEPTED",
          source: "SYSTEM",
        },
      });
      await transaction.rsvpMember.createMany({
        data: accepted.members.map((member) => ({
          invitationGroupId: accepted.id,
          rsvpId: acceptedRsvp.id,
          guestMemberId: member.id,
          attending: true,
        })),
      });

      const partial = await transaction.invitationGroup.create({
        data: {
          eventId: event.id,
          displayName: "عائلة القبول الجزئي",
          contactName: "سارة",
          phoneE164: "+966502222222",
          phoneCountry: "SA",
          invitationType: "NAMED_GROUP",
          rsvpStatus: "PARTIALLY_ACCEPTED",
          expectedAttendees: 1,
          createdBy: owner.id,
          members: {
            create: [
              { name: "سارة", position: 1, isPrimary: true },
              { name: "ريم", position: 2 },
              { name: "فهد", position: 3 },
            ],
          },
        },
        include: { members: { orderBy: { position: "asc" } } },
      });
      const partialRsvp = await transaction.rsvp.create({
        data: {
          invitationGroupId: partial.id,
          status: "PARTIALLY_ACCEPTED",
          source: "SYSTEM",
        },
      });
      await transaction.rsvpMember.createMany({
        data: partial.members.map((member, index) => ({
          invitationGroupId: partial.id,
          rsvpId: partialRsvp.id,
          guestMemberId: member.id,
          attending: index === 0,
        })),
      });

      const cancelled = await transaction.invitationGroup.create({
        data: {
          eventId: event.id,
          displayName: "ملغاة",
          contactName: "ملغاة",
          phoneE164: "+966503333333",
          phoneCountry: "SA",
          invitationType: "SINGLE",
          rsvpStatus: "ACCEPTED",
          expectedAttendees: 1,
          createdBy: owner.id,
          cancelledAt: new Date(),
          members: {
            create: [{ name: "ملغاة", position: 1, isPrimary: true }],
          },
        },
        include: { members: true },
      });
      const cancelledRsvp = await transaction.rsvp.create({
        data: {
          invitationGroupId: cancelled.id,
          status: "ACCEPTED",
          source: "SYSTEM",
        },
      });
      await transaction.rsvpMember.create({
        data: {
          invitationGroupId: cancelled.id,
          rsvpId: cancelledRsvp.id,
          guestMemberId: cancelled.members[0]!.id,
          attending: true,
        },
      });
    });

    expect(
      await events.dashboard({ subject: owner.authProviderId }, event.id),
    ).toEqual({
      eventId: event.id,
      invitationGroups: 2,
      namedGuests: 5,
      expectedAttendees: 3,
      rsvp: {
        acceptedGroups: 1,
        partialGroups: 1,
        declinedGroups: 0,
        pendingGroups: 0,
      },
    });
  });

  it("does not reveal or mutate another user's event through any event-scoped operation", async () => {
    const userA = await createUserFixture(prisma, {
      authProviderId: "auth-user-a",
    });
    const userB = await createUserFixture(prisma, {
      authProviderId: "auth-user-b",
    });
    const eventB = await createEventFixture(prisma, userB);
    const principalA = { subject: userA.authProviderId };

    const attempts = [
      () => events.get(principalA, eventB.id),
      () => events.dashboard(principalA, eventB.id),
      () => events.update(principalA, eventB.id, { city: "جدة" }),
      () =>
        events.transitionStatus(principalA, eventB.id, { status: "ACTIVE" }),
      () => events.archive(principalA, eventB.id),
      () => events.recover(principalA, eventB.id),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({
        response: { code: "EVENT_NOT_FOUND" },
      });
    }
    expect(
      await prisma.event.findUniqueOrThrow({ where: { id: eventB.id } }),
    ).toMatchObject({ city: "الرياض", status: "DRAFT", archivedAt: null });
  });

  it("requires active membership and applies role permissions with explicit overrides", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "auth-owner",
    });
    const coHost = await createUserFixture(prisma, {
      authProviderId: "auth-cohost",
    });
    const revoked = await createUserFixture(prisma, {
      authProviderId: "auth-revoked",
    });
    const checkInStaff = await createUserFixture(prisma, {
      authProviderId: "auth-check-in",
    });
    const event = await createEventFixture(prisma, owner);
    const coHostMembership = await prisma.eventMembership.create({
      data: {
        eventId: event.id,
        userId: coHost.id,
        role: "CO_HOST",
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    });
    await prisma.eventMembership.create({
      data: {
        eventId: event.id,
        userId: revoked.id,
        role: "CO_HOST",
        status: "REVOKED",
      },
    });
    const checkInMembership = await prisma.eventMembership.create({
      data: {
        eventId: event.id,
        userId: checkInStaff.id,
        role: "CHECK_IN_STAFF",
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    });

    expect(
      await events.get({ subject: coHost.authProviderId }, event.id),
    ).toMatchObject({ id: event.id, canSendInvitations: true });
    expect(
      await events.get({ subject: checkInStaff.authProviderId }, event.id),
    ).toMatchObject({ id: event.id, canSendInvitations: false });
    expect(
      (await events.list({ subject: checkInStaff.authProviderId }))[0],
    ).toMatchObject({ id: event.id, canSendInvitations: false });
    await expect(
      events.update({ subject: coHost.authProviderId }, event.id, {
        city: "جدة",
      }),
    ).rejects.toMatchObject({
      response: { code: "EVENT_PERMISSION_DENIED" },
    });
    await expect(
      events.get({ subject: revoked.authProviderId }, event.id),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });

    await prisma.eventMembership.update({
      where: { id: coHostMembership.id },
      data: { permissionsJson: [Permission.EVENT_EDIT] },
    });
    expect(
      (
        await events.update({ subject: coHost.authProviderId }, event.id, {
          city: "جدة",
        })
      ).city,
    ).toBe("جدة");

    await prisma.eventMembership.update({
      where: { id: checkInMembership.id },
      data: { permissionsJson: [Permission.INVITATION_SEND] },
    });
    expect(
      await events.get({ subject: checkInStaff.authProviderId }, event.id),
    ).toMatchObject({ canSendInvitations: true });
    expect(
      (await events.list({ subject: checkInStaff.authProviderId }))[0],
    ).toMatchObject({ canSendInvitations: true });
  });
});
