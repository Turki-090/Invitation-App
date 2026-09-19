import { createHmac, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { createLogger } from "@dawah/observability";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { OtpAttemptStore } from "../../src/auth/otp-attempt-store";
import { OtpDeliveryService } from "../../src/auth/otp-delivery.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { TestDatabase } from "./database";

const db = new TestDatabase();
const secretBytes = Buffer.from("local-integration-hook-secret-32-bytes");
const secret = `v1,whsec_${secretBytes.toString("base64")}`;
const logs: string[] = [];
const config = new ConfigService({
  AUTHENTICA_OTP_ENABLED: true,
  AUTHENTICA_API_KEY: "test-only-key",
  AUTHENTICA_BASE_URL: "https://api.authentica.sa/api/v2",
  AUTHENTICA_OTP_METHOD: "sms",
  AUTHENTICA_OTP_TEMPLATE_ID: 31,
  AUTHENTICA_REQUEST_TIMEOUT_MS: 2500,
  SUPABASE_SEND_SMS_HOOK_SECRET: secret,
});
const logger = createLogger({
  service: "api",
  environment: "test",
  level: "info",
  write: (line) => logs.push(line),
});
function service() {
  return new OtpDeliveryService(
    config,
    logger,
    new OtpAttemptStore(db.prisma as unknown as PrismaService),
  );
}
function request(id = randomUUID(), otp = "001234") {
  const body = Buffer.from(
    JSON.stringify({ user: { phone: "966501234567" }, sms: { otp } }),
  );
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${timestamp}.`).update(body).digest("base64")}`;
  return { body, headers: { id, timestamp, signature } };
}
describe("OTP durable delivery integration (provider simulated)", () => {
  beforeAll(async () => {
    await db.prisma.$connect();
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await db.prisma.$disconnect();
  });
  it("sends only once across concurrent service instances and restart", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: true })),
    );
    vi.stubGlobal("fetch", fetch);
    const r = request();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service().deliver(r.body, r.headers, {})),
    );
    expect(results.some((r) => r.httpCode === 200)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await service().deliver(r.body, r.headers, {})).toEqual({
      httpCode: 200,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const changed = request(r.headers.id, "654321");
    expect(
      await service().deliver(changed.body, changed.headers, {}),
    ).toMatchObject({ httpCode: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(logs.join("")).not.toMatch(/001234|966501234567|test-only-key/);
  });
  it("does not resend after ambiguous network failure", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("transport failed");
    });
    vi.stubGlobal("fetch", fetch);
    const r = request();
    expect(await service().deliver(r.body, r.headers, {})).toMatchObject({
      httpCode: 502,
    });
    expect(await service().deliver(r.body, r.headers, {})).toMatchObject({
      httpCode: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
