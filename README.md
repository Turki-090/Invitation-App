# Dawah platform

Dawah is an API-first wedding invitation platform. The repository contains the
Next.js web client, NestJS API, BullMQ worker, shared packages, PostgreSQL schema,
and the canonical OpenAPI contract.

## Local development

Requirements: Node.js 22.12 or newer, pnpm 11.19.0, and Docker with Compose.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The localized web routes are `/ar-SA` and `/en`. Requests without a locale are
redirected to the best supported language, falling back to Arabic.

`pnpm dev` uses the safe local defaults in `.env.example`, starts PostgreSQL,
Redis, and initialized private object storage, generates required sources,
deploys migrations, and starts web, API, and worker processes. Create a private
`.env` only when overriding those defaults.
To use the deterministic local login, explicitly set both development-bypass
flags to `true`; validation prevents those flags from activating outside local
development.

Run `pnpm seed` only when you want the idempotent sample host and event in the
local development database. The command refuses remote and non-development
databases.

Local endpoints:

- Web: `http://localhost:3000`
- API liveness: `http://localhost:4000/api/v1/health/live`
- API readiness: `http://localhost:4000/api/v1/health/ready`
- Worker liveness: `http://localhost:4001/health/live`
- Worker readiness: `http://localhost:4001/health/ready`

## Configuration profiles

The deployment selector is `DAWAH_ENV`: `local`, `test`, `staging`, or
`production`. Copy the matching example file into the environment's secret or
configuration store; never commit populated environment files. Staging and
production fail startup when they contain local hosts, insecure Redis, placeholder
authentication values, non-HTTPS origins, or development authentication flags.

## Verification

Start the disposable local test database and run the real PostgreSQL integration
suite. A private `.env.test` is optional when the example defaults are suitable:

```powershell
docker compose --profile test up -d --wait postgres-test redis
pnpm test:integration
```

The standard validation gate is:

```powershell
pnpm openapi:lint
pnpm openapi:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm artifacts:check
pnpm ops:check
pnpm audit --audit-level high
pnpm smoke
```

`pnpm ops:check` validates the alert rules and dashboard in `ops/` against the
metric names the code actually emits, so a renamed metric fails the build
instead of leaving an alert that never fires.

Stage 2 adds Storybook, accessibility checks, and visual regression:

```powershell
pnpm storybook
pnpm storybook:build
pnpm test:storybook
```

The component catalogue, RTL/LTR rules, responsive contract, and accessibility
verification are documented in
[`docs/design-system-stage2.md`](docs/design-system-stage2.md).

The Stage 3 event routes, membership boundary, lifecycle matrix, aggregate
semantics, and date/map safety rules are documented in
[`docs/event-workspace-stage3.md`](docs/event-workspace-stage3.md).

The Stage 4 invitation aggregate, guest-management APIs, phone and duplicate
policy, permission shaping, pagination, and responsive host workflow are
documented in
[`docs/guest-management-stage4.md`](docs/guest-management-stage4.md).

The Stage 5 private asset boundary, secure spreadsheet-import state machine,
template versioning, readiness rules, immutable snapshots, and preparation UI
are documented in
[`docs/invitation-preparation-stage5.md`](docs/invitation-preparation-stage5.md).

The Stage 10 observability boundary, correlation model, metrics contract,
deployed-configuration refusals, operational runbooks, PDPL position, security
review, and the production-readiness checklist are documented in
[`docs/production-assurance-stage10.md`](docs/production-assurance-stage10.md).
Start with [`docs/operations/observability.md`](docs/operations/observability.md)
for what the platform emits and
[`docs/runbooks/event-night-incident.md`](docs/runbooks/event-night-incident.md)
for what to do when an event is in progress.

The Stage 6 WhatsApp provider boundary, confirmed and idempotent send batches,
immutable message evidence, bounded worker behavior, signed webhook reduction,
deterministic queue recovery, checksum-bound private invitation-image delivery,
capability-aware localized UI, and current-snapshot safe-resend contract are documented in
[`docs/whatsapp-messaging-stage6.md`](docs/whatsapp-messaging-stage6.md).

## Host sign-in

Hosts sign in with a phone one-time code. Supabase Auth generates the code,
verifies it, and issues the session; Authentica delivers it over WhatsApp with
an SMS fallback, through Supabase's send-SMS hook at
`POST /api/v1/webhooks/supabase-otp`. The API authenticates that hook with its
Standard Webhooks signature and forwards the code — it never generates,
verifies, stores, or logs one.

Delivery is off by default and requires `AUTHENTICA_OTP_ENABLED`, an Authentica
API key, and the Supabase hook secret; startup validation refuses a partial
configuration. Account setup, the Supabase hook configuration, and the staging
acceptance exercise are documented in
[`docs/operations/authentica-otp-activation.md`](docs/operations/authentica-otp-activation.md).

## API contract workflow

`openapi/openapi.yaml` is the only public transport-contract source. After a
contract change, run `pnpm openapi:generate`; this refreshes the typed client in
`packages/api-client`. `pnpm openapi:check` fails when the checked-in output is
stale, while contract compatibility tests keep the runtime Zod types assignable
to the generated shapes.

## Operations

Deployed environments must set `LOG_FORMAT=json`, a `LOG_LEVEL` other than
`debug`, and — when `METRICS_ENABLED` is true — a `METRICS_TOKEN` of at least 32
characters. Startup validation refuses anything else, along with local hosts,
insecure Redis, placeholder secrets, non-HTTPS origins, and development
authentication flags.

Metrics are scraped from `GET /api/v1/internal/metrics` on the API and
`GET /metrics` on the worker health port, both bearer-guarded and private.
Alert rules, a Grafana dashboard, and a reference scrape configuration are in
`ops/`.

Every response carries `x-request-id` and `x-correlation-id`, and a failed
response includes `requestId` in its error body. One `correlationId` follows an
operation from the API request into the queue job it enqueues.

## Production images

The API and worker images build from the repository root:

```powershell
docker build -f apps/api/Dockerfile -t dawah-api .
docker build -f apps/worker/Dockerfile -t dawah-worker .
```

Runtime secrets are supplied by the deployment environment, not baked into an
image. Database migrations are a separate release step and must use
`prisma migrate deploy`.
