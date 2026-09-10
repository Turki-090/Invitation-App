-- Stage 6 reliable WhatsApp delivery: immutable logical messages, attempts,
-- idempotent send batches, and authenticated/deduplicated webhook evidence.

CREATE TYPE "SendBatchStatus" AS ENUM (
  'QUEUED', 'DISPATCHING', 'IN_PROGRESS', 'COMPLETED',
  'PARTIALLY_FAILED', 'FAILED', 'CANCELLED'
);
CREATE TYPE "MessageType" AS ENUM (
  'INVITATION', 'REMINDER', 'RSVP_CONFIRMATION', 'ENTRY_PASS', 'MANUAL'
);
CREATE TYPE "MessageStatus" AS ENUM (
  'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'RESPONDED', 'FAILED', 'CANCELLED'
);
CREATE TYPE "MessageAttemptStatus" AS ENUM (
  'STARTED', 'ACCEPTED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'AMBIGUOUS'
);
CREATE TYPE "MessagingFailureClass" AS ENUM ('TRANSIENT', 'PERMANENT', 'AMBIGUOUS');
CREATE TYPE "WebhookEventStatus" AS ENUM (
  'RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED'
);
CREATE TYPE "IdempotencyRecordStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- Needed by composite event-boundary references from messages.
CREATE UNIQUE INDEX "invitation_snapshots_id_event_key"
  ON "invitation_content_snapshots"("id", "event_id");

CREATE TABLE "send_batches" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "status" "SendBatchStatus" NOT NULL DEFAULT 'QUEUED',
  "message_type" "MessageType" NOT NULL DEFAULT 'INVITATION',
  "request_hash" CHAR(64) NOT NULL,
  "selection_hash" CHAR(64) NOT NULL,
  "confirmation_hash" CHAR(64) NOT NULL,
  "total_messages" INTEGER NOT NULL,
  "estimated_credit_units" INTEGER NOT NULL,
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatch_started_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "send_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "send_batch_id" UUID NOT NULL,
  "invitation_group_id" UUID NOT NULL,
  "content_snapshot_id" UUID NOT NULL,
  "predecessor_message_id" UUID,
  "provider" VARCHAR(64) NOT NULL DEFAULT 'META_WHATSAPP',
  "provider_message_id" VARCHAR(255),
  "message_type" "MessageType" NOT NULL DEFAULT 'INVITATION',
  "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
  "recipient_phone_e164" VARCHAR(32) NOT NULL,
  "provider_template_name" VARCHAR(255) NOT NULL,
  "template_id" UUID NOT NULL,
  "template_version" INTEGER NOT NULL,
  "locale" "UserLocale" NOT NULL,
  "template_variables" JSONB NOT NULL,
  "template_parameter_order" JSONB NOT NULL,
  "rendered_content" JSONB NOT NULL,
  "source_hash" CHAR(64) NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "credit_units" INTEGER NOT NULL DEFAULT 1,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "provider_state_at" TIMESTAMP(3),
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sending_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "responded_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "failure_class" "MessagingFailureClass",
  "failure_code" VARCHAR(100),
  "failure_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "message_attempts" (
  "id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "MessageAttemptStatus" NOT NULL DEFAULT 'STARTED',
  "request_fingerprint" CHAR(64) NOT NULL,
  "provider_message_id" VARCHAR(255),
  "provider_http_status" INTEGER,
  "failure_class" "MessagingFailureClass",
  "failure_code" VARCHAR(100),
  "failure_reason" VARCHAR(500),
  "retry_after_milliseconds" INTEGER,
  "response_metadata" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL,
  "event_id" UUID,
  "message_id" UUID,
  "provider" VARCHAR(64) NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "occurred_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queued_at" TIMESTAMP(3),
  "processing_started_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "processing_error" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "send_batch_id" UUID,
  "operation" VARCHAR(100) NOT NULL,
  "key_hash" CHAR(64) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "status" "IdempotencyRecordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "response_status" INTEGER,
  "response_body" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "send_batches_id_event_key" ON "send_batches"("id", "event_id");
