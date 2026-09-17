# Release, rollout, and go/no-go

This platform releases against other people's weddings. That single fact sets
the release policy: the deployment calendar is subordinate to the event
calendar, and any release that cannot be reversed within minutes does not ship.

## Release windows

- **Never** release while a supported event is in `EVENT_DAY`, or within twelve
  hours of one starting, unless the release _is_ the remedy for an active
  incident and the incident lead says so.
- Saudi wedding activity concentrates in the evening. Release in the local
  morning, so that a problem surfaces with a full working day ahead of it.
- One substantive change per release. A release that bundles a migration, a
  provider change, and a UI change cannot be bisected while a host is waiting.

## Feature flags

| Flag               | Controls                               | Release position                                                       |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| `CHECK_IN_ENABLED` | QR entry passes and event-day scanning | On for pilot events that opted in; off elsewhere until proven.         |
| `BILLING_ENABLED`  | Credit accounting surfaces             | Off until commercial terms are agreed.                                 |
| `PAYMENTS_ENABLED` | Payment activation                     | Off until a provider is chosen; validation refuses it without billing. |
| `METRICS_ENABLED`  | Metrics endpoints                      | On in every deployed environment, with a token.                        |

A flag is a release control, not a permanent branch. Every flag carries an owner
and a decision date: either it becomes the default or it is removed.

## Gradual rollout

1. **Canary.** Deploy to one instance. Hold for fifteen minutes on server error
   ratio, latency, and backlog age. `DawahReleaseSkew` is expected here.
2. **Majority.** Roll to the remaining instances. Confirm `dawah_build_info`
   reports one release everywhere and the skew alert clears.
3. **Soak.** Hold for one full evening of traffic before enabling any new flag
   for additional events.

Abort thresholds — any one of these ends the rollout and starts a rollback:

- Server error ratio above 2% for ten minutes.
- p95 latency on a previously healthy route more than doubled.
- Backlog age rising on any queue with a healthy provider.
- Any `exhausted` queue outcome that did not occur before the release.
- Any report of a cross-event visibility, duplicate-send, or attendance-count
  discrepancy — these abort immediately, without a threshold.

## Rollback

Application rollback is a redeploy of the previous image for **both** the API and
the worker; the schema stays as it is. The full procedure, including what makes
a rollback impossible and what to do then, is in
[`../runbooks/migration-and-rollback.md`](../runbooks/migration-and-rollback.md).

The rollback plan must be executable at the moment of release — not written
afterwards. Before a release begins, the operator states out loud which image
tag is the rollback target and confirms it is still deployable.

## On-call

- A named on-call owner for every release, and for every supported event night,
  recorded before the event rather than found during it.
- Escalation path: on-call → incident lead → product and security owners.
- Paging alerts reach a human within five minutes. An alert that cannot page is
  not a `page` severity alert.
- The on-call owner has the access described in
  [`../security/production-access-policy.md`](../security/production-access-policy.md)
  and nothing beyond it.

## Rehearsals

Each of these is rehearsed in staging and recorded in the
production-readiness checklist before the pilot:

| Rehearsal            | Runbook                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Forward migration    | [`migration-and-rollback.md`](../runbooks/migration-and-rollback.md) |
| Application rollback | [`migration-and-rollback.md`](../runbooks/migration-and-rollback.md) |
| Provider outage      | [`provider-outage.md`](../runbooks/provider-outage.md)               |
| Queue backlog        | [`queue-backlog.md`](../runbooks/queue-backlog.md)                   |
| Database restore     | [`database-restore.md`](../runbooks/database-restore.md)             |
| Credential rotation  | [`credential-rotation.md`](../runbooks/credential-rotation.md)       |
| Event-night incident | [`event-night-incident.md`](../runbooks/event-night-incident.md)     |

A rehearsal produces a recorded observation — a measured duration, an observed
outage window, a confirmed recovery point — not a tick.

## Pilot

The controlled pilot is a small number of explicitly supported Saudi events,
each with a named host contact, a named on-call owner, and a pre-agreed
fallback for check-in.

Per pilot event, record: invitations prepared, messages sent, delivery outcomes,
RSVP responses, expected attendance, recorded arrivals, and any manual
reconciliation. After the event, reconcile those against the event report and
the credit ledger. A discrepancy is a finding even if the host never noticed it.

## Go/no-go

General availability requires an explicit decision, recorded with named
approvers from product, engineering, security, operations, and the business.

The gate is met only when:

1. Every item in [`../production-readiness-checklist.md`](../production-readiness-checklist.md)
   has recorded evidence, an approved exception, or is disabled behind a
   verified feature flag.
2. The pilot ran without a data-isolation, message-duplication,
   attendance-count, privacy, or recovery failure.
3. Findings from the security review and the PDPL review are closed or
   explicitly accepted, with the acceptance recorded and owned.
4. A rollback plan, an on-call rota, and a restore capability proven by drill are
   all in place for the first month of general availability.

A "no-go" is a legitimate and expected outcome. Record the reason, the owner,
and the date the decision is revisited.
