# Privacy and Saudi PDPL readiness

This document is the platform's data map, retention schedule, and data-subject
workflow. It is the working reference for engineering decisions; the customer
facing privacy notice and the final legal position on international transfer,
lawful basis, and controller/processor roles require review by qualified Saudi
counsel before general availability. Items needing that review are marked
**[legal review]**.

## Who the data belongs to

The platform has an unusual shape for a privacy analysis: the people whose data
it mostly holds — the guests — are not its users. A guest never creates an
account, never agrees to terms, and in many cases never visits the site. Their
name and phone number are supplied by a host.

That shape drives the design. Guest access is granted by an opaque, revocable,
single-invitation capability rather than an account; guest data is never used
for analytics; and every host-side view of a phone number is a distinct
permission.

**[legal review]** The host is most plausibly the controller of guest data and
the platform the processor acting on their instructions, with the platform the
controller of host account data. This determines notice and consent obligations
and must be confirmed.

## Data map

### Categories

| Category             | Examples                                                                  | Subject | Sensitivity             |
| -------------------- | ------------------------------------------------------------------------- | ------- | ----------------------- |
| Host identity        | Auth provider subject, email, phone, display name                         | Host    | Personal                |
| Event details        | Names, dates, venue name, city, map location                              | Host    | Personal (location)     |
| Guest identity       | Invitation display name, contact name, phone (E.164), member names        | Guest   | Personal                |
| RSVP data            | Attendance decisions, companion counts, per-member coverage, history      | Guest   | Personal                |
| Delivery evidence    | Message rows, immutable attempts, provider message ids, statuses          | Guest   | Personal                |
| Attendance           | Entry-pass hashes, check-in records, arrival counts and times             | Guest   | Personal                |
| Access capabilities  | SHA-256 hashes of invitation capabilities and team invitation credentials | Both    | Credential              |
| Operational evidence | Audit logs, reminder decisions, idempotency records, credit ledger        | Both    | Personal (by reference) |
| Uploaded content     | Invitation imagery, imported spreadsheets, generated exports              | Both    | Personal                |
| Diagnostics          | Structured logs, metrics, error reports                                   | —       | **Redacted by design**  |

Diagnostics are deliberately outside the personal-data perimeter. Redaction is
enforced in `@dawah/observability` and verified against a real database by the
Stage 10 diagnostics integration suite, which runs a genuine host workflow with
real personal data and asserts none of it reaches a log line, a metric label, or
an error report. Metric route labels are templates, so an invitation capability
cannot become a label. See [`../operations/observability.md`](../operations/observability.md).

### Purposes

| Purpose                                             | Categories used                         |
| --------------------------------------------------- | --------------------------------------- |
| Deliver invitations and reminders to invited guests | Guest identity, delivery evidence       |
| Let guests respond without an account               | Guest identity, RSVP data, capabilities |
| Give hosts accurate expected attendance             | RSVP data, attendance                   |
| Record arrivals on event day                        | Attendance                              |
| Operate, secure, and recover the service            | Operational evidence, diagnostics       |
| Account for message usage                           | Credit ledger                           |

Nothing is collected for advertising, profiling, or resale. Product analytics
use internal identifiers and product events only, never guest names, phone
numbers, or invitation capabilities.

### Processors and locations

**[legal review]** Complete this table for the selected deployment before
launch. Each row needs a signed data-processing agreement, a confirmed
processing location, and a recorded transfer basis where processing occurs
outside Saudi Arabia.

| Processor                | Role                             | Data reaching it                          | Location             | Transfer basis |
| ------------------------ | -------------------------------- | ----------------------------------------- | -------------------- | -------------- |
| Managed PostgreSQL       | Primary store and backups        | All persisted categories                  | TBD                  | TBD            |
| Managed Redis            | Queues                           | Identifiers only; no names or phones      | TBD                  | TBD            |
| Object storage           | Private assets, imports, exports | Uploaded content                          | TBD                  | TBD            |
| Supabase Auth            | Host authentication              | Host identity                             | TBD                  | TBD            |
| Meta WhatsApp Cloud API  | Message delivery                 | Guest phone, template parameters, imagery | Outside Saudi Arabia | **Required**   |
| Log pipeline             | Diagnostics                      | Redacted diagnostics only                 | TBD                  | TBD            |
| Error reporting (Sentry) | Diagnostics                      | Redacted diagnostics only                 | TBD                  | TBD            |
| Hosting/compute          | Runtime                          | Transient processing of all categories    | TBD                  | TBD            |

Meta is the unavoidable cross-border transfer: delivering a WhatsApp message
means sending the recipient's number to Meta. This must be disclosed in the
privacy notice and covered by a recorded transfer basis. **[legal review]**

## Retention schedule

