import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseSupabaseSendSmsHookPayload,
  SupabaseAuthHookPayloadError,
  verifySupabaseAuthHookSignature,
} from "./supabase-otp-hook";

const secretBytes = Buffer.from("dawah-supabase-send-sms-hook-secret");
const secret = `v1,whsec_${secretBytes.toString("base64")}`;
const now = new Date("2026-09-18T10:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1_000));
const body = Buffer.from(
  JSON.stringify({ user: { phone: "966501234567" }, sms: { otp: "123456" } }),
);

function sign(id: string, signedAt: string, payload: Buffer): string {
  const digest = createHmac("sha256", secretBytes)
    .update(`${id}.${signedAt}.`)
    .update(payload)
    .digest("base64");
  return `v1,${digest}`;
}

const headers = {
  id: "msg_2Tn3",
  timestamp,
  signature: sign("msg_2Tn3", timestamp, body),
};

describe("verifySupabaseAuthHookSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(
      verifySupabaseAuthHookSignature(body, headers, secret, { now }),
    ).toBe(true);
  });

  it("accepts the secret with or without its stored prefixes", () => {
    for (const variant of [
      secret,
      secret.replace("v1,", ""),
      secretBytes.toString("base64"),
    ]) {
      expect(
        verifySupabaseAuthHookSignature(body, headers, variant, { now }),
      ).toBe(true);
    }
  });

  it("accepts any signature in a rotation list", () => {
    const rotated = {
      ...headers,
      signature: `v1,${Buffer.from("previous key").toString("base64")} ${headers.signature}`,
    };

    expect(
      verifySupabaseAuthHookSignature(body, rotated, secret, { now }),
    ).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    const tampered = Buffer.from(
      JSON.stringify({
        user: { phone: "966500000000" },
        sms: { otp: "123456" },
      }),
    );

    expect(
      verifySupabaseAuthHookSignature(tampered, headers, secret, { now }),
    ).toBe(false);
  });

  it("rejects a replay outside the tolerance window", () => {
    const later = new Date(now.getTime() + 301_000);

    expect(
      verifySupabaseAuthHookSignature(body, headers, secret, { now: later }),
    ).toBe(false);
    expect(
      verifySupabaseAuthHookSignature(body, headers, secret, {
        now: later,
        toleranceSeconds: 600,
      }),
    ).toBe(true);
  });

  it("rejects a timestamp that is not a signed integer", () => {
    const forged = { ...headers, timestamp: `${timestamp}.5` };

    expect(verifySupabaseAuthHookSignature(body, forged, secret, { now })).toBe(
      false,
    );
  });

  it("rejects missing headers, an unknown version, and an empty secret", () => {
    expect(
      verifySupabaseAuthHookSignature(
        body,
        { ...headers, signature: undefined },
        secret,
        { now },
      ),
    ).toBe(false);
    expect(
      verifySupabaseAuthHookSignature(
        body,
        { ...headers, signature: headers.signature.replace("v1,", "v2,") },
        secret,
        { now },
      ),
    ).toBe(false);
    expect(verifySupabaseAuthHookSignature(body, headers, "", { now })).toBe(
      false,
    );
  });

  it("rejects a signature signed with a different secret", () => {
    const other = Buffer.from("another-tenant-secret");
    const digest = createHmac("sha256", other)
      .update(`${headers.id}.${timestamp}.`)
      .update(body)
      .digest("base64");

    expect(
      verifySupabaseAuthHookSignature(
        body,
        { ...headers, signature: `v1,${digest}` },
        secret,
        { now },
      ),
    ).toBe(false);
  });
});

describe("parseSupabaseSendSmsHookPayload", () => {
  it("restores international format for the delivery provider", () => {
    expect(
      parseSupabaseSendSmsHookPayload({
        user: { phone: "966501234567" },
        sms: { otp: "123456" },
      }),
    ).toEqual({ phone: "+966501234567", otp: "123456" });
  });

  it("keeps a phone that already carries the plus", () => {
    expect(
      parseSupabaseSendSmsHookPayload({
        user: { phone: " +966501234567 " },
        sms: { otp: "1234" },
      }),
    ).toEqual({ phone: "+966501234567", otp: "1234" });
  });

  it("refuses a payload without a usable recipient or code", () => {
    for (const payload of [
      undefined,
      {},
      { user: { phone: "966501234567" } },
      { user: {}, sms: { otp: "123456" } },
      { user: { phone: "not-a-number" }, sms: { otp: "123456" } },
      { user: { phone: "966501234567" }, sms: { otp: "12" } },
      { user: { phone: "966501234567" }, sms: { otp: "12 34 56" } },
    ]) {
      expect(() => parseSupabaseSendSmsHookPayload(payload)).toThrow(
        SupabaseAuthHookPayloadError,
      );
    }
  });
});
