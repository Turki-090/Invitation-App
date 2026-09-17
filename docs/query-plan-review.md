# Stage 9 query-plan review

Status date: 2026-09-17

This review covers the read paths Stage 9 adds or depends on: the event report
aggregation, the event-day check-in dashboard and its manual search, the export
keyset pagination in the worker, and the credit ledger and overview
aggregation. For each query it records the statement, the indexes that exist to
serve it, the plan to expect, the risk at 20,000 invitation groups, and the
`EXPLAIN (ANALYZE, BUFFERS)` command that confirms or refutes the expectation.

Findings are stated plainly. Where an index is missing or a pattern is
inherently linear in the number of rows, this document says so rather than
implying the plan is already good.

The plans in the **Measured** notes were captured on 2026-09-17 against the
local `dawah_test` database seeded with `load/seed/seed-load-fixtures.mjs`
(20,000 invitation groups, 8,000 invitation messages, 5,000 audit rows) after
`ANALYZE`. That fixture holds exactly one event, so `event_id = :event_id`
matches nearly every row of each table and the planner reasonably prefers a
sequential scan in two places. Those are noted as such rather than as index
failures: the same statements choose the index once the predicate is selective,
which is what a real deployment looks like.

## How to reproduce the plans

Seed the load fixtures first, so the tables hold a realistic distribution
rather than a handful of rows:

```powershell
docker compose --profile test up -d --wait postgres-test
pnpm exec prisma migrate deploy --schema database/schema.prisma
node --env-file=.env.test.example --env-file-if-exists=.env.test `
  load/seed/seed-load-fixtures.mjs
```

Then connect and pin the event identifier once:

```powershell
psql "postgresql://dawah_test:dawah_test@localhost:5434/dawah_test"
```

```sql
\set event_id '00000000-0000-4000-8000-000000000902'
ANALYZE;
```

`ANALYZE` matters. A freshly seeded table has no statistics, and every plan
below will be chosen from default estimates until it runs.

The SQL in this document is the shape the Prisma query engine emits, not a
verbatim copy of it. Prisma rewrites relation filters into subqueries, changes
how it expresses `distinct` between versions, and may split an `include` into
several statements. Capture the exact statements before trusting a plan:

```powershell
$env:DEBUG = "prisma:query"
pnpm --filter @dawah/api dev
```

or enable `pg_stat_statements` and read the normalized text out of the view.
Where the emitted text differs from what is written here, the emitted text
wins, and the finding should be re-checked against it.

## 1. Event report aggregation

Source: `apps/api/src/reports/reports.service.ts`, `ReportsService.aggregate`.

The report runs eight statements concurrently inside one transaction at
`RepeatableRead`. Nothing is cached, so every request recomputes all eight.
The transaction isolation is a correctness choice, not a performance one: it
guarantees that the eight results describe the same snapshot.

### 1.1 Active group count and expected attendance

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*), SUM("expected_attendees")
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NULL;
```

Indexes: `invitation_groups_event_id_cancelled_at_expected_attendees_idx` on
`(event_id, cancelled_at, expected_attendees)`, added in
`database/migrations/20260907134500_stage4_invitation_foundation/migration.sql`.

Expected plan: an index-only scan. Every column the statement needs is in the
index and the leading two columns are equality predicates, so the heap should
not be touched once the visibility map is set. Watch the `Heap Fetches` line:
a large value means the table has not been vacuumed since the seed, not that
the index is wrong.

Risk at 20,000 rows: low. The scan still reads one index entry per active
group, so the cost grows linearly with the guest list, but the constant is
small and no sort or heap access is involved.

### 1.2 Cancelled group count

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NOT NULL;
```

Indexes: the same composite index. `cancelled_at IS NOT NULL` is a range over
the non-null portion of the second column, which a btree can serve.

Expected plan: index-only scan over a small part of the event's key range. The
load fixture cancels roughly one group in fifty, so this touches a few hundred
entries.

Risk at 20,000 rows: low.

### 1.3 Named guest count

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM "guest_members" AS m
WHERE m."invitation_group_id" IN (
  SELECT g."id"
  FROM "invitation_groups" AS g
  WHERE g."event_id" = :'event_id'::uuid
    AND g."cancelled_at" IS NULL
);
```

