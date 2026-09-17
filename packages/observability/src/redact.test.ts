import { describe, expect, it } from "vitest";
import {
  isRedactedKey,
  redact,
  redactedPlaceholder,
  redactText,
  redactUrl,
} from "./redact";

describe("redactText", () => {
  it("removes international and Saudi local phone numbers", () => {
    expect(redactText("sent to +966501234567 successfully")).toBe(
      `sent to ${redactedPlaceholder} successfully`,
    );
    expect(redactText("local 0501234567 entry")).toBe(
      `local ${redactedPlaceholder} entry`,
    );
    expect(redactText("spaced +966 50 123 4567 form")).toBe(
      `spaced ${redactedPlaceholder} form`,
    );
  });

  it("removes email addresses and bearer credentials", () => {
    expect(redactText("host-1@example.test asked")).toBe(
      `${redactedPlaceholder} asked`,
    );
    expect(redactText("Authorization: Bearer abc.def-ghi")).toBe(
      `Authorization: Bearer ${redactedPlaceholder}`,
    );
  });

  it("removes long opaque tokens while keeping entity identifiers readable", () => {
    const capability = "a".repeat(48);
    expect(redactText(`capability ${capability}`)).toBe(
      `capability ${redactedPlaceholder}`,
    );

    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(redactText(`event ${uuid}`)).toBe(`event ${uuid}`);
  });

  it("removes JSON Web Tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(redactText(`token=${jwt}`)).toBe(`token=${redactedPlaceholder}`);
  });
});

describe("redactUrl", () => {
  it("strips signature, capability, and expiry parameters but keeps the path", () => {
    const redacted = redactUrl(
      "https://storage.example.sa/private/export.xlsx?X-Amz-Signature=abcdef&X-Amz-Expires=900&page=2",
    );
    expect(redacted).toContain("/private/export.xlsx");
    expect(redacted).toContain(
      `X-Amz-Signature=${encodeURIComponent(redactedPlaceholder)}`,
    );
    expect(redacted).toContain(
      `X-Amz-Expires=${encodeURIComponent(redactedPlaceholder)}`,
    );
    expect(redacted).toContain("page=2");
  });

  it("removes embedded credentials and fragments", () => {
    const redacted = redactUrl("https://user:secret@api.example.sa/path#state");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("#state");
  });

  it("falls back to text redaction for values that are not URLs", () => {
    expect(redactUrl("not a url +966501234567")).toBe(
      `not a url ${redactedPlaceholder}`,
    );
  });
});

describe("isRedactedKey", () => {
  it("redacts credential and personal keys regardless of spelling", () => {
    for (const key of [
      "accessToken",
      "META_WHATSAPP_APP_SECRET",
      "capability_token",
      "authorization",
      "phoneE164",
      "guestName",
      "nameAr",
      "email",
      "recipient",
    ]) {
      expect(isRedactedKey(key)).toBe(true);
    }
  });

  it("keeps operational keys that incident response depends on", () => {
    for (const key of [
      "eventId",
      "queueName",
      "templateName",
      "statusCode",
      "invitationId",
      "providerMessageId",
      "batchId",
      "durationMs",
    ]) {
      expect(isRedactedKey(key)).toBe(false);
    }
  });
});

describe("redact", () => {
  it("replaces sensitive fields and scrubs surviving strings", () => {
    const result = redact({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      guestName: "سارة",
      phoneE164: "+966501234567",
      message: "reminder for +966501234567",
      nested: { authorization: "Bearer token-value", attempt: 2 },
    }) as Record<string, unknown>;

    expect(result.eventId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.guestName).toBe(redactedPlaceholder);
    expect(result.phoneE164).toBe(redactedPlaceholder);
    expect(result.message).toBe(`reminder for ${redactedPlaceholder}`);
    expect(result.nested).toEqual({
      authorization: redactedPlaceholder,
      attempt: 2,
    });
  });

  it("redacts URL-valued fields through the URL rules", () => {
    const result = redact({
      downloadUrl:
        "https://storage.example.sa/private/f.xlsx?X-Amz-Signature=abcdef123456",
    }) as Record<string, unknown>;
    expect(String(result.downloadUrl)).toContain("/private/f.xlsx");
    expect(String(result.downloadUrl)).not.toContain("abcdef123456");
  });

  it("normalizes errors, including their cause", () => {
    const error = new Error("send failed for +966501234567", {
      cause: new Error("upstream"),
    });
    const result = redact(error) as Record<string, unknown>;
    expect(result.name).toBe("Error");
    expect(result.message).toBe(`send failed for ${redactedPlaceholder}`);
    expect((result.cause as Record<string, unknown>).message).toBe("upstream");
  });

  it("bounds depth, breadth, and string length", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");

    const wide = { list: Array.from({ length: 40 }, (_, index) => index) };
    const wideResult = redact(wide) as { list: unknown[] };
    expect(wideResult.list).toHaveLength(33);
    expect(wideResult.list.at(-1)).toBe("[+8 more]");

    const long = { text: "long import warning ".repeat(200) };
    const longResult = String((redact(long) as { text: string }).text);
    expect(longResult).toContain("chars]");
    expect(longResult.length).toBeLessThan(2_100);
  });

  it("survives circular structures", () => {
    const node: Record<string, unknown> = { id: "1" };
    node.self = node;
    expect(redact(node)).toEqual({ id: "1", self: "[circular]" });
  });

  it("summarizes binary payloads instead of serializing them", () => {
    const result = redact({ file: Buffer.from("spreadsheet") }) as {
      file: string;
    };
    expect(result.file).toBe("[buffer 11 bytes]");
  });
});
