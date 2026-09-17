# Production-readiness checklist

The Stage 10 exit gate requires that every item below has **recorded evidence**,
an **approved exception**, or is **disabled behind a verified feature flag**.
A tick with no evidence is not a pass.

Status values: `Done` (evidence recorded in this repository), `Deployment`
(requires a provisioned environment), `Pilot` (requires a real event),
`Legal` (requires qualified review), `Open` (identified work, not started).

Last updated: 2026-09-17, at the close of Stage 10 repository work.

## 1. Environments and configuration

| #    | Item                                                                                                                            | Status                                | Evidence                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| 1.1  | Separate development, staging, and production projects with separate credentials, databases, Redis, buckets, and queue prefixes | Deployment                            | [environments.md](operations/environments.md)                                |
| 1.2  | Approved Saudi/GCC region recorded for every data store                                                                         | Deployment                            | Data map in [privacy-and-pdpl.md](security/privacy-and-pdpl.md)              |
| 1.3  | Deployed configuration refuses insecure values at startup                                                                       | Done                                  | `packages/config`, 27 validation tests                                       |
| 1.4  | Domains, TLS 1.2+, HSTS, automated certificate renewal                                                                          | Deployment                            | —                                                                            |
| 1.5  | CORS restricted to exact remote HTTPS origins                                                                                   | Done (enforced) / Deployment (values) | Startup validation                                                           |
| 1.6  | Content Security Policy on the web application                                                                                  | Done, with finding 1                  | `apps/web/next.config.ts`, [security-review.md](security/security-review.md) |
| 1.7  | Secrets held in a managed secret store; no populated env file committed                                                         | Deployment                            | `.env.*.example` are blank templates                                         |
| 1.8  | Every secret has an owner and a rotation procedure                                                                              | Done                                  | [credential-rotation.md](runbooks/credential-rotation.md)                    |
| 1.9  | Private endpoints unreachable from the public internet                                                                          | Deployment                            | Verify per finding 4                                                         |
| 1.10 | Edge volume limiting on the webhook and media paths                                                                             | Deployment                            | Compensating control for finding 3                                           |
| 1.11 | Supabase Auth project per environment                                                                                           | Deployment                            | —                                                                            |
| 1.12 | Meta WhatsApp credentials, approved templates, and public webhook per environment                                               | Deployment                            | —                                                                            |

## 2. Observability

| #    | Item                                                                 | Status                         | Evidence                                                                |
| ---- | -------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| 2.1  | Structured JSON logging, redacted, with correlation identifiers      | Done                           | `@dawah/observability`; [observability.md](operations/observability.md) |
| 2.2  | Redaction proven against real personal data in a real database       | Done                           | Stage 10 diagnostics integration suite                                  |
| 2.3  | Correlation carried from API request into the queue job it enqueues  | Done                           | Stage 10 integration suite                                              |
| 2.4  | Request, error, queue, and provider metrics with bounded cardinality | Done                           | `platform-metrics.ts`; metrics tests                                    |
| 2.5  | Metrics endpoints bearer-guarded and absent when disabled            | Done                           | Controller and worker tests                                             |
| 2.6  | Error reporting configured and confirmed active                      | Done (code) / Deployment (DSN) | Finding 6                                                               |
| 2.7  | Dashboards defined as code                                           | Done                           | `ops/grafana/dawah-overview.json`                                       |
| 2.8  | Alerts defined as code, each with severity and an existing runbook   | Done                           | `ops/prometheus/alerts.yaml`; `pnpm ops:check` in CI                    |
| 2.9  | Alerts wired to a pager that reaches a human within five minutes     | Deployment                     | —                                                                       |
| 2.10 | Log pipeline ingesting and indexing `requestId`                      | Deployment                     | —                                                                       |

## 3. Backup and recovery

