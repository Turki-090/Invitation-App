import { describe, expect, it } from "vitest";
import {
  defaultJobOptions,
  whatsappBatchJobId,
  whatsappMessageJobId,
  whatsappMessageJobs,
  whatsappRsvpConfirmationJobId,
  whatsappRsvpConfirmationJobs,
  whatsappWebhookJobId,
} from "./index";

describe("WhatsApp queue identifiers", () => {
  it("creates deterministic PII-free job identifiers", () => {
    expect(whatsappBatchJobId("batch-id")).toBe("batch-batch-id");
    expect(whatsappMessageJobId("message-id")).toBe("message-message-id");
    expect(whatsappWebhookJobId("event-id")).toBe("webhook-event-id");
    expect(whatsappRsvpConfirmationJobId("confirmation-id")).toBe(
      "rsvp-confirmation-confirmation-id",
    );
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

  it("builds deterministic bounded RSVP confirmation jobs", () => {
    expect(whatsappRsvpConfirmationJobs(["confirmation-a"], 4)).toEqual([
      {
        name: "send-rsvp-confirmation",
        data: {
          operation: "SEND_RSVP_CONFIRMATION",
          confirmationId: "confirmation-a",
        },
        opts: {
          jobId: "rsvp-confirmation-confirmation-a",
          attempts: 4,
          backoff: defaultJobOptions.backoff,
        },
      },
    ]);
  });
});
