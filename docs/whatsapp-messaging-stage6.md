# Stage 6 WhatsApp messaging

Stage 6 turns an approved Stage 5 invitation snapshot into one durable logical
WhatsApp message, sends it asynchronously through a provider-neutral boundary,
and reconciles delivery evidence without trusting webhook arrival order. It does
not implement RSVP business actions or the final credit ledger; those remain
Stage 7 and Stage 9 concerns respectively.

## Safety boundary

An authorized host first requests a server-computed readiness summary. An
invitation is sendable only when all of the following remain true:

- the event is writable and the caller has `invitation.send` permission;
- the selected event-local template is approved, uses `META_WHATSAPP`, and has a
  configured provider template name;
- the invitation is active and has not already produced an initial invitation
  message; and
- a ready Stage 5 snapshot still matches the current event, invitation,
  template, variables, and rendered content.

The summary separates selected, ready, already-sent, and blocked invitations and
estimates one credit unit for each new logical message. Its confirmation token is
bound to the exact selection and readiness state. Confirmations use five-minute
buckets but expire at the boundary after the next one, giving callers at least
five and at most ten minutes to submit. Validation accepts the current bucket or
the still-unexpired prior bucket. Batch creation re-runs readiness under database
locks, so a stale confirmation cannot send changed content.

The event workspace exposes the sending center only when the server-computed
`canSendInvitations` capability is true. Direct navigation still fails closed
with localized permission copy. Failure and resend guidance are rendered from
stable codes rather than displaying provider or server prose in the Arabic or
English interface.

`estimatedCreditUnits` and `Message.creditUnits` protect the identity and count of
logical sends in this stage. They do not reserve, debit, refund, or reconcile a
commercial balance; the append-only credit ledger is intentionally deferred to
Stage 9.

## Batch creation and idempotency

`POST /api/v1/events/{eventId}/send-batches` requires an `Idempotency-Key`. The
API hashes the key, hashes the complete request, and runs the following work in a
`ReadCommitted` transaction with a transaction-scoped advisory lock for the
event's initial-send scope and row locks for the records being confirmed:

1. Re-authorize the event-scoped send operation.
2. Lock the idempotency operation and initial-send scope.
3. Recompute readiness and verify the confirmation token.
4. Insert one immutable `SendBatch` and one `Message` per ready invitation.
5. Store the completed idempotency response and an audit record.

The `(event, operation, key hash)` uniqueness boundary makes an exact replay
return the original batch. Reusing the key for different input is rejected. A
partial database batch cannot escape the transaction.

After commit, the API enqueues one deterministic batch-dispatch job. If Redis is
temporarily unavailable, the API reports that the batch is already saved and
instructs the caller to retry with the same key. Replaying that request and the
dispatch job is safe: batch, message, provider-message, attempt-number, and
initial-invitation uniqueness constraints prevent another logical send from
being created. A retained failed deterministic queue job is retried rather than
duplicated. If dispatch exhausts all queue attempts, never-attempted messages are
made visibly `FAILED` with `DISPATCH_RETRY_EXHAUSTED`; replaying the original
request with the same key resets only those messages and requeues the saved batch.

## Provider and worker

`@dawah/messaging` defines purpose-specific provider operations for invitation,
reminder, and RSVP-confirmation templates. `MetaWhatsAppProvider` is the first
adapter. It sends template messages through the configured Graph API version,
maps the immutable message ID to Meta's opaque callback field, preserves body
parameter order from the approved template, and returns the provider message ID
needed for later correlation. Arabic snapshots use the `ar` provider language
code and English snapshots use `en`.

If the immutable snapshot contains an invitation image, the worker supplies an
`IMAGE_LINK` template header whose URL is a short-lived HMAC capability. The
capability binds the snapshot ID, immutable SHA-256 asset checksum, and expiry.
The public API route validates the capability before any database or private
storage lookup, then verifies asset lifecycle, MIME, byte length, configured
size limit, and a fresh SHA-256 hash before streaming the bytes. The asset bucket
remains private; this route is the only provider-facing bridge. It bypasses the
ordinary per-IP throttle so Meta can fetch images for a large batch, but the
HMAC and one-hour maximum lifetime remain mandatory.

