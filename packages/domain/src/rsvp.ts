import {
  calculateRsvp,
  InvitationInvariantError,
  validateInvitationAggregate,
  type RsvpCalculation,
} from "./invitation";
import {
  EventStatus,
  InvitationType,
  type EventStatus as EventStatusValue,
  type InvitationType as InvitationTypeValue,
} from "./types";

export interface RsvpSelectionMember {
  readonly id: string;
  readonly isPrimary: boolean;
}

export interface RsvpSelectionInput {
  readonly invitationType: InvitationTypeValue;
  readonly members: readonly RsvpSelectionMember[];
  readonly maxCompanions: number;
  readonly attendingMemberIds: readonly string[];
  readonly companionCount: number;
}

export interface ResolvedRsvpSelection extends RsvpCalculation {
  /** Selected IDs in invitation-member order, independent of request order. */
  readonly attendingMemberIds: readonly string[];
  readonly attendingMemberCount: number;
  readonly companionCount: number;
}

/**
 * Resolves an untrusted attendance selection against the invitation aggregate.
 * Member IDs are opaque here; transport-specific UUID validation belongs at
 * the API boundary.
 */
export function resolveRsvpSelection(
  input: RsvpSelectionInput,
): ResolvedRsvpSelection {
  validateInvitationAggregate({
    invitationType: input.invitationType,
    members: input.members,
    maxCompanions: input.maxCompanions,
  });

  const invitationMemberIds = new Set<string>();
  for (const member of input.members) {
    assertMemberId(member.id, "RSVP_INVITATION_MEMBER_ID_INVALID");
    if (invitationMemberIds.has(member.id)) {
      throw new InvitationInvariantError(
        "RSVP_INVITATION_MEMBER_IDS_DUPLICATE",
        "Invitation member IDs must be unique.",
      );
    }
    invitationMemberIds.add(member.id);
  }

  const selectedMemberIds = new Set<string>();
  for (const memberId of input.attendingMemberIds) {
    assertMemberId(memberId, "RSVP_SELECTED_MEMBER_ID_INVALID");
    if (selectedMemberIds.has(memberId)) {
      throw new InvitationInvariantError(
        "RSVP_SELECTED_MEMBER_IDS_DUPLICATE",
        "An attending member can be selected only once.",
      );
    }
    if (!invitationMemberIds.has(memberId)) {
      throw new InvitationInvariantError(
        "RSVP_MEMBER_NOT_INVITED",
        "Every attending member must belong to this invitation.",
      );
    }
    selectedMemberIds.add(memberId);
  }

  const attendingMemberIds = input.members
    .filter((member) => selectedMemberIds.has(member.id))
    .map((member) => member.id);
  const calculation = calculateRsvp({
    invitationType: input.invitationType,
    memberCount: input.members.length,
    primaryMemberCount: input.members.filter((member) => member.isPrimary)
      .length,
    maxCompanions: input.maxCompanions,
    attendingMemberCount: attendingMemberIds.length,
    companionCount: input.companionCount,
  });

  return {
    attendingMemberIds,
    attendingMemberCount: attendingMemberIds.length,
    companionCount: input.companionCount,
    ...calculation,
  };
}

export const RsvpReplyActionMappingKind = {
  RSVP_SELECTION: "RSVP_SELECTION",
  MEMBER_SELECTION_REQUIRED: "MEMBER_SELECTION_REQUIRED",
} as const;

export type RsvpReplyActionMappingKind =
  (typeof RsvpReplyActionMappingKind)[keyof typeof RsvpReplyActionMappingKind];

export interface InvitationReplyActionMappingInput {
  readonly invitationType: InvitationTypeValue;
  readonly members: readonly RsvpSelectionMember[];
  readonly maxCompanions: number;
  readonly actionId: string;
}

export interface DirectRsvpReplyActionMapping extends ResolvedRsvpSelection {
  readonly kind: typeof RsvpReplyActionMappingKind.RSVP_SELECTION;
  readonly actionId: string;
}

export interface MemberSelectionRequiredReplyActionMapping {
  readonly kind: typeof RsvpReplyActionMappingKind.MEMBER_SELECTION_REQUIRED;
  readonly actionId: "SELECT_MEMBERS";
}

