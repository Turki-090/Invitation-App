-- Stage 5 private assets, reviewable imports, versioned invitation templates,
-- and immutable invitation-content snapshots.

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMPORT_SOURCE', 'EVENT_IMAGE', 'INVITATION_ASSET', 'GENERATED_FILE');

-- CreateEnum
CREATE TYPE "StoredAssetStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'READY', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "ImportFileFormat" AS ENUM ('XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'PARSING', 'AWAITING_MAPPING', 'VALIDATING', 'REVIEWING', 'READY', 'IMPORTING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('UNMAPPED', 'VALID', 'INVALID', 'DUPLICATE', 'SKIPPED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ImportDuplicateResolution" AS ENUM ('SKIP', 'IMPORT_AS_NEW', 'UPDATE_EXISTING');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "stored_assets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "StoredAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storage_provider" VARCHAR(64) NOT NULL,
    "bucket" VARCHAR(128) NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255),
    "byte_size" INTEGER,
    "sha256" CHAR(64),
    "image_width" INTEGER,
    "image_height" INTEGER,
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "quarantined_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "source_asset_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "cancelled_by" UUID,
    "file_format" "ImportFileFormat" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "selected_worksheet" VARCHAR(255),
    "available_worksheets" JSONB NOT NULL DEFAULT '[]',
    "detected_headers" JSONB NOT NULL DEFAULT '[]',
    "suggested_mapping" JSONB,
    "column_mapping" JSONB,
    "csv_delimiter" VARCHAR(1),
    "detected_encoding" VARCHAR(64),
    "parser_version" VARCHAR(64),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMP(3),
    "parsing_started_at" TIMESTAMP(3),
    "parsed_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "reviewing_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "import_started_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "failure_code" VARCHAR(80),
    "failure_message" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "source_data" JSONB NOT NULL,
    "corrected_data" JSONB,
    "display_name" VARCHAR(160),
    "contact_name" VARCHAR(120),
    "phone_input" VARCHAR(40),
    "phone_country" CHAR(2),
    "phone_e164" VARCHAR(16),
    "invitation_type" "InvitationType",
    "max_companions" INTEGER,
    "members" JSONB NOT NULL DEFAULT '[]',
    "internal_note" VARCHAR(1000),
    "status" "ImportRowStatus" NOT NULL DEFAULT 'UNMAPPED',
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "validation_warnings" JSONB NOT NULL DEFAULT '[]',
    "normalized_hash" CHAR(64),
    "duplicate_resolution" "ImportDuplicateResolution",
    "duplicate_of_row_id" UUID,
    "duplicate_invitation_group_id" UUID,
    "imported_invitation_group_id" UUID,
    "corrected_by" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "validated_at" TIMESTAMP(3),
    "corrected_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_templates" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "asset_id" UUID,
    "created_by" UUID NOT NULL,
    "template_key" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" "UserLocale" NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "display_name" VARCHAR(120) NOT NULL,
    "provider" VARCHAR(64) NOT NULL DEFAULT 'META_WHATSAPP',
    "provider_template_name" VARCHAR(255),
    "body_template" TEXT NOT NULL,
    "extra_message_template" TEXT,
    "variable_schema" JSONB NOT NULL DEFAULT '[]',
    "interactive_components" JSONB NOT NULL DEFAULT '[]',
    "content_hash" CHAR(64) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_content_snapshots" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "invitation_group_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "locale" "UserLocale" NOT NULL,
    "asset_id" UUID,
    "created_by" UUID NOT NULL,
    "variables" JSONB NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "rendered_extra_message" TEXT,
    "rendered_content" JSONB NOT NULL,
    "readiness_result" JSONB NOT NULL,
    "is_ready" BOOLEAN NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "asset_sha256" CHAR(64),
    "asset_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_content_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_assets_event_kind_status_created_id_idx" ON "stored_assets"("event_id", "kind", "status", "created_at" DESC, "id");
CREATE INDEX "stored_assets_status_expires_idx" ON "stored_assets"("status", "expires_at");
CREATE UNIQUE INDEX "stored_assets_id_event_key" ON "stored_assets"("id", "event_id");
CREATE UNIQUE INDEX "stored_assets_object_key" ON "stored_assets"("storage_provider", "bucket", "object_key");

