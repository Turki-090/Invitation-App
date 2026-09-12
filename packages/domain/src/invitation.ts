import { InvitationType, RsvpStatus } from "./types";

export interface InvitationStructure {
  invitationType: InvitationType;
  memberCount: number;
  primaryMemberCount: number;
  maxCompanions: number;
}

export interface InvitationMemberStructure {
  isPrimary: boolean;
}

export interface InvitationAggregateStructure {
  invitationType: InvitationType;
  members: readonly InvitationMemberStructure[];
  maxCompanions: number;
}

export interface DuplicateInvitationDecision {
  duplicateInvitationIds: readonly string[];
  duplicateOverride: boolean;
}

export interface RsvpCalculationInput extends InvitationStructure {
  attendingMemberCount: number;
  companionCount: number;
}

export interface RsvpCalculation {
  status: Exclude<RsvpStatus, "PENDING">;
  expectedAttendeeCount: number;
  maximumAttendeeCount: number;
}

export class InvitationInvariantError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InvitationInvariantError";
  }
}

export function maximumAttendance(input: InvitationStructure): number {
  validateInvitationStructure(input);

  if (input.invitationType === InvitationType.PRIMARY_WITH_COMPANIONS) {
    return 1 + input.maxCompanions;
  }

  return input.memberCount;
}

export function validateInvitationAggregate(
  input: InvitationAggregateStructure,
): InvitationStructure {
  const structure: InvitationStructure = {
    invitationType: input.invitationType,
    memberCount: input.members.length,
    primaryMemberCount: input.members.filter((member) => member.isPrimary)
      .length,
    maxCompanions: input.maxCompanions,
  };

  validateInvitationStructure(structure);
  return structure;
}

export function validateDuplicateInvitationDecision(
  input: DuplicateInvitationDecision,
): void {
  if (input.duplicateInvitationIds.length > 0 && !input.duplicateOverride) {
    throw new InvitationInvariantError(
      "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
      "Another active invitation in this event uses the same contact phone number.",
    );
  }
}

export function validateInvitationStructure(input: InvitationStructure): void {
  if (!Number.isInteger(input.memberCount) || input.memberCount < 1) {
    throw new InvitationInvariantError(
      "INVITATION_MEMBER_COUNT_INVALID",
      "An invitation must contain at least one named member.",
    );
  }

  if (
    !Number.isInteger(input.primaryMemberCount) ||
    input.primaryMemberCount < 0
  ) {
    throw new InvitationInvariantError(
      "INVITATION_PRIMARY_COUNT_INVALID",
      "The primary member count is invalid.",
    );
  }

  if (!Number.isInteger(input.maxCompanions) || input.maxCompanions < 0) {
    throw new InvitationInvariantError(
      "INVITATION_COMPANION_LIMIT_INVALID",
      "The companion limit cannot be negative.",
    );
  }

  if (input.invitationType === InvitationType.SINGLE) {
    if (
      input.memberCount !== 1 ||
      input.primaryMemberCount !== 1 ||
      input.maxCompanions !== 0
    ) {
      throw new InvitationInvariantError(
        "SINGLE_INVITATION_STRUCTURE_INVALID",
        "A single invitation must contain exactly one primary member and no companions.",
      );
    }
    return;
  }

  if (input.invitationType === InvitationType.NAMED_GROUP) {
    if (input.primaryMemberCount > 1 || input.maxCompanions !== 0) {
      throw new InvitationInvariantError(
        "NAMED_GROUP_STRUCTURE_INVALID",
        "A named group cannot include unnamed companions or more than one primary member.",
      );
    }
    return;
  }

  if (input.memberCount !== 1 || input.primaryMemberCount !== 1) {
    throw new InvitationInvariantError(
      "COMPANION_INVITATION_STRUCTURE_INVALID",
      "A companion invitation must contain exactly one named primary member.",
    );
  }
}

export function calculateRsvp(input: RsvpCalculationInput): RsvpCalculation {
  const maximumAttendeeCount = maximumAttendance(input);

  if (
    !Number.isInteger(input.attendingMemberCount) ||
    input.attendingMemberCount < 0
  ) {
    throw new InvitationInvariantError(
      "RSVP_MEMBER_COUNT_INVALID",
      "The attending named-member count is invalid.",
    );
  }

  if (!Number.isInteger(input.companionCount) || input.companionCount < 0) {
    throw new InvitationInvariantError(
      "RSVP_COMPANION_COUNT_INVALID",
      "The attending companion count is invalid.",
    );
  }

  if (input.attendingMemberCount > input.memberCount) {
    throw new InvitationInvariantError(
      "RSVP_MEMBER_COUNT_EXCEEDS_INVITATION",
      "Attending named members cannot exceed the invitation's named members.",
    );
  }

  if (
    input.invitationType !== InvitationType.PRIMARY_WITH_COMPANIONS &&
    input.companionCount !== 0
  ) {
    throw new InvitationInvariantError(
      "RSVP_COMPANIONS_NOT_ALLOWED",
      "This invitation does not allow unnamed companions.",
    );
  }

  if (
    input.invitationType === InvitationType.PRIMARY_WITH_COMPANIONS &&
    input.attendingMemberCount === 0 &&
    input.companionCount > 0
  ) {
    throw new InvitationInvariantError(
      "RSVP_COMPANIONS_REQUIRE_PRIMARY_MEMBER",
      "Companions cannot attend when the invitation's primary named member is not attending.",
    );
  }

  if (input.companionCount > input.maxCompanions) {
    throw new InvitationInvariantError(
      "RSVP_COMPANION_COUNT_EXCEEDS_LIMIT",
      "Attending companions cannot exceed the invitation's companion limit.",
    );
  }

  const expectedAttendeeCount =
    input.attendingMemberCount + input.companionCount;
  if (expectedAttendeeCount > maximumAttendeeCount) {
    throw new InvitationInvariantError(
      "RSVP_ATTENDANCE_EXCEEDS_LIMIT",
      "Expected attendance cannot exceed the invitation's maximum attendance.",
    );
  }

  if (expectedAttendeeCount === 0) {
    return {
      status: RsvpStatus.DECLINED,
      expectedAttendeeCount,
      maximumAttendeeCount,
    };
  }

  if (
    input.invitationType === InvitationType.NAMED_GROUP &&
    input.attendingMemberCount < input.memberCount
  ) {
    return {
      status: RsvpStatus.PARTIALLY_ACCEPTED,
      expectedAttendeeCount,
      maximumAttendeeCount,
    };
  }

  return {
    status: RsvpStatus.ACCEPTED,
    expectedAttendeeCount,
    maximumAttendeeCount,
  };
}
