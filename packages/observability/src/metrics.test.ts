import { describe, expect, it } from "vitest";
import { MetricsRegistry, overflowLabelValue } from "./metrics";
import {
  createPlatformMetrics,
  isAuthorizedMetricsRequest,
  recordBuildInfo,
} from "./platform-metrics";

describe("MetricsRegistry", () => {
  it("renders counters in Prometheus exposition format", () => {
    const registry = new MetricsRegistry();
    const requests = registry.counter(
      "dawah_http_requests_total",
      "Requests handled.",
      ["method", "route", "status"],
    );
    requests.increment({ method: "GET", route: "/events/:id", status: 200 });
    requests.increment({ method: "GET", route: "/events/:id", status: 200 });
    requests.increment({ method: "GET", route: "/events/:id", status: 404 });

    const rendered = registry.render();
    expect(rendered).toContain("# TYPE dawah_http_requests_total counter");
    expect(rendered).toContain(
      'dawah_http_requests_total{method="GET",route="/events/:id",status="200"} 2',
    );
    expect(rendered).toContain(
      'dawah_http_requests_total{method="GET",route="/events/:id",status="404"} 1',
    );
  });

  it("renders histogram buckets cumulatively with a sum and count", () => {
    const registry = new MetricsRegistry();
    const duration = registry.histogram(
      "dawah_http_request_duration_seconds",
      "Duration.",
      ["route"],
      [0.1, 1],
    );
    duration.observe({ route: "/events" }, 0.05);
    duration.observe({ route: "/events" }, 0.5);
    duration.observe({ route: "/events" }, 5);

    const rendered = registry.render();
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_bucket{route="/events",le="0.1"} 1',
    );
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_bucket{route="/events",le="1.0"} 2',
    );
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_bucket{route="/events",le="+Inf"} 3',
    );
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_count{route="/events"} 3',
    );
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_sum{route="/events"} 5.55',
    );
  });

  it("times an operation whether it resolves or rejects", async () => {
    const registry = new MetricsRegistry();
    const duration = registry.histogram("dawah_op_seconds", "Op.", ["op"]);

    await duration.time({ op: "ok" }, async () => "value");
    await expect(
      duration.time({ op: "fail" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rendered = registry.render();
    expect(rendered).toContain('dawah_op_seconds_count{op="ok"} 1');
    expect(rendered).toContain('dawah_op_seconds_count{op="fail"} 1');
  });

  it("supports gauge set and increment", () => {
    const registry = new MetricsRegistry();
    const depth = registry.gauge("dawah_queue_depth", "Depth.", ["queue"]);
    depth.set({ queue: "exports" }, 7);
    depth.increment({ queue: "exports" }, -2);
    expect(registry.render()).toContain('dawah_queue_depth{queue="exports"} 5');
  });

  it("folds excess label combinations into one overflow series", () => {
    const registry = new MetricsRegistry(3);
    const counter = registry.counter("dawah_test_total", "Test.", ["route"]);
    for (let index = 0; index < 10; index += 1) {
      counter.increment({ route: `/route-${index}` });
    }

    const rendered = registry.render();
    const seriesCount = rendered
      .split("\n")
      .filter((line) => line.startsWith("dawah_test_total{")).length;
    expect(seriesCount).toBe(4);
    expect(rendered).toContain(
      `dawah_test_total{route="${overflowLabelValue}"} 7`,
    );
  });

  it("escapes and bounds untrusted label values", () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter("dawah_provider_total", "Provider.", [
      "reason",
    ]);
    counter.increment({ reason: 'quote " and\nnewline' });
    const rendered = registry.render();
    expect(rendered).toContain('reason="quote \\" and newline"');

    const longCounter = registry.counter("dawah_long_total", "Long.", [
      "value",
    ]);
    longCounter.increment({ value: "v".repeat(300) });
    const longLine = registry
      .render()
      .split("\n")
      .find((line) => line.startsWith("dawah_long_total{"));
    expect(longLine?.length).toBeLessThan(200);
  });

  it("rejects invalid metric and label names", () => {
    const registry = new MetricsRegistry();
    expect(() => registry.counter("invalid-name", "Bad.")).toThrow(
      /Invalid metric name/,
    );
    expect(() =>
      registry.counter("valid_total", "Bad.", ["bad-label"]),
    ).toThrow(/Invalid metric label name/);
  });

  it("ignores non-finite and negative counter values", () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter("dawah_guard_total", "Guard.");
    counter.increment(undefined, Number.NaN);
    counter.increment(undefined, -5);
    counter.increment(undefined, 2);
    expect(registry.render()).toContain("dawah_guard_total 2");
  });

  it("runs scrape-time collectors and survives a failing one", () => {
    const registry = new MetricsRegistry();
    const gauge = registry.gauge("dawah_sampled", "Sampled.");
    registry.registerCollector(() => {
      throw new Error("sampling unavailable");
    });
    registry.registerCollector(() => gauge.set(undefined, 42));
    expect(registry.render()).toContain("dawah_sampled 42");
  });
});

describe("createPlatformMetrics", () => {
  it("exposes the documented metric names", () => {
    const metrics = createPlatformMetrics();
    recordBuildInfo(metrics, {
      service: "api",
      environment: "staging",
      release: "stage10",
    });
    metrics.httpRequests.increment({
      method: "GET",
      route: "/health",
      status: 200,
    });
    metrics.queueJobs.increment({
      queue: "whatsapp-send",
      job: "SEND_MESSAGE",
      outcome: "succeeded",
    });
    metrics.providerRequests.increment({
      provider: "META_WHATSAPP",
      operation: "send_template",
      outcome: "succeeded",
    });
    metrics.domainEvents.increment({
      kind: "rsvp_submission",
      outcome: "succeeded",
    });

    const rendered = metrics.registry.render();
    for (const name of [
      "dawah_build_info",
      "dawah_http_requests_total",
      "dawah_queue_jobs_total",
      "dawah_provider_requests_total",
      "dawah_domain_events_total",
    ]) {
      expect(rendered).toContain(name);
    }
    expect(rendered).toContain('service="api"');
    expect(rendered).toContain('environment="staging"');
  });
});

describe("isAuthorizedMetricsRequest", () => {
  const token = "metrics-token-value-that-is-long-enough";

  it("accepts the exact bearer token", () => {
    expect(isAuthorizedMetricsRequest(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorizedMetricsRequest(`bearer ${token}`, token)).toBe(true);
  });

  it("rejects a missing, wrong, or malformed credential", () => {
    expect(isAuthorizedMetricsRequest(undefined, token)).toBe(false);
    expect(isAuthorizedMetricsRequest("Bearer wrong", token)).toBe(false);
    expect(isAuthorizedMetricsRequest(token, token)).toBe(false);
    expect(isAuthorizedMetricsRequest(`Bearer ${token}x`, token)).toBe(false);
  });

  it("denies every request when no token is configured", () => {
    expect(isAuthorizedMetricsRequest("Bearer anything", undefined)).toBe(
      false,
    );
    expect(isAuthorizedMetricsRequest("Bearer ", "")).toBe(false);
  });
});