export type InvitationReplyActionMapping =
  DirectRsvpReplyActionMapping | MemberSelectionRequiredReplyActionMapping;

/**
 * Maps the stable action IDs captured in invitation content snapshots to a
 * validated RSVP selection. SELECT_MEMBERS deliberately does not guess a
 * family selection and tells the caller to continue in the guest web flow.
 */
export function mapInvitationReplyAction(
  input: InvitationReplyActionMappingInput,
): InvitationReplyActionMapping {
  if (input.invitationType === InvitationType.SINGLE) {
    if (input.actionId === "ATTEND") {
      return directReplySelection(
        input,
        input.members.map(({ id }) => id),
        0,
      );
    }
    if (input.actionId === "DECLINE") {
      return directReplySelection(input, [], 0);
    }
    throwUnsupportedReplyAction(input.actionId, input.invitationType);
  }

  if (input.invitationType === InvitationType.NAMED_GROUP) {
    if (input.actionId === "ATTEND_ALL") {
      return directReplySelection(
        input,
        input.members.map(({ id }) => id),
        0,
      );
    }
    if (input.actionId === "DECLINE_ALL") {
      return directReplySelection(input, [], 0);
    }
    if (input.actionId === "SELECT_MEMBERS") {
      validateReplyInvitation(input);
      return {
        kind: RsvpReplyActionMappingKind.MEMBER_SELECTION_REQUIRED,
        actionId: "SELECT_MEMBERS",
      };
    }
    throwUnsupportedReplyAction(input.actionId, input.invitationType);
  }

  if (input.actionId === "DECLINE") {
    return directReplySelection(input, [], 0);
  }

  const match = /^ATTEND_WITH_(0|[1-9]\d*)_COMPANIONS$/.exec(input.actionId);
  if (match) {
    const companionCount = Number(match[1]);
    if (Number.isSafeInteger(companionCount)) {
      return directReplySelection(
        input,
        input.members.map(({ id }) => id),
        companionCount,
      );
    }
  }

  throwUnsupportedReplyAction(input.actionId, input.invitationType);
}

export const GuestRsvpLifecycleState = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  COMPLETED: "COMPLETED",
} as const;

export type GuestRsvpLifecycleState =
  (typeof GuestRsvpLifecycleState)[keyof typeof GuestRsvpLifecycleState];

export const GuestRsvpPolicyReason = {
  INITIAL_RESPONSE_AVAILABLE: "INITIAL_RESPONSE_AVAILABLE",
  EDITS_AVAILABLE: "EDITS_AVAILABLE",
  EDITS_DISABLED: "EDITS_DISABLED",
  RSVP_NOT_OPEN: "RSVP_NOT_OPEN",
  RSVP_CLOSED: "RSVP_CLOSED",
  DEADLINE_PASSED: "DEADLINE_PASSED",
  EVENT_STARTED: "EVENT_STARTED",
  EVENT_COMPLETED: "EVENT_COMPLETED",
  EVENT_ARCHIVED: "EVENT_ARCHIVED",
} as const;

export type GuestRsvpPolicyReason =
  (typeof GuestRsvpPolicyReason)[keyof typeof GuestRsvpPolicyReason];

export interface GuestRsvpPolicyInput {
  readonly eventStatus: EventStatusValue;
  /** Event-local calendar date in YYYY-MM-DD form. */
  readonly currentDate: string;
  /** Event-local inclusive deadline in YYYY-MM-DD form. */
  readonly rsvpDeadline?: string | null;
  readonly allowRsvpEdits: boolean;
  readonly hasExistingRsvp: boolean;
}

export interface GuestRsvpPolicy {
  readonly lifecycleState: GuestRsvpLifecycleState;
  /** True only when a guest may create their first response. */
  readonly canRespond: boolean;
  /** True only when an existing response may be replaced. */
  readonly canEdit: boolean;
  readonly reason: GuestRsvpPolicyReason;
}

/**
 * Central guest RSVP policy. The caller supplies the event-local date so this
 * function remains deterministic and does not perform timezone or clock I/O.
 */
