import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEVELOPMENT_ACCESS_TOKEN } from "@dawah/api-contract";
import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService development bypass", () => {
  it("returns a deterministic local principal when explicitly enabled", async () => {
    const service = new AuthService(
      new ConfigService({
        NODE_ENV: "development",
        DAWAH_DEV_AUTH_BYPASS: "true",
      }),
    );

    await expect(service.verify(DEVELOPMENT_ACCESS_TOKEN)).resolves.toEqual({
      subject: "dawah-local-development-host",
      email: "developer@localhost",
    });
  });

  it("rejects the local credential in production", async () => {
    const service = new AuthService(
      new ConfigService({
        NODE_ENV: "production",
        DAWAH_DEV_AUTH_BYPASS: "true",
      }),
    );

    await expect(
      service.verify(DEVELOPMENT_ACCESS_TOKEN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fails closed when the runtime environment is unspecified", async () => {
    const service = new AuthService(
      new ConfigService({ DAWAH_DEV_AUTH_BYPASS: "true" }),
    );

    await expect(
      service.verify(DEVELOPMENT_ACCESS_TOKEN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
