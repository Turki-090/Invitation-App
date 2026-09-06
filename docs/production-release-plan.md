# Dawah production and release plan

Status date: 2026-09-06

The “Current position” section preserves the pre-Stage 1 baseline captured on
2026-09-05. Dated completion records under each roadmap stage are authoritative.

This plan maps the current repository to the requirements in `GPT — Wedding Platform Master Business & Technical Build Specification.md` and the visual rules in `System Design/`. It targets a production web release for Saudi Arabia and the GCC. Native iOS and Android applications remain a post-web-release phase and are not a launch dependency.

## Target production release

The first public release must let a host complete this entire workflow with real infrastructure and no permanent mocks:

1. Authenticate securely.
2. Create and configure an event.
3. Add or import invitation groups and their named guests.
4. Preview and send WhatsApp invitations safely.
5. Let accountless guests respond in WhatsApp or on a private web invitation.
6. Track delivery, RSVP state, and expected attendance separately.
7. Send eligible reminders.
8. Collaborate with event-scoped co-hosts.
9. View and export operational reports.
10. Operate, monitor, recover, and support the platform safely in production.

QR check-in can launch behind a feature flag during the controlled pilot. Native applications follow the stable `/api/v1` contract after the web platform is proven.

## Current position

### Executive assessment

The repository has a credible API-first foundation, not a disposable prototype. The selected stack, boundaries, database direction, design tokens, and initial documentation follow the master specification. However, only authentication, event listing, and basic event creation form a working vertical slice. The invitation-management product is not yet feature-complete or release-ready.

Approximate completion, weighted by usable product capability rather than lines of code:

| Scope                       | Current estimate | Assessment                                                                                                                                                 |
| --------------------------- | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering foundation      |           55–65% | Good direction; production infrastructure and integration coverage remain incomplete.                                                                      |
| MVP 1 — Foundation          |              60% | Monorepo, API, schema, auth foundation, CI, tokens, and docs exist. Worker, deployment environments, full authorization, and production operations do not. |
| MVP 2 — Event creation      |           35–45% | Create/list works through the real API and database. Detail, update, settings, lifecycle, switcher, dashboard, and onboarding wizard are missing.          |
| MVP 3 — Guest management    |           10–15% | Core tables and invitation-domain rules exist. There is no guest/invitation API or user interface.                                                         |
| MVP 4 — WhatsApp            |             0–5% | Architecture and status vocabulary are documented; provider, worker, queues, messages, webhooks, and retries are absent.                                   |
| MVP 5 — RSVP                |           10–15% | RSVP calculation and persistence models exist. Public APIs, atomic service flow, guest screens, and WhatsApp response handling are absent.                 |
| MVP 6 — Reminders           |               0% | Not implemented.                                                                                                                                           |
| MVP 7 — Team                |            5–10% | Membership tables and a permission map exist, but there is no central authorization service, team API, UI, or permission test suite.                       |
| MVP 8 — Reports and billing |               0% | Not implemented beyond design/specification intent.                                                                                                        |
| MVP 9 — Check-in            |               0% | Not implemented.                                                                                                                                           |
| Public-release readiness    |           10–15% | Local builds work, but staging, deployment, observability, backups, security verification, PDPL operations, and release exercises remain.                  |

These percentages are planning indicators, not delivery estimates.

### What is implemented now

