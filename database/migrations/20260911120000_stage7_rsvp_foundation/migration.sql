-- Stage 7 public RSVP safety: rotatable capability hashes, invitation-bound
-- member responses, durable idempotency/confirmation records, and deferred
-- aggregate validation. The aggregate triggers deliberately run at commit so
-- the API can replace a complete RSVP in one transaction without exposing an
-- invalid intermediate state.

-- Stage 7 treats responded_at as the occurrence time of the latest accepted
-- response. Legacy edits only advanced updated_at, so carry that chronology
-- forward before delayed provider replies can be compared against it.
UPDATE "rsvps"
SET "responded_at" = GREATEST("responded_at", "updated_at")
WHERE "responded_at" < "updated_at";

-- Meta response timestamps have one-second precision. A database-issued
-- ingestion sequence makes distinct replies in the same second deterministic,
-- even when webhook jobs execute concurrently or out of queue order.
ALTER TABLE "webhook_events"
  ADD COLUMN "ingestion_sequence" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "webhook_events_ingestion_sequence_key"
  ON "webhook_events"("ingestion_sequence");

ALTER TABLE "rsvps"
  ADD COLUMN "response_webhook_sequence" BIGINT;

-- Keep historical public capabilities while allowing only one unrevoked token
-- for an invitation. Existing values must already be SHA-256 hex digests; do
-- not silently truncate or reinterpret a public credential during migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public_invitation_capabilities"
    WHERE "token_hash" !~ '^[0-9A-Fa-f]{64}$'
  ) THEN
    RAISE EXCEPTION 'public invitation capability hashes must be 64 hexadecimal characters before Stage 7 migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public_invitation_capabilities"
    GROUP BY lower("token_hash")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'case-normalized public invitation capability hashes must be unique before Stage 7 migration';
  END IF;
END;
$$;

UPDATE "public_invitation_capabilities"
SET "token_hash" = lower("token_hash")
WHERE "token_hash" <> lower("token_hash");

DROP INDEX "public_invitation_capabilities_invitation_group_id_key";

ALTER TABLE "public_invitation_capabilities"
  ALTER COLUMN "token_hash" TYPE CHAR(64) USING "token_hash"::CHAR(64),
  ADD CONSTRAINT "public_invitation_capabilities_token_hash_format"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX "public_invitation_capabilities_one_unrevoked_key"
  ON "public_invitation_capabilities"("invitation_group_id")
  WHERE "revoked_at" IS NULL;

CREATE INDEX "public_capabilities_invitation_created_id_idx"
  ON "public_invitation_capabilities"("invitation_group_id", "created_at" DESC, "id");

CREATE INDEX "public_invitation_capabilities_expires_at_idx"
  ON "public_invitation_capabilities"("expires_at");

-- Bind every member response to the same invitation as both its RSVP and guest
-- member. Backfill from the RSVP first, then explicitly reject legacy
-- cross-invitation corruption before replacing the old single-column FKs.
ALTER TABLE "rsvp_members"
  ADD COLUMN "invitation_group_id" UUID;

UPDATE "rsvp_members" AS response_member
SET "invitation_group_id" = response."invitation_group_id"
FROM "rsvps" AS response
WHERE response."id" = response_member."rsvp_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "rsvp_members" AS response_member
    LEFT JOIN "guest_members" AS guest
      ON guest."id" = response_member."guest_member_id"
    WHERE response_member."invitation_group_id" IS NULL
       OR guest."id" IS NULL
       OR guest."invitation_group_id" <> response_member."invitation_group_id"
  ) THEN
    RAISE EXCEPTION 'legacy RSVP member rows cross invitation boundaries or reference missing aggregates';
  END IF;
END;
$$;