| Data                                | Retention                                                           | Mechanism                                 |
| ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Generated exports                   | `EXPORT_RETENTION_HOURS` (default 168h), then deleted               | Worker-enforced; storage lifecycle policy |
| Signed export download URLs         | `EXPORT_DOWNLOAD_URL_TTL_SECONDS` (default 300s)                    | Signature expiry                          |
| Signed invitation-image URLs        | `META_WHATSAPP_MEDIA_URL_TTL_SECONDS` (default 900s)                | Signature expiry                          |
| Team invitation credentials         | 7 days, hash-only, single use                                       | Expiry and acceptance                     |
| Idempotency records                 | Bounded TTL                                                         | Expiry field                              |
| Completed and failed queue jobs     | 24h completed, 7d failed                                            | Queue job options                         |
| Import source files                 | Until the job is confirmed or cancelled                             | Cancellation deletes the source object    |
| Event data after the event          | **[legal review]** Proposed: 24 months, then host-prompted deletion | Not yet implemented — see gaps            |
| Backups                             | **[legal review]** Must match the event-data schedule               | Backup retention policy                   |
| Structured logs                     | **[legal review]** Proposed: 30 days                                | Log pipeline retention                    |
| Error reports                       | **[legal review]** Proposed: 90 days                                | Error reporter retention                  |
| Audit logs and append-only evidence | Retained for the life of the event record                           | Append-only by database trigger           |

Audit logs, message attempts, reminder decisions, RSVP history, and credit
entries are append-only by design, enforced at the database. That is a
deliberate tension with erasure: they are the evidence that a message was sent
once, that a reminder was eligible, and that attendance was counted correctly.
The deletion workflow below resolves it by deleting the identifying content and
retaining the non-identifying evidence.

## Data-subject workflows

### Access and export

- **Host, own data.** Self-service: the host can read and export their events'
  data through the product's reporting and export features.
- **Guest, own data.** A guest has no account, so requests arrive by phone or
  through the host. Verify identity against the phone number on the invitation —
  never by accepting a claimed name. Respond with that invitation's data only:
  the guest's own entry, not the party's or the event's.

Record every request, its verification method, and its outcome.

### Correction

Hosts correct guest details directly. A guest's correction is applied by the
host, or by an operator acting on a verified request. Correcting a name or phone
does not rewrite delivery evidence already recorded, which continues to describe
what was actually sent.

### Deletion

**[legal review]** on the erasure boundary below. The proposed position:

1. Identify every row for the subject: invitation group, members, RSVP rows and
   history, messages and attempts, entry passes and check-in records,
   notifications, and any export containing them.
2. Delete or irreversibly redact the identifying fields — names, phone numbers,
   free-text notes.
3. Retain the non-identifying structure of append-only evidence: that a message
   was sent, its status, that an arrival was recorded, the counts. This is what
   prevents a deletion from silently changing an event's reconciled totals.
4. Delete generated exports containing the subject, and record that backups will
   still contain the data until they age out under the retention schedule.
5. Record the request, the decision, and the completion date.

**Gap:** this workflow is documented but not yet implemented as tooling. Until
it is, deletion is a manual operator procedure performed under the
production-access policy. Tracked in the production-readiness checklist.

### Objection and restriction

A guest who objects to being contacted is handled by revoking their invitation
capability and cancelling their invitation group, which stops further messages
without deleting the host's record of the event.

## Security of processing

Detailed in [`security-model.md`](security-model.md) and
[`threat-model.md`](threat-model.md). The controls that matter most for privacy:

- Event-scoped, deny-by-default authorization; a resource identifier is never a
  substitute for a membership check.
- Full phone numbers require a distinct permission; check-in staff do not get it
  by default.
- Guest access is an opaque, high-entropy, hash-stored, revocable capability
  scoped to exactly one invitation.
- Private object storage with signed, expiring, checksum-bound URLs.
- TLS enforced to every dependency; deployed configuration that would weaken
  this is refused at startup.
- Diagnostics are redacted centrally and tested.

## Incident response

1. **Detect and contain.** Follow
   [`../runbooks/event-night-incident.md`](../runbooks/event-night-incident.md).
   Rotate exposed credentials immediately —
   [`../runbooks/credential-rotation.md`](../runbooks/credential-rotation.md).
2. **Assess.** Determine which categories and which subjects were affected, and
   whether the exposure was confidentiality, integrity, or availability. Loss of
   availability of personal data — including an unrecoverable database — is a
   personal-data incident, not only an outage.
3. **Notify.** **[legal review]** Confirm the notification trigger, deadline, and
   recipient authority under PDPL and its implementing regulations, and whether
   affected individuals must be told directly. Because hosts are plausibly the
   controllers, the notification path likely runs through them.
4. **Record.** Every incident involving personal data gets a written record:
   timeline, categories, subjects affected, containment, notification decision
   and its rationale, and remediation. Keep the record whether or not it was
   reportable.
5. **Remediate and review.** Close the root cause, and re-test the control that
   failed.

## Production access

Access to production personal data is governed by
[`production-access-policy.md`](production-access-policy.md): least privilege,
named individuals, justified and time-bounded elevation, and logged access.

## Open items before general availability

| Item                                                 | Owner         | Status                  |
| ---------------------------------------------------- | ------------- | ----------------------- |
| Confirm controller/processor roles                   | Legal         | **[legal review]**      |
| Complete the processor and location table            | Operations    | Blocked on provisioning |
| Record the Meta cross-border transfer basis          | Legal         | **[legal review]**      |
| Publish the host-facing privacy notice               | Legal/Product | Not started             |
| Agree event-data, log, and backup retention periods  | Legal/Product | **[legal review]**      |
| Implement deletion tooling                           | Engineering   | Documented, not built   |
| Sign data-processing agreements with every processor | Legal         | Blocked on provisioning |
| Record the restore drill result                      | Operations    | Rehearsal pending       |
