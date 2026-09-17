# Stage 10 — production assurance, pilot, and release

Stage 10's goal is to prove the complete system can be deployed, operated,
recovered, and safely released. Roughly half of that work lives in a repository
and half lives in a provisioned environment, and this document is explicit about
which half is which. Nothing here claims a deployed-environment result.

## What Stage 10 added to the repository

### A diagnostics boundary that cannot leak

`packages/observability` is a new workspace package holding structured logging,
request correlation, metrics, and error reporting. Its central claim is that an
operator can follow one operation end to end without ever seeing a guest's name,
phone number, or invitation capability — and that this holds even when a call
site logs an object it did not inspect.

Redaction is therefore central rather than conventional. Two passes run over
everything logged or reported: a key pass that replaces credential-shaped and
personal-data-shaped fields whatever their value, and a value pass that scrubs
phone numbers in international and Saudi local form, email addresses, bearer
credentials, JSON Web Tokens, and opaque tokens of forty characters or more from
every surviving string. URL-valued fields have signature, capability, and expiry
parameters stripped while their path is kept.

Two choices in that design are worth stating, because both were deliberate
trade-offs against convenience:

- **Key matching is exact for personal names.** A substring rule on `name` would
  also redact `queueName`, `templateName`, and `eventName` — the fields an
  incident responder needs most. Over-redaction is a real failure mode, not a
  safe default.
- **UUID entity identifiers survive.** A forty-character floor on opaque-token
  scrubbing keeps `eventId` and `invitationId` readable. Those are internal
  identifiers, which the PDPL position already allows in diagnostics, and they
  are what makes a redacted log still diagnosable.

### Correlation across two processes

Every request carries a `requestId` and a `correlationId`, echoed in response
headers and included in the body of a failed response so a host can quote one
identifier to support. Inbound correlation headers are accepted only when they
are bounded, printable, opaque tokens, so a caller cannot inject content into
log lines.

When a host request enqueues work, the API stamps the active `correlationId`
into the **job payload**, never into the job id — the deterministic job id is
what makes enqueueing idempotent, and putting a per-request value into it would
have broken that. The worker adopts the identifier and issues a fresh
`requestId` per attempt, so one value answers "what happened to the batch I
sent?" across the API request and every job it produced.

One implementation detail caused a real bug during development and is worth
recording: response lifecycle events are emitted from the socket's asynchronous
context, not the request's. A handler registered inside the request scope cannot
read the correlation context back out of async storage when `finish` fires. The
middleware captures the context object by reference and re-enters it, which also
means enrichment performed mid-request — the resolved actor and event — is
visible in the completion log line.

### Metrics with structurally bounded cardinality

Twelve metric families cover HTTP, queues, the provider, and business outcomes,
defined once in `platform-metrics.ts`. Route labels are normalised templates, so
neither an entity identifier nor an invitation capability can become a label,
and beyond a per-metric series ceiling further combinations collapse into a
single `overflow` series rather than growing without limit. Queue depth and
backlog age are sampled at scrape time, so an unscraped worker does no Redis
work.

Both endpoints are bearer-guarded with a constant-time comparison, and report as
absent rather than forbidden when metrics are disabled.

### Error reporting as a replaceable boundary

Sentry is reached through its documented envelope endpoint rather than the
vendor SDK, for the same reason the messaging and storage providers are
boundaries: neither service should inherit automatic instrumentation of request
bodies, headers, and breadcrumbs, which is exactly the material the security
model forbids in diagnostics. Only unexpected failures are reported — an
expected `403` is an outcome, not an incident — and a queue job reports when it
exhausts its retries rather than on every attempt, so one provider blip does not
become a flood of identical alerts. Delivery is bounded so an error storm cannot
exhaust sockets or memory.

### Alerts and dashboards that cannot drift silently

`ops/prometheus/alerts.yaml` and `ops/grafana/dawah-overview.json` are reviewed
artefacts, and `pnpm ops:check` — which runs in CI — parses both against the
metric definitions in the source. A renamed metric now fails the build instead
of leaving a rule that never fires, which is the failure mode that makes
monitoring worse than useless. The check also enforces that every alert names a
severity and a runbook that exists in the repository.

### Configuration that refuses to start unsafely

Deployed environments already refused local hosts, insecure Redis, placeholder
secrets, non-HTTPS origins, and development authentication flags. Stage 10 adds
three more refusals: human-readable log format, debug log level, and an
unauthenticated metrics endpoint. A misconfigured deployment now fails loudly at
boot rather than serving with a weakened control.

### A test that proves the claim