CREATE INDEX "import_jobs_event_status_created_id_idx" ON "import_jobs"("event_id", "status", "created_at" DESC, "id");
CREATE INDEX "import_jobs_creator_created_idx" ON "import_jobs"("created_by", "created_at" DESC);
CREATE UNIQUE INDEX "import_jobs_id_event_key" ON "import_jobs"("id", "event_id");
CREATE UNIQUE INDEX "import_jobs_source_asset_key" ON "import_jobs"("source_asset_id", "event_id");

CREATE INDEX "import_rows_job_status_source_row_idx" ON "import_rows"("import_job_id", "status", "source_row_number");
CREATE INDEX "import_rows_job_normalized_hash_idx" ON "import_rows"("import_job_id", "normalized_hash");
CREATE INDEX "import_rows_event_phone_idx" ON "import_rows"("event_id", "phone_e164");
CREATE INDEX "import_rows_duplicate_invitation_idx" ON "import_rows"("duplicate_invitation_group_id");
CREATE UNIQUE INDEX "import_rows_id_job_key" ON "import_rows"("id", "import_job_id");
CREATE UNIQUE INDEX "import_rows_source_row_key" ON "import_rows"("import_job_id", "source_row_number");
CREATE UNIQUE INDEX "import_rows_imported_invitation_key" ON "import_rows"("imported_invitation_group_id", "event_id");

CREATE INDEX "invitation_templates_event_locale_status_created_id_idx" ON "invitation_templates"("event_id", "locale", "status", "created_at" DESC, "id");
CREATE UNIQUE INDEX "invitation_templates_id_event_key" ON "invitation_templates"("id", "event_id");
CREATE UNIQUE INDEX "invitation_template_snapshot_ref_key" ON "invitation_templates"("id", "event_id", "version", "locale");
CREATE UNIQUE INDEX "invitation_template_version_key" ON "invitation_templates"("event_id", "template_key", "locale", "version");

CREATE INDEX "invitation_snapshots_event_ready_created_id_idx" ON "invitation_content_snapshots"("event_id", "is_ready", "created_at" DESC, "id");
CREATE INDEX "invitation_snapshots_template_created_id_idx" ON "invitation_content_snapshots"("template_id", "created_at" DESC, "id");
CREATE UNIQUE INDEX "invitation_snapshots_content_key" ON "invitation_content_snapshots"("invitation_group_id", "content_hash");
CREATE UNIQUE INDEX "invitation_snapshots_source_hash_key" ON "invitation_content_snapshots"("invitation_group_id", "source_hash");

-- Composite keys prevent a child row from crossing event boundaries.
CREATE UNIQUE INDEX "invitation_groups_id_event_key" ON "invitation_groups"("id", "event_id");