Indexes: `invitation_groups_event_id_cancelled_at_created_at_id_idx` for the
inner set, and `guest_members_invitation_group_id_is_primary_idx` on
`(invitation_group_id, is_primary)` for the probe.

Expected plan: a hash semi-join with a sequential scan of `guest_members` on
the outer side once the member table is large enough, or a nested loop with
20,000 index lookups when the planner believes the inner set is small. Either
shape reads every member row that belongs to the event.

**Finding.** `guest_members` carries no `event_id` column, so counting an
event's named guests always crosses the join. There is no index that can
answer this without visiting one row per member. At around 50,000 members in
the load fixture that is acceptable; it is the statement to watch first if a
single event grows an order of magnitude, and the natural fix is a denormalized
`event_id` on `guest_members` with an index on it, which is a schema change and
therefore out of scope for this review.

### 1.4 RSVP status buckets

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "rsvp_status", COUNT(*)
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NULL
GROUP BY "rsvp_status"
ORDER BY "rsvp_status" ASC;
```

Indexes: `invitation_groups_event_id_rsvp_status_idx` on
`(event_id, rsvp_status)`, from
`database/migrations/20260904222500_initial_foundation/migration.sql`.

Expected plan: the index supplies `event_id` and the grouping column in order,
but it does not contain `cancelled_at`, so the `cancelled_at IS NULL` filter
forces a heap visit for every candidate row. Expect an index scan or bitmap
heap scan followed by `HashAggregate` and a small sort, not an index-only scan.

**Finding, addressed.** The initial-foundation index does not cover
`cancelled_at`, so every report request read the heap page of every active
invitation group for this one bucket count. Stage 9 adds
`invitation_groups_event_active_rsvp_idx` on
`(event_id, cancelled_at, rsvp_status)` in
`database/migrations/20260917010000_stage9_reporting_indexes/migration.sql`,
which makes the bucket count an index-only scan and also serves the check-in
dashboard filter in section 2.1.

**Measured.** `Index Only Scan using invitation_groups_event_active_rsvp_idx`,
19,800 rows, 3.3 ms. `Heap Fetches: 2457` because the fixture was never
vacuumed; a `VACUUM` removes them.

### 1.5 Invitation type buckets

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "invitation_type", COUNT(*)
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NULL
GROUP BY "invitation_type"
ORDER BY "invitation_type" ASC;
```

Indexes: `invitation_groups_event_id_invitation_type_cancelled_at_idx` on
`(event_id, invitation_type, cancelled_at)`.

Expected plan: index-only scan producing rows already ordered by
`invitation_type`, then `GroupAggregate` with no sort. This is the shape 1.4
should have.

Risk at 20,000 rows: low.

### 1.6 Groups that received an initial invitation

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM "messages" AS m
WHERE m."event_id" = :'event_id'::uuid
  AND m."message_type" = 'INVITATION'
  AND m."predecessor_message_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "invitation_groups" AS g
    WHERE g."id" = m."invitation_group_id"
      AND g."event_id" = m."event_id"
      AND g."cancelled_at" IS NULL
  );
```

Indexes: the partial unique index `messages_one_initial_invitation_idx` on
`(event_id, invitation_group_id) WHERE message_type = 'INVITATION' AND
predecessor_message_id IS NULL`, from
`database/migrations/20260909140000_stage6_messaging_foundation/migration.sql`.
Its predicate is exactly the statement's predicate.

Expected plan: an index-only scan of the partial index for the event, then a
semi-join against `invitation_groups` using `invitation_groups_id_event_key`.
Confirm the planner recognises the partial predicate; if it does not, the plan
falls back to `messages_event_status_created_id_idx` with a heap filter, which
reads every message in the event.

Risk at 20,000 rows: low if the partial index is used, moderate if it is not.

### 1.7 Latest invitation message per group

This is the largest statement in the report.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT ON (m."invitation_group_id")
       m."invitation_group_id", m."status", m."created_at", m."id"
FROM "messages" AS m
JOIN "invitation_groups" AS g
  ON g."id" = m."invitation_group_id" AND g."event_id" = m."event_id"
WHERE m."event_id" = :'event_id'::uuid
  AND m."message_type" = 'INVITATION'
  AND g."cancelled_at" IS NULL
ORDER BY m."invitation_group_id" ASC, m."created_at" DESC, m."id" DESC;
```

