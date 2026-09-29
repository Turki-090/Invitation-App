import { describe, expect, it } from "vitest";
import {
  normalizeIdentityPhone,
  normalizeLoginPhone,
  smsLoginCountry,
} from "./login-phone";

describe("SMS login destinations", () => {
  it.each([
    ["+966501234567", "SA"],
    ["+971501234567", "AE"],
    ["+12015550123", "US"],
  ])("resolves the country of mobile number %s", (phone, country) => {
    expect(smsLoginCountry(phone)).toBe(country);
  });

  it.each([
    "+966112345678",
    "+449098790000",
    "+447700900123",
    "966501234567",
    "",
  ])("refuses %s", (phone) => {
    expect(smsLoginCountry(phone)).toBeNull();
  });
});

describe("identity phone normalization", () => {
  it.each([
    ["966501234567", "+966501234567"],
    ["+966501234567", "+966501234567"],
    ["971501234567", "+971501234567"],
    ["14155552671", "+14155552671"],
  ])("restores %s to %s", (claim, expected) => {
    expect(normalizeIdentityPhone(claim)).toBe(expected);
  });

  it.each([
    "",
    undefined,
    null,
    9_665_012_345_67,
    "0501234567",
    "9660501234567",
    "966 50 123 4567",
    "96650123456",
    "not a phone",
  ])("rejects %s", (claim) => {
    expect(normalizeIdentityPhone(claim)).toBeNull();
  });
});

describe("login phone normalization", () => {
  it.each([
    "0501234567",
    "501234567",
    "+966501234567",
    "966501234567",
    "00966501234567",
    "+966 50 123 4567",
  ])("normalizes %s", (phone) => {
    expect(normalizeLoginPhone(phone)).toBe("+966501234567");
  });
  it.each([
    "",
    "123",
    "+9660501234567",
    "9660501234567",
    "call 0501234567",
    "+966501234567 ext 1",
    "+9665012345678",
    "+966112345678",
  ])("rejects %s", (phone) => {
    expect(() => normalizeLoginPhone(phone)).toThrow();
  });
});
