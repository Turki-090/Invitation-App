# Dawah production and release plan

Status date: 2026-09-13

The “Current position” section reflects the verified repository state through
Stage 8. Dated completion records under each roadmap stage remain the detailed
source of evidence.

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

Stages 1 through 8 have closed their repository exit gates. The application now
has a tested end-to-end host and guest loop: authentication, localized event
management, guest preparation, asynchronous WhatsApp delivery, accountless
public invitations, RSVP edits, confirmation messages, and reconciled dashboard
counts, plus explainable reminders and event-scoped team collaboration. The
product is not ready for general availability: reports, exports, credits,
check-in, and production assurance remain in Stages 9 and 10.

Current delivery state:

| Scope                       | Status      | Remaining work                                                                      |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Engineering foundation      | Complete    | Production deployment and operations are intentionally completed in Stage 10.       |
| MVP 1 — Foundation          | Complete    | No open repository exit-gate work.                                                  |
| MVP 2 — Event creation      | Complete    | No open repository exit-gate work.                                                  |
| MVP 3 — Guest management    | Complete    | No separate post-release import expansion is planned.                               |
| MVP 4 — WhatsApp            | Complete    | Live provider acceptance is tracked under Stage 10 staging assurance.               |
| MVP 5 — RSVP                | Complete    | Live provider acceptance is tracked under Stage 10 staging assurance.               |
| MVP 6 — Reminders           | Complete    | No open repository exit-gate work; live provider acceptance remains Stage 10.       |
| MVP 7 — Team                | Complete    | No open repository exit-gate work.                                                  |
| MVP 8 — Reports and billing | Not started | Stage 9 reports, private exports, credit ledger, and payment abstraction.           |
| MVP 9 — Check-in            | Not started | Stage 9 feature-flagged QR and event-day workflow.                                  |
| Public-release readiness    | Not started | Stage 10 environments, assurance, compliance, pilot, and general-availability work. |

### What is implemented now

- A strict `pnpm`/Turborepo workspace with Next.js, NestJS, BullMQ, Prisma,
  PostgreSQL, Redis, private object storage, generated API clients, production
  containers, and repeatable CI/repository validation.
- A complete Arabic RTL and English LTR design-system foundation with responsive
  host/guest shells, local fonts, Storybook, accessibility checks, and visual
  regression baselines.
- Authenticated event onboarding, lifecycle management, settings, switching,
  dashboard summaries, central event access checks, cross-tenant denial, and
  append-only audit evidence.
- Invitation-group and named-guest management for every supported invitation
  type, including search, pagination, bulk actions, phone normalization,
  duplicate control, hardened CSV/XLSX preparation imports, private assets,
  templates, previews, readiness, and immutable snapshots.
- Provider-neutral WhatsApp messaging with idempotent batches, bounded workers,
  durable attempts, retries, permanent-failure review, signed private media,
  verified/deduplicated webhooks, out-of-order reduction, and safe resends.
- Secure accountless invitation capabilities and a mobile-first guest RSVP flow,
  including atomic member coverage, history, idempotency, host and guest edits,
  deterministic WhatsApp actions, and serialized confirmation delivery.
- Event-scoped co-host and check-in-staff invitations with phone-bound one-time
  acceptance credentials, revocation, default roles, exact custom allow-lists,
  delegation ceilings, owner-only capabilities, team screens, and operational
  notifications.
- Manual and scheduled reminders with server-confirmed eligibility, immutable
  decisions, cooldown and maximum-send controls, claim-time revalidation,
  deterministic queue identity, pending-batch recovery, and localized host UI.
- Verified forward migrations and broad unit, contract, component, accessibility,
  visual, database, queue, startup, and production-container coverage through
  Stage 8.

### Important gaps and risks

1. **Reporting, exports, commercial accounting, and check-in are still absent.**
   Stage 9 must add reconciled server queries, asynchronous private exports, an
   append-only credit ledger, and feature-flagged event-day scanning.
2. **No real staging provider exercise has been recorded.** Repository mocks and
   contract tests are comprehensive, but Stage 10 must exercise Meta templates,
   signed media, callbacks, and RSVP confirmations using deployed
   non-production configuration.
3. **Production operations remain unproven.** Isolated environments,
   observability, alerting, backup/PITR recovery, rollback, outage, queue-backlog,
   and credential-rotation drills remain Stage 10 work.