Indexes: `messages_event_status_created_id_idx` on
`(event_id, status, created_at DESC, id)` and
`messages_invitation_type_created_idx` on
`(invitation_group_id, message_type, created_at DESC)`. Neither leads with
`(event_id, message_type, invitation_group_id)`.

Expected plan: an index scan on `messages_event_status_created_id_idx`
restricted only by its leading `event_id` column, a heap filter for
`message_type`, a join to `invitation_groups`, and then a full sort on
`(invitation_group_id, created_at DESC, id DESC)`. The sort is the dominant
cost and it is a sort of every invitation message in the event.

Two things must be verified rather than assumed.

First, whether the query engine pushes the deduplication into SQL as
`DISTINCT ON` or fetches every row and deduplicates in the engine. If it
deduplicates in the engine, the API receives one row per invitation message,
not one row per group, and the cost is paid in memory and over the wire as well
as in the database. Read the logged statement to settle it.

Second, there is no `LIMIT`. The result set is proportional to the number of
invitation messages for the event, which grows with resends, so it is not
bounded by the 20,000 invitation groups.

**Finding, addressed.** No pre-existing index could supply the required
ordering, so the report sorted every invitation message of the event on each
request. Stage 9 adds `messages_event_type_invitation_latest_idx` on
`(event_id, message_type, invitation_group_id, created_at DESC, id DESC)` in
`database/migrations/20260917010000_stage9_reporting_indexes/migration.sql`,
which lets PostgreSQL produce the `DISTINCT ON` result by an ordered index scan
with no sort. The report now emits this statement as raw SQL, so the
`DISTINCT ON` is pushed into the database and only one row per delivery status
crosses the wire.

**Measured.** With one event in the table the planner prefers a sequential scan
over `messages` plus a quicksort: 8,000 rows, 11.1 ms. Forcing the index
(`SET enable_seqscan = off; SET enable_bitmapscan = off`) produces
`Index Scan using messages_event_type_invitation_latest_idx` feeding `Unique`
with **no Sort node at all**, which is what the index was added for. The
sequential scan is the right choice when the event is the whole table and the
wrong one as soon as it is not, so the index earns its place in a deployment
that holds many events.

### 1.8 Check-in totals

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*), SUM(s."checked_in_count")
FROM "check_in_states" AS s
JOIN "invitation_groups" AS g
  ON g."id" = s."invitation_group_id" AND g."event_id" = s."event_id"
WHERE s."event_id" = :'event_id'::uuid
  AND s."checked_in_count" > 0
  AND g."cancelled_at" IS NULL;
```

Indexes: `check_in_states_event_last_id_idx` on
`(event_id, last_checked_in_at DESC, id)` and the unique
`check_in_states_invitation_event_key` on `(invitation_group_id, event_id)`,
both from
`database/migrations/20260913210000_stage9_operations_foundation/migration.sql`.

Expected plan: an index scan on the leading `event_id` column with
`checked_in_count > 0` and the join applied afterwards. `checked_in_count` is
not in any index, so the heap is read for every check-in state of the event.

Risk at 20,000 rows: moderate. The number of check-in states is bounded by the
number of eligible groups, so this scales with the guest list. An index on
`(event_id, checked_in_count)` would let the filter be applied in the index,
but the sum still has to read `checked_in_count` from somewhere, so the real
gain would come from an `INCLUDE (checked_in_count)` covering index.

## 2. Check-in dashboard and manual search

Source: `apps/api/src/check-ins/check-ins.service.ts`, `CheckInsService.dashboard`
and `CheckInsService.search`.

### 2.1 Dashboard aggregate (raw SQL)

This statement is written as raw SQL in the service, so the text below is
exact except for the parameter.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  COALESCE(SUM(i."expected_attendees"), 0)::int AS "expectedAttendance",
  COALESCE(SUM(COALESCE(s."checked_in_count", 0)), 0)::int AS "checkedInAttendance",
  COUNT(*)::int AS "invitationGroups",
  COUNT(*) FILTER (
    WHERE COALESCE(s."checked_in_count", 0) = i."expected_attendees"
  )::int AS "fullyCheckedInGroups",
  COUNT(*) FILTER (
    WHERE COALESCE(s."checked_in_count", 0) > 0
      AND COALESCE(s."checked_in_count", 0) < i."expected_attendees"
  )::int AS "partiallyCheckedInGroups",
  COUNT(*) FILTER (
    WHERE COALESCE(s."checked_in_count", 0) = 0
  )::int AS "notArrivedGroups"
FROM "invitation_groups" i
LEFT JOIN "check_in_states" s
  ON s."invitation_group_id" = i."id"
  AND s."event_id" = i."event_id"
WHERE i."event_id" = :'event_id'::uuid
  AND i."cancelled_at" IS NULL
  AND i."rsvp_status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
  AND i."expected_attendees" > 0;
```

