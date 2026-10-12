import { describe, expect, it } from "vitest";
import { verifyDialog360WebhookToken } from "./dialog360-webhook";

describe("360dialog webhook token", () => {
  const token = "d360-webhook-token-4b1f8e2c9a7d6e5f";

  it("accepts only the exact configured token", () => {
    expect(verifyDialog360WebhookToken(token, token)).toBe(true);
    expect(verifyDialog360WebhookToken(`${token} `, token)).toBe(false);
    expect(verifyDialog360WebhookToken(token.slice(0, -1), token)).toBe(false);
    expect(verifyDialog360WebhookToken(token.toUpperCase(), token)).toBe(false);
  });

  it("rejects a missing header and an unconfigured token", () => {
    expect(verifyDialog360WebhookToken(undefined, token)).toBe(false);
    expect(verifyDialog360WebhookToken("", token)).toBe(false);
    expect(verifyDialog360WebhookToken("", "")).toBe(false);
  });
});
