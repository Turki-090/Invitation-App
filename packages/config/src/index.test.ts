import { describe, expect, it } from "vitest";
import {
  validateApiEnvironment,
  validateWebEnvironment,
  validateWorkerEnvironment,
} from "./index";

const safeProductionApiEnvironment = {
  NODE_ENV: "production",
  DAWAH_ENV: "production",
  DATABASE_URL:
    "postgresql://service:secret@db.dawah.sa/dawah?sslmode=verify-full",
  REDIS_URL: "rediss://cache.dawah.sa:6380",
  SUPABASE_URL: "https://auth.dawah.sa",
  API_CORS_ORIGINS: "https://app.dawah.sa",
  DAWAH_DEV_AUTH_BYPASS: "false",
};

describe("environment validation", () => {
  it("normalizes a safe production API configuration", () => {
    expect(validateApiEnvironment(safeProductionApiEnvironment)).toMatchObject({
      NODE_ENV: "production",
      DAWAH_ENV: "production",
      API_CORS_ORIGINS: ["https://app.dawah.sa"],
      DAWAH_DEV_AUTH_BYPASS: false,
      API_BODY_LIMIT_BYTES: 1_048_576,
    });
  });

  it("rejects missing and unsafe production API values", () => {
    expect(() =>
      validateApiEnvironment({
        NODE_ENV: "production",
        DAWAH_ENV: "production",
        DATABASE_URL: "postgresql://dawah:dawah@localhost:5433/dawah",
        REDIS_URL: "redis://localhost:6379",
        API_CORS_ORIGINS: "http://localhost:3000",
      }),
    ).toThrow(/DATABASE_URL|REDIS_URL|SUPABASE_URL|API_CORS_ORIGINS/);
  });

  it("does not infer a local deployment from production NODE_ENV", () => {
    expect(() =>
      validateApiEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://dawah:dawah@localhost:5433/dawah",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/DAWAH_ENV/);
  });

  it("rejects the API development bypass outside local development", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        DAWAH_DEV_AUTH_BYPASS: "true",
      }),
    ).toThrow(/development authentication bypass/i);
  });

  it("rejects insecure worker infrastructure when deployed", () => {
    expect(() =>
      validateWorkerEnvironment({
        NODE_ENV: "production",
        DAWAH_ENV: "staging",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/REDIS_URL/);
  });

  it.each([
    "rediss://127.0.0.2:6380",
    "rediss://localhost.:6380",
    "rediss://[::ffff:127.0.0.2]:6380",
  ])("rejects disguised loopback Redis endpoint %s", (redisUrl) => {
    expect(() =>
      validateWorkerEnvironment({
        NODE_ENV: "production",
        DAWAH_ENV: "production",
        REDIS_URL: redisUrl,
      }),
    ).toThrow(/REDIS_URL/);
  });

  it("rejects the public web bypass in a production bundle", () => {
    expect(() =>
      validateWebEnvironment({
        NODE_ENV: "production",
        DAWAH_ENV: "production",
        NEXT_PUBLIC_API_URL: "https://api.dawah.sa/api/v1",
        NEXT_PUBLIC_SUPABASE_URL: "https://auth.dawah.sa",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          "public-anonymous-key-for-production-validation",
        NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS: "true",
      }),
    ).toThrow(/development authentication bypass/i);
  });
});
