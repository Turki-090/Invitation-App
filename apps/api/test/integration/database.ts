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

    // Row-level lifecycle triggers intentionally make reminder decisions and
    // audit evidence append-only in production. TRUNCATE is appropriate only
    // in the guarded disposable integration database and keeps test isolation
    // independent of those production invariants.
    await this.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "check_in_records",
        "check_in_states",
        "entry_passes",
        "credit_ledger_entries",
        "credit_reservations",
        "credit_accounts",
        "export_jobs",
        "webhook_events",
        "message_attempts",
        "notifications",
        "reminder_recipient_states",
        "reminder_run_items",
        "idempotency_records",
        "reminder_runs",
        "messages",
        "send_batches",
        "rsvp_confirmations",
        "rsvp_submissions",
        "rsvp_members",
        "rsvp_history",
        "rsvps",
        "public_invitation_capabilities",
        "invitation_content_snapshots",
        "guest_members",
        "import_rows",
        "import_jobs",
        "reminder_rules",
        "invitation_templates",
        "stored_assets",
        "invitation_groups",
        "audit_logs",
        "team_invitations",
        "event_memberships",
        "events",
        "users"
      RESTART IDENTITY CASCADE
    `);
  }
}
