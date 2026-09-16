import { describe, expect, it } from "vitest";
import {
  calculateCheckInIncrement,
  checkInRequestFingerprint,
  CheckInInvariantError,
  createEntryPassToken,
  entryPassTokenPattern,
  hashCheckInIdempotencyKey,
  hashEntryPassToken,
  verifyEntryPassToken,
} from "./check-in";

const passId = "10000000-0000-4000-8000-000000000001";
const secret = "stage-nine-check-in-signing-secret-123456";

describe("check-in domain", () => {
  it("applies partial increments and marks the exact capacity complete", () => {
    expect(
      calculateCheckInIncrement({
        attendeeCount: 2,
        checkedInAttendance: 0,
        confirmedAttendance: 3,
      }),
    ).toEqual({
      previousAttendance: 0,
      checkedInAttendance: 2,
      remainingAttendance: 1,
      complete: false,
    });
    expect(
      calculateCheckInIncrement({
        attendeeCount: 1,
        checkedInAttendance: 2,
        confirmedAttendance: 3,
      }).complete,
    ).toBe(true);
  });

  it.each([
    [{ attendeeCount: 0, checkedInAttendance: 0, confirmedAttendance: 2 }, "CHECK_IN_INCREMENT_INVALID"],
    [{ attendeeCount: 1, checkedInAttendance: 0, confirmedAttendance: 0 }, "CHECK_IN_NOT_ELIGIBLE"],
    [{ attendeeCount: 1, checkedInAttendance: 2, confirmedAttendance: 2 }, "ALREADY_CHECKED_IN"],
    [{ attendeeCount: 2, checkedInAttendance: 1, confirmedAttendance: 2 }, "CHECK_IN_CAPACITY_EXCEEDED"],
  ] as const)("rejects an unsafe increment with %s", (input, code) => {
    expect(() => calculateCheckInIncrement(input)).toThrowError(
      expect.objectContaining({ code }) as CheckInInvariantError,
    );
  });

  it("reconstructs and authenticates opaque pass tokens", () => {
    const token = createEntryPassToken(passId, secret);

    expect(token).toMatch(entryPassTokenPattern);
    expect(createEntryPassToken(passId, secret)).toBe(token);
    expect(verifyEntryPassToken(token, secret)).toBe(passId);
    expect(hashEntryPassToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toContain(passId);
  });

  it("rejects tampered tokens without revealing an identifier", () => {
    const token = createEntryPassToken(passId, secret);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifyEntryPassToken(tampered, secret)).toBeNull();
    expect(verifyEntryPassToken("not-a-pass", secret)).toBeNull();
  });

  it("requires a dedicated strong signing secret and UUID pass ID", () => {
    expect(() => createEntryPassToken(passId, "short")).toThrow(RangeError);
    expect(() => createEntryPassToken("not-a-uuid", secret)).toThrow(
      RangeError,
    );
  });

  it("creates stable, input-sensitive idempotency and request hashes", () => {
    expect(hashCheckInIdempotencyKey("scanner-operation-1")).toBe(
      hashCheckInIdempotencyKey("scanner-operation-1"),
    );
    const base = {
      attendeeCount: 1,
      deviceId: "door-a",
      eventId: "20000000-0000-4000-8000-000000000001",
      invitationGroupId: "30000000-0000-4000-8000-000000000001",
      source: "QR" as const,
    };
    expect(checkInRequestFingerprint(base)).not.toBe(
      checkInRequestFingerprint({ ...base, attendeeCount: 2 }),
    );
  });
});
