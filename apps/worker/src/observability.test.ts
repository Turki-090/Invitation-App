import { MessagingProviderError } from "@dawah/messaging";
import type { MessagingProvider } from "@dawah/messaging";
import {
  createLogger,
  createNoopErrorReporter,
  createPlatformMetrics,
  getRequestContext,
  redactedPlaceholder,
  type ErrorReporter,
} from "@dawah/observability";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkerObservability,
  instrumentMessagingProvider,
  instrumentProcessor,
  type WorkerObservability,
} from "./observability";
import { createQueueDepthSampler, type SampledQueue } from "./queue-metrics";

function harness(): WorkerObservability & {
  lines: Record<string, unknown>[];
  captured: unknown[];
} {
  const lines: Record<string, unknown>[] = [];
  const captured: unknown[] = [];
  const logger = createLogger({
    service: "worker",
    environment: "test",
    level: "debug",
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  const errorReporter: ErrorReporter = {
    ...createNoopErrorReporter(),
    enabled: true,
    captureException: (error) => captured.push(error),
  };
  return {
    logger,
    metrics: createPlatformMetrics(),
    errorReporter,
    lines,
    captured,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    name: "send",
    data: {},
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  };
}

describe("createWorkerObservability", () => {
  it("disables error reporting when no DSN is configured", () => {
    const observability = createWorkerObservability({
      DAWAH_ENV: "local",
      LOG_FORMAT: "pretty",
      LOG_LEVEL: "info",
      RELEASE_VERSION: undefined,
      SENTRY_DSN: undefined,
      SENTRY_SAMPLE_RATE: 1,
    });
    expect(observability.errorReporter.enabled).toBe(false);
    expect(observability.metrics.registry.render()).toContain(
      'dawah_build_info{service="worker"',
    );
  });
});

describe("instrumentProcessor", () => {
  it("adopts the correlation identifier the API stamped on the job", async () => {
    const context = harness();
    let observed: ReturnType<typeof getRequestContext>;
    await instrumentProcessor({
      queue: "whatsapp-send",
      observability: context,
      processor: async () => {
        observed = getRequestContext();
        return "ok";
      },
    })(
      job({
        data: { correlationId: "correlation-1", eventId: "event-1" },
      }),
    );

    expect(observed).toMatchObject({
      correlationId: "correlation-1",
      eventId: "event-1",
      queue: "whatsapp-send",
      jobId: "job-1",
    });
    expect(observed?.requestId).not.toBe("correlation-1");
  });

  it("falls back to a fresh correlation identifier for worker-originated jobs", async () => {
    const context = harness();
    let observed: ReturnType<typeof getRequestContext>;
    await instrumentProcessor({
      queue: "reminders",
      observability: context,
      processor: async () => {
        observed = getRequestContext();
        return "ok";
      },
    })(job({ data: { operation: "SWEEP" } }));

    expect(observed?.correlationId).toBe(observed?.requestId);
  });

  it("records a completed job and returns the processor result unchanged", async () => {
    const context = harness();
    const result = await instrumentProcessor({
      queue: "exports",
      observability: context,
      processor: async () => ({ rows: 42 }),
    })(job({ name: "generate" }));

    expect(result).toEqual({ rows: 42 });
    const rendered = context.metrics.registry.render();
    expect(rendered).toContain(
      'dawah_queue_jobs_total{queue="exports",job="generate",outcome="succeeded"} 1',
    );
    expect(rendered).toContain(
      'dawah_queue_job_duration_seconds_count{queue="exports",job="generate"} 1',
    );
    expect(
      context.lines.some((line) => line.event === "queue.job_completed"),
    ).toBe(true);
  });

  it("counts a retryable failure without reporting it as an incident", async () => {
    const context = harness();
    await expect(
      instrumentProcessor({
        queue: "whatsapp-send",
        observability: context,
        processor: async () => {
          throw new Error("provider timeout");
        },
      })(job({ attemptsMade: 0, opts: { attempts: 3 } })),
    ).rejects.toThrow("provider timeout");

    expect(context.metrics.registry.render()).toContain('outcome="retried"');
    expect(context.captured).toHaveLength(0);
    expect(
      context.lines.find((line) => line.event === "queue.job_failed")?.level,
    ).toBe("warn");
  });

  it("reports a job that has run out of attempts", async () => {
    const context = harness();
    await expect(
      instrumentProcessor({
        queue: "whatsapp-send",
        observability: context,
        processor: async () => {
          throw new Error("send failed for +966501234567");
        },
      })(job({ attemptsMade: 2, opts: { attempts: 3 } })),
    ).rejects.toThrow();

    expect(context.metrics.registry.render()).toContain('outcome="exhausted"');
    expect(context.captured).toHaveLength(1);

    const logged = context.lines.find(
      (line) => line.event === "queue.job_exhausted",
    );
    expect(logged?.level).toBe("error");
    expect(JSON.stringify(logged)).not.toContain("+966501234567");
    expect(JSON.stringify(logged)).toContain(redactedPlaceholder);
  });

  it("ignores an inbound correlation identifier that is not a safe token", async () => {
    const context = harness();
    let observed: ReturnType<typeof getRequestContext>;
    await instrumentProcessor({
      queue: "imports",
      observability: context,
      processor: async () => {
        observed = getRequestContext();
        return "ok";
      },
    })(job({ data: { correlationId: "injected\nline" } }));

    expect(observed?.correlationId).not.toContain("\n");
  });
});

describe("instrumentMessagingProvider", () => {
  function provider(
    send: () => Promise<{
      provider: "META_WHATSAPP";
      providerMessageId: string;
      acceptedAt: Date;
    }>,
  ): MessagingProvider {
    return {
      sendInvitation: send,
      sendReminder: send,
      sendConfirmation: send,
    };
  }

  const accepted = {
    provider: "META_WHATSAPP" as const,
    providerMessageId: "wamid.1",
    acceptedAt: new Date("2026-09-17T10:00:00.000Z"),
  };

  const input = {
    logicalMessageId: "message-1",
    to: "+966501234567",
    templateName: "dawah_invitation_ar",
    languageCode: "ar",
    bodyParameters: [],
  };

  it("counts an accepted send and passes the result through", async () => {
    const metrics = createPlatformMetrics();
    const instrumented = instrumentMessagingProvider(
      provider(async () => accepted),
      metrics,
    );

    await expect(instrumented.sendInvitation(input)).resolves.toEqual(accepted);
    expect(metrics.registry.render()).toContain(
      'dawah_provider_requests_total{provider="META_WHATSAPP",operation="send_invitation",outcome="succeeded"} 1',
    );
  });

  it("labels provider failures by class and rate limiting", async () => {
    const metrics = createPlatformMetrics();
    const permanent = instrumentMessagingProvider(
      provider(async () => {
        throw new MessagingProviderError("131047", {
          failureClass: "PERMANENT",
          retryable: false,
        });
      }),
      metrics,
    );
    const throttled = instrumentMessagingProvider(
      provider(async () => {
        throw new MessagingProviderError(
          "80007",
          {
            failureClass: "TRANSIENT",
            retryable: true,
            retryAfterMilliseconds: 1_000,
          },
          429,
        );
      }),
      metrics,
    );

    await expect(permanent.sendReminder(input)).rejects.toThrow();
    await expect(throttled.sendConfirmation(input)).rejects.toThrow();

    const rendered = metrics.registry.render();
    expect(rendered).toContain(
      'operation="send_reminder",outcome="failed_permanent"',
    );
    expect(rendered).toContain(
      'operation="send_confirmation",outcome="rate_limited"',
    );
  });

  it("never lets a recipient number reach a metric label", async () => {
    const metrics = createPlatformMetrics();
    await instrumentMessagingProvider(
      provider(async () => accepted),
      metrics,
    ).sendInvitation(input);
    expect(metrics.registry.render()).not.toContain("+966501234567");
  });
});

describe("createQueueDepthSampler", () => {
  function queue(
    name: string,
    counts: Record<string, number>,
    oldest?: { timestamp?: number },
  ): SampledQueue {
    return {
      name,
      getJobCounts: vi.fn(async () => counts),
      getJobs: vi.fn(async () => (oldest ? [oldest] : [])),
    };
  }

  it("records depth per state and the age of the oldest waiting job", async () => {
    const context = harness();
    await createQueueDepthSampler({
      logger: context.logger,
      metrics: context.metrics,
      now: () => 1_000_000,
      queues: [
        queue(
          "whatsapp-send",
          { waiting: 5, active: 2, delayed: 1, failed: 0 },
          { timestamp: 940_000 },
        ),
      ],
    }).sample();

    const rendered = context.metrics.registry.render();
    expect(rendered).toContain(
      'dawah_queue_depth{queue="whatsapp-send",state="waiting"} 5',
    );
    expect(rendered).toContain(
      'dawah_queue_depth{queue="whatsapp-send",state="failed"} 0',
    );
    expect(rendered).toContain(
      'dawah_queue_oldest_waiting_job_age_seconds{queue="whatsapp-send"} 60',
    );
  });

  it("reports a zero backlog age for an empty queue", async () => {
    const context = harness();
    await createQueueDepthSampler({
      logger: context.logger,
      metrics: context.metrics,
      queues: [
        queue("exports", { waiting: 0, active: 0, delayed: 0, failed: 0 }),
      ],
    }).sample();

    expect(context.metrics.registry.render()).toContain(
      'dawah_queue_oldest_waiting_job_age_seconds{queue="exports"} 0',
    );
  });

  it("keeps serving the remaining metrics when one queue cannot be read", async () => {
    const context = harness();
    const failing: SampledQueue = {
      name: "reminders",
      getJobCounts: async () => {
        throw new Error("redis unavailable");
      },
      getJobs: async () => [],
    };

    await expect(
      createQueueDepthSampler({
        logger: context.logger,
        metrics: context.metrics,
        queues: [
          failing,
          queue("imports", { waiting: 3, active: 0, delayed: 0, failed: 0 }),
        ],
      }).sample(),
    ).resolves.toBeUndefined();

    expect(context.metrics.registry.render()).toContain(
      'dawah_queue_depth{queue="imports",state="waiting"} 3',
    );
    expect(
      context.lines.some(
        (line) => line.event === "metrics.queue_sample_failed",
      ),
    ).toBe(true);
  });
});
