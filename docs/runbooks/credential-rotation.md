# Credential rotation runbook

Every deployed secret has a rotation procedure, and the procedure differs by
what the secret protects. Rotating a signing secret is not the same operation as
rotating an access token: one invalidates artefacts already in the hands of
guests, the other only affects future calls.

Startup validation rejects placeholder and local-looking values in staging and
production, so a botched rotation fails the service loudly at boot rather than
silently weakening a check.

## Inventory

| Secret                               | Protects                             | Rotation class   | Blast radius of rotation                                              |
| ------------------------------------ | ------------------------------------ | ---------------- | --------------------------------------------------------------------- |
| `DATABASE_URL` password              | All data                             | Dual-credential  | None if overlapped; total outage if not.                              |
| `REDIS_URL` password                 | Queues                               | Dual-credential  | Workers reconnect; in-flight jobs retry.                              |
| `STORAGE_ACCESS_KEY_ID` / secret     | Private object storage               | Dual-credential  | Uploads, exports, and media fetches fail while mismatched.            |
| `META_WHATSAPP_ACCESS_TOKEN`         | Outbound sending                     | Overlap          | Sends fail and retry; no duplicates.                                  |
| `META_WHATSAPP_APP_SECRET`           | Inbound webhook signatures           | Provider-coupled | Unverified callbacks are rejected; statuses lag until resynchronised. |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhook subscription handshake       | Provider-coupled | Only affects re-subscription.                                         |
| `META_WHATSAPP_MEDIA_SIGNING_SECRET` | Signed private invitation-image URLs | **Invalidating** | Outstanding media links stop resolving mid-send.                      |
| `EXPORT_DOWNLOAD_SIGNING_SECRET`     | Signed export download URLs          | **Invalidating** | Links already given to hosts stop working.                            |
| `CHECK_IN_TOKEN_SIGNING_SECRET`      | Entry passes in guests' hands        | **Invalidating** | Every issued QR pass stops resolving.                                 |
| `METRICS_TOKEN`                      | Metrics scrape                       | Overlap          | Scrapes fail until the collector is updated; no user impact.          |
| `SENTRY_DSN`                         | Error reporting destination          | Overlap          | Reports are dropped while mismatched.                                 |
| Supabase keys                        | Authentication                       | Provider-coupled | Hosts cannot sign in while mismatched.                                |

## Dual-credential rotation

Used where the dependency can hold two valid credentials at once.

1. Create the second credential at the dependency; do not remove the first.
2. Update the secret store and restart the API and worker.
3. Verify readiness on both services and one real operation per affected path.
4. Revoke the first credential.
5. Record the rotation date and the new credential's identifier — never its
   value — in the secret store's audit trail.

## Overlap rotation

Used where the old credential keeps working until it expires.

1. Issue the new credential.
2. Update the secret store and restart.
3. Confirm the affected metric recovers: `dawah_provider_requests_total` for
   sending, a successful scrape for metrics.
4. Let the old credential expire, or revoke it once traffic is confirmed clean.

## Invalidating rotation

`META_WHATSAPP_MEDIA_SIGNING_SECRET`, `EXPORT_DOWNLOAD_SIGNING_SECRET`, and
`CHECK_IN_TOKEN_SIGNING_SECRET` sign artefacts that are already outside the
platform. Rotating one breaks every outstanding artefact it signed.

Rotate these only when:

- no supported event is in `EVENT_DAY` or within twelve hours of one, **and**
- no send batch is in flight (`dawah_queue_depth{queue="whatsapp-send"}` is
  zero and backlog age is zero), **and**
- hosts have been told that existing export links will stop working.

After rotating `CHECK_IN_TOKEN_SIGNING_SECRET`, every entry pass must be
reissued before the next event. Treat a compromise-driven rotation as an
incident: the invalidation is the point, and guests will need new passes.

## Compromise response

If a secret is believed to be exposed:

1. Rotate immediately, accepting the invalidation cost, and record the decision.
2. Revoke the old credential at the dependency rather than waiting for expiry.
3. Check the audit log and structured logs for use of the exposed credential.
   Logs never contain secret values, so search by affected resource and time
   window, not by the secret itself.
4. Follow the incident-response obligations in
   [`../security/privacy-and-pdpl.md`](../security/privacy-and-pdpl.md) if
   personal data may have been reachable with the exposed credential.

## Rehearsal

Rotation is rehearsed in staging before the pilot, at minimum for the database
password, the provider access token, and one invalidating signing secret. The
rehearsal records the outage window observed for each.
