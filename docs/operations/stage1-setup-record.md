# Stage 1 setup record

Started: 2026-09-27. Status: **In progress; external setup pending.**

This record supports [launch Stage 1](../staging-to-production.md#stage-1--accounts-scope-and-decisions).
Existing Supabase and Authentica dashboards were inspected on 2026-09-27.
No hosting resources, DNS records, or new Supabase projects have been created;
no provider settings were changed. Store secret references here, never secret values.

## Confirmed progress on 2026-09-27

- User started with no hosting account or domain and authorizes any temporary test name.
  Working service names: `dawah-staging` and `dawah-api-staging`. Use
  host-assigned HTTPS URLs; no domain purchase or DNS account is needed yet.
- User explicitly accepts hosting outside Saudi/GCC **for testing**. Production
  location and privacy decisions remain separate.
- User completed Render signup. `My Workspace` is accessible and GitHub access
  lists `Turki-090/Invitation-App`. No service has been created. Render
  [web services](https://render.com/docs/web-services) receive `onrender.com`
  URLs; exact hostnames are unassigned and availability is unverified.
- User requires **strictly free hosting**. An unsubmitted web-service form is
  prepared: `dawah-staging`, branch `main`, Node runtime, repository root,
  Singapore region, **Free / $0 per month** selected. Public Supabase URL and
  non-secret environment settings are filled; API URL and public anon key
  remain missing. Do not submit a broken deployment or substitute placeholders.
- The full staging stack must not be described as free: Render's
  [free-tier rules](https://render.com/docs/free) exclude background workers,
  allow web services to sleep, and provide nonpersistent free Key Value storage.
  The dedicated worker and durable TLS queue design remain unresolved under
  the zero-cost constraint. A free UI/API preview does not close the full
  staging exit gate. Do not weaken the application's TLS validation to fit
  a provider's default internal Redis URL.
- Existing Supabase project: `Turki-090's Project`, reference
  `hwvvvljjwouhsicwioin`, organization `Turki's Ideas`, region
  `ap-southeast-2` (Sydney). Dashboard links the same GitHub repository as this
  workspace: `Turki-090/Invitation-App`. Restoration completed and settings
  became accessible. Its data contents and suitability as isolated staging
  are not yet verified.
- User confirmed URL `https://hwvvvljjwouhsicwioin.supabase.co`. Phone Auth is
  disabled; settings show six digits, 300-second expiry, phone confirmation
  enabled, and no test-phone overrides. Current signing key is ECC (P-256),
  matching the application's asymmetric JWT requirement. An older HS256 key
  remains listed as a previous key; no key was rotated or revoked.
- Authentica application `4690`: user reports it works. Dashboard shows balance
  `100.00` (unit not established), SMS enabled, and sender `Authentica (Default)`.
  No branded sender is needed for the initial test.
- Authentica catalogue includes SMS template `8`, Arabic,
  `{{otp}} هو رمز التحقق الخاص بك.`, and template `7`, its English equivalent.
  Template `8` is the staging candidate; successful API use with this application
  remains to be proved. Catalogue visibility does not establish custom-code support.
- Authentica general settings currently show four digits, numeric codes, and
  five-minute validity. No settings were changed. Align the six-digit flow after
  confirming application ownership/environment and custom-code behavior.
- No OTP, key, test phone number, or session token is retained in this record.
  No SMS or support message was sent by the agent.

## Decisions and account inventory

| Item                       | Proposed setup or required information                                  | Status                                        |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| Owners                     | Launch, engineering, operations, privacy/security, business             | Awaiting names                                |
| Hosting account            | Render `My Workspace`; Singapore; strictly free                         | Account/repository verified; web form drafted |
| Compute                    | Next.js web, separate NestJS API, persistent BullMQ worker              | Architecture verified; provider pending       |
| Data services              | Managed PostgreSQL, persistent TLS Redis, private S3-compatible storage | Provider and regions pending                  |
| Secret storage             | Host secret manager; isolated staging and production credentials        | Location pending                              |
| Root domain                | User has none; defer domain purchase                                    | Temporary provider URLs accepted              |
| Staging domains            | Host-assigned `onrender.com` URLs; working names above                  | Not provisioned                               |
| Production domains         | Proposed `app.<domain>` and `api.<domain>`                              | Not registered/configured                     |
| Supabase staging           | Existing project `hwvvvljjwouhsicwioin`, Sydney                         | Online; isolation check pending               |
| Supabase production        | Separate `dawah-production` project and credentials                     | Availability unknown; provisioning Stage 9    |
| Authentica                 | Application `4690`; user reports working; balance `100.00`              | Dashboard inspected; environment pending      |
| Authentica template/sender | Default sender active; Arabic SMS template `8` available in catalogue   | Candidate identified; live acceptance pending |
| Controlled handset         | Availability and custodian only; number kept outside Git                | Pending                                       |
| Meta                       | Account/number/template activation per separate runbook                 | Pending                                       |
| Initial scope              | Billing, payments, check-in disabled in staging example                 | Example verified; deployment pending          |

## Region decision before project creation

The repository's [environment policy](environments.md) calls for an approved
Saudi/GCC deployment region. Supabase's [published project region list](https://supabase.com/docs/guides/platform/regions),
checked 2026-09-27, lists no Saudi/GCC project region. Do not silently pick
Frankfurt or another non-GCC region and describe it as satisfying that policy.

The user has accepted managed hosting outside the GCC for testing on 2026-09-27.
This is a staging-only exception to the repository region policy; production
requires its own decision. Record identity processing separately
from the application database: keeping event data in the GCC does not locate
Supabase phone identities there. Populate the
[processor inventory](../security/privacy-and-pdpl.md#processors-and-locations)
once providers and locations are known; this record is not a legal conclusion.

## DNS and deployment handoff

1. Use provider-assigned test domains. Confirm ownership and inspect existing
   DNS records only when introducing a custom domain later.
2. Select the hosting account and region, including the long-running worker,
   PostgreSQL, Redis, object storage, and secret manager.
3. Obtain actual HTTPS hostnames from the selected host. Working names above
   are proposals, not usable deployment values; custom DNS is deferred.
4. Configure HTTPS and use the exact staging web origin for `API_CORS_ORIGINS`.
   Set `NEXT_PUBLIC_API_URL` according to the deployed API base.
5. Keep worker health, metrics, database, Redis, and storage private. Preserve
   public access to required API, signed-media, and provider-hook paths.
6. Finalize host-specific build, migration, deployment, and rollback commands
   during Stages 2–3. API/worker Dockerfiles already exist; the web deployment
   method must be selected for its host.

## Supabase setup handoff

After the region decision, identify or create the isolated staging project and
record its organization, project reference, URL, region, and owner. Configure
the same project URL on web and API; put the public anon key only in its public
web setting and privileged credentials only in secret storage.

Prepare Phone Auth with six-digit codes, expiration, resend cooldown, verification
limits, no static test-code overrides, and asymmetric JWT signing via JWKS.
Record the chosen limits when configured. Set the site URL to the staging web
origin and restrict redirect URLs to required application destinations.

The [Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)
supplies the generated OTP to our delivery endpoint. Activate it only after
the deployed API and OTP migration are ready:

`https://api-staging.<domain>/api/v1/webhooks/supabase-otp`

Store the dashboard-issued hook secret as `SUPABASE_SEND_SMS_HOOK_SECRET` on
the API. Stage 4 proves the complete handset-to-session flow.

## Authentica template and sender setup

In the intended Authentica application, record the environment, available
balance, enabled SMS template ID, language, sender selection/status, and owner.
The [current Send OTP reference](https://docs.authentica.sa/api-reference/otp-verification/send-otp)
supports a default or own sender and directs default settings to the application
dashboard. A branded sender is optional if the default is usable. The API
currently supplies `template_id`; it has no sender-name configuration field.

The current public request schema still omits custom `otp`. This is unresolved
because our code must forward Supabase's exact code, including leading zeroes.
Prepare this account-specific support question; it has **not been sent**:

> We use Supabase Auth to generate and verify six-digit login codes. Please
> confirm whether our application can send an externally generated numeric-string
> `otp` through POST `/api/v2/send-otp` with `method: "sms"` and our enabled
> `template_id`, preserving leading zeroes without replacing the code. Please
> confirm the supported payload, template ID and placeholder syntax, sender
> selection, and how to disable account-level fallback. If this endpoint cannot
> support this flow, please identify your supported custom-message SMS endpoint
> and sender/template requirements.

Suggested copy for review, with a conceptual placeholder only:

- Arabic: رمز التحقق الخاص بك في دعوة هو {code}. لا تشارك هذا الرمز مع أي شخص.
- English: Your Dawah verification code is {code}. Do not share this code.

Do not submit `{code}` as vendor syntax until confirmed. Do not assume template
ID `1` in the environment example is activated. Any alternative endpoint needs
an adapter change and tests before use. Follow the existing
[activation runbook](authentica-otp-activation.md) for timeout, deduplication,
secret handling, and live acceptance. No test SMS has been sent.

## Closing Stage 1

Fill the inventory with verified account references, owners, domains, provider
regions, scope, and secret-store locations. Record Authentica template/sender
and custom-code evidence and start Meta activation. Keep this stage open while
those decisions or account checks remain unresolved; operational provisioning
and live login acceptance have their own later gates.
