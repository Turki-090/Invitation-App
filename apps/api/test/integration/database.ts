import { PrismaClient } from "@prisma/client";

export function assertTestDatabase(
  databaseUrl = process.env.DATABASE_URL,
): string {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }

  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "").toLowerCase();
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    process.env.DAWAH_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    databaseName !== "dawah_test" ||
    !new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)
  ) {
    throw new Error(
      "Integration cleanup is allowed only for the local dawah_test database with NODE_ENV=test and DAWAH_ENV=test.",
    );
  }

  return databaseUrl;
}

export class TestDatabase {
  public readonly prisma: PrismaClient;

  public constructor(private readonly databaseUrl = assertTestDatabase()) {
    this.prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  }

  public async clean(): Promise<void> {
    assertTestDatabase(this.databaseUrl);

    await this.prisma.$transaction([
      this.prisma.webhookEvent.deleteMany(),
      this.prisma.messageAttempt.deleteMany(),
      this.prisma.idempotencyRecord.deleteMany(),
      this.prisma.message.deleteMany(),
      this.prisma.sendBatch.deleteMany(),
      this.prisma.rsvpMember.deleteMany(),
      this.prisma.rsvpHistory.deleteMany(),
      this.prisma.rsvp.deleteMany(),
      this.prisma.publicInvitationCapability.deleteMany(),
      this.prisma.invitationContentSnapshot.deleteMany(),
      this.prisma.guestMember.deleteMany(),
      this.prisma.importRow.deleteMany(),
      this.prisma.importJob.deleteMany(),
      this.prisma.invitationTemplate.deleteMany(),
      this.prisma.storedAsset.deleteMany(),
      this.prisma.invitationGroup.deleteMany(),
      this.prisma.auditLog.deleteMany(),
      this.prisma.eventMembership.deleteMany(),
      this.prisma.event.deleteMany(),
      this.prisma.user.deleteMany(),
    ]);
  }
}
