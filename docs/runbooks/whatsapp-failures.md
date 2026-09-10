# WhatsApp failures runbook

Use this runbook when send batches stop progressing, provider errors spike,
webhook delivery diverges from the provider, or a host reports a failed or
duplicated invitation. Do not log or paste recipient phones, template variables,
rendered content, access tokens, app secrets, verify tokens, signatures, or raw
webhook payloads into tickets or chat. Treat the signed media URL as a bearer
capability: do not retain its query string in ingress, CDN, proxy, tracing, or
application logs.

## Triage

1. Record the incident time, environment, deployment revision, event ID, batch
   ID, message ID, and safe provider failure code. Message and batch IDs are the
   supported diagnostic handles.
2. Check API readiness, worker readiness, Redis health, database health, the
   `whatsapp-send` and `whatsapp-webhook` queue depths, oldest-job age, and recent
   deployments. Worker readiness must report both WhatsApp consumers healthy.
3. Check Meta's service health and credential/template configuration through the
   approved operations account. Never test by exposing a production token on a
   command line or in logs.
4. Group failures by `failure_class` and `failure_code`, not by recipient. Review
   webhook processing states separately from send attempts.
5. Determine whether the scope is one message, one template/locale, one batch,
   or all traffic before taking action.

Useful read-only PostgreSQL summaries are:

```sql
SELECT status, count(*)
FROM messages
WHERE send_batch_id = '<batch uuid>'
GROUP BY status
ORDER BY status;

SELECT failure_class, failure_code, count(*)
FROM messages
WHERE send_batch_id = '<batch uuid>' AND status = 'FAILED'
GROUP BY failure_class, failure_code
ORDER BY count(*) DESC;

SELECT status, count(*), min(received_at) AS oldest_received_at
FROM webhook_events
WHERE received_at >= now() - interval '1 hour'
GROUP BY status
ORDER BY status;
```

Run these only through approved read-only production access. Do not select
`recipient_phone_e164`, `template_variables`, `rendered_content`, or webhook
`payload` during routine diagnosis.

## Classification and response

- **Transient**: explicit HTTP 429 responses and known transient Meta codes retry
  automatically with bounded attempts. Respect `Retry-After`; do not manually
  enqueue another logical message while an attempt remains eligible.
- **Permanent**: the worker marks the message `FAILED` with a safe code and
  reason. Correct the destination or approved provider template as applicable.
  The host may request a resend only after the server confirms the original
  failed non-ambiguously, has no prior resend, and a ready snapshot matches the
  corrected current invitation and template source.
- **Ambiguous**: a bare HTTP 408 or 5xx response, timeout, transport break,
  invalid provider success response, or interrupted `SENDING` attempt may already
  have been accepted. Never replay it automatically. Reconcile the provider
  message history and webhook evidence, then obtain an explicit incident
  decision before another logical send.
- **Webhook failed**: confirm raw-body signature configuration, payload shape,
  configured phone-number ID, queue health, and provider-message correlation. A
  duplicate provider event is expected to deduplicate. A valid signed redelivery
  revives a failed webhook record and retries its retained deterministic queue
  job. Do not edit stored webhook payload or provider IDs.
- **Invitation image unavailable**: a provider-facing media `404` means the
  capability was missing, tampered, expired, or no longer matched its immutable
  snapshot. A `503` means the private object, MIME, length, size bound, or
  checksum failed verification, including a private object-store read failure.
  Confirm synchronized API/worker clocks, the
  remote HTTPS media base URL, the shared signing secret, the snapshot's asset
  status/checksum, and private object-store health. Do not make the bucket public
  or extend a URL beyond the configured one-hour maximum. Assets referenced by
  immutable snapshots are retention-locked; a manual database or object-store
  deletion is a data-integrity incident, not a supported cleanup path.
- **Queue unavailable after confirmation**: the batch may already be committed.
  Have the original caller retry the identical request with the same
  `Idempotency-Key`; this safely retries the deterministic dispatch job without
  creating a replacement batch.
- **Queue retries exhausted**: dispatch exhaustion marks only never-attempted
  messages `FAILED` with `DISPATCH_RETRY_EXHAUSTED`, and the original same-key
  request may recover and requeue them. An exhausted message job that remains
  `QUEUED` is recorded as transient; an in-flight `SENDING` outcome is ambiguous
  and must stay in review.

## Containment

There is currently no product-level pause/resume endpoint for an individual
batch. For a systemic incident, an infrastructure-level stop of the WhatsApp
send consumer affects every batch and requires incident-lead approval. Leave
Redis jobs and PostgreSQL records intact so recovery retains idempotency and
evidence. Do not delete queue jobs, reset message states, clear provider IDs, or
modify attempt rows as a shortcut.

If Meta credentials or webhook secrets may be exposed, follow the credential
rotation procedure, update the environment's secret store, and redeploy the API
for webhook secrets and the worker for send credentials. Verify both health
endpoints before restoring traffic.

## Recovery and closure

Restore dependencies first, then allow deterministic queued jobs and bounded
retries to resume. Re-submit only the original identical batch request with its
same idempotency key when recovering saved or dispatch-exhausted work. Redeliver
the original signed webhook when recovering a failed webhook job. For each
affected batch, reconcile message counts against its recorded `total_messages`;
reconcile accepted attempts and webhook evidence by provider message ID, or by
the logical callback ID for an early status that preceded provider-ID storage.
Permanent and ambiguous messages remain explicit review items rather than
silently returning to `QUEUED`.

For an image incident, repair configuration or restore the exact immutable
private object first. A new worker attempt generates a new short-lived
capability. Never paste an old capability into a manual provider request, reuse
one across snapshots, bypass byte-hash validation, or replace an immutable
snapshot's object in place.

Close the incident only after queue age is normal, affected batches have stable
terminal or intentionally reviewed states, duplicate-send risk is resolved, and
the timeline and safe codes are attached to the incident record. Production
alerts, dashboards, and an operator replay surface remain Stage 10 work; until
then, recovery actions require an engineering incident owner.
