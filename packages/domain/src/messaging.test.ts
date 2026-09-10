import { describe, expect, it } from "vitest";
import {
  classifyMessagingRetry,
  reduceMessageDeliveryStatus,
} from "./messaging";

describe("reduceMessageDeliveryStatus", () => {
  it("keeps positive delivery evidence monotonic when events arrive out of order", () => {
    expect(reduceMessageDeliveryStatus("READ", "DELIVERED")).toBe("READ");
    expect(reduceMessageDeliveryStatus("SENT", "READ")).toBe("READ");
    expect(reduceMessageDeliveryStatus("DELIVERED", "FAILED")).toBe(
      "DELIVERED",
    );
  });

  it("lets a definitive provider failure replace HTTP acceptance", () => {
    expect(reduceMessageDeliveryStatus("SENT", "FAILED")).toBe("FAILED");
  });

  it("allows late positive evidence to recover a failed message", () => {
    expect(reduceMessageDeliveryStatus("FAILED", "SENT")).toBe("FAILED");
    expect(reduceMessageDeliveryStatus("FAILED", "DELIVERED")).toBe(
      "DELIVERED",
    );
  });

  it("keeps an explicit cancellation terminal", () => {
    expect(reduceMessageDeliveryStatus("CANCELLED", "READ")).toBe("CANCELLED");
  });
});

describe("classifyMessagingRetry", () => {
  it("retries rate limits and bounded provider failures", () => {
    expect(
      classifyMessagingRetry({
        httpStatus: 429,
        retryAfterMilliseconds: 30_000,
      }),
    ).toEqual({
      failureClass: "TRANSIENT",
      retryable: true,
      retryAfterMilliseconds: 30_000,
    });
    expect(classifyMessagingRetry({ providerCode: "131048" })).toMatchObject({
      failureClass: "TRANSIENT",
      retryable: true,
    });
    expect(
      classifyMessagingRetry({ providerCodes: ["4", "999001"] }),
    ).toMatchObject({ failureClass: "TRANSIENT", retryable: true });
  });

  it("does not blindly retry an ambiguous network outcome", () => {
    expect(classifyMessagingRetry({ timedOut: true })).toEqual({
      failureClass: "AMBIGUOUS",
      retryable: false,
    });
    expect(classifyMessagingRetry({ httpStatus: 503 })).toEqual({
      failureClass: "AMBIGUOUS",
      retryable: false,
    });
    expect(classifyMessagingRetry({ httpStatus: 408 })).toEqual({
      failureClass: "AMBIGUOUS",
      retryable: false,
    });
  });

  it("treats an invalid request as permanent", () => {
    expect(
      classifyMessagingRetry({ httpStatus: 400, providerCode: "132000" }),
    ).toEqual({ failureClass: "PERMANENT", retryable: false });
  });
});