Indexes: `invitation_groups_event_id_cancelled_at_expected_attendees_idx`
serves `event_id`, `cancelled_at` and the `expected_attendees > 0` range;
`invitation_groups_event_id_rsvp_status_idx` serves the two RSVP statuses; the
unique `check_in_states_invitation_event_key` serves the join.

Expected plan: a bitmap index scan or an index scan on one of the two
invitation-group indexes with the other predicate applied as a heap filter,
then a nested loop into `check_in_states` by unique index while the eligible
set is small, switching to a hash join as it grows. All six aggregates are
computed in one pass over the eligible rows.

Risk at 20,000 rows: this aggregate is inherently linear in the number of
eligible invitation groups, which is about 11,000 in the load fixture. No index
changes that, because every eligible row contributes to the sums. The cost that
can be removed is the heap access: the composite index suggested in 1.4,
`(event_id, cancelled_at, rsvp_status)`, would let the RSVP filter be applied in
the index instead of on the heap. The `expected_attendees` and
`checked_in_count` values still have to be read, so a genuinely index-only plan
would need `(event_id, cancelled_at, rsvp_status) INCLUDE (expected_attendees)`
on `invitation_groups` and `(event_id, invitation_group_id) INCLUDE
(checked_in_count)` on `check_in_states`.

**Related contract ceiling.** `checkInDashboardSchema` in
`packages/api-contract/src/check-ins.ts` types `expectedAttendance`,
`checkedInAttendance` and `remainingAttendance` with the shared
`attendanceSchema`, which is bounded at 200. `CheckInsService.dashboard` parses
its own response with that schema, so an event whose expected attendance
exceeds 200 fails validation and the endpoint answers 500 regardless of how
fast the query is. This is not a plan problem, but it is discovered on the same
read path and it blocks measuring the query through the API at Stage 9 scale.

### 2.2 Duplicate-attempt audit count

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM "audit_logs"
WHERE "event_id" = :'event_id'::uuid
  AND "action" = 'check_in.duplicate_attempt';
```

Indexes: `audit_logs_event_id_created_at_idx` on `(event_id, created_at)`, from
`database/migrations/20260904222500_initial_foundation/migration.sql`. There is
no index on `action`.

Expected plan: an index scan on the leading `event_id` column followed by a
heap filter on `action`. The scan reads one index entry and one heap tuple for
every audit row the event has ever produced.

**Finding, addressed.** The audit log is append-only and every check-in,
export, RSVP edit, invitation change and membership change writes to it.
Counting one action by scanning all of them made the check-in dashboard slower
for the whole event-day duration, in proportion to operational history rather
than to the guest list. Stage 9 adds `audit_logs_event_action_idx` on
`(event_id, action)` in
`database/migrations/20260917010000_stage9_reporting_indexes/migration.sql`, so
the count is an index range read. A partial index on the single duplicate
action would be smaller still and remains an option if audit volume grows.

**Measured.** `Bitmap Index Scan on audit_logs_event_action_idx`, 1,000 of
5,000 audit rows, 0.39 ms. An earlier capture on the same fixture chose
`Index Only Scan` with `Heap Fetches: 0` at 0.14 ms; either plan reads only the
matching action.

### 2.3 Recent arrivals

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "check_in_records"
WHERE "event_id" = :'event_id'::uuid
ORDER BY "created_at" DESC, "id" DESC
LIMIT 50;
```

Indexes: `check_in_records_event_created_id_idx` on
`(event_id, created_at DESC, id)`.