-- AddForeignKey
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_source_asset_id_event_id_fkey" FOREIGN KEY ("source_asset_id", "event_id") REFERENCES "stored_assets"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_job_id_event_id_fkey" FOREIGN KEY ("import_job_id", "event_id") REFERENCES "import_jobs"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_duplicate_of_row_id_import_job_id_fkey" FOREIGN KEY ("duplicate_of_row_id", "import_job_id") REFERENCES "import_rows"("id", "import_job_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_duplicate_invitation_group_id_event_id_fkey" FOREIGN KEY ("duplicate_invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_imported_invitation_group_id_event_id_fkey" FOREIGN KEY ("imported_invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitation_templates" ADD CONSTRAINT "invitation_templates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_templates" ADD CONSTRAINT "invitation_templates_asset_id_event_id_fkey" FOREIGN KEY ("asset_id", "event_id") REFERENCES "stored_assets"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_templates" ADD CONSTRAINT "invitation_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitation_content_snapshots" ADD CONSTRAINT "invitation_content_snapshots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_content_snapshots" ADD CONSTRAINT "invitation_content_snapshots_invitation_group_id_event_id_fkey" FOREIGN KEY ("invitation_group_id", "event_id") REFERENCES "invitation_groups"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_content_snapshots" ADD CONSTRAINT "invitation_content_snapshots_template_id_event_id_template_fkey" FOREIGN KEY ("template_id", "event_id", "template_version", "locale") REFERENCES "invitation_templates"("id", "event_id", "version", "locale") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "invitation_content_snapshots" ADD CONSTRAINT "invitation_content_snapshots_asset_id_event_id_fkey" FOREIGN KEY ("asset_id", "event_id") REFERENCES "stored_assets"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_content_snapshots" ADD CONSTRAINT "invitation_content_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Storage safety. Stage 5 stores only private objects; public delivery must use
-- short-lived application access rather than a public bucket/object flag.
ALTER TABLE "stored_assets"
  ADD CONSTRAINT "stored_assets_private" CHECK ("is_private"),
  ADD CONSTRAINT "stored_assets_storage_provider_nonempty"
    CHECK (char_length(btrim("storage_provider")) > 0),
  ADD CONSTRAINT "stored_assets_bucket_nonempty"
    CHECK (char_length(btrim("bucket")) > 0),
  ADD CONSTRAINT "stored_assets_object_key_safe"
    CHECK (
      "object_key" = btrim("object_key")
      AND char_length("object_key") > 0
      AND left("object_key", 1) <> '/'
      AND position(chr(92) IN "object_key") = 0
      AND "object_key" !~ '(^|/)\.\.(/|$)'
      AND "object_key" !~ '[[:cntrl:]]'
    ),
  ADD CONSTRAINT "stored_assets_filename_safe"
    CHECK (
      "original_filename" = btrim("original_filename")
      AND char_length("original_filename") > 0
      AND position('/' IN "original_filename") = 0
      AND position(chr(92) IN "original_filename") = 0
      AND "original_filename" !~ '[[:cntrl:]]'
    ),
  ADD CONSTRAINT "stored_assets_content_type_valid"
    CHECK (
      "content_type" IS NULL
      OR (
        "content_type" = btrim("content_type")
        AND char_length("content_type") > 0
        AND "content_type" !~ '[[:cntrl:]]'
      )
    ),
  ADD CONSTRAINT "stored_assets_metadata_object"
    CHECK (jsonb_typeof("metadata") = 'object'),
  ADD CONSTRAINT "stored_assets_byte_size_positive"
    CHECK ("byte_size" IS NULL OR "byte_size" > 0),
  ADD CONSTRAINT "stored_assets_sha256_format"
    CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "stored_assets_image_dimensions_valid"
    CHECK (
      ("image_width" IS NULL AND "image_height" IS NULL)
      OR ("image_width" > 0 AND "image_height" > 0)
    ),
  ADD CONSTRAINT "stored_assets_ready_metadata_complete"
    CHECK (
      "status" <> 'READY'
      OR (
        "content_type" IS NOT NULL
        AND "byte_size" IS NOT NULL
        AND "sha256" IS NOT NULL
        AND "uploaded_at" IS NOT NULL
        AND "validated_at" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "stored_assets_ready_image_dimensions_complete"
    CHECK (
      "status" <> 'READY'
      OR "kind" NOT IN ('EVENT_IMAGE', 'INVITATION_ASSET')
      OR ("image_width" IS NOT NULL AND "image_height" IS NOT NULL)
    ),
  ADD CONSTRAINT "stored_assets_status_timestamps_valid"
    CHECK (
      ("status" NOT IN ('UPLOADED', 'READY') OR "uploaded_at" IS NOT NULL)
      AND ("status" <> 'QUARANTINED' OR "quarantined_at" IS NOT NULL)
      AND ("status" <> 'DELETED' OR "deleted_at" IS NOT NULL)
    ),
  ADD CONSTRAINT "stored_assets_expiry_after_creation"
    CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");

-- Parser state and row counters remain queryable and internally consistent even
-- if a worker crashes between lifecycle transitions.
ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_document_shapes_valid"
    CHECK (
      jsonb_typeof("available_worksheets") = 'array'
      AND jsonb_typeof("detected_headers") = 'array'
      AND ("suggested_mapping" IS NULL OR jsonb_typeof("suggested_mapping") = 'object')
      AND ("column_mapping" IS NULL OR jsonb_typeof("column_mapping") = 'object')
    ),
  ADD CONSTRAINT "import_jobs_revision_positive"
    CHECK ("revision" >= 1),
  ADD CONSTRAINT "import_jobs_row_counts_valid"
    CHECK (
      "total_rows" >= 0
      AND "valid_rows" BETWEEN 0 AND "total_rows"
      AND "invalid_rows" BETWEEN 0 AND "total_rows"
      AND "duplicate_rows" BETWEEN 0 AND "total_rows"
      AND "skipped_rows" BETWEEN 0 AND "total_rows"
      AND "imported_rows" BETWEEN 0 AND "total_rows"
    ),
  ADD CONSTRAINT "import_jobs_format_metadata_valid"
    CHECK (
      ("file_format" <> 'XLSX' OR "csv_delimiter" IS NULL)
      AND ("file_format" <> 'CSV' OR "selected_worksheet" IS NULL)
      AND ("csv_delimiter" IS NULL OR "csv_delimiter" IN (',', ';'))
    ),
  ADD CONSTRAINT "import_jobs_confirmation_metadata_paired"
    CHECK (("confirmed_by" IS NULL) = ("confirmed_at" IS NULL)),
  ADD CONSTRAINT "import_jobs_cancellation_metadata_paired"
    CHECK (("cancelled_by" IS NULL) = ("cancelled_at" IS NULL)),
  ADD CONSTRAINT "import_jobs_terminal_metadata_complete"
    CHECK (
      ("status" <> 'COMPLETED' OR ("confirmed_at" IS NOT NULL AND "completed_at" IS NOT NULL))
      AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
      AND ("status" <> 'FAILED' OR ("failed_at" IS NOT NULL AND "failure_code" IS NOT NULL))
    );

-- Keep original parser output immutable. Corrections are stored separately and
-- normalized columns remain available for deterministic review queries.
ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_source_row_number_valid"
    CHECK ("source_row_number" >= 2),
  ADD CONSTRAINT "import_rows_revision_positive"
    CHECK ("revision" >= 1),
  ADD CONSTRAINT "import_rows_document_shapes_valid"
    CHECK (
      jsonb_typeof("source_data") = 'object'
      AND (
        "corrected_data" IS NULL
        OR (jsonb_typeof("corrected_data") = 'object' AND "corrected_data" <> '{}'::jsonb)
      )
      AND jsonb_typeof("members") = 'array'
      AND jsonb_typeof("validation_errors") = 'array'
      AND jsonb_typeof("validation_warnings") = 'array'
    ),
  ADD CONSTRAINT "import_rows_correction_metadata_paired"
    CHECK (
      ("corrected_data" IS NULL AND "corrected_by" IS NULL AND "corrected_at" IS NULL)
      OR ("corrected_data" IS NOT NULL AND "corrected_by" IS NOT NULL AND "corrected_at" IS NOT NULL)
    ),
  ADD CONSTRAINT "import_rows_phone_e164_format"
    CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "import_rows_phone_country_format"
    CHECK ("phone_country" IS NULL OR "phone_country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "import_rows_normalized_hash_format"
    CHECK ("normalized_hash" IS NULL OR "normalized_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "import_rows_max_companions_valid"
    CHECK ("max_companions" IS NULL OR "max_companions" BETWEEN 0 AND 100),
  ADD CONSTRAINT "import_rows_companions_match_type"
    CHECK (
      "max_companions" IS NULL
      OR "invitation_type" = 'PRIMARY_WITH_COMPANIONS'
      OR "max_companions" = 0
    ),
  ADD CONSTRAINT "import_rows_normalized_state_complete"
    CHECK (
      "status" NOT IN ('VALID', 'DUPLICATE', 'SKIPPED', 'IMPORTED')
      OR (
        "display_name" IS NOT NULL
        AND char_length(btrim("display_name")) > 0
        AND "contact_name" IS NOT NULL
        AND char_length(btrim("contact_name")) > 0
        AND "phone_e164" IS NOT NULL
        AND "phone_country" IS NOT NULL
        AND "invitation_type" IS NOT NULL
        AND "max_companions" IS NOT NULL
        AND jsonb_array_length("members") > 0
        AND "normalized_hash" IS NOT NULL
        AND "validated_at" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "import_rows_invalid_state_has_errors"
    CHECK ("status" <> 'INVALID' OR jsonb_array_length("validation_errors") > 0),
  ADD CONSTRAINT "import_rows_duplicate_state_has_target"
    CHECK (
      "status" NOT IN ('DUPLICATE', 'SKIPPED')
      OR "duplicate_of_row_id" IS NOT NULL
      OR "duplicate_invitation_group_id" IS NOT NULL
    ),
  ADD CONSTRAINT "import_rows_duplicate_not_self"
    CHECK ("duplicate_of_row_id" IS NULL OR "duplicate_of_row_id" <> "id"),
  ADD CONSTRAINT "import_rows_skipped_state_complete"
    CHECK (
      ("status" = 'SKIPPED')
      = ("skipped_at" IS NOT NULL AND "duplicate_resolution" = 'SKIP')
    ),
  ADD CONSTRAINT "import_rows_imported_state_complete"
    CHECK (
      ("status" = 'IMPORTED')
      = ("imported_at" IS NOT NULL AND "imported_invitation_group_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "import_rows_resolution_matches_terminal_state"
    CHECK (
      "duplicate_resolution" IS NULL
      OR ("duplicate_resolution" = 'SKIP' AND "status" = 'SKIPPED')
      OR ("duplicate_resolution" IN ('IMPORT_AS_NEW', 'UPDATE_EXISTING') AND "status" = 'IMPORTED')
    );

ALTER TABLE "invitation_templates"
  ADD CONSTRAINT "invitation_templates_version_positive"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "invitation_templates_identity_nonempty"
    CHECK (
      char_length(btrim("template_key")) > 0
      AND char_length(btrim("display_name")) > 0
      AND char_length(btrim("provider")) > 0
    ),
  ADD CONSTRAINT "invitation_templates_body_valid"
    CHECK (
      char_length(btrim("body_template")) BETWEEN 1 AND 1500
      AND ("extra_message_template" IS NULL OR char_length("extra_message_template") <= 500)
    ),
  ADD CONSTRAINT "invitation_templates_document_shapes_valid"
    CHECK (
      jsonb_typeof("variable_schema") = 'array'
      AND jsonb_typeof("interactive_components") = 'array'
    ),
  ADD CONSTRAINT "invitation_templates_content_hash_format"
    CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "invitation_templates_status_timestamps_valid"
    CHECK (
      ("status" <> 'DRAFT' OR ("approved_at" IS NULL AND "archived_at" IS NULL))
      AND ("status" <> 'APPROVED' OR ("approved_at" IS NOT NULL AND "archived_at" IS NULL))
      AND ("status" <> 'ARCHIVED' OR "archived_at" IS NOT NULL)
      AND (NOT "is_default" OR "status" = 'APPROVED')
    );

-- Prisma cannot express a partial unique index. It ensures each locale has at
-- most one approved default without preventing historical archived versions.
CREATE UNIQUE INDEX "invitation_templates_one_default_per_locale_idx"
  ON "invitation_templates"("event_id", "locale")
  WHERE "is_default";

ALTER TABLE "invitation_content_snapshots"
  ADD CONSTRAINT "invitation_snapshots_template_version_positive"
    CHECK ("template_version" >= 1),
  ADD CONSTRAINT "invitation_snapshots_document_shapes_valid"
    CHECK (
      jsonb_typeof("variables") = 'object'
      AND jsonb_typeof("rendered_content") = 'object'
      AND jsonb_typeof("readiness_result") = 'object'
      AND ("asset_metadata" IS NULL OR jsonb_typeof("asset_metadata") = 'object')
    ),
  ADD CONSTRAINT "invitation_snapshots_rendered_body_nonempty"
    CHECK (char_length(btrim("rendered_body")) > 0),
  ADD CONSTRAINT "invitation_snapshots_hashes_valid"
    CHECK (
      "source_hash" ~ '^[0-9a-f]{64}$'
      AND "content_hash" ~ '^[0-9a-f]{64}$'
      AND ("asset_sha256" IS NULL OR "asset_sha256" ~ '^[0-9a-f]{64}$')
    ),
  ADD CONSTRAINT "invitation_snapshots_asset_digest_paired"
    CHECK (("asset_id" IS NULL) = ("asset_sha256" IS NULL)),
  ADD CONSTRAINT "invitation_snapshots_ready_only"
    CHECK ("is_ready");

-- Storage identities and raw import input are append-only facts. Mutable
-- lifecycle/correction fields remain updateable.
CREATE OR REPLACE FUNCTION "protect_stored_asset_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."event_id", NEW."created_by", NEW."kind", NEW."storage_provider",
    NEW."bucket", NEW."object_key", NEW."original_filename"
  ) IS DISTINCT FROM ROW(
    OLD."event_id", OLD."created_by", OLD."kind", OLD."storage_provider",
    OLD."bucket", OLD."object_key", OLD."original_filename"
  ) THEN
    RAISE EXCEPTION 'Stored asset identity fields are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'stored_asset_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "stored_asset_identity_immutable"
BEFORE UPDATE ON "stored_assets"
FOR EACH ROW
EXECUTE FUNCTION "protect_stored_asset_identity"();

CREATE OR REPLACE FUNCTION "protect_import_job_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."event_id", NEW."source_asset_id", NEW."created_by", NEW."file_format")
     IS DISTINCT FROM
     ROW(OLD."event_id", OLD."source_asset_id", OLD."created_by", OLD."file_format")
  THEN
    RAISE EXCEPTION 'Import job identity fields are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'import_job_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "import_job_identity_immutable"
BEFORE UPDATE ON "import_jobs"
FOR EACH ROW
EXECUTE FUNCTION "protect_import_job_identity"();

CREATE OR REPLACE FUNCTION "protect_import_row_source"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."import_job_id", NEW."event_id", NEW."source_row_number", NEW."source_data")
     IS DISTINCT FROM
     ROW(OLD."import_job_id", OLD."event_id", OLD."source_row_number", OLD."source_data")
  THEN
    RAISE EXCEPTION 'Import row source fields are immutable; use corrected_data'
      USING ERRCODE = '23514', CONSTRAINT = 'import_row_source_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "import_row_source_immutable"
BEFORE UPDATE ON "import_rows"
FOR EACH ROW
EXECUTE FUNCTION "protect_import_row_source"();

-- Relations are tenant-safe through composite keys; these triggers additionally
-- prevent an otherwise valid event-local asset from being used for the wrong job.
CREATE OR REPLACE FUNCTION "assert_import_source_asset_kind"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  asset_kind "AssetKind";
BEGIN
  SELECT "kind" INTO asset_kind
    FROM "stored_assets"
    WHERE "id" = NEW."source_asset_id" AND "event_id" = NEW."event_id";
  IF NOT FOUND OR asset_kind <> 'IMPORT_SOURCE' THEN
    RAISE EXCEPTION 'Import jobs require an event-local IMPORT_SOURCE asset'
      USING ERRCODE = '23514', CONSTRAINT = 'import_job_source_asset_kind';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "import_job_source_asset_kind"
BEFORE INSERT OR UPDATE OF "source_asset_id", "event_id" ON "import_jobs"
FOR EACH ROW
EXECUTE FUNCTION "assert_import_source_asset_kind"();

CREATE OR REPLACE FUNCTION "assert_invitation_template_asset_kind"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  asset_kind "AssetKind";
BEGIN
  IF NEW."asset_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "kind" INTO asset_kind
    FROM "stored_assets"
    WHERE "id" = NEW."asset_id" AND "event_id" = NEW."event_id";
  IF NOT FOUND OR asset_kind <> 'INVITATION_ASSET' THEN
    RAISE EXCEPTION 'Invitation templates require an event-local INVITATION_ASSET'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_template_asset_kind';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_template_asset_kind"
BEFORE INSERT OR UPDATE OF "asset_id", "event_id" ON "invitation_templates"
FOR EACH ROW
EXECUTE FUNCTION "assert_invitation_template_asset_kind"();

-- Approved content versions cannot be silently rewritten after hosts have
-- reviewed them. Archiving/default/provider metadata changes remain possible.
CREATE OR REPLACE FUNCTION "protect_invitation_template_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."event_id", NEW."created_by", NEW."template_key", NEW."locale")
     IS DISTINCT FROM
     ROW(OLD."event_id", OLD."created_by", OLD."template_key", OLD."locale")
  THEN
    RAISE EXCEPTION 'Invitation template identity fields are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_template_identity_immutable';
  END IF;

  IF OLD."status" = 'ARCHIVED' AND NEW."status" <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Archived invitation template versions cannot be restored'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_template_status_forward_only';
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" NOT IN ('APPROVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Approved invitation template versions cannot return to draft'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_template_status_forward_only';
  END IF;

  IF OLD."status" IN ('APPROVED', 'ARCHIVED')
     AND ROW(
       NEW."asset_id", NEW."version", NEW."body_template",
       NEW."extra_message_template", NEW."variable_schema",
       NEW."interactive_components", NEW."content_hash", NEW."approved_at"
     ) IS DISTINCT FROM ROW(
       OLD."asset_id", OLD."version", OLD."body_template",
       OLD."extra_message_template", OLD."variable_schema",
       OLD."interactive_components", OLD."content_hash", OLD."approved_at"
     )
  THEN
    RAISE EXCEPTION 'Approved invitation template content is immutable; create a new version'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_template_content_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_template_version_protected"
BEFORE UPDATE ON "invitation_templates"
FOR EACH ROW
EXECUTE FUNCTION "protect_invitation_template_version"();

-- A snapshot can be created only from an approved template version and the exact
-- ready asset reviewed with that template. It is then immutable at the database.
CREATE OR REPLACE FUNCTION "assert_invitation_snapshot_source"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  template_asset_id UUID;
  template_status "TemplateStatus";
  asset_kind "AssetKind";
  asset_status "StoredAssetStatus";
  asset_digest CHAR(64);
BEGIN
  SELECT "asset_id", "status"
    INTO template_asset_id, template_status
    FROM "invitation_templates"
    WHERE "id" = NEW."template_id"
      AND "event_id" = NEW."event_id"
      AND "version" = NEW."template_version"
      AND "locale" = NEW."locale";

  IF NOT FOUND OR template_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Invitation snapshots require an approved template version'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_snapshot_approved_template';
  END IF;

  IF NEW."asset_id" IS DISTINCT FROM template_asset_id THEN
    RAISE EXCEPTION 'Invitation snapshot asset must match its template version'
      USING ERRCODE = '23514', CONSTRAINT = 'invitation_snapshot_asset_matches_template';
  END IF;

  IF NEW."asset_id" IS NOT NULL THEN
    SELECT "kind", "status", "sha256"
      INTO asset_kind, asset_status, asset_digest
      FROM "stored_assets"
      WHERE "id" = NEW."asset_id" AND "event_id" = NEW."event_id";
    IF NOT FOUND
       OR asset_kind <> 'INVITATION_ASSET'
       OR asset_status <> 'READY'
       OR asset_digest IS NULL
       OR asset_digest IS DISTINCT FROM NEW."asset_sha256"
    THEN
      RAISE EXCEPTION 'Invitation snapshot asset must be ready and checksum-matched'
        USING ERRCODE = '23514', CONSTRAINT = 'invitation_snapshot_asset_ready';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitation_snapshot_source_valid"
BEFORE INSERT ON "invitation_content_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "assert_invitation_snapshot_source"();

CREATE OR REPLACE FUNCTION "reject_invitation_snapshot_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Invitation content snapshots are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'invitation_snapshot_immutable';
END;
$$;

CREATE TRIGGER "invitation_snapshot_immutable"
BEFORE UPDATE ON "invitation_content_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "reject_invitation_snapshot_update"();