| #   | Item                                                                           | Status     | Evidence                                            |
| --- | ------------------------------------------------------------------------------ | ---------- | --------------------------------------------------- |
| 3.1 | Automated backups with point-in-time recovery                                  | Deployment | —                                                   |
| 3.2 | Backups encrypted, access-controlled, and region-recorded                      | Deployment | —                                                   |
| 3.3 | Restore drill performed and recorded, with measured duration                   | Deployment | [database-restore.md](runbooks/database-restore.md) |
| 3.4 | Restore reconciliation procedure documented, including the duplicate-send risk | Done       | [database-restore.md](runbooks/database-restore.md) |
| 3.5 | Backup retention consistent with the retention schedule                        | Legal      | [privacy-and-pdpl.md](security/privacy-and-pdpl.md) |

## 4. Privacy and PDPL

| #    | Item                                                          | Status                              | Evidence                                            |
| ---- | ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| 4.1  | Data map: categories, subjects, purposes                      | Done                                | [privacy-and-pdpl.md](security/privacy-and-pdpl.md) |
| 4.2  | Processor and processing-location inventory completed         | Deployment + Legal                  | Table is scaffolded, values pending                 |
| 4.3  | Controller/processor roles confirmed                          | Legal                               | —                                                   |
| 4.4  | Cross-border transfer basis recorded for Meta                 | Legal                               | —                                                   |
| 4.5  | Host-facing privacy notice published                          | Legal                               | —                                                   |
| 4.6  | Retention schedule agreed and configured                      | Legal                               | Technical retentions already enforced               |
| 4.7  | Access and export workflow for hosts and guests               | Done (documented)                   | [privacy-and-pdpl.md](security/privacy-and-pdpl.md) |
| 4.8  | Deletion and recovery workflow implemented                    | Open                                | Finding 2                                           |
| 4.9  | Incident-response procedure including notification assessment | Done (documented) / Legal (trigger) | [privacy-and-pdpl.md](security/privacy-and-pdpl.md) |
| 4.10 | Analytics use internal identifiers only                       | Done                                | No guest data in diagnostics; proven by 2.2         |
| 4.11 | Data-processing agreements signed with every processor        | Legal                               | —                                                   |

## 5. Security

| #    | Item                                                                       | Status                                    | Evidence                                                            |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| 5.1  | Repository security review completed                                       | Done                                      | [security-review.md](security/security-review.md)                   |
| 5.2  | Authentication, authorization, and cross-event isolation verified by tests | Done                                      | Integration suites                                                  |
| 5.3  | Public capability handling verified                                        | Done                                      | Stage 7 suite                                                       |
| 5.4  | Webhook signature verification and deduplication verified                  | Done                                      | Stage 6 and 7 suites                                                |
| 5.5  | Upload type, size, and content validation verified                         | Done                                      | Assets and imports unit tests                                       |
| 5.6  | Idempotency and replay protection verified                                 | Done                                      | Stage 6, 8, 9 suites                                                |
| 5.7  | Dependency audit gate in CI, high advisories resolved                      | Done                                      | `pnpm audit` job; workspace overrides                               |
| 5.8  | Pull-request dependency review                                             | Done                                      | `dependency-review` CI job                                          |
| 5.9  | Production-access policy agreed and enforced                               | Done (documented) / Deployment (enforced) | [production-access-policy.md](security/production-access-policy.md) |
| 5.10 | Deployed-environment security review and penetration test                  | Deployment                                | Listed in [security-review.md](security/security-review.md)         |
| 5.11 | Nonce-based CSP replacing `'unsafe-inline'`                                | Open                                      | Finding 1                                                           |

## 6. Quality gates

