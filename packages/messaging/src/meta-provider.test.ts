import { describe, expect, it, vi } from "vitest";
import { MetaWhatsAppProvider } from "./meta-provider";
import { MessagingProviderError } from "./types";

const input = {
  logicalMessageId: "10000000-0000-4000-8000-000000000001",
  to: "+966501234567",
  templateName: "wedding_invitation_en",
  languageCode: "en",
  bodyParameters: ["Sarah", "Wedding of Noura and Omar"],
} as const;

describe("MetaWhatsAppProvider", () => {
  it("sends an approved template and returns the wamid", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret",
      phoneNumberId: "123456",
      graphApiVersion: "v25.0",
      fetch,
      now: () => new Date("2026-09-09T10:00:00.000Z"),
    });

    await expect(provider.sendInvitation(input)).resolves.toEqual({
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.123",
      acceptedAt: new Date("2026-09-09T10:00:00.000Z"),
    });
    const [, request] = fetch.mock.calls[0]!;
    expect(JSON.parse(String(request.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "966501234567",
      biz_opaque_callback_data: input.logicalMessageId,
      template: {
        name: input.templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Sarah" },
              { type: "text", text: "Wedding of Noura and Omar" },
            ],
          },
        ],
      },
    });
    expect(request.headers.Authorization).toBe("Bearer secret");
  });

  it("classifies Meta rate limits as retryable without exposing response text", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 131048, message: "+966..." } }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "15" },
        },
      ),
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret",
      phoneNumberId: "123456",
      graphApiVersion: "v25.0",
      fetch,
    });

    const error = await provider.sendInvitation(input).catch((value) => value);
    expect(error).toBeInstanceOf(MessagingProviderError);
    expect(error).toMatchObject({
      providerCode: "131048",
      failureClass: "TRANSIENT",
      retryable: true,
      retryAfterMilliseconds: 15_000,
    });
    expect(error.message).not.toContain("966");
  });

  it("serializes a signed invitation image as the template header", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.image" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret",
      phoneNumberId: "123456",
      graphApiVersion: "v25.0",
      fetch,
    });
    const imageUrl =
      "https://api.dawah.sa/api/v1/messaging/media/10000000-0000-4000-8000-000000000001?checksum=abc&expires=123&signature=def";

    await provider.sendInvitation({
      ...input,
      header: { kind: "IMAGE_LINK", url: imageUrl },
    });

    const [, request] = fetch.mock.calls[0]!;
    expect(JSON.parse(String(request.body))).toMatchObject({
      template: {
        components: [
          {
            type: "header",
            parameters: [{ type: "image", image: { link: imageUrl } }],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: "Sarah" },
              { type: "text", text: "Wedding of Noura and Omar" },
            ],
          },
        ],
      },
    });
  });

  it("preserves primary and subcodes and retries when either is transient", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 4, error_subcode: 999_001 } }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );
    const provider = new MetaWhatsAppProvider({
      accessToken: "secret",
      phoneNumberId: "123456",
      graphApiVersion: "v25.0",
      fetch,
    });

    await expect(provider.sendInvitation(input)).rejects.toMatchObject({
      providerCode: "4/999001",
      failureClass: "TRANSIENT",
      retryable: true,
    });
  });
});
