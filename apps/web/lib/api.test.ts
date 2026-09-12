import type { PublicInvitation, RsvpResult } from "@dawah/api-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicInvitation, submitPublicRsvp } from "./api";

const token = "a".repeat(43);
const memberId = "10000000-0000-4000-8000-000000000001";
const submissionId = "20000000-0000-4000-8000-000000000001";
const now = "2026-09-11T10:00:00.000Z";

afterEach(() => vi.unstubAllGlobals());

describe("public invitation API helpers", () => {
  it("uses distinct no-store retrieval and RSVP endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(invitation))
      .mockResolvedValueOnce(jsonResponse(result));
    vi.stubGlobal("fetch", fetchMock);

    await getPublicInvitation(token, "en");
    await submitPublicRsvp(token, "en", {
      attendingMemberIds: [memberId],
      companionCount: 0,
      submissionId,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://localhost:4000/api/v1/public/invitations/${token}?locale=en`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      referrerPolicy: "no-referrer",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `http://localhost:4000/api/v1/public/invitations/${token}/rsvp?locale=en`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      body: JSON.stringify({
        attendingMemberIds: [memberId],
        companionCount: 0,
        submissionId,
      }),
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      referrerPolicy: "no-referrer",
    });
  });
});

const invitation: PublicInvitation = {
  currentRsvp: null,
  event: {
    city: "Riyadh",
    endTime: null,
    eventDate: "2026-10-10",
    eventType: "WEDDING",
    mapUrl: null,
    name: "The wedding",
    rsvpDeadline: "2026-10-01",
    startTime: "18:30",
    timezone: "Asia/Riyadh",
    venueName: "The Garden",
  },
  invitation: {
    displayName: "Omar",
    invitationType: "SINGLE",
    maxCompanions: 0,
    members: [{ id: memberId, isPrimary: true, name: "Omar", position: 1 }],
  },
  locale: "en",
  policy: {
    canEdit: false,
    canRespond: true,
    lifecycleState: "OPEN",
    reason: "INITIAL_RESPONSE_AVAILABLE",
  },
};

const result: RsvpResult = {
  attendingMemberIds: [memberId],
  changed: true,
  companionCount: 0,
  confirmationQueued: true,
  expectedAttendees: 1,
  isEdited: false,
  respondedAt: now,
  status: "ACCEPTED",
  submissionId,
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
