import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import {
  createLogger,
  createNoopErrorReporter,
  redactedPlaceholder,
  runWithRequestContext,
  type ErrorReporter,
} from "@dawah/observability";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ApiExceptionFilter } from "./api-exception.filter";

function harness() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "api",
    environment: "test",
    level: "debug",
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  const captured: { error: unknown; transaction?: string }[] = [];
  const reporter: ErrorReporter = {
    ...createNoopErrorReporter(),
    enabled: true,
    captureException: (error, context) =>
      captured.push({ error, transaction: context?.transaction }),
  };

  const json = vi.fn();
  const response = { status: vi.fn(() => ({ json })) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response as unknown as Response,
      getRequest: () => ({ method: "POST" }) as Request,
    }),
  } as unknown as ArgumentsHost;

  return {
    lines,
    captured,
    json,
    response,
    filter: new ApiExceptionFilter(logger, reporter),
    host,
  };
}

describe("ApiExceptionFilter", () => {
  it("passes an expected HTTP failure through without reporting it", () => {
    const context = harness();
    context.filter.catch(
      new ForbiddenException({
        code: "EVENT_ACCESS_DENIED",
        message: "You do not have access to this event.",
      }),
      context.host,
    );

    expect(context.response.status).toHaveBeenCalledWith(403);
    expect(context.json).toHaveBeenCalledWith({
      error: {
        code: "EVENT_ACCESS_DENIED",
        message: "You do not have access to this event.",
      },
    });
    expect(context.captured).toHaveLength(0);
    expect(context.lines).toHaveLength(0);
  });

  it("returns a generic 500 body while logging and reporting the cause", () => {
    const context = harness();
    runWithRequestContext(
      {
        requestId: "request-1",
        correlationId: "correlation-1",
        route: "/api/v1/events/:id/send-batches",
      },
      () =>
        context.filter.catch(
          new Error("Prisma failed for +966501234567"),
          context.host,
        ),
    );

    expect(context.response.status).toHaveBeenCalledWith(500);
    expect(context.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId: "request-1",
      },
    });

    // The stack stays server-side, and the personal data inside it does not
    // survive redaction on its way to the log or the error reporter.
    const logged = context.lines[0];
    expect(logged).toMatchObject({
      event: "http.unhandled_exception",
      requestId: "request-1",
    });
    expect(JSON.stringify(logged)).not.toContain("+966501234567");
    expect(JSON.stringify(logged)).toContain(redactedPlaceholder);

    expect(context.captured).toHaveLength(1);
    expect(context.captured[0]?.transaction).toBe(
      "POST /api/v1/events/:id/send-batches",
    );
  });

  it("keeps validation details and adds the correlation identifier", () => {
    const context = harness();
    runWithRequestContext(
      { requestId: "request-2", correlationId: "correlation-2" },
      () =>
        context.filter.catch(
          new BadRequestException({
            code: "VALIDATION_FAILED",
            message: "The request payload is invalid.",
            details: { fields: ["eventDate"] },
          }),
          context.host,
        ),
    );

    expect(context.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_FAILED",
        message: "The request payload is invalid.",
        details: { fields: ["eventDate"] },
        requestId: "request-2",
      },
    });
  });

  it("omits the correlation identifier outside a request scope", () => {
    const context = harness();
    context.filter.catch(new ForbiddenException("denied"), context.host);
    expect(context.json.mock.calls[0]?.[0]).not.toHaveProperty(
      "error.requestId",
    );
  });
});
