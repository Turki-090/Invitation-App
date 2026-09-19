import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { Logger } from "@dawah/observability";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtpDeliveryService } from "./otp-delivery.service";
import type { OtpAttemptStore, OtpAttempt } from "./otp-attempt-store";

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

function memoryStore() {
  const rows = new Map<string, OtpAttempt>();
  return {
    claim: vi.fn(async (key: string, fingerprint: string) => {
      const existing = rows.get(key);
      if (existing) return existing;
      rows.set(key, { fingerprint, httpCode: null });
      return null;
    }),
    complete: vi.fn(async (key: string, httpCode: number) => {
      rows.get(key)!.httpCode = httpCode;
    }),
  };
}

function service(
  overrides: Record<string, unknown> = {},
  store = memoryStore(),
) {
  return new OtpDeliveryService(
    new ConfigService({ ...configuration, ...overrides }),
    logger,
    store as unknown as OtpAttemptStore,
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
  it("deduplicates concurrent requests across service instances and replays success", async () => {
    const fetch = stubAuthentica(accepted());
    const store = memoryStore();
    const first = service({}, store);
    const second = service({}, store);
    const send = (instance: OtpDeliveryService) =>
      instance.deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      );
    const results = await Promise.all([send(first), send(second)]);
    expect(results.map((r) => r.httpCode).sort()).toEqual([200, 409]);
    expect(await send(second)).toEqual({ httpCode: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains failed attempts and fails closed if persistence is unavailable", async () => {
    const fetch = stubAuthentica(new Error("ambiguous acceptance"));
    const store = memoryStore();
    const instance = service({}, store);
    for (let i = 0; i < 2; i++)
      await instance.deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      );
    expect(fetch).toHaveBeenCalledTimes(1);
    store.claim.mockRejectedValueOnce(new Error("database offline"));
    expect(
      await instance.deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      ),
    ).toMatchObject({ httpCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses only the signed body, preserves leading zero OTPs, and never logs secrets", async () => {
    const fetch = stubAuthentica(accepted());
    const signed = signedRequest({
      user: { phone: "966501234567" },
      sms: { otp: "001234" },
    });
    await service().deliver(signed.rawBody, signed.headers, {
      sms: { otp: "999999" },
    });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).otp).toBe(
      "001234",
    );
    const logs = JSON.stringify([
      vi.mocked(logger.info).mock.calls,
      vi.mocked(logger.error).mock.calls,
    ]);
    for (const value of [
      "001234",
      "966501234567",
      hookSecret,
      configuration.AUTHENTICA_API_KEY,
    ])
      expect(logs).not.toContain(value);
  });
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

  it("does not retry an ambiguous provider fault", async () => {
    stubAuthentica(new Response("", { status: 503 }));

    await expect(
      service().deliver(
        hookRequest.rawBody,
        hookRequest.headers,
        hookRequest.payload,
      ),
    ).resolves.toMatchObject({ httpCode: 502 });
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
