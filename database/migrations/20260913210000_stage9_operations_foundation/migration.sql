ALTER TYPE "NotificationKind" ADD VALUE 'EXPORT_READY';
ALTER TYPE "NotificationKind" ADD VALUE 'EXPORT_FAILED';

CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "ExportPreset" AS ENUM (
  'FULL_GUEST_LIST',
  'CONFIRMED_ATTENDANCE',
  'PENDING_RSVP',
  'CHECK_IN_LIST',
  'FINAL_ATTENDANCE'
);
CREATE TYPE "ExportJobStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);
CREATE TYPE "CreditLedgerEntryType" AS ENUM (
  'PURCHASE',
  'BONUS',
  'SEND_USAGE',
  'REFUND',
  'MANUAL_ADJUSTMENT',
  'EXPIRY'
);
CREATE TYPE "CreditReservationStatus" AS ENUM (
  'ACTIVE',
  'CONSUMED',
  'RELEASED',
  'EXPIRED'
);
CREATE TYPE "CheckInSource" AS ENUM ('QR', 'MANUAL');

CREATE TABLE "export_jobs" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "output_asset_id" UUID,
  "format" "ExportFormat" NOT NULL,
  "preset" "ExportPreset" NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "row_count" INTEGER,
  "failure_code" VARCHAR(100),
  "failure_message" VARCHAR(1000),
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "export_jobs_row_count_check" CHECK ("row_count" IS NULL OR "row_count" >= 0),
  CONSTRAINT "export_jobs_terminal_state_check" CHECK (
    ("status" = 'COMPLETED' AND "output_asset_id" IS NOT NULL AND "completed_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "failed_at" IS NULL)
    OR ("status" = 'FAILED' AND "output_asset_id" IS NULL AND "failed_at" IS NOT NULL AND "failure_code" IS NOT NULL)
    OR ("status" = 'EXPIRED' AND "expires_at" IS NOT NULL)
    OR "status" IN ('QUEUED', 'PROCESSING')
  )
);

CREATE TABLE "credit_accounts" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_ledger_entries" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "credit_account_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "message_id" UUID,
  "entry_type" "CreditLedgerEntryType" NOT NULL,
  "units" INTEGER NOT NULL,
  "reference_type" VARCHAR(64) NOT NULL,
  "reference_id" VARCHAR(255) NOT NULL,
  "description" VARCHAR(500),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_ledger_entries_units_check" CHECK (
    ("entry_type" IN ('SEND_USAGE', 'EXPIRY') AND "units" < 0)
    OR ("entry_type" IN ('PURCHASE', 'BONUS', 'REFUND') AND "units" > 0)
    OR ("entry_type" = 'MANUAL_ADJUSTMENT' AND "units" <> 0)
  )
);

CREATE TABLE "credit_reservations" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "credit_account_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "send_batch_id" UUID,
  "status" "CreditReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "units" INTEGER NOT NULL,
  "reference_type" VARCHAR(64) NOT NULL,
  "reference_id" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_reservations_units_check" CHECK ("units" > 0),
  CONSTRAINT "credit_reservations_state_check" CHECK (
    ("status" = 'ACTIVE' AND "consumed_at" IS NULL AND "released_at" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL AND "released_at" IS NULL)
    OR ("status" IN ('RELEASED', 'EXPIRED') AND "released_at" IS NOT NULL AND "consumed_at" IS NULL)
  )
);

CREATE TABLE "entry_passes" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_passes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "check_in_states" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "checked_in_count" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "first_checked_in_at" TIMESTAMP(3),
  "last_checked_in_at" TIMESTAMP(3),
  "last_checked_in_by_user_id" UUID,
  "last_device_id" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "check_in_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_in_states_count_check" CHECK ("checked_in_count" >= 0),
  CONSTRAINT "check_in_states_version_check" CHECK ("version" >= 0),
  CONSTRAINT "check_in_states_timestamps_check" CHECK (
    ("checked_in_count" = 0 AND "first_checked_in_at" IS NULL AND "last_checked_in_at" IS NULL)
    OR ("checked_in_count" > 0 AND "first_checked_in_at" IS NOT NULL AND "last_checked_in_at" IS NOT NULL)
  )
);

