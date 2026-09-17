# Stage 9 load tests

This directory holds the load-test suite required by Stage 9 of
`docs/production-release-plan.md`: dashboards, 20,000-row exports, concurrent
check-in, send launch, and webhook spikes. The query-plan half of that Stage 9
item is in [`docs/query-plan-review.md`](../docs/query-plan-review.md), and the
operational procedure is in
[`docs/runbooks/load-and-query-plan-testing.md`](../docs/runbooks/load-and-query-plan-testing.md).

```
load/
  fixtures.json                 deterministic identities shared by seed and k6
  seed/seed-load-fixtures.mjs   seeds the 20,000-group load event
  k6/lib/                       shared configuration, requests, ids, invariants
  k6/reports-dashboard.js       sustained report and check-in dashboard reads
  k6/export-20k.js              XLSX and CSV export, end to end with download
  k6/check-in-concurrent.js     contended check-in plus an idempotency replay
  k6/send-launch.js             a burst of send-batch launches
  k6/webhook-spike.js           a spike of provider webhook callbacks
```

Nothing here runs against a deployed environment by default. Every script reads
its target and its credentials from k6 environment variables with local
defaults, and the seed refuses to run against anything but the local
`dawah_test` database.

## Requirements

- k6 0.50 or newer. The scripts use `k6/execution`, scenario-level tags and
  `exec.test.abort`.
- Node.js 22.12 or newer and pnpm 11.19.0, as for the rest of the repository.
- Docker with Compose, for PostgreSQL, Redis and the private object storage.

## One-time setup

Start the disposable test database alongside Redis and object storage. The
`test` profile database keeps its data in tmpfs, which is what makes a clean
reseed cheap.

```powershell
docker compose --profile test up -d --wait postgres-test redis object-storage object-storage-init
```

Apply the schema to the test database and build the API and worker:

```powershell
$env:DATABASE_URL = "postgresql://dawah_test:dawah_test@localhost:5434/dawah_test?schema=public"
pnpm exec prisma migrate deploy --schema database/schema.prisma
pnpm generate
pnpm build
```

Create a private `.env.load` for the API and worker processes. It is a copy of
`.env.example` with two changes: the database points at the test database, and
the deterministic development credential is enabled so k6 can authenticate
without a Supabase project.

```powershell
Copy-Item .env.example .env.load
```

Then edit `.env.load`:

```
DATABASE_URL="postgresql://dawah_test:dawah_test@localhost:5434/dawah_test?schema=public"
DAWAH_DEV_AUTH_BYPASS="true"
```

`.env.load` is covered by the `.env*` rule in `.gitignore` and must never be
committed.

Start the API and the worker in two terminals:

```powershell
node --env-file=.env.load apps/api/dist/main.js
node --env-file=.env.load apps/worker/dist/main.js
```

The API listens on `http://localhost:4000` and the worker on
`http://localhost:4001`, which are the defaults every k6 script assumes.

### Why the seed and the application use different environments

The seed runs with `NODE_ENV=test` and `DAWAH_ENV=test`, because its safety
check is the one from `scripts/run-integration-tests.mjs` and only allows the
local `dawah_test` database under those values. The API runs with
`NODE_ENV=development` and `DAWAH_ENV=local`, because
`validateDevelopmentBypass` in `packages/config` only permits the development
authentication bypass there. Both processes point at the same test database.
That split is deliberate; do not try to collapse it by weakening either check.

## Raise the request throttler before measuring anything

`AppModule` registers a global throttler whose window and ceiling come from
`API_THROTTLE_TTL_SECONDS` and `API_THROTTLE_LIMIT`, defaulting to 120 requests
per minute per client address. Every scenario except the webhook spike sends far
more than that from one address, so a run against the default answers 429 within
seconds; the shared request helper detects this and aborts the run rather than
reporting meaningless latency.

Raise it for the load window in `.env.load` only, never in a deployed
environment:

```
API_THROTTLE_LIMIT="100000"
```

Restart the API after changing it, and record the value in effect in the run
notes: a load result measured with the throttler in the path measures the
throttler.

The webhook endpoint carries `@SkipThrottle()` and needs no change, which is
also why it is the one endpoint a provider can genuinely flood.

## Seed the fixtures

```powershell
node --env-file=.env.test.example --env-file-if-exists=.env.test `
  load/seed/seed-load-fixtures.mjs