-- Older application paths stored only selected members. Stage 7 uses complete
-- coverage so an explicit false row also exists for every named member. Treat
-- the legacy aggregate count as the compatibility source of truth, retain all
-- explicit attending rows, and deterministically fill any remaining selected
-- slots in primary/position order.
WITH response_targets AS (
  SELECT
    response."id" AS rsvp_id,
    response."invitation_group_id",
    LEAST(
      COUNT(guest."id")::INTEGER,
      GREATEST(invitation."expected_attendees" - response."companion_count", 0)
    ) AS target_named_count
  FROM "rsvps" AS response
  JOIN "invitation_groups" AS invitation
    ON invitation."id" = response."invitation_group_id"
  LEFT JOIN "guest_members" AS guest
    ON guest."invitation_group_id" = response."invitation_group_id"
  GROUP BY response."id", response."invitation_group_id", invitation."expected_attendees"
), existing_attendance AS (
  SELECT "rsvp_id", COUNT(*) FILTER (WHERE "attending")::INTEGER AS attending_count
  FROM "rsvp_members"
  GROUP BY "rsvp_id"
), missing_members AS (
  SELECT
    target.rsvp_id,
    target."invitation_group_id",
    guest."id" AS guest_member_id,
    ROW_NUMBER() OVER (
      PARTITION BY target.rsvp_id
      ORDER BY guest."is_primary" DESC, guest."position", guest."id"
    ) AS missing_position,
    GREATEST(
      target.target_named_count - COALESCE(existing.attending_count, 0),
      0
    ) AS attending_slots
  FROM response_targets AS target
  JOIN "guest_members" AS guest
    ON guest."invitation_group_id" = target."invitation_group_id"
  LEFT JOIN "rsvp_members" AS response_member
    ON response_member."rsvp_id" = target.rsvp_id
   AND response_member."guest_member_id" = guest."id"
  LEFT JOIN existing_attendance AS existing
    ON existing."rsvp_id" = target.rsvp_id
  WHERE response_member."id" IS NULL
)
INSERT INTO "rsvp_members" (
  "id",
  "rsvp_id",
  "guest_member_id",
  "attending",
  "invitation_group_id"
)
SELECT
  md5(missing.rsvp_id::TEXT || missing.guest_member_id::TEXT)::UUID,
  missing.rsvp_id,
  missing.guest_member_id,
  missing.missing_position <= missing.attending_slots,
  missing."invitation_group_id"
FROM missing_members AS missing;

-- Normalize legacy scalar aggregates to the now-complete selection. This is a
-- deterministic repair for old sparse rows and makes the deferred invariant
-- safe to enable without discarding a recorded RSVP.
WITH derived_responses AS (
  SELECT
    response."id" AS rsvp_id,
    response."invitation_group_id",
    response."companion_count",
    COUNT(guest."id")::INTEGER AS named_count,
    COUNT(response_member."id") FILTER (WHERE response_member."attending")::INTEGER
      AS attending_count
  FROM "rsvps" AS response
  LEFT JOIN "guest_members" AS guest
    ON guest."invitation_group_id" = response."invitation_group_id"
  LEFT JOIN "rsvp_members" AS response_member
    ON response_member."rsvp_id" = response."id"
   AND response_member."guest_member_id" = guest."id"
  GROUP BY response."id", response."invitation_group_id", response."companion_count"
), normalized_responses AS (
  SELECT
    derived.*,
    CASE
      WHEN derived.attending_count + derived."companion_count" = 0
        THEN 'DECLINED'::"RsvpStatus"
      WHEN derived.attending_count = derived.named_count
        THEN 'ACCEPTED'::"RsvpStatus"
      ELSE 'PARTIALLY_ACCEPTED'::"RsvpStatus"
    END AS normalized_status,
    derived.attending_count + derived."companion_count" AS normalized_count
  FROM derived_responses AS derived
), updated_responses AS (
  UPDATE "rsvps" AS response
  SET "status" = normalized.normalized_status
  FROM normalized_responses AS normalized
  WHERE response."id" = normalized.rsvp_id
  RETURNING normalized."invitation_group_id", normalized.normalized_status,
    normalized.normalized_count
)
UPDATE "invitation_groups" AS invitation
SET
  "rsvp_status" = updated.normalized_status,
  "expected_attendees" = updated.normalized_count
FROM updated_responses AS updated
WHERE invitation."id" = updated."invitation_group_id";

ALTER TABLE "rsvp_members"
  ALTER COLUMN "invitation_group_id" SET NOT NULL;

CREATE UNIQUE INDEX "guest_members_id_invitation_key"
  ON "guest_members"("id", "invitation_group_id");

CREATE UNIQUE INDEX "rsvps_id_invitation_key"
  ON "rsvps"("id", "invitation_group_id");