export function evaluateGuestRsvpPolicy(
  input: GuestRsvpPolicyInput,
): GuestRsvpPolicy {
  assertIsoCalendarDate(input.currentDate, "currentDate");
  if (input.rsvpDeadline !== undefined && input.rsvpDeadline !== null) {
    assertIsoCalendarDate(input.rsvpDeadline, "rsvpDeadline");
  }

  if (input.eventStatus === EventStatus.COMPLETED) {
    return closedPolicy(
      GuestRsvpLifecycleState.COMPLETED,
      GuestRsvpPolicyReason.EVENT_COMPLETED,
    );
  }
  if (input.eventStatus === EventStatus.ARCHIVED) {
    return closedPolicy(
      GuestRsvpLifecycleState.CLOSED,
      GuestRsvpPolicyReason.EVENT_ARCHIVED,
    );
  }
  if (input.eventStatus === EventStatus.EVENT_DAY) {
    return closedPolicy(
      GuestRsvpLifecycleState.CLOSED,
      GuestRsvpPolicyReason.EVENT_STARTED,
    );
  }
  if (input.eventStatus === EventStatus.RSVP_CLOSED) {
    return closedPolicy(
      GuestRsvpLifecycleState.CLOSED,
      GuestRsvpPolicyReason.RSVP_CLOSED,
    );
  }
  if (input.eventStatus !== EventStatus.RSVP_OPEN) {
    return closedPolicy(
      GuestRsvpLifecycleState.CLOSED,
      GuestRsvpPolicyReason.RSVP_NOT_OPEN,
    );
  }
  if (
    input.rsvpDeadline !== undefined &&
    input.rsvpDeadline !== null &&
    input.currentDate > input.rsvpDeadline
  ) {
    return closedPolicy(
      GuestRsvpLifecycleState.CLOSED,
      GuestRsvpPolicyReason.DEADLINE_PASSED,
    );
  }

  if (!input.hasExistingRsvp) {
    return {
      lifecycleState: GuestRsvpLifecycleState.OPEN,
      canRespond: true,
      canEdit: false,
      reason: GuestRsvpPolicyReason.INITIAL_RESPONSE_AVAILABLE,
    };
  }
  if (input.allowRsvpEdits) {
    return {
      lifecycleState: GuestRsvpLifecycleState.OPEN,
      canRespond: false,
      canEdit: true,
      reason: GuestRsvpPolicyReason.EDITS_AVAILABLE,
    };
  }
  return {
    lifecycleState: GuestRsvpLifecycleState.OPEN,
    canRespond: false,
    canEdit: false,
    reason: GuestRsvpPolicyReason.EDITS_DISABLED,
  };
}

function assertMemberId(id: string, code: string): void {
  if (typeof id !== "string" || id.length === 0 || id.trim() !== id) {
    throw new InvitationInvariantError(
      code,
      "RSVP member IDs must be non-empty.",
    );
  }
}

function validateReplyInvitation(
  input: InvitationReplyActionMappingInput,
): void {
  resolveRsvpSelection({
    invitationType: input.invitationType,
    members: input.members,
    maxCompanions: input.maxCompanions,
    attendingMemberIds: [],
    companionCount: 0,
  });
}

function directReplySelection(
  input: InvitationReplyActionMappingInput,
  attendingMemberIds: readonly string[],
  companionCount: number,
): DirectRsvpReplyActionMapping {
  return {
    kind: RsvpReplyActionMappingKind.RSVP_SELECTION,
    actionId: input.actionId,
    ...resolveRsvpSelection({
      invitationType: input.invitationType,
      members: input.members,
      maxCompanions: input.maxCompanions,
      attendingMemberIds,
      companionCount,
    }),
  };
}

function throwUnsupportedReplyAction(
  actionId: string,
  invitationType: InvitationTypeValue,
): never {
  throw new InvitationInvariantError(
    "RSVP_REPLY_ACTION_UNSUPPORTED",
    `Reply action ${JSON.stringify(actionId)} is not valid for ${invitationType}.`,
  );
}

function closedPolicy(
  lifecycleState: GuestRsvpLifecycleState,
  reason: GuestRsvpPolicyReason,
): GuestRsvpPolicy {
  return { lifecycleState, canRespond: false, canEdit: false, reason };
}

function assertIsoCalendarDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvitationInvariantError(
      "RSVP_POLICY_DATE_INVALID",
      `${field} must use YYYY-MM-DD.`,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InvitationInvariantError(
      "RSVP_POLICY_DATE_INVALID",
      `${field} must be a valid calendar date.`,
    );
  }
}
