import { timingSafeEqual } from "node:crypto";
import {
  defaultDurationBuckets,
  MetricsRegistry,
  type Counter,
  type Gauge,
  type Histogram,
} from "./metrics";

/**
 * The platform metric set.
 *
 * Both deployed services build their instrumentation from this one definition
 * so that alert rules and dashboards can be written against fixed names. Adding
 * a metric here is the only supported way to add one: the alert rules in
 * `ops/prometheus/alerts.yaml` and the dashboard in `ops/grafana/` are reviewed
 * against this file.
 */
export interface PlatformMetrics {
  readonly registry: MetricsRegistry;
  readonly buildInfo: Gauge;
  readonly httpRequests: Counter;
  readonly httpRequestDuration: Histogram;
  readonly httpErrors: Counter;
  readonly httpRequestsInFlight: Gauge;
  readonly queueJobs: Counter;
  readonly queueJobDuration: Histogram;
  readonly queueDepth: Gauge;
  readonly queueOldestWaitingJobAge: Gauge;
  readonly providerRequests: Counter;
  readonly providerRequestDuration: Histogram;
  readonly domainEvents: Counter;
}

/** Queue states sampled for `dawah_queue_depth`. */
export const sampledQueueStates = [
  "waiting",
  "active",
  "delayed",
  "failed",
] as const;
export type SampledQueueState = (typeof sampledQueueStates)[number];

/** Outcome label used across queue, provider, and domain counters. */
export type MetricOutcome =
  | "succeeded"
  | "failed"
  | "retried"
  | "exhausted"
  | "rejected"
  | "duplicate"
  | "rate_limited";

export function createPlatformMetrics(
  registry: MetricsRegistry = new MetricsRegistry(),
): PlatformMetrics {
  return {
    registry,
    buildInfo: registry.gauge(
      "dawah_build_info",
      "Static build and deployment identity; always 1.",
      ["service", "environment", "release", "node_version"],
    ),
    httpRequests: registry.counter(
      "dawah_http_requests_total",
      "HTTP requests handled by the API, labelled by route template.",
      ["method", "route", "status"],
    ),
    httpRequestDuration: registry.histogram(
      "dawah_http_request_duration_seconds",
      "API request handling duration in seconds.",
      ["method", "route"],
      defaultDurationBuckets,
    ),
    httpErrors: registry.counter(
      "dawah_http_errors_total",
      "API responses with a 4xx or 5xx status.",
      ["method", "route", "kind"],
    ),
    httpRequestsInFlight: registry.gauge(
      "dawah_http_requests_in_flight",
      "API requests currently being handled.",
    ),
    queueJobs: registry.counter(
      "dawah_queue_jobs_total",
      "Queue jobs processed by the worker.",
      ["queue", "job", "outcome"],
    ),
    queueJobDuration: registry.histogram(
      "dawah_queue_job_duration_seconds",
      "Queue job processing duration in seconds.",
      ["queue", "job"],
      defaultDurationBuckets,
    ),
    queueDepth: registry.gauge(
      "dawah_queue_depth",
      "Jobs in each queue by state, sampled at scrape time.",
      ["queue", "state"],
    ),
    queueOldestWaitingJobAge: registry.gauge(
      "dawah_queue_oldest_waiting_job_age_seconds",
      "Age of the oldest waiting job in each queue, sampled at scrape time.",
      ["queue"],
    ),
    providerRequests: registry.counter(
      "dawah_provider_requests_total",
      "Outbound requests to an external provider.",
      ["provider", "operation", "outcome"],
    ),
    providerRequestDuration: registry.histogram(
      "dawah_provider_request_duration_seconds",
      "Outbound provider request duration in seconds.",
      ["provider", "operation"],
      defaultDurationBuckets,
    ),
    domainEvents: registry.counter(
      "dawah_domain_events_total",
      "Business outcomes that operations and the pilot review depend on.",
      ["kind", "outcome"],
    ),
  };
}

export function recordBuildInfo(
  metrics: PlatformMetrics,
  identity: {
    readonly service: string;
    readonly environment: string;
    readonly release?: string;
  },
): void {
  metrics.buildInfo.set(
    {
      service: identity.service,
      environment: identity.environment,
      release: identity.release ?? "unknown",
      node_version: process.version,
    },
    1,
  );
}

export const metricsContentType = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Authorizes a metrics scrape.
 *
 * The endpoint exposes operational volumes rather than personal data, but it
 * still describes the platform's internals, so it is bearer-guarded and
 * compared in constant time. An unset token means metrics are disabled, never
 * open: the caller is expected to return 404 in that case.
 */
export function isAuthorizedMetricsRequest(
  authorizationHeader: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;
  if (typeof authorizationHeader !== "string") return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const presented = match?.[1];
  if (presented === undefined) return false;

  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expectedToken, "utf8");
  if (presentedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(presentedBytes, expectedBytes);
}