```

The seed writes, in one deterministic event:

- 20,000 invitation groups with a realistic mix of invitation types, roughly
  one in fifty cancelled, and about 50,000 named guest members.
- RSVP responses for three quarters of the groups, across accepted, partially
  accepted and declined, with the remainder left pending. Every response
  satisfies the RSVP aggregate trigger, so expected attendance is derived, not
  asserted.
- 8,000 prepared invitation snapshots with one INVITATION message each, of
  which 2,000 are marked sent.
- A further 2,000 prepared groups with no message yet. This is the band
  `send-launch.js` claims slices from.
- 20 large check-in target groups of 60 confirmed attendees each, which is the
  set `check-in-concurrent.js` contends over.
- About 3,000 partial check-in states with matching check-in records, 5,000
  audit entries, and a credit ledger of one purchase and 2,000 send usages.

Expect the seed to take several minutes. It writes through Prisma in
transactions of 500 groups so that the deferred invitation-structure and
RSVP-aggregate constraint triggers fire exactly as they do in production; that
validation, not the inserts, is most of the runtime.

The seed refuses to run twice into the same event. Check-in records and credit
ledger entries are append-only at the database, so the fixture cannot be
rewritten in place. To start over:

```powershell
docker compose --profile test restart postgres-test
pnpm exec prisma migrate deploy --schema database/schema.prisma
```

Sizing is fixed in `load/fixtures.json` so the seed and the k6 scripts always
agree on which row is which. Only the total group count can be raised, with
`LOAD_INVITATION_GROUPS`, and only by extending the unprepared tail.

## Shared environment variables

Every script accepts these. Pass them with `k6 run -e NAME=value`.

| Variable                  | Default                        | Meaning                                                                     |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `BASE_URL`                | `http://127.0.0.1:4000/api/v1` | Versioned API root                                                          |
| `ACCESS_TOKEN`            | `dawah-local-development`      | Bearer token; the development credential works only with the bypass enabled |
| `EVENT_ID`                | the seeded load event          | Event under test                                                            |
| `TEMPLATE_ID`             | the seeded template            | Approved invitation template                                                |
| `RUN_ID`                  | `run1`                         | Namespaces every generated idempotency key                                  |
| `WEBHOOK_APP_SECRET`      | `dawah-local-meta-app-secret`  | Must match `META_WHATSAPP_APP_SECRET`                                       |
| `WEBHOOK_PHONE_NUMBER_ID` | `000000000000000`              | Must match `META_WHATSAPP_PHONE_NUMBER_ID`                                  |

`RUN_ID` matters. Idempotency keys are derived from it so that a replay pass
can rebuild the keys an earlier pass used. Two runs against the same database
with the same `RUN_ID` collide, and the second run replays the first instead of
doing work. Either reseed between runs or pass a new `RUN_ID`.

## Scenarios

### reports-dashboard.js

Sustained virtual users repeatedly reading the event report, the check-in
dashboard and the manual check-in search.

```powershell
k6 run load/k6/reports-dashboard.js
k6 run -e VUS=50 -e DURATION=5m load/k6/reports-dashboard.js
```

| Variable        | Default      | Meaning                                    |
| --------------- | ------------ | ------------------------------------------ |
| `VUS`           | `25`         | Sustained virtual users                    |
| `RAMP`          | `30s`        | Ramp up and ramp down duration             |
| `DURATION`      | `3m`         | Time at full load                          |
| `THINK_TIME_MS` | `1000`       | Pause between iterations                   |
| `SEARCH`        | `true`       | Include the manual search request          |
| `SEARCH_TERM`   | `Load Guest` | Search term; a rare term is the worse case |
| `SEARCH_LIMIT`  | `20`         | Page size                                  |

Thresholds:

- `http_req_duration{endpoint:report}` under 1.5s at p95 and 3s at p99. The
  report recomputes eight aggregates per request inside one repeatable-read
  transaction, including an unbounded read of the latest invitation message per
  group. These are ceilings chosen to catch a collapse into a per-request
  sequential scan, not product service levels. Tighten them once a baseline
  exists.
- `http_req_duration{endpoint:checkin_dashboard}` under 1s at p95. The
  dashboard does strictly less work than the report, so it should sit below it.
  If it does not, section 2.2 of the query-plan review is the first place to
  look.
- `http_req_duration{endpoint:checkin_search}` under 1.5s at p95. Read p99
  rather than the mean: a common search term stops early at the page limit and
  hides the full-scan case.