Expected plan: an index scan that stops after 50 entries, with 50 heap
fetches. The index ordering matches the requested ordering exactly.

Risk at 20,000 rows: none. This is the best-served query in Stage 9. Note that
the Prisma `include` of `invitationGroup` and `actor` is resolved in additional
statements over at most 50 identifiers, which is why they are not analysed
separately here.

### 2.4 Manual search

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "display_name", "phone_e164", "rsvp_status", "expected_attendees"
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NULL
  AND "expected_attendees" > 0
  AND "rsvp_status" IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
  AND (
    "display_name" ILIKE '%' || 'Load Guest' || '%'
    OR "contact_name" ILIKE '%' || 'Load Guest' || '%'
    OR "phone_e164" LIKE '%' || '96650000' || '%'
  )
ORDER BY "display_name" ASC, "id" ASC
LIMIT 20;
```

Run it a second time with a term that matches nothing, for example
`'zzzz-no-match'`. The two plans are the interesting comparison.

Indexes: `invitation_groups_event_id_display_name_idx` on
`(event_id, display_name)`. Nothing indexes `contact_name`, and the phone
indexes are useless to an unanchored `LIKE`.

Expected plan: because the requested ordering is `(display_name, id)` inside a
single event, PostgreSQL can walk
`invitation_groups_event_id_display_name_idx` in order and stop as soon as it
has 20 matching rows. With a common term that is fast and misleading. With a
rare term it walks the event's entire key range and fetches the heap tuple of
every row to evaluate the three text predicates, which is a full scan of the
event dressed up as an index scan. The `LIMIT` hides this in the average and
exposes it in the tail, so read `p(99)` rather than the mean.

**Finding.** `ILIKE '%term%'` is unanchored, so no btree index can serve the
predicate. This is a property of the pattern, not a missing index. Three
options, in increasing order of cost to adopt:

1. Accept the scan. At 20,000 rows per event, a filtered scan of one event
   costs a few tens of milliseconds on warm pages, and check-in search is used
   by a handful of staff rather than by every guest. This is a defensible
   choice for the pilot, provided the tail latency is measured rather than
   assumed.
2. Anchor the search. Changing `contains` to `startsWith` on a normalized
   lowercase column lets `(event_id, lower(display_name) text_pattern_ops)`
   serve the predicate directly. It changes product behaviour: a host searching
   for a family name in the middle of a display name stops finding it.
3. Add a trigram index. `CREATE EXTENSION pg_trgm;` then a GIN index on
   `lower(display_name) gin_trgm_ops` and `lower(contact_name) gin_trgm_ops`
   keeps the current substring behaviour and makes the predicate indexable.
   The cost is a new extension, larger indexes, and slower writes on the
   invitation table.

Two further notes on this statement. The ordering and the predicate pull in
opposite directions: any index that serves the predicate stops serving the
`ORDER BY`, so a trigram plan will add a sort of the match set before the
`LIMIT`. And the search term is interpolated into a `LIKE` pattern; confirm
whether the query engine escapes `%` and `_` in the term, because if it does
not, a term of `%` matches every row and turns the page into a full scan of the
event.

## 3. Export keyset pagination

Source: `apps/worker/src/prisma-export-repository.ts`,
`PrismaExportRepository.listRows`. The processor reads pages of 500
(`DEFAULT_PAGE_SIZE` in `apps/worker/src/export-processor.ts`), so a
20,000-row export is 40 pages.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "created_at", "display_name", "contact_name", "phone_e164",
       "invitation_type", "max_companions", "rsvp_status", "expected_attendees"
FROM "invitation_groups"
WHERE "event_id" = :'event_id'::uuid
  AND "cancelled_at" IS NULL
  AND (
    "created_at" > TIMESTAMP '2026-09-01 00:10:00'
    OR ("created_at" = TIMESTAMP '2026-09-01 00:10:00'
        AND "id" > '11111111-0000-4000-8000-000000003000'::uuid)
  )
ORDER BY "created_at" ASC, "id" ASC
LIMIT 500;
```

Run it once with the cursor predicate removed, to see the first page, and once
with a cursor near the end of the fixture, to see the last page. The difference
between the two is the finding.

