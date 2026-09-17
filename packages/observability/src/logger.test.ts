import { describe, expect, it } from "vitest";
import { runWithRequestContext } from "./context";
import { createLogger, createNullLogger, type LogLevel } from "./logger";
import { redactedPlaceholder } from "./redact";

function collectingLogger(level: LogLevel = "info") {
  const lines: { line: string; level: LogLevel }[] = [];
  const logger = createLogger({
    service: "api",
    environment: "test",
    release: "stage10",
    level,
    write: (line, writtenLevel) => lines.push({ line, level: writtenLevel }),
    now: () => new Date("2026-09-17T10:00:00.000Z"),
  });
  const records = (): Record<string, unknown>[] =>
    lines.map((entry) => JSON.parse(entry.line) as Record<string, unknown>);
  return { logger, lines, records };
}

describe("createLogger", () => {
  it("emits one structured JSON object per line", () => {
    const { logger, records } = collectingLogger();
    logger.info("http.request_completed", { statusCode: 200, durationMs: 12 });

    expect(records()).toEqual([
      {
        timestamp: "2026-09-17T10:00:00.000Z",
        level: "info",
        service: "api",
        environment: "test",
        event: "http.request_completed",
        release: "stage10",
        statusCode: 200,
        durationMs: 12,
      },
    ]);
  });

  it("redacts fields before they reach the sink", () => {
    const { logger, records } = collectingLogger();
    logger.warn("messaging.send_rejected", {
      guestName: "سارة",
      to: "+966501234567",
      reason: "template not approved for +966501234567",
    });

    expect(records()[0]).toMatchObject({
      guestName: redactedPlaceholder,
      to: redactedPlaceholder,
      reason: `template not approved for ${redactedPlaceholder}`,
    });
  });

  it("attaches the active correlation context", () => {
    const { logger, records } = collectingLogger();
    runWithRequestContext(
      {
        requestId: "request-1",
        correlationId: "correlation-1",
        actorId: "user-1",
        eventId: "event-1",
        route: "/api/v1/events/:id",
      },
      () => logger.info("events.updated"),
    );

    expect(records()[0]).toMatchObject({
      requestId: "request-1",
      correlationId: "correlation-1",
      actorId: "user-1",
      eventId: "event-1",
      route: "/api/v1/events/:id",
    });
  });

  it("refuses to let caller fields overwrite the correlation envelope", () => {
    const { logger, records } = collectingLogger();
    runWithRequestContext(
      { requestId: "request-1", correlationId: "correlation-1" },
      () =>
        logger.info("events.updated", {
          requestId: "spoofed",
          level: "debug",
          service: "spoofed",
        }),
    );

    expect(records()[0]).toMatchObject({
      requestId: "request-1",
      level: "info",
      service: "api",
    });
  });

  it("filters below the configured level", () => {
    const { logger, lines } = collectingLogger("warn");
    logger.debug("ignored");
    logger.info("ignored");
    logger.warn("kept");
    logger.error("kept");
    expect(lines).toHaveLength(2);
  });

  it("routes warnings and errors to the error stream", () => {
    const { logger, lines } = collectingLogger("debug");
    logger.info("a");
    logger.warn("b");
    logger.error("c");
    expect(lines.map((entry) => entry.level)).toEqual([
      "info",
      "warn",
      "error",
    ]);
  });

  it("merges child fields into every line", () => {
    const { logger, records } = collectingLogger();
    logger.child({ queue: "whatsapp-send" }).info("queue.job_completed", {
      job: "SEND_MESSAGE",
    });
    expect(records()[0]).toMatchObject({
      queue: "whatsapp-send",
      job: "SEND_MESSAGE",
    });
  });

  it("writes a human-readable line in pretty format", () => {
    const lines: string[] = [];
    createLogger({
      service: "worker",
      environment: "local",
      format: "pretty",
      write: (line) => lines.push(line),
      now: () => new Date("2026-09-17T10:00:00.000Z"),
    }).info("queue.job_completed", { durationMs: 5 });

    expect(lines[0]).toBe(
      "2026-09-17T10:00:00.000Z INFO queue.job_completed durationMs=5",
    );
  });

  it("never throws on values that cannot be serialized", () => {
    const { logger, records } = collectingLogger();
    expect(() =>
      logger.error("import.failed", { value: { big: 1n, fn: () => 1 } }),
    ).not.toThrow();
    expect(records()[0]).toMatchObject({
      value: { big: "1", fn: "[function]" },
    });
  });
});

describe("createNullLogger", () => {
  it("discards every level and keeps returning itself", () => {
    const logger = createNullLogger();
    expect(() => logger.child({ a: 1 }).error("ignored")).not.toThrow();
  });
});
