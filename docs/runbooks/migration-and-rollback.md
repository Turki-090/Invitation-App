# Migration and rollback runbook

The platform ships forward-only migrations and rolls back application code, not
the database. That asymmetry is deliberate: a reversed migration on a live
database destroys rows that a rolled-back release would have needed, and the
system's append-only evidence — audit logs, message attempts, reminder
decisions, credit entries — cannot be reconstructed once dropped.

## Rules

- `prisma migrate deploy` is the only release mechanism. `db push` is never used
  against a deployed database.
- Every migration must be **backward compatible with the release currently
  running**, because both versions serve traffic during a rollout and during a
  rollback.
- A destructive change is split across releases: add, backfill, switch reads,
  stop writing, and only then drop, each in a separate release.
- Migrations run as a distinct release step, never on application start. An
  application container that migrates on boot cannot be scaled or rolled back
  safely.

## Release sequence

1. **Pre-flight.** Confirm no supported event is in `EVENT_DAY` and none begins
   within twelve hours. Confirm the backup and recovery point are current
   ([`database-restore.md`](database-restore.md)).
2. **Migrate.** Run `pnpm migrate` against the target database from a controlled
   host. Record the migration names applied and the finish time.
3. **Deploy the API and worker.** Both read the same schema; deploying only one
   leaves the other running against a schema it was not tested against.
4. **Verify.** Readiness on both services, one authenticated request, one queue
   job completing, and `dawah_build_info` showing the new release on every
   instance.
5. **Watch.** Hold for at least fifteen minutes on the server error ratio,
   backlog age, and provider outcome mix before declaring the release done.

`DawahReleaseSkew` firing beyond fifteen minutes means a rollout stalled: finish
it or roll it back rather than leaving two releases serving.

## Rolling back

Roll back when the error ratio, backlog age, or provider failure rate is worse
than before the release and the cause is not obviously external.

1. Announce the rollback and the target release.
2. Redeploy the previous image for the **API and worker together**.
3. Leave the schema alone. The migration stays applied; this is why migrations
   must be backward compatible.
4. Verify as in step 4 above, against the previous release identifier.
5. Record what shipped, what was rolled back, and which migrations remain
   applied ahead of the running code.

If the new schema is genuinely incompatible with the previous release, the
rollback is not a redeploy — it is a restore, and it is a data-loss decision.
Escalate to the incident lead and follow
[`database-restore.md`](database-restore.md). Do not improvise a down migration
on a production database.

## In-flight work during a rollback

- Queue jobs are durable and idempotent, with deterministic job identities.
  Jobs enqueued by the new release are safe for the old worker to run provided
  the schema is compatible; the correlation identifier in the payload is
  optional and is ignored by code that does not read it.
- Idempotency records, confirmation hashes, and scheduled-slot uniqueness
  prevent a replayed high-impact request from sending twice across the
  transition.
- Exports in progress fail closed and can be re-requested; they hold no state
  another release depends on.

## Rehearsal

This runbook is rehearsed in staging before the pilot, and the rehearsal is
recorded in the production-readiness checklist. A rehearsal covers: a forward
migration under load, an application rollback with the migration left in place,
and verification that no queue job was lost or duplicated across the
transition.
