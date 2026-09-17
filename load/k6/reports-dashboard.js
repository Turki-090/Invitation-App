// Stage 9 read paths under sustained virtual users: the event report, the
// event-day check-in dashboard, and the manual check-in search that shares the
// dashboard screen.
//
// Run:
//   k6 run load/k6/reports-dashboard.js
//   k6 run -e VUS=50 -e DURATION=5m load/k6/reports-dashboard.js

import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { eventPath, flag, integer, text } from "./lib/config.js";
import { apiGet, describe, json } from "./lib/http.js";
import {
  dashboardViolations,
  firstViolation,
  reportViolations,
} from "./lib/checks.js";

const VUS = integer("VUS", 25);
const RAMP = text("RAMP", "30s");
const DURATION = text("DURATION", "3m");
const THINK_TIME = integer("THINK_TIME_MS", 1000);
const SEARCH = flag("SEARCH", true);
const SEARCH_TERM = text("SEARCH_TERM", "Load Guest");
const SEARCH_LIMIT = integer("SEARCH_LIMIT", 20);

const reportViolationCount = new Counter("report_invariant_violations");
const dashboardViolationCount = new Counter("dashboard_invariant_violations");

function thresholds() {
  const values = {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // The report recalculates eight aggregates inside one repeatable-read
    // transaction and materialises the latest invitation message per group.
    // 1.5s at p95 is a ceiling that still catches a regression into a
    // per-request sequential scan, not a product service level.
    "http_req_duration{endpoint:report}": ["p(95)<1500", "p(99)<3000"],
    // The dashboard is one grouped aggregate, one audit count and one indexed
    // 50-row tail, so it should stay comfortably below the report.
    "http_req_duration{endpoint:checkin_dashboard}": [
      "p(95)<1000",
      "p(99)<2000",
    ],
    report_invariant_violations: [{ threshold: "count==0", abortOnFail: true }],
    dashboard_invariant_violations: [
      { threshold: "count==0", abortOnFail: true },
    ],
  };
  if (SEARCH) {
    // Manual search runs a case-insensitive substring match that no btree index
    // can serve, then sorts the whole match set before taking the page.
    values["http_req_duration{endpoint:checkin_search}"] = [
      "p(95)<1500",
      "p(99)<3000",
    ];
  }
  return values;
}

export const options = {
  scenarios: {
    dashboards: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: RAMP, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: thresholds(),
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

export default function dashboards() {
  const report = apiGet(eventPath("/reports"), {
    tags: { endpoint: "report" },
  });
  const reportBody = json(report);
  const reportProblems =
    report.status === 200 ? reportViolations(reportBody) : [];
  if (reportProblems.length > 0)
    reportViolationCount.add(reportProblems.length);
  check(report, {
    "report responds 200": (response) => response.status === 200,
    "report totals reconcile": () => reportProblems.length === 0,
  });
  if (report.status !== 200) {
    console.error(`report failed: ${describe(report)}`);
  } else if (reportProblems.length > 0) {
    console.error(`report invariant broken: ${firstViolation(reportProblems)}`);
  }

  const dashboard = apiGet(eventPath("/check-ins/dashboard"), {
    tags: { endpoint: "checkin_dashboard" },
  });
  const dashboardBody = json(dashboard);
  const dashboardProblems =
    dashboard.status === 200 ? dashboardViolations(dashboardBody) : [];
  if (dashboardProblems.length > 0) {
    dashboardViolationCount.add(dashboardProblems.length);
  }
  check(dashboard, {
    "check-in dashboard responds 200": (response) => response.status === 200,
    "check-in dashboard totals reconcile": () => dashboardProblems.length === 0,
  });
  if (dashboard.status !== 200) {
    console.error(`check-in dashboard failed: ${describe(dashboard)}`);
  }

  if (SEARCH) {
    const query = `?query=${encodeURIComponent(SEARCH_TERM)}&limit=${SEARCH_LIMIT}`;
    const search = apiGet(eventPath(`/check-ins/search${query}`), {
      tags: { endpoint: "checkin_search" },
    });
    check(search, {
      "check-in search responds 200": (response) => response.status === 200,
      "check-in search returns at most the requested page": (response) => {
        if (response.status !== 200) return false;
        const body = json(response);
        return (
          Boolean(body) &&
          Array.isArray(body.items) &&
          body.items.length <= SEARCH_LIMIT
        );
      },
    });
    if (search.status !== 200) {
      console.error(`check-in search failed: ${describe(search)}`);
    }
  }

  if (THINK_TIME > 0) sleep(THINK_TIME / 1000);
}