Once an invitation asset is referenced by an immutable snapshot, application
and database guards prevent it from being archived or physically deleted.
Snapshot creation takes a share lock on the asset so archival cannot race the
durability decision. Template versions may still be archived, but their
snapshotted image bytes remain retained.

The batch job fans out deterministic `message-{messageId}` jobs. Each send worker
claims its message under a row lock, creates a numbered attempt with a stable
request fingerprint, and moves the message to `SENDING` before calling the
provider. A second job skips a message that is no longer `QUEUED`, so job replay
does not call the provider twice after a recorded acceptance.

Concurrency, sends per second, request timeout, and maximum attempts are bounded
by environment configuration. Explicit HTTP 429 responses and known transient
Meta codes use BullMQ's exponential backoff. `Retry-After` also pauses the worker
rate limiter, capped at 15 minutes. A bare HTTP 408 or 5xx response is treated as
ambiguous because the provider may already have accepted the request. Permanent
errors end in `FAILED` with a safe host-facing code and reason.

A network break, request timeout, invalid success response, or worker
interruption after `SENDING` has an uncertain provider outcome. Such an attempt
is classified `AMBIGUOUS` and is never retried automatically: avoiding a
duplicate invitation is more important than optimistic delivery. Operators must
reconcile ambiguous outcomes before authorizing another send.

## Persistent evidence

The Stage 6 migration adds these records:

- `SendBatch`: immutable request, selection, confirmation, total, estimate, and
  aggregate lifecycle timestamps.
- `Message`: the logical send, provider ID, recipient, exact approved template
  version, locale, variable order and values, rendered content, snapshot hashes,
  delivery state, failure classification, and resend predecessor.
- `MessageAttempt`: one provider-call attempt, its request fingerprint, result,
  bounded retry metadata, and safe failure detail.
- `WebhookEvent`: immutable normalized provider evidence with a unique provider
  event ID, payload hash, processing lifecycle, and optional message link.
- `IdempotencyRecord`: the hashed operation key, request hash, replay response,
  linked batch, and 24-hour expiry.

Composite foreign keys keep messages inside one event. Database triggers reject
changes to batch identity, logical message content/accounting identity,
completed attempts, and webhook evidence. A message-insert trigger independently
checks that the recipient, provider template, variables, rendered content, and
hashes exactly match one approved event-local Stage 5 snapshot.

The current public message view masks recipient phone numbers. Audit metadata
contains identifiers, counts, result state, and safe provider codes, never phone
numbers or rendered message content.

## Webhook ingestion and reduction

Meta verifies ownership through `GET /api/v1/webhooks/whatsapp`; the verify token
is compared in constant time. `POST /api/v1/webhooks/whatsapp` verifies
`X-Hub-Signature-256` as an HMAC-SHA256 over the captured raw request bytes
before parsing any event.

The API accepts supported status and inbound-response evidence, assigns a stable
provider event identity, stores normalized immutable payload evidence, and
rejects payloads whose `metadata.phone_number_id` does not match the configured
WhatsApp phone-number ID, and enqueues deterministic webhook jobs. The unique
`(provider, provider event ID)` constraint deduplicates provider retries. A
signed redelivery can revive a previously failed webhook record and its retained
failed queue job. The request returns only after durable persistence and queue
submission; message reduction happens in the worker.

The worker normally correlates evidence through the persisted provider message
ID. For an early status webhook that wins the race with the send response, it
may instead use the UUID preserved in Meta's opaque callback field, then records
the provider ID once. Positive delivery evidence is monotonic:

```text
QUEUED -> SENDING -> SENT -> DELIVERED -> READ -> RESPONDED
```

A late `DELIVERED` event cannot move `READ` backward. A provider `FAILED` event
outranks local or HTTP acceptance represented by `SENT`, but it cannot erase
proof that the message was already `DELIVERED`, `READ`, or `RESPONDED`. Later
`DELIVERED`, `READ`, or `RESPONDED` evidence may recover an earlier failure;
another `SENT` event may not. `CANCELLED` is a local terminal state. Delivery
remains independent of RSVP; Stage 7 will interpret eligible inbound responses
as RSVP commands.

## Safe resend

