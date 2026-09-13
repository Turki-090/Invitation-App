import {
  EventStatus,
  RsvpStatus,
  type EventStatus as EventStatusValue,
  type RsvpStatus as RsvpStatusValue,
} from "./types";

export const ReminderEligibilityReason = {
  EVENT_NOT_REMINDABLE: "EVENT_NOT_REMINDABLE",
  INVITATION_CANCELLED: "INVITATION_CANCELLED",
  RSVP_NOT_PENDING: "RSVP_NOT_PENDING",
  INITIAL_INVITATION_NOT_SENT: "INITIAL_INVITATION_NOT_SENT",
  INITIAL_DELIVERY_FAILED: "INITIAL_DELIVERY_FAILED",
  COOLDOWN_ACTIVE: "COOLDOWN_ACTIVE",
  TEMPLATE_NOT_APPROVED: "TEMPLATE_NOT_APPROVED",
  CURRENT_SNAPSHOT_REQUIRED: "CURRENT_SNAPSHOT_REQUIRED",
  AUDIENCE_MISMATCH: "AUDIENCE_MISMATCH",
  RULE_NOT_DUE: "RULE_NOT_DUE",
  RULE_LIMIT_REACHED: "RULE_LIMIT_REACHED",
} as const;

export type ReminderEligibilityReason =
  (typeof ReminderEligibilityReason)[keyof typeof ReminderEligibilityReason];

/** Stable order used by persistence, API contracts, and readiness summaries. */
export const REMINDER_EXCLUSION_REASON_CODES = [
  ReminderEligibilityReason.EVENT_NOT_REMINDABLE,
  ReminderEligibilityReason.INVITATION_CANCELLED,
  ReminderEligibilityReason.RSVP_NOT_PENDING,
  ReminderEligibilityReason.INITIAL_INVITATION_NOT_SENT,
  ReminderEligibilityReason.INITIAL_DELIVERY_FAILED,
  ReminderEligibilityReason.COOLDOWN_ACTIVE,
  ReminderEligibilityReason.TEMPLATE_NOT_APPROVED,
  ReminderEligibilityReason.CURRENT_SNAPSHOT_REQUIRED,
  ReminderEligibilityReason.AUDIENCE_MISMATCH,
  ReminderEligibilityReason.RULE_NOT_DUE,
  ReminderEligibilityReason.RULE_LIMIT_REACHED,
] as const satisfies readonly ReminderEligibilityReason[];

export const REMINDER_ELIGIBILITY_REASON_CATALOG =
  REMINDER_EXCLUSION_REASON_CODES;

export interface ReminderRuleEligibility {
  /** Absolute instant at which this rule becomes due. Equality is due. */
  readonly dueAt?: Date | null;
  /** Maximum successfully sent reminders for this invitation. */
  readonly maximumReminderCount?: number | null;
}

export interface ReminderEligibilityInput {
  readonly eventStatus: EventStatusValue;
  readonly invitationCancelled: boolean;
  readonly rsvpStatus: RsvpStatusValue;
  /** True after durable provider acceptance of the initial invitation. */
  readonly hasSuccessfulInitialSend: boolean;
  /** False for a known failed/revoked/malformed destination. */
  readonly initialDestinationReachable: boolean;
  readonly hasCurrentSnapshot: boolean;
  /** True only for a current, approved provider template. */
  readonly hasCurrentTemplate: boolean;
  /** Omit when no manual audience segment is being evaluated. */
  readonly matchesAudience?: boolean;
  readonly now: Date;
  readonly lastReminderSentAt?: Date | null;
  readonly cooldownMilliseconds: number;
  readonly sentReminderCount: number;
  /** Omit for manual eligibility; scheduled runs supply rule constraints. */
  readonly rule?: ReminderRuleEligibility | null;
}

export interface ReminderEligibilityResult {
  readonly eligible: boolean;
  /** Empty only when the invitation is eligible. */
  readonly reasonCodes: readonly ReminderEligibilityReason[];
}

/**
 * Pure reminder-selection policy. The caller supplies the clock and precomputed
 * persistence facts; this function performs no I/O and returns every applicable
 * exclusion in a stable order so readiness summaries remain explainable.
 */
export function evaluateReminderEligibility(
  input: ReminderEligibilityInput,
): ReminderEligibilityResult {
  const now = timestamp(input.now, "now");
  const lastReminderSentAt = optionalTimestamp(
    input.lastReminderSentAt,
    "lastReminderSentAt",
  );
  const dueAt = optionalTimestamp(input.rule?.dueAt, "rule.dueAt");
  assertNonNegativeSafeInteger(
    input.cooldownMilliseconds,
    "cooldownMilliseconds",
  );
  assertNonNegativeSafeInteger(input.sentReminderCount, "sentReminderCount");
  if (
    input.rule?.maximumReminderCount !== undefined &&
    input.rule.maximumReminderCount !== null
  ) {
    assertNonNegativeSafeInteger(
      input.rule.maximumReminderCount,
      "rule.maximumReminderCount",
    );
  }

  const reasonCodes: ReminderEligibilityReason[] = [];
  if (input.eventStatus !== EventStatus.RSVP_OPEN) {
    reasonCodes.push(ReminderEligibilityReason.EVENT_NOT_REMINDABLE);
  }
  if (input.invitationCancelled) {
    reasonCodes.push(ReminderEligibilityReason.INVITATION_CANCELLED);
  }
  if (input.rsvpStatus !== RsvpStatus.PENDING) {
    reasonCodes.push(ReminderEligibilityReason.RSVP_NOT_PENDING);
  }
  if (!input.initialDestinationReachable) {
    reasonCodes.push(ReminderEligibilityReason.INITIAL_DELIVERY_FAILED);
  } else if (!input.hasSuccessfulInitialSend) {
    reasonCodes.push(ReminderEligibilityReason.INITIAL_INVITATION_NOT_SENT);
  }
  if (
    lastReminderSentAt !== undefined &&
    now - lastReminderSentAt < input.cooldownMilliseconds
  ) {
    reasonCodes.push(ReminderEligibilityReason.COOLDOWN_ACTIVE);
  }
  if (!input.hasCurrentTemplate) {
    reasonCodes.push(ReminderEligibilityReason.TEMPLATE_NOT_APPROVED);
  }
  if (!input.hasCurrentSnapshot) {
    reasonCodes.push(ReminderEligibilityReason.CURRENT_SNAPSHOT_REQUIRED);
  }
  if (input.matchesAudience === false) {
    reasonCodes.push(ReminderEligibilityReason.AUDIENCE_MISMATCH);
  }
  if (dueAt !== undefined && now < dueAt) {
    reasonCodes.push(ReminderEligibilityReason.RULE_NOT_DUE);
  }
  if (
    input.rule?.maximumReminderCount !== undefined &&
    input.rule.maximumReminderCount !== null &&
    input.sentReminderCount >= input.rule.maximumReminderCount
  ) {
    reasonCodes.push(ReminderEligibilityReason.RULE_LIMIT_REACHED);
  }

  return { eligible: reasonCodes.length === 0, reasonCodes };
}

function timestamp(value: Date, field: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError(`${field} must be a valid Date.`);
  }
  return value.getTime();
}

function optionalTimestamp(
  value: Date | null | undefined,
  field: string,
): number | undefined {
  return value === undefined || value === null
    ? undefined
    : timestamp(value, field);
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}
