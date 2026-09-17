import { z } from "zod";

export const deploymentEnvironments = [
  "local",
  "test",
  "staging",
  "production",
] as const;

export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];
export type NodeEnvironment = "development" | "test" | "production";

export interface StorageEnvironment {
  STORAGE_ENDPOINT: string;
  STORAGE_REGION: string;
  STORAGE_ACCESS_KEY_ID: string;
  STORAGE_SECRET_ACCESS_KEY: string;
  STORAGE_PRIVATE_BUCKET: string;
  STORAGE_FORCE_PATH_STYLE: boolean;
}

export interface ImportAndAssetLimitsEnvironment {
  IMPORT_MAX_FILE_BYTES: number;
  IMPORT_MAX_ROWS: number;
  IMPORT_MAX_COLUMNS: number;
  IMPORT_MAX_CELL_CHARACTERS: number;
  ASSET_MAX_FILE_BYTES: number;
  ASSET_MAX_IMAGE_PIXELS: number;
}

/**
 * Logging, metrics, and error-reporting configuration shared by both deployed
 * services. Stage 10 requires a deployed environment to emit machine-readable
 * redacted logs and to guard its metrics endpoint, so the constraints are
 * enforced here rather than left to a deployment checklist.
 */
export interface ObservabilityEnvironment {
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  LOG_FORMAT: "json" | "pretty";
  RELEASE_VERSION?: string;
  METRICS_ENABLED: boolean;
  METRICS_TOKEN?: string;
  SENTRY_DSN?: string;
  SENTRY_SAMPLE_RATE: number;
}

export interface WhatsappMediaEnvironment {
  META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: string;
  META_WHATSAPP_MEDIA_SIGNING_SECRET: string;
  META_WHATSAPP_MEDIA_URL_TTL_SECONDS: number;
}

export interface WhatsappRsvpConfirmationEnvironment {
  META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR: string;
  META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_EN: string;
  META_WHATSAPP_MAX_ATTEMPTS: number;
}

export interface ApiEnvironment
  extends
    StorageEnvironment,
    ImportAndAssetLimitsEnvironment,
    ObservabilityEnvironment,
    WhatsappMediaEnvironment,
    WhatsappRsvpConfirmationEnvironment {
  NODE_ENV: NodeEnvironment;
  DAWAH_ENV: DeploymentEnvironment;
  DATABASE_URL: string;
  REDIS_URL: string;
  QUEUE_PREFIX: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_AUDIENCE: string;
  DAWAH_DEV_AUTH_BYPASS: boolean;
  API_PORT: number;
  API_CORS_ORIGINS: string[];
  API_BODY_LIMIT_BYTES: number;
  API_READY_TIMEOUT_MS: number;
  META_WHATSAPP_APP_SECRET: string;
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
  META_WHATSAPP_PHONE_NUMBER_ID: string;
  EXPORT_DOWNLOAD_SIGNING_SECRET: string;
  EXPORT_DOWNLOAD_URL_TTL_SECONDS: number;
  EXPORT_RETENTION_HOURS: number;
  CHECK_IN_ENABLED: boolean;
  CHECK_IN_TOKEN_SIGNING_SECRET: string;
  BILLING_ENABLED: boolean;
  PAYMENTS_ENABLED: boolean;
  API_THROTTLE_TTL_SECONDS: number;
  API_THROTTLE_LIMIT: number;
}

export interface WorkerEnvironment
  extends
    StorageEnvironment,
    ImportAndAssetLimitsEnvironment,
    ObservabilityEnvironment,
    WhatsappMediaEnvironment,
    WhatsappRsvpConfirmationEnvironment {
  NODE_ENV: NodeEnvironment;
  DAWAH_ENV: DeploymentEnvironment;
  DATABASE_URL: string;
  REDIS_URL: string;
  QUEUE_PREFIX: string;
  WORKER_PORT: number;
  WORKER_READY_TIMEOUT_MS: number;
  META_WHATSAPP_ACCESS_TOKEN: string;
  META_WHATSAPP_PHONE_NUMBER_ID: string;
  META_WHATSAPP_GRAPH_API_VERSION: string;
  META_WHATSAPP_REQUEST_TIMEOUT_MS: number;
  META_WHATSAPP_SEND_CONCURRENCY: number;
  META_WHATSAPP_MAX_SENDS_PER_SECOND: number;
  EXPORT_RETENTION_HOURS: number;
}