`apps/api/test/integration/stage10.integration.test.ts` runs genuine host
workflows against real PostgreSQL with real personal data — an Arabic guest
name, a Saudi phone number, a host email, a live invitation capability, a signed
entry pass — and asserts that none of it appears in any log line, metric series,
or error report, while `eventId`, `actorId`, `requestId`, and `correlationId`
do. It also proves cross-process correlation and the business-outcome counters
the pilot review reconciles.

### Dependency review

Six high-severity transitive advisories were open and are now closed by pinned
workspace overrides with recorded rationale: `multer` reached through
`@nestjs/platform-express`, which handles every upload the API accepts; `lodash`
through `@nestjs/config`; `js-yaml` through the OpenAPI linter; and
`deepmerge-ts` through the Prisma CLI. `pnpm audit --audit-level high` and a
pull-request dependency review now run as release gates in CI. The residual
advisories are development-only and recorded in the exception register.

### Operational documentation

Seven runbooks, three operations documents, an updated privacy and PDPL
position, a production-access policy, a security review, and the
production-readiness checklist the exit gate is measured against. The runbooks
are written for the platform's actual failure modes rather than generically: the
event-night runbook's first principle is that a wedding cannot be rescheduled
around a deploy, and the restore runbook leads with the fact that a restore can
leave the database believing a message was never sent while the guest is holding
it.

## What Stage 10 did not and could not deliver here

These require a provisioned environment, real provider credentials, qualified
legal review, or a real event. None of them are claimed as done.

- Provisioned development, staging, and production environments, with domains,
  TLS, secret management, and managed data stores.
- The live non-production Meta exercise: approved templates end to end, a real
  signed image fetch, verified status and interactive callbacks, RSVP
  reconciliation, and the confirmation send.
- Backups, point-in-time recovery, and a recorded restore drill.
- The seven operational rehearsals — migration, rollback, provider outage, queue
  backlog, restore, credential rotation, and event-night incident.
- The Saudi PDPL legal review: controller/processor roles, the processor and
  location inventory, the Meta cross-border transfer basis, the privacy notice,
  and agreed retention periods.
- Deployed-environment security review and penetration test.
- Internal alpha, staging acceptance, the controlled pilot, and the go/no-go
  review.

## Known gaps in the repository

Two items are repository work that Stage 10 identified and did not close:

1. **Nonce-based CSP.** The web policy is otherwise strong but keeps
   `script-src 'unsafe-inline'`, which removes CSP as a second line of defence
   on the public guest invitation page. Finding 1 in
   [`security/security-review.md`](security/security-review.md).
2. **Deletion tooling.** The erasure workflow is documented and resolves the
   tension with append-only evidence, but is not implemented; deletion is
   currently a manual operator procedure. Finding 2.

A third is scoped but unstarted: full-stack Playwright journeys. Storybook
accessibility and visual regression cover the component layer, and the
integration suites cover the service layer against a real database, but there is
no browser-driven journey across a running web, API, worker, and database stack.
Item 6.11 in the checklist.

## Verification

Recorded 2026-09-17 against the Stage 10 branch, all passing:

- OpenAPI validation and generated-client drift check.
- Prettier, oxlint with warnings denied, and TypeScript across all 25 workspace
  tasks.
- 587 unit, contract, component, provider, storage, API, and worker tests —
  up from 492 at the close of Stage 9 — including 60 new observability-package
  tests, 18 new API observability tests, 13 new worker instrumentation tests,
  and 5 new configuration tests.
- 47 real-PostgreSQL integration tests, including the 6 new Stage 10 diagnostics
  and correlation tests.
- Operational artifact validation against 21 declared metrics.
- `pnpm audit --audit-level high` clean on the pinned dependency tree.

Storybook accessibility and visual regression, the startup smoke check, the
production container build, and the container smoke check run in CI and were not
re-run locally for this record.

## Reading order

| Question                                         | Document                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| What does the platform emit, and why is it safe? | [operations/observability.md](operations/observability.md)               |
| How is an environment provisioned?               | [operations/environments.md](operations/environments.md)                 |
| How does a release happen and get reversed?      | [operations/release-and-rollback.md](operations/release-and-rollback.md) |
| What do we do when it breaks tonight?            | [runbooks/event-night-incident.md](runbooks/event-night-incident.md)     |
| What is the privacy position?                    | [security/privacy-and-pdpl.md](security/privacy-and-pdpl.md)             |
| What did the security review find?               | [security/security-review.md](security/security-review.md)               |
| What is left before general availability?        | [production-readiness-checklist.md](production-readiness-checklist.md)   |
