# Security model

Host clients authenticate with managed-provider JWTs sent as bearer tokens. The API validates issuer, audience, signature, and expiration against the provider JWKS. Guests do not receive accounts; an opaque, high-entropy, revocable capability grants access to exactly one invitation.

Authorization is event-scoped and deny-by-default. Resource identifiers never substitute for a membership and permission check. Full phone numbers require `guest.phone.view`; check-in staff do not receive that permission by default.

PII, access tokens, OTPs, and raw invitation capabilities are prohibited from logs. Public endpoints require rate limits, no-index headers, minimal responses, and abuse monitoring. Webhook endpoints require signature validation and event-id deduplication before asynchronous processing.

Secrets are environment-managed and rotated. Production uses HTTPS, restrictive CORS and CSP, payload limits, upload type/size validation, structured errors without stack traces, and monitored backups.
