# Environments and provisioning

Four deployment profiles exist, selected by `DAWAH_ENV`: `local`, `test`,
`staging`, and `production`. `staging` and `production` are _deployed_
environments, and the distinction is enforced in code rather than by convention:
`packages/config` refuses to start a deployed service whose configuration would
weaken a security control.

## What startup validation refuses

A staging or production service fails to boot — loudly, before serving a single
request — if any of the following is true:

| Rejected                                                                  | Why                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `NODE_ENV` is not `production`                                            | Development behaviour in a deployed environment.                |
| A loopback or local database host, or the documented local credentials    | A deployed service pointed at a developer's database.           |
| PostgreSQL without an explicit `sslmode` of require/verify-ca/verify-full | Unencrypted database traffic.                                   |
| Redis that is not a remote `rediss://` endpoint                           | Unencrypted queue traffic.                                      |
| Non-HTTPS or placeholder storage, Supabase, media, or Sentry URLs         | Plaintext transport or an unconfigured dependency.              |
| Placeholder or `dawah-local-` / `dawah-test-` prefixed secrets            | A shipped example value used as a real credential.              |
| A CORS origin that is not an explicit remote HTTPS origin                 | A browser origin that cannot be trusted.                        |
| Either development authentication bypass flag                             | The bypass is local-only and is the highest-value control here. |
| A Meta phone-number id that is still all zeros                            | The inert local placeholder.                                    |
| `LOG_FORMAT` other than `json`, or `LOG_LEVEL` of `debug`                 | Unparseable or over-verbose deployed diagnostics.               |
| `METRICS_ENABLED` without a non-placeholder token of 32+ characters       | An unauthenticated metrics endpoint.                            |
| `PAYMENTS_ENABLED` without `BILLING_ENABLED`                              | Payment activation without the accounting it depends on.        |

Configuration is therefore not a checklist item that can be forgotten. The
checklist below covers what validation _cannot_ see: the infrastructure itself.

## Provisioning

### Region and isolation

- Deploy in an approved Saudi or GCC region. The processing location is a PDPL
  commitment, not a latency preference; record it in the data map in
  [`../security/privacy-and-pdpl.md`](../security/privacy-and-pdpl.md).
- Development, staging, and production are separate projects or accounts with
  separate credentials, separate databases, separate Redis instances, separate
  object-storage buckets, and separate queue prefixes. No credential is shared
  across them.
- Staging must never hold production personal data. Use synthetic fixtures; the
  load fixtures in `load/` are generated, not copied.

### Network and ingress

- Public HTTPS with TLS 1.2 or above, HSTS, and automated certificate renewal.
- Exactly three surfaces are public: the web application, `/api/v1`, and the
  WhatsApp webhook path. The metrics endpoints, worker health port, database,
  Redis, and object storage are private.
- `API_CORS_ORIGINS` lists the exact web origins, nothing wildcarded. The API
  exposes `x-request-id` and `x-correlation-id` so browser clients can report a
  correlation identifier back to support.
- The API trusts forwarded client addresses only from local and private ingress
  hops, so a directly exposed deployment cannot be fooled by a spoofed
  `X-Forwarded-For`. Put the API behind the intended proxy or leave it exposed —
  never in between.
- Public endpoints are rate limited (`API_THROTTLE_TTL_SECONDS`,
  `API_THROTTLE_LIMIT`). Event-day check-in puts several scanning devices behind
  one venue address, so the ceiling is tuned per environment rather than
  compiled in.

### Data stores

- **PostgreSQL**: managed, TLS enforced, automated daily backups with
  point-in-time recovery, encryption at rest. Sized for the connection
  concurrency of the API instances plus every worker consumer. Restore is
  proven by drill, not by configuration — see
  [`../runbooks/database-restore.md`](../runbooks/database-restore.md).
- **Redis**: managed, `rediss://`, authenticated, with persistence appropriate
  to the queue durability the platform assumes. `QUEUE_PREFIX` is distinct per
  environment so a misconfigured worker cannot consume another environment's
  jobs.
- **Object storage**: a private bucket with public access blocked at the bucket
  level, server-side encryption, and a lifecycle policy consistent with
  `EXPORT_RETENTION_HOURS` and the retention schedule. The platform serves
  private assets through signed, expiring, checksum-bound URLs; the bucket
  itself is never public.

### Identity and providers

- Supabase Auth project per environment, with its own keys. Only the anonymous
  key is public.
- Meta WhatsApp: a non-production phone-number id and approved templates for
  staging, separate production credentials, and a publicly reachable HTTPS
  webhook with signature verification enabled. `META_WHATSAPP_MEDIA_PUBLIC_BASE_URL`
  must be the deployment's own public API base, because the provider fetches
  invitation images from it during a send.

### Secrets

- Held in the platform's secret manager. Populated environment files are never
  committed; `.env.staging.example` and `.env.production.example` are shape
  templates with blank values.
- Every secret has a rotation procedure and an owner —
  [`../runbooks/credential-rotation.md`](../runbooks/credential-rotation.md).
- Access follows
  [`../security/production-access-policy.md`](../security/production-access-policy.md).

### Deployment units

- API and worker ship as separate images built from the repository root, with
  runtime secrets supplied by the environment rather than baked in.
- Migrations are a separate release step using `prisma migrate deploy`, never
  run on container start — see
  [`../runbooks/migration-and-rollback.md`](../runbooks/migration-and-rollback.md).
- Orchestration uses the liveness and readiness endpoints on both services.
  Readiness reports each dependency and each queue consumer individually, so a
  partially degraded worker is visible rather than silently idle.
- Both services handle `SIGTERM` with bounded graceful shutdown: consumers
  drain, queues and connections close, and pending error reports flush.

## Promotion path

A change reaches production only through: local → CI → staging → pilot →
production. Staging runs the same images and the same configuration shape as
production, with non-production provider credentials. The live provider exercise,
the restore drill, and the rehearsals in
[`release-and-rollback.md`](release-and-rollback.md) all happen in staging first.

## Verification after provisioning

1. Both services report ready, and readiness names every dependency.
2. `dawah_build_info` shows the expected release on every instance.
3. A metrics scrape succeeds with the token and fails without it.
4. Logs arrive in the pipeline as parsed JSON with `requestId` indexed.
5. A deliberately failing request returns a `requestId` that is findable in the
   logs and, if error reporting is configured, in the error reporter.
6. A backup exists and its restore has been drilled.
