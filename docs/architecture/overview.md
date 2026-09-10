# Architecture overview

Dawah is an API-first modular monolith. The Next.js application, the BullMQ worker, and future SwiftUI and Jetpack Compose applications are clients of the same versioned NestJS REST API.

```text
Host web / guest web / future native apps
                    |
               HTTPS JSON
                    |
              NestJS /api/v1
              /      |      \
     PostgreSQL    Redis    object storage
                       \
                       BullMQ worker -> WhatsApp Cloud API
```

PostgreSQL is the source of truth, including durable high-impact idempotency and
provider/webhook evidence. Redis is limited to queues, worker/provider rate
limits, and measured cache use. Business rules live in `packages/domain`; DTO
validation and stable client-facing types live in `packages/api-contract`.
Prisma is isolated behind API and worker repositories and is never exposed as
the public contract.

The initial deployments are a web process, API process, and worker process. Domain modules remain in one codebase until measured scaling needs justify extraction.
