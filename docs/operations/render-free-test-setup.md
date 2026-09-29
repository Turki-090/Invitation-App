# Render free test setup

Prepared 2026-09-27. User constraint: **strictly free**. This is an incomplete
test deployment draft, not a deployed service or full staging acceptance.

## Web service draft

| Field          | Value                      |
| -------------- | -------------------------- |
| Repository     | `Turki-090/Invitation-App` |
| Branch         | `main`                     |
| Name           | `dawah-staging`            |
| Runtime        | Node                       |
| Region         | Singapore                  |
| Root directory | Empty (repository root)    |
| Compute        | Free, $0/month             |

Build command prepared in the dashboard (not yet run on Render):

```sh
corepack enable && corepack prepare pnpm@11.19.0 --activate && pnpm install --frozen-lockfile && pnpm generate && pnpm exec turbo run build --filter=@dawah/web...
```

Start command:

```sh
pnpm --filter @dawah/web exec next start --hostname 0.0.0.0 --port $PORT
```

Non-secret configuration entered in the draft:

```dotenv
NODE_VERSION=24
NODE_ENV=production
DAWAH_ENV=staging
NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS=false
DAWAH_DEV_AUTH_BYPASS=false
NEXT_PUBLIC_SUPABASE_URL=https://hwvvvljjwouhsicwioin.supabase.co
```

Still required before deployment:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: intended public anon key from this project,
  never its service-role key.
- `NEXT_PUBLIC_API_URL`: actual reachable HTTPS API base ending in `/api/v1`.
- Confirm the remote release commit includes the intended code and has passing
  checks. The local working tree contains launch documentation changes.
- Verify the build succeeds within the free host's limits. Commands above have
  been checked against workspace scripts, not tested on Render.

Actual hostname is assigned by Render; `dawah-staging.onrender.com` is not claimed
or guaranteed available. After deployment, use the real URL for API CORS,
Supabase site URL, and required redirect allow-list entries.

## Remaining zero-cost infrastructure decision

[Render Free](https://render.com/docs/free) web services sleep after inactivity,
and background workers do not have a Free compute option. Free Key Value is
nonpersistent and does not satisfy the queue durability requirement. API
startup also requires TLS Redis, PostgreSQL, private storage, provider settings,
and observability configuration; a web deployment alone cannot satisfy these.

Do not create paid services, enter billing details, bypass deployed configuration
validation, or expose worker/metrics ports to fit a free service type. Keep full
staging pending until a workable zero-cost test architecture is established.
An operator-run local worker is a possible test-only alternative, but it needs
a reachable shared queue and database and is not provisioned by this record.

See [Stage 1 evidence](stage1-setup-record.md) for verified Supabase and Authentica
settings. Supabase Phone Auth and the delivery hook remain unactivated pending
the HTTPS API and required migration. No messages have been sent by the agent.
