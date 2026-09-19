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
  META_WHATSAPP_APP_SECRET: "prod-meta-app-secret-7f3a9c",
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "prod-meta-verify-token-2e7b8d",
  META_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: "https://api.dawah.sa/api/v1",
  META_WHATSAPP_MEDIA_SIGNING_SECRET:
    "prod-meta-media-signing-secret-2e7b8d4f1a6c",
  EXPORT_DOWNLOAD_SIGNING_SECRET:
    "prod-export-download-signing-secret-7f3a9c2e8d4f",
  CHECK_IN_TOKEN_SIGNING_SECRET:
    "prod-check-in-token-signing-secret-2e7b8d4f1a6c",
  ...safeProductionStorageEnvironment,
};

const safeProductionWorkerEnvironment = {
  NODE_ENV: "production",
  DAWAH_ENV: "production",
  DATABASE_URL: safeProductionDatabaseUrl,
  REDIS_URL: "rediss://cache.dawah.sa:6380",
  META_WHATSAPP_ACCESS_TOKEN: "prod-meta-access-token-7f3a9c",
  META_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: "https://api.dawah.sa/api/v1",
  META_WHATSAPP_MEDIA_SIGNING_SECRET:
    "prod-meta-media-signing-secret-2e7b8d4f1a6c",
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
      EXPORT_DOWNLOAD_URL_TTL_SECONDS: 300,
      EXPORT_RETENTION_HOURS: 168,
      CHECK_IN_ENABLED: false,
      BILLING_ENABLED: false,
      PAYMENTS_ENABLED: false,
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
      EXPORT_RETENTION_HOURS: 168,
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

  it("requires billing before payment activation", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        BILLING_ENABLED: "false",
        PAYMENTS_ENABLED: "true",
      }),
    ).toThrow(/PAYMENTS_ENABLED/);
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

  it("rejects insecure or placeholder messaging media capabilities when deployed", () => {
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: "http://localhost:4000/api/v1",
        META_WHATSAPP_MEDIA_SIGNING_SECRET:
          "dawah-local-meta-media-signing-secret",
      }),
    ).toThrow(
      /META_WHATSAPP_MEDIA_PUBLIC_BASE_URL|META_WHATSAPP_MEDIA_SIGNING_SECRET/,
    );
  });

  it("normalizes provider-safe RSVP confirmation template names", () => {
    expect(validateApiEnvironment(safeProductionApiEnvironment)).toMatchObject({
      META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR: "dawah_rsvp_confirmation_ar",
      META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_EN: "dawah_rsvp_confirmation_en",
    });
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR: "Unsafe Template Name",
      }),
    ).toThrow(/META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR/);
  });

  it.each([
    "https://api.dawah.sa",
    "https://api.dawah.sa/api/v1?token=leaked",
    "https://user:password@api.dawah.sa/api/v1",
    "https://api.dawah.sa/api/v1#fragment",
  ])("rejects a malformed messaging media API base URL: %s", (value) => {
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: value,
      }),
    ).toThrow(/META_WHATSAPP_MEDIA_PUBLIC_BASE_URL/);
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
  it("applies safe observability defaults", () => {
    expect(validateApiEnvironment(safeProductionApiEnvironment)).toMatchObject({
      LOG_LEVEL: "info",
      LOG_FORMAT: "json",
      METRICS_ENABLED: false,
      SENTRY_SAMPLE_RATE: 1,
    });
    expect(
      validateApiEnvironment(safeProductionApiEnvironment).METRICS_TOKEN,
    ).toBeUndefined();
  });

  it("rejects deployed human-readable logs and debug verbosity", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        LOG_FORMAT: "pretty",
      }),
    ).toThrow(/LOG_FORMAT/);
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        LOG_LEVEL: "debug",
      }),
    ).toThrow(/LOG_LEVEL/);
  });

  it("refuses a deployed metrics endpoint without a strong bearer token", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        METRICS_ENABLED: "true",
      }),
    ).toThrow(/METRICS_TOKEN/);
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        METRICS_ENABLED: "true",
        METRICS_TOKEN: "too-short",
      }),
    ).toThrow(/METRICS_TOKEN/);
    expect(() =>
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        METRICS_ENABLED: "true",
        METRICS_TOKEN: "dawah-local-metrics-token-placeholder-value",
      }),
    ).toThrow(/METRICS_TOKEN/);
    expect(
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        METRICS_ENABLED: "true",
        METRICS_TOKEN: "prod-metrics-token-7f3a9c2e8d4f1a6b5c",
      }),
    ).toMatchObject({ METRICS_ENABLED: true });
  });

  it("requires a remote HTTPS Sentry DSN when error reporting is configured", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        SENTRY_DSN: "http://key@localhost:9000/1",
      }),
    ).toThrow(/SENTRY_DSN/);
    expect(
      validateWorkerEnvironment({
        ...safeProductionWorkerEnvironment,
        SENTRY_DSN: "https://key@errors.dawah.sa/1",
        SENTRY_SAMPLE_RATE: "0.25",
      }),
    ).toMatchObject({ SENTRY_SAMPLE_RATE: 0.25 });
  });

  it("keeps human-readable local logging available", () => {
    expect(
      validateApiEnvironment({
        NODE_ENV: "development",
        DAWAH_ENV: "local",
        DATABASE_URL: "postgresql://dawah:dawah@localhost:5433/dawah",
        REDIS_URL: "redis://localhost:6379",
        STORAGE_ENDPOINT: "http://localhost:7070",
        STORAGE_REGION: "us-east-1",
        STORAGE_ACCESS_KEY_ID: "dawah-local-access-key",
        STORAGE_SECRET_ACCESS_KEY: "dawah-local-secret-key",
        STORAGE_PRIVATE_BUCKET: "dawah-private",
        STORAGE_FORCE_PATH_STYLE: "true",
        LOG_FORMAT: "pretty",
        LOG_LEVEL: "debug",
        METRICS_ENABLED: "true",
      }),
    ).toMatchObject({
      LOG_FORMAT: "pretty",
      LOG_LEVEL: "debug",
      METRICS_ENABLED: true,
    });
  });

  it("defaults sign-in code delivery to off and to the Authentica SMS channel", () => {
    expect(validateApiEnvironment(safeProductionApiEnvironment)).toMatchObject({
      AUTHENTICA_OTP_ENABLED: false,
      AUTHENTICA_BASE_URL: "https://api.authentica.sa/api/v2",
      AUTHENTICA_OTP_METHOD: "sms",
      AUTHENTICA_OTP_TEMPLATE_ID: 1,
      AUTHENTICA_REQUEST_TIMEOUT_MS: 2_500,
    });
  });

  it("accepts enabled sign-in code delivery with a real key and hook secret", () => {
    expect(
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        AUTHENTICA_OTP_ENABLED: "true",
        AUTHENTICA_API_KEY: "$2y$10$prod-authentica-key-7f3a9c2e8d4f",
        AUTHENTICA_OTP_METHOD: "sms",
        AUTHENTICA_OTP_TEMPLATE_ID: "31",
        SUPABASE_SEND_SMS_HOOK_SECRET: `v1,whsec_${Buffer.from(
          "prod-supabase-send-sms-hook-secret",
        ).toString("base64")}`,
      }),
    ).toMatchObject({
      AUTHENTICA_OTP_ENABLED: true,
      AUTHENTICA_OTP_METHOD: "sms",
      AUTHENTICA_OTP_TEMPLATE_ID: 31,
    });
  });

  it("refuses enabled sign-in code delivery without an authenticated hook", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        AUTHENTICA_OTP_ENABLED: "true",
        AUTHENTICA_API_KEY: "$2y$10$prod-authentica-key-7f3a9c2e8d4f",
      }),
    ).toThrow(/SUPABASE_SEND_SMS_HOOK_SECRET/);

    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        AUTHENTICA_OTP_ENABLED: "true",
        AUTHENTICA_API_KEY: "$2y$10$prod-authentica-key-7f3a9c2e8d4f",
        SUPABASE_SEND_SMS_HOOK_SECRET: "v1,whsec_short",
      }),
    ).toThrow(/SUPABASE_SEND_SMS_HOOK_SECRET/);
  });

  it("refuses a deployed placeholder Authentica credential", () => {
    expect(() =>
      validateApiEnvironment({
        ...safeProductionApiEnvironment,
        AUTHENTICA_OTP_ENABLED: "true",
        SUPABASE_SEND_SMS_HOOK_SECRET: `v1,whsec_${Buffer.from(
          "prod-supabase-send-sms-hook-secret",
        ).toString("base64")}`,
      }),
    ).toThrow(/AUTHENTICA_API_KEY/);
  });
});
