import { spawn } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
const databaseUrl = process.env.DATABASE_URL;

if (!pnpmCli) throw new Error("Run this command through pnpm.");

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.test.example to .env.test or provide CI test variables.",
  );
}

const databaseName = new URL(databaseUrl).pathname
  .replace(/^\//, "")
  .toLowerCase();
const databaseHostname = new URL(databaseUrl).hostname
  .toLowerCase()
  .replace(/^\[|\]$/g, "");
if (
  process.env.NODE_ENV !== "test" ||
  process.env.DAWAH_ENV !== "test" ||
  databaseName !== "dawah_test" ||
  !new Set(["localhost", "127.0.0.1", "::1"]).has(databaseHostname)
) {
  throw new Error(
    "Integration tests require the local dawah_test database with NODE_ENV=test and DAWAH_ENV=test.",
  );
}

await run(process.execPath, [pnpmCli, "migrate"]);
await run(process.execPath, [
  pnpmCli,
  "--filter",
  "@dawah/api",
  "test:integration",
]);

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
