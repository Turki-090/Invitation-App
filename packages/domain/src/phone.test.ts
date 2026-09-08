import { describe, expect, it } from "vitest";
import {
  maskPhoneNumber,
  normalizePhoneNumber,
  PhoneNormalizationError,
} from "./phone";

describe("normalizePhoneNumber", () => {
  it.each([
    ["SA", "051 234 5678", "+966512345678", "966"],
    ["AE", "050 123 4567", "+971501234567", "971"],
    ["BH", "3600 1234", "+97336001234", "973"],
    ["KW", "5001 2345", "+96550012345", "965"],
    ["OM", "9212 3456", "+96892123456", "968"],
    ["QA", "3312 3456", "+97433123456", "974"],
  ] as const)(
    "normalizes a valid %s national number and preserves metadata",
    (country, input, e164, callingCode) => {
      expect(normalizePhoneNumber(input, country)).toMatchObject({
        e164,
        countryCode: country,
        callingCode,
        isGcc: true,
      });
    },
  );

  it("accepts valid international input independently of the UI default", () => {
    expect(normalizePhoneNumber("+1 202 555 0123", "SA")).toMatchObject({
      e164: "+12025550123",
      countryCode: "US",
      isGcc: false,
    });
  });

  it("rejects empty and invalid input using stable error codes", () => {
    expect(() => normalizePhoneNumber(" ")).toThrowError(
      expect.objectContaining({ code: "PHONE_REQUIRED" }),
    );
    expect(() => normalizePhoneNumber("123", "SA")).toThrowError(
      PhoneNormalizationError,
    );
  });
});

describe("maskPhoneNumber", () => {
  it("keeps the country calling code and last four national digits visible", () => {
    expect(maskPhoneNumber("+966512345678")).toBe("+966•••••5678");
  });
});