- A `pnpm` and Turborepo monorepo with strict TypeScript packages.
- Next.js App Router web application and independent NestJS `/api/v1` service.
- PostgreSQL and Prisma with one reviewed initial migration.
- Ten database models: users, events, memberships, invitation groups, guest members, RSVP, RSVP members, public capabilities, RSVP history, and audit logs.
- Core database keys, indexes, foreign keys, non-negative count constraints, and event-creation transaction handling.
- Supabase-compatible passwordless phone authentication and API-side JWT verification.
- A local-only test-login path that is accepted only when both the API and web run in the exact `development` environment.
- Event list and event creation endpoints backed by PostgreSQL.
- Event creation atomically creates owner membership and an audit record.
- Zod validation for event creation and a consistent API error envelope.
- Invitation structure and RSVP calculation rules in the domain package.
- Four invitation/RSVP invariant tests and three development-auth safety tests.
- Canonical design tokens with generated web CSS, Swift, and Kotlin outputs.
- Ten production TypeScript UI components derived from the supplied Dawah design system.
- Arabic RTL authentication and event-list/create screens with loading, empty, and error states.
- A manually maintained OpenAPI 3.1 contract for liveness and the two event endpoints.
- Basic GitHub Actions checks for installation, generation, formatting, OpenAPI linting, type checking, tests, and builds.
- Local PostgreSQL and Redis services through Docker Compose.
- Initial ADRs, architecture/security documents, and short operational runbooks.

### Important gaps and risks

1. **The core product loop is missing.** There is no invitation CRUD, guest management, WhatsApp send, public invitation, RSVP submission, reminder, or report flow.
2. **Authorization is not complete.** Event listing is membership-scoped, but the permission map is not enforced by a central authorization service and has no cross-event isolation suite.
3. **The schema is only the first subset.** Message, attempt, batch, webhook, reminder, import, template, asset, export, notification, credit, and check-in models are absent.
4. **Redis is running but unused.** There is no `apps/worker`, BullMQ queue, retry policy, idempotency store, or dead-letter handling.
5. **The design-system port is partial.** Ten of the 31 supplied component families have been converted; the full dashboard, guest invitation, WhatsApp, and onboarding kits are not implemented.
6. **Localization is not established.** Visible Arabic is hard-coded and English LTR is not available through translation keys.
7. **The API contract can drift.** Static OpenAPI and NestJS runtime documentation are separate, and no generated TypeScript/Swift/Kotlin client pipeline exists.
8. **Testing is far below the production bar.** There are seven unit tests, with no database integration suite, cross-tenant tests, Playwright E2E, Storybook visual tests, axe checks, webhook fixtures, or load tests.
9. **Production operations are documents rather than capabilities.** There are no API/worker container images, staging/prod deployment definitions, structured logging, Sentry, metrics, alerting, proven backup restore, or rollback exercise.
10. **Saudi PDPL readiness is incomplete.** Data locations, subprocessors, retention, deletion, access/export handling, incident response, and production-access logging still require implementation and review.

## Delivery rules for all stages

- Work in vertical slices: business rule → migration → domain service → API contract → authorization → tests → UI → E2E.
- Keep the NestJS API as the source of business behavior; web and future native apps remain clients.
- Preserve the supplied Dawah visual system. Arabic RTL is the source experience and English LTR is derived.
- Keep invitation-group, named-guest, expected-attendee, RSVP, and delivery concepts explicit and separate.
- Require idempotency and a server-generated confirmation summary for high-impact sends, reminders, credits, RSVP changes, and check-ins.
- Add reviewed forward migrations; never use `db push` as a release mechanism.
- Do not advance a stage while its exit gate has blocking failures.

## Ten-stage production roadmap

### Stage 1 — Harden the engineering baseline

Goal: finish MVP 1 so every later vertical slice is built on a repeatable, production-shaped foundation.

Status: **Complete** — exit gate verified on 2026-09-06.

Work:

- Add typed environment validation and fail startup on missing or unsafe production configuration.
- Decide and enforce one OpenAPI source-of-truth workflow; add generated TypeScript client output and compatibility checks.
- Add `apps/worker` with a health-only BullMQ skeleton and shared queue configuration.
- Add production Dockerfiles for API and worker, graceful shutdown, payload limits, CSP/security headers, and `/health/ready` dependency checks.
- Extend CI with linting, PostgreSQL/Redis services, migration deployment, database integration tests, worker build, and artifact checks.
- Create deterministic test factories, database cleanup, seed/fixture conventions, and separate local/test/staging/production configuration.
- Keep the development auth bypass explicitly gated and prove that production configuration rejects it.
- Remove generated build artifacts from normal source changes and document the one-command local startup path.

