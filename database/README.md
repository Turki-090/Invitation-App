# Database

PostgreSQL is the source of truth. Prisma models live in `schema.prisma`; reviewed SQL migrations live in `migrations/`.

Use `pnpm prisma migrate dev --schema database/schema.prisma --name <change>` locally. Production deployments must use `prisma migrate deploy`; `db push` is not an accepted migration workflow.

## Seed and test data conventions

`pnpm seed` is an explicit, idempotent local-development seed. It uses stable UUIDs
and refuses non-local databases. Product migrations never contain sample data.

Integration factories live under `apps/api/test/integration`. They use fixed dates,
reset their sequence before every test, and clean through a test-database wrapper
that accepts only the local database named exactly `dawah_test`. Integration tests
must never reuse the development, staging, or production database.
