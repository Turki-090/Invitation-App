import { describe, expect, it } from "vitest";
import {
  createRequestId,
  enrichRequestContext,
  getRequestContext,
  runWithRequestContext,
  sanitizeCorrelationId,
} from "./context";
import { normalizeRouteTemplate } from "./route";

describe("request context", () => {
  it("is empty outside a request scope", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("survives asynchronous continuations", async () => {
    await runWithRequestContext(
      { requestId: "request-1", correlationId: "correlation-1" },
      async () => {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 1));
        expect(getRequestContext()?.requestId).toBe("request-1");
      },
    );
    expect(getRequestContext()).toBeUndefined();
  });

  it("adds late-resolved identity without losing the correlation trail", () => {
    runWithRequestContext(
      { requestId: "request-1", correlationId: "correlation-1" },
      () => {
        enrichRequestContext({ actorId: "user-1", eventId: "event-1" });
        expect(getRequestContext()).toMatchObject({
          requestId: "request-1",
          correlationId: "correlation-1",
          actorId: "user-1",
          eventId: "event-1",
        });
      },
    );
  });

  it("ignores enrichment outside a request scope", () => {
    expect(() => enrichRequestContext({ actorId: "user-1" })).not.toThrow();
  });

  it("issues distinct request identifiers", () => {
    expect(createRequestId()).not.toBe(createRequestId());
  });
});

describe("sanitizeCorrelationId", () => {
  it("accepts bounded opaque identifiers", () => {
    expect(sanitizeCorrelationId(" trace-abc.123:4 ")).toBe("trace-abc.123:4");
  });

  it("rejects injection, oversized, and non-string values", () => {
    for (const value of [
      "",
      "  ",
      "bad value",
      "line\nbreak",
      "a".repeat(129),
      42,
      undefined,
      null,
    ]) {
      expect(sanitizeCorrelationId(value)).toBeUndefined();
    }
  });
});

describe("normalizeRouteTemplate", () => {
  it("replaces entity identifiers", () => {
    expect(
      normalizeRouteTemplate(
        "/api/v1/events/550e8400-e29b-41d4-a716-446655440000/invitations/550e8400-e29b-41d4-a716-446655440001",
      ),
    ).toBe("/api/v1/events/:id/invitations/:id");
  });

  it("replaces opaque capabilities and signed keys", () => {
    expect(normalizeRouteTemplate(`/api/v1/i/${"a".repeat(43)}`)).toBe(
      "/api/v1/i/:token",
    );
  });

  it("drops the query string", () => {
    expect(normalizeRouteTemplate("/api/v1/events?page=2&search=ahmed")).toBe(
      "/api/v1/events",
    );
  });

  it("bounds depth", () => {
    expect(normalizeRouteTemplate("/a/b/c/d/e/f/g/h/i/j")).toBe(
      "/a/b/c/d/e/f/g/h/*",
    );
  });

  it("normalizes the root and numeric segments", () => {
    expect(normalizeRouteTemplate("")).toBe("/");
    expect(normalizeRouteTemplate("/")).toBe("/");
    expect(normalizeRouteTemplate("/api/v1/pages/12")).toBe(
      "/api/v1/pages/:number",
    );
  });
});
