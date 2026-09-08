-- Stage 4 invitation aggregate safety and list-query indexes.
-- Phone values are still semantically validated with libphonenumber in the
-- domain/API transaction. These checks only defend the normalized storage form.

ALTER TABLE "invitation_groups"
  ADD CONSTRAINT "invitation_groups_phone_e164_format"
  CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "invitation_groups_phone_country_format"
  CHECK ("phone_country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "invitation_groups_companions_match_type"
  CHECK (
    ("invitation_type" = 'PRIMARY_WITH_COMPANIONS')
    OR "max_companions" = 0
  );

-- Deliberately non-unique: legitimate same-event family contacts are handled by
-- duplicate detection plus an explicit, append-audited host override.
CREATE INDEX "invitation_groups_active_phone_lookup_idx"
  ON "invitation_groups"("event_id", "phone_e164")
  WHERE "cancelled_at" IS NULL;

CREATE INDEX "invitation_groups_event_id_cancelled_at_created_at_id_idx"
  ON "invitation_groups"("event_id", "cancelled_at", "created_at" DESC, "id");

CREATE INDEX "invitation_groups_event_id_invitation_type_cancelled_at_idx"
  ON "invitation_groups"("event_id", "invitation_type", "cancelled_at");

CREATE INDEX "invitation_groups_event_id_cancelled_at_expected_attendees_idx"
  ON "invitation_groups"("event_id", "cancelled_at", "expected_attendees");

CREATE UNIQUE INDEX "guest_members_one_primary_per_invitation_idx"
  ON "guest_members"("invitation_group_id")
  WHERE "is_primary";

CREATE OR REPLACE FUNCTION "assert_invitation_group_structure"(group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  group_type "InvitationType";
  companion_limit INTEGER;
  member_count INTEGER;
  primary_count INTEGER;
BEGIN
  SELECT "invitation_type", "max_companions"
    INTO group_type, companion_limit
    FROM "invitation_groups"
    WHERE "id" = group_id;

  -- Cascading deletion may queue a member trigger after its group is gone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER,
         COUNT(*) FILTER (WHERE "is_primary")::INTEGER
    INTO member_count, primary_count
    FROM "guest_members"
    WHERE "invitation_group_id" = group_id;

  IF group_type = 'SINGLE'
     AND NOT (member_count = 1 AND primary_count = 1 AND companion_limit = 0)
  THEN
    RAISE EXCEPTION 'SINGLE invitation % must have exactly one primary member and no companions', group_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'invitation_group_structure_valid';
  ELSIF group_type = 'NAMED_GROUP'
        AND NOT (member_count >= 1 AND primary_count <= 1 AND companion_limit = 0)
  THEN
    RAISE EXCEPTION 'NAMED_GROUP invitation % must have members, at most one primary, and no companions', group_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'invitation_group_structure_valid';
  ELSIF group_type = 'PRIMARY_WITH_COMPANIONS'
        AND NOT (member_count = 1 AND primary_count = 1 AND companion_limit >= 0)
  THEN
    RAISE EXCEPTION 'PRIMARY_WITH_COMPANIONS invitation % must have exactly one primary member', group_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'invitation_group_structure_valid';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "check_invitation_group_row_structure"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "assert_invitation_group_structure"(NEW."id");
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "check_invitation_member_structure"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_invitation_group_structure"(OLD."invitation_group_id");
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM "assert_invitation_group_structure"(OLD."invitation_group_id");
    IF NEW."invitation_group_id" <> OLD."invitation_group_id" THEN
      PERFORM "assert_invitation_group_structure"(NEW."invitation_group_id");
    END IF;
  ELSE
    PERFORM "assert_invitation_group_structure"(NEW."invitation_group_id");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "invitation_group_structure_after_group_change"
AFTER INSERT OR UPDATE OF "invitation_type", "max_companions"
ON "invitation_groups"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_invitation_group_row_structure"();

CREATE CONSTRAINT TRIGGER "invitation_group_structure_after_member_change"
AFTER INSERT OR UPDATE OR DELETE
ON "guest_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_invitation_member_structure"();

-- Validate pre-existing aggregates before the trigger starts protecting changes.
DO $$
DECLARE
  group_record RECORD;
BEGIN
  FOR group_record IN SELECT "id" FROM "invitation_groups" LOOP
    PERFORM "assert_invitation_group_structure"(group_record."id");
  END LOOP;
END;
$$;
