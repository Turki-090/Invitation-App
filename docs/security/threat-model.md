# Threat model

Priority threats are cross-event data access, enumerable invitation links, stolen host tokens, duplicated or forged webhooks, duplicate high-impact requests, malicious uploads, PII leakage through logs/analytics, and event-day denial of service.

Primary controls are event-scoped authorization, opaque token hashes, managed JWT verification, webhook signatures and unique event IDs, idempotency records, database constraints and transactions, strict upload parsing, log redaction, rate limits, queue backpressure, and tested recovery procedures.

Security tests must include user A requesting event B, a revoked public token, replayed send requests, duplicate and out-of-order WhatsApp events, upload MIME mismatch, and repeated QR scans.
