import { describe, expect, it } from "vitest";
import {
  validateApiEnvironment,
  validateWebEnvironment,
  validateWorkerEnvironment,
} from "./index";

const safeProductionStorageEnvironment = {
  STORAGE_ENDPOINT: "https://objects.dawah.sa",
  STORAGE_REGION: "me-central-1",
  STORAGE_ACCESS_KEY_ID: "prod-storage-access-7f3a9c",
  STORAGE_SECRET_ACCESS_KEY: "prod-storage-secret-2e7b8d4f1a6c",
  STORAGE_PRIVATE_BUCKET: "dawah-private-production",
  STORAGE_FORCE_PATH_STYLE: "false",
};

const safeProductionDatabaseUrl =
  "postgresql://service:secret@db.dawah.sa/dawah?sslmode=verify-full";

const safeProductionApiEnvironment = {
  NODE_ENV: "production",
  DAWAH_ENV: "production",
  DATABASE_URL: safeProductionDatabaseUrl,
  REDIS_URL: "rediss://cache.dawah.sa:6380",
  SUPABASE_URL: "https://auth.dawah.sa",
  API_CORS_ORIGINS: "https://app.dawah.sa",
  DAWAH_DEV_AUTH_BYPASS: "false",
  ...safeProductionStorageEnvironment,
};

const safeProductionWorkerEnvironment = {
  NODE_ENV: "production",
  DAWAH_ENV: "production",
  DATABASE_URL: safeProductionDatabaseUrl,
  REDIS_URL: "rediss://cache.dawah.sa:6380",
  ...safeProductionStorageEnvironment,
};

describe("environment validation", () => {
  it("normalizes a safe production API configuration", () => {
    expect(validateApiEnvironment(safeProductionApiEnvironment)).toMatchObject({
      NODE_ENV: "production",
      DAWAH_ENV: "production",
      API_CORS_ORIGINS: ["https://app.dawah.sa"],
      DAWAH_DEV_AUTH_BYPASS: false,
      API_BODY_LIMIT_BYTES: 1_048_576,
      QUEUE_PREFIX: "dawah:production",
      STORAGE_FORCE_PATH_STYLE: false,
      IMPORT_MAX_FILE_BYTES: 8_388_608,
      IMPORT_MAX_ROWS: 5_000,
      IMPORT_MAX_COLUMNS: 64,
      IMPORT_MAX_CELL_CHARACTERS: 1_000,
      ASSET_MAX_FILE_BYTES: 8_388_608,
      ASSET_MAX_IMAGE_PIXELS: 24_000_000,
    });
  });

  it("normalizes the shared worker storage and import configuration", () => {
    expect(
      validateWorkerEnvironment(safeProductionWorkerEnvironment),
    ).toMatchObject({
      DATABASE_URL: safeProductionDatabaseUrl,
      STORAGE_ENDPOINT: "https://objects.dawah.sa",
      STORAGE_FORCE_PATH_STYLE: false,
      QUEUE_PREFIX: "dawah:production",
      IMPORT_MAX_FILE_BYTES: 8_388_608,
      IMPORT_MAX_ROWS: 5_000,
      IMPORT_MAX_COLUMNS: 64,
      IMPORT_MAX_CELL_CHARACTERS: 1_000,
      ASSET_MAX_FILE_BYTES: 8_388_608,
      ASSET_MAX_IMAGE_PIXELS: 24_000_000,
    });
  });

  it("allows path-style HTTP object storage in local and test environments", () => {
    const localInfrastructure = {
      NODE_ENV: "development",
      DAWAH_ENV: "local",
      DATABASE_URL:
        "postgresql://dawah:dawah@localhost:5433/dawah?schema=public",
      REDIS_URL: "redis://localhost:6379",
      STORAGE_ENDPOINT: "http://object-storage:7070",
      STORAGE_REGION: "us-east-1",
      STORAGE_ACCESS_KEY_ID: "dawah-local-access-key",
      STORAGE_SECRET_ACCESS_KEY: "dawah-local-secret-key",
      STORAGE_PRIVATE_BUCKET: "dawah-private",
      STORAGE_FORCE_PATH_STYLE: "true",
    };

    expect(validateApiEnvironment(localInfrastructure)).toMatchObject({
      STORAGE_ENDPOINT: "http://object-storage:7070",
      STORAGE_FORCE_PATH_STYLE: true,
    });
    expect(validateWorkerEnvironment(localInfrastructure)).toMatchObject({
      STORAGE_ENDPOINT: "http://object-storage:7070",
      STORAGE_FORCE_PATH_STYLE: true,
    });
  });

  it("rejects missing and unsafe production API values", () => {
    expect(() =>
      validateApiEnvironment({
        NODE_ENV: "production",
        DAWAH_ENV: "production",
        ...safeProductionStorageEnvironment,
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
        ...safeProductionWorkerEnvironment,
        DAWAH_ENV: "staging",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/REDIS_URL/);
  });

  it("rejects deployed HTTP storage and placeholder credentials", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        STORAGE_ENDPOINT: "http://object-storage:7070",
        STORAGE_ACCESS_KEY_ID: "replace-with-storage-access-key",
        STORAGE_SECRET_ACCESS_KEY: "changeme",
      }),
    ).toThrow(
      /STORAGE_ENDPOINT|STORAGE_ACCESS_KEY_ID|STORAGE_SECRET_ACCESS_KEY/,
    );
  });

  it("requires the worker database configuration", () => {
    const { DATABASE_URL: _databaseUrl, ...withoutDatabase } =
      safeProductionWorkerEnvironment;

    expect(() => validateWorkerEnvironment(withoutDatabase)).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects non-positive parser and asset limits", () => {
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        IMPORT_MAX_ROWS: "0",
        ASSET_MAX_IMAGE_PIXELS: "-1",
      }),
    ).toThrow(/IMPORT_MAX_ROWS|ASSET_MAX_IMAGE_PIXELS/);
  });

  it("keeps configured upload limits within the HTTP memory safety cap", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        IMPORT_MAX_FILE_BYTES: String(16 * 1024 * 1024 + 1),
        ASSET_MAX_FILE_BYTES: String(16 * 1024 * 1024 + 1),
      }),
    ).toThrow(/IMPORT_MAX_FILE_BYTES|ASSET_MAX_FILE_BYTES/);
  });

  it.each([
    "rediss://127.0.0.2:6380",
    "rediss://localhost.:6380",
    "rediss://[::ffff:127.0.0.2]:6380",
  ])("rejects disguised loopback Redis endpoint %s", (redisUrl) => {
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
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