Exit gate:

- A clean checkout can install, migrate, start web/API/worker, and pass CI without manual repair.
- CI runs format, lint, OpenAPI validation, type checks, unit tests, integration tests, and all three builds.
- Production-mode tests prove that test authentication and unsafe defaults cannot activate.

Verification record:

- Frozen-lockfile installation, generation, migration deployment, and the documented one-command local startup completed without manual repair.
- Format, lint, OpenAPI lint/generation drift, type checks, all web/API/worker builds, and tracked-artifact checks passed.
- 21 unit/contract tests and 2 real-PostgreSQL integration tests passed.
- Built web/API/worker startup smoke checks passed, including every documented OpenAPI operation.
- Production API and worker images built and passed container readiness checks against PostgreSQL and Redis.

### Stage 2 — Complete the design system, localization, and accessibility base

Goal: make the supplied design system the reusable, tested foundation for every host and guest screen.

Work:

- Port the remaining supplied components, including navigation, selection, table, drawer, toast, banner, progress, timeline, phone, and guest controls.
- Add Storybook stories for Arabic RTL, English LTR, desktop, mobile, loading, empty, error, disabled, focus, and destructive states.
- Introduce translation keys and locale routing for `ar-SA` and `en`; eliminate hard-coded product copy from reusable components.
- Add responsive host shell behavior: right-side navigation in RTL, collapsed navigation, and mobile bottom navigation.
- Implement self-hosted production font assets or document and approve the external-font dependency.
- Add keyboard interaction tests, axe checks, and visual regression for critical components and layouts.

Exit gate:

- All components needed by the host dashboard and guest RSVP journey are typed, documented, accessible, and visually verified in RTL and LTR.
- No critical user journey depends on a missing design-system primitive.

### Stage 3 — Complete event onboarding and the event workspace

Goal: deliver the full MVP 2 event lifecycle and a stable place for later modules to live.

Work:

- Add get, update, archive, recovery-request, status-transition, and dashboard-summary event endpoints.
- Add event-scoped membership resolution to every event query and mutation.
- Implement the supplied multi-step event onboarding flow, event switcher, settings, responsive dashboard shell, and overview.
- Add server-side aggregate semantics for invitation groups, named guests, and expected attendees, initially returning zeros where no records exist.
- Add time-zone-safe date/time behavior, map links, lifecycle rules, loading/error states, audit records, and event integration tests.
- Make “Open event” navigate to a real event workspace.

Exit gate:

- A host can create, open, edit, switch, and archive events through tested APIs and the responsive UI.
- User A cannot access or mutate User B's event in automated integration tests.

### Stage 4 — Deliver invitation groups and guest management

Goal: complete the stable guest-management core required before WhatsApp sending.

Work:

- Add Invitations and Guests modules with create, read, edit, cancel, search, filter, sort, pagination, and bulk-selection APIs.
- Enforce all `SINGLE`, `NAMED_GROUP`, and `PRIMARY_WITH_COMPANIONS` invariants in the domain layer and transaction boundary.
- Normalize phones to E.164 with GCC support and preserve country metadata.
- Add duplicate detection within an event, explicit host override, and append-only audit evidence.
- Implement the supplied guest table, add/edit/detail drawers, invitation-type selection, member editor, companion stepper, filters, and bulk actions.
- Add a central authorization service/guard and enforce `guest.*` permissions, including masking phones for unauthorized roles.
- Add domain, database, API, permission, and cross-tenant tests.

Exit gate:

- Hosts can reliably manage hundreds of invitation groups without confusing groups, named people, or expected attendance.
- All invitation invariants, duplicate decisions, authorization paths, and pagination behavior are tested.

### Stage 5 — Build imports, invitation templates, assets, and preparation workflows

Goal: let hosts prepare large, valid invitation lists and approved invitation content before sending.

