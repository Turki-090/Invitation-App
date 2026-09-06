import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";
import type { RedisHealthService } from "./redis-health.service";

const config = new ConfigService({
  API_READY_TIMEOUT_MS: 50,
}) as ConfigService<ApiEnvironment, true>;

describe("HealthService", () => {
  it("reports readiness when PostgreSQL and Redis respond", async () => {
    const service = new HealthService(
      {
        isHealthy: vi.fn().mockResolvedValue(true),
      } as unknown as PrismaService,
      {
        isHealthy: vi.fn().mockResolvedValue(true),
      } as unknown as RedisHealthService,
      config,
    );

    await expect(service.ready()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("fails readiness without failing process liveness", async () => {
    const service = new HealthService(
      {
        isHealthy: vi.fn().mockResolvedValue(true),
      } as unknown as PrismaService,
      {
        isHealthy: vi.fn().mockResolvedValue(false),
      } as unknown as RedisHealthService,
      config,
    );

    await expect(service.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
