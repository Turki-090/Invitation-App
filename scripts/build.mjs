import { spawn } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("Run this command through pnpm.");

const deploymentEnvironment = process.env.DAWAH_ENV?.trim() || "local";
const buildEnvironment = {
  ...process.env,
  NODE_ENV: "production",
  DAWAH_ENV: deploymentEnvironment,
  ...(deploymentEnvironment === "local"
    ? {
        DAWAH_DEV_AUTH_BYPASS: "false",
        NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS: "false",
      }
    : {}),
};

const build = spawn(process.execPath, [pnpmCli, "build:all"], {
  env: buildEnvironment,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  build.once("error", reject);
  build.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
