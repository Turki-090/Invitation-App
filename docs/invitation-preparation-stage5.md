# Stage 5 invitation preparation

Stage 5 gives an authorized event host a private, reviewable path from a guest
spreadsheet to validated invitation groups, plus approved invitation content
that can be reproduced exactly before a later delivery stage sends anything.

## Private assets

`@dawah/storage` is the vendor-neutral object-storage boundary. Its production
adapter supports S3-compatible services, while tests use the same contract with
an in-memory implementation. Object keys contain event and purpose scopes plus
generated identifiers; user filenames never become path segments. Imports,
event imagery, invitation imagery, and future generated files occupy distinct
key namespaces.

The application stores only private objects. Uploads are accepted only after
extension, declared MIME, signature, filename, and byte-limit checks. Images are
decoded with a pixel limit, rejected when animated or malformed, and re-encoded
to remove untrusted metadata and embedded content. Import workers verify the
recorded size and SHA-256 digest before parsing. Deployed configuration requires
a remote HTTPS storage endpoint and non-placeholder credentials.

## Import state machine

The API owns user actions and BullMQ owns parse and validation work:

```text
UPLOADED -> PARSING -> AWAITING_MAPPING -> VALIDATING
                                             |       \
                                             v        v
                                         REVIEWING   READY
                                             ^        |
                                             |        v
                                        correction  IMPORTING -> COMPLETED

Any non-terminal review state may be cancelled. Deterministic parser failures
enter FAILED; mapping or correction can retry validation when meaningful.
```

CSV input must be UTF-8. XLSX archives have file, entry, expanded-archive,
worksheet, row, column, and cell limits. Formulas, hyperlinks, rich text,
errors, and complex cells are never evaluated or imported. A parser finding in
a mapped cell remains blocking until that mapped value is explicitly corrected;
findings in unused columns cannot leak into invitation data.

Original source rows are immutable in PostgreSQL. Host corrections are stored
separately by semantic field, then overlaid by the worker before the same domain
rules used by manual guest creation run. GCC national numbers and valid
international numbers normalize to E.164. The worker identifies both in-file
and existing-event phone duplicates. Confirmation requires an explicit duplicate
policy and runs in a serializable, event-scoped transaction with the same phone
locks used by manual invitation creation. A failed confirmation therefore
creates no partial invitation groups.

Cancellation marks the job and source asset deleted in one database transaction
before idempotent object cleanup. Parse, validation, confirmation, and snapshot
operations use revisions or stable hashes so retries do not duplicate results.

## Templates, previews, and snapshots

Templates use stable family keys and increasing versions. Draft edits create a
new version; approved content is immutable; archived versions cannot return to
an active state. Family and locale locks prevent concurrent branching and
default-template races. Only a ready, event-local invitation image can be
attached.

The server, not the browser, computes the WhatsApp-style preview and every
invitation's readiness. It validates the event date, time, venue, localized
name, normalized phone, invitation-member structure, template approval,
placeholder syntax, required variables, and image readiness. Supported template
variables are:

- `guest_name`
- `event_name`
- `event_date`
- `event_time`
- `venue`
- `allowed_companions`

Snapshot creation locks the event, selected template, invitation groups, and
members before recomputing readiness. Each immutable snapshot records the exact
template version, rendered body and extra message, variable values, invitation
scope and response actions, source/content hashes, and image checksum/metadata.
Replaying the same unchanged source reuses the existing snapshot; any relevant
event, guest, member, template, or image change produces a new one.

## Public API and host experience

The canonical OpenAPI document covers private image assets, import limits and
jobs, row review and correction, confirmation/cancellation, template lifecycle,
server preview, readiness, and snapshot creation under `/api/v1/events/{eventId}`.
Every route applies event-scoped capabilities and tenant-safe not-found behavior.

The localized preparation workspace is available at
`/{locale}/events/{eventId}/preparation`. It includes Arabic RTL and English LTR
template editing, invitation-image upload, server preview, readiness totals,
snapshot preparation, drag-and-drop CSV/XLSX upload, suggested column mapping,
large row-review pagination/filtering, corrections, duplicate policy, and final
confirmation or cancellation.

## Verification evidence

The PostgreSQL integration suite runs a 1,000-row CSV through the real parser,
worker repository, mapping, mixed valid/invalid/duplicate review, correction,
revalidation, atomic confirmation, idempotent retry, cross-tenant denial, and
cancellation cleanup. It also proves template approval, readiness, snapshot
reuse, and new reproducible snapshots after template or guest changes. Focused
tests cover malformed CSV/XLSX, archive and cell limits, active cells, GCC and
international phones, all invitation structures, private storage, image
sanitization, optimistic concurrency, and localized host interactions.
