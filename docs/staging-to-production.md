# Staging-to-production launch runbook

Updated: 2026-09-27. Status: **Not launched; Stage 1 is in progress.**

This is the execution checklist for taking Dawah from the current repository
to a supported production web release. These launch stages are separate from
the historical development stages in [the release roadmap](production-release-plan.md).
Use [the production-readiness checklist](production-readiness-checklist.md)
as the evidence register and [the release policy](operations/release-and-rollback.md)
for rollout and rollback decisions.

## Starting position

- The user reports having an Authentica API key. Its validity, environment,
  account balance, template access, and real delivery have not been verified.
- OTP integration exists: Supabase generates and verifies codes; Authentica
  delivers them. The supplied API blueprint documents a custom `otp` field.
  Public documentation differs; account-specific support and live verification
  remain open. See [OTP activation](operations/authentica-otp-activation.md).
- Core web workflows, API, workers, migrations, and CI are implemented.
  Earlier test results do not certify the next release candidate.
- No external deployment, provider activation, pilot, or launch approval is
  claimed by this document. Unchecked items mean evidence is still needed.
- Payments and check-in are optional launch scope. Native apps follow the web
  launch. Authentica login delivery and Meta invitation delivery are separate
  integrations; having an Authentica key does not activate invitation sending.

## How to work through the stages

Assign an owner and record evidence before closing each stage. Evidence should
include date, environment, release commit/image, result, and a link to a CI run,
sanitized test report, or operational record. Never record secrets, OTPs,
session tokens, guest phone numbers, or private invitation links here.

Stages 1–5 establish a working staging environment. Engineering remediation
in Stage 6 and account/legal preparation can proceed alongside provisioning.
Stages 6–8 must close before a real-event pilot. Production provisioning in
Stage 9 precedes the pilot because a pilot already processes real personal data.
Stage 11 opens general availability only after pilot acceptance.

| Stage | Outcome                                       | Status      | Owner      | Evidence                                                                  |
| ----- | --------------------------------------------- | ----------- | ---------- | ------------------------------------------------------------------------- |
| 1     | Accounts, scope, and deployment decisions     | In progress | Unassigned | [Setup record](operations/stage1-setup-record.md); external setup pending |
| 2     | Isolated staging infrastructure               | Pending     | Unassigned | Pending                                                                   |
| 3     | Repeatable staging deployment                 | Pending     | Unassigned | Pending                                                                   |
| 4     | Real OTP login accepted                       | Pending     | Unassigned | Pending                                                                   |
| 5     | Real WhatsApp invitation journey accepted     | Pending     | Unassigned | Pending                                                                   |
| 6     | Engineering and browser journey gaps closed   | Pending     | Unassigned | Pending                                                                   |
| 7     | Operations and recovery proven                | Pending     | Unassigned | Pending                                                                   |
| 8     | Staging, security, and privacy acceptance     | Pending     | Unassigned | Pending                                                                   |
| 9     | Production provisioned for a controlled pilot | Pending     | Unassigned | Pending                                                                   |
| 10    | Real-event pilot reconciled                   | Pending     | Unassigned | Pending                                                                   |
| 11    | Public launch and initial support period      | Pending     | Unassigned | Pending                                                                   |

## Stage 1 — Accounts, scope, and decisions

Working inventory, region decision, and provider setup handoff:
[Stage 1 setup record](operations/stage1-setup-record.md).

- [ ] Name the launch owner and engineering, operations, security/privacy, and
      business decision owners. One person may cover multiple roles explicitly.
- [ ] Choose hosting for the Next.js web app, API, and long-running worker;
      choose managed PostgreSQL, Redis, private object storage, and secret storage.
- [ ] Record intended regions and processing locations for qualified review in
      [the privacy inventory](security/privacy-and-pdpl.md), including Authentica.
- [ ] Choose staging/production web and API domains and identify DNS access.
- [ ] Identify separate staging and production Supabase projects and provider
      credentials. Determine which environment the available Authentica key serves.
- [ ] Confirm Authentica balance, enabled SMS template ID, sender availability,
      and custom-code support. A branded sender is optional if the default is usable.