4. **Release governance remains open.** Saudi PDPL operational/legal review,
   security review, staging acceptance, the controlled Saudi pilot, remediation,
   named ownership, and final go/no-go approval have not occurred.

## Delivery rules for all stages

- Work in vertical slices: business rule → migration → domain service → API contract → authorization → tests → UI → E2E.
- Keep the NestJS API as the source of business behavior; web and future native apps remain clients.
- Preserve the supplied Dawah visual system. Arabic RTL is the source experience and English LTR is derived.
- Keep invitation-group, named-guest, expected-attendee, RSVP, and delivery concepts explicit and separate.
- Require idempotency and a server-generated confirmation summary for high-impact sends, reminders, credits, RSVP changes, and check-ins.
- Add reviewed forward migrations; never use `db push` as a release mechanism.
- Do not advance a stage while its exit gate has blocking failures.

## Ten-stage production roadmap

Scope decision (2026-09-12): the former post-release Stage 11 import expansion
has been removed. The secure CSV/XLSX preparation import delivered in Stage 5
remains supported; no separate follow-on import stage is planned.

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

Status: **Complete** — exit gate verified on 2026-09-06.

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

Verification record:

- All 30 supplied component families plus `HostShell`, `Drawer`, and `GuestShell` are exported from the typed `@dawah/ui` package and documented with their responsive and accessibility contracts.
- Locale-prefixed `ar-SA` and `en` routes, dictionary parity, `Accept-Language` redirects, RTL/LTR document direction, and localized reusable-component copy are implemented and tested.
- Pinned local Fontsource packages provide the Arabic, Latin, display, and monospaced production fonts without a runtime third-party font dependency.
- Storybook builds 15 state, catalogue, host, and guest stories; 22 locale-and-viewport axe cases pass with zero violations, and 20 committed RTL/LTR visual baselines pass unchanged.
- The full suite passes 40 unit/contract tests and 2 real-PostgreSQL integration tests, including keyboard, selection, required-field, responsive action, funnel semantics, locale, and proxy coverage.
- Frozen installation, generation, format, lint, OpenAPI drift, type checks, production web/API/worker builds, tracked-artifact checks, live startup smoke, production image builds, and API/worker container readiness all pass.

### Stage 3 — Complete event onboarding and the event workspace

Goal: deliver the full MVP 2 event lifecycle and a stable place for later modules to live.

Status: **Complete** — exit gate verified on 2026-09-07.

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

Verification record:

- The canonical OpenAPI contract, generated TypeScript client, NestJS controller, and runtime Zod schemas cover event detail, update, archive, audited recovery, lifecycle transition, and dashboard summary without generation drift or lint warnings.
- Every event read and mutation resolves an active event membership and required capability. Missing events, non-members, and revoked members share the anti-enumeration `404` path; active members without permission receive `403`.
- The localized four-step onboarding wizard, real “Open event” routes, event switcher, responsive overview, settings form, lifecycle controls, archive confirmation, recovery action, and loading/error/zero states are implemented in Arabic RTL and English LTR.
- PostgreSQL computes explicit invitation-group, named-guest, expected-attendee, and RSVP-group aggregates; calendar dates, local wall-clock times, IANA zones, map destinations, lifecycle edges, and archive recovery semantics have canonical validation and documentation.
- 51 unit/contract/component tests and 8 real-PostgreSQL integration tests pass. The integration suite denies User A across every read and mutation on User B's event and verifies that no cross-tenant mutation occurs.
- Format, lint, OpenAPI validation/drift, type checks, production web/API/worker builds, tracked-artifact checks, startup smoke, 42 Storybook accessibility/visual cases, and production API/worker container readiness all pass.
- Live browser verification passed for the seeded English desktop workspace, English mobile workspace/settings, and Arabic RTL mobile overview/onboarding, with no horizontal overflow or browser-console errors.

### Stage 4 — Deliver invitation groups and guest management

Goal: complete the stable guest-management core required before WhatsApp sending.

Status: **Complete** — exit gate verified on 2026-09-08.

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

Verification record:

