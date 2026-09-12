import { describe, expect, it } from "vitest";
import { InvitationInvariantError } from "./invitation";
import {
  evaluateGuestRsvpPolicy,
  GuestRsvpLifecycleState,
  GuestRsvpPolicyReason,
  mapInvitationReplyAction,
  resolveRsvpSelection,
  RsvpReplyActionMappingKind,
} from "./rsvp";
import { EventStatus, InvitationType, RsvpStatus } from "./types";

const primaryId = "member-primary";
const secondId = "member-second";
const thirdId = "member-third";

describe("resolveRsvpSelection", () => {
  it("validates IDs and returns named-group selections in invitation order", () => {
    expect(
      resolveRsvpSelection({
        invitationType: InvitationType.NAMED_GROUP,
        members: [
          { id: primaryId, isPrimary: true },
          { id: secondId, isPrimary: false },
          { id: thirdId, isPrimary: false },
        ],
        maxCompanions: 0,
        attendingMemberIds: [thirdId, primaryId],
        companionCount: 0,
      }),
    ).toEqual({
      attendingMemberIds: [primaryId, thirdId],
      attendingMemberCount: 2,
      companionCount: 0,
      status: RsvpStatus.PARTIALLY_ACCEPTED,
      expectedAttendeeCount: 2,
      maximumAttendeeCount: 3,
    });
  });

  it("rejects duplicate, blank, and foreign selected member IDs", () => {
    const base = {
      invitationType: InvitationType.SINGLE,
      members: [{ id: primaryId, isPrimary: true }],
      maxCompanions: 0,
      companionCount: 0,
    } as const;

    for (const [attendingMemberIds, code] of [
      [[primaryId, primaryId], "RSVP_SELECTED_MEMBER_IDS_DUPLICATE"],
      [[""], "RSVP_SELECTED_MEMBER_ID_INVALID"],
      [["member-foreign"], "RSVP_MEMBER_NOT_INVITED"],
    ] as const) {
      expect(() =>
        resolveRsvpSelection({ ...base, attendingMemberIds }),
      ).toThrow(expect.objectContaining({ code }));
    }
  });

  it("rejects duplicate invitation member IDs and companions without primary attendance", () => {
    expect(() =>
      resolveRsvpSelection({
        invitationType: InvitationType.NAMED_GROUP,
        members: [
          { id: primaryId, isPrimary: true },
          { id: primaryId, isPrimary: false },
        ],
        maxCompanions: 0,
        attendingMemberIds: [],
        companionCount: 0,
      }),
    ).toThrow(
      expect.objectContaining({ code: "RSVP_INVITATION_MEMBER_IDS_DUPLICATE" }),
    );

    expect(() =>
      resolveRsvpSelection({
        invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
        members: [{ id: primaryId, isPrimary: true }],
        maxCompanions: 2,
        attendingMemberIds: [],
        companionCount: 1,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "RSVP_COMPANIONS_REQUIRE_PRIMARY_MEMBER",
      }),
    );
  });
});

describe("mapInvitationReplyAction", () => {
  it("maps stable single and named-group direct reply IDs", () => {
    expect(
      mapInvitationReplyAction({
        invitationType: InvitationType.SINGLE,
        members: [{ id: primaryId, isPrimary: true }],
        maxCompanions: 0,
        actionId: "ATTEND",
      }),
    ).toMatchObject({
      kind: RsvpReplyActionMappingKind.RSVP_SELECTION,
      attendingMemberIds: [primaryId],
      status: RsvpStatus.ACCEPTED,
    });

    expect(
      mapInvitationReplyAction({
        invitationType: InvitationType.NAMED_GROUP,
        members: [
          { id: primaryId, isPrimary: true },
          { id: secondId, isPrimary: false },
        ],
        maxCompanions: 0,
        actionId: "DECLINE_ALL",
      }),
    ).toMatchObject({
      kind: RsvpReplyActionMappingKind.RSVP_SELECTION,
      attendingMemberIds: [],
      status: RsvpStatus.DECLINED,
    });
  });

  it("routes SELECT_MEMBERS to the web selection flow without guessing", () => {
    expect(
      mapInvitationReplyAction({
        invitationType: InvitationType.NAMED_GROUP,
        members: [
          { id: primaryId, isPrimary: true },
          { id: secondId, isPrimary: false },
        ],
        maxCompanions: 0,
        actionId: "SELECT_MEMBERS",
      }),
    ).toEqual({
      kind: RsvpReplyActionMappingKind.MEMBER_SELECTION_REQUIRED,
      actionId: "SELECT_MEMBERS",
    });
  });

  it("maps every in-range companion reply and rejects stale or mismatched IDs", () => {
    const input = {
      invitationType: InvitationType.PRIMARY_WITH_COMPANIONS,
      members: [{ id: primaryId, isPrimary: true }],
      maxCompanions: 2,
    } as const;
    expect(
      mapInvitationReplyAction({
        ...input,
        actionId: "ATTEND_WITH_2_COMPANIONS",
      }),
    ).toMatchObject({
      attendingMemberIds: [primaryId],
      companionCount: 2,
      expectedAttendeeCount: 3,
    });
    expect(() =>
      mapInvitationReplyAction({
        ...input,
        actionId: "ATTEND_WITH_3_COMPANIONS",
      }),
    ).toThrow(
      expect.objectContaining({ code: "RSVP_COMPANION_COUNT_EXCEEDS_LIMIT" }),
    );
    expect(() =>
      mapInvitationReplyAction({
        invitationType: InvitationType.SINGLE,
        members: input.members,
        maxCompanions: 0,
        actionId: "ATTEND_ALL",
      }),
    ).toThrow(
      expect.objectContaining({ code: "RSVP_REPLY_ACTION_UNSUPPORTED" }),
    );
  });
});