- [ ] Identify a controlled Saudi test handset; store its number outside Git.
- [ ] Start Meta account, number, and template activation using
      [the Meta runbook](operations/meta-whatsapp-activation.md). Verify current
      provider requirements and pricing during activation; dated notes are not proof.
- [ ] Set initial scope: `BILLING_ENABLED=false`, `PAYMENTS_ENABLED=false`, and
      `CHECK_IN_ENABLED=false` unless separately implemented/accepted launch needs
      justify enabling them. A flag alone does not supply a payment integration.

**Exit:** providers, domains, scope, owners, and secret-storage locations are
recorded; no secret values are included. Hosting-dependent deployment commands
are finalized only after the hosting choice is known.

## Stage 2 — Provision isolated staging

Prerequisite: Stage 1 decisions. Follow [environments](operations/environments.md).
Stages 2–3 on the chosen stack (Render, Neon, Upstash, R2) are written out
step by step in [staging deployment on Render](operations/staging-deploy-render.md).

- [ ] Provision PostgreSQL with TLS, Redis with `rediss://`, and a private
      encrypted storage bucket, with credentials isolated from production.
- [ ] Configure staging DNS, HTTPS, certificate renewal, and exact CORS origins.
- [ ] Place database, Redis, worker health, and metrics behind private access.
      Keep the required API, signed-media, and provider-hook paths reachable.
- [ ] Populate the secret/configuration store from `.env.staging.example`:
      `DAWAH_ENV=staging`, `NODE_ENV=production`, unique queue prefix, both auth
      bypass flags false, and valid environment-specific service settings.
- [ ] Configure the same staging Supabase project on web and API. Keep service
      credentials server-side; only intended public configuration reaches the web.
- [ ] Supply all configuration required by deployed startup validation,
      including provider settings; do not bypass validation with placeholder values.
- [ ] Use synthetic event data and controlled test recipients only.

**Exit:** resources are reachable by their intended services, private resources
are inaccessible publicly, and the staging configuration passes validation.

## Stage 3 — Build and deploy staging reproducibly

- [ ] Select a release commit and run the complete CI workflow in
      [ci.yml](../.github/workflows/ci.yml): contract checks, formatting, lint,
      types, tests, integration tests, Storybook checks, builds, dependency audit,
      artifact checks, and process/container smoke checks.
- [ ] Build API and worker images from their Dockerfiles; publish immutable
      image references. Record the web artifact and its environment-specific public
      configuration. Build web assets for the correct environment where required.
- [ ] Document the chosen host's exact build, deploy, migration, health-check,
      and rollback commands in the release evidence. Existing CI validates builds;
      it does not by itself deploy production.
- [ ] Apply migrations as a separate release step with `pnpm migrate` against
      the intended staging database. Include `20260919100000_otp_delivery_attempts`.
- [ ] Deploy web, API, and worker with graceful shutdown and readiness checks.
- [ ] Verify API `/api/v1/health/live` and `/api/v1/health/ready`, worker
      `/health/live` and `/health/ready` on its private port, and both web locales.
- [ ] Verify unauthenticated protected requests are denied and deployed auth
      bypasses remain disabled. Record release identity for every running service.

**Exit:** a reproducible staging release is healthy and the full CI run passes.

## Stage 4 — Activate and prove OTP login

Prerequisite: deployed HTTPS API and OTP migration. Follow
[OTP activation](operations/authentica-otp-activation.md) for exact settings.

- [ ] Store the key as `AUTHENTICA_API_KEY` on the API; configure
      `AUTHENTICA_OTP_ENABLED=true`, `AUTHENTICA_OTP_METHOD=sms`, the enabled
      `AUTHENTICA_OTP_TEMPLATE_ID`, and `AUTHENTICA_REQUEST_TIMEOUT_MS=2500`.
- [ ] Enable Supabase Phone Auth and six-digit codes. Configure expiry, resend
      cooldown, and verification limits; remove static test-phone/code overrides.
- [ ] Use the asymmetric Supabase signing-key/JWKS configuration required by
      this API. Confirm web and API reference the same project.
- [ ] Configure Supabase's Send SMS Hook to call
      `https://<staging-api-domain>/api/v1/webhooks/supabase-otp`; store its signing
      secret as `SUPABASE_SEND_SMS_HOOK_SECRET`. Disable account-level fallback for
      the current SMS-only acceptance exercise.
