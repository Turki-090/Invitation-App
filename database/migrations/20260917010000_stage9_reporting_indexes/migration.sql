-- Stage 9 read-path indexes.
--
-- The report, the event-day dashboard and the background export each read one
-- ordered slice of an event. Without these the planner sorts or scans the whole
-- event on every request, which is the difference between a small pilot and a
-- twenty-thousand-guest event.

-- Latest invitation message per invitation group, scoped to one event.
CREATE INDEX "messages_event_type_invitation_latest_idx" ON "messages"("event_id", "message_type", "invitation_group_id", "created_at" DESC, "id" DESC);

-- Logical sends already accepted by the provider, for credit reconciliation.
CREATE INDEX "messages_event_sent_idx" ON "messages"("event_id", "sent_at");

-- RSVP buckets over active invitations only.
CREATE INDEX "invitation_groups_event_active_rsvp_idx" ON "invitation_groups"("event_id", "cancelled_at", "rsvp_status");

-- Ascending keyset pagination used by background exports. The active filter is
-- the index predicate rather than a leading column: PostgreSQL does not treat
-- `IS NULL` as an equality when it decides whether an index can supply an
-- ordering, so a non-partial index still sorts every page.
CREATE INDEX "invitation_groups_event_active_created_asc_idx" ON "invitation_groups"("event_id", "created_at", "id") WHERE "cancelled_at" IS NULL;

-- Duplicate-scan counter on the event-day dashboard.
CREATE INDEX "audit_logs_event_action_idx" ON "audit_logs"("event_id", "action");
