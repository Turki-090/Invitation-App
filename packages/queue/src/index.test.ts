import { describe, expect, it } from "vitest";
import {
  defaultJobOptions,
  whatsappBatchJobId,
  whatsappMessageJobId,
  whatsappMessageJobs,
  whatsappWebhookJobId,
} from "./index";

describe("WhatsApp queue identifiers", () => {
  it("creates deterministic PII-free job identifiers", () => {
    expect(whatsappBatchJobId("batch-id")).toBe("batch-batch-id");
    expect(whatsappMessageJobId("message-id")).toBe("message-message-id");
    expect(whatsappWebhookJobId("event-id")).toBe("webhook-event-id");
  });

  it("builds deterministic bounded message jobs", () => {
    expect(whatsappMessageJobs(["message-a"], 5)).toEqual([
      {
        name: "send",
        data: { operation: "SEND_MESSAGE", messageId: "message-a" },
        opts: {
          jobId: "message-message-a",
          attempts: 5,
          backoff: defaultJobOptions.backoff,
        },
      },
    ]);
  });
});