- `report_invariant_violations` and `dashboard_invariant_violations` must be
  zero, and a breach aborts the run. These check that the returned totals
  reconcile with each other, so a fast but wrong answer still fails.
- `http_req_failed` under 1% and `checks` above 99%.

### export-20k.js

Requests an XLSX and a CSV export of the seeded event, polls each job to a
terminal state, and downloads the signed private file.

```powershell
k6 run load/k6/export-20k.js
k6 run -e FORMATS=CSV -e PRESET=CHECK_IN_LIST load/k6/export-20k.js
```

| Variable           | Default           | Meaning                                        |
| ------------------ | ----------------- | ---------------------------------------------- |
| `FORMATS`          | `XLSX,CSV`        | Comma-separated formats, run one after another |
| `PRESET`           | `FULL_GUEST_LIST` | Export preset                                  |
| `MIN_ROWS`         | `19000`           | Minimum accepted row count                     |
| `POLL_INTERVAL_MS` | `2000`            | Job status poll interval                       |
| `JOB_TIMEOUT_MS`   | `600000`          | Give up on a job after this long               |
| `MAX_DURATION`     | `20m`             | Scenario cap                                   |

The two formats run sequentially because the worker processes the export queue
with a concurrency of one. Queueing them together would measure the second job
waiting for the first.

Thresholds:

- `export_completed` and `export_downloaded` must both be 1. An export that
  does not finish, or finishes and cannot be downloaded, is a failure whatever
  the timings say.
- `export_end_to_end_seconds{format:XLSX}` under 240s and
  `{format:CSV}` under 180s at p95, measured from the request to the terminal
  status. A 20,000-row export is 40 keyset pages of 500 plus serialisation,
  checksumming and an upload to private storage. These ceilings catch a
  collapse into per-row work; they are not a target.
- `http_req_duration{endpoint:export_download}` under 30s. The download reads
  the whole object, verifies its SHA-256 and streams it in one response.
- `checks` must be 1. The checks verify the row count, the byte length against
  the declared size, the content type and the attachment disposition.

`export_queue_wait_seconds` is reported for information: it is the time from
the request until the job first shows `processingAt`, which separates queue
delay from generation cost.

### check-in-concurrent.js

Many virtual users check in against the same 20 invitation groups at once, each
with its own `Idempotency-Key`. A second pass then replays every key the first
pass used.

```powershell
k6 run load/k6/check-in-concurrent.js
k6 run -e RUN_ID=run2 -e VUS=100 -e ITERATIONS=4000 load/k6/check-in-concurrent.js
```

| Variable         | Default | Meaning                                                    |
| ---------------- | ------- | ---------------------------------------------------------- |
| `VUS`            | `50`    | Concurrent scanners per pass                               |
| `ITERATIONS`     | `2000`  | Check-ins per pass                                         |
| `PASS_DURATION`  | `3m`    | Cap on the first pass and the handover point to the replay |
| `TARGETS`        | `20`    | Invitation groups contended over                           |
| `ATTENDEE_COUNT` | `1`     | Attendees per scan                                         |

The default iteration count deliberately exceeds the capacity of the target
set. The seed gives 20 groups 60 confirmed attendees each, so 1,200 single
attendee check-ins fill them and the remaining 800 must come back as
`ALREADY_CHECKED_IN` with no increment. Crossing that boundary under
concurrency is the point of the scenario; a run that never fills a group has
not tested anything interesting.

The replay pass starts at `PASS_DURATION`, so that value must be long enough
for the first pass to finish its iterations. If the first pass is truncated,
the replay sends keys that were never used and records fresh arrivals instead
of replays. The `iterations{pass:first}` threshold detects exactly that, so a
truncated run fails with a threshold that names the cause rather than with a
confusing replay failure.

Thresholds:

- `check_in_invariant_violations` must be zero and aborts the run on the first
  breach. Every response is checked for `checkedInAttendance` above
  `confirmedAttendance`, negative counts, totals that do not reconcile,
  attendance moving backwards, and a duplicate scan that recorded an increment
  or created a record. This is the invariant the scenario exists to defend.
- `check_in_replay_unflagged` must be zero. A replayed key that succeeds must
  come back with `idempotentReplay: true`, or a scanner retry is
  indistinguishable from a new arrival. It does not abort the run, so that a
  truncated first pass is reported beside it rather than instead of it.
- `iterations{pass:first}` must reach `ITERATIONS`. A lower count means the
  first pass ran out of its window and the replay results are void.