CREATE TABLE "check_in_records" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "check_in_state_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "source" "CheckInSource" NOT NULL,
  "attendee_count" INTEGER NOT NULL,
  "previous_count" INTEGER NOT NULL,
  "new_count" INTEGER NOT NULL,
  "device_id" VARCHAR(128),
  "idempotency_key_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_in_records_counts_check" CHECK (
    "attendee_count" > 0
    AND "previous_count" >= 0
    AND "new_count" = "previous_count" + "attendee_count"
  )
);

CREATE UNIQUE INDEX "export_jobs_output_asset_id_key" ON "export_jobs"("output_asset_id");
CREATE UNIQUE INDEX "export_jobs_id_event_key" ON "export_jobs"("id", "event_id");
CREATE UNIQUE INDEX "export_jobs_output_asset_event_key" ON "export_jobs"("output_asset_id", "event_id");
CREATE INDEX "export_jobs_event_requested_id_idx" ON "export_jobs"("event_id", "requested_at" DESC, "id");
CREATE INDEX "export_jobs_status_requested_id_idx" ON "export_jobs"("status", "requested_at", "id");
CREATE INDEX "export_jobs_status_expires_idx" ON "export_jobs"("status", "expires_at");

CREATE UNIQUE INDEX "credit_accounts_event_id_key" ON "credit_accounts"("event_id");
CREATE UNIQUE INDEX "credit_accounts_id_event_key" ON "credit_accounts"("id", "event_id");

CREATE UNIQUE INDEX "credit_entries_reference_key" ON "credit_ledger_entries"("credit_account_id", "entry_type", "reference_type", "reference_id");
CREATE INDEX "credit_entries_event_created_id_idx" ON "credit_ledger_entries"("event_id", "created_at" DESC, "id");
CREATE INDEX "credit_entries_message_idx" ON "credit_ledger_entries"("message_id");

CREATE UNIQUE INDEX "credit_reservations_send_batch_id_key" ON "credit_reservations"("send_batch_id");
CREATE UNIQUE INDEX "credit_reservations_reference_key" ON "credit_reservations"("credit_account_id", "reference_type", "reference_id");
CREATE UNIQUE INDEX "credit_reservations_batch_event_key" ON "credit_reservations"("send_batch_id", "event_id");
CREATE INDEX "credit_reservations_event_status_expires_idx" ON "credit_reservations"("event_id", "status", "expires_at");

