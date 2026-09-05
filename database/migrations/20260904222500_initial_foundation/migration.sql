-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserLocale" AS ENUM ('ar_SA', 'en');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RSVP_OPEN', 'RSVP_CLOSED', 'EVENT_DAY', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventMembershipRole" AS ENUM ('OWNER', 'CO_HOST', 'CHECK_IN_STAFF');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('SINGLE', 'NAMED_GROUP', 'PRIMARY_WITH_COMPANIONS');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "RsvpSource" AS ENUM ('WHATSAPP', 'GUEST_WEB', 'HOST_MANUAL', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_provider_id" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "phone_e164" TEXT,
    "preferred_locale" "UserLocale" NOT NULL DEFAULT 'ar_SA',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "event_type" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0),
    "timezone" TEXT NOT NULL,
    "venue_name_ar" TEXT NOT NULL,
    "venue_name_en" TEXT,
    "city" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "map_url" TEXT,
    "rsvp_deadline" DATE,
    "allow_rsvp_edits" BOOLEAN NOT NULL DEFAULT true,
    "qr_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_memberships" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "EventMembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "permissions_json" JSONB NOT NULL DEFAULT '[]',
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "event_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_groups" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "phone_country" TEXT NOT NULL,
    "invitation_type" "InvitationType" NOT NULL,
    "max_companions" INTEGER NOT NULL DEFAULT 0,
    "internal_note" TEXT,
    "rsvp_status" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "expected_attendees" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "invitation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_members" (
    "id" UUID NOT NULL,
    "invitation_group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL,
    "invitation_group_id" UUID NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "companion_count" INTEGER NOT NULL DEFAULT 0,
    "source" "RsvpSource" NOT NULL,
    "responded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_members" (
    "id" UUID NOT NULL,
    "rsvp_id" UUID NOT NULL,
    "guest_member_id" UUID NOT NULL,
    "attending" BOOLEAN NOT NULL,

    CONSTRAINT "rsvp_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_invitation_capabilities" (
    "id" UUID NOT NULL,
    "invitation_group_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_invitation_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_history" (
    "id" UUID NOT NULL,
    "invitation_group_id" UUID NOT NULL,
    "previous_status" "RsvpStatus" NOT NULL,
    "new_status" "RsvpStatus" NOT NULL,
    "previous_count" INTEGER NOT NULL,
    "new_count" INTEGER NOT NULL,
    "source" "RsvpSource" NOT NULL,
    "actor_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvp_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "actor_user_id" UUID,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_id_key" ON "users"("auth_provider_id");

-- CreateIndex
CREATE INDEX "events_owner_user_id_idx" ON "events"("owner_user_id");

-- CreateIndex
CREATE INDEX "events_status_event_date_idx" ON "events"("status", "event_date");

-- CreateIndex
CREATE INDEX "event_memberships_user_id_status_idx" ON "event_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_memberships_event_id_user_id_key" ON "event_memberships"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "invitation_groups_event_id_rsvp_status_idx" ON "invitation_groups"("event_id", "rsvp_status");

-- CreateIndex
CREATE INDEX "invitation_groups_event_id_phone_e164_idx" ON "invitation_groups"("event_id", "phone_e164");

-- CreateIndex
CREATE INDEX "invitation_groups_event_id_display_name_idx" ON "invitation_groups"("event_id", "display_name");

-- CreateIndex
CREATE INDEX "guest_members_invitation_group_id_is_primary_idx" ON "guest_members"("invitation_group_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "guest_members_invitation_group_id_position_key" ON "guest_members"("invitation_group_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_invitation_group_id_key" ON "rsvps"("invitation_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_members_guest_member_id_key" ON "rsvp_members"("guest_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_members_rsvp_id_guest_member_id_key" ON "rsvp_members"("rsvp_id", "guest_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_invitation_capabilities_invitation_group_id_key" ON "public_invitation_capabilities"("invitation_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_invitation_capabilities_token_hash_key" ON "public_invitation_capabilities"("token_hash");

-- CreateIndex
CREATE INDEX "rsvp_history_invitation_group_id_created_at_idx" ON "rsvp_history"("invitation_group_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_event_id_created_at_idx" ON "audit_logs"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_memberships" ADD CONSTRAINT "event_memberships_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_memberships" ADD CONSTRAINT "event_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_groups" ADD CONSTRAINT "invitation_groups_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_groups" ADD CONSTRAINT "invitation_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_members" ADD CONSTRAINT "guest_members_invitation_group_id_fkey" FOREIGN KEY ("invitation_group_id") REFERENCES "invitation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_invitation_group_id_fkey" FOREIGN KEY ("invitation_group_id") REFERENCES "invitation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_members" ADD CONSTRAINT "rsvp_members_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_members" ADD CONSTRAINT "rsvp_members_guest_member_id_fkey" FOREIGN KEY ("guest_member_id") REFERENCES "guest_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_invitation_capabilities" ADD CONSTRAINT "public_invitation_capabilities_invitation_group_id_fkey" FOREIGN KEY ("invitation_group_id") REFERENCES "invitation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_history" ADD CONSTRAINT "rsvp_history_invitation_group_id_fkey" FOREIGN KEY ("invitation_group_id") REFERENCES "invitation_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain safety constraints that Prisma cannot fully express in the schema DSL.
ALTER TABLE "invitation_groups" ADD CONSTRAINT "invitation_groups_max_companions_nonnegative" CHECK ("max_companions" >= 0);
ALTER TABLE "invitation_groups" ADD CONSTRAINT "invitation_groups_expected_attendees_nonnegative" CHECK ("expected_attendees" >= 0);
ALTER TABLE "guest_members" ADD CONSTRAINT "guest_members_position_positive" CHECK ("position" >= 1);
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_companion_count_nonnegative" CHECK ("companion_count" >= 0);
ALTER TABLE "rsvp_history" ADD CONSTRAINT "rsvp_history_counts_nonnegative" CHECK ("previous_count" >= 0 AND "new_count" >= 0);