CREATE INDEX "send_batches_event_created_id_idx" ON "send_batches"("event_id", "created_at" DESC, "id");
CREATE INDEX "send_batches_status_queued_idx" ON "send_batches"("status", "queued_at");

CREATE UNIQUE INDEX "messages_id_event_key" ON "messages"("id", "event_id");
CREATE UNIQUE INDEX "messages_batch_invitation_key" ON "messages"("send_batch_id", "invitation_group_id");
CREATE UNIQUE INDEX "messages_provider_message_key" ON "messages"("provider", "provider_message_id");
CREATE UNIQUE INDEX "messages_predecessor_key" ON "messages"("predecessor_message_id");
CREATE UNIQUE INDEX "messages_one_initial_invitation_idx"
  ON "messages"("event_id", "invitation_group_id")
  WHERE "message_type" = 'INVITATION' AND "predecessor_message_id" IS NULL;
CREATE INDEX "messages_event_status_created_id_idx" ON "messages"("event_id", "status", "created_at" DESC, "id");
CREATE INDEX "messages_batch_status_id_idx" ON "messages"("send_batch_id", "status", "id");
CREATE INDEX "messages_invitation_type_created_idx" ON "messages"("invitation_group_id", "message_type", "created_at" DESC);

CREATE UNIQUE INDEX "message_attempts_message_number_key" ON "message_attempts"("message_id", "attempt_number");
CREATE INDEX "message_attempts_status_started_idx" ON "message_attempts"("status", "started_at");

CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events"("provider", "provider_event_id");
CREATE INDEX "webhook_events_status_received_idx" ON "webhook_events"("status", "received_at");
CREATE INDEX "webhook_events_message_occurred_idx" ON "webhook_events"("message_id", "occurred_at");

CREATE UNIQUE INDEX "idempotency_event_operation_key" ON "idempotency_records"("event_id", "operation", "key_hash");
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records"("expires_at");
CREATE INDEX "idempotency_records_batch_idx" ON "idempotency_records"("send_batch_id");

