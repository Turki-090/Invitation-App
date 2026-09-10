-- Stage 6 hardening: write-once provider correlation, tenant-bound webhook
-- links, and database-enforced delivery lifecycle invariants.

ALTER TABLE "webhook_events"
  DROP CONSTRAINT "webhook_events_message_id_fkey",
  ADD CONSTRAINT "webhook_events_link_pair_valid" CHECK (
    ("message_id" IS NULL AND "event_id" IS NULL)
    OR ("message_id" IS NOT NULL AND "event_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "webhook_events_message_id_event_id_fkey"
    FOREIGN KEY ("message_id", "event_id")
    REFERENCES "messages"("id", "event_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_delivery_state_valid" CHECK (
    ("status" <> 'SENDING' OR ("sending_at" IS NOT NULL AND "attempt_count" > 0))
    AND ("status" NOT IN ('SENT', 'DELIVERED', 'READ', 'RESPONDED') OR "provider_message_id" IS NOT NULL)
    AND ("status" <> 'SENT' OR "sent_at" IS NOT NULL)
    AND ("status" <> 'DELIVERED' OR "delivered_at" IS NOT NULL)
    AND ("status" <> 'READ' OR "read_at" IS NOT NULL)
    AND ("status" <> 'RESPONDED' OR "responded_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
  );

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
  IF OLD."provider_message_id" IS NOT NULL
     AND NEW."provider_message_id" IS DISTINCT FROM OLD."provider_message_id"
  THEN
    RAISE EXCEPTION 'Provider message identity is write-once'
      USING ERRCODE = '23514', CONSTRAINT = 'message_provider_identity_write_once';
  END IF;
  RETURN NEW;
END;
$$;
