# Message flow

Large sends are asynchronous. The API validates permission, current Stage 5
snapshot readiness, the server confirmation, and an `Idempotency-Key`. It then
persists a batch and one immutable logical message per invitation group in a
`ReadCommitted` transaction protected by transaction-scoped advisory and row
locks. Only after commit does it enqueue a deterministic batch-dispatch job.

```text
Host -> readiness -> confirmation + Idempotency-Key -> API transaction
                                                       |
                                                       v
                         SendBatch + Message + IdempotencyRecord + audit
                                                       |
                                                       v
                                      deterministic batch dispatch job
                                                       |
                                                       v
                                   one queued job per logical Message
                                                       |
                                                       v
                         claim + MessageAttempt -> provider abstraction
                                                       |
                                                       v
                                      Meta provider message identifier
```

For an image-backed snapshot, the provider call includes a short-lived image
header rather than exposing the private asset bucket:

```text
worker -> HMAC(snapshot + checksum + expiry) -> public media capability
                                                       |
                                                       v
Meta fetch -> signature check -> immutable snapshot -> private object storage
                                                       |
                                                       v
                                     MIME/length/SHA-256 verification -> image
```

The API rejects invalid capabilities before database or object-store access.
The capability expires within one hour, and logging infrastructure must redact
its `signature` query parameter or omit query strings.

The worker uses row-locked claims and numbered attempt records. Recorded
acceptance makes later delivery of the same job a no-op. Classified transient
failures use bounded exponential backoff and provider `Retry-After` rate
limiting. Permanent failures are host-reviewable. A timeout, network break,
invalid success response, or interrupted in-flight call is ambiguous and is not
retried automatically because the provider may already have accepted it.

WhatsApp webhooks follow a second durable path:

```text
Meta -> raw-body HMAC verification -> normalized immutable WebhookEvent
                                                  |
                                                  v
                                   deterministic webhook job
                                                  |
                                                  v
                 correlate by provider ID or early logical callback ID
                                                  |
                                                  v
                                 monotonic delivery-state reducer
```

The API deduplicates provider retries before queueing. The reducer never trusts
arrival order: `READ` cannot regress to `DELIVERED`; a definitive failure
outranks `SENT`, but cannot erase `DELIVERED`, `READ`, or `RESPONDED` evidence.
Delivery state remains separate from RSVP state; inbound responses are persisted
as messaging evidence, with RSVP interpretation deferred to Stage 7.

See [`../whatsapp-messaging-stage6.md`](../whatsapp-messaging-stage6.md) for the
complete safety, persistence, resend, configuration, and operational contract.
