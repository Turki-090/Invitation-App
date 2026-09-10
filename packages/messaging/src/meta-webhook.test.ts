import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MetaWebhookPayloadError,
  parseMetaWebhookPayload,
  verifyMetaWebhookSignature,
} from "./meta-webhook";

describe("Meta webhook contract", () => {
  it("verifies the raw payload and rejects altered bytes", () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaWebhookSignature(body, signature, "app-secret")).toBe(
      true,
    );
    expect(
      verifyMetaWebhookSignature(
        Buffer.concat([body, Buffer.from(" ")]),
        signature,
        "app-secret",
      ),
    ).toBe(false);
  });

  it("normalizes duplicate and out-of-order status fixtures deterministically", () => {
    const logicalMessageId = "0a837874-8e78-4d23-a389-48860b8e33bb";
    const delivered = fixtureStatus(
      "delivered",
      "1725880000",
      logicalMessageId,
    );
    const repeated = fixtureStatus("delivered", "1725880000");
    const read = fixtureStatus("read", "1725880010");
    const [first] = parseMetaWebhookPayload(delivered);
    const [duplicate] = parseMetaWebhookPayload(repeated);
    const [later] = parseMetaWebhookPayload(read);
    expect(first).toMatchObject({
      kind: "STATUS",
      providerMessageId: "wamid.123",
      logicalMessageId,
      status: "DELIVERED",
    });
    expect(duplicate?.providerEventId).toBe(first?.providerEventId);
    expect(later).toMatchObject({ status: "READ" });
  });

  it("normalizes failed and interactive response fixtures without recipient PII", () => {
    const events = parseMetaWebhookPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  {
                    id: "wamid.failed",
                    status: "failed",
                    timestamp: "1725880000",
                    recipient_id: "966501234567",
                    errors: [{ code: 131026, title: "Undeliverable" }],
                  },
                ],
                messages: [
                  {
                    id: "wamid.reply",
                    timestamp: "1725880010",
                    from: "966501234567",
                    type: "interactive",
                    context: { id: "wamid.failed" },
                    interactive: {
                      button_reply: { id: "accept", title: "Accept" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      expect.objectContaining({
        kind: "STATUS",
        status: "FAILED",
        failureCode: "131026",
      }),
      expect.objectContaining({
        kind: "RESPONSE",
        contextProviderMessageId: "wamid.failed",
        responseType: "BUTTON",
        responseValue: "accept",
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("966501234567");
  });

  it("rejects malformed payloads", () => {
    expect(() => parseMetaWebhookPayload({ object: "other" })).toThrow(
      MetaWebhookPayloadError,
    );
  });

  it("rejects a payload routed from another configured phone number", () => {
    const payload = fixtureStatus(
      "sent",
      "1725880000",
      undefined,
      "999999999999999",
    );
    expect(() =>
      parseMetaWebhookPayload(payload, {
        phoneNumberId: "123456789012345",
      }),
    ).toThrow(MetaWebhookPayloadError);
  });
});

function fixtureStatus(
  status: string,
  timestamp: string,
  logicalMessageId?: string,
  phoneNumberId?: string,
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              ...(phoneNumberId
                ? { metadata: { phone_number_id: phoneNumberId } }
                : {}),
              statuses: [
                {
                  id: "wamid.123",
                  status,
                  timestamp,
                  ...(logicalMessageId
                    ? { biz_opaque_callback_data: logicalMessageId }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
