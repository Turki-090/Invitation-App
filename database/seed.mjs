import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for local seeding.");

const url = new URL(databaseUrl);
const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
const databaseName = url.pathname.replace(/^\//, "");
if (
  process.env.NODE_ENV !== "development" ||
  process.env.DAWAH_ENV !== "local" ||
  databaseName !== "dawah" ||
  !new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)
) {
  throw new Error(
    "The deterministic seed may run only against the local dawah development database.",
  );
}

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  event: "00000000-0000-4000-8000-000000000002",
  membership: "00000000-0000-4000-8000-000000000003",
  audit: "00000000-0000-4000-8000-000000000004",
};
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

try {
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.upsert({
      where: { authProviderId: "dawah-local-development-host" },
      create: {
        id: ids.user,
        authProviderId: "dawah-local-development-host",
        email: "developer@localhost",
        displayName: "Local Developer",
      },
      update: {
        email: "developer@localhost",
        displayName: "Local Developer",
      },
    });
    const event = await transaction.event.upsert({
      where: { id: ids.event },
      create: {
        id: ids.event,
        ownerUserId: user.id,
        nameAr: "مناسبة تجريبية",
        nameEn: "Sample event",
        eventType: "WEDDING",
        eventDate: new Date("2027-01-15T00:00:00.000Z"),
        startTime: new Date("1970-01-01T20:00:00.000Z"),
        timezone: "Asia/Riyadh",
        venueNameAr: "قاعة تجريبية",
        venueNameEn: "Sample venue",
        city: "الرياض",
      },
      update: {
        nameAr: "مناسبة تجريبية",
        nameEn: "Sample event",
      },
    });
    await transaction.eventMembership.upsert({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      create: {
        id: ids.membership,
        eventId: event.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        acceptedAt: new Date("2026-09-06T00:00:00.000Z"),
      },
      update: { role: "OWNER", status: "ACTIVE" },
    });
    await transaction.auditLog.upsert({
      where: { id: ids.audit },
      create: {
        id: ids.audit,
        eventId: event.id,
        actorUserId: user.id,
        actorType: "USER",
        action: "event.seeded",
        targetType: "Event",
        targetId: event.id,
      },
      update: {},
    });
  });
  console.info("Deterministic local seed is ready.");
} finally {
  await prisma.$disconnect();
}
