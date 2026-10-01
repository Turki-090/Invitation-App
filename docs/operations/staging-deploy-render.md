# Staging deployment on Render

This is the concrete path for launch Stages 2–3 of the
[staging-to-production runbook](../staging-to-production.md). Decided on
2026-09-30:

| Piece            | Provider            | Region                   |
| ---------------- | ------------------- | ------------------------ |
| Web, API, worker | Render              | Frankfurt                |
| PostgreSQL       | Neon                | AWS Europe Central 1     |
| Redis (queues)   | Upstash             | Frankfurt (eu-central-1) |
| Private files    | Cloudflare R2       | Europe location hint     |
| Sign-in          | Supabase (existing) | Sydney, staging only     |
| WhatsApp         | Meta test number    | —                        |

Production repeats this stack with separate accounts, projects, and secrets;
hosting outside Saudi Arabia was accepted for production, so the cross-border
transfer basis must be recorded in
[privacy-and-pdpl.md](../security/privacy-and-pdpl.md) before launch.

Why not Render's own database and Key Value: the application refuses
PostgreSQL and Redis connections whose TLS certificates it cannot verify, and
Render's internal endpoints use self-signed certificates (Postgres) or
plaintext (Key Value).

## Ground rules

- Secrets go only into the provider dashboards, Render, GitHub environment
  secrets, and a password manager. Never into Git, chat, tickets, or this file.
- Use synthetic events and your own test phones in staging.
- Staging is paid. Expect roughly US$25–50 a month (three small Render
  instances, Upstash pay-as-you-go, Neon and R2 free tiers); confirm the prices
  shown at each signup. Set a spending cap wherever the provider offers one.

## Step 1 — Get `main` green

1. Enable **Dependency graph** in GitHub (Settings → Code security). The
   `dependency-review` job cannot run without it.
2. Merge the open pull requests once their checks pass. Render deploys `main`
   only after every check on the commit has passed.

## Step 2 — Create the data services

Collect each value into your password manager as you go.

| Value                                                   | Where                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Neon** connection string                              | New project `dawah-staging`, region AWS Europe Central 1, Postgres 17. Copy the **direct** (not pooled) string.                       |
| **Upstash** Redis URL                                   | New Redis database `dawah-staging`, region Frankfurt, TLS on, **eviction off**. Copy the `rediss://` URL.                             |
| **R2** endpoint, access key ID, secret access key       | Enable R2, create bucket `dawah-private-staging` (public access off), then an API token with Object Read & Write on that bucket only. |
| **Meta** app secret, test phone-number ID, access token | Meta developer app with the WhatsApp product, per [Meta activation](meta-whatsapp-activation.md) Phase 0.                             |
| **Supabase** project URL and anon public key            | Existing staging project → Settings → API. Never the service-role key.                                                                |

Fix up two values before using them:

- **Neon**: the copied string ends in `?sslmode=require` and may include
  `&channel_binding=require`. Remove `channel_binding`, then append
  `&sslaccept=strict`, so it ends in `?sslmode=require&sslaccept=strict`.
  Startup refuses anything else; see
  [environments.md](environments.md#what-startup-validation-refuses).
- **R2** endpoint: `https://<account id>.r2.cloudflarestorage.com`, with no
  bucket name in it.

## Step 3 — Let CI migrate the staging database

Migrations are a CI job, not part of a container start: `migrate-staging` in
`.github/workflows/ci.yml` runs `pnpm migrate` against staging after the other
checks pass on `main`, and Render waits for it before deploying.

1. GitHub → Settings → Environments → **New environment** `staging` → add the
   secret `DATABASE_URL` (the Neon string from Step 2).
2. GitHub → Settings → Secrets and variables → Actions → **Variables** → add
   `STAGING_MIGRATIONS` = `enabled`.
3. Actions → **CI** → **Run workflow** on `main`. Confirm the
   `migrate-staging` job succeeds and lists the applied migrations.

## Step 4 — Create the services from the Blueprint

1. Render → **New → Blueprint** → repository `Turki-090/Invitation-App`,
   branch `main`. Render reads [`render.yaml`](../../render.yaml).
2. Review the three services: `dawah-api-staging` (web, Docker),
   `dawah-worker-staging` (background worker, Docker), and `dawah-staging`
   (web, Node), all Frankfurt on the smallest paid instance.
3. Enter the prompted values from Step 2. The worker reuses the API's
   database, Redis, storage, phone-number ID, and media secret automatically.
4. Apply. Render generates the signing secrets and the webhook verify token.
5. Note each service's actual URL. If Render added a suffix to a name, update:
   - API: `API_CORS_ORIGINS` (the web URL) and
     `META_WHATSAPP_MEDIA_PUBLIC_BASE_URL` (API URL + `/api/v1`);
   - worker: `META_WHATSAPP_MEDIA_PUBLIC_BASE_URL`;
   - web: `NEXT_PUBLIC_API_URL`, then **Clear build cache & deploy**, because
     `NEXT_PUBLIC_*` values are compiled into the web build.

## Step 5 — Connect Supabase

In the staging Supabase project:

1. Authentication → URL Configuration: site URL = the web URL; add it to the
   redirect allow-list.
2. Authentication → Providers → Phone: enable six-digit codes and the Send SMS
   hook with URL `https://<api host>/api/v1/webhooks/supabase-otp`. Put the
   hook secret Supabase shows into the API's `SUPABASE_SEND_SMS_HOOK_SECRET`.
3. Until Authentica confirms custom-code delivery (runbook Stage 4), the API
   keeps `AUTHENTICA_OTP_ENABLED=false`: real numbers receive no code. For
   staging logins meanwhile, add one or two **test phone numbers** with fixed
   codes (Saudi format, for example `966500000001`). Remove them before the
   Stage 8 acceptance.

## Step 6 — Verify

- `https://<api host>/api/v1/health/live` returns 200, and `/health/ready`
  returns 200 (it checks PostgreSQL and Redis).
- The worker's Render logs show `worker.started` and no
  `reminders.scheduler_registration_failed` after startup.
- The web app loads in Arabic and English, and sign-in with a test number
  reaches the events page.
- Create an event, download the guest template, import it, and export the
  guest list. That exercises the API, worker, Redis, and R2 end to end.
- An unauthenticated `GET /api/v1/events` returns 401.

## Next stages

| Runbook stage            | What unblocks it                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 — OTP login            | Authentica confirms custom-code delivery; then set `AUTHENTICA_API_KEY`, the template ID, and `AUTHENTICA_OTP_ENABLED=true`, and enable [CAPTCHA](authentica-otp-activation.md#captcha). |
| 5 — WhatsApp             | Meta webhook → `https://<api host>/api/v1/webhooks/whatsapp` with the generated verify token; approved templates; a System User token.                                                   |
| 7 — Monitoring, recovery | Sentry DSN on API and worker; a restore drill from Neon's point-in-time recovery; alert routing.                                                                                         |
| 9 — Production           | A copy of this setup with its own accounts, a custom domain, paid database tier with longer recovery window.                                                                             |
