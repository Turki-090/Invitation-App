# Provider outage runbook

The platform depends on four external providers: Meta WhatsApp for messaging,
Supabase for authentication, managed PostgreSQL, and private object storage. Its
behaviour under each outage is already decided by design; this runbook is about
confirming which outage is happening and resisting the changes that would turn a
delay into a correctness failure.

## What is already guaranteed

- **Sends are durable.** A logical message exists in the database before the
  provider is contacted, with an immutable attempt record per try. A provider
  outage delays delivery; it does not lose the send.
- **Retries are bounded and idempotent.** Deterministic job identities and
  idempotency records mean a retry cannot produce a second message.
- **Failure classes are separated.** Transient failures retry, permanent
  failures stop and are surfaced for operator review, ambiguous failures are
  treated conservatively.
- **Webhooks deduplicate.** Repeated and out-of-order provider callbacks are
  reduced by event id and ingestion order.

The wrong instincts during an outage are: raising retry limits, clearing the
queue, disabling signature verification to "let the callbacks through", or
re-launching a batch that is already queued.

## Meta WhatsApp

**Confirm.** `dawah_provider_requests_total` by `outcome`, then the provider's
own status. Distinguish three shapes:

| Outcome mix                          | Meaning                             | Action                                                                                              |
| ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `rate_limited` rising, others normal | Throttling, not an outage           | None. The worker's limiter is pacing. Report an ETA from backlog age.                               |
| `failed_transient` dominant          | Provider or network outage          | Let retries run. Communicate delay. Do not re-launch.                                               |
| `failed_permanent` dominant          | Template, policy, or number problem | Stop new launches for the affected event and follow [`whatsapp-failures.md`](whatsapp-failures.md). |

**During a total outage.** Jobs accumulate and retry with exponential backoff.
Backlog age will breach its alert threshold; that is expected and is not by
itself a reason to act. Jobs that exhaust their attempts are recorded durably
for review rather than discarded.

**On recovery.** Do nothing first: watch the backlog drain. Only after it stops
draining should exhausted messages be reviewed and resent through the normal
safe-resend path, which uses the current snapshot and refuses to duplicate a
delivered message.

**Inbound callbacks.** If statuses and RSVP replies stop arriving while sending
works, the webhook subscription or signature configuration is the suspect.
Verification stays on. A missed callback only delays reconciliation; an
unverified one corrupts it.

## Supabase authentication

Hosts cannot sign in; existing valid tokens keep working until they expire, so
the failure looks partial. Guests are unaffected — the public invitation path is
accountless and does not touch Supabase.

Do not enable any development authentication bypass. It is rejected outside
local development by startup validation, and that validation is the control.

## Managed PostgreSQL

Readiness fails on both services, and this is a full outage: the platform holds
no write-behind buffer, by design, because durability of sends, RSVPs, and
attendance is the product's core promise.

Confirm connection saturation before assuming an outage; an exhausted pool
presents identically from the application's side. If the database is genuinely
lost, this is a restore decision — [`database-restore.md`](database-restore.md).

## Private object storage

Degrades three paths independently: preparation image uploads, export downloads,
and the signed invitation-image fetch the provider makes during a send.

The send path is the urgent one: if the provider cannot fetch the image, sends
fail. Exports fail closed and can be re-requested; uploads fail with a clear
error and no partial record.

## Communication

Give hosts the same three facts as in
[`event-night-incident.md`](event-night-incident.md): what is affected, what is
being done, when they will hear next. Never promise a delivery time that depends
on a provider that is currently failing.

## Rehearsal

Provider outage is rehearsed in staging before the pilot by revoking the
provider access token and observing: retries with backoff, backlog age rising,
the alert firing, jobs exhausting into durable records, and a clean drain after
the credential is restored. The rehearsal is recorded in the
production-readiness checklist.
