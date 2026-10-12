import { describe, expect, it, vi } from "vitest";
import { Dialog360WhatsAppProvider } from "./dialog360-provider";
import { MessagingProviderError } from "./types";

const input = {
  logicalMessageId: "10000000-0000-4000-8000-000000000001",
  to: "+966501234567",
  templateName: "wedding_invitation_en",
  languageCode: "en",
  bodyParameters: ["Sarah", "Wedding of Noura and Omar"],
} as const;

describe("Dialog360WhatsAppProvider", () => {
  it("sends an approved template and returns the wamid", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
      fetch,
      now: () => new Date("2026-09-09T10:00:00.000Z"),
    });

    await expect(provider.sendInvitation(input)).resolves.toEqual({
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.123",
      acceptedAt: new Date("2026-09-09T10:00:00.000Z"),
    });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://waba-v2.360dialog.io/messages");
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
    expect(request.headers["D360-API-KEY"]).toBe("secret");
    expect(request.headers).not.toHaveProperty("Authorization");
  });

  it("posts to a configured base such as the 360dialog sandbox", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.sandbox" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
      apiBaseUrl: "https://waba-sandbox.360dialog.io/v1/",
      fetch,
    });

    await provider.sendReminder(input);

    expect(fetch.mock.calls[0]![0]).toBe(
      "https://waba-sandbox.360dialog.io/v1/messages",
    );
  });

  it("treats a 360dialog rejection without a Meta code as permanent", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "revoked",
      fetch,
    });

    await expect(provider.sendInvitation(input)).rejects.toMatchObject({
      providerCode: "PROVIDER_HTTP_ERROR",
      httpStatus: 401,
      failureClass: "PERMANENT",
      retryable: false,
    });
  });

  it("binds stable RSVP actions to Meta quick-reply callback payloads", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.buttons" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
      fetch,
    });

    await provider.sendInvitation({
      ...input,
      quickReplyPayloads: ["ATTEND", "DECLINE"],
    });

    const [, request] = fetch.mock.calls[0]!;
    expect(JSON.parse(String(request.body)).template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Sarah" },
          { type: "text", text: "Wedding of Noura and Omar" },
        ],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [{ type: "payload", payload: "ATTEND" }],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [{ type: "payload", payload: "DECLINE" }],
      },
    ]);
  });

  it("rejects more quick replies than Meta can represent", async () => {
    const fetch = vi.fn();
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
      fetch,
    });

    await expect(
      provider.sendInvitation({
        ...input,
        quickReplyPayloads: ["ONE", "TWO", "THREE", "FOUR"],
      }),
    ).rejects.toMatchObject({
      providerCode: "PROVIDER_TEMPLATE_BUTTON_LIMIT",
      failureClass: "PERMANENT",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
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
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
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
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
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
    const provider = new Dialog360WhatsAppProvider({
      apiKey: "secret",
      fetch,
    });

    await expect(provider.sendInvitation(input)).rejects.toMatchObject({
      providerCode: "4/999001",
      failureClass: "TRANSIENT",
      retryable: true,
    });
  });
});
