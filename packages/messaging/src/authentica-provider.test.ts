import { describe, expect, it, vi } from "vitest";
import { AuthenticaError, AuthenticaOtpProvider } from "./authentica-provider";

const accepted = () =>
  new Response(
    JSON.stringify({ success: true, data: null, message: "OTP send" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const input = {
  method: "whatsapp",
  otp: "123456",
  phone: "+966501234567",
  fallbackPhone: "+966501234567",
  templateId: 1,
} as const;

function provider(fetch: typeof globalThis.fetch) {
  return new AuthenticaOtpProvider({ apiKey: "api-key", fetch });
}

describe("AuthenticaOtpProvider", () => {
  it("sends the supplied code with the account API key", async () => {
    const fetch = vi.fn().mockResolvedValue(accepted());

    await expect(provider(fetch).sendOtp(input)).resolves.toBeUndefined();

    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.authentica.sa/api/v2/send-otp");
    expect(request.headers["X-Authorization"]).toBe("api-key");
    expect(JSON.parse(String(request.body))).toEqual({
      method: "whatsapp",
      otp: "123456",
      template_id: 1,
      phone: "+966501234567",
      fallback_phone: "+966501234567",
    });
  });

  it("treats a 200 envelope that did not accept the send as a failure", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(provider(fetch).sendOtp(input)).rejects.toMatchObject({
      providerCode: "PROVIDER_REJECTED",
      retryable: false,
    });
  });

  it("marks throttling and provider outages retryable", async () => {
    for (const [status, providerCode] of [
      [429, "PROVIDER_RATE_LIMITED"],
      [503, "PROVIDER_UNAVAILABLE"],
    ] as const) {
      const fetch = vi.fn().mockResolvedValue(new Response("", { status }));
      await expect(provider(fetch).sendOtp(input)).rejects.toMatchObject({
        providerCode,
        retryable: true,
        httpStatus: status,
      });
    }
  });

  it("does not retry a rejected key or request", async () => {
    for (const [status, providerCode] of [
      [401, "PROVIDER_UNAUTHORIZED"],
      [422, "PROVIDER_REQUEST_REJECTED"],
    ] as const) {
      const fetch = vi.fn().mockResolvedValue(new Response("", { status }));
      await expect(provider(fetch).sendOtp(input)).rejects.toMatchObject({
        providerCode,
        retryable: false,
      });
    }
  });

  it("reports a transport failure as retryable without leaking the request", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("socket hang up"));

    const error = await provider(fetch)
      .sendOtp(input)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AuthenticaError);
    expect(error).toMatchObject({
      providerCode: "PROVIDER_NETWORK_ERROR",
      retryable: true,
    });
    expect((error as Error).message).not.toContain("966501234567");
    expect((error as Error).message).not.toContain("123456");
  });

  it("abandons a request that outlives its timeout", async () => {
    const fetch = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const timed = new AuthenticaOtpProvider({
      apiKey: "api-key",
      requestTimeoutMilliseconds: 1,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(timed.sendOtp(input)).rejects.toMatchObject({
      providerCode: "PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it("refuses a request the provider cannot deliver", async () => {
    const fetch = vi.fn().mockResolvedValue(accepted());

    await expect(
      provider(fetch).sendOtp({ ...input, phone: undefined }),
    ).rejects.toMatchObject({ providerCode: "PROVIDER_RECIPIENT_MISSING" });
    await expect(
      provider(fetch).sendOtp({ ...input, otp: "12ab56" }),
    ).rejects.toMatchObject({ providerCode: "PROVIDER_OTP_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
