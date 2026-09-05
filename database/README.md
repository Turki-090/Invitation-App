# Database

PostgreSQL is the source of truth. Prisma models live in `schema.prisma`; reviewed SQL migrations live in `migrations/`.

Use `pnpm prisma migrate dev --schema database/schema.prisma --name <change>` locally. Production deployments must use `prisma migrate deploy`; `db push` is not an accepted migration workflow.
