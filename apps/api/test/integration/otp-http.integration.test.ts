import "reflect-metadata";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, type Request } from "express";
import { createLogger } from "@dawah/observability";
import { afterAll, beforeAll, expect, it } from "vitest";
import { OtpDeliveryController } from "../../src/auth/otp-delivery.controller";
import { OtpDeliveryService } from "../../src/auth/otp-delivery.service";
import { OtpAttemptStore } from "../../src/auth/otp-attempt-store";
import { PrismaService } from "../../src/prisma/prisma.service";
import { LOGGER } from "../../src/observability/observability.tokens";
import { TestDatabase } from "./database";

const db = new TestDatabase();
const secret = randomBytes(32);
let app: NestExpressApplication;
let provider: Server;
let url: string;
const received: { path: string; key: string | undefined; body: unknown }[] = [];

beforeAll(async () => {
  await db.prisma.$connect();
  provider = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received.push({
      path: req.url!,
      key: req.headers["x-authorization"] as string,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  const port = (provider.address() as AddressInfo).port;
  class TestModule {}
  Module({
    controllers: [OtpDeliveryController],
    providers: [
      OtpDeliveryService,
      OtpAttemptStore,
      { provide: PrismaService, useValue: db.prisma },
      {
        provide: LOGGER,
        useValue: createLogger({
          service: "api",
          environment: "test",
          level: "info",
          write: () => {},
        }),
      },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          AUTHENTICA_OTP_ENABLED: true,
          AUTHENTICA_API_KEY: "local-provider-test-key",
          AUTHENTICA_BASE_URL: `http://127.0.0.1:${port}/api/v2`,
          AUTHENTICA_OTP_METHOD: "sms",
          AUTHENTICA_OTP_TEMPLATE_ID: 31,
          AUTHENTICA_REQUEST_TIMEOUT_MS: 2500,
          SUPABASE_SEND_SMS_HOOK_SECRET: `v1,whsec_${secret.toString("base64")}`,
        }),
      },
    ],
  })(TestModule);
  app = await NestFactory.create<NestExpressApplication>(TestModule, {
    logger: false,
    bodyParser: false,
  });
  app.setGlobalPrefix("api/v1");
  app.use(
    json({
      verify: (req: Request & { rawBody?: Buffer }, _res, body) => {
        req.rawBody = Buffer.from(body);
      },
    }),
  );
  await app.listen(0, "127.0.0.1");
  url = `${await app.getUrl()}/api/v1/webhooks/supabase-otp`;
});
afterAll(async () => {
  await app?.close();
  provider?.close();
  await db.prisma.$disconnect();
});

it("verifies the raw HTTP hook, delivers the supplied code once, and returns Supabase envelopes", async () => {
  const body = JSON.stringify(
    { user: { phone: "966501234567" }, sms: { otp: "001234" } },
    null,
    2,
  );
  const id = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const headers = {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
  const invalid = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  expect(invalid.status).toBe(401);
  expect(await invalid.json()).toEqual({
    error: { http_code: 401, message: "The hook signature is not valid." },
  });
  expect(received).toHaveLength(0);
  for (let i = 0; i < 2; i++) {
    const result = await fetch(url, { method: "POST", headers, body });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({});
  }
  expect(received).toEqual([
    {
      path: "/api/v2/send-otp",
      key: "local-provider-test-key",
      body: {
        method: "sms",
        phone: "+966501234567",
        otp: "001234",
        template_id: 31,
      },
    },
  ]);
});
