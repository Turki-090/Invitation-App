-- Stage 8 collaboration and reminder safety: independent phone-bound team
-- invitations, exact custom permission sets, explainable reminder decisions,
-- rolling recipient cooldown state, typed templates, and idempotent host
-- notifications. All new tenant-owned references are bound to the same event.

CREATE TYPE "TemplatePurpose" AS ENUM ('INVITATION', 'REMINDER');
CREATE TYPE "TeamInvitationStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'
);
CREATE TYPE "ReminderTriggerKind" AS ENUM (
  'AFTER_INITIAL_INVITATION', 'BEFORE_RSVP_DEADLINE'
);
CREATE TYPE "ReminderRunSource" AS ENUM ('MANUAL', 'SCHEDULED');
CREATE TYPE "ReminderRunItemOutcome" AS ENUM ('ELIGIBLE', 'EXCLUDED');
CREATE TYPE "NotificationKind" AS ENUM (
  'MESSAGE_BATCH_COMPLETED',
  'MESSAGE_BATCH_FAILED',
  'REMINDER_BATCH_COMPLETED',
  'TEAM_MEMBER_JOINED'
);

-- Existing templates are invitation templates. New reminder templates use the
-- same immutable snapshot machinery but cannot be selected by an initial send.
ALTER TABLE "invitation_templates"
  ADD COLUMN "purpose" "TemplatePurpose" NOT NULL DEFAULT 'INVITATION';

DROP INDEX "invitation_template_version_key";
CREATE UNIQUE INDEX "invitation_template_version_key"
  ON "invitation_templates"(
    "event_id", "template_key", "purpose", "locale", "version"
  );
CREATE INDEX "invitation_templates_event_purpose_status_idx"
  ON "invitation_templates"(
    "event_id", "purpose", "locale", "status", "created_at" DESC, "id"
  );

-- Membership metadata makes revocation and permission changes attributable.
-- The old invited_by column becomes a real, nullable inviter relationship.
ALTER TABLE "event_memberships"
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "revoked_by_user_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "event_memberships"
  ALTER COLUMN "updated_at" DROP DEFAULT;

-- Normalize legacy rows before enforcing the explicit lifecycle invariant.
-- Earlier releases did not persist revocation timestamps and could contain an
-- active membership without accepted_at when created by an administrative
-- script rather than the application service.
UPDATE "event_memberships"
SET "accepted_at" = COALESCE("accepted_at", "created_at")
WHERE "status" = 'ACTIVE' AND "accepted_at" IS NULL;

UPDATE "event_memberships"
SET "revoked_at" = COALESCE("revoked_at", "accepted_at", "created_at")
WHERE "status" = 'REVOKED' AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "event_memberships_id_event_key"
  ON "event_memberships"("id", "event_id");

