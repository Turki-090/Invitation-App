# Database restore runbook

A backup that has never been restored is a hope, not a control. This runbook
covers both the drill that proves the backup and the real restore that follows a
loss, and it is explicit about what a restore costs, because for this platform
the cost is measured in sent messages and recorded arrivals rather than in rows.

Restores must always be exercised against a non-production target first.

## What a restore loses

Recovering to a point in time reverses everything after it. For this platform
that specifically means:

- **Messages already delivered stay delivered.** The provider does not roll
  back. A restore can therefore leave the database believing a message was never
  sent while the guest is holding it. Resending from that state is how a restore
  turns into a duplicate-send incident.
- **Attendance recorded after the recovery point disappears**, while the guests
  are inside the venue.
- **Append-only evidence is truncated**: audit logs, message attempts, reminder
  decisions, RSVP history, and credit ledger entries after the recovery point
  are gone.
- **Idempotency records are lost**, so requests that were already applied can be
  accepted again.

This is why the first question in a real restore is not "how fast" but "what is
the recovery point, and what happened after it".

## Backup configuration requirements

- Automated daily full backups with continuous archiving for point-in-time
  recovery.
- Encryption at rest, with access restricted to the production-access role
  defined in
  [`../security/production-access-policy.md`](../security/production-access-policy.md).
- Retention that satisfies the retention schedule in
  [`../security/privacy-and-pdpl.md`](../security/privacy-and-pdpl.md). Backups
  hold personal data and are in scope for PDPL.
- Backups stored in the same approved region as the primary database, unless an
  international transfer has been reviewed and recorded.

## Restore drill

Run before the pilot, then on the recorded schedule. The drill is the evidence
that satisfies the production-readiness checklist.

1. Choose a recovery point at least one hour in the past and record it.
2. Restore into a fresh, isolated, non-production instance. Never restore over a
   live database to test a backup.
3. Record: backup timestamp, chosen recovery point, actual recovery point
   achieved, restore duration, encryption and access controls on the target.
4. Verify schema state: `prisma migrate status` against the restored database
   must report the expected applied migrations.
5. Verify integrity with a query set that exercises the aggregates the product
   reconciles — invitation groups, named guests, expected attendance, RSVP
   states, message statuses, check-in counts — and compare against the source at
   the recovery point.
6. Point a disposable API and worker at the restored database and run the
   startup smoke check plus one authenticated read.
7. Destroy the restored instance and confirm its storage is removed.
8. Record the result. A backup is proven only by a successful drill; note the
   measured restore duration, because that number is the platform's real
   recovery-time objective.

## Real restore

1. **Stop the bleeding.** Stop the API and worker before restoring. A live
   writer against a database being recovered produces a state nobody can
   reconcile.
2. **Name the incident lead** and follow
   [`event-night-incident.md`](event-night-incident.md) if any event is in
   progress.
3. **Establish the recovery point** and, before restoring, capture what happened
   after it: sent messages, RSVPs, and check-ins in that window. Export or
   screenshot them from the failing system if it is still readable. This is the
   reconciliation list.
4. **Restore to a new instance**, never in place, so the damaged database
   remains available as evidence.
5. **Verify** as in drill steps 4–6.
6. **Cut over** by repointing `DATABASE_URL` and restarting both services.
7. **Reconcile** the list from step 3 by hand. Assume every message in that
   window was delivered; do not resend without host confirmation.
8. **Assess notification obligations.** Loss of personal data, including loss of
   availability, may be a reportable incident under PDPL. Consult
   [`../security/privacy-and-pdpl.md`](../security/privacy-and-pdpl.md) before
   closing.

## After any restore

- Rotate credentials if the cause may have involved unauthorised access
  ([`credential-rotation.md`](credential-rotation.md)).
- Confirm queue state: jobs referencing rows that no longer exist fail and are
  recorded rather than corrupting anything, but the backlog should be reviewed
  before it is allowed to drain.
- Record the timeline, the reconciliation decisions, and the measured recovery
  point and duration in the incident record.