ALTER TABLE "rsvp_members"
  DROP CONSTRAINT "rsvp_members_rsvp_id_fkey",
  DROP CONSTRAINT "rsvp_members_guest_member_id_fkey",
  ADD CONSTRAINT "rsvp_members_rsvp_id_invitation_group_id_fkey"
    FOREIGN KEY ("rsvp_id", "invitation_group_id")
    REFERENCES "rsvps"("id", "invitation_group_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rsvp_members_guest_member_id_invitation_group_id_fkey"
    FOREIGN KEY ("guest_member_id", "invitation_group_id")
    REFERENCES "guest_members"("id", "invitation_group_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "rsvp_members_invitation_group_id_attending_idx"
  ON "rsvp_members"("invitation_group_id", "attending");

CREATE UNIQUE INDEX "rsvp_members_guest_invitation_key"
  ON "rsvp_members"("guest_member_id", "invitation_group_id");

-- Preserve the old scalar history while upgrading each row to immutable JSON
-- snapshots. Defaults cover the rewrite safely and are removed after backfill
-- so all future callers must provide deliberate before/after snapshots.
ALTER TABLE "rsvp_history"
  ADD COLUMN "previous_response" JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN "new_response" JSONB DEFAULT '{}'::JSONB;

WITH history_context AS (
  SELECT
    history."id",
    history."previous_status",
    history."new_status",
    history."previous_count",
    history."new_count",
    invitation."invitation_type",
    COUNT(guest."id")::INTEGER AS member_count,
    CASE
      WHEN invitation."invitation_type" = 'PRIMARY_WITH_COMPANIONS'
        THEN LEAST(history."previous_count", 1)
      ELSE LEAST(history."previous_count", COUNT(guest."id")::INTEGER)
    END AS previous_named_count,
    CASE
      WHEN invitation."invitation_type" = 'PRIMARY_WITH_COMPANIONS'
        THEN LEAST(history."new_count", 1)
      ELSE LEAST(history."new_count", COUNT(guest."id")::INTEGER)
    END AS new_named_count,
    CASE
      WHEN invitation."invitation_type" = 'PRIMARY_WITH_COMPANIONS'
        THEN GREATEST(history."previous_count" - 1, 0)
      ELSE 0
    END AS previous_companion_count,
    CASE
      WHEN invitation."invitation_type" = 'PRIMARY_WITH_COMPANIONS'
        THEN GREATEST(history."new_count" - 1, 0)
      ELSE 0
    END AS new_companion_count
  FROM "rsvp_history" AS history
  JOIN "invitation_groups" AS invitation
    ON invitation."id" = history."invitation_group_id"
  LEFT JOIN "guest_members" AS guest
    ON guest."invitation_group_id" = invitation."id"
  GROUP BY history."id", invitation."invitation_type"
), history_snapshots AS (
  SELECT
    context.*,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(selected."id"::TEXT) ORDER BY selected."position", selected."id")
      FROM (
        SELECT guest."id", guest."position"
        FROM "guest_members" AS guest
        JOIN "rsvp_history" AS history ON history."id" = context."id"
        WHERE guest."invitation_group_id" = history."invitation_group_id"
        ORDER BY guest."is_primary" DESC, guest."position", guest."id"
        LIMIT context.previous_named_count
      ) AS selected
    ), '[]'::JSONB) AS previous_member_ids,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(selected."id"::TEXT) ORDER BY selected."position", selected."id")
      FROM (
        SELECT guest."id", guest."position"
        FROM "guest_members" AS guest
        JOIN "rsvp_history" AS history ON history."id" = context."id"
        WHERE guest."invitation_group_id" = history."invitation_group_id"
        ORDER BY guest."is_primary" DESC, guest."position", guest."id"
        LIMIT context.new_named_count
      ) AS selected
    ), '[]'::JSONB) AS new_member_ids
  FROM history_context AS context
), normalized_history AS (
  SELECT
    snapshot.*,
    CASE
      WHEN snapshot."previous_status" = 'PENDING' THEN 'PENDING'::"RsvpStatus"
      WHEN snapshot."previous_count" = 0 THEN 'DECLINED'::"RsvpStatus"
      WHEN snapshot."invitation_type" = 'NAMED_GROUP'
        AND snapshot.previous_named_count < snapshot.member_count
        THEN 'PARTIALLY_ACCEPTED'::"RsvpStatus"
      ELSE 'ACCEPTED'::"RsvpStatus"
    END AS normalized_previous_status,
    CASE
      WHEN snapshot."new_status" = 'PENDING' THEN 'PENDING'::"RsvpStatus"
      WHEN snapshot."new_count" = 0 THEN 'DECLINED'::"RsvpStatus"
      WHEN snapshot."invitation_type" = 'NAMED_GROUP'
        AND snapshot.new_named_count < snapshot.member_count
        THEN 'PARTIALLY_ACCEPTED'::"RsvpStatus"
      ELSE 'ACCEPTED'::"RsvpStatus"
    END AS normalized_new_status
  FROM history_snapshots AS snapshot
)
UPDATE "rsvp_history" AS history
SET
  "previous_status" = normalized.normalized_previous_status,
  "new_status" = normalized.normalized_new_status,
  "previous_response" = jsonb_build_object(
    'status', normalized.normalized_previous_status,
    'attendingMemberIds', normalized.previous_member_ids,
    'companionCount', normalized.previous_companion_count,
    'expectedAttendees', normalized."previous_count"
  ),
  "new_response" = jsonb_build_object(
    'status', normalized.normalized_new_status,
    'attendingMemberIds', normalized.new_member_ids,
    'companionCount', normalized.new_companion_count,
    'expectedAttendees', normalized."new_count"
  )
