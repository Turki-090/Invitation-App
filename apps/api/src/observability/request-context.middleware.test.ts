import { EventEmitter } from "node:events";
import {
  createLogger,
  createPlatformMetrics,
  enrichRequestContext,
  getRequestContext,
  type LogLevel,
} from "@dawah/observability";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it } from "vitest";
import { RequestContextMiddleware } from "./request-context.middleware";

class FakeResponse extends EventEmitter {
  public statusCode = 200;
  public readonly headers = new Map<string, string>();

  public setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  public finish(statusCode: number): void {
    this.statusCode = statusCode;
    this.emit("finish");
  }
}

function harness() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "api",
    environment: "test",
    level: "debug",
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  const metrics = createPlatformMetrics();
  const middleware = new RequestContextMiddleware(logger, metrics);

  const run = (
    request: Partial<Request>,
    duringRequest: () => void = () => undefined,
  ): { response: FakeResponse; nextCalled: boolean } => {
    const response = new FakeResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
      duringRequest();
    };
    middleware.use(
      {
        method: "GET",
        originalUrl: "/api/v1/events",
        headers: {},
        ...request,
      } as Request,
      response as unknown as Response,
      next,
    );
    return { response, nextCalled };
  };

  return { lines, logger, metrics, run };
}

describe("RequestContextMiddleware", () => {
  let context: ReturnType<typeof harness>;

  beforeEach(() => {
    context = harness();
  });

  it("issues correlation identifiers and echoes them on the response", () => {
    let observed: ReturnType<typeof getRequestContext>;
    const { response, nextCalled } = context.run({}, () => {
      observed = getRequestContext();
    });

    expect(nextCalled).toBe(true);
    expect(observed?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(observed?.correlationId).toBe(observed?.requestId);
    expect(observed?.route).toBe("/api/v1/events");
    expect(response.headers.get("x-request-id")).toBe(observed?.requestId);
    expect(response.headers.get("x-correlation-id")).toBe(
      observed?.correlationId,
    );
  });

  it("adopts a valid inbound correlation identifier", () => {
    let observed: ReturnType<typeof getRequestContext>;
    context.run(
      {
        headers: {
          "x-request-id": "edge-request-1",
          "x-correlation-id": "journey-1",
        },
      },
      () => {
        observed = getRequestContext();
      },
    );

    expect(observed?.requestId).toBe("edge-request-1");
    expect(observed?.correlationId).toBe("journey-1");
  });

  it("rejects an inbound identifier that could corrupt a log line", () => {
    let observed: ReturnType<typeof getRequestContext>;
    context.run(
      { headers: { "x-request-id": "bad\nvalue with spaces" } },
      () => {
        observed = getRequestContext();
      },
    );

    expect(observed?.requestId).not.toContain("\n");
    expect(observed?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps identifiers out of the route label", () => {
    let observed: ReturnType<typeof getRequestContext>;
    context.run(
      {
        originalUrl:
          "/api/v1/events/550e8400-e29b-41d4-a716-446655440000/invitations?search=ahmed",
      },
      () => {
        observed = getRequestContext();
      },
    );

    expect(observed?.route).toBe("/api/v1/events/:id/invitations");
  });

  it("records a completed request once, with duration and status", () => {
    const { response } = context.run({});
    response.finish(200);
    response.emit("close");

    const rendered = context.metrics.registry.render();
    expect(rendered).toContain(
      'dawah_http_requests_total{method="GET",route="/api/v1/events",status="200"} 1',
    );
    expect(rendered).toContain(
      'dawah_http_request_duration_seconds_count{method="GET",route="/api/v1/events"} 1',
    );
    expect(rendered).toContain("dawah_http_requests_in_flight 0");

    const completed = context.lines.filter(
      (line) => line.event === "http.request_completed",
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ statusCode: 200, method: "GET" });
    expect(completed[0]?.durationMs).toBeTypeOf("number");
  });

  it("separates client and server failures and raises the log level", () => {
    const rejected = context.run({});
    rejected.response.finish(403);
    const failed = context.run({});
    failed.response.finish(500);

    const rendered = context.metrics.registry.render();
    expect(rendered).toContain('kind="client"');
    expect(rendered).toContain('kind="server"');

    const levels = new Map(
      context.lines.map((line) => [line.event, line.level as LogLevel]),
    );
    expect(levels.get("http.request_rejected")).toBe("warn");
    expect(levels.get("http.request_failed")).toBe("error");
  });

  it("logs health and scrape traffic at debug so real traffic stays visible", () => {
    const health = context.run({ originalUrl: "/api/v1/health/ready" });
    health.response.finish(200);
    const scrape = context.run({ originalUrl: "/api/v1/internal/metrics" });
    scrape.response.finish(200);

    expect(context.lines.every((line) => line.level === "debug")).toBe(true);
  });

  it("reports the actor resolved after the context was created", () => {
    const { response } = context.run({}, () => {
      enrichRequestContext({ actorId: "user-1" });
    });
    response.finish(200);

    expect(context.lines[0]).toMatchObject({
      actorId: "user-1",
      event: "http.request_completed",
    });
  });

  it("still completes when the client aborts before a response", () => {
    const { response } = context.run({});
    response.emit("close");

    expect(context.metrics.registry.render()).toContain(
      "dawah_http_requests_in_flight 0",
    );
    expect(context.lines).toHaveLength(1);
  });
});