Indexes: `invitation_groups_event_id_cancelled_at_created_at_id_idx` on
`(event_id, cancelled_at, created_at DESC, id)`, from
`database/migrations/20260907134500_stage4_invitation_foundation/migration.sql`.

Expected plan: the index serves the `event_id` and `cancelled_at` equality
predicates. It does not serve the ordering. The stored order of the trailing
columns is `created_at DESC, id ASC`; scanned backwards that yields
`created_at ASC, id DESC`. The export asks for `created_at ASC, id ASC`, which
is neither the forward nor the reverse traversal, so PostgreSQL cannot use the
index to avoid a sort. Expect an index scan or bitmap heap scan followed by an
explicit `Sort`, and check whether the sort spills by reading the
`Sort Method` line.

**Finding, two parts.**

First, the sort direction, addressed. `created_at` was stored descending in
the only composite index covering the export predicate, while the export reads
ascending, so every one of the 40 pages sorted the rows that survived the
cursor filter. Stage 9 adds `invitation_groups_event_active_created_asc_idx` in
`database/migrations/20260917010000_stage9_reporting_indexes/migration.sql`.

**Measured, and the index definition changed because of it.** The obvious
shape, `(event_id, cancelled_at, created_at, id)`, does not remove the sort:
PostgreSQL does not treat `cancelled_at IS NULL` as an equality when it decides
whether an index can supply an ordering, so even when the scan was forced the
plan kept a `top-N heapsort` over all 19,800 rows (5.6 ms). Moving the filter
into the index predicate — `(event_id, created_at, id) WHERE cancelled_at IS
NULL` — leaves a single leading equality and the ordering follows from the
index. The planner then picks it unprompted: `Index Scan using
invitation_groups_event_active_created_asc_idx`, **no Sort**, 500 rows in
0.15 ms reading 17 buffers instead of 488. The index is partial, which Prisma
cannot express, so it is defined in the migration and noted in the schema
beside the other partial indexes.

Second, the cursor shape. The keyset predicate is written as
`created_at > c OR (created_at = c AND id > i)`, because Prisma cannot express
a row comparison. PostgreSQL cannot turn that `OR` into a single index range;
it will either build a `BitmapOr` of two scans or apply it as a filter after
the range on `created_at`. The equivalent row comparison, `("created_at", "id")

> (c, i)`, is a single index range against a matching ascending index and is
the standard keyset form. Adopting it means issuing the page query through
`$queryRaw`instead of`findMany`, which is a code change and is recorded here
> as a finding rather than performed.

The correctness of the cursor is not in question. The ordering is total,
`assertForwardProgress` in the processor rejects a page that does not advance,
and the load fixture deliberately gives five rows per `created_at` value so the
`id` tiebreaker is exercised on most pages.

Preset filters add predicates to the same statement. `CHECK_IN_LIST` adds
`rsvp_status IN (...) AND expected_attendees > 0`, which is the same combination
discussed in 2.1 and has the same missing composite index. `FINAL_ATTENDANCE`
adds a semi-join to `check_in_states` on `checked_in_count > 0`, which is not
indexed; verify it separately:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT g."id"
FROM "invitation_groups" g
WHERE g."event_id" = :'event_id'::uuid
  AND g."cancelled_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "check_in_states" s
    WHERE s."invitation_group_id" = g."id"
      AND s."event_id" = g."event_id"
      AND s."checked_in_count" > 0
  )
ORDER BY g."created_at" ASC, g."id" ASC
LIMIT 500;
```

Per-page relation loading is separate. Prisma resolves `members`,
`checkInState` and the single most recent `messages` row in additional
statements scoped to the 500 identifiers of the page. The message lookup is
served by `messages_invitation_type_created_idx` on
`(invitation_group_id, message_type, created_at DESC)`, which matches the
`take: 1` ordering exactly. Confirm the shape of the emitted statement, because
a ranked window over all messages of the 500 groups and a per-group lateral
have very different costs at 40 pages.

## 4. Credit ledger and overview aggregation

Source: `apps/api/src/credits/credits.service.ts` for the read endpoints and
`apps/api/src/credits/credit-ledger.service.ts` for the shared position,
reconciliation and reservation queries.

### 4.1 Overview: ledger totals by entry type

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "entry_type", SUM("units")
FROM "credit_ledger_entries"
WHERE "event_id" = :'event_id'::uuid
GROUP BY "entry_type"
ORDER BY "entry_type" ASC;
```