- [ ] Obtain account-specific confirmation that Authentica accepts the supplied
      custom code, including leading zeroes, with the selected template.
- [ ] Request a code from the actual app, receive one SMS on the controlled
      handset, verify through Supabase, and successfully call an authenticated API.
- [ ] Test incorrect, expired, reused, and resent codes, hook signature denial,
      duplicate-hook handling, and safe provider failures in isolated staging.
- [ ] Confirm ingress, APM, and provider diagnostics do not capture OTPs or
      credentials. Establish balance alerts and an owner for OTP delivery failures.
- [ ] Schedule and verify cleanup of delivery reservations older than 24 hours
      per the runbook, without deleting fresh reservations to force retries.

**Exit:** real login succeeds from handset receipt through authenticated API
access. A successful provider HTTP response alone does not close this stage.

## Stage 5 — Activate and prove WhatsApp invitations

- [ ] Configure staging Meta credentials, approved invitation/reminder/RSVP
      confirmation templates, and controlled recipients using the Meta runbook.
- [ ] Verify public HTTPS webhook signatures and signed private-media access.
- [ ] Complete host event creation → CSV/XLSX import → validation → preview →
      confirmed send → handset receipt with the correct image and variables.
- [ ] Verify available delivery callbacks, WhatsApp quick-reply RSVP, private
      web RSVP edits, exactly one logical confirmation, and reconciled host counts.
      Read receipts depend on recipient/provider availability; record that context.
- [ ] Exercise reminders, webhook duplicates/out-of-order delivery, retries,
      and safe resends without duplicate logical sends.

**Exit:** the real provider journey is recorded in readiness item 8.1, with
sanitized evidence and no unresolved delivery or RSVP reconciliation defect.

## Stage 6 — Close engineering and full-stack testing gaps

- [ ] Replace production script `unsafe-inline` with nonce-based CSP and verify
      both locales, public invitations, and authentication still work.
- [ ] Implement and validate deletion/recovery tooling against the approved
      retention and audit requirements, including private files and backup handling.
- [ ] Add browser journeys across running web/API/worker/database services:
      login/session, event setup, imports, sending, guest RSVP, team permissions,
      reminders, reports, and private exports. Keep live-provider acceptance
      separate from repeatable automated tests.
- [ ] Verify cross-event isolation, expired/revoked capabilities, mobile layouts,
      Arabic RTL, English LTR, keyboard navigation, and deployed accessibility.
- [ ] Rerun affected checks and the complete release CI gate after remediation.
      Close findings or record explicitly approved exceptions in the readiness
      register; do not silently mark open items complete.

**Exit:** engineering gaps have evidence or formally owned dispositions, and
critical browser journeys pass against the candidate release.

## Stage 7 — Prove monitoring, recovery, and support

- [ ] Enable JSON logs, release identifiers, redacted error reporting, private
      metrics scraping, dashboards, and the alerts in `ops/`.
- [ ] Trigger a test alert and confirm it reaches a named human within five
      minutes. Verify a request can be traced across API and worker diagnostics.
- [ ] Enable encrypted backups/PITR; restore into an isolated database and
      record measured recovery time, recovery point, and reconciliation results.