Work:

- Add object storage abstraction and private buckets/keys for imports, event imagery, invitation assets, and generated files.
- Add import job/row models and worker jobs for `.xlsx` and `.csv` parsing.
- Implement upload, column mapping, row validation, error review, correction, confirmation, cancellation, and audited import.
- Validate MIME, extension, size, parser limits, filenames, image dimensions, and malicious-content risks.
- Add invitation template and immutable message-variable snapshot models.
- Implement the supplied invitation/WhatsApp preview experience and readiness validation.
- Add import fixtures and integration tests for malformed, duplicate, GCC phone, group-member, and large-file cases.

Exit gate:

- A representative large spreadsheet can be imported with row-level errors and no partial silent corruption.
- Every invitation has a server-computed readiness result and a reproducible content snapshot before send.

### Stage 6 — Implement WhatsApp messaging and the reliable worker

Goal: complete MVP 4 with safe, observable, asynchronous Meta WhatsApp delivery.

Work:

- Add provider abstraction and `MetaWhatsAppProvider` with approved Arabic and English templates.
- Add message, message-attempt, send-batch, webhook-event, and idempotency persistence.
- Implement readiness summary, host confirmation, credit estimate, idempotent batch creation, and one logical queued job per invitation group.
- Implement bounded concurrency, provider rate-limit handling, exponential backoff, permanent-failure classification, and dead-letter/error review.
- Persist provider message IDs and immutable template/variable snapshots.
- Add signed webhook verification, fast acknowledgement, deduplication, asynchronous processing, and out-of-order state reduction.
- Implement sending-center progress, delivery status, failed-message review, and safe resend behavior.
- Add representative Meta contract fixtures and tests for duplicate, malformed, failed, and out-of-order events.

Exit gate:

- A 2,000-invitation test batch queues without blocking the API, double-sending, or double-charging.
- Delivery states reconcile from verified webhooks and permanent failures are actionable without PII in logs.

### Stage 7 — Deliver accountless public invitations and RSVP

Goal: complete MVP 5 with a simple, private, mobile-first guest journey.

Work:

- Generate high-entropy public capabilities, store only hashes, and support expiry/revocation.
- Add minimal public invitation retrieval and RSVP endpoints with strict response shaping and rate limits.
- Add private-page headers and metadata: `noindex`, `nofollow`, `noarchive`, restrictive caching, and abuse controls.
- Implement the supplied guest invitation screens for single, named-family, and companion invitations, including open, closed, completed, and edited states.
- Atomically update RSVP, member attendance, expected count, RSVP history, and audit records.
- Support guest edits, host manual edits, and WhatsApp interactive response mapping without duplicate application.
- Send confirmation messages through the worker and expose updated aggregates to the host dashboard.
- Add accessibility, elderly-user, mobile viewport, transaction, idempotency, and cross-invitation privacy tests.

Exit gate:

- Every invitation type completes end to end from private link or mock WhatsApp response to accurate dashboard counts and history.
- Repeated or concurrent submissions cannot corrupt attendance totals or expose another invitation.

### Stage 8 — Add reminders, team collaboration, and full authorization

Goal: complete MVP 6 and MVP 7 without weakening event isolation or causing reminder spam.

Work:

- Add reminder rule/run models, eligibility domain service, manual batches, scheduled jobs, cooldowns, and reminder history.
- Never target accepted, partially accepted, declined, cancelled, or recently reminded invitation groups.
- Add co-host invitation, acceptance, revocation, role, custom permission, and team-management APIs and screens.
- Apply central permission checks to every event resource and high-impact action.
- Add notifications derived from meaningful domain events, such as completed batches and provider failures.
- Expand audit coverage for team, permission, reminder, RSVP, export, and destructive actions.
- Add permission matrices, cross-tenant integration tests, reminder eligibility tests, and duplicate reminder protection.

Exit gate:

