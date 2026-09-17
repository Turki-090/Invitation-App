# Observability

The platform emits three diagnostic streams — structured logs, Prometheus
metrics, and error reports — and all three are built on the same rule: an
operator must be able to follow one operation end to end without ever seeing a
guest's name, phone number, or an invitation capability.

That rule is not a convention here. It is enforced in code by
`@dawah/observability`, and it is tested against a real database in
`apps/api/test/integration/stage10.integration.test.ts`, which runs a genuine
host workflow with real personal data and asserts that none of it appears in any
diagnostic the deployment would ship off-host.

## Correlation

| Identifier      | Scope                                             | Where it appears                                                                                         |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `requestId`     | One HTTP request, or one queue-job attempt        | Every log line, the `x-request-id` response header, error reports, and the body of a failed response.    |
| `correlationId` | One user-visible operation, across both processes | Every log line, the `x-correlation-id` response header, and the payload of any job the request enqueued. |
| `actorId`       | The internal user row                             | Log lines for authenticated requests.                                                                    |
| `eventId`       | The event a request or job belongs to             | Log lines once routing or the job payload has resolved it.                                               |

A caller may supply `x-request-id` or `x-correlation-id`. The value is accepted
only if it is a bounded, printable, opaque token; anything else is replaced with
a generated identifier so a caller cannot inject content into log lines.

`actorId` is the internal user row identifier, never the auth-provider subject,
email, or phone. That choice is what allows correlation to be useful without the
log store becoming a personal-data store.

**Cross-process tracing.** When a host request enqueues work, the API stamps the
active `correlationId` into the job payload — never into the job id, because the
deterministic job id is what makes enqueueing idempotent. The worker adopts it
and issues a fresh `requestId` per attempt. One `correlationId` therefore answers
"what happened to the batch I sent?" across the API request and every job it
produced.

## Logs

One JSON object per line. `event` is a stable dotted name (`http.request_completed`,
`queue.job_exhausted`, `messaging.confirmation_sweep_failed`) so the log pipeline
can index it without parsing prose.

Levels:

| Level   | Used for                                                                      |
| ------- | ----------------------------------------------------------------------------- |
| `error` | 5xx responses, exhausted jobs, unhandled exceptions, failed shutdown.         |
| `warn`  | 4xx responses, retryable job failures, dropped error reports.                 |
| `info`  | Completed requests and jobs, startup and shutdown.                            |
| `debug` | Job starts, health checks, and metrics scrapes — never enabled when deployed. |

Health and scrape traffic logs at `debug` deliberately: at `info` it would bury
the traffic an operator is actually looking at.

Deployed environments are validated at startup to use `json` format at `info` or
above. `LOG_FORMAT=pretty` and `LOG_LEVEL=debug` are local-only and rejected in
staging and production.

### Redaction

Redaction runs centrally, on the way into the line, so no call site can leak by
logging an object it did not inspect. Two passes:

1. **By key** — a field whose name identifies a credential (`token`, `secret`,
   `authorization`, `capability`, `signature`, …) or personal data (`name`,
   `phoneE164`, `email`, `recipient`, `venue`, …) is replaced whatever its value.
   Key matching is exact for names, so `queueName` and `templateName` survive:
   an over-broad rule would remove the fields incident response needs.
2. **By value** — every surviving string is scrubbed for phone numbers in
   international and Saudi local form, email addresses, bearer credentials,
   JSON Web Tokens, and opaque tokens of forty characters or more. URL-valued
   fields additionally have signature, capability, and expiry parameters
   stripped while the path is kept.

UUID entity identifiers deliberately survive: they are internal, and they are
what makes a redacted log still diagnosable.

Structures are also bounded — depth, breadth, and string length — and cycles are
replaced rather than followed, so a logged framework object cannot stall the
process.

## Metrics

Prometheus text exposition, defined once in
`packages/observability/src/platform-metrics.ts`:

