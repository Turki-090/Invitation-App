import { describe, expect, it } from "vitest";
import {
  calculateRsvp,
  InvitationInvariantError,
  maximumAttendance,
  validateDuplicateInvitationDecision,
  validateInvitationAggregate,
  validateInvitationStructure,
} from "./invitation";
import { InvitationType, RsvpStatus } from "./types";

describe("calculateRsvp", () => {
  it("rejects attendance above a single invitation's capacity", () => {
    expect(() =>
      calculateRsvp({
        invitationType: InvitationType.SINGLE,
        memberCount: 1,
        primaryMemberCount: 1,
        maxCompanions: 0,
        attendingMemberCount: 2,
        companionCount: 0,
      }),
    ).toThrowError(InvitationInvariantError);
  });

  it("marks three of four named family members as partially accepted", () => {
    expect(
      calculateRsvp({
        invitationType: InvitationType.NAMED_GROUP,
        memberCount: 4,
        primaryMemberCount: 1,
        maxCompanions: 0,
        attendingMemberCount: 3,
        companionCount: 0,
      }),
    ).toEqual({
      status: RsvpStatus.PARTIALLY_ACCEPTED,
      expectedAttendeeCount: 3,
      maximumAttendeeCount: 4,
    });
  });

  it("rejects companions above the configured limit", () => {
    const submit = () =>
      calculateRsvp({
        invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
        memberCount: 1,
        primaryMemberCount: 1,
        maxCompanions: 2,
        attendingMemberCount: 1,
        companionCount: 3,
      });

    expect(submit).toThrowError(InvitationInvariantError);
    try {
      submit();
    } catch (error) {
      expect(error).toMatchObject({
        code: "RSVP_COMPANION_COUNT_EXCEEDS_LIMIT",
      });
    }
  });

  it("always records zero expected attendees for a decline", () => {
    expect(
      calculateRsvp({
        invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
        memberCount: 1,
        primaryMemberCount: 1,
        maxCompanions: 2,
        attendingMemberCount: 0,
        companionCount: 0,
      }),
    ).toMatchObject({ status: RsvpStatus.DECLINED, expectedAttendeeCount: 0 });
  });
});

describe("invitation structures", () => {
  it("requires SINGLE to contain exactly one primary named member", () => {
    expect(
      validateInvitationAggregate({
        invitationType: InvitationType.SINGLE,
        members: [{ isPrimary: true }],
        maxCompanions: 0,
      }),
    ).toEqual({
      invitationType: InvitationType.SINGLE,
      memberCount: 1,
      primaryMemberCount: 1,
      maxCompanions: 0,
    });

    for (const members of [
      [],
      [{ isPrimary: false }],
      [{ isPrimary: true }, { isPrimary: false }],
    ]) {
      expect(() =>
        validateInvitationAggregate({
          invitationType: InvitationType.SINGLE,
          members,
          maxCompanions: 0,
        }),
      ).toThrowError(InvitationInvariantError);
    }
  });

  it("requires NAMED_GROUP members, no companions, and at most one primary", () => {
    expect(() =>
      validateInvitationStructure({
        invitationType: InvitationType.NAMED_GROUP,
        memberCount: 3,
        primaryMemberCount: 1,
        maxCompanions: 0,
      }),
    ).not.toThrow();
    expect(() =>
      validateInvitationStructure({
        invitationType: InvitationType.NAMED_GROUP,
        memberCount: 0,
        primaryMemberCount: 0,
        maxCompanions: 0,
      }),
    ).toThrowError(InvitationInvariantError);
    expect(() =>
      validateInvitationStructure({
        invitationType: InvitationType.NAMED_GROUP,
        memberCount: 2,
        primaryMemberCount: 2,
        maxCompanions: 0,
      }),
    ).toThrowError(InvitationInvariantError);
    expect(() =>
      validateInvitationStructure({
        invitationType: InvitationType.NAMED_GROUP,
        memberCount: 2,
        primaryMemberCount: 1,
        maxCompanions: 1,
      }),
    ).toThrowError(InvitationInvariantError);
  });

  it("requires PRIMARY_WITH_COMPANIONS to contain one primary member", () => {
    expect(
      maximumAttendance({
        invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
        memberCount: 1,
        primaryMemberCount: 1,
        maxCompanions: 4,
      }),
    ).toBe(5);
    expect(() =>
      validateInvitationAggregate({
        invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
        members: [{ isPrimary: true }, { isPrimary: false }],
        maxCompanions: 2,
      }),
    ).toThrowError(InvitationInvariantError);
  });

  it("requires an explicit override when an event has phone duplicates", () => {
    expect(() =>
      validateDuplicateInvitationDecision({
        duplicateInvitationIds: ["existing-invitation"],
        duplicateOverride: false,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE" }),
    );
    expect(() =>
      validateDuplicateInvitationDecision({
        duplicateInvitationIds: ["existing-invitation"],
        duplicateOverride: true,
      }),
    ).not.toThrow();
  });
});
