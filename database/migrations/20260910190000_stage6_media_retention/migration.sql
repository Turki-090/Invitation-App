-- Invitation image bytes remain available for every immutable snapshot. The
-- snapshot-side share lock and asset-side update lock serialize creation with
-- archival; the trigger also protects direct database writers.

CREATE INDEX "invitation_snapshots_asset_event_idx"
  ON "invitation_content_snapshots"("asset_id", "event_id");

CREATE OR REPLACE FUNCTION "lock_invitation_snapshot_asset"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."asset_id" IS NOT NULL THEN
    PERFORM 1
      FROM "stored_assets"
      WHERE "id" = NEW."asset_id" AND "event_id" = NEW."event_id"
      FOR SHARE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_snapshot_asset_retention_lock"
BEFORE INSERT ON "invitation_content_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "lock_invitation_snapshot_asset"();

CREATE OR REPLACE FUNCTION "protect_snapshotted_asset_retention"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW."status" = 'DELETED' OR NEW."deleted_at" IS NOT NULL)
     AND EXISTS (
       SELECT 1
       FROM "invitation_content_snapshots"
       WHERE "asset_id" = NEW."id" AND "event_id" = NEW."event_id"
     )
  THEN
    RAISE EXCEPTION 'Assets referenced by immutable invitation snapshots cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'snapshotted_asset_retained';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "snapshotted_asset_retained"
BEFORE UPDATE OF "status", "deleted_at" ON "stored_assets"
FOR EACH ROW
EXECUTE FUNCTION "protect_snapshotted_asset_retention"();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "stored_assets" sa
    INNER JOIN "invitation_content_snapshots" snapshot
      ON snapshot."asset_id" = sa."id" AND snapshot."event_id" = sa."event_id"
    WHERE sa."status" = 'DELETED' OR sa."deleted_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A deleted asset is already referenced by an immutable invitation snapshot';
  END IF;
END;
$$;
