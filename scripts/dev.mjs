import { spawn } from "node:child_process";

const docker = process.platform === "win32" ? "docker.exe" : "docker";
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) throw new Error("Run this command through pnpm.");

assertSafeLocalEnvironment();

await run(docker, [
  "compose",
  "up",
  "-d",
  "--wait",
  "postgres",
  "redis",
  "object-storage",
  "object-storage-init",
]);
await run(process.execPath, [pnpmCli, "generate"]);
await run(process.execPath, [pnpmCli, "migrate"]);

const applications = spawn(process.execPath, [pnpmCli, "dev:apps"], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => applications.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  applications.once("error", reject);
  applications.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;

function assertSafeLocalEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    throw new Error(
      "DATABASE_URL and REDIS_URL are required for local development.",
    );
  }

  const database = new URL(databaseUrl);
  const redis = new URL(redisUrl);
  const databaseName = database.pathname.replace(/^\//, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DAWAH_ENV !== "local" ||
    !localHosts.has(database.hostname.toLowerCase()) ||
    !localHosts.has(redis.hostname.toLowerCase()) ||
    databaseName !== "dawah"
  ) {
    throw new Error(
      "pnpm dev may migrate only the local dawah database in the local development environment.",
    );
  }
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} ${arguments_.join(" ")} exited with ${code}.`),
        );
    });
  });
}