| Metric                                       | Type      | Labels                                      |
| -------------------------------------------- | --------- | ------------------------------------------- |
| `dawah_build_info`                           | gauge     | service, environment, release, node_version |
| `dawah_http_requests_total`                  | counter   | method, route, status                       |
| `dawah_http_request_duration_seconds`        | histogram | method, route                               |
| `dawah_http_errors_total`                    | counter   | method, route, kind                         |
| `dawah_http_requests_in_flight`              | gauge     | —                                           |
| `dawah_queue_jobs_total`                     | counter   | queue, job, outcome                         |
| `dawah_queue_job_duration_seconds`           | histogram | queue, job                                  |
| `dawah_queue_depth`                          | gauge     | queue, state                                |
| `dawah_queue_oldest_waiting_job_age_seconds` | gauge     | queue                                       |
| `dawah_provider_requests_total`              | counter   | provider, operation, outcome                |
| `dawah_provider_request_duration_seconds`    | histogram | provider, operation                         |
| `dawah_domain_events_total`                  | counter   | kind, outcome                               |

**Cardinality is bounded structurally.** Route labels are templates
(`/api/v1/events/:id/invitations`), produced by normalising the concrete path,
so neither an entity identifier nor an invitation capability can become a label.
Beyond a per-metric series ceiling, further label combinations collapse into a
single `overflow` series rather than growing without limit.

**Queue depth is sampled at scrape time**, not polled on a timer, so an
unscraped worker does no Redis work and the numbers an operator reads are the
numbers at the moment they looked.

### Endpoints

- API: `GET /api/v1/internal/metrics`
- Worker: `GET /metrics` on the worker health port

Both require `Authorization: Bearer <METRICS_TOKEN>`, compared in constant time.
`METRICS_TOKEN` is a deployment-managed secret, distinct from any user access
token, and must be at least 32 characters in a deployed environment. When
`METRICS_ENABLED` is false the route reports as absent rather than forbidden, so
a deployment with metrics off does not advertise the endpoint. Neither endpoint
may be published through the public ingress.

## Error reporting

Configured by `SENTRY_DSN`; absent means error reporting is disabled, not
broken. The transport is written against Sentry's documented envelope endpoint
rather than the vendor SDK, for the same reason the messaging and storage
providers are boundaries: neither service should inherit automatic
instrumentation of request bodies, headers, and breadcrumbs, which is exactly
the material the security model forbids in diagnostics.

- Only unexpected failures are reported. An expected `403` or `409` is an
  outcome, not an incident.
- A queue job is reported when it exhausts its retries, not on every attempt, so
  one provider blip does not become a flood of identical alerts.
- Payloads pass through the same redaction as logs, and carry the correlation
  identifiers so a report links back to its log trail.
- Delivery is fire-and-forget with a concurrency ceiling: an error storm cannot
  convert into unbounded socket and memory use. Pending reports are flushed on
  shutdown with a bounded timeout.

## Alerts and dashboards

Alert rules live in `ops/prometheus/alerts.yaml` and the overview dashboard in
`ops/grafana/dawah-overview.json`. A reference scrape configuration is in
`ops/prometheus/scrape.example.yaml`.

`pnpm ops:check` parses both against the metric definitions in the source and
fails when an expression references a metric that no longer exists, when an
alert has no severity, or when its runbook annotation points at a file that is
not in the repository. That check runs in CI, because an alert rule that
silently stops matching is worse than no alert at all.

Severity contract: `page` means a host-visible failure or an unrecoverable
trend; `ticket` means degradation handled in business hours. Every alert names a
runbook.

## Adding instrumentation

1. Define the metric in `platform-metrics.ts` — that file is the only supported
   place — and keep its labels bounded and free of personal data.
2. Log with a dotted event name and structured fields; never interpolate values
   into the message.
3. If the new signal deserves an alert, add the rule and its runbook annotation
   in the same change, and run `pnpm ops:check`.
4. If the change touches a path carrying personal data, extend the Stage 10
   diagnostics integration suite with the value that must not appear.
