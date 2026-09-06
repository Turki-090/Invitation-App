import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const git = process.platform === "win32" ? "git.exe" : "git";
const tracked = execFileSync(git, ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0");
const artifactDirectory =
  /(^|\/)(node_modules|\.next|\.turbo|dist|coverage)(\/|$)/;
const artifactFile = /(^|\/)(?:[^/]+\.tsbuildinfo|[^/]+\.log)$/;
const localEnvironmentFile = /(^|\/)\.env(?:\..+)?$/;
const forbidden = tracked.filter(
  (path) =>
    path &&
    existsSync(path) &&
    (artifactDirectory.test(path) ||
      artifactFile.test(path) ||
      (localEnvironmentFile.test(path) && !path.endsWith(".example"))),
);

if (forbidden.length > 0) {
  console.error(
    "Generated or local-only artifacts are tracked:\n" + forbidden.join("\n"),
  );
  process.exitCode = 1;
} else {
  console.info("No generated build or local-only artifacts are tracked.");
}