Indexes: `credit_entries_event_created_id_idx` on
`(event_id, created_at DESC, id)` and the unique
`credit_entries_reference_key` on
`(credit_account_id, entry_type, reference_type, reference_id)`, both from
`database/migrations/20260913210000_stage9_operations_foundation/migration.sql`.
Neither contains `units`.

Expected plan: an index scan on `credit_entries_event_created_id_idx` by
`event_id`, a heap fetch for every entry to read `units` and `entry_type`, then
`HashAggregate` and a sort of at most six groups.

**Finding.** The ledger is append-only by database trigger
(`credit_ledger_entries_immutable`), so it only ever grows, and the credit
overview reads all of it on every request. There is no covering index for the
aggregation. `(event_id, entry_type) INCLUDE (units)` would make this an
index-only scan. Beyond that, an event that sends tens of thousands of messages
accumulates one `SEND_USAGE` entry per message, at which point recomputing the
balance on every page view stops being reasonable and a maintained balance
column or rollup table becomes the answer.

### 4.2 Overview: reservations

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "status", "units", "expires_at"
FROM "credit_reservations"
WHERE "event_id" = :'event_id'::uuid
  AND "status" = 'ACTIVE';
```

Indexes: `credit_reservations_event_status_expires_idx` on
`(event_id, status, expires_at)`.

Expected plan: an index range read on `(event_id, status)` with a heap fetch
for `units`.

**Finding.** The status filter is in the query, so the read is bounded by the
reservations that still hold credit rather than by the event's whole send
history; `calculateCreditPosition` then drops any that have expired. Only
`units` comes from the heap, so an `INCLUDE (units)` covering index would
remove even that. Consumed, released and expired reservations are never
deleted, which is deliberate — they are evidence — and they no longer cost
anything to read.

### 4.3 Overview: chargeable message count

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT SUM("credit_units")
FROM "messages"
WHERE "event_id" = :'event_id'::uuid
  AND "sent_at" IS NOT NULL;
```

Indexes: `messages_event_status_created_id_idx` on
`(event_id, status, created_at DESC, id)`. Nothing indexes `sent_at`.

Expected plan: an index scan restricted only by the leading `event_id` column,
or a sequential scan if the event holds most of the table, followed by a heap
filter on `sent_at` and `credit_units`.

**Finding.** This reads every message the event has ever produced, on every
credit overview request. It is the most expensive statement on the credits
path. An index on `(event_id, sent_at)` or a partial index
`(event_id) WHERE "sent_at" IS NOT NULL` removes the heap filter. Separately,
`credit_units > 0` can never be false: `messages_units_attempts_valid` in
`database/migrations/20260909140000_stage6_messaging_foundation/migration.sql`
constrains `credit_units` to exactly 1. The predicate costs a comparison per
row and buys nothing.

**Measured.** `Bitmap Index Scan on messages_event_sent_idx` feeding the
aggregate, 2,000 of 8,000 messages, 0.79 ms.

### 4.4 Ledger page

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "credit_ledger_entries"
WHERE "event_id" = :'event_id'::uuid
ORDER BY "created_at" DESC, "id" DESC
LIMIT 20 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "credit_ledger_entries"
WHERE "event_id" = :'event_id'::uuid
ORDER BY "created_at" DESC, "id" DESC
LIMIT 20 OFFSET 1980;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM "credit_ledger_entries"
WHERE "event_id" = :'event_id'::uuid;
```

Indexes: `credit_entries_event_created_id_idx` matches the ordering exactly.

Expected plan: an ordered index scan. The first page reads 20 index entries.
The deep page reads 2,000 index entries and discards 1,980 of them, which the
`Rows Removed by ...` and `actual rows` lines make obvious. The `COUNT(*)`
issued alongside every page reads the whole event partition.

**Finding.** Offset pagination on an append-only ledger degrades linearly with
page depth, and the total count is recomputed for every page. The ledger is the
one Stage 9 list that has no natural upper bound, so it is the one that should
have used the same keyset cursor the export uses. If the filter `entryType` is
supplied it is applied as a heap filter, because the index does not contain
`entry_type`.

### 4.5 Reservation availability inside the send transaction

`CreditLedgerService.reserveForSendBatch` takes `SELECT ... FOR UPDATE` on the
credit account and then calls `position`, which runs:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT "entry_type", SUM("units")
FROM "credit_ledger_entries"
WHERE "credit_account_id" = '00000000-0000-4000-8000-000000000905'::uuid
GROUP BY "entry_type"
ORDER BY "entry_type" ASC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT SUM("units")
FROM "credit_reservations"
WHERE "credit_account_id" = '00000000-0000-4000-8000-000000000905'::uuid
  AND "status" = 'ACTIVE';
```

