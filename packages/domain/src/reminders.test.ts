import { describe, expect, it } from "vitest";
import {
  evaluateReminderEligibility,
  REMINDER_ELIGIBILITY_REASON_CATALOG,
  ReminderEligibilityReason,
  type ReminderEligibilityInput,
} from "./reminders";
import { EventStatus, RsvpStatus } from "./types";

const now = new Date("2026-09-12T12:00:00.000Z");
const hour = 60 * 60 * 1_000;

const eligibleInput: ReminderEligibilityInput = {
  eventStatus: EventStatus.RSVP_OPEN,
  invitationCancelled: false,
  rsvpStatus: RsvpStatus.PENDING,
  hasSuccessfulInitialSend: true,
  initialDestinationReachable: true,
  hasCurrentSnapshot: true,
  hasCurrentTemplate: true,
  now,
  lastReminderSentAt: null,
  cooldownMilliseconds: 24 * hour,
  sentReminderCount: 0,
};

describe("evaluateReminderEligibility", () => {
  it("marks a pending, reachable, prepared invitation as eligible", () => {
    expect(evaluateReminderEligibility(eligibleInput)).toEqual({
      eligible: true,
      reasonCodes: [],
    });
  });

  it.each([
    EventStatus.DRAFT,
    EventStatus.ACTIVE,
    EventStatus.RSVP_CLOSED,
    EventStatus.EVENT_DAY,
    EventStatus.COMPLETED,
    EventStatus.ARCHIVED,
  ])("rejects the non-remindable event state %s", (eventStatus) => {
    expect(
      evaluateReminderEligibility({ ...eligibleInput, eventStatus }),
    ).toEqual({
      eligible: false,
      reasonCodes: [ReminderEligibilityReason.EVENT_NOT_REMINDABLE],
    });
  });

  it("rejects cancelled invitations", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        invitationCancelled: true,
      }),
    ).toMatchObject({
      eligible: false,
      reasonCodes: [ReminderEligibilityReason.INVITATION_CANCELLED],
    });
  });

  it.each([
    RsvpStatus.ACCEPTED,
    RsvpStatus.PARTIALLY_ACCEPTED,
    RsvpStatus.DECLINED,
  ])("rejects the non-pending RSVP state %s", (rsvpStatus) => {
    expect(
      evaluateReminderEligibility({ ...eligibleInput, rsvpStatus }),
    ).toMatchObject({
      eligible: false,
      reasonCodes: [ReminderEligibilityReason.RSVP_NOT_PENDING],
    });
  });

  it("distinguishes no successful send from a known unreachable destination", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        hasSuccessfulInitialSend: false,
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.INITIAL_INVITATION_NOT_SENT]);
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        hasSuccessfulInitialSend: false,
        initialDestinationReachable: false,
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.INITIAL_DELIVERY_FAILED]);
  });

  it("blocks immediately before cooldown expiry and allows the exact boundary", () => {
    const cooldownMilliseconds = 24 * hour;
    const boundary = new Date(now.getTime() - cooldownMilliseconds);

    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        cooldownMilliseconds,
        lastReminderSentAt: new Date(boundary.getTime() + 1),
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.COOLDOWN_ACTIVE]);
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        cooldownMilliseconds,
        lastReminderSentAt: boundary,
      }),
    ).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("does not invent a cooldown when it is zero", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        cooldownMilliseconds: 0,
        lastReminderSentAt: now,
      }),
    ).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("rejects missing current snapshot and template independently", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        hasCurrentSnapshot: false,
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.CURRENT_SNAPSHOT_REQUIRED]);
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        hasCurrentTemplate: false,
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.TEMPLATE_NOT_APPROVED]);
  });

  it("applies an optional manual audience condition", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        matchesAudience: false,
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.AUDIENCE_MISMATCH]);
  });

  it("makes a scheduled rule due at the exact due instant", () => {
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        rule: { dueAt: new Date(now.getTime() + 1) },
      }).reasonCodes,
    ).toEqual([ReminderEligibilityReason.RULE_NOT_DUE]);
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        rule: { dueAt: now },
      }),
    ).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("blocks when the sent count reaches or exceeds the optional maximum", () => {
    for (const sentReminderCount of [2, 3]) {
      expect(
        evaluateReminderEligibility({
          ...eligibleInput,
          sentReminderCount,
          rule: { maximumReminderCount: 2 },
        }).reasonCodes,
      ).toEqual([ReminderEligibilityReason.RULE_LIMIT_REACHED]);
    }
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        sentReminderCount: 1,
        rule: { maximumReminderCount: 2 },
      }),
    ).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("allows manual checks and unconstrained rules to omit optional conditions", () => {
    expect(evaluateReminderEligibility(eligibleInput).eligible).toBe(true);
    expect(
      evaluateReminderEligibility({
        ...eligibleInput,
        rule: { dueAt: null, maximumReminderCount: null },
      }).eligible,
    ).toBe(true);
  });

  it("returns every exclusion in stable catalog order", () => {
    const result = evaluateReminderEligibility({
      ...eligibleInput,
      eventStatus: EventStatus.COMPLETED,
      invitationCancelled: true,
      rsvpStatus: RsvpStatus.ACCEPTED,
      hasSuccessfulInitialSend: false,
      initialDestinationReachable: false,
      lastReminderSentAt: new Date(now.getTime() - hour),
      hasCurrentSnapshot: false,
      hasCurrentTemplate: false,
      sentReminderCount: 2,
      rule: {
        dueAt: new Date(now.getTime() + 1),
        maximumReminderCount: 2,
      },
    });

    expect(result).toEqual({
      eligible: false,
      reasonCodes: REMINDER_ELIGIBILITY_REASON_CATALOG.filter((reason) =>
        [
          ReminderEligibilityReason.EVENT_NOT_REMINDABLE,
          ReminderEligibilityReason.INVITATION_CANCELLED,
          ReminderEligibilityReason.RSVP_NOT_PENDING,
          ReminderEligibilityReason.INITIAL_DELIVERY_FAILED,
          ReminderEligibilityReason.COOLDOWN_ACTIVE,
          ReminderEligibilityReason.TEMPLATE_NOT_APPROVED,
          ReminderEligibilityReason.CURRENT_SNAPSHOT_REQUIRED,
          ReminderEligibilityReason.RULE_NOT_DUE,
          ReminderEligibilityReason.RULE_LIMIT_REACHED,
        ].includes(reason),
      ),
    });
  });

  it("fails closed on invalid clocks, cooldowns, and counts", () => {
    expect(() =>
      evaluateReminderEligibility({
        ...eligibleInput,
        now: new Date("invalid"),
      }),
    ).toThrow(RangeError);
    expect(() =>
      evaluateReminderEligibility({
        ...eligibleInput,
        cooldownMilliseconds: -1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      evaluateReminderEligibility({
        ...eligibleInput,
        sentReminderCount: 0.5,
      }),
    ).toThrow(RangeError);
    expect(() =>
      evaluateReminderEligibility({
        ...eligibleInput,
        rule: { maximumReminderCount: -1 },
      }),
    ).toThrow(RangeError);
  });
});
