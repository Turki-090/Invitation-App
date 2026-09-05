import { describe, expect, it } from "vitest";
import { calculateRsvp, InvitationInvariantError } from "./invitation";
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
