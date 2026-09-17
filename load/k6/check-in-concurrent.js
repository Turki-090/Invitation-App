// Concurrent event-day check-in against a small, deliberately contended set of
// invitation groups, followed by a replay of every idempotency key the first
// pass used.
//
// The two passes never share state. Each idempotency key and its request body
// are pure functions of `RUN_ID` and `exec.scenario.iterationInTest`, so the
// replay pass rebuilds exactly the keys and payloads the first pass sent. A
// replayed key with a different body would be rejected as a reused key, which
// is why the body is derived the same way.
//
// Run:
//   k6 run load/k6/check-in-concurrent.js
//   k6 run -e RUN_ID=run2 -e VUS=100 -e ITERATIONS=2000 load/k6/check-in-concurrent.js
//
// Use a new RUN_ID for every run against a database that was not reset, or the
// first pass replays the previous run's keys instead of recording arrivals.

import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import { eventPath, integer, text } from "./lib/config.js";
import { apiPost, describe, errorCode, json } from "./lib/http.js";
import { checkInTargetIds } from "./lib/fixtures.js";
import { deviceId, idempotencyKey } from "./lib/ids.js";
import { checkInResultViolations, firstViolation } from "./lib/checks.js";

const VUS = integer("VUS", 50);
// The default deliberately exceeds the total confirmed attendance of the target
// groups, which the seed sets to 20 groups of 60. Crossing that boundary is the
// point: once a group fills up the service must answer ALREADY_CHECKED_IN with
// no increment instead of counting past the confirmed attendance.
const ITERATIONS = integer("ITERATIONS", 2000);
const PASS_DURATION = text("PASS_DURATION", "3m");
const TARGETS = integer("TARGETS", 20);
const ATTENDEE_COUNT = integer("ATTENDEE_COUNT", 1);

// A 409 is a contract answer here, not a transport failure, so it must not be
// counted as a failed request. Every code is still recorded below.
http.setResponseCallback(http.expectedStatuses(200, 409));

const targets = checkInTargetIds(TARGETS);

const invariantViolations = new Counter("check_in_invariant_violations");
const replayUnflagged = new Counter("check_in_replay_unflagged");
const firstPassReplays = new Counter("check_in_first_pass_replays");
const conflicts = new Counter("check_in_conflicts");
const accepted = new Rate("check_in_accepted");
const replayConfirmed = new Rate("check_in_replay_confirmed");

export const options = {
  scenarios: {
    first_pass: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: PASS_DURATION,
      exec: "firstPass",
      tags: { pass: "first" },
    },
    replay_pass: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: PASS_DURATION,
      // The replay starts when the first pass has had its full window. Keep
      // PASS_DURATION long enough for the first pass to finish its iterations.
      startTime: PASS_DURATION,
      exec: "replayPass",
      tags: { pass: "replay" },
    },
  },
  thresholds: {
    // The invariant the whole scenario exists to defend. Any breach stops the
    // run immediately so the database is left in the state that produced it.
    check_in_invariant_violations: [
      { threshold: "count==0", abortOnFail: true },
    ],
    // A replayed key that succeeds must say so, or a scanner retry silently
    // looks like a fresh arrival. This does not abort, so that a truncated
    // first pass shows up beside it rather than instead of it.
    check_in_replay_unflagged: ["count==0"],
    // The replay is only meaningful if the first pass used every key it was
    // asked to. A truncated first pass makes the replay send keys nobody has
    // seen, which then look like fresh arrivals rather than replays.
    "iterations{pass:first}": [`count>=${ITERATIONS}`],
    // A first-pass request that comes back as a replay means RUN_ID collided
    // with an earlier run; the numbers below it would be meaningless.
    check_in_first_pass_replays: ["count==0"],
    "check_in_accepted{pass:first}": ["rate>0.98"],
    "check_in_replay_confirmed{pass:replay}": ["rate>0.99"],
    // Each check-in is one serializable transaction with a row lock on a
    // contended invitation group, plus up to three retries.
    "http_req_duration{endpoint:check_in}": ["p(95)<2000", "p(99)<5000"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

/** Pure function of the in-test iteration: identical in both passes. */
function attemptFor(sequence) {
  return {
    key: idempotencyKey("ck", sequence),
    body: {
      invitationGroupId: targets[sequence % targets.length],
      attendeeCount: ATTENDEE_COUNT,
      source: sequence % 2 === 0 ? "QR" : "MANUAL",
      deviceId: deviceId((sequence % VUS) + 1),
    },
  };
}

function post(attempt) {
  return apiPost(eventPath("/check-ins"), attempt.body, {
    headers: { "Idempotency-Key": attempt.key },
    tags: { endpoint: "check_in" },
  });
}

function recordInvariants(response) {
  const result = json(response);
  const problems = checkInResultViolations(result);
  if (problems.length > 0) {
    invariantViolations.add(problems.length);
    console.error(`check-in invariant broken: ${firstViolation(problems)}`);
  }
  check(response, {
    "check-in result reconciles": () => problems.length === 0,
  });
  return result;
}

export function firstPass() {
  const attempt = attemptFor(exec.scenario.iterationInTest);
  const response = post(attempt);
  accepted.add(response.status === 200);
  check(response, {
    "check-in responds 200": (result) => result.status === 200,
  });

  if (response.status === 200) {
    const result = recordInvariants(response);
    if (result && result.idempotentReplay === true) {
      firstPassReplays.add(1);
      console.error(
        `first-pass key ${attempt.key} was replayed; choose a new RUN_ID or reset the database`,
      );
    }
    return;
  }

  conflicts.add(1, { code: errorCode(response) });
  console.error(`check-in rejected: ${describe(response)}`);
}

export function replayPass() {
  const attempt = attemptFor(exec.scenario.iterationInTest);
  const response = post(attempt);

  if (response.status === 200) {
    const result = recordInvariants(response);
    const flagged = Boolean(result) && result.idempotentReplay === true;
    replayConfirmed.add(flagged);
    if (!flagged) {
      replayUnflagged.add(1);
      console.error(`replay of ${attempt.key} was not marked idempotentReplay`);
    }
    check(response, {
      "replay is marked idempotentReplay": () => flagged,
    });
    return;
  }

  // The original attempt never completed, so its record is still IN_PROGRESS.
  // That is a first-pass failure, already counted there; record it and move on.
  replayConfirmed.add(false);
  conflicts.add(1, { code: errorCode(response) });
  check(response, {
    "replay responds 200": () => false,
  });
  console.error(`replay rejected: ${describe(response)}`);
}
