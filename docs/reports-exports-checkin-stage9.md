# Stage 9 reports, exports, credits, and event-day check-in

Stage 9 closes the loop between what was sent and what actually happened. It adds
reconciled server-side reporting, asynchronous private exports, an append-only
credit ledger with reservations, and a feature-flagged event-day check-in
workflow. It does not deploy, operate, or commercially activate any of this;
provisioning, live provider acceptance, and the pilot remain Stage 10 concerns.

## Reporting

`GET /api/v1/events/{eventId}/reports` answers from the source rows inside one
`RepeatableRead` transaction after resolving the caller's `reports.view`
capability, so every total in a single response describes the same instant.

The report separates active from cancelled invitation groups, counts named
guests, sums expected attendance, and buckets RSVP status, invitation type, and
delivery status. Delivery counts one row per invitation group — the latest
invitation message for that group — rather than every attempt, so a resend does
not inflate the picture. That breakdown is aggregated in the database and returns
at most one row per delivery status, which keeps a twenty-thousand-guest report
the same size as a fifty-guest one.

`noShowAttendees` stays null until the event status is `COMPLETED`. Before that
the difference between expected and arrived attendance is simply who has not
arrived yet, and reporting it as a no-show would be a guess.

## Private exports

`POST /api/v1/events/{eventId}/exports` records a job and returns `202` without
building anything. The worker claims the job exactly once, re-checks that the
requester still holds `guest.export` on an active membership, and fails the job
with `EXPORT_ACCESS_REVOKED` when that membership has gone. A file is never
produced for a capability the requester no longer has.

Rows are read with keyset pagination ordered by `(createdAt, id)` and the
processor refuses a page that does not advance the cursor, so a long export
cannot silently skip or repeat guests. Phone numbers are included only when the
requester holds `guest.phone.view`; without it the column is absent rather than
masked, because a masked column in a spreadsheet invites a false sense of
completeness. Every cell that begins with a formula character is prefixed with an
apostrophe so a CSV opened in a spreadsheet cannot execute.

The artifact is written to private storage, read back, and compared against its
recorded size, content type, and SHA-256 digest before the job is marked
complete. A mismatch deletes the object rather than publishing an unverified
file. Completion writes an `EXPORT_READY` notification to the requester alone.

Downloads are served by the API, not by the object store. `output.downloadUrl`
carries an expiry and an HMAC signature bound to the event, the job, the asset,
and that asset's digest, signed with `EXPORT_DOWNLOAD_SIGNING_SECRET`. The
download re-verifies ownership, job status, asset state, the signature, and the
bytes themselves before responding. A completed job whose retention window has
passed reports `EXPIRED` and stops offering a URL.

## Credits

Credit accounting is an append-only ledger. `credit_ledger_entries` are immutable
at the database level, positive for purchases, bonuses, and refunds, negative for
usage and expiry. A refund never erases the charge it compensates; both remain in
the history and reconciliation reports them separately.

A launch holds what it will owe. Creating a send batch reserves one unit per
logical message in the same transaction that creates the batch, so a batch can
never exist without its reservation. Two database guards keep
`balance >= active reserved` at all times: one refuses a reservation the balance
cannot cover, the other refuses a ledger entry that would take the balance below
what is reserved.

That invariant is what makes charging safe. When the provider accepts a message,
the worker releases one held unit from the batch's reservation and writes the
matching `SEND_USAGE` entry in the same transaction as the message status change.
Because the unit was already held, the charge cannot trip the balance guard and
therefore cannot roll back a send that has already happened. The ledger's unique
reference `(account, entry type, reference type, reference id)` makes a second
charge for the same message impossible. A send whose reservation is gone is left
uncharged and appears in reconciliation as `unchargedMessageUnits` rather than
being forced through.

A charged send that the provider later reports as undelivered is refunded when
that failure is recorded, against the same message reference, so a refund
cannot be written twice or without a matching charge. When no message in a
batch can move again, settlement releases the units the batch never used, so
a reservation ends `CONSUMED` only when its last held unit paid for a real
send and `RELEASED` when part of the launch never went out. Both steps are idempotent, so a repeated
terminal transition changes nothing.

An automatic reminder run that cannot hold its credits is excluded as a whole
with the `INSUFFICIENT_CREDITS` reason code rather than failing the job or
sending messages the event cannot pay for.

`GET /api/v1/events/{eventId}/credits` reports the position — balance,
reserved, available, and the reconciliation between logical sends and ledger
charges — and `GET /api/v1/events/{eventId}/credits/ledger` pages the entries
themselves. Both require `billing.manage`, which is not delegable away from the
owner. Purchases, bonuses and corrective adjustments are deliberately not
event-API operations: they are service methods for platform operators and for
the payment provider, because an endpoint that let an event owner grant
themselves credit would make the ledger meaningless.

Billing is off by default. With `BILLING_ENABLED` false no credit account exists,
reservation and charging are no-ops, and send behaviour is exactly what it was
before this stage. `PAYMENTS_ENABLED` gates payment activation separately and
cannot be enabled without billing. The payment provider is an interface with one
inactive implementation; it exposes no amount, currency, or price, because
commercial terms belong to a provider that has not been chosen.

## Event-day check-in

Check-in is behind `CHECK_IN_ENABLED` and, per event, behind `qrEnabled`. While
the flag is off the public entry-pass route answers exactly as it does for an
unknown invitation, so a disabled deployment does not advertise the feature.

A guest's entry pass is an opaque token: a random pass identifier and an HMAC
signature over it, with only the SHA-256 digest of the complete token persisted.
The pass carries no guest data, and the QR payload is the token itself. Issuing
is idempotent while a pass is still valid, and reissuing revokes the previous
pass. A partial unique index allows one active pass per invitation.

Host operations require `checkin.use`, event-day status, and an
`Idempotency-Key`. Each check-in runs in a `Serializable` transaction that locks
the invitation row, so concurrent scans of the same party serialize. The database
refuses any state whose checked-in count exceeds confirmed attendance, which
means the capacity rule holds even if the application is wrong. A party already
at capacity returns `ALREADY_CHECKED_IN`, writes a duplicate-attempt audit
record, and increments nothing. Partial arrivals are first-class: the operator
records how many people arrived now, and the remainder stays open.

Repeating an idempotency key with the same request replays the stored result with
`idempotentReplay` set. Repeating it with a different request is rejected, so a
key cannot be recycled onto a different party or count.

The scanner is honest about being online. Nothing is recorded without a server
response, and the interface does not claim to prevent duplicates while offline,
because it cannot.

## Platform metadata

`GET /api/v1/platform` is unauthenticated and reports the API version, the
minimum supported version, the feature flags a client should respect, and the
native-client version floors. It exists so a future iOS or Android check-in
client can refuse to run against an API it does not understand.

## Operational notes

Request throttling is configurable through `API_THROTTLE_TTL_SECONDS` and
`API_THROTTLE_LIMIT`. Event-day check-in puts several scanning devices behind one
venue address, so the ceiling has to be raised per environment rather than
compiled in.

Load scripts and the query-plan review for these read paths live in `load/` and
`docs/query-plan-review.md`.