describe("evaluateGuestRsvpPolicy", () => {
  const openInput = {
    eventStatus: EventStatus.RSVP_OPEN,
    currentDate: "2026-09-11",
    rsvpDeadline: "2026-09-11",
    allowRsvpEdits: true,
    hasExistingRsvp: false,
  } as const;

  it("keeps the inclusive deadline open for a first response", () => {
    expect(evaluateGuestRsvpPolicy(openInput)).toEqual({
      lifecycleState: GuestRsvpLifecycleState.OPEN,
      canRespond: true,
      canEdit: false,
      reason: GuestRsvpPolicyReason.INITIAL_RESPONSE_AVAILABLE,
    });
  });

  it("opens only edits after an existing response when edits are enabled", () => {
    expect(
      evaluateGuestRsvpPolicy({ ...openInput, hasExistingRsvp: true }),
    ).toMatchObject({
      lifecycleState: GuestRsvpLifecycleState.OPEN,
      canRespond: false,
      canEdit: true,
      reason: GuestRsvpPolicyReason.EDITS_AVAILABLE,
    });
    expect(
      evaluateGuestRsvpPolicy({
        ...openInput,
        hasExistingRsvp: true,
        allowRsvpEdits: false,
      }),
    ).toMatchObject({
      lifecycleState: GuestRsvpLifecycleState.OPEN,
      canRespond: false,
      canEdit: false,
      reason: GuestRsvpPolicyReason.EDITS_DISABLED,
    });
  });

  it("closes after the deadline regardless of edit settings", () => {
    expect(
      evaluateGuestRsvpPolicy({
        ...openInput,
        currentDate: "2026-09-12",
        hasExistingRsvp: true,
      }),
    ).toEqual({
      lifecycleState: GuestRsvpLifecycleState.CLOSED,
      canRespond: false,
      canEdit: false,
      reason: GuestRsvpPolicyReason.DEADLINE_PASSED,
    });
  });

  it.each([
    [EventStatus.DRAFT, GuestRsvpPolicyReason.RSVP_NOT_OPEN],
    [EventStatus.ACTIVE, GuestRsvpPolicyReason.RSVP_NOT_OPEN],
    [EventStatus.RSVP_CLOSED, GuestRsvpPolicyReason.RSVP_CLOSED],
    [EventStatus.EVENT_DAY, GuestRsvpPolicyReason.EVENT_STARTED],
    [EventStatus.ARCHIVED, GuestRsvpPolicyReason.EVENT_ARCHIVED],
  ])("maps %s to a closed guest lifecycle", (eventStatus, reason) => {
    expect(
      evaluateGuestRsvpPolicy({ ...openInput, eventStatus }),
    ).toMatchObject({
      lifecycleState: GuestRsvpLifecycleState.CLOSED,
      canRespond: false,
      canEdit: false,
      reason,
    });
  });

  it("maps completed events to the completed guest lifecycle", () => {
    expect(
      evaluateGuestRsvpPolicy({
        ...openInput,
        eventStatus: EventStatus.COMPLETED,
      }),
    ).toMatchObject({
      lifecycleState: GuestRsvpLifecycleState.COMPLETED,
      reason: GuestRsvpPolicyReason.EVENT_COMPLETED,
    });
  });

  it("rejects invalid caller-supplied local dates", () => {
    expect(() =>
      evaluateGuestRsvpPolicy({ ...openInput, currentDate: "2026-02-30" }),
    ).toThrowError(InvitationInvariantError);
  });
});