Indexes: `credit_entries_reference_key` leads with `credit_account_id` and
contains `entry_type`, so the grouping column is in the index, but `units` is
not. `credit_reservations_reference_key` leads with `credit_account_id`.

Expected plan: index scan with heap fetches, `HashAggregate`.

**Finding.** This aggregation runs while the transaction holds a row lock on
the credit account, so its duration is added directly to the serialization
window of every send launch for that event. Its cost is linear in the ledger.
The identical sum is then computed a second time by the database trigger
`enforce_credit_account_nonnegative`, which runs `BEFORE INSERT` on every
ledger row and sums the whole account, so writing `n` ledger entries costs
`O(n^2)` in total. That is invisible at the 2,000 entries the load fixture
writes and becomes the limiting factor long before it becomes a correctness
problem. It is recorded here because it explains any send-launch latency that
grows over the life of an event rather than with the size of a batch.

## Summary of findings

Five of these findings are addressed by
`database/migrations/20260917010000_stage9_reporting_indexes/migration.sql` and
by the contract fix noted below. The rest are cost characteristics that the load
suite in `load/` is built to measure, so each can be confirmed with a number
before anything is changed. None of them is a correctness defect in the query
results.

| Path                                | Finding                                                                                                                                                   | Status                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Report, RSVP buckets (1.4)          | No index covered `(event_id, cancelled_at, rsvp_status)`; the heap was read per active group                                                              | Fixed: `invitation_groups_event_active_rsvp_idx`                                                 |
| Report, named guests (1.3)          | `guest_members` has no `event_id`, so the count always joins                                                                                              | Open: accept, or denormalize `event_id`                                                          |
| Report, latest message (1.7)        | No index supplied `(invitation_group_id, created_at DESC, id DESC)` within an event; a full sort of the event's messages ran per request, with no `LIMIT` | Fixed: `messages_event_type_invitation_latest_idx`; the unbounded result set stays by design     |
| Dashboard, duplicate attempts (2.2) | `audit_logs` had no index on `action`; counting one action scanned the event's whole audit history                                                        | Fixed: `audit_logs_event_action_idx`                                                             |
| Dashboard aggregate (2.1)           | Inherently linear in eligible groups; heap access is avoidable, the scan is not                                                                           | Open: covering indexes on both sides                                                             |
| Dashboard contract (2.1)            | `attendanceSchema` bounded dashboard attendance at 200, so the endpoint failed above that regardless of plan                                              | Fixed: event-wide totals use an unbounded non-negative schema                                    |
| Manual search (2.4)                 | `ILIKE '%term%'` cannot use a btree index; rare terms scan the whole event                                                                                | Open: accept, anchor the search, or add a pg_trgm GIN index                                      |
| Export keyset (3)                   | The covering index stored `created_at DESC` while the export reads ascending, so every page sorted                                                        | Fixed: `invitation_groups_event_active_created_asc_idx`; the `OR` cursor shape remains open      |
| Credits overview (4.1, 4.3)         | The ledger sum reads the event's whole history per request; the chargeable sum had no supporting index                                                    | Partly fixed: `messages_event_sent_idx`; a covering ledger index or a maintained balance is open |
| Credits reservations (4.2)          | Fetching every reservation and filtering in application code                                                                                              | Fixed in the query: `status = 'ACTIVE'` is a predicate                                           |
| Credits ledger page (4.4)           | Offset paging plus a full count on an unbounded append-only table                                                                                         | Open: keyset cursor                                                                              |
| Credits write path (4.5)            | The non-negative guard sums the whole account on every insert, so building a ledger is quadratic                                                          | Open: maintained balance, or accept with a documented ceiling                                    |