| #    | Item                                                                | Status     | Evidence                                                                           |
| ---- | ------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| 6.1  | Contract linting and generated-client drift check                   | Done       | `pnpm openapi:lint`, `openapi:check`                                               |
| 6.2  | Formatting, linting, and type checking across the workspace         | Done       | CI                                                                                 |
| 6.3  | Unit, contract, component, provider, storage, API, and worker tests | Done       | CI                                                                                 |
| 6.4  | Storybook accessibility and visual regression                       | Done       | `pnpm test:storybook`                                                              |
| 6.5  | Real-PostgreSQL integration tests                                   | Done       | `pnpm test:integration`                                                            |
| 6.6  | Startup smoke check                                                 | Done       | `pnpm smoke`                                                                       |
| 6.7  | Production container build and container smoke                      | Done in CI | `pnpm smoke:containers`                                                            |
| 6.8  | Operational artifacts validated against emitted metrics             | Done       | `pnpm ops:check`                                                                   |
| 6.9  | k6 load scenarios with thresholds                                   | Done       | `load/`, [load-and-query-plan-testing.md](runbooks/load-and-query-plan-testing.md) |
| 6.10 | Query-plan confirmations for report and export paths                | Done       | [query-plan-review.md](query-plan-review.md)                                       |
| 6.11 | End-to-end Playwright journeys against a running stack              | Open       | Storybook a11y/visual coverage exists; full-stack journeys do not                  |

## 7. Operational readiness

| #    | Item                                             | Status                                   | Evidence                                                        |
| ---- | ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------- |
| 7.1  | Forward-migration rehearsal                      | Deployment                               | [migration-and-rollback.md](runbooks/migration-and-rollback.md) |
| 7.2  | Rollback rehearsal                               | Deployment                               | [migration-and-rollback.md](runbooks/migration-and-rollback.md) |
| 7.3  | Provider-outage rehearsal                        | Deployment                               | [provider-outage.md](runbooks/provider-outage.md)               |
| 7.4  | Queue-backlog rehearsal                          | Deployment                               | [queue-backlog.md](runbooks/queue-backlog.md)                   |
| 7.5  | Database-restore rehearsal                       | Deployment                               | [database-restore.md](runbooks/database-restore.md)             |
| 7.6  | Credential-rotation rehearsal                    | Deployment                               | [credential-rotation.md](runbooks/credential-rotation.md)       |
| 7.7  | Event-night incident rehearsal                   | Deployment                               | [event-night-incident.md](runbooks/event-night-incident.md)     |
| 7.8  | Named on-call ownership and escalation path      | Deployment                               | [release-and-rollback.md](operations/release-and-rollback.md)   |
| 7.9  | Release windows respect the event calendar       | Done (policy)                            | [release-and-rollback.md](operations/release-and-rollback.md)   |
| 7.10 | Gradual rollout plan with named abort thresholds | Done                                     | [release-and-rollback.md](operations/release-and-rollback.md)   |
| 7.11 | Immediately executable rollback plan per release | Done (policy) / Deployment (per release) | [release-and-rollback.md](operations/release-and-rollback.md)   |

## 8. Acceptance and release

| #   | Item                                                                                               | Status     | Evidence                                                      |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| 8.1 | Live non-production Meta exercise recorded, without retaining guest PII or credentials             | Deployment | Finding 7                                                     |
| 8.2 | Internal alpha completed                                                                           | Deployment | —                                                             |
| 8.3 | Staging acceptance completed                                                                       | Deployment | —                                                             |
| 8.4 | Controlled Saudi pilot completed with per-event reconciliation                                     | Pilot      | [release-and-rollback.md](operations/release-and-rollback.md) |
| 8.5 | Check-in rehearsed at a real event behind its flag                                                 | Pilot      | —                                                             |
| 8.6 | Remediation window completed                                                                       | Pilot      | —                                                             |
| 8.7 | Go/no-go review with named approvers from product, engineering, security, operations, and business | Pilot      | —                                                             |

## Exception register

An exception records: the item, why it is accepted, the compensating control,
the owner, and the date it is revisited. None are approved yet.

| Item                                    | Rationale                                                | Compensating control                                                                                   | Owner       | Review date                 |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- | --------------------------- |
| 5.7 residual advisories                 | Development-only, not reachable from a deployed service  | CI audit gate at `high`; re-evaluated each dependency review                                           | Engineering | Next dependency review      |
| 3 (finding) webhook/media throttle skip | Throttling would drop provider callbacks and break sends | Signature verification, event-id deduplication, checksum-bound signed URLs, plus edge limiting at 1.10 | Engineering | Before general availability |
