import type { PrismaService } from "../../src/prisma/prisma.service";
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
const events = new EventsService(prisma as unknown as PrismaService);

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

  it("lists only events with an active membership for the principal", async () => {
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
    expect(result).not.toContainEqual(
      expect.objectContaining({ id: foreign.id }),
    );
  });

  it("creates the event, owner membership, and audit record atomically", async () => {
    const created = await events.create(
      { subject: "auth-new-owner", email: "new-owner@example.test" },
      {
        nameAr: "حفل زواج تجريبي",
        eventType: "WEDDING",
        eventDate: "2027-02-20",
        startTime: "20:30",
        timezone: "Asia/Riyadh",
        venueNameAr: "قاعة التكامل",
        city: "الرياض",
        allowRsvpEdits: true,
      },
    );

    const persisted = await prisma.event.findUniqueOrThrow({
      where: { id: created.id },
      include: { memberships: true, auditLogs: true },
    });

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
  });
});
