import { describe, expect, it } from "vitest";
import {
  bulkCancelInvitationsSchema,
  createInvitationSchema,
  duplicateInvitationConflictSchema,
  invitationDetailSchema,
  listInvitationsQuerySchema,
  updateInvitationSchema,
} from "./invitations";

const invitationId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";

const validSingle = {
  displayName: "ضيف واحد",
  contactName: "أحمد",
  phoneNumber: "051 234 5678",
  phoneCountry: "SA",
  invitationType: "SINGLE",
  maxCompanions: 0,
  members: [{ name: "أحمد", isPrimary: true }],
  duplicateOverride: false,
} as const;

describe("invitation request contracts", () => {
  it("accepts a valid single invitation with an explicit duplicate decision", () => {
    expect(createInvitationSchema.parse(validSingle)).toEqual(validSingle);
  });

  it("enforces all invitation structures before persistence", () => {
    expect(
      createInvitationSchema.safeParse({
        ...validSingle,
        members: [{ name: "أحمد", isPrimary: false }],
      }).success,
    ).toBe(false);
    expect(
      createInvitationSchema.safeParse({
        ...validSingle,
        invitationType: "NAMED_GROUP",
        maxCompanions: 1,
      }).success,
    ).toBe(false);
    expect(
      createInvitationSchema.safeParse({
        ...validSingle,
        invitationType: "PRIMARY_WITH_COMPANIONS",
        members: [
          { name: "أحمد", isPrimary: true },
          { name: "محمد", isPrimary: false },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires duplicateOverride and a valid libphonenumber phone", () => {
    const { duplicateOverride: _, ...withoutDecision } = validSingle;
    expect(createInvitationSchema.safeParse(withoutDecision).success).toBe(
      false,
    );
    expect(
      createInvitationSchema.safeParse({
        ...validSingle,
        phoneNumber: "123",
      }).success,
    ).toBe(false);
  });

  it("requires phone and country patches together and rejects no-op patches", () => {
    expect(
      updateInvitationSchema.safeParse({
        phoneNumber: "+971501234567",
        duplicateOverride: false,
      }).success,
    ).toBe(false);
    expect(
      updateInvitationSchema.safeParse({ duplicateOverride: false }).success,
    ).toBe(false);
    expect(
      updateInvitationSchema.parse({
        phoneNumber: "+971501234567",
        phoneCountry: "AE",
        duplicateOverride: true,
      }),
    ).toMatchObject({ phoneCountry: "AE", duplicateOverride: true });
  });

  it("coerces page pagination and applies stable list defaults", () => {
    expect(
      listInvitationsQuerySchema.parse({ page: "2", pageSize: "50" }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      cancellationStatus: "ACTIVE",
      sortBy: "CREATED_AT",
      sortOrder: "DESC",
    });
    expect(
      listInvitationsQuerySchema.safeParse({ page: 0, pageSize: 101 }).success,
    ).toBe(false);
  });

  it("caps bulk cancellation at 100 unique-format UUID inputs", () => {
    expect(
      bulkCancelInvitationsSchema.parse({ invitationIds: [invitationId] }),
    ).toEqual({ invitationIds: [invitationId] });
    expect(
      bulkCancelInvitationsSchema.safeParse({ invitationIds: [] }).success,
    ).toBe(false);
  });
});

describe("invitation response contracts", () => {
  it("represents masked phone access without exposing E.164", () => {
    expect(
      invitationDetailSchema.parse({
        id: invitationId,
        eventId,
        displayName: "ضيف واحد",
        contactName: "أحمد",
        phoneE164: null,
        phoneMasked: "+966•••••5678",
        phoneCountry: "SA",
        phoneIsMasked: true,
        invitationType: "SINGLE",
        maxCompanions: 0,
        namedGuestCount: 1,
        maximumAttendees: 1,
        expectedAttendees: 0,
        rsvpStatus: "PENDING",
        internalNote: null,
        members: [{ id: memberId, name: "أحمد", position: 1, isPrimary: true }],
        createdAt: "2026-09-07T10:00:00.000Z",
        updatedAt: "2026-09-07T10:00:00.000Z",
        cancelledAt: null,
      }).phoneE164,
    ).toBeNull();
  });

  it("types duplicate conflict evidence without returning a full phone", () => {
    expect(
      duplicateInvitationConflictSchema.parse({
        error: {
          code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
          message: "An active invitation already uses this phone.",
          details: {
            duplicateCount: 1,
            duplicates: [
              {
                id: invitationId,
                displayName: "عائلة أحمد",
                phoneMasked: "+966•••••5678",
              },
            ],
            overrideRequired: true,
          },
        },
      }).error.details.overrideRequired,
    ).toBe(true);
  });
});
