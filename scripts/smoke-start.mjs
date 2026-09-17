import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error(
    "DATABASE_URL and REDIS_URL are required for the startup smoke test.",
  );
}

const metricsToken = "dawah-smoke-metrics-scrape-token-value";

const smokeEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  DAWAH_ENV: "test",
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  QUEUE_PREFIX: `dawah:smoke:${process.pid}`,
  API_PORT: "4100",
  LOG_LEVEL: "warn",
  LOG_FORMAT: "json",
  METRICS_ENABLED: "true",
  METRICS_TOKEN: metricsToken,
  API_CORS_ORIGINS: "http://127.0.0.1:3100",
  API_BODY_LIMIT_BYTES: "1048576",
  API_READY_TIMEOUT_MS: "3000",
  WORKER_PORT: "4101",
  WORKER_READY_TIMEOUT_MS: "3000",
  DAWAH_DEV_AUTH_BYPASS: "false",
  NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS: "false",
};

const processes = [
  start("api", [join(repositoryRoot, "apps/api/dist/main.js")], repositoryRoot),
  start(
    "worker",
    [join(repositoryRoot, "apps/worker/dist/main.js")],
    repositoryRoot,
  ),
  start(
    "web",
    [
      join(repositoryRoot, "apps/web/node_modules/next/dist/bin/next"),
      "start",
      "-p",
      "3100",
    ],
    join(repositoryRoot, "apps/web"),
  ),
];

try {
  await Promise.all([
    waitFor("API liveness", "http://127.0.0.1:4100/api/v1/health/live"),
    waitFor("API readiness", "http://127.0.0.1:4100/api/v1/health/ready"),
    waitFor("worker liveness", "http://127.0.0.1:4101/health/live"),
    waitFor("worker readiness", "http://127.0.0.1:4101/health/ready"),
    waitFor("web application", "http://127.0.0.1:3100/"),
  ]);
  await verifyOpenApiRuntime();
  await verifyObservabilitySurface();
  console.info("Web, API, and worker startup smoke checks passed.");
} catch (error) {
  for (const processInfo of processes) {
    console.error(
      `\n--- ${processInfo.name} output ---\n${processInfo.output.join("")}`,
    );
  }
  throw error;
} finally {
  await Promise.all(processes.map(stop));
}

function start(name, arguments_, cwd) {
  const child = spawn(process.execPath, arguments_, {
    cwd,
    env: smokeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  return { name, child, output };
}

async function waitFor(name, url) {
  const deadline = Date.now() + 45_000;
  let lastStatus = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      lastStatus = String(response.status);
      if (response.ok) return;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${name} did not become ready (${lastStatus}).`);
}

/**
 * Confirms at runtime what unit tests can only assert in isolation: both
 * services expose a guarded scrape endpoint that renders real metrics, and the
 * API issues and echoes the correlation identifiers support depends on.
 */
async function verifyObservabilitySurface() {
  const scrapes = [
    ["API", "http://127.0.0.1:4100/api/v1/internal/metrics", "api"],
    ["worker", "http://127.0.0.1:4101/metrics", "worker"],
  ];

  for (const [name, url, service] of scrapes) {
    const unauthorized = await fetch(url);
    if (unauthorized.status !== 401) {
      throw new Error(
        `${name} metrics answered an unauthenticated scrape with ${unauthorized.status}.`,
      );
    }

    const authorized = await fetch(url, {
      headers: { Authorization: `Bearer ${metricsToken}` },
    });
    if (!authorized.ok) {
      throw new Error(
        `${name} metrics rejected an authorized scrape with ${authorized.status}.`,
      );
    }
    const body = await authorized.text();
    if (!body.includes(`dawah_build_info{service="${service}"`)) {
      throw new Error(`${name} metrics did not report its build identity.`);
    }
  }

  const correlated = await fetch("http://127.0.0.1:4100/api/v1/health/live", {
    headers: { "x-correlation-id": "smoke-correlation-1" },
  });
  if (correlated.headers.get("x-correlation-id") !== "smoke-correlation-1") {
    throw new Error(
      "The API did not echo the supplied correlation identifier.",
    );
  }
  if (!correlated.headers.get("x-request-id")) {
    throw new Error("The API did not issue a request identifier.");
  }
}

async function verifyOpenApiRuntime() {
  const document = parse(
    await readFile(join(repositoryRoot, "openapi/openapi.yaml"), "utf8"),
  );
  const serverPath = document.servers?.[0]?.url ?? "";
  const methods = new Set(["get", "post", "put", "patch", "delete"]);

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method)) continue;

      const authenticated =
        (operation.security ?? document.security ?? []).length > 0;
      const request = {
        method: method.toUpperCase(),
        headers: { Accept: "application/json" },
      };
      if (operation.requestBody) {
        request.headers["Content-Type"] = "application/json";
        request.body = "{}";
      }

      const response = await fetch(
        `http://127.0.0.1:4100${serverPath}${path}`,
        request,
      );
      const documentedResponses = operation.responses ?? {};
      if (
        !(String(response.status) in documentedResponses) &&
        !("default" in documentedResponses)
      ) {
        throw new Error(
          `${method.toUpperCase()} ${path} returned undocumented status ${response.status}.`,
        );
      }
      if (authenticated && response.status !== 401) {
        throw new Error(
          `${method.toUpperCase()} ${path} did not enforce its documented bearer authentication.`,
        );
      }
      if (
        !(response.headers.get("content-type") ?? "").includes(
          "application/json",
        )
      ) {
        throw new Error(`${method.toUpperCase()} ${path} did not return JSON.`);
      }

      const body = await response.json();
      if (!authenticated && body.error?.code === "AUTH_REQUIRED") {
        throw new Error(
          `${method.toUpperCase()} ${path} unexpectedly required bearer authentication.`,
        );
      }
      if (operation.operationId === "getReadiness") {
        if (
          body.status !== "ok" ||
          body.checks?.database !== "ok" ||
          body.checks?.redis !== "ok"
        ) {
          throw new Error(
            "API readiness response does not match the OpenAPI contract.",
          );
        }
      }
      if (authenticated && (!body.error?.code || !body.error?.message)) {
        throw new Error(
          `${method.toUpperCase()} ${path} did not return the documented API error envelope.`,
        );
      }
    }
  }
}

async function stop(processInfo) {
  if (processInfo.child.exitCode !== null) return;
  processInfo.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => processInfo.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (processInfo.child.exitCode === null) processInfo.child.kill("SIGKILL");
}
