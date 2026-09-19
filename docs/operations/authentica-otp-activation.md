# Authentica SMS activation and live acceptance

Reviewed 2026-09-19. **Launch blocked until custom-code delivery is confirmed and the real handset test passes.**

## Contract discrepancy

The older repository blueprint `docs/vendor/authenticasa.apib` documents custom `otp` and fallback fields. The current [official Send OTP reference](https://docs.authentica.sa/api-reference/otp-verification/send-otp) and [OpenAPI schema](https://docs.authentica.sa/openapi.yaml) omit those fields. The dated schema is saved at `docs/vendor/authentica-openapi-2026-09-19.yaml`.

The implementation continues forwarding Supabase's numeric-string `otp`, preserving leading zeroes. Removing it would allow Authentica to generate a different code and break Supabase verification. Obtain vendor confirmation of custom-code support for this application, the payload and approved SMS template, then prove it live. A 200 response alone is insufficient: undocumented fields might be ignored. The hook no longer supplies fallback fields. Disable account-level fallback for this SMS-only deployment.

## Ownership and flow

1. Login normalizes Saudi input (0501234567 → +966501234567), then calls Supabase `signInWithOtp`.
2. Supabase generates the code and signs the HTTPS Send SMS Hook request.
3. The API verifies HMAC over the exact body, identifier and timestamp with five-minute tolerance. It parses only verified bytes. The hook accepts canonical international identities; national-number conversion happens before requesting the Supabase OTP.
4. PostgreSQL reserves the hook identifier before sending. Only its hash, a keyed request fingerprint, status and timestamp are persisted. No phone, OTP, body, signature or credential is stored.
5. Authentica receives POST `https://api.authentica.sa/api/v2/send-otp`, `X-Authorization`, JSON headers and `{method:"sms",phone:"+966…",template_id:<approved template>,otp:<Supabase code>}`.
6. Only Supabase `verifyOtp({phone,token,type:"sms"})` verifies the code and issues the session/JWT. The API checks JWT signature, issuer, audience and expiration using Supabase JWKS.

## Required configuration

Use deployment secret management. Never paste credentials into task messages, source files or logs.

| Setting                         | Required value                                               |
| ------------------------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`                  | Real project URL on API                                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | Same project URL on web                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project public anon key, never service-role key              |
| `SUPABASE_SEND_SMS_HOOK_SECRET` | Dashboard-issued `v1,whsec_<base64>` on API                  |
| `AUTHENTICA_OTP_ENABLED`        | `true`                                                       |
| `AUTHENTICA_API_KEY`            | Active application key on API                                |
| `AUTHENTICA_BASE_URL`           | `https://api.authentica.sa/api/v2`                           |
| `AUTHENTICA_OTP_METHOD`         | `sms`                                                        |
| `AUTHENTICA_OTP_TEMPLATE_ID`    | Approved SMS template; default 1 does not prove approval     |
| `AUTHENTICA_REQUEST_TIMEOUT_MS` | `2500`, maximum `3000`                                       |
| Database                        | Apply migration `20260919100000_otp_delivery_attempts` first |

In Supabase enable Phone Auth, six-digit OTPs (matching the UI), expiration, resend cooldown and verification rate limits. Set the HTTPS hook URL to `https://<api-host>/api/v1/webhooks/supabase-otp`. Remove test-phone/static-code overrides. Use an asymmetric JWT signing key published in JWKS: this API does not support legacy HS256 verification. Disable both development auth bypass flags. Verify TLS, DNS, public ingress from Supabase, synchronized clocks, provider balance and sender/template activation. Configure edge volume controls above normal Supabase traffic.

## Live end-to-end acceptance

No real credentials or controlled test handset were available locally during this review. Use staging first.

1. Enter a controlled Saudi handset as `05xxxxxxxx` in the application. Verify the Supabase request uses `+9665xxxxxxxx`.
2. Confirm the signed hook reaches the API and a single provider send is accepted. `auth.otp.accepted` means provider acceptance, not handset delivery.
3. Confirm exactly one SMS arrives carrying the supplied code unchanged. Enter it only into the application.
4. Confirm Supabase verification succeeds, a Supabase session is created and an authenticated API request succeeds for that user. Record only pass/fail, time, deployment version and internal request identifier; never OTP/JWT values.
5. Confirm wrong, expired and already-used codes are rejected by Supabase, with no Authentica verification call.
6. After the resend cooldown, request and verify a fresh code; check stale-code rejection.
7. In isolated staging test invalid credentials, insufficient balance, throttling and timeout. Verify safe error envelopes and no automatic duplicate sends; restore configuration.
8. Check application, ingress, APM and provider diagnostics. Disable body/header capture on authentication routes and verify deployed logs without copying credentials or OTPs into the report.

## Retry and failure behavior

Authentica publishes no idempotency-key contract. One authenticated hook identifier therefore permits at most one provider attempt. Pending duplicates return 409; completed successes replay `{}` with 200; failed attempts replay an error. Different content under the same identifier is rejected. A process crash retains its pending reservation and does not cause a resend.

Timeouts, network failures, 5xx and malformed responses can follow acceptance. They never trigger an automatic resend. The user can request a fresh code after the Supabase cooldown. This trades recovery from uncertain delivery for avoiding duplicate SMS charges; exactly-once handset delivery cannot be guaranteed.

Provider 429 returns hook 429; other provider errors return 502. Invalid signatures/payloads return 401/400. Database errors fail closed with 503; after a send, a failed result write leaves the reservation intact. Errors use `{error:{http_code,message}}` with generic text. The provider timeout and bounded database transactions fit the documented five-second HTTP hook budget under normal scheduling; verify actual deployment latency.

Success requires JSON boolean `success:true`. Redirects are rejected to protect credentials. Raw transport errors and provider bodies are not logged. Authentica's verification endpoint is never used.

Retain deduplication records beyond the complete replay window. An operator can purge records older than 24 hours using `DELETE FROM otp_delivery_attempts WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'`. Never delete fresh records to force retries. Include this table in backup/restore and restrict access to the API role. This change does not install a scheduled purge.

Local tests verify signatures, canonical numbers, preservation of leading zeroes, errors, log hygiene, concurrent PostgreSQL claims and HTTP calls to a simulated provider. They cannot prove Authentica custom-code behavior, handset delivery, dashboard settings or real Supabase session issuance.