export interface WebEnvironment {
  NODE_ENV: NodeEnvironment;
  DAWAH_ENV: DeploymentEnvironment;
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS: boolean;
}

const emptyToUndefined = (value: unknown): unknown =>
  value === "" ? undefined : value;

const environmentBoolean = z.preprocess((value) => {
  if (value === true || value === "true") return true;
  if (
    value === false ||
    value === "false" ||
    value === undefined ||
    value === ""
  )
    return false;
  return value;
}, z.boolean());

const port = z.coerce.number().int().min(1).max(65_535);
const positiveInteger = z.coerce.number().int().positive();
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);
const requiredText = z.string().trim().min(1);

const storageShape = {
  STORAGE_ENDPOINT: z.url({ protocol: /^https?$/ }),
  STORAGE_REGION: requiredText,
  STORAGE_ACCESS_KEY_ID: requiredText,
  STORAGE_SECRET_ACCESS_KEY: requiredText,
  STORAGE_PRIVATE_BUCKET: requiredText,
  STORAGE_FORCE_PATH_STYLE: environmentBoolean,
} as const;

const importAndAssetLimitsShape = {
  IMPORT_MAX_FILE_BYTES: positiveInteger
    .max(16 * 1024 * 1024)
    .default(8 * 1024 * 1024),
  IMPORT_MAX_ROWS: positiveInteger.default(5_000),
  IMPORT_MAX_COLUMNS: positiveInteger.default(64),
  IMPORT_MAX_CELL_CHARACTERS: positiveInteger.default(1_000),
  ASSET_MAX_FILE_BYTES: positiveInteger
    .max(16 * 1024 * 1024)
    .default(8 * 1024 * 1024),
  ASSET_MAX_IMAGE_PIXELS: positiveInteger.default(24_000_000),
} as const;

const whatsappMediaShape = {
  META_WHATSAPP_MEDIA_PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine(isWhatsappMediaApiBaseUrl, {
      message:
        "The WhatsApp media base URL must end in /api/v1 and cannot contain credentials, a query, or a fragment.",
    })
    .default("http://localhost:4000/api/v1"),
  META_WHATSAPP_MEDIA_SIGNING_SECRET: z
    .string()
    .min(32)
    .default("dawah-local-meta-media-signing-secret"),
  META_WHATSAPP_MEDIA_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(60 * 60)
    .default(15 * 60),
} as const;

const whatsappRsvpConfirmationShape = {
  META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_AR: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,255}$/)
    .default("dawah_rsvp_confirmation_ar"),
  META_WHATSAPP_RSVP_CONFIRMATION_TEMPLATE_EN: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,255}$/)
    .default("dawah_rsvp_confirmation_en"),
  META_WHATSAPP_MAX_ATTEMPTS: positiveInteger.max(10).default(5),
} as const;

const exportRetentionShape = {
  EXPORT_RETENTION_HOURS: positiveInteger.max(24 * 30).default(24 * 7),
} as const;

const stage9ApiShape = {
  ...exportRetentionShape,
  EXPORT_DOWNLOAD_SIGNING_SECRET: z
    .string()
    .min(32)
    .default("dawah-local-export-download-signing-secret"),
  EXPORT_DOWNLOAD_URL_TTL_SECONDS: positiveInteger
    .min(60)
    .max(60 * 60)
    .default(5 * 60),
  CHECK_IN_ENABLED: environmentBoolean,
  CHECK_IN_TOKEN_SIGNING_SECRET: z
    .string()
    .min(32)
    .default("dawah-local-check-in-token-signing-secret"),
  BILLING_ENABLED: environmentBoolean,
  PAYMENTS_ENABLED: environmentBoolean,
  /**
   * Request throttling headroom. Event-day check-in puts several scanning
   * devices behind one venue address, so the ceiling has to be tunable per
   * environment rather than compiled in.
   */
  API_THROTTLE_TTL_SECONDS: positiveInteger.min(1).max(3_600).default(60),
  API_THROTTLE_LIMIT: positiveInteger.min(1).max(100_000).default(120),
} as const;