Resend is a new logical message and a new one-message batch, never another
attempt hidden inside the original message. It is allowed only when the source
message is `FAILED`, the failure is not ambiguous, no resend already exists, the
template remains approved, and a ready snapshot matches the current invitation,
template, and event source. If a phone number or content changes, the host must
prepare that current snapshot before resend becomes eligible. A short-lived
resend confirmation and a new idempotency key are required. The successor links
to its predecessor and copies the corrected phone, template variables, rendered
content, and hashes from the current snapshot into new immutable message
evidence; its single credit unit is explicit.

## API surface

- `POST /api/v1/events/{eventId}/sending/readiness`
- `GET|POST /api/v1/events/{eventId}/send-batches`
- `GET /api/v1/events/{eventId}/send-batches/{batchId}`
- `POST /api/v1/events/{eventId}/messages/{messageId}/resend-readiness`
- `POST /api/v1/events/{eventId}/messages/{messageId}/resend`
- `GET /api/v1/messaging/media/{snapshotId}` with a signed, expiry-bounded
  `checksum`, `expires`, and `signature` capability
- `GET|POST /api/v1/webhooks/whatsapp`

The authenticated event routes apply tenant-safe permission checks. Batch detail
supports status filtering and returns aggregate progress plus paginated,
masked-recipient message results.

## Configuration

The API requires `META_WHATSAPP_APP_SECRET`,
`META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and
`META_WHATSAPP_PHONE_NUMBER_ID` so signed callbacks are also bound to the
configured sender. The API and worker must share
`META_WHATSAPP_MEDIA_PUBLIC_BASE_URL`,
`META_WHATSAPP_MEDIA_SIGNING_SECRET`, and
`META_WHATSAPP_MEDIA_URL_TTL_SECONDS`; the public base URL must resolve to the
API from Meta's network, end in `/api/v1`, and contain no credentials, query, or
fragment. The worker also requires `META_WHATSAPP_ACCESS_TOKEN`,
`META_WHATSAPP_PHONE_NUMBER_ID`,
`META_WHATSAPP_GRAPH_API_VERSION`, `META_WHATSAPP_REQUEST_TIMEOUT_MS`,
`META_WHATSAPP_SEND_CONCURRENCY`, `META_WHATSAPP_MAX_SENDS_PER_SECOND`, and
`META_WHATSAPP_MAX_ATTEMPTS`. Staging and production configuration reject the
repository's inert local/test placeholders and require the media base URL to use
remote HTTPS. Treat a media `signature` query value as a bearer capability:
ingress, CDN, reverse-proxy, tracing, and application logs must redact it or omit
query strings entirely.

The worker readiness endpoint includes both WhatsApp send and webhook consumers.
Operational response procedures are in
[`runbooks/whatsapp-failures.md`](runbooks/whatsapp-failures.md) and
[`runbooks/queue-backlog.md`](runbooks/queue-backlog.md).

## Verification status

Focused domain, provider, webhook-parser, API-contract, and queue tests cover
status reduction, retry classification, template payloads, provider failures,
raw-body signature verification, malformed/duplicate events, and deterministic
job IDs. A real-PostgreSQL integration scenario exercises a 2,000-invitation
snapshot and idempotent batch, one logical credit unit per message, duplicate
send-job suppression, concurrent launch and terminal-state races, early signed
and out-of-order webhook evidence, queue-exhaustion recovery, webhook
redelivery, a permanent failure, a corrected current-snapshot resend, and an
image-backed template header whose checksum-bound capability verifies. The same
scenario uses an isolated real Redis/BullMQ prefix to fan out the 2,000 messages
twice and proves there are exactly 2,000 unique waiting jobs with the expected
deterministic IDs and payloads. Focused media tests also prove invalid signatures
are rejected before private storage is read and checksum-mismatched bytes are
not served.

Repository verification was recorded on 2026-09-10: all 250 unit, contract,
component, provider, storage, API, and worker tests passed; all 21 real
PostgreSQL/Redis integration tests passed; and format, lint, OpenAPI validation
and drift, Prisma validation, type checks, production builds, tracked-artifact
checks, live startup smoke, 42 Storybook accessibility/visual cases, and
production API/worker container readiness all passed. The Stage 6 repository
exit gate is therefore complete.

The live non-production Meta exercise is tracked as Stage 10 staging-acceptance
evidence. It requires deployed credentials and provider-side template/webhook
configuration and is not substituted by repository mocks; this external
assurance task does not reopen the completed Stage 6 repository exit gate.