- The canonical OpenAPI contract, generated TypeScript client, NestJS invitation module, and runtime Zod schemas cover event-scoped list, create, detail, edit, single cancel, and bulk cancel, with deterministic search, filters, sorting, and pagination.
- Domain rules and deferred PostgreSQL transaction constraints enforce every `SINGLE`, `NAMED_GROUP`, and `PRIMARY_WITH_COMPANIONS` shape, including primary-member uniqueness, positive positions, companion limits, RSVP-safe structure edits, and atomic rollback on invalid aggregates.
- GCC and valid international phones normalize to E.164 while retaining country metadata. Event-scoped duplicate detection is concurrency-safe, requires an explicit host override, and writes append-only audit evidence without exposing phone PII.
- Every invitation read and mutation uses central event access checks for `guest.*` capabilities. Phone search and full phone values are withheld from unauthorized roles, and cross-tenant reads, edits, cancels, bulk actions, and duplicate probes follow the anti-enumeration path.
- The localized Arabic RTL and English LTR guest workspace provides responsive table and mobile-card views, invitation metrics, search/filter/sort/pagination, selection and bulk cancel, type-aware add/edit/detail drawers, named-member editing, companion counts, duplicate confirmation, and complete loading, empty, and error states.
- 81 unit/contract/component tests and 17 real-PostgreSQL integration tests pass. Invitation coverage includes all three group types, transaction failures, duplicate override and concurrent same-phone creation, RSVP edit locks, permission masking, all mutations across tenants, and deterministic navigation through a 125-group fixture.
- Format, lint, OpenAPI validation/drift, type checks, production web/API/worker builds, tracked-artifact checks, startup smoke, 42 Storybook accessibility/visual cases, and production API/worker container readiness all pass.
- Live browser verification passed the English desktop creation, duplicate-override, populated-table, and drawer flows plus the Arabic RTL mobile flow, with zero axe violations, horizontal overflow, page errors, or browser-console errors.

### Stage 5 — Build imports, invitation templates, assets, and preparation workflows

Goal: let hosts prepare large, valid invitation lists and approved invitation content before sending.

Status: **Complete** — exit gate verified on 2026-09-09.

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

Verification record:

- Private object storage now uses strict tenant/event-scoped keys for import sources, event imagery, invitation assets, and generated files. Uploads enforce extension, MIME, byte, filename/control-character, image-dimension, decoding, and parser limits; image assets are decoded and re-encoded before storage.
- PostgreSQL-backed import jobs and rows, BullMQ worker processing, and the localized preparation workspace implement upload, mapping, validation, paged error review, optional-field correction, explicit duplicate decisions, revalidation, atomic confirmation, cancellation cleanup, and append-only audit evidence for UTF-8 CSV and hardened XLSX input.
- The representative PostgreSQL integration fixture parses 1,003 rows, preserves row-level parser findings, corrects and revalidates recoverable errors, imports 1,001 groups atomically, explicitly skips two duplicates, rejects cross-tenant access, and proves idempotent confirmation without partial or silent corruption.
- Versioned invitation templates support lifecycle and locale-family locking. Server preview/readiness covers every active invitation, while immutable content snapshots retain source hashes and rendered variables so approved output remains reproducible after later guest or template edits.
- The Arabic RTL and English LTR preparation route provides asset management, CSV/XLSX import and review, template editing/approval, invitation and WhatsApp previews, readiness issues, and snapshot creation with responsive loading, empty, and error states.
- 194 unit, contract, component, parser, storage, API, and worker tests plus 19 real-PostgreSQL integration tests pass. Format, lint, OpenAPI validation/drift, Prisma validation/drift, type checks, production builds, startup smoke, 42 Storybook accessibility/visual cases, a live S3-compatible storage round trip, and production API/worker container readiness all pass.

### Stage 6 — Implement WhatsApp messaging and the reliable worker

Goal: complete MVP 4 with safe, observable, asynchronous Meta WhatsApp delivery.

Status: **Complete** — repository exit gate verified on 2026-09-10. Live Meta
provider acceptance is tracked as deployed-environment evidence in Stage 10.

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

Implementation record:

- A provider-neutral messaging package and Meta WhatsApp adapter send approved,
  locale-specific template snapshots and persist the returned provider message
  identifier. Provider timeouts and network breaks are classified as ambiguous
  instead of being retried blindly.
