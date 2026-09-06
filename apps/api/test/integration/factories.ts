import type {
  Event,
  EventMembershipRole,
  MembershipStatus,
  PrismaClient,
  User,
} from "@prisma/client";

let sequence = 0;

export function resetFactorySequence(): void {
  sequence = 0;
}

export async function createUserFixture(
  prisma: PrismaClient,
  overrides: Partial<Pick<User, "authProviderId" | "email" | "phoneE164">> = {},
): Promise<User> {
  sequence += 1;
  return prisma.user.create({
    data: {
      authProviderId: overrides.authProviderId ?? `test-user-${sequence}`,
      email: overrides.email ?? `host-${sequence}@example.test`,
      phoneE164:
        overrides.phoneE164 ?? `+96650000${String(sequence).padStart(4, "0")}`,
    },
  });
}

export async function createEventFixture(
  prisma: PrismaClient,
  owner: User,
  options: {
    nameAr?: string;
    member?: User;
    role?: EventMembershipRole;
    membershipStatus?: MembershipStatus;
  } = {},
): Promise<Event> {
  sequence += 1;
  const member = options.member ?? owner;
  return prisma.event.create({
    data: {
      ownerUserId: owner.id,
      nameAr: options.nameAr ?? `مناسبة اختبار ${sequence}`,
      eventType: "WEDDING",
      eventDate: new Date("2027-01-15T00:00:00.000Z"),
      startTime: new Date("1970-01-01T20:00:00.000Z"),
      timezone: "Asia/Riyadh",
      venueNameAr: "قاعة الاختبار",
      city: "الرياض",
      memberships: {
        create: {
          userId: member.id,
          role: options.role ?? "OWNER",
          status: options.membershipStatus ?? "ACTIVE",
          acceptedAt:
            (options.membershipStatus ?? "ACTIVE") === "ACTIVE"
              ? new Date("2026-09-06T00:00:00.000Z")
              : null,
        },
      },
    },
  });
}
