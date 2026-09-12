import { describe, expect, it } from "vitest";
import {
  hostRsvpDetailSchema,
  issuePublicInvitationCapabilitySchema,
  issuedPublicInvitationCapabilitySchema,
  publicInvitationCapabilityStatusSchema,
  publicInvitationLocaleQuerySchema,
  publicInvitationSchema,
  rsvpResultSchema,
  submitRsvpSchema,
} from "./rsvp";

const eventId = "10000000-0000-4000-8000-000000000001";
const invitationId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const submissionId = "40000000-0000-4000-8000-000000000001";
const historyId = "50000000-0000-4000-8000-000000000001";
const now = "2026-09-11T10:00:00.000Z";

const currentRsvp = {
  status: "ACCEPTED",
  attendingMemberIds: [memberId],
  companionCount: 0,
  expectedAttendees: 1,
  respondedAt: now,
  updatedAt: now,
  isEdited: false,
} as const;

const publicInvitation = {
  locale: "en",
  event: {
    name: "The wedding",
    eventType: "WEDDING",
    eventDate: "2026-10-10",
    startTime: "18:30",
    endTime: "23:00",
    timezone: "Asia/Riyadh",
    venueName: "The garden",
    city: "Riyadh",
    mapUrl: "https://maps.google.com/?q=24.7,46.7",
    rsvpDeadline: "2026-10-01",
  },
  invitation: {
    displayName: "Ahmed",
    invitationType: "SINGLE",
    maxCompanions: 0,
    members: [{ id: memberId, name: "Ahmed", isPrimary: true, position: 1 }],
  },
  currentRsvp,
  policy: {
    lifecycleState: "OPEN",
    canRespond: false,
    canEdit: true,
    reason: "EDITS_AVAILABLE",
  },
} as const;

describe("Stage 7 RSVP contracts", () => {
  it("defaults the guest locale and rejects extra query inputs", () => {
    expect(publicInvitationLocaleQuerySchema.parse({})).toEqual({
      locale: "ar-SA",
    });
    expect(
      publicInvitationLocaleQuerySchema.safeParse({ locale: "fr" }).success,
    ).toBe(false);
    expect(
      publicInvitationLocaleQuerySchema.safeParse({ debug: "true" }).success,
    ).toBe(false);
  });

  it("accepts a bounded idempotent attendance selection", () => {
    expect(
      submitRsvpSchema.parse({
        submissionId,
        attendingMemberIds: [memberId],
        companionCount: 0,
      }),
    ).toEqual({
      submissionId,
      attendingMemberIds: [memberId],
      companionCount: 0,
    });
    expect(
      submitRsvpSchema.safeParse({
        submissionId,
        attendingMemberIds: [memberId, memberId],
        companionCount: 0,
      }).success,
    ).toBe(false);
    expect(
      submitRsvpSchema.safeParse({
        submissionId,
        attendingMemberIds: [],
        companionCount: -1,
      }).success,
    ).toBe(false);
    expect(
      submitRsvpSchema.parse({
        submissionId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        attendingMemberIds: ["BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB"],
        companionCount: 0,
      }),
    ).toEqual({
      submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      attendingMemberIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      companionCount: 0,
    });
  });

  it("strictly exposes only localized guest-safe invitation data", () => {
    expect(publicInvitationSchema.parse(publicInvitation)).toEqual(
      publicInvitation,
    );
    expect(
      publicInvitationSchema.safeParse({
        ...publicInvitation,
        invitation: {
          ...publicInvitation.invitation,
          phoneE164: "+966501234567",
        },
      }).success,
    ).toBe(false);
    expect(
      publicInvitationSchema.safeParse({
        ...publicInvitation,
        event: { ...publicInvitation.event, ownerUserId: eventId },
      }).success,
    ).toBe(false);
  });

  it("models a stable RSVP result including no-op and confirmation state", () => {
    expect(
      rsvpResultSchema.parse({
        submissionId,
        status: "DECLINED",
        attendingMemberIds: [],
        companionCount: 0,
        expectedAttendees: 0,
        respondedAt: now,
        isEdited: true,
        changed: false,
        confirmationQueued: false,
      }).changed,
    ).toBe(false);
  });

  it("shapes host history without accepting arbitrary response JSON", () => {
    const detail = {
      eventId,
      invitationId,
      displayName: "Ahmed",
      invitationType: "SINGLE",
      maxCompanions: 0,
      members: [{ id: memberId, name: "Ahmed", isPrimary: true, position: 1 }],
      currentRsvp: { ...currentRsvp, source: "GUEST_WEB" },
      history: [
        {
          id: historyId,
          previousStatus: "PENDING",
          newStatus: "ACCEPTED",
          previousCount: 0,
          newCount: 1,
          previousResponse: {
            status: "PENDING",
            attendingMemberIds: [],
            companionCount: 0,
            expectedAttendees: 0,
          },
          newResponse: {
            status: "ACCEPTED",
            attendingMemberIds: [memberId],
            companionCount: 0,
            expectedAttendees: 1,
          },
          source: "GUEST_WEB",
          actorReference: "capability:sha256",
          createdAt: now,
        },
      ],
    } as const;

    expect(hostRsvpDetailSchema.parse(detail).history).toHaveLength(1);
    expect(
      hostRsvpDetailSchema.safeParse({
        ...detail,
        history: [
          {
            ...detail.history[0],
            newResponse: {
              ...detail.history[0].newResponse,
              phoneE164: "+966501234567",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts optional expiry while keeping raw tokens out of status reads", () => {
    expect(issuePublicInvitationCapabilitySchema.parse({})).toEqual({});
    expect(
      issuePublicInvitationCapabilitySchema.safeParse({
        expiresAt: "2026-10-01",
      }).success,
    ).toBe(false);

    expect(
      publicInvitationCapabilityStatusSchema.parse({
        active: false,
        createdAt: null,
        expiresAt: null,
        revokedAt: null,
      }),
    ).toEqual({
      active: false,
      createdAt: null,
      expiresAt: null,
      revokedAt: null,
    });
    expect(
      publicInvitationCapabilityStatusSchema.safeParse({
        active: true,
        token: "secret",
        createdAt: now,
        expiresAt: null,
        revokedAt: null,
      }).success,
    ).toBe(false);

    expect(
      issuedPublicInvitationCapabilitySchema.safeParse({
        active: true,
        token: "a".repeat(43),
        createdAt: now,
        expiresAt: null,
        revokedAt: null,
      }).success,
    ).toBe(true);
    expect(
      issuedPublicInvitationCapabilitySchema.safeParse({
        active: true,
        token: "too-short",
        createdAt: now,
        expiresAt: null,
        revokedAt: null,
      }).success,
    ).toBe(false);
  });
});
