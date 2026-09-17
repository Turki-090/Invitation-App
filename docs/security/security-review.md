# Stage 10 security review

Review date: 2026-09-17
Scope: the repository at the Stage 10 branch, covering authentication,
authorization and cross-event isolation, public guest capabilities, provider
webhooks, uploads, secrets and configuration, diagnostics, and operational
access.

This is a repository review. It establishes what the code guarantees and what a
deployment must still prove. A deployed-environment review — TLS and ingress
configuration, cloud IAM, network reachability of private endpoints, and a
penetration test against a running staging environment — is separate and
outstanding.

## Method

Each area below was read against the controls claimed in
[`security-model.md`](security-model.md) and the priority threats in
[`threat-model.md`](threat-model.md), and cross-checked against the test that
proves it. A control with no test is recorded as unproven, not as present.

## Findings summary

| #   | Area            | Severity | Status                              |
| --- | --------------- | -------- | ----------------------------------- |
| 1   | Web CSP         | Medium   | Open — owner and date required      |
| 2   | Privacy         | Medium   | Open — deletion tooling not built   |
| 3   | Public surface  | Low      | Accepted with compensating controls |
| 4   | Metrics         | Low      | Deployment-verified control         |
| 5   | Dependencies    | Low      | Resolved; residual recorded         |
| 6   | Error reporting | Low      | Open — configuration gate           |
| 7   | Provider        | Info     | Outstanding staging exercise        |

## Verified controls

**Authentication.** Host clients present managed-provider JWTs; the API
validates issuer, audience, signature, and expiry against the provider JWKS.
The development bypass requires two flags _and_ is rejected outside local
development by `packages/config` startup validation, so a deployed environment
cannot enable it through configuration alone. Guests receive no accounts.

**Authorization and cross-event isolation.** Access is event-scoped and
deny-by-default; a resource identifier never substitutes for an active
membership plus permission check. Exact custom allow-lists can remove role
defaults; non-owners can never hold `billing.manage` or `event.delete`; team
managers cannot delegate a capability they lack. Full phone numbers require
`guest.phone.view`, which check-in staff do not receive by default. Database
triggers prevent invited ownership and protect the owner membership.
Proven by the cross-tenant cases in the events, invitations, Stage 7, and
Stage 8 integration suites, which assert both non-disclosure and rollback of
every cross-tenant mutation, using non-enumerating responses.

**Public guest capabilities.** 256-bit opaque tokens, stored only as SHA-256
hashes, scoped to exactly one invitation, revocable, rotatable, and answered
uniformly whether missing, revoked, or expired. Public responses are shaped to
the minimum, and private invitation routes carry no-store and no-index headers.

**Webhooks.** Meta callbacks are signature-verified with a constant-time
comparison against the raw body before any processing, deduplicated by provider
event id, and reduced in durable ingestion order so a delayed callback cannot
overwrite a newer host decision. Proven in the Stage 6 and Stage 7 suites.

**Uploads.** Invitation imagery is accepted only when extension, declared MIME,
and magic bytes agree, is re-decoded and re-encoded through a pixel-budgeted
pipeline, and is stored in a private bucket with a recorded checksum.
Spreadsheet imports are size-, row-, column-, and cell-bounded, parsed by a
hardened reader, and staged for review before any guest row is created.

**Idempotency and replay.** High-impact operations — send batches, reminders,
RSVP changes, check-ins, credits — carry idempotency records with request
fingerprints, deterministic queue identities, and confirmation hashes. A
replayed request returns the original result; a key reused with different
content is rejected.

**Secrets and configuration.** Deployed startup refuses loopback databases,
non-TLS PostgreSQL, insecure Redis, non-HTTPS or placeholder dependency URLs,
example-derived secrets, wildcard or non-HTTPS CORS origins, human-readable or
debug-level logging, and an unauthenticated metrics endpoint.

**Diagnostics.** Redaction is central and enforced in code rather than by
convention, and the Stage 10 integration suite runs a real host workflow with
real personal data against PostgreSQL and asserts that no guest name, phone,
email, invitation capability, entry pass, or signed URL parameter reaches a log
line, a metric label, or an error report — while `eventId`, `actorId`, and the
correlation identifiers survive. Metric route labels are normalised templates,
so a capability in a URL path cannot become a label.

## Findings

### 1. Web content security policy allows inline scripts — Medium

