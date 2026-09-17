import { describe, expect, it, vi } from "vitest";
import { runWithRequestContext } from "./context";
import {
  createNoopErrorReporter,
  createSentryErrorReporter,
  parseSentryDsn,
} from "./error-reporter";
import { createNullLogger } from "./logger";
import { redactedPlaceholder } from "./redact";

const dsn = "https://publickey@o1.ingest.example.sa/42";

function envelopeEvent(body: string): Record<string, unknown> {
  const [, , payload] = body.split("\n");
  return JSON.parse(payload ?? "{}") as Record<string, unknown>;
}

describe("parseSentryDsn", () => {
  it("derives the envelope endpoint and public key", () => {
    expect(parseSentryDsn(dsn)).toEqual({
      publicKey: "publickey",
      envelopeUrl: "https://o1.ingest.example.sa/api/42/envelope/",
    });
  });

  it("rejects malformed values", () => {
    for (const value of [
      "",
      "not-a-url",
      "https://o1.ingest.example.sa/42",
      "https://publickey@o1.ingest.example.sa/",
      "ftp://publickey@o1.ingest.example.sa/42",
    ]) {
      expect(parseSentryDsn(value)).toBeUndefined();
    }
  });
});

describe("createSentryErrorReporter", () => {
  it("degrades to a disabled reporter when the DSN is unusable", () => {
    const reporter = createSentryErrorReporter({
      dsn: "not-a-dsn",
      environment: "staging",
      service: "api",
      logger: createNullLogger(),
    });
    expect(reporter.enabled).toBe(false);
    expect(() => reporter.captureException(new Error("boom"))).not.toThrow();
  });

  it("posts a redacted envelope with the Sentry auth header", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "staging",
      release: "stage10",
      service: "api",
      fetchImplementation,
      now: () => new Date("2026-09-17T10:00:00.000Z"),
    });

    reporter.captureException(new Error("send failed for +966501234567"), {
      transaction: "POST /events/:id/send-batches",
      tags: { queue: "whatsapp-send" },
      extra: { guestName: "سارة", attempt: 3 },
    });
    await reporter.flush();

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe("https://o1.ingest.example.sa/api/42/envelope/");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-sentry-envelope");
    expect(headers["X-Sentry-Auth"]).toContain("sentry_key=publickey");

    const body = String(init?.body);
    expect(body).not.toContain("+966501234567");
    expect(body).not.toContain("سارة");

    const event = envelopeEvent(body);
    expect(event).toMatchObject({
      environment: "staging",
      release: "stage10",
      transaction: "POST /events/:id/send-batches",
      level: "error",
    });
    const exception = event.exception as {
      values: { type: string; value: string }[];
    };
    expect(exception.values[0]).toMatchObject({
      type: "Error",
      value: `send failed for ${redactedPlaceholder}`,
    });
    expect((event.extra as Record<string, unknown>).guestName).toBe(
      redactedPlaceholder,
    );
    expect((event.extra as Record<string, unknown>).attempt).toBe(3);
  });

  it("carries the active correlation identifiers", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "production",
      service: "worker",
      fetchImplementation,
    });

    runWithRequestContext(
      {
        requestId: "request-1",
        correlationId: "correlation-1",
        queue: "exports",
        jobId: "job-1",
      },
      () => reporter.captureException(new Error("export failed")),
    );
    await reporter.flush();

    const event = envelopeEvent(
      String(fetchImplementation.mock.calls[0]?.[1]?.body),
    );
    expect(event.extra).toMatchObject({
      requestId: "request-1",
      correlationId: "correlation-1",
      jobId: "job-1",
    });
    expect(event.tags).toMatchObject({ queue: "exports", service: "worker" });
  });

  it("drops events above the delivery ceiling instead of queueing them", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response("", { status: 200 }));
    });
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockReturnValue(pending as unknown as Promise<Response>);
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "production",
      service: "api",
      maximumConcurrentDeliveries: 2,
      fetchImplementation,
      logger: createNullLogger(),
    });

    for (let index = 0; index < 10; index += 1) {
      reporter.captureException(new Error(`boom ${index}`));
    }
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    release?.();
    await reporter.flush();
  });

  it("applies the sample rate before any network work", () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 200 }));
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "production",
      service: "api",
      sampleRate: 0.5,
      random: () => 0.9,
      fetchImplementation,
    });

    reporter.captureException(new Error("boom"));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("swallows transport failures", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network down"));
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "production",
      service: "api",
      fetchImplementation,
      logger: createNullLogger(),
    });

    expect(() => reporter.captureException(new Error("boom"))).not.toThrow();
    await expect(reporter.flush()).resolves.toBe(true);
  });

  it("reports a flush timeout instead of blocking shutdown", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockReturnValue(new Promise<Response>(() => undefined));
    const reporter = createSentryErrorReporter({
      dsn,
      environment: "production",
      service: "api",
      fetchImplementation,
    });

    reporter.captureException(new Error("boom"));
    await expect(reporter.flush(10)).resolves.toBe(false);
  });
});

describe("createNoopErrorReporter", () => {
  it("is disabled and always flushes clean", async () => {
    const reporter = createNoopErrorReporter();
    expect(reporter.enabled).toBe(false);
    reporter.captureException(new Error("boom"));
    await expect(reporter.flush()).resolves.toBe(true);
  });
});