- Owners and co-hosts can collaborate according to explicit event-scoped permissions.
- Reminder selection is explainable, audited, idempotent, and protected against accidental repeated sends.

### Stage 9 — Complete reports, exports, credits, and event-day check-in

Goal: deliver MVP 8 and a feature-flagged MVP 9 suitable for a controlled event pilot.

Work:

- Add server-side dashboard and report queries for invitation groups, named guests, expected attendance, RSVP, delivery, invitation type, check-in, and no-shows.
- Add background XLSX/CSV exports with private storage and expiring signed URLs.
- Add an append-only credit ledger, reservations, usage, refund, adjustment, and reconciliation logic; avoid invented commercial pricing.
- Add a payment-provider interface while keeping payment activation behind a commercial feature flag.
- Add opaque QR pass tokens, resolve and check-in APIs, partial attendance, manual search, duplicate-scan response, and audit records.
- Add the web scanner/event-day dashboard with clear online status; do not promise offline duplicate prevention.
- Add feature flags and API version metadata needed by future native clients.
- Run query-plan review and load tests for dashboards, 20,000-row exports, concurrent check-in, send launch, and webhook spikes.

Exit gate:

- Reports reconcile against source records, exports complete asynchronously, and credit accounting cannot go negative or charge a logical send twice.
- A controlled event-day test handles concurrent and repeated scans safely.

### Stage 10 — Production assurance, pilot, and release

Goal: prove that the complete system can be deployed, operated, recovered, and safely released.

Work:

- Provision isolated development, staging, and production environments in an approved region/provider configuration.
- Configure domains, TLS, restrictive CORS/CSP, secret management, rotation, Supabase Auth, Meta WhatsApp, object storage, and managed PostgreSQL/Redis.
- Add structured redacted logging, Sentry, request/error/queue/provider metrics, dashboards, alerts, and trace/correlation IDs.
- Configure automated backups and point-in-time recovery, then perform and record a non-production restore drill.
- Complete the Saudi PDPL data map, processor/location inventory, privacy notice, retention schedule, deletion/recovery workflow, access/export workflow, incident response, and production-access policy with legal/operational review.
- Finish Playwright journeys, visual regression, accessibility checks, WhatsApp contracts, integration tests, security tests, dependency review, and k6 thresholds.
- Conduct security review for authentication, authorization, cross-event isolation, public capabilities, webhooks, uploads, secrets, and operational access.
- Rehearse forward migration, rollback, provider outage, queue backlog, database restore, credential rotation, and event-night incident procedures.
- Run an internal alpha, staging acceptance, limited real-event Saudi pilot, remediation window, and final go/no-go review.
- Release gradually with feature flags, monitored thresholds, named on-call ownership, and an immediately executable rollback plan.

Exit gate:

- Every item in the master production-readiness checklist has recorded evidence, an approved exception, or is disabled behind a verified feature flag.
- The pilot succeeds without data-isolation, message-duplication, attendance-count, privacy, or recovery failures.
- Product, engineering, security, operations, and business owners approve general availability.

## Release milestones

| Milestone                          | Required stages                   | Audience                                                        |
| ---------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Development foundation             | Stage 1                           | Engineering team                                                |
| Internal product alpha             | Stages 2–5                        | Team and trusted internal testers                               |
| Messaging/RSVP staging beta        | Stages 6–8                        | Selected stakeholders using non-production provider credentials |
| Controlled real-event pilot        | Stage 9 plus Stage 10 pilot gates | A small number of explicitly supported Saudi events             |
| Production v1 general availability | All Stage 10 exit criteria        | Public hosts                                                    |
| Native host/check-in applications  | Post-release roadmap              | iOS and Android users after the API is stable                   |

## Immediate next action

Begin Stage 2 by completing the reusable design-system primitives, documenting their RTL/LTR and responsive states in Storybook, and establishing the `ar-SA` and `en` localization and accessibility baselines. Keep the Stage 1 configuration, contract, integration, and runtime gates green while product screens are expanded.