const observabilityShape = {
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /**
   * `pretty` exists for a readable local console. A deployed environment must
   * emit JSON, because the redacted structured line is the only artifact an
   * incident responder and the log pipeline can both rely on.
   */
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  /** Build identity stamped onto logs, metrics, and error reports. */
  RELEASE_VERSION: optionalText,
  METRICS_ENABLED: environmentBoolean,
  METRICS_TOKEN: optionalText,
  SENTRY_DSN: optionalUrl,
  SENTRY_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
} as const;

const runtimeShape = {
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DAWAH_ENV: z.enum(deploymentEnvironments),
} as const;

const apiEnvironmentSchema = z
  .object({
    ...runtimeShape,
    ...storageShape,
    ...importAndAssetLimitsShape,
    ...whatsappMediaShape,
    ...whatsappRsvpConfirmationShape,
    ...observabilityShape,
    ...stage9ApiShape,
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    QUEUE_PREFIX: optionalText,
    SUPABASE_URL: optionalUrl,
    SUPABASE_JWT_AUDIENCE: z.string().trim().min(1).default("authenticated"),
    DAWAH_DEV_AUTH_BYPASS: environmentBoolean,
    API_PORT: port.default(4_000),
    API_CORS_ORIGINS: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((origin) => origin.trim())
              .filter(Boolean)
          : value,
      z.array(z.url()).min(1).default(["http://localhost:3000"]),
    ),
    API_BODY_LIMIT_BYTES: positiveInteger
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),
    API_READY_TIMEOUT_MS: positiveInteger.max(30_000).default(2_000),
    META_WHATSAPP_APP_SECRET: z
      .string()
      .min(16)
      .default("dawah-local-meta-app-secret"),
    META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: z
      .string()
      .min(16)
      .default("dawah-local-meta-verify-token"),
    META_WHATSAPP_PHONE_NUMBER_ID: z
      .string()
      .regex(/^\d{6,32}$/)
      .default("000000000000000"),
  })
  .passthrough()
  .superRefine((environment, context) => {
    validateRuntimeMode(environment, context);
    validateObservability(environment, context);
    validateDevelopmentBypass(
      environment.DAWAH_DEV_AUTH_BYPASS,
      environment,
      "DAWAH_DEV_AUTH_BYPASS",
      context,
    );

    if (environment.PAYMENTS_ENABLED && !environment.BILLING_ENABLED) {
      addIssue(
        context,
        "PAYMENTS_ENABLED",
        "Payment activation requires billing to be enabled.",
      );
    }

    if (!isDeployedEnvironment(environment.DAWAH_ENV)) return;

    validateRemotePostgres(environment.DATABASE_URL, context);
    validateSecureRedis(environment.REDIS_URL, context);
    validateDeployedStorage(environment, context);
    validateRequiredRemoteHttpsUrl(
      environment.SUPABASE_URL,
      "SUPABASE_URL",
      context,
    );
    validateNonPlaceholderSecret(
      environment.META_WHATSAPP_APP_SECRET,
      "META_WHATSAPP_APP_SECRET",
      context,
    );
    validateNonPlaceholderSecret(
      environment.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      context,
    );
    validateRequiredRemoteHttpsUrl(
      environment.META_WHATSAPP_MEDIA_PUBLIC_BASE_URL,
      "META_WHATSAPP_MEDIA_PUBLIC_BASE_URL",
      context,
    );
    validateNonPlaceholderSecret(
      environment.META_WHATSAPP_MEDIA_SIGNING_SECRET,
      "META_WHATSAPP_MEDIA_SIGNING_SECRET",
      context,
    );
    validateNonPlaceholderSecret(
      environment.EXPORT_DOWNLOAD_SIGNING_SECRET,
      "EXPORT_DOWNLOAD_SIGNING_SECRET",
      context,
    );
    validateNonPlaceholderSecret(
      environment.CHECK_IN_TOKEN_SIGNING_SECRET,
      "CHECK_IN_TOKEN_SIGNING_SECRET",
      context,
    );
    if (/^0+$/.test(environment.META_WHATSAPP_PHONE_NUMBER_ID)) {
      addIssue(
        context,
        "META_WHATSAPP_PHONE_NUMBER_ID",
        "A production Meta phone-number ID is required when deployed.",
      );
    }

    for (const origin of environment.API_CORS_ORIGINS) {
      if (!isRemoteHttpsUrl(origin)) {
        addIssue(
          context,
          "API_CORS_ORIGINS",
          "Deployed CORS origins must be explicit remote HTTPS origins.",
        );
        break;
      }
    }
  })
  .transform((environment) => ({
    ...environment,
    QUEUE_PREFIX: environment.QUEUE_PREFIX ?? `dawah:${environment.DAWAH_ENV}`,
  }));