- [ ] Rehearse migrations and application rollback, provider outage, queue
      backlog, credential rotation, and event-night incident response using
      [the operational runbooks](operations/release-and-rollback.md#rehearsals).
- [ ] Prove recovery does not blindly resend messages already accepted by a
      provider. Retain the OTP replay reservations through restart/failover.
- [ ] Run staging load/query-plan exercises with synthetic data, agreed event
      size and concurrency, using [the load runbook](runbooks/load-and-query-plan-testing.md).
- [ ] Record capacity, connection limits, worker concurrency, latency/backlog
      thresholds, provider spending limits, and escalation contacts.

**Exit:** alerts reach people, recovery is measured, load thresholds pass, and
operators can execute the rehearsed procedures.

## Stage 8 — Staging acceptance, privacy, and security

- [ ] Complete internal alpha and staging acceptance with representative hosts;
      track and fix defects against the candidate release.
- [ ] Complete qualified privacy review: provider/region inventory, Authentica
      and Meta processing, roles, agreements, transfer assessment, retention,
      privacy notice, data requests/erasure, and incident notification assessment.
- [ ] Publish the accepted host/guest notices and establish request ownership.
- [ ] Complete deployed security review/penetration testing, including database
      grants, private endpoints, edge volume controls, and logging configuration.
- [ ] Review current dependency findings and verify production access controls.
- [ ] Reconcile every readiness-checklist item: attach evidence, an approved
      exception with owner/expiry/compensating control, or verified feature disablement.
      Pilot-only items remain explicitly pending until Stage 10.

**Exit:** named owners accept staging for controlled production use; no
unresolved critical authentication, isolation, privacy, or recovery failure remains.

## Stage 9 — Prepare production for the pilot

- [ ] Provision production using the verified staging design and
      `.env.production.example`, with separate secrets, stores, queue prefix,
      Supabase project, provider credentials/templates, and real production domains.
- [ ] Repeat environment-specific checks: HTTPS, CORS, grants, hooks, private
      storage, monitoring, alerts, backups, and configuration validation.
- [ ] Confirm production Authentica balance/template/custom-code behavior and
      Meta account/number/template readiness; staging acceptance is not proof of
      production account activation.
- [ ] Record the candidate commit, API/worker image digests, web artifact,
      migration plan, rollback targets, named operator, and release window.
- [ ] Apply migrations and deploy in the window allowed by the release policy.
      Promote tested API/worker artifacts; handle web public configuration explicitly.
- [ ] Run controlled production OTP and invitation smoke tests, restricting
      recipients to the pilot team. Verify observability without recording secrets.
- [ ] Keep public onboarding restricted to pilot hosts. Keep unaccepted optional
      features disabled and verify that restriction is effective.

**Exit:** production is ready for an explicitly supported pilot, with rollback
and recovery available. General availability remains closed.

## Stage 10 — Run and reconcile the real-event pilot

- [ ] Select a small number of supported Saudi events; name host contacts,
      support coverage, success criteria, and event-day fallbacks before starting.
- [ ] If check-in is enabled, rehearse devices, venue connectivity, duplicate
      scans, permissions, and a usable manual fallback before event day.
- [ ] Observe invitations, delivery, RSVP, reminders, exports, and operational
      support during real use; protect guest data in all evidence.
- [ ] Reconcile invitation groups, named guests, expected attendance, and
      arrivals separately. Reconcile credit accounting if billing is enabled.
- [ ] Fix pilot defects, repeat affected verification, and allow a remediation
      window before the final review. Do not release during supported event windows.

**Exit:** pilot acceptance and readiness items 8.4–8.6 are recorded, with no
unresolved isolation, duplicate-send, attendance, privacy, or recovery failure.

## Stage 11 — Launch and support general availability

- [ ] Record the final go/no-go with named product, engineering, security,
      operations, and business approvers and the completed readiness register.
- [ ] Confirm deployable rollback targets and on-call/restore coverage for the
      first month. Schedule outside `EVENT_DAY` and the preceding twelve hours.
- [ ] Follow the release policy: canary for fifteen minutes, then remaining
      instances, then one full evening of observation before broader flag changes.
- [ ] Abort for server errors above 2% for ten minutes, doubled healthy-route
      p95 latency, rising backlog with a healthy provider, or new exhausted jobs.
      Abort immediately for isolation, duplicate-send, or attendance discrepancies.
- [ ] Open public onboarding only after the rollout gate passes. Monitor OTP
      success, provider balance, delivery, queues, errors, latency, and host support.
- [ ] Review the first day, first week, and first month; assign any findings
      and revisit accepted exceptions before their expiry.

**Exit:** public production is operating with recorded acceptance, accountable
support, monitored service health, and proven recovery.

## Evidence entry template

Copy this for each completed stage or link an equivalent sanitized record.

```text
Stage:
Owner:
Date:
Environment:
Release commit / artifact references:
Checks performed and measured results:
Evidence links:
Remaining findings / approved exceptions and expiry:
Decision: pass / fail / pending
Next action and owner:
```

## Immediate next step

Start Stage 1 by recording the hosting/region choice, staging domains, Supabase
project availability, Authentica SMS template and sender, and controlled test
handset availability. The API key is already reported available; configuring
and testing it will happen through secret storage, not by putting it in this file.
