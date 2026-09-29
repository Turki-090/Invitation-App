import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEVELOPMENT_ACCESS_TOKEN } from "@dawah/api-contract";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

const signingKeys = vi.hoisted(() => ({
  jwks: null as null | { keys: Record<string, unknown>[] },
}));

vi.mock("jose", async (importOriginal) => {
  const jose = await importOriginal<typeof import("jose")>();
  return {
    ...jose,
    createRemoteJWKSet: () =>
      jose.createLocalJWKSet(
        signingKeys.jwks as Parameters<typeof createLocalJWKSet>[0],
      ),
  };
});

const supabaseUrl = "https://project.supabase.test";

describe("AuthService Supabase access tokens", () => {
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    signingKeys.jwks = { keys: [{ ...publicJwk, alg: "ES256", kid: "k1" }] };
  });

  function sign(claims: JWTPayload): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(`${supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  function service(): AuthService {
    return new AuthService(
      new ConfigService({ NODE_ENV: "production", SUPABASE_URL: supabaseUrl }),
    );
  }

  it("restores the bare-digit phone Supabase signs to E.164", async () => {
    const token = await sign({ phone: "966501234567", email: "" });

    await expect(service().verify(token)).resolves.toEqual({
      subject: "00000000-0000-4000-8000-000000000001",
      phone: "+966501234567",
    });
  });

  it("omits a phone claim that is not a canonical number", async () => {
    const token = await sign({
      phone: "0501234567",
      email: "host@example.com",
    });

    await expect(service().verify(token)).resolves.toEqual({
      subject: "00000000-0000-4000-8000-000000000001",
      email: "host@example.com",
    });
  });

  it("rejects a token signed for another issuer", async () => {
    const token = await new SignJWT({ phone: "966501234567" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer("https://attacker.example/auth/v1")
      .setAudience("authenticated")
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(service().verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

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