const workerEnvironmentSchema = z
  .object({
    ...runtimeShape,
    ...storageShape,
    ...importAndAssetLimitsShape,
    ...whatsappMediaShape,
    ...whatsappRsvpConfirmationShape,
    ...observabilityShape,
    ...exportRetentionShape,
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    QUEUE_PREFIX: optionalText,
    WORKER_PORT: port.default(4_001),
    WORKER_READY_TIMEOUT_MS: positiveInteger.max(30_000).default(2_000),
    META_WHATSAPP_ACCESS_TOKEN: z
      .string()
      .min(16)
      .default("dawah-local-meta-access-token"),
    META_WHATSAPP_PHONE_NUMBER_ID: z
      .string()
      .regex(/^\d{6,32}$/)
      .default("000000000000000"),
    META_WHATSAPP_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v25.0"),
    META_WHATSAPP_REQUEST_TIMEOUT_MS: positiveInteger
      .max(60_000)
      .default(10_000),
    META_WHATSAPP_SEND_CONCURRENCY: positiveInteger.max(32).default(4),
    META_WHATSAPP_MAX_SENDS_PER_SECOND: positiveInteger.max(80).default(10),
  })
  .passthrough()
  .superRefine((environment, context) => {
    validateRuntimeMode(environment, context);
    validateObservability(environment, context);
    if (isDeployedEnvironment(environment.DAWAH_ENV)) {
      validateRemotePostgres(environment.DATABASE_URL, context);
      validateSecureRedis(environment.REDIS_URL, context);
      validateDeployedStorage(environment, context);
      validateNonPlaceholderSecret(
        environment.META_WHATSAPP_ACCESS_TOKEN,
        "META_WHATSAPP_ACCESS_TOKEN",
        context,
      );
      validateRequiredRemoteHttpsUrl(
        environment.META_WHATSAPP_MEDIA_PUBLIC_BASE_URL,
        "META_WHATSAPP_MEDIA_PUBLIC_BASE_URL",
        context,
      );
      validateNonPlaceholderSecret(
        environment.META_WHATSAPP_MEDIA_SIGNING_SECRET,
        "META_WHATSAPP_MEDIA_SIGNING_SECRET",
        context,
      );
      if (/^0+$/.test(environment.META_WHATSAPP_PHONE_NUMBER_ID)) {
        addIssue(
          context,
          "META_WHATSAPP_PHONE_NUMBER_ID",
          "A production Meta phone-number ID is required when deployed.",
        );
      }
    }
  })
  .transform((environment) => ({
    ...environment,
    QUEUE_PREFIX: environment.QUEUE_PREFIX ?? `dawah:${environment.DAWAH_ENV}`,
  }));