- The forward Stage 6 migration adds tenant-bound send batches, immutable logical
  messages, numbered attempts, deduplicated webhook evidence, and event-scoped
  idempotency records. Constraints and triggers protect one initial invitation
  send, logical credit identity, snapshot fidelity, provider correlation, and
  completed evidence from mutation.
- Authenticated readiness and batch APIs revalidate current Stage 5 snapshots,
  issue confirmations valid for at least five and at most ten minutes, hash
  idempotency keys, persist under `ReadCommitted` advisory/row locks, and enqueue
  deterministic batch and message jobs. A saved or dispatch-exhausted batch can
  be recovered by replaying the identical request with the same key.
- The worker applies configurable concurrency and sends-per-second limits,
  bounded exponential retries, provider `Retry-After`, permanent failure
  classification, and conservative ambiguous-outcome handling for bare HTTP
  408/5xx, timeouts, and network breaks. Database row claims and attempt fencing
  prevent stale worker completion from overwriting newer evidence.
- The raw-body webhook endpoint verifies HMAC signatures, rejects malformed
  payloads and mismatched configured phone-number IDs, deduplicates stable
  provider event IDs, persists evidence before queueing, and handles early and
  out-of-order states through provider-ID or logical callback-ID correlation.
  `FAILED` outranks `SENT` but not delivered/read/responded evidence. Host-facing
  batch detail masks phone numbers, and safe resend copies a corrected current
  snapshot into a separately confirmed successor instead of rewriting history.
- Image-backed templates use a short-lived HMAC URL bound to the immutable
  snapshot ID, asset checksum, and expiry. The API validates the capability
  before lookup, reads only from private storage, and rechecks MIME, length,
  configured size, and SHA-256 before streaming. Deployed environments require a
  remote HTTPS base URL and a non-placeholder secret shared by API and worker;
  media capability query strings must be redacted from infrastructure logs.
  Assets referenced by immutable snapshots are retention-locked in both the API
  and database so template archival cannot strand queued image delivery.
- The event API exposes the caller's actual `canSendInvitations` capability. The
  localized sending center hides or denies the route accordingly and maps stable
  failure/resend codes to Arabic and English guidance without surfacing provider
  prose.
- Focused tests and a real-PostgreSQL 2,000-invitation integration scenario cover
  the provider contract, conservative retry/status policy, concurrent
  idempotency, stale worker completion, signed early/out-of-order webhooks,
  queue-exhaustion and redelivery recovery, permanent failure, logical credit
  count, corrected resend linkage, and an image-backed template capability. The
  same scenario fans out through an isolated real Redis/BullMQ prefix twice and
  proves exactly 2,000 unique deterministic waiting jobs.
- Verification recorded on 2026-09-10: all 250 unit, contract, component,
  provider, storage, API, and worker tests; all 21 real PostgreSQL/Redis
  integration tests; format; lint; OpenAPI validation and drift; Prisma
  validation; type checks; production builds; tracked-artifact checks; startup
  smoke; 42 Storybook accessibility/visual cases; and production API/worker
  container readiness passed. The repository exit gate is closed. The live
  non-production Meta exercise is tracked under Stage 10 because it requires
  deployed credentials and provider-side configuration.

### Stage 7 — Deliver accountless public invitations and RSVP

Goal: complete MVP 5 with a simple, private, mobile-first guest journey.

Status: **Complete** — exit gate verified on 2026-09-12.

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

Implementation record (completed 2026-09-12):

- Public links use 256-bit opaque capabilities. Only SHA-256 hashes are stored;
  issue, rotation, expiry, cancellation/archive state, and revocation are
  enforced with uniform public not-found responses and audited host controls.
  Guest GET/POST routes have private no-store/noindex headers, strict response
  schemas, trusted-proxy handling, and per-client/per-capability rate-limit
  buckets that do not retain raw tokens or collapse server-rendered links into
  one shared limiter.
- The localized, mobile-first guest route supports single, named-group, and
  companion invitations in Arabic/RTL and English/LTR, including open, closed,
  completed, existing, edited, retry, duplicate-click, and API failure states.
  Guest copy uses the elderly-user body scale, and the two representative
  390-pixel viewport stories are covered by axe and visual baselines.
- RSVP writes are serialized on the invitation and atomically replace complete
  member coverage, derive status/count, append immutable before/after history,
  persist canonical idempotency results, audit the actor/source, and create a
  durable confirmation outbox entry. The migration repairs legacy sparse member
  coverage and reconstructs internally consistent history snapshots before
  enabling deferred cross-table aggregate constraints.