- `check_in_first_pass_replays` must be zero. A non-zero value means `RUN_ID`
  collided with an earlier run and the numbers below it mean nothing.
- `check_in_accepted{pass:first}` above 98%. Each check-in is a serializable
  transaction holding a row lock on a contended invitation group, retried at
  most three times. A lower rate means retries are being exhausted, which is a
  real finding, not a script problem; read `check_in_conflicts` by code.
- `check_in_replay_confirmed{pass:replay}` above 99%.
- `http_req_duration{endpoint:check_in}` under 2s at p95 and 5s at p99.

A 409 is a contract answer on this endpoint, so the script tells k6 to treat
200 and 409 as expected statuses. The codes are still counted in
`check_in_conflicts`.

### send-launch.js

A burst of send-batch launches, each one a readiness call followed by a
confirmed launch and an optional replay of the same `Idempotency-Key`.

```powershell
k6 run load/k6/send-launch.js
k6 run -e VUS=40 -e BATCH_SIZE=50 -e SEND_REPLAY=false load/k6/send-launch.js
```

| Variable       | Default              | Meaning                                                |
| -------------- | -------------------- | ------------------------------------------------------ |
| `BATCH_SIZE`   | `20`                 | Invitations per launch                                 |
| `VUS`          | `20`                 | Concurrent launches                                    |
| `LAUNCHES`     | all available slices | Number of launches, capped by the sendable band        |
| `MAX_DURATION` | `5m`                 | Scenario cap                                           |
| `SEND_REPLAY`  | `true`               | Replay each key once and assert the same batch returns |

Each iteration claims its own contiguous slice of the 2,000-group sendable
band, because the database allows at most one initial INVITATION message per
invitation group. With the default batch size that is 100 launches. The
sendable band is consumed by a run, so a second run needs a reseed.

Keep `BILLING_ENABLED=false`, which is the default in `.env.example`. With
billing enabled every launch also reserves credits, and a launch that cannot
reserve them is rejected with `INSUFFICIENT_CREDITS`.

Thresholds:

- `send_batch_accepted` above 99%.
- `send_batch_replay_mismatch` must be zero and aborts the run. A replayed key
  that returns a different batch id means the same invitations were queued
  twice.
- `send_batch_invariant_violations` must be zero and aborts the run: the batch
  must be `QUEUED`, its `totalMessages` must equal the number of ready
  invitations the readiness call reported, and its estimated credit units must
  equal its message count.
- `http_req_duration{endpoint:send_batch}` under 5s at p95 and 10s at p99. A
  launch takes a per-event advisory transaction lock, so concurrent launches
  for one event serialise by design and the ceiling is deliberately loose. The
  useful number from this scenario is launches per second, not the mean.

### webhook-spike.js

A spike of signed Meta delivery-status callbacks, including a share that
repeats an identifier already sent so the deduplication branch is exercised.

```powershell
k6 run load/k6/webhook-spike.js
k6 run -e PEAK_RATE=400 -e SPIKE_DURATION=2m load/k6/webhook-spike.js
```

| Variable             | Default | Meaning                                              |
| -------------------- | ------- | ---------------------------------------------------- |
| `BASE_RATE`          | `20`    | Requests per second before and after the spike       |
| `PEAK_RATE`          | `200`   | Requests per second at the peak                      |
| `SPIKE_DURATION`     | `1m`    | Time at the peak                                     |
| `WARMUP`             | `30s`   | Time at the base rate before the ramp                |
| `RAMP`               | `15s`   | Ramp duration in each direction                      |
| `EVENTS_PER_REQUEST` | `5`     | Status callbacks per request                         |
| `DUPLICATE_PERCENT`  | `20`    | Share of callbacks that repeat an earlier identifier |
| `PRE_ALLOCATED_VUS`  | `50`    | Virtual users allocated up front                     |
| `MAX_VUS`            | `400`   | Ceiling on virtual users                             |

Thresholds:

- `webhook_accepted` above 99% and `http_req_failed` under 1%.
- `http_req_duration` under 500ms at p95 and 1.5s at p99. Ingestion is one bulk
  insert, one selective read, one bulk update and one queue push. It has to
  stay fast enough that the provider does not treat the response as a timeout
  and retry, which would compound the spike.
- `dropped_iterations` under 100. k6 drops an iteration when no virtual user is
  free at the scheduled time. A large count means the API could not absorb the
  arrival rate; raise `MAX_VUS` first to confirm it is the API and not the
  allocation.

