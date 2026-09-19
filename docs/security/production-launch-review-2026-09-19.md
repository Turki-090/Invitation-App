# Production launch review — 2026-09-19

## Decision

**Do not launch yet.** Local implementation checks pass, but real OTP delivery and Supabase session issuance are unverified. The current Authentica contract does not document the custom-code field required by this architecture. Deployment acceptance also needs the evidence listed below.

This review inspected authentication, hook security and delivery, importer validation, authorization boundaries, configuration, diagnostics, schema/migrations, build and operational checks. It is a repository and local-runtime review, not certification of a deployed environment or an independent penetration test.

## Highest-priority findings

| Priority | Finding                                                                                  | Disposition                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker  | Older vendor blueprint supports custom `otp`; current official Send OTP/OpenAPI omits it | Obtain Authentica confirmation for the account and prove the received code verifies through Supabase. Kept Supabase code forwarding; never switched verifier. |
| Blocker  | No real Supabase/Auth­entica credentials or controlled handset locally                   | Live E2E not executed. Follow the exact configuration and acceptance steps in the activation runbook.                                                         |
| High     | Hook retries/concurrent replays could send multiple SMS messages                         | Fixed with durable PostgreSQL reservation before send and replayed outcomes. No resend after timeout, network error, 5xx or crash.                            |
| High     | Provider timeout was 10 seconds versus Supabase's five-second HTTP hook budget           | Default now 2.5 seconds, maximum 3 seconds; bounded DB transactions and safe failure responses.                                                               |
| High     | Malformed JSON/transport exceptions could include sensitive material                     | Hook failures bypass raw exception logging/reporting; provider errors discard their cause and body. Added log regression tests.                               |
| Medium   | Saudi national numbers rejected by login; hook accepted arbitrary digit strings          | Login accepts Saudi national input and normalizes it; hook requires canonical validated international identities. Malformed +9660… rejected.                  |
| Medium   | WhatsApp was the configured/default login channel                                        | Defaults and example environments now use SMS; confirm the actual deployment variables.                                                                       |
| Medium   | Provider acceptance was logged as delivery                                               | Renamed to `auth.otp.accepted`; handset receipt remains a separate live acceptance step.                                                                      |

## OTP requirements and evidence

| Requirement                              | Result                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase generates OTP                   | Client calls `supabase.auth.signInWithOtp`; hook forwards `sms.otp`. No local OTP generation.                                                                                                                                                                                                                                    |
| Supabase verifies and issues session/JWT | Client uses `supabase.auth.verifyOtp`, type `sms`; Authentica exposes sending only. JWT issuer/audience/signature/expiration checked by API. Live session creation remains untested.                                                                                                                                             |
| Endpoint and authentication              | Official endpoint `/api/v2/send-otp`, `X-Authorization`, JSON request/accept headers match. Redirects disabled to protect credentials.                                                                                                                                                                                           |
| Exact payload                            | Phone/method/template fields match current docs. Custom `otp` is supported only by older blueprint and needs confirmation. Removed unused fallback fields from hook request.                                                                                                                                                     |
| Saudi normalization                      | 05xxxxxxxx, 5xxxxxxxx, 9665xxxxxxxx, +9665xxxxxxxx and 009665xxxxxxxx normalize to +9665xxxxxxxx. Invalid lengths, national trunk zero after +966, landlines and arbitrary text rejected for Saudi login.                                                                                                                        |
| Signed hook                              | HMAC-SHA256 over identifier.timestamp.raw-body, constant-time digest comparison, five-minute past/future tolerance, canonical base64 secret/signature checks. Payload parsed from signed bytes only.                                                                                                                             |
| Replay/concurrency                       | DB primary key reserves hashed webhook ID before request. Keyed body fingerprint rejects ID reuse with changed content. Concurrent, restarted and failed attempts tested against PostgreSQL.                                                                                                                                     |
| Timeout/errors/rate limits               | Provider timeout/network/HTTP/invalid-envelope failures handled. 429 propagated as generic hook 429. Supabase resend and verification quotas still need dashboard confirmation.                                                                                                                                                  |
| Retry safety                             | No automatic resend after ambiguity. This provides at-most-one provider attempt per hook ID, not exactly-once handset delivery. Separate user requests have separate IDs and are controlled by Supabase cooldowns.                                                                                                               |
| Persistence failures                     | Fail closed before sending. Failed post-send result persistence retains the reservation; user requests a new code rather than retrying an uncertain delivery.                                                                                                                                                                    |
| Supabase response contract               | Success 200 `{}`; failures `{error:{http_code,message}}`. Real HTTP local test covers signed requests, unsigned rejection, duplicate replay and provider payload.                                                                                                                                                                |
| Secret/OTP hygiene                       | No raw OTP/provider body/header/transport error logging in delivery path. Hook parsing failures sanitized. No plaintext OTP/phone is persisted in deduplication table.                                                                                                                                                           |
| Repository credentials                   | Current tracked-file scan found no candidate private keys, AWS access IDs, GitHub tokens, JWTs or full Authentica-style bcrypt keys in 521 tracked files. Example/test values are placeholders. Real env files are ignored. This is a bounded scan, not proof that every possible secret format or historical Git blob is clean. |

