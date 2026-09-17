import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createPlatformMetrics,
  metricsContentType,
} from "@dawah/observability";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { MetricsController } from "./metrics.controller";

const token = "prod-metrics-token-7f3a9c2e8d4f1a6b5c";

function configFor(
  values: Partial<Pick<ApiEnvironment, "METRICS_ENABLED" | "METRICS_TOKEN">>,
): ConfigService<ApiEnvironment, true> {
  return {
    get: (key: string) => (values as Record<string, unknown>)[key],
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function responseSpy() {
  const response = {
    status: vi.fn(() => response),
    setHeader: vi.fn(() => response),
    send: vi.fn((_body: unknown) => response),
  };
  return response as unknown as Response & typeof response;
}

describe("MetricsController", () => {
  it("renders the registry for an authorized scrape", () => {
    const metrics = createPlatformMetrics();
    metrics.httpRequests.increment({
      method: "GET",
      route: "/api/v1/events",
      status: 200,
    });
    const response = responseSpy();

    new MetricsController(
      metrics,
      configFor({ METRICS_ENABLED: true, METRICS_TOKEN: token }),
    ).scrape(`Bearer ${token}`, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      metricsContentType,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
    expect(String(response.send.mock.calls[0]?.[0])).toContain(
      "dawah_http_requests_total",
    );
  });

  it("reports the endpoint as absent when metrics are disabled", () => {
    const response = responseSpy();
    expect(() =>
      new MetricsController(
        createPlatformMetrics(),
        configFor({ METRICS_ENABLED: false, METRICS_TOKEN: token }),
      ).scrape(`Bearer ${token}`, response),
    ).toThrow(/does not exist/);
    expect(response.send).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong scrape credential", () => {
    const controller = new MetricsController(
      createPlatformMetrics(),
      configFor({ METRICS_ENABLED: true, METRICS_TOKEN: token }),
    );

    for (const authorization of [
      undefined,
      "Bearer wrong-token",
      token,
      `Basic ${token}`,
      `Bearer ${token}x`,
    ]) {
      const response = responseSpy();
      expect(() => controller.scrape(authorization, response)).toThrow(
        /bearer access token/i,
      );
      expect(response.send).not.toHaveBeenCalled();
    }
  });

  it("refuses every scrape when no token is configured", () => {
    const response = responseSpy();
    expect(() =>
      new MetricsController(
        createPlatformMetrics(),
        configFor({ METRICS_ENABLED: true, METRICS_TOKEN: undefined }),
      ).scrape("Bearer anything", response),
    ).toThrow(/bearer access token/i);
  });
});