FROM normalized_history AS normalized
WHERE history."id" = normalized."id";

ALTER TABLE "rsvp_history"
  ALTER COLUMN "previous_response" SET NOT NULL,
  ALTER COLUMN "previous_response" DROP DEFAULT,
  ALTER COLUMN "new_response" SET NOT NULL,
  ALTER COLUMN "new_response" DROP DEFAULT;

CREATE UNIQUE INDEX "rsvp_history_id_invitation_key"
  ON "rsvp_history"("id", "invitation_group_id");

DROP INDEX "rsvp_history_invitation_group_id_created_at_idx";

CREATE INDEX "rsvp_history_invitation_group_id_created_at_id_idx"
  ON "rsvp_history"("invitation_group_id", "created_at" DESC, "id");

-- One submission record is the durable idempotency boundary for each source.
-- rsvp_history_id is nullable because a fresh idempotency key whose payload is
-- identical to the current response is a successful no-op, not a new edit.
CREATE TABLE "rsvp_submissions" (
  "id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "rsvp_history_id" UUID,
  "source" "RsvpSource" NOT NULL,
  "key_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rsvp_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rsvp_submissions_key_hash_format"
    CHECK ("key_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rsvp_submissions_request_hash_format"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "rsvp_submissions_history_key"
  ON "rsvp_submissions"("rsvp_history_id");

CREATE UNIQUE INDEX "rsvp_submissions_history_invitation_key"
  ON "rsvp_submissions"("rsvp_history_id", "invitation_group_id");

CREATE UNIQUE INDEX "rsvp_submissions_invitation_source_key"
  ON "rsvp_submissions"("invitation_group_id", "source", "key_hash");

CREATE INDEX "rsvp_submissions_invitation_group_id_created_at_id_idx"
  ON "rsvp_submissions"("invitation_group_id", "created_at" DESC, "id");

ALTER TABLE "rsvp_submissions"
  ADD CONSTRAINT "rsvp_submissions_invitation_group_id_fkey"
    FOREIGN KEY ("invitation_group_id")
    REFERENCES "invitation_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rsvp_submissions_rsvp_history_id_invitation_group_id_fkey"
    FOREIGN KEY ("rsvp_history_id", "invitation_group_id")
    REFERENCES "rsvp_history"("id", "invitation_group_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Confirmation sends use an outbox independent of invitation Message rows.
-- This keeps RSVP commits durable even when Redis or Meta is unavailable.
CREATE TYPE "RsvpConfirmationStatus" AS ENUM (
  'PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED'
);

CREATE TABLE "rsvp_confirmations" (
  "id" UUID NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "event_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "rsvp_history_id" UUID NOT NULL,
  "status" "RsvpConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  "recipient_phone_e164" VARCHAR(32) NOT NULL,
  "locale" "UserLocale" NOT NULL,
  "provider" VARCHAR(64) NOT NULL DEFAULT 'META_WHATSAPP',
  "provider_template_name" VARCHAR(255) NOT NULL,
  "template_variables" JSONB NOT NULL,
  "template_parameter_order" JSONB NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "provider_message_id" VARCHAR(255),
  "failure_class" "MessagingFailureClass",
  "failure_code" VARCHAR(100),
  "failure_reason" VARCHAR(500),
  "queued_at" TIMESTAMP(3),
  "sending_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rsvp_confirmations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rsvp_confirmations_attempt_count_nonnegative"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "rsvp_confirmations_phone_e164_format"
    CHECK ("recipient_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "rsvp_confirmations_template_variables_object"
    CHECK (jsonb_typeof("template_variables") = 'object'),
  CONSTRAINT "rsvp_confirmations_template_parameter_order_array"
    CHECK (jsonb_typeof("template_parameter_order") = 'array')
);

CREATE UNIQUE INDEX "rsvp_confirmations_history_key"
  ON "rsvp_confirmations"("rsvp_history_id");

CREATE UNIQUE INDEX "rsvp_confirmations_sequence_key"
  ON "rsvp_confirmations"("sequence");

CREATE UNIQUE INDEX "rsvp_confirmations_history_invitation_key"
  ON "rsvp_confirmations"("rsvp_history_id", "invitation_group_id");

CREATE UNIQUE INDEX "rsvp_confirmations_provider_message_key"
  ON "rsvp_confirmations"("provider", "provider_message_id");

CREATE INDEX "rsvp_confirmations_status_created_at_id_idx"
  ON "rsvp_confirmations"("status", "created_at", "id");

CREATE INDEX "rsvp_confirmations_event_id_status_created_at_id_idx"
  ON "rsvp_confirmations"("event_id", "status", "created_at" DESC, "id");

CREATE INDEX "rsvp_confirmations_invitation_group_id_created_at_id_idx"
  ON "rsvp_confirmations"("invitation_group_id", "created_at" DESC, "id");

ALTER TABLE "rsvp_confirmations"
  ADD CONSTRAINT "rsvp_confirmations_event_id_fkey"
    FOREIGN KEY ("event_id")
    REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rsvp_confirmations_invitation_group_id_event_id_fkey"
    FOREIGN KEY ("invitation_group_id", "event_id")
    REFERENCES "invitation_groups"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rsvp_confirmations_rsvp_history_id_invitation_group_id_fkey"
    FOREIGN KEY ("rsvp_history_id", "invitation_group_id")
    REFERENCES "rsvp_history"("id", "invitation_group_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cheap row-local checks complement the deferred cross-table assertion. The
-- invitation and RSVP nonnegative checks were installed by the foundation.
ALTER TABLE "rsvp_history"
  ADD CONSTRAINT "rsvp_history_attendee_counts_nonnegative"
    CHECK ("previous_count" >= 0 AND "new_count" >= 0);

CREATE OR REPLACE FUNCTION "assert_rsvp_aggregate"(group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  invitation RECORD;
  response RECORD;
  named_member_count INTEGER;
  response_member_count INTEGER;
  attending_member_count INTEGER;
  primary_attending_count INTEGER;
  derived_expected_attendees INTEGER;
  derived_status "RsvpStatus";
BEGIN
  SELECT
      "invitation_type",
      "max_companions",
      "rsvp_status",
      "expected_attendees"
    INTO invitation
    FROM "invitation_groups"
    WHERE "id" = group_id;

  -- Cascading deletion can queue child triggers after the invitation is gone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "id", "status", "companion_count"
    INTO response
    FROM "rsvps"
    WHERE "invitation_group_id" = group_id;

  IF NOT FOUND THEN
    IF invitation."rsvp_status" <> 'PENDING'
       OR invitation."expected_attendees" <> 0
    THEN
      RAISE EXCEPTION 'invitation % without an RSVP must retain the pending zero-attendee aggregate', group_id
        USING ERRCODE = '23514',
              CONSTRAINT = 'rsvp_aggregate_matches_invitation';
    END IF;
    RETURN;
  END IF;

  SELECT
      COUNT(*)::INTEGER,
      COUNT(response_member."id")::INTEGER,
      COUNT(response_member."id") FILTER (WHERE response_member."attending")::INTEGER,
      COUNT(response_member."id") FILTER (
        WHERE response_member."attending" AND guest."is_primary"
      )::INTEGER
    INTO
      named_member_count,
      response_member_count,
      attending_member_count,
      primary_attending_count
    FROM "guest_members" AS guest
    LEFT JOIN "rsvp_members" AS response_member
      ON response_member."guest_member_id" = guest."id"
     AND response_member."rsvp_id" = response."id"
     AND response_member."invitation_group_id" = group_id
    WHERE guest."invitation_group_id" = group_id;

  IF response_member_count <> named_member_count THEN
    RAISE EXCEPTION 'RSVP % must contain exactly one response row for each of % named members', response."id", named_member_count
      USING ERRCODE = '23514',
            CONSTRAINT = 'rsvp_member_coverage_valid';
  END IF;

  IF response."companion_count" > invitation."max_companions"
     OR (
       invitation."invitation_type" <> 'PRIMARY_WITH_COMPANIONS'
       AND response."companion_count" <> 0
     )
     OR (response."companion_count" > 0 AND primary_attending_count <> 1)
  THEN
    RAISE EXCEPTION 'RSVP % has an invalid companion selection for invitation %', response."id", group_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'rsvp_companion_selection_valid';
  END IF;

  derived_expected_attendees := attending_member_count + response."companion_count";

  IF derived_expected_attendees = 0 THEN
    derived_status := 'DECLINED';
  ELSIF attending_member_count = named_member_count THEN
    derived_status := 'ACCEPTED';
  ELSE
    derived_status := 'PARTIALLY_ACCEPTED';
  END IF;

  IF response."status" <> derived_status THEN
    RAISE EXCEPTION 'RSVP % status % does not match derived status %', response."id", response."status", derived_status
      USING ERRCODE = '23514',
            CONSTRAINT = 'rsvp_status_matches_selection';
  END IF;

  IF invitation."rsvp_status" <> response."status"
     OR invitation."expected_attendees" <> derived_expected_attendees
  THEN
    RAISE EXCEPTION 'invitation % RSVP aggregate does not match its response', group_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'rsvp_aggregate_matches_invitation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "check_invitation_rsvp_aggregate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."id");
  ELSE
    PERFORM "assert_rsvp_aggregate"(NEW."id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "check_guest_member_rsvp_aggregate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
    IF NEW."invitation_group_id" <> OLD."invitation_group_id" THEN
      PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
    END IF;
  ELSE
    PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "check_rsvp_row_aggregate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
    IF NEW."invitation_group_id" <> OLD."invitation_group_id" THEN
      PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
    END IF;
  ELSE
    PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "check_rsvp_member_aggregate"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM "assert_rsvp_aggregate"(OLD."invitation_group_id");
    IF NEW."invitation_group_id" <> OLD."invitation_group_id" THEN
      PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
    END IF;
  ELSE
    PERFORM "assert_rsvp_aggregate"(NEW."invitation_group_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "rsvp_aggregate_after_invitation_change"
AFTER INSERT OR UPDATE OR DELETE
ON "invitation_groups"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_invitation_rsvp_aggregate"();

CREATE CONSTRAINT TRIGGER "rsvp_aggregate_after_guest_member_change"
AFTER INSERT OR UPDATE OR DELETE
ON "guest_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_guest_member_rsvp_aggregate"();

CREATE CONSTRAINT TRIGGER "rsvp_aggregate_after_rsvp_change"
AFTER INSERT OR UPDATE OR DELETE
ON "rsvps"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_rsvp_row_aggregate"();

CREATE CONSTRAINT TRIGGER "rsvp_aggregate_after_rsvp_member_change"
AFTER INSERT OR UPDATE OR DELETE
ON "rsvp_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_rsvp_member_aggregate"();

-- Refuse to enable Stage 7 over silently inconsistent legacy aggregates. This
-- read-only pass is intentionally last: the migration transaction rolls back
-- all prior DDL if operators need to repair pre-existing RSVP data first.
DO $$
DECLARE
  invitation RECORD;
BEGIN
  FOR invitation IN SELECT "id" FROM "invitation_groups" LOOP
    PERFORM "assert_rsvp_aggregate"(invitation."id");
  END LOOP;
END;
$$;
