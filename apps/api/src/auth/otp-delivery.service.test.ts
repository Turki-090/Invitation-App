import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { Logger } from "@dawah/observability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtpDeliveryService } from "./otp-delivery.service";

const secretBytes = Buffer.from("dawah-supabase-send-sms-hook-secret");
const hookSecret = `v1,whsec_${secretBytes.toString("base64")}`;

const configuration = {
  AUTHENTICA_OTP_ENABLED: true,
  AUTHENTICA_API_KEY: "authentica-api-key",
  AUTHENTICA_BASE_URL: "https://api.authentica.sa/api/v2",
  AUTHENTICA_OTP_METHOD: "whatsapp",
  AUTHENTICA_OTP_TEMPLATE_ID: 1,
  AUTHENTICA_REQUEST_TIMEOUT_MS: 10_000,
  SUPABASE_SEND_SMS_HOOK_SECRET: hookSecret,
};

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  level: "info",
} as unknown as Logger;

function service(overrides: Record<string, unknown> = {}) {
  return new OtpDeliveryService(
    new ConfigService({ ...configuration, ...overrides }),
    logger,
  );
}

function signedRequest(payload: unknown) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const id = "msg_2Tn3";
  const signature = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest("base64");
  return {
    rawBody,
    headers: { id, timestamp, signature: `v1,${signature}` },
    payload,
  };
}

const hookRequest = signedRequest({
  user: { phone: "966501234567" },
  sms: { otp: "123456" },
});

function stubAuthentica(response: Response | Error) {
  const fetch = vi.fn((_url: string, _init?: RequestInit) =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function accepted() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OtpDeliveryService", () => {
  it("delivers a signed Supabase code through Authentica", async () => {
    const fetch = stubAuthentica(accepted());

    await expect(
      service().deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      ),
    ).resolves.toEqual({ httpCode: 200 });

    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.authentica.sa/api/v2/send-otp");
    expect(JSON.parse(String(request?.body))).toEqual({
      method: "whatsapp",
      otp: "123456",
      template_id: 1,
      phone: "+966501234567",
      fallback_phone: "+966501234567",
    });
  });

  it("refuses an unsigned or tampered request before contacting the provider", async () => {
    const fetch = stubAuthentica(accepted());
    const tampered = Buffer.from(
      JSON.stringify({
        user: { phone: "966500000000" },
        sms: { otp: "123456" },
      }),
    );

    await expect(
      service().deliver(tampered, hookRequest.headers, {
        user: { phone: "966500000000" },
        sms: { otp: "123456" },
      }),
    ).resolves.toMatchObject({ httpCode: 401 });
    await expect(
      service().deliver(
        hookRequest.rawBody,
        { id: undefined, timestamp: undefined, signature: undefined },
        hookRequest.payload,
      ),
    ).resolves.toMatchObject({ httpCode: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a signed request that carries no usable recipient", async () => {
    const fetch = stubAuthentica(accepted());
    const malformed = signedRequest({ user: {}, sms: { otp: "123456" } });

    await expect(
      service().deliver(
        malformed.rawBody,
        malformed.headers,
        malformed.payload,
      ),
    ).resolves.toMatchObject({ httpCode: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks Supabase to retry a transient provider fault", async () => {
    stubAuthentica(new Response("", { status: 503 }));

    await expect(
      service().deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      ),
    ).resolves.toMatchObject({ httpCode: 503, retryAfterSeconds: 1 });
  });

  it("does not ask Supabase to retry a rejected request", async () => {
    stubAuthentica(new Response("", { status: 401 }));

    await expect(
      service().deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      ),
    ).resolves.toEqual({
      httpCode: 502,
      message: "The code could not be delivered.",
    });
  });

  it("stays unavailable while delivery is not configured", async () => {
    const fetch = stubAuthentica(accepted());

    for (const overrides of [
      { AUTHENTICA_OTP_ENABLED: false },
      { SUPABASE_SEND_SMS_HOOK_SECRET: undefined },
    ]) {
      await expect(
        service(overrides).deliver(
          hookRequest.rawBody,
          hookRequest.headers,
          hookRequest.payload,
        ),
      ).resolves.toMatchObject({ httpCode: 503 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
