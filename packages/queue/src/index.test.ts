import { describe, expect, it } from "vitest";
import {
  defaultJobOptions,
  reminderRunJobId,
  reminderRunJobs,
  reminderSweepJobData,
  reminderSweepSchedulerId,
  whatsappBatchJobId,
  whatsappMessageJobId,
  whatsappMessageJobs,
  whatsappRsvpConfirmationJobId,
  whatsappRsvpConfirmationJobs,
  whatsappWebhookJobId,
} from "./index";

describe("reminder queue identifiers", () => {
  it("creates stable PII-free sweep and rule-run definitions", () => {
    expect(reminderSweepSchedulerId).toBe("automatic-reminder-sweep");
    expect(reminderSweepJobData()).toEqual({ operation: "SWEEP" });
    expect(reminderRunJobId("rule-id", "a".repeat(64))).toBe(
      `reminder-run-rule-id-${"a".repeat(64)}`,
    );
  });

  it("builds deterministic bounded rule jobs", () => {
    const run = {
      eventId: "event-id",
      ruleId: "rule-id",
      scheduleKey: "b".repeat(64),
      scheduledFor: "2026-09-12T12:00:00.000Z",
    };
    expect(reminderRunJobs([run])).toEqual([
      {
        name: "run",
        data: { operation: "RUN", ...run },
        opts: {
          jobId: `reminder-run-rule-id-${"b".repeat(64)}`,
          ...defaultJobOptions,
        },
      },
    ]);
  });
});

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