- WhatsApp sends carry stable callback payloads from an immutable invitation and
  member binding. Presentations stay within Meta's three-button limit and avoid
  non-actionable selection replies. Delayed callbacks cannot overwrite newer
  web/host intent; same-second callbacks use a durable ingestion sequence.
  Pending confirmations are superseded by newer edits, and an already-started
  confirmation serializes later sends for that invitation. API and sweeper jobs
  both honor the configured bounded retry ceiling.
- Verification recorded on 2026-09-12: all 295 unit, contract, component,
  provider, storage, API, and worker tests; all 32 real-PostgreSQL integration
  tests; format; lint; OpenAPI validation and generated-client drift; Prisma
  validation and schema drift; type checks; production builds; tracked-artifact
  checks; startup smoke; all 46 Storybook accessibility/visual cases; and
  production API/worker container readiness passed. The repository exit gate is
  closed. Live provider acceptance remains Stage 10 deployed-environment work
  and does not reopen the Stage 7 implementation gate.

### Stage 8 — Add reminders, team collaboration, and full authorization

Goal: complete MVP 6 and MVP 7 without weakening event isolation or causing reminder spam.

Status: **Complete** — repository exit gate verified on 2026-09-13.

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

Implementation record:

- Added event team invitations, phone-bound one-time acceptance, membership
  lifecycle, default roles, exact custom permission allow-lists, delegation
  ceilings, non-delegable owner capabilities, team management screens, and
  localized invitation acceptance.
- Routed event APIs through the central active-membership permission evaluator,
  including purpose-scoped template preparation. Cross-event identifiers remain
  indistinguishable from missing resources, and full phone visibility remains a
  separate capability.
- Added reminder rules, immutable run decisions, recipient cooldown state,
  manual confirmation, scheduled evaluation, claim-time RSVP/cancellation
  revalidation, idempotent send batches, history, audits, and meaningful
  completion/failure notifications.
- Added deterministic reminder sweep and dispatch jobs. Each sweep also
  reconciles durable queued reminder batches so an enqueue interruption after
  database commit cannot strand work or create a duplicate logical send.
- Added Arabic/English reminder, team, acceptance, and notification interfaces,
  including creation, approval, and snapshot preparation for reminder-purpose
  templates.
- Added the reviewed Stage 8 forward migration with tenant-safe composite keys,
  lifecycle and JSON-shape checks, one-pending-invite and reminder-run uniqueness,
  immutable decision evidence, and owner-membership protection triggers.
- Verification recorded on 2026-09-13: all 374 unit, contract, component,
  provider, storage, API, and worker tests; all 35 real-PostgreSQL integration
  tests; format; lint; OpenAPI validation and generated-client drift; Prisma
  validation and schema drift; type checks; production builds; tracked-artifact
  checks; startup smoke; all 46 Storybook accessibility/visual cases; and
  production API/worker container readiness passed. The repository exit gate is
  closed. Live provider acceptance remains Stage 10 deployed-environment work.

### Stage 9 — Complete reports, exports, credits, and event-day check-in

Goal: deliver MVP 8 and a feature-flagged MVP 9 suitable for a controlled event pilot.

Status: **Next** — active implementation stage after the completed Stage 8 gate.

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

Status: **Planned** — external environment preparation may proceed in parallel;
pilot and release gates follow Stage 9.

Work:

- Provision isolated development, staging, and production environments in an approved region/provider configuration.
- Configure domains, TLS, restrictive CORS/CSP, secret management, rotation, Supabase Auth, Meta WhatsApp, object storage, and managed PostgreSQL/Redis.
- Exercise approved non-production Meta templates end to end in staging,
  including a real signed image fetch, outbound delivery, verified status and
  interactive callbacks, RSVP reconciliation, and the latest confirmation send.
  Record provider evidence without retaining guest PII or credentials.
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

Begin Stage 9 with reconciled report aggregates and asynchronous private exports,
then add the append-only credit ledger and feature-flagged check-in workflow. In
parallel, prepare the Stage 10 staging dependencies needed for the live Meta
acceptance exercise: approved templates, a non-production phone-number ID and
recipient, public HTTPS media and webhook routes, and securely managed
credentials.
