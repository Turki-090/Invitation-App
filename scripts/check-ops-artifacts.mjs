#!/usr/bin/env node
/**
 * Validates the operational artifacts against the code that produces them.
 *
 * Alert rules and dashboards are the part of the platform that fails silently:
 * a renamed metric leaves a rule that never fires, and nobody notices until an
 * incident goes unalerted. This check makes that failure loud by parsing the
 * metric names out of `packages/observability/src/platform-metrics.ts` and
 * rejecting any PromQL selector that does not resolve to one of them.
 *
 * It also enforces that every alert names a severity and an existing runbook,
 * because an alert without a documented response is a page with no next step.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const metricsSource = path.join(
  repositoryRoot,
  "packages/observability/src/platform-metrics.ts",
);
const alertsFile = path.join(repositoryRoot, "ops/prometheus/alerts.yaml");
const dashboardFile = path.join(
  repositoryRoot,
  "ops/grafana/dawah-overview.json",
);

const problems = [];

const declaredMetrics = readDeclaredMetrics();
if (declaredMetrics.size === 0) {
  problems.push(
    `No metric definitions were found in ${path.relative(repositoryRoot, metricsSource)}.`,
  );
}

const alerts = YAML.parse(readFileSync(alertsFile, "utf8"));
checkAlerts(alerts);

const dashboard = JSON.parse(readFileSync(dashboardFile, "utf8"));
checkDashboard(dashboard);

if (problems.length > 0) {
  console.error("Operational artifacts are out of step with the code:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.info(
    `Operational artifacts verified against ${declaredMetrics.size} declared metrics.`,
  );
}

/**
 * Reads the metric names the platform actually registers, plus the suffixed
 * series a histogram expands into at scrape time.
 */
function readDeclaredMetrics() {
  const source = readFileSync(metricsSource, "utf8");
  const names = new Set();
  const pattern =
    /registry\.(counter|gauge|histogram)\(\s*"([a-zA-Z_:][a-zA-Z0-9_:]*)"/g;
  for (const match of source.matchAll(pattern)) {
    const [, kind, name] = match;
    names.add(name);
    if (kind === "histogram") {
      names.add(`${name}_bucket`);
      names.add(`${name}_sum`);
      names.add(`${name}_count`);
    }
  }
  return names;
}

function checkAlerts(document) {
  const groups = document?.groups ?? [];
  if (groups.length === 0)
    problems.push("alerts.yaml declares no rule groups.");

  for (const group of groups) {
    for (const rule of group.rules ?? []) {
      const where = `alert ${rule.alert ?? "<unnamed>"}`;
      if (!rule.alert) {
        problems.push(`${group.name}: a rule has no alert name.`);
        continue;
      }
      checkExpression(rule.expr ?? "", where);

      const severity = rule.labels?.severity;
      if (severity !== "page" && severity !== "ticket") {
        problems.push(`${where}: severity must be "page" or "ticket".`);
      }
      if (!rule.annotations?.summary) {
        problems.push(`${where}: missing a summary annotation.`);
      }

      const runbook = rule.annotations?.runbook;
      if (!runbook) {
        problems.push(`${where}: missing a runbook annotation.`);
      } else if (!existsSync(path.join(repositoryRoot, runbook))) {
        problems.push(`${where}: runbook ${runbook} does not exist.`);
      }
    }
  }
}

function checkDashboard(document) {
  if (!document.uid || !document.title) {
    problems.push("The dashboard is missing a uid or title.");
  }
  for (const panel of document.panels ?? []) {
    for (const target of panel.targets ?? []) {
      checkExpression(target.expr ?? "", `panel "${panel.title}"`);
    }
  }
}

/**
 * Every `dawah_`-prefixed identifier in an expression must be a declared
 * series. The `up` metric and PromQL functions are deliberately out of scope:
 * only the platform's own names can drift.
 */
function checkExpression(expression, where) {
  for (const match of expression.matchAll(/\bdawah_[a-zA-Z0-9_]*/g)) {
    const name = match[0];
    if (!declaredMetrics.has(name)) {
      problems.push(`${where}: references undeclared metric ${name}.`);
    }
  }
}