`script-src` includes `'unsafe-inline'` in every environment
(`apps/web/next.config.ts`). The rest of the policy is strong — `object-src
'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`,
explicit `connect-src`, and `upgrade-insecure-requests` when deployed — but
`'unsafe-inline'` removes CSP as a second line of defence against an injected
script on the public guest invitation page, which is the platform's most exposed
surface.

React escapes by default and no untrusted HTML is rendered, so this is a
defence-in-depth gap rather than a live vulnerability. The fix is a
nonce-based policy for the framework's inline bootstrap.

**Disposition:** open. Needs a named owner and a target date before general
availability; acceptable through the pilot given the compensating controls.

### 2. Deletion tooling is documented but not implemented — Medium

The erasure workflow in [`privacy-and-pdpl.md`](privacy-and-pdpl.md) resolves
the tension between a subject's deletion request and append-only evidence, but
there is no tooling for it. Deletion today is a manual operator procedure under
the production-access policy, which is slower, harder to audit, and error-prone
against a schema with append-only triggers.

**Disposition:** open. Must be built or explicitly accepted with a manual
procedure and named owner before general availability.

### 3. Provider callback and media routes skip request throttling — Low

`SkipThrottle` is applied to the WhatsApp webhook controller and to the private
media controller. This is correct: throttling the provider's callbacks would
drop delivery and RSVP state, and throttling the media fetch would break sends
outright. Both routes are protected instead by cryptographic verification —
signature verification and event-id deduplication for webhooks, a checksum-bound
signed and expiring URL for media — and both do bounded work.

The residual exposure is request-volume abuse against unauthenticated paths.

**Disposition:** accepted. Compensating control required at deployment: apply
volume limiting at the ingress or edge for these two paths, sized above Meta's
callback rate. Recorded in the production-readiness checklist.

### 4. Metrics endpoints are private by configuration, not by code — Low

Both endpoints are bearer-guarded with a constant-time comparison and report as
absent when disabled, but nothing in the repository prevents a deployment from
publishing `/api/v1/internal/metrics` through the public ingress. The endpoint
exposes no personal data; it does expose route inventory and traffic volumes.

**Disposition:** deployment-verified. The provisioning checklist requires
confirming that a scrape from outside the private network fails.

### 5. Dependency advisories — Low, resolved

Six high-severity transitive advisories were open at the start of the review:
`multer` (three, reached through `@nestjs/platform-express` and handling every
upload the API accepts), `lodash` (`@nestjs/config`), `js-yaml` (the OpenAPI
linter), and `deepmerge-ts` (the Prisma CLI). All four packages are now pinned
to fixed versions through workspace overrides, each with a recorded rationale,
and the full verification gate passes on the pinned tree.

Residual, all development-only and none reachable from a deployed service:
`uuid` (via `exceljs-hardened`, moderate), `vitest` and `@vitest/mocker`
(moderate), `esbuild` via `tsx` (low).

**Disposition:** high advisories resolved; residual accepted and re-evaluated on
each dependency review. `pnpm audit --audit-level high` now runs in CI as a
release gate.

### 6. Error reporting is optional and silently disabled — Low

`SENTRY_DSN` is optional, and an absent or malformed DSN degrades to a disabled
reporter so that a bad value cannot fail service startup. That is the right
failure mode, but it means a deployment can run with no error visibility and no
signal that it is missing.

**Disposition:** open. Provisioning must confirm a configured DSN in staging and
production, and the startup line reporting `errorReportingEnabled` is the check.

### 7. No live provider exercise has been recorded — Informational

Repository mocks and contract tests are comprehensive, but no approved Meta
template has been exercised end to end against a deployed environment: real
signed image fetch, outbound delivery, verified status and interactive
callbacks, RSVP reconciliation, and the confirmation send.

**Disposition:** outstanding Stage 10 staging work. It is a prerequisite for the
pilot, not for this review.

## Outstanding for the deployed-environment review

- TLS configuration, HSTS, and certificate automation.
- Cloud IAM roles and the separation of environment credentials.
- Confirmation that private endpoints — metrics, worker health, database, Redis,
  object storage — are unreachable from the public internet.
- Object-storage bucket policy: public access blocked at the bucket level.
- Penetration test against staging, including the public invitation surface.
- Backup encryption, access control, and a recorded restore drill.
