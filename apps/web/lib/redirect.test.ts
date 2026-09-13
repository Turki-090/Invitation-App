import { describe, expect, it } from "vitest";
import { safeRelativeRedirect } from "./redirect";

describe("safe relative redirects", () => {
  it("keeps localized internal destinations", () => {
    expect(
      safeRelativeRedirect("/en/team-invitations/token?source=sms", "en"),
    ).toBe("/en/team-invitations/token?source=sms");
  });

  it("rejects external, protocol-relative, cross-locale, and slash-confused URLs", () => {
    const fallback = "/en/events";
    for (const value of [
      "https://example.com/steal",
      "//example.com/steal",
      "/ar-SA/events",
      "/en\\example.com",
    ]) {
      expect(safeRelativeRedirect(value, "en")).toBe(fallback);
    }
  });
});