ALTER TABLE "send_batches" ADD CONSTRAINT "send_batches_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "send_batches" ADD CONSTRAINT "send_batches_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_send_batch_id_event_id_fkey"
  FOREIGN KEY ("send_batch_id", "event_id") REFERENCES "send_batches"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_invitation_group_id_event_id_fkey"
  FOREIGN KEY ("invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_content_snapshot_id_event_id_fkey"
  FOREIGN KEY ("content_snapshot_id", "event_id") REFERENCES "invitation_content_snapshots"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_predecessor_message_id_event_id_fkey"
  FOREIGN KEY ("predecessor_message_id", "event_id") REFERENCES "messages"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "message_attempts" ADD CONSTRAINT "message_attempts_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_send_batch_id_event_id_fkey"
  FOREIGN KEY ("send_batch_id", "event_id") REFERENCES "send_batches"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "send_batches"
  ADD CONSTRAINT "send_batches_hashes_valid" CHECK (
    "request_hash" ~ '^[0-9a-f]{64}$'
    AND "selection_hash" ~ '^[0-9a-f]{64}$'
    AND "confirmation_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "send_batches_counts_valid" CHECK (
    "total_messages" > 0
    AND "estimated_credit_units" = "total_messages"
  ),
  ADD CONSTRAINT "send_batches_timestamps_valid" CHECK (
    ("status" <> 'DISPATCHING' OR "dispatch_started_at" IS NOT NULL)
    AND ("status" <> 'IN_PROGRESS' OR "started_at" IS NOT NULL)
    AND ("status" NOT IN ('COMPLETED', 'PARTIALLY_FAILED', 'FAILED') OR "completed_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
  );

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_phone_e164_format" CHECK ("recipient_phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "messages_template_valid" CHECK (
    char_length(btrim("provider")) > 0
    AND char_length(btrim("provider_template_name")) > 0
    AND "template_version" > 0
  ),
  ADD CONSTRAINT "messages_document_shapes_valid" CHECK (
    jsonb_typeof("template_variables") = 'object'
    AND jsonb_typeof("template_parameter_order") = 'array'
    AND jsonb_typeof("rendered_content") = 'object'
  ),
  ADD CONSTRAINT "messages_hashes_valid" CHECK (
    "source_hash" ~ '^[0-9a-f]{64}$' AND "content_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "messages_units_attempts_valid" CHECK ("credit_units" = 1 AND "attempt_count" >= 0),
  ADD CONSTRAINT "messages_failure_metadata_valid" CHECK (
    ("status" <> 'FAILED' OR ("failed_at" IS NOT NULL AND "failure_class" IS NOT NULL AND "failure_code" IS NOT NULL))
    AND (("failure_class" IS NULL AND "failure_code" IS NULL AND "failure_reason" IS NULL)
      OR ("failure_class" IS NOT NULL AND "failure_code" IS NOT NULL))
  );

ALTER TABLE "message_attempts"
  ADD CONSTRAINT "message_attempts_number_valid" CHECK ("attempt_number" > 0),
  ADD CONSTRAINT "message_attempts_fingerprint_valid" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "message_attempts_retry_after_valid" CHECK (
    "retry_after_milliseconds" IS NULL OR "retry_after_milliseconds" BETWEEN 1 AND 900000
  ),
  ADD CONSTRAINT "message_attempts_response_metadata_object" CHECK (
    "response_metadata" IS NULL OR jsonb_typeof("response_metadata") = 'object'
  ),
  ADD CONSTRAINT "message_attempts_completion_valid" CHECK (
    ("status" = 'STARTED' AND "completed_at" IS NULL)
    OR ("status" <> 'STARTED' AND "completed_at" IS NOT NULL)
  );

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_identity_valid" CHECK (
    char_length(btrim("provider")) > 0
    AND char_length(btrim("provider_event_id")) > 0
    AND char_length(btrim("event_type")) > 0
    AND "payload_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "webhook_events_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
  ADD CONSTRAINT "webhook_events_processing_valid" CHECK (
    ("status" <> 'QUEUED' OR "queued_at" IS NOT NULL)
    AND ("status" <> 'PROCESSING' OR "processing_started_at" IS NOT NULL)
    AND ("status" NOT IN ('PROCESSED', 'IGNORED', 'FAILED') OR "processed_at" IS NOT NULL)
    AND ("status" <> 'FAILED' OR "processing_error" IS NOT NULL)
  );

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_hashes_valid" CHECK (
    "key_hash" ~ '^[0-9a-f]{64}$' AND "request_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "idempotency_records_expiry_valid" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "idempotency_records_completion_valid" CHECK (
    ("status" = 'IN_PROGRESS' AND "completed_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "response_status" IS NOT NULL AND "response_body" IS NOT NULL)
  );

-- Only the operational delivery state may change after creation. Recipient,
-- template, snapshot, content, batch, and logical credit identity are immutable.
CREATE OR REPLACE FUNCTION "protect_message_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."event_id", NEW."send_batch_id", NEW."invitation_group_id",
    NEW."content_snapshot_id", NEW."predecessor_message_id", NEW."provider",
    NEW."message_type", NEW."recipient_phone_e164", NEW."provider_template_name",
    NEW."template_id", NEW."template_version", NEW."locale",
    NEW."template_variables", NEW."template_parameter_order",
    NEW."rendered_content", NEW."source_hash", NEW."content_hash", NEW."credit_units"
  ) IS DISTINCT FROM ROW(
    OLD."event_id", OLD."send_batch_id", OLD."invitation_group_id",
    OLD."content_snapshot_id", OLD."predecessor_message_id", OLD."provider",
    OLD."message_type", OLD."recipient_phone_e164", OLD."provider_template_name",
    OLD."template_id", OLD."template_version", OLD."locale",
    OLD."template_variables", OLD."template_parameter_order",
    OLD."rendered_content", OLD."source_hash", OLD."content_hash", OLD."credit_units"
  ) THEN
    RAISE EXCEPTION 'Logical message content and accounting identity are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'message_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "message_identity_immutable"
BEFORE UPDATE ON "messages"
FOR EACH ROW EXECUTE FUNCTION "protect_message_identity"();

-- The database independently proves that every logical message is a faithful
-- copy of one approved Stage 5 snapshot and its event-local invitation.
CREATE OR REPLACE FUNCTION "assert_message_snapshot_source"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_row RECORD;
  invitation_phone VARCHAR(32);
  template_provider VARCHAR(64);
  template_provider_name VARCHAR(255);
  template_status "TemplateStatus";
  template_variables JSONB;
BEGIN
  SELECT s."invitation_group_id", s."template_id", s."template_version", s."locale",
         s."variables", s."rendered_content", s."source_hash", s."content_hash",
         t."provider", t."provider_template_name", t."status", t."variable_schema"
    INTO snapshot_row
    FROM "invitation_content_snapshots" s
    JOIN "invitation_templates" t
      ON t."id" = s."template_id" AND t."event_id" = s."event_id"
    WHERE s."id" = NEW."content_snapshot_id" AND s."event_id" = NEW."event_id";

  IF NOT FOUND OR snapshot_row."status" <> 'APPROVED'
     OR snapshot_row."provider_template_name" IS NULL THEN
    RAISE EXCEPTION 'Messages require a configured approved template snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'message_approved_snapshot_required';
  END IF;

  SELECT "phone_e164" INTO invitation_phone
    FROM "invitation_groups"
    WHERE "id" = NEW."invitation_group_id" AND "event_id" = NEW."event_id"
      AND "cancelled_at" IS NULL;

  IF NOT FOUND
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
    RAISE EXCEPTION 'Message fields must match the immutable event-local snapshot'
      USING ERRCODE = '23514', CONSTRAINT = 'message_snapshot_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "message_snapshot_source_valid"
BEFORE INSERT ON "messages"
FOR EACH ROW EXECUTE FUNCTION "assert_message_snapshot_source"();

CREATE OR REPLACE FUNCTION "protect_send_batch_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."event_id", NEW."created_by", NEW."message_type", NEW."request_hash",
    NEW."selection_hash", NEW."confirmation_hash", NEW."total_messages",
    NEW."estimated_credit_units", NEW."queued_at"
  ) IS DISTINCT FROM ROW(
    OLD."event_id", OLD."created_by", OLD."message_type", OLD."request_hash",
    OLD."selection_hash", OLD."confirmation_hash", OLD."total_messages",
    OLD."estimated_credit_units", OLD."queued_at"
  ) THEN
    RAISE EXCEPTION 'Send batch request and estimate are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'send_batch_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "send_batch_identity_immutable"
BEFORE UPDATE ON "send_batches"
FOR EACH ROW EXECUTE FUNCTION "protect_send_batch_identity"();

CREATE OR REPLACE FUNCTION "protect_message_attempt_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."message_id", NEW."attempt_number", NEW."request_fingerprint", NEW."started_at")
     IS DISTINCT FROM
     ROW(OLD."message_id", OLD."attempt_number", OLD."request_fingerprint", OLD."started_at")
  THEN
    RAISE EXCEPTION 'Message attempt identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'message_attempt_identity_immutable';
  END IF;
  IF OLD."status" <> 'STARTED' THEN
    RAISE EXCEPTION 'Completed message attempts are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'message_attempt_completed_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "message_attempt_identity_immutable"
BEFORE UPDATE ON "message_attempts"
FOR EACH ROW EXECUTE FUNCTION "protect_message_attempt_identity"();

CREATE OR REPLACE FUNCTION "protect_webhook_evidence"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."provider", NEW."provider_event_id", NEW."event_type", NEW."payload", NEW."payload_hash", NEW."occurred_at", NEW."received_at")
     IS DISTINCT FROM
     ROW(OLD."provider", OLD."provider_event_id", OLD."event_type", OLD."payload", OLD."payload_hash", OLD."occurred_at", OLD."received_at")
  THEN
    RAISE EXCEPTION 'Webhook identity and payload evidence are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'webhook_evidence_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "webhook_evidence_immutable"
BEFORE UPDATE ON "webhook_events"
FOR EACH ROW EXECUTE FUNCTION "protect_webhook_evidence"();
