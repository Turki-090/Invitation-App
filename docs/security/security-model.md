# Security model

Host clients authenticate with managed-provider JWTs sent as bearer tokens. The API validates issuer, audience, signature, and expiration against the provider JWKS. Guests do not receive accounts; an opaque, high-entropy, revocable capability grants access to exactly one invitation.

Authorization is event-scoped and deny-by-default. Resource identifiers never
substitute for an active membership and permission check. Exact custom
allow-lists can remove role defaults; non-owners can never receive
`billing.manage` or `event.delete`, and team managers cannot delegate or renew a
capability they do not hold. Full phone numbers require `guest.phone.view`;
check-in staff do not receive that permission by default. Notification reads
are restricted to the addressed user and an event they can still access.

Team invitation credentials are high-entropy, stored only as SHA-256 hashes,
returned once per issuance, expire after seven days, and are accepted only by
an authenticated principal with the matching verified phone claim. Invalid,
expired, revoked, cross-user, and cross-event attempts use non-enumerating
responses. Database checks and triggers prevent invited ownership and protect
the owner membership from mutation.

Reminder eligibility is calculated and locked server-side, recorded per
invitation, and revalidated before provider contact. Confirmation hashes,
idempotency records, scheduled-slot uniqueness, cooldown state, maximum counts,
and deterministic queue identities prevent replay or accidental reminder spam.

PII, access tokens, OTPs, and raw invitation capabilities are prohibited from logs. Public endpoints require rate limits, no-index headers, minimal responses, and abuse monitoring. Webhook endpoints require signature validation and event-id deduplication before asynchronous processing.

Secrets are environment-managed and rotated. Production uses HTTPS, restrictive CORS and CSP, payload limits, upload type/size validation, structured errors without stack traces, and monitored backups.
