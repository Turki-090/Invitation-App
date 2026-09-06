import { spawn } from "node:child_process";

const docker = process.platform === "win32" ? "docker.exe" : "docker";
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error(
    "DATABASE_URL and REDIS_URL are required for container smoke tests.",
  );
}

const suffix = `${Date.now()}-${process.pid}`;
const apiName = `dawah-api-stage1-${suffix}`;
const workerName = `dawah-worker-stage1-${suffix}`;
const createdContainers = [];

try {
  await run([
    "run",
    "--detach",
    "--name",
    apiName,
    "--add-host",
    "host.docker.internal:host-gateway",
    "--publish",
    "127.0.0.1:4200:4200",
    "--env",
    "NODE_ENV=test",
    "--env",
    "DAWAH_ENV=test",
    "--env",
    `DATABASE_URL=${containerReachableUrl(databaseUrl)}`,
    "--env",
    `REDIS_URL=${containerReachableUrl(redisUrl)}`,
    "--env",
    "API_PORT=4200",
    "--env",
    "API_CORS_ORIGINS=http://127.0.0.1:3100",
    "--env",
    "DAWAH_DEV_AUTH_BYPASS=false",
    "dawah-api:stage1",
  ]);
  createdContainers.push(apiName);

  await run([
    "run",
    "--detach",
    "--name",
    workerName,
    "--add-host",
    "host.docker.internal:host-gateway",
    "--publish",
    "127.0.0.1:4201:4201",
    "--env",
    "NODE_ENV=test",
    "--env",
    "DAWAH_ENV=test",
    "--env",
    `REDIS_URL=${containerReachableUrl(redisUrl)}`,
    "--env",
    `QUEUE_PREFIX=dawah:container-smoke:${suffix}`,
    "--env",
    "WORKER_PORT=4201",
    "dawah-worker:stage1",
  ]);
  createdContainers.push(workerName);

  await Promise.all([
    waitFor("containerized API", "http://127.0.0.1:4200/api/v1/health/ready"),
    waitFor("containerized worker", "http://127.0.0.1:4201/health/ready"),
  ]);
  await Promise.all([waitForHealthy(apiName), waitForHealthy(workerName)]);
  console.info("Production API and worker container smoke checks passed.");
} catch (error) {
  for (const name of createdContainers) {
    const logs = await run(["logs", name], true).catch(() => "");
    console.error(`\n--- ${name} logs ---\n${logs}`);
  }
  throw error;
} finally {
  for (const name of createdContainers.reverse()) {
    await run(["rm", "--force", name], true).catch(() => undefined);
  }
}

function containerReachableUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

async function waitFor(name, url) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not become ready.`);
}

async function waitForHealthy(name) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const status = (
      await run(["inspect", "--format", "{{.State.Health.Status}}", name], true)
    ).trim();
    if (status === "healthy") return;
    if (status === "unhealthy") throw new Error(`${name} became unhealthy.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not report healthy.`);
}

function run(arguments_, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, arguments_, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const output = [];
    if (capture) {
      child.stdout.on("data", (chunk) => output.push(chunk.toString()));
      child.stderr.on("data", (chunk) => output.push(chunk.toString()));
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output.join(""));
      else reject(new Error(`docker ${arguments_[0]} exited with ${code}.`));
    });
  });
}