## Verification performed

- Fresh workspace unit/component tests passed, with additional targeted regressions after edits.
- 49 PostgreSQL integration tests passed across messaging, imports, invitations, collaboration, credits, RSVP, reporting, authorization isolation and diagnostics. One additional actual-HTTP OTP test passed; all three OTP integration cases rerun after tightening DB deadlines.
- Production build passed. Type checking, lint, OpenAPI lint/generated-contract check and operational-artifact consistency checks passed.
- Local web/API/worker startup, readiness, authentication-denial and observability smoke checks passed with development auth bypass disabled.
- All migrations applied successfully to an isolated local `dawah_test` PostgreSQL instance, including the new OTP table.
- Dependency audit: no high or critical findings; three moderate and one low remain (below).
- Excel and CSV templates were filled and passed through the real importer. All eight headers auto-map. All three invitation types pass domain validation. Phone text survives Excel round trip. Both workbook sheets visually reviewed.

**Not proven:** real Authentica request/handset receipt, real Supabase OTP/session flow, actual deployment settings, external logging behavior, production database grants, backup restore, container-image smoke, production load/latency, or deployed browser accessibility. Existing suite success does not replace those checks.

## Broader launch findings

| Area                         | Finding / required action                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication deployment    | Configure the same Supabase project on API/web, Phone Auth and HTTPS hook; six-digit OTPs; no static test codes; asymmetric signing key in JWKS; both bypass flags off.                                                                                                  |
| Database deployment          | Apply new migration before enabling hook. Verify API-role access and public-role denial. Preserve reservation records through restart/failover; purge only records older than 24 hours.                                                                                  |
| Abuse and availability       | Hook bypasses application IP throttling to avoid throttling all Supabase requests together. Verify Supabase quotas and edge volume controls, provider balance alerts, and clock synchronization.                                                                         |
| Browser security             | Existing `script-src 'unsafe-inline'` remains in production CSP (`apps/web/next.config.ts`). Track nonce-based hardening; this review did not change rendering architecture.                                                                                             |
| Privacy operations           | Existing privacy document has TBD infrastructure regions/agreements and manual erasure procedures. Complete deployment ownership, provider inventory (including Authentica), and approved retention/erasure operations. No legal-compliance certification was performed. |
| Recovery                     | Existing runbooks are present, but no production restore/rollback drill was performed. Record successful backup restore and rollback evidence before launch.                                                                                                             |
| Diagnostics                  | Repository redaction and workflow leakage tests pass. Verify proxy/APM/provider dashboards do not capture OTP payloads or headers; repository tests cannot control external services.                                                                                    |
| Container/browser/load gates | CI includes container builds/smoke and Storybook browser tests. Those and real production load checks were not executed in this local review; require CI/deployment evidence.                                                                                            |

Remaining dependency advisories:

- `uuid`, moderate: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), patched in >=11.1.1.
- `vitest` and `@vitest/mocker`, moderate: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), patched in >=4.1.11. These are test tooling; do not expose test servers publicly.
- `esbuild`, low: [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), patched in >=0.28.1. Review its Windows development-server usage.

Dependency major-version migrations were not made as incidental OTP fixes. Assign remediation/acceptance owners for remaining findings.

## Guest upload form

The upload page now offers **Download Excel template** and **Download CSV template**, with English/Arabic instructions above the uploader. Files are served from `/templates/guest-import.xlsx` and `/templates/guest-import.csv`.

Excel opens on a blank Guests sheet, with recognized headers, text phone cells, country/type dropdowns and companion-count validation. A second sheet contains bilingual filling instructions. No sample guest rows can be imported accidentally. CSV has the same headers and a UTF-8 BOM. Users fill one invitation per row, upload it and review validation before confirming import.

## Sources and next action

- [Authentica Send OTP](https://docs.authentica.sa/api-reference/otp-verification/send-otp) and the dated official schema in `docs/vendor/`.
- [Supabase Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).
- [Supabase hook security/error/timeout contract](https://supabase.com/docs/guides/auth/auth-hooks).
- [Activation runbook](../operations/authentica-otp-activation.md): exact external secrets, configuration, live test and rollback considerations.

Release approval requires the unresolved custom-code contract and real E2E gate to be closed, plus deployment evidence/owner disposition for the broader findings. This review does not authorize or perform a production deployment.
