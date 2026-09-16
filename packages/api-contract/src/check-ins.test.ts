import { describe, expect, it } from "vitest";
import {
  checkInDashboardSchema,
  checkInIdempotencyKeySchema,
  checkInPartySchema,
  checkInResultSchema,
  createCheckInSchema,
  publicEntryPassSchema,
  searchCheckInPartiesQuerySchema,
} from "./check-ins";

const invitationGroupId = "10000000-0000-4000-8000-000000000001";
const token =
  "ep1.EAAAAAAAAECAAAAAAAAAAQ.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("check-in contracts", () => {
  it("accepts an opaque public entry pass while keeping token and QR payload identical", () => {
    expect(
      publicEntryPassSchema.parse({
        token,
        qrPayload: token,
        issuedAt: "2026-09-13T12:00:00.000Z",
        expiresAt: null,
      }),
    ).toMatchObject({ token });
    expect(
      publicEntryPassSchema.safeParse({
        token,
        qrPayload: token.replace(/A$/, "B"),
        issuedAt: "2026-09-13T12:00:00.000Z",
        expiresAt: null,
      }).success,
    ).toBe(false);
  });

  it("validates increment-style mutations, idempotency keys, and bounded search", () => {
    expect(
      createCheckInSchema.parse({
        invitationGroupId,
        attendeeCount: 2,
        source: "QR",
        deviceId: "door-a-ipad",
      }),
    ).toMatchObject({ attendeeCount: 2 });
    expect(checkInIdempotencyKeySchema.safeParse("scan-0001").success).toBe(
      true,
    );
    expect(checkInIdempotencyKeySchema.safeParse("has spaces").success).toBe(
      false,
    );
    expect(
      searchCheckInPartiesQuerySchema.parse({ query: "Al-Otaibi" }),
    ).toEqual({ query: "Al-Otaibi", limit: 20 });
    expect(
      searchCheckInPartiesQuerySchema.safeParse({ query: "a", limit: 100 })
        .success,
    ).toBe(false);
  });

  it("requires party and mutation counts to reconcile", () => {
    const party = {
      invitationGroupId,
      displayName: "Mohammed Al-Otaibi",
      phoneDisplay: "+966•••••4567",
      phoneMasked: true,
      confirmedAttendance: 3,
      checkedInAttendance: 1,
      remainingAttendance: 2,
      status: "PARTIALLY_CHECKED_IN",
      firstCheckedInAt: "2026-09-13T12:00:00.000Z",
      lastCheckedInAt: "2026-09-13T12:00:00.000Z",
      lastCheckedInBy: "Fahad",
      lastDeviceId: "door-a",
    };
    expect(checkInPartySchema.safeParse(party).success).toBe(true);
    expect(
      checkInPartySchema.safeParse({ ...party, remainingAttendance: 1 }).success,
    ).toBe(false);

    const result = {
      outcome: "PARTIALLY_CHECKED_IN",
      invitationGroupId,
      displayName: party.displayName,
      confirmedAttendance: 3,
      previousCheckedInAttendance: 0,
      checkedInAttendance: 1,
      remainingAttendance: 2,
      incrementedBy: 1,
      checkedInAt: "2026-09-13T12:00:00.000Z",
      checkedInBy: "Fahad",
      deviceId: "door-a",
      recordId: "20000000-0000-4000-8000-000000000001",
      idempotentReplay: false,
    };
    expect(checkInResultSchema.safeParse(result).success).toBe(true);
    expect(
      checkInResultSchema.safeParse({
        ...result,
        outcome: "ALREADY_CHECKED_IN",
      }).success,
    ).toBe(false);
  });

  it("requires dashboard people and group totals to reconcile", () => {
    const dashboard = {
      eventId: invitationGroupId,
      expectedAttendance: 6,
      checkedInAttendance: 3,
      remainingAttendance: 3,
      checkInPercentage: 50,
      invitationGroups: 3,
      fullyCheckedInGroups: 1,
      partiallyCheckedInGroups: 1,
      notArrivedGroups: 1,
      duplicateAttempts: 2,
      recentArrivals: [],
      calculatedAt: "2026-09-13T12:00:00.000Z",
    };
    expect(checkInDashboardSchema.safeParse(dashboard).success).toBe(true);
    expect(
      checkInDashboardSchema.safeParse({
        ...dashboard,
        notArrivedGroups: 2,
      }).success,
    ).toBe(false);
  });
});
