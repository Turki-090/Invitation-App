import { describe, expect, it } from "vitest";
import {
  reminderEvaluationSlot,
  reminderRuleDueAt,
} from "./prisma-reminder-repository";

describe("Prisma automatic reminder repository timing", () => {
  it("uses accepted sentAt plus the configured offset for after-initial rules", () => {
    expect(
      reminderRuleDueAt({
        triggerKind: "AFTER_INITIAL_INVITATION",
        offsetMinutes: 2 * 24 * 60,
        eventTimezone: "Asia/Riyadh",
        rsvpDeadline: null,
        initialInvitationSentAt: new Date("2026-09-10T08:15:00.000Z"),
      }),
    ).toEqual(new Date("2026-09-12T08:15:00.000Z"));
  });

  it("uses the event-local calendar day for deadline rules", () => {
    expect(
      reminderRuleDueAt({
        triggerKind: "BEFORE_RSVP_DEADLINE",
        offsetMinutes: 2 * 24 * 60,
        eventTimezone: "Asia/Riyadh",
        rsvpDeadline: new Date("2026-09-15T00:00:00.000Z"),
        initialInvitationSentAt: null,
      }),
    ).toEqual(new Date("2026-09-12T21:00:00.000Z"));
    expect(
      reminderRuleDueAt({
        triggerKind: "BEFORE_RSVP_DEADLINE",
        offsetMinutes: 2 * 24 * 60,
        eventTimezone: "America/New_York",
        rsvpDeadline: new Date("2026-09-15T00:00:00.000Z"),
        initialInvitationSentAt: null,
      }),
    ).toEqual(new Date("2026-09-13T04:00:00.000Z"));
  });

  it("returns no due instant when the rule lacks its trigger anchor", () => {
    expect(
      reminderRuleDueAt({
        triggerKind: "AFTER_INITIAL_INVITATION",
        offsetMinutes: 1,
        eventTimezone: "UTC",
        rsvpDeadline: null,
        initialInvitationSentAt: null,
      }),
    ).toBeNull();
    expect(
      reminderRuleDueAt({
        triggerKind: "BEFORE_RSVP_DEADLINE",
        offsetMinutes: 1,
        eventTimezone: "UTC",
        rsvpDeadline: null,
        initialInvitationSentAt: null,
      }),
    ).toBeNull();
  });

  it("buckets scheduler replays into deterministic hourly slots", () => {
    expect(
      reminderEvaluationSlot(new Date("2026-09-12T12:59:59.999Z")),
    ).toEqual(new Date("2026-09-12T12:00:00.000Z"));
  });
});
