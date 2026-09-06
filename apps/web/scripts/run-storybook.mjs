import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(directory, "../../../.env.example"));

const executable = resolve(
  directory,
  "../node_modules/storybook/dist/bin/dispatcher.js",
);
const result = spawnSync(
  process.execPath,
  [executable, ...process.argv.slice(2)],
  {
    env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