const webEnvironmentSchema = z
  .object({
    ...runtimeShape,
    NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000/api/v1"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalText,
    NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS: environmentBoolean,
  })
  .passthrough()
  .superRefine((environment, context) => {
    validateRuntimeMode(environment, context);
    validateDevelopmentBypass(
      environment.NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS,
      environment,
      "NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS",
      context,
    );

    if (
      Boolean(environment.NEXT_PUBLIC_SUPABASE_URL) !==
      Boolean(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ) {
      addIssue(
        context,
        "NEXT_PUBLIC_SUPABASE_URL",
        "The Supabase URL and anonymous key must be configured together.",
      );
    }

    if (!isDeployedEnvironment(environment.DAWAH_ENV)) return;

    validateRequiredRemoteHttpsUrl(
      environment.NEXT_PUBLIC_API_URL,
      "NEXT_PUBLIC_API_URL",
      context,
    );
    validateRequiredRemoteHttpsUrl(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      "NEXT_PUBLIC_SUPABASE_URL",
      context,
    );
    if (
      !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      looksLikePlaceholder(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ) {
      addIssue(
        context,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "A non-placeholder Supabase anonymous key is required when deployed.",
      );
    }
  });

export function validateApiEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & ApiEnvironment {
  return parseEnvironment(
    apiEnvironmentSchema,
    withRuntimeDefaults(input),
  ) as Record<string, unknown> & ApiEnvironment;
}

export function validateWorkerEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & WorkerEnvironment {
  return parseEnvironment(
    workerEnvironmentSchema,
    withRuntimeDefaults(input),
  ) as Record<string, unknown> & WorkerEnvironment;
}

export function validateWebEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & WebEnvironment {
  return parseEnvironment(
    webEnvironmentSchema,
    withRuntimeDefaults(input),
  ) as Record<string, unknown> & WebEnvironment;
}

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  input: Record<string, unknown>,
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const details = result.error.issues
    .map(
      (issue) => `- ${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("\n");
  throw new Error(`Invalid Dawah environment configuration:\n${details}`);
}

function withRuntimeDefaults(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (input.DAWAH_ENV !== undefined && input.DAWAH_ENV !== "") return input;

  const nodeEnvironment = input.NODE_ENV ?? "development";
  if (nodeEnvironment === "development") {
    return { ...input, DAWAH_ENV: "local" };
  }
  if (nodeEnvironment === "test") {
    return { ...input, DAWAH_ENV: "test" };
  }
  return input;
}

function validateRuntimeMode(
  environment: { NODE_ENV: NodeEnvironment; DAWAH_ENV: DeploymentEnvironment },
  context: z.RefinementCtx,
): void {
  if (
    isDeployedEnvironment(environment.DAWAH_ENV) &&
    environment.NODE_ENV !== "production"
  ) {
    addIssue(
      context,
      "NODE_ENV",
      "Staging and production deployments require NODE_ENV=production.",
    );
  }
}

/**
 * Deployed observability requirements.
 *
 * A staging or production service must emit parseable redacted JSON, must not
 * run at debug level where verbose payloads are most likely to reach the log
 * pipeline, and must not expose an unauthenticated metrics endpoint. An
 * unauthenticated scrape is treated as a configuration error rather than as an
 * accepted default.
 */
function validateObservability(
  environment: ObservabilityEnvironment & { DAWAH_ENV: DeploymentEnvironment },
  context: z.RefinementCtx,
): void {
  if (!isDeployedEnvironment(environment.DAWAH_ENV)) return;

  if (environment.LOG_FORMAT !== "json") {
    addIssue(
      context,
      "LOG_FORMAT",
      "Deployed services must emit structured JSON logs.",
    );
  }
  if (environment.LOG_LEVEL === "debug") {
    addIssue(
      context,
      "LOG_LEVEL",
      "Debug logging is not permitted in a deployed environment.",
    );
  }
  if (environment.METRICS_ENABLED) {
    if (!environment.METRICS_TOKEN || environment.METRICS_TOKEN.length < 32) {
      addIssue(
        context,
        "METRICS_TOKEN",
        "A deployed metrics endpoint requires a bearer token of at least 32 characters.",
      );
    } else {
      validateNonPlaceholderSecret(
        environment.METRICS_TOKEN,
        "METRICS_TOKEN",
        context,
      );
    }
  }
  if (environment.SENTRY_DSN !== undefined) {
    validateRequiredRemoteHttpsUrl(
      environment.SENTRY_DSN,
      "SENTRY_DSN",
      context,
    );
  }
}

function validateDevelopmentBypass(
  enabled: boolean,
  environment: { NODE_ENV: NodeEnvironment; DAWAH_ENV: DeploymentEnvironment },
  path: string,
  context: z.RefinementCtx,
): void {
  if (
    enabled &&
    (environment.NODE_ENV !== "development" ||
      environment.DAWAH_ENV !== "local")
  ) {
    addIssue(
      context,
      path,
      "The development authentication bypass is allowed only in local development.",
    );
  }
}

function validateRemotePostgres(value: string, context: z.RefinementCtx): void {
  const url = new URL(value);
  if (isLoopbackHostname(url.hostname)) {
    addIssue(
      context,
      "DATABASE_URL",
      "Deployed databases cannot use loopback or local hostnames.",
    );
  }
  if (url.username === "dawah" && url.password === "dawah") {
    addIssue(
      context,
      "DATABASE_URL",
      "The documented local database credentials cannot be used when deployed.",
    );
  }
  if (
    !new Set(["require", "verify-ca", "verify-full"]).has(
      url.searchParams.get("sslmode") ?? "",
    )
  ) {
    addIssue(
      context,
      "DATABASE_URL",
      "Deployed PostgreSQL must explicitly require TLS with sslmode.",
    );
  }
}

function validateSecureRedis(value: string, context: z.RefinementCtx): void {
  const url = new URL(value);
  if (url.protocol !== "rediss:" || isLoopbackHostname(url.hostname)) {
    addIssue(
      context,
      "REDIS_URL",
      "Deployed Redis must use a remote rediss:// endpoint.",
    );
  }
}

function validateDeployedStorage(
  environment: Pick<
    StorageEnvironment,
    "STORAGE_ENDPOINT" | "STORAGE_ACCESS_KEY_ID" | "STORAGE_SECRET_ACCESS_KEY"
  >,
  context: z.RefinementCtx,
): void {
  validateRequiredRemoteHttpsUrl(
    environment.STORAGE_ENDPOINT,
    "STORAGE_ENDPOINT",
    context,
  );
  validateNonPlaceholderSecret(
    environment.STORAGE_ACCESS_KEY_ID,
    "STORAGE_ACCESS_KEY_ID",
    context,
  );
  validateNonPlaceholderSecret(
    environment.STORAGE_SECRET_ACCESS_KEY,
    "STORAGE_SECRET_ACCESS_KEY",
    context,
  );
}

function validateNonPlaceholderSecret(
  value: string,
  path: string,
  context: z.RefinementCtx,
): void {
  if (
    looksLikePlaceholder(value) ||
    value.startsWith("dawah-local-") ||
    value.startsWith("dawah-test-")
  ) {
    addIssue(
      context,
      path,
      "Deployed storage credentials must be non-placeholder secrets.",
    );
  }
}

function validateRequiredRemoteHttpsUrl(
  value: string | undefined,
  path: string,
  context: z.RefinementCtx,
): void {
  if (!value || !isRemoteHttpsUrl(value) || looksLikePlaceholder(value)) {
    addIssue(
      context,
      path,
      "A non-placeholder remote HTTPS URL is required when deployed.",
    );
  }
}

function isRemoteHttpsUrl(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "https:" && !isLoopbackHostname(url.hostname);
}

function isWhatsappMediaApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname.replace(/\/+$/, "").endsWith("/api/v1")
    );
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "host.docker.internal" ||
    normalized.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(normalized) ||
    /^::(?:ffff:)?7f[\da-f]{2}:[\da-f]{1,4}$/.test(normalized)
  );
}

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "replace-with",
    "your-project",
    "example.com",
    "example.invalid",
    "changeme",
  ].some((placeholder) => normalized.includes(placeholder));
}

function isDeployedEnvironment(
  environment: DeploymentEnvironment,
): environment is "staging" | "production" {
  return environment === "staging" || environment === "production";
}

function addIssue(
  context: z.RefinementCtx,
  path: string,
  message: string,
): void {
  context.addIssue({ code: "custom", path: [path], message });
}
