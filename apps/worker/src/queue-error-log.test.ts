import { describe, expect, it, vi } from "vitest";
import { createQueueErrorLogger } from "./queue-error-log";

describe("queue error logging", () => {
  it("logs the first error, then one line per interval with a repeat count", () => {
    let clock = 0;
    const logger = { error: vi.fn() };
    const report = createQueueErrorLogger({
      logger,
      queue: "whatsapp-send",
      intervalMilliseconds: 60_000,
      now: () => clock,
    });
    const error = new Error("ERR max requests limit exceeded");

    report(error);
    for (clock = 100; clock < 60_000; clock += 100) report(error);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenLastCalledWith("queue.connection_error", {
      queue: "whatsapp-send",
      error,
      suppressedSinceLastLog: 0,
    });

    clock = 60_000;
    report(error);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenLastCalledWith("queue.connection_error", {
      queue: "whatsapp-send",
      error,
      suppressedSinceLastLog: 599,
    });
  });
});