CREATE UNIQUE INDEX "entry_passes_token_hash_key" ON "entry_passes"("token_hash");
CREATE UNIQUE INDEX "entry_passes_id_event_key" ON "entry_passes"("id", "event_id");
CREATE UNIQUE INDEX "entry_passes_one_active_per_invitation_key" ON "entry_passes"("invitation_group_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "entry_passes_invitation_created_id_idx" ON "entry_passes"("invitation_group_id", "created_at" DESC, "id");
CREATE INDEX "entry_passes_event_active_idx" ON "entry_passes"("event_id", "revoked_at", "expires_at");

CREATE UNIQUE INDEX "check_in_states_invitation_group_id_key" ON "check_in_states"("invitation_group_id");
CREATE UNIQUE INDEX "check_in_states_id_event_key" ON "check_in_states"("id", "event_id");
CREATE UNIQUE INDEX "check_in_states_invitation_event_key" ON "check_in_states"("invitation_group_id", "event_id");
CREATE INDEX "check_in_states_event_last_id_idx" ON "check_in_states"("event_id", "last_checked_in_at" DESC, "id");

CREATE UNIQUE INDEX "check_in_records_event_idempotency_key" ON "check_in_records"("event_id", "idempotency_key_hash");
CREATE INDEX "check_in_records_event_created_id_idx" ON "check_in_records"("event_id", "created_at" DESC, "id");
CREATE INDEX "check_in_records_invitation_created_id_idx" ON "check_in_records"("invitation_group_id", "created_at" DESC, "id");

ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_output_asset_id_event_id_fkey" FOREIGN KEY ("output_asset_id", "event_id") REFERENCES "stored_assets"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_credit_account_id_event_id_fkey" FOREIGN KEY ("credit_account_id", "event_id") REFERENCES "credit_accounts"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_message_id_event_id_fkey" FOREIGN KEY ("message_id", "event_id") REFERENCES "messages"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_credit_account_id_event_id_fkey" FOREIGN KEY ("credit_account_id", "event_id") REFERENCES "credit_accounts"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_send_batch_id_event_id_fkey" FOREIGN KEY ("send_batch_id", "event_id") REFERENCES "send_batches"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_passes" ADD CONSTRAINT "entry_passes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entry_passes" ADD CONSTRAINT "entry_passes_invitation_group_id_event_id_fkey" FOREIGN KEY ("invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "check_in_states" ADD CONSTRAINT "check_in_states_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_states" ADD CONSTRAINT "check_in_states_invitation_group_id_event_id_fkey" FOREIGN KEY ("invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_states" ADD CONSTRAINT "check_in_states_last_checked_in_by_user_id_fkey" FOREIGN KEY ("last_checked_in_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_invitation_group_id_event_id_fkey" FOREIGN KEY ("invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_check_in_state_id_event_id_fkey" FOREIGN KEY ("check_in_state_id", "event_id") REFERENCES "check_in_states"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_actor_membership_id_event_id_fkey" FOREIGN KEY ("actor_membership_id", "event_id") REFERENCES "event_memberships"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_credit_account_nonnegative"() RETURNS TRIGGER AS $$
DECLARE
  current_balance BIGINT;
  active_reserved BIGINT;
BEGIN
  PERFORM 1 FROM "credit_accounts" WHERE "id" = NEW."credit_account_id" FOR UPDATE;
  SELECT COALESCE(SUM("units"), 0) INTO current_balance
  FROM "credit_ledger_entries"
  WHERE "credit_account_id" = NEW."credit_account_id";
  SELECT COALESCE(SUM("units"), 0) INTO active_reserved
  FROM "credit_reservations"
  WHERE "credit_account_id" = NEW."credit_account_id" AND "status" = 'ACTIVE';
  IF current_balance + NEW."units" - active_reserved < 0 THEN
    RAISE EXCEPTION 'credit balance cannot become negative';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_ledger_nonnegative_guard"
BEFORE INSERT ON "credit_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "enforce_credit_account_nonnegative"();

CREATE FUNCTION "enforce_credit_reservation_available"() RETURNS TRIGGER AS $$
DECLARE
  current_balance BIGINT;
  active_reserved BIGINT;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "credit_accounts" WHERE "id" = NEW."credit_account_id" FOR UPDATE;
  SELECT COALESCE(SUM("units"), 0) INTO current_balance
  FROM "credit_ledger_entries"
  WHERE "credit_account_id" = NEW."credit_account_id";
  SELECT COALESCE(SUM("units"), 0) INTO active_reserved
  FROM "credit_reservations"
  WHERE "credit_account_id" = NEW."credit_account_id"
    AND "status" = 'ACTIVE'
    AND "id" <> NEW."id";
  IF current_balance - active_reserved - NEW."units" < 0 THEN
    RAISE EXCEPTION 'insufficient credits for reservation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_reservation_available_guard"
BEFORE INSERT OR UPDATE ON "credit_reservations"
FOR EACH ROW EXECUTE FUNCTION "enforce_credit_reservation_available"();

CREATE FUNCTION "enforce_check_in_capacity"() RETURNS TRIGGER AS $$
DECLARE
  confirmed_capacity INTEGER;
  invitation_cancelled TIMESTAMP(3);
BEGIN
  SELECT "expected_attendees", "cancelled_at"
  INTO confirmed_capacity, invitation_cancelled
  FROM "invitation_groups"
  WHERE "id" = NEW."invitation_group_id" AND "event_id" = NEW."event_id"
  FOR SHARE;
  IF confirmed_capacity IS NULL OR invitation_cancelled IS NOT NULL THEN
    RAISE EXCEPTION 'invitation is not eligible for check-in';
  END IF;
  IF NEW."checked_in_count" > confirmed_capacity THEN
    RAISE EXCEPTION 'check-in count exceeds confirmed attendance';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "check_in_capacity_guard"
BEFORE INSERT OR UPDATE OF "checked_in_count" ON "check_in_states"
FOR EACH ROW EXECUTE FUNCTION "enforce_check_in_capacity"();

CREATE FUNCTION "reject_immutable_stage9_history_change"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "credit_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_stage9_history_change"();

CREATE TRIGGER "check_in_records_immutable"
BEFORE UPDATE OR DELETE ON "check_in_records"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_stage9_history_change"();
