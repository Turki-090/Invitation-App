import { describe, expect, it } from "vitest";
import { normalizeLoginPhone } from "./login-phone";

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