ALTER TABLE "event_memberships"
  ADD CONSTRAINT "event_memberships_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "event_memberships_revoked_by_user_id_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "event_memberships_lifecycle_valid" CHECK (
    ("status" = 'PENDING' AND "accepted_at" IS NULL AND "revoked_at" IS NULL)
    OR ("status" = 'ACTIVE' AND "accepted_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
  );

-- Invitations exist before an authentication identity does. Only a SHA-256
-- token digest and normalized E.164 destination are persisted.
CREATE TABLE "team_invitations" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "accepted_membership_id" UUID,
  "phone_e164" VARCHAR(32) NOT NULL,
  "phone_country" CHAR(2) NOT NULL,
  "role" "EventMembershipRole" NOT NULL,
  "permissions_json" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "token_hash" CHAR(64) NOT NULL,
  "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_invitations_non_owner_role"
    CHECK ("role" <> 'OWNER'),
  CONSTRAINT "team_invitations_phone_e164_format"
    CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "team_invitations_phone_country_format"
    CHECK ("phone_country" ~ '^[A-Z]{2}$'),
  CONSTRAINT "team_invitations_token_hash_format"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "team_invitations_permissions_shape" CHECK (
    jsonb_typeof("permissions_json") = 'array'
    OR (
      jsonb_typeof("permissions_json") = 'object'
      AND "permissions_json"->>'mode' = 'CUSTOM'
      AND jsonb_typeof("permissions_json"->'permissions') = 'array'
    )
  ),
  CONSTRAINT "team_invitations_lifecycle_valid" CHECK (
    (
      "status" = 'PENDING'
      AND "accepted_membership_id" IS NULL
      AND "accepted_at" IS NULL
      AND "revoked_at" IS NULL
    ) OR (
      "status" = 'ACCEPTED'
      AND "accepted_membership_id" IS NOT NULL
      AND "accepted_at" IS NOT NULL
      AND "revoked_at" IS NULL
    ) OR (
      "status" = 'REVOKED'
      AND "accepted_membership_id" IS NULL
      AND "accepted_at" IS NULL
      AND "revoked_at" IS NOT NULL
    ) OR (
      "status" = 'EXPIRED'
      AND "accepted_membership_id" IS NULL
      AND "accepted_at" IS NULL
      AND "revoked_at" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "team_invitations_token_hash_key"
  ON "team_invitations"("token_hash");
CREATE UNIQUE INDEX "team_invitations_accepted_membership_id_key"
  ON "team_invitations"("accepted_membership_id");
CREATE UNIQUE INDEX "team_invitations_id_event_key"
  ON "team_invitations"("id", "event_id");
CREATE UNIQUE INDEX "team_invitations_membership_event_key"
  ON "team_invitations"("accepted_membership_id", "event_id");
CREATE UNIQUE INDEX "team_invitations_one_pending_phone_key"
  ON "team_invitations"("event_id", "phone_e164")
  WHERE "status" = 'PENDING';
CREATE INDEX "team_invitations_event_status_created_id_idx"
  ON "team_invitations"("event_id", "status", "created_at" DESC, "id");
CREATE INDEX "team_invitations_phone_status_idx"
  ON "team_invitations"("phone_e164", "status");
CREATE INDEX "team_invitations_expiry_status_idx"
  ON "team_invitations"("expires_at", "status");

ALTER TABLE "team_invitations"
  ADD CONSTRAINT "team_invitations_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "team_invitations_invited_by_user_id_fkey"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "team_invitations_accepted_membership_id_event_id_fkey"
    FOREIGN KEY ("accepted_membership_id", "event_id")
    REFERENCES "event_memberships"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reminder_rules" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "trigger_kind" "ReminderTriggerKind" NOT NULL,
  "offset_minutes" INTEGER NOT NULL,
  "cooldown_minutes" INTEGER NOT NULL DEFAULT 4320,
  "maximum_reminders" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_evaluated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_rules_name_present"
    CHECK (length(btrim("name")) BETWEEN 2 AND 120),
  CONSTRAINT "reminder_rules_offset_valid"
    CHECK ("offset_minutes" BETWEEN 1440 AND 43200),
  CONSTRAINT "reminder_rules_cooldown_valid"
    CHECK ("cooldown_minutes" BETWEEN 60 AND 43200),
  CONSTRAINT "reminder_rules_maximum_valid"
    CHECK ("maximum_reminders" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "reminder_rules_id_event_key"
  ON "reminder_rules"("id", "event_id");
CREATE INDEX "reminder_rules_schedule_idx"
  ON "reminder_rules"("enabled", "last_evaluated_at", "id");
CREATE INDEX "reminder_rules_event_created_id_idx"
  ON "reminder_rules"("event_id", "created_at" DESC, "id");

ALTER TABLE "reminder_rules"
  ADD CONSTRAINT "reminder_rules_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_rules_template_id_event_id_fkey"
    FOREIGN KEY ("template_id", "event_id")
    REFERENCES "invitation_templates"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_rules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reminder_runs" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "rule_id" UUID,
  "send_batch_id" UUID,
  "created_by" UUID NOT NULL,
  "source" "ReminderRunSource" NOT NULL,
  "status" "SendBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "request_hash" CHAR(64) NOT NULL,
  "selection_hash" CHAR(64) NOT NULL,
  "confirmation_hash" CHAR(64),
  "schedule_key" CHAR(64),
  "cooldown_minutes" INTEGER NOT NULL,
  "selected_count" INTEGER NOT NULL,
  "eligible_count" INTEGER NOT NULL,
  "excluded_count" INTEGER NOT NULL,
  "evaluated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reminder_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_runs_request_hash_format"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reminder_runs_selection_hash_format"
    CHECK ("selection_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reminder_runs_confirmation_hash_format"
    CHECK ("confirmation_hash" IS NULL OR "confirmation_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reminder_runs_schedule_key_format"
    CHECK ("schedule_key" IS NULL OR "schedule_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reminder_runs_counts_valid" CHECK (
    "cooldown_minutes" BETWEEN 60 AND 43200
    AND "selected_count" >= 0
    AND "eligible_count" >= 0
    AND "excluded_count" >= 0
    AND "selected_count" = "eligible_count" + "excluded_count"
  ),
  CONSTRAINT "reminder_runs_batch_valid" CHECK (
    (
      "eligible_count" = 0
      AND "source" = 'SCHEDULED'
      AND "send_batch_id" IS NULL
      AND "status" = 'COMPLETED'
      AND "completed_at" IS NOT NULL
    ) OR (
      "eligible_count" > 0
      AND "send_batch_id" IS NOT NULL
    )
  ),
  CONSTRAINT "reminder_runs_source_fields_valid" CHECK (
    (
      "source" = 'MANUAL'
      AND "rule_id" IS NULL
      AND "confirmation_hash" IS NOT NULL
      AND "schedule_key" IS NULL
    ) OR (
      "source" = 'SCHEDULED'
      AND "rule_id" IS NOT NULL
      AND "confirmation_hash" IS NULL
      AND "schedule_key" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "reminder_runs_send_batch_id_key"
  ON "reminder_runs"("send_batch_id");
CREATE UNIQUE INDEX "reminder_runs_id_event_key"
  ON "reminder_runs"("id", "event_id");
CREATE UNIQUE INDEX "reminder_runs_batch_event_key"
  ON "reminder_runs"("send_batch_id", "event_id");
CREATE UNIQUE INDEX "reminder_runs_event_source_schedule_key"
  ON "reminder_runs"("event_id", "source", "schedule_key");
CREATE INDEX "reminder_runs_event_created_id_idx"
  ON "reminder_runs"("event_id", "created_at" DESC, "id");
CREATE INDEX "reminder_runs_rule_created_id_idx"
  ON "reminder_runs"("rule_id", "created_at" DESC, "id");

ALTER TABLE "reminder_runs"
  ADD CONSTRAINT "reminder_runs_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_runs_rule_id_event_id_fkey"
    FOREIGN KEY ("rule_id", "event_id")
    REFERENCES "reminder_rules"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_runs_send_batch_id_event_id_fkey"
    FOREIGN KEY ("send_batch_id", "event_id")
    REFERENCES "send_batches"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_runs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reminder_run_items" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "reminder_run_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "message_id" UUID,
  "outcome" "ReminderRunItemOutcome" NOT NULL,
  "reason_codes" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "initial_invitation_sent_at" TIMESTAMP(3),
  "last_reminder_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reminder_run_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_run_items_reasons_array"
    CHECK (jsonb_typeof("reason_codes") = 'array'),
  CONSTRAINT "reminder_run_items_outcome_valid" CHECK (
    (
      "outcome" = 'ELIGIBLE'
      AND "message_id" IS NOT NULL
      AND jsonb_array_length("reason_codes") = 0
    ) OR (
      "outcome" = 'EXCLUDED'
      AND "message_id" IS NULL
      AND jsonb_array_length("reason_codes") > 0
    )
  )
);

CREATE UNIQUE INDEX "reminder_run_items_message_id_key"
  ON "reminder_run_items"("message_id");
CREATE UNIQUE INDEX "reminder_run_items_run_invitation_key"
  ON "reminder_run_items"("reminder_run_id", "invitation_group_id");
CREATE UNIQUE INDEX "reminder_run_items_message_event_key"
  ON "reminder_run_items"("message_id", "event_id");
CREATE INDEX "reminder_run_items_event_invitation_created_idx"
  ON "reminder_run_items"(
    "event_id", "invitation_group_id", "created_at" DESC
  );
CREATE INDEX "reminder_run_items_run_outcome_idx"
  ON "reminder_run_items"("reminder_run_id", "outcome", "id");

ALTER TABLE "reminder_run_items"
  ADD CONSTRAINT "reminder_run_items_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_run_items_reminder_run_id_event_id_fkey"
    FOREIGN KEY ("reminder_run_id", "event_id")
    REFERENCES "reminder_runs"("id", "event_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_run_items_invitation_group_id_event_id_fkey"
    FOREIGN KEY ("invitation_group_id", "event_id")
    REFERENCES "invitation_groups"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_run_items_message_id_event_id_fkey"
    FOREIGN KEY ("message_id", "event_id")
    REFERENCES "messages"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- One lockable row per recipient gives both manual and scheduled paths a
-- rolling cooldown boundary that is independent of wall-clock buckets.
CREATE TABLE "reminder_recipient_states" (
  "event_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "last_reminder_message_id" UUID NOT NULL,
  "last_queued_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reminder_recipient_states_pkey"
    PRIMARY KEY ("event_id", "invitation_group_id")
);

CREATE UNIQUE INDEX "reminder_recipient_states_last_reminder_message_id_key"
  ON "reminder_recipient_states"("last_reminder_message_id");
CREATE UNIQUE INDEX "reminder_recipient_states_invitation_event_key"
  ON "reminder_recipient_states"("invitation_group_id", "event_id");
CREATE UNIQUE INDEX "reminder_recipient_states_message_event_key"
  ON "reminder_recipient_states"("last_reminder_message_id", "event_id");
CREATE INDEX "reminder_recipient_states_event_queued_idx"
  ON "reminder_recipient_states"("event_id", "last_queued_at");

ALTER TABLE "reminder_recipient_states"
  ADD CONSTRAINT "reminder_recipient_states_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_recipient_states_invitation_group_id_event_id_fkey"
    FOREIGN KEY ("invitation_group_id", "event_id")
    REFERENCES "invitation_groups"("id", "event_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reminder_recipient_states_last_reminder_message_id_event_i_fkey"
    FOREIGN KEY ("last_reminder_message_id", "event_id")
    REFERENCES "messages"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "source_type" VARCHAR(80) NOT NULL,
  "source_id" UUID NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_source_type_present"
    CHECK (length(btrim("source_type")) BETWEEN 1 AND 80),
  CONSTRAINT "notifications_data_object"
    CHECK (jsonb_typeof("data") = 'object')
);

CREATE UNIQUE INDEX "notifications_user_kind_source_key"
  ON "notifications"("user_id", "kind", "source_type", "source_id");
CREATE INDEX "notifications_user_read_created_id_idx"
  ON "notifications"("user_id", "read_at", "created_at" DESC, "id");
CREATE INDEX "notifications_event_created_id_idx"
  ON "notifications"("event_id", "created_at" DESC, "id");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Owners are immutable event principals. Non-owner memberships can never be
-- promoted to OWNER, even through a direct database write.
CREATE OR REPLACE FUNCTION "protect_event_owner_membership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id UUID;
BEGIN
  SELECT "owner_user_id" INTO owner_id
  FROM "events"
  WHERE "id" = NEW."event_id";

  IF NEW."role" = 'OWNER'
     AND (
       NEW."user_id" <> owner_id
       OR NEW."status" <> 'ACTIVE'
       OR NEW."revoked_at" IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'owner membership must remain active and match the event owner'
      USING ERRCODE = '23514',
            CONSTRAINT = 'event_owner_membership_integrity';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."role" = 'OWNER'
     AND ROW(NEW."event_id", NEW."user_id", NEW."role", NEW."status")
       IS DISTINCT FROM
       ROW(OLD."event_id", OLD."user_id", OLD."role", OLD."status")
  THEN
    RAISE EXCEPTION 'owner membership identity and active role are immutable'
      USING ERRCODE = '23514',
            CONSTRAINT = 'event_owner_membership_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "event_owner_membership_protected"
BEFORE INSERT OR UPDATE ON "event_memberships"
FOR EACH ROW EXECUTE FUNCTION "protect_event_owner_membership"();

-- Accepted and revoked invitations are terminal. A pending or expired invite
-- can be resent by rotating only its credential and expiry; acceptance and
-- revocation remain one-way.
CREATE OR REPLACE FUNCTION "protect_team_invitation_lifecycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('ACCEPTED', 'REVOKED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal team invitations are immutable'
      USING ERRCODE = '23514',
            CONSTRAINT = 'team_invitation_terminal_immutable';
  END IF;
  IF OLD."status" = 'EXPIRED' AND NEW."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'expired team invitations can only be resent'
      USING ERRCODE = '23514',
            CONSTRAINT = 'team_invitation_expired_transition_invalid';
  END IF;
  IF OLD."status" IN ('PENDING', 'EXPIRED')
     AND NEW."status" = 'PENDING'
     AND ROW(
       NEW."event_id", NEW."invited_by_user_id", NEW."phone_e164",
       NEW."phone_country", NEW."role", NEW."permissions_json", NEW."created_at"
     ) IS DISTINCT FROM ROW(
       OLD."event_id", OLD."invited_by_user_id", OLD."phone_e164",
       OLD."phone_country", OLD."role", OLD."permissions_json", OLD."created_at"
     )
  THEN
    RAISE EXCEPTION 'resending can rotate only a pending invitation credential'
      USING ERRCODE = '23514',
            CONSTRAINT = 'team_invitation_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "team_invitation_lifecycle_protected"
BEFORE UPDATE ON "team_invitations"
FOR EACH ROW EXECUTE FUNCTION "protect_team_invitation_lifecycle"();

-- Extend the Stage 6 snapshot proof with batch/type and template-purpose
-- checks. Reminder messages must use REMINDER templates; every other current
-- durable Message kind uses an INVITATION template.
CREATE OR REPLACE FUNCTION "assert_message_snapshot_source"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_row RECORD;
  invitation_phone VARCHAR(32);
  batch_message_type "MessageType";
BEGIN
  SELECT s."invitation_group_id", s."template_id", s."template_version", s."locale",
         s."variables", s."rendered_content", s."source_hash", s."content_hash",
         t."provider", t."provider_template_name", t."status", t."variable_schema",
         t."purpose"
    INTO snapshot_row
    FROM "invitation_content_snapshots" s
    JOIN "invitation_templates" t
      ON t."id" = s."template_id" AND t."event_id" = s."event_id"
    WHERE s."id" = NEW."content_snapshot_id" AND s."event_id" = NEW."event_id";

  IF NOT FOUND OR snapshot_row."status" <> 'APPROVED'
     OR snapshot_row."provider_template_name" IS NULL THEN
    RAISE EXCEPTION 'messages require a configured approved template snapshot'
      USING ERRCODE = '23514',
            CONSTRAINT = 'message_approved_snapshot_required';
  END IF;

  SELECT "message_type" INTO batch_message_type
  FROM "send_batches"
  WHERE "id" = NEW."send_batch_id" AND "event_id" = NEW."event_id";

  IF NOT FOUND OR batch_message_type IS DISTINCT FROM NEW."message_type" THEN
    RAISE EXCEPTION 'message type must match its event-local batch'
      USING ERRCODE = '23514',
            CONSTRAINT = 'message_batch_type_mismatch';
  END IF;

  SELECT "phone_e164" INTO invitation_phone
  FROM "invitation_groups"
  WHERE "id" = NEW."invitation_group_id"
    AND "event_id" = NEW."event_id"
    AND "cancelled_at" IS NULL;

  IF NOT FOUND
     OR (
       NEW."message_type" = 'REMINDER'
       AND snapshot_row."purpose" <> 'REMINDER'
     )
     OR (
       NEW."message_type" <> 'REMINDER'
       AND snapshot_row."purpose" <> 'INVITATION'
     )
     OR NEW."invitation_group_id" IS DISTINCT FROM snapshot_row."invitation_group_id"
     OR NEW."recipient_phone_e164" IS DISTINCT FROM invitation_phone
     OR NEW."template_id" IS DISTINCT FROM snapshot_row."template_id"
     OR NEW."template_version" IS DISTINCT FROM snapshot_row."template_version"
     OR NEW."locale" IS DISTINCT FROM snapshot_row."locale"
     OR NEW."template_variables" IS DISTINCT FROM snapshot_row."variables"
     OR NEW."template_parameter_order" IS DISTINCT FROM snapshot_row."variable_schema"
     OR NEW."rendered_content" IS DISTINCT FROM snapshot_row."rendered_content"
     OR NEW."source_hash" IS DISTINCT FROM snapshot_row."source_hash"
     OR NEW."content_hash" IS DISTINCT FROM snapshot_row."content_hash"
     OR NEW."provider" IS DISTINCT FROM snapshot_row."provider"
     OR NEW."provider_template_name" IS DISTINCT FROM snapshot_row."provider_template_name"
  THEN
    RAISE EXCEPTION 'message fields, type, and template purpose must match the event-local snapshot and batch'
      USING ERRCODE = '23514', CONSTRAINT = 'message_snapshot_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

-- Reminder audit decisions and notification evidence are append-only. A read
-- timestamp is the sole mutable notification field.
CREATE OR REPLACE FUNCTION "protect_reminder_run_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."event_id", NEW."rule_id", NEW."send_batch_id", NEW."created_by",
    NEW."source", NEW."request_hash", NEW."selection_hash",
    NEW."confirmation_hash", NEW."schedule_key", NEW."cooldown_minutes",
    NEW."selected_count", NEW."eligible_count", NEW."excluded_count",
    NEW."evaluated_at", NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."event_id", OLD."rule_id", OLD."send_batch_id", OLD."created_by",
    OLD."source", OLD."request_hash", OLD."selection_hash",
    OLD."confirmation_hash", OLD."schedule_key", OLD."cooldown_minutes",
    OLD."selected_count", OLD."eligible_count", OLD."excluded_count",
    OLD."evaluated_at", OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'reminder run selection evidence is immutable'
      USING ERRCODE = '23514',
            CONSTRAINT = 'reminder_run_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reminder_run_identity_protected"
BEFORE UPDATE ON "reminder_runs"
FOR EACH ROW EXECUTE FUNCTION "protect_reminder_run_identity"();

CREATE OR REPLACE FUNCTION "protect_reminder_run_item"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reminder eligibility history is append-only'
    USING ERRCODE = '23514',
          CONSTRAINT = 'reminder_run_item_immutable';
END;
$$;

CREATE TRIGGER "reminder_run_item_protected"
BEFORE UPDATE OR DELETE ON "reminder_run_items"
FOR EACH ROW EXECUTE FUNCTION "protect_reminder_run_item"();

CREATE OR REPLACE FUNCTION "protect_notification_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."event_id", NEW."user_id", NEW."kind", NEW."source_type",
    NEW."source_id", NEW."data", NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."event_id", OLD."user_id", OLD."kind", OLD."source_type",
    OLD."source_id", OLD."data", OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'notification source evidence is immutable'
      USING ERRCODE = '23514',
            CONSTRAINT = 'notification_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "notification_identity_protected"
BEFORE UPDATE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION "protect_notification_identity"();