`webhook_queued_events` and `webhook_duplicate_events` are reported for
information. Their ratio should track `DUPLICATE_PERCENT` once the run has been
going long enough for repeated identifiers to have been seen.

## Reading a failure

k6 exits non-zero when a threshold is breached and prints every threshold with
a cross beside the ones that failed. Work through them in this order.

1. **The run aborted immediately with a configuration message.** The shared
   request helper aborts on 401, 403, 429 and on no response at all, and the
   message says what to change. A 429 means the throttler section above was
   skipped.
2. **An invariant counter is non-zero.** These abort the run on the first
   breach so the database is left in the state that produced it. The console
   line above the abort names the exact violation, for example
   `checkedInAttendance 61 exceeds confirmedAttendance 60`. This is a
   correctness defect and it outranks every latency number in the same run.
3. **A rate threshold failed.** `check_in_accepted`, `send_batch_accepted` and
   `webhook_accepted` falling below their floors means requests are being
   rejected. Read the counters beside them, which are tagged by error code, and
   the console lines, which print the code and the HTTP status.
4. **A duration threshold failed.** Take the plan before taking the blame. Run
   the matching `EXPLAIN (ANALYZE, BUFFERS)` from
   `docs/query-plan-review.md` against the same seeded database and compare the
   plan to the one that document predicts. A threshold breach with the
   predicted plan means the ceiling was too optimistic; a threshold breach with
   a different plan, usually a sequential scan or a spilled sort, means
   statistics are stale or an index is being ignored.
5. **`dropped_iterations` is high but latency is fine.** The load generator ran
   out of virtual users. Raise `MAX_VUS` and re-run before concluding anything
   about the API.

Record the k6 summary, the throttler limit in force, the seed size, and the
`RUN_ID` with every result. A load number without those four things cannot be
compared to the next one.

## Recorded run: 2026-09-17

Windows 11, Docker Desktop 29.4.0, PostgreSQL and Redis from
`compose.yaml --profile test`, API and worker from `dist` with `.env.load`,
`API_THROTTLE_LIMIT=100000`, `BILLING_ENABLED=false`, k6 2.2.0. Fixtures
reseeded before the send-launch and export runs, because both consume state.

| Scenario                 | Result | Numbers                                                                                           |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `reports-dashboard.js`   | pass   | 14,805 requests, 0 failed, report p95 57 ms, dashboard p95 14 ms, 0 invariant violations          |
| `export-20k.js`          | pass   | 19,800 rows in both formats: CSV 8.0 s, XLSX 10.1 s end to end, including a 2 s queue wait        |
| `check-in-concurrent.js` | pass   | 4,000 requests over 20 parties, 0 failed, p95 134 ms, 0 invariant violations, 0 unflagged replays |
| `send-launch.js`         | pass   | 100 launches, 2,000 messages queued, launch p95 674 ms, 0 replay mismatches                       |
| `webhook-spike.js`       | pass   | 16,049 callbacks, 0 failed, p95 13 ms, 79,136 events queued including 13,500 duplicates           |

Three defects were found by these runs and fixed before the numbers above were
taken:

- The report resolved authorization **inside** its `RepeatableRead`
  transaction, and authorization upserts the calling user. Concurrent reports
  for one caller therefore collided: 28.85% of requests failed. Authorization
  now resolves before the snapshot opens, and `EventAccessService.ensureUser`
  only writes when the row is missing or its contact details changed.
- Event-day check-in surfaced the same collision through its `Serializable`
  transaction, and its retry loop was three attempts with no backoff: 83.2% of
  requests failed. Retries are now six attempts with full jitter, and an
  exhausted attempt answers `409 CHECK_IN_CONTENDED`, which is safe to retry
  with the same idempotency key.
- A raw `SELECT ... FOR UPDATE` reports a serialization failure as Prisma
  `P2010` with SQLSTATE `40001`, not as `P2034`, so the retry filter missed it
  and 0.12% of check-ins still escaped as unhandled failures. Both codes are
  now treated as retryable.

## Known issues these scenarios surface

- **Send launches for one event serialise.** `MessagingService.createBatch`
  takes `pg_advisory_xact_lock` on the event before selecting invitations, so
  concurrent launches queue behind each other regardless of how many virtual
  users are configured. That is a deliberate safety property, and it is the
  reason `send-launch.js` reports launches per second rather than a
  concurrency number.
- **The export queue has a concurrency of one.** A second export waits for the
  first. `export_queue_wait_seconds` separates that wait from the generation
  cost.
