import { z } from "zod";

export const deploymentEnvironments = [
  "local",
  "test",
  "staging",
  "production",
] as const;

export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];
export type NodeEnvironment = "development" | "test" | "production";

export interface ApiEnvironment {
  NODE_ENV: NodeEnvironment;
  DAWAH_ENV: DeploymentEnvironment;
  DATABASE_URL: string;
  REDIS_URL: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_AUDIENCE: string;
  DAWAH_DEV_AUTH_BYPASS: boolean;
  API_PORT: number;
  API_CORS_ORIGINS: string[];
  API_BODY_LIMIT_BYTES: number;
  API_READY_TIMEOUT_MS: number;
}

export interface WorkerEnvironment {
  NODE_ENV: NodeEnvironment;
  DAWAH_ENV: DeploymentEnvironment;
  REDIS_URL: string;
  QUEUE_PREFIX: string;
  WORKER_PORT: number;
  WORKER_READY_TIMEOUT_MS: number;
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

const runtimeShape = {
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DAWAH_ENV: z.enum(deploymentEnvironments),
} as const;

const apiEnvironmentSchema = z
  .object({
    ...runtimeShape,
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
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
  })
  .passthrough()
  .superRefine((environment, context) => {
    validateRuntimeMode(environment, context);
    validateDevelopmentBypass(
      environment.DAWAH_DEV_AUTH_BYPASS,
      environment,
      "DAWAH_DEV_AUTH_BYPASS",
      context,
    );

    if (!isDeployedEnvironment(environment.DAWAH_ENV)) return;

    validateRemotePostgres(environment.DATABASE_URL, context);
    validateSecureRedis(environment.REDIS_URL, context);
    validateRequiredRemoteHttpsUrl(
      environment.SUPABASE_URL,
      "SUPABASE_URL",
      context,
    );

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
  });

const workerEnvironmentSchema = z
  .object({
    ...runtimeShape,
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    QUEUE_PREFIX: optionalText,
    WORKER_PORT: port.default(4_001),
    WORKER_READY_TIMEOUT_MS: positiveInteger.max(30_000).default(2_000),
  })
  .passthrough()
  .superRefine((environment, context) => {
    validateRuntimeMode(environment, context);
    if (isDeployedEnvironment(environment.DAWAH_ENV)) {
      validateSecureRedis(environment.REDIS_URL, context);
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
