// A burst of invitation send-batch launches.
//
// Each iteration claims its own contiguous slice of the seeded sendable band,
// because the database enforces at most one initial INVITATION message per
// invitation group. Two launches over the same slice would be a duplicate-send
// test, not a throughput test, and that case is covered by the replay below.
//
// Every launch is a readiness call followed by a confirmed launch, which is the
// sequence the host UI performs. The optional replay repeats the launch with
// the same Idempotency-Key and asserts that the same batch comes back instead
// of a second one.
//
// Run:
//   k6 run load/k6/send-launch.js
//   k6 run -e VUS=40 -e BATCH_SIZE=50 -e SEND_REPLAY=false load/k6/send-launch.js

import exec from "k6/execution";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import { TEMPLATE_ID, eventPath, flag, integer, text } from "./lib/config.js";
import { apiPost, describe, errorCode, json } from "./lib/http.js";
import { sendableSlice, sendableSliceCount } from "./lib/fixtures.js";
import { idempotencyKey } from "./lib/ids.js";

const BATCH_SIZE = integer("BATCH_SIZE", 20);
const VUS = integer("VUS", 20);
const MAX_DURATION = text("MAX_DURATION", "5m");
const SEND_REPLAY = flag("SEND_REPLAY", true);
const AVAILABLE_SLICES = sendableSliceCount(BATCH_SIZE);
const LAUNCHES = Math.min(
  integer("LAUNCHES", AVAILABLE_SLICES),
  AVAILABLE_SLICES,
);

const accepted = new Rate("send_batch_accepted");
const replayMismatch = new Counter("send_batch_replay_mismatch");
const invariantViolations = new Counter("send_batch_invariant_violations");
const rejections = new Counter("send_batch_rejections");
const messagesQueued = new Counter("send_batch_messages_queued");

export const options = {
  scenarios: {
    launch_burst: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: LAUNCHES,
      maxDuration: MAX_DURATION,
    },
  },
  thresholds: {
    send_batch_accepted: ["rate>0.99"],
    // A replayed Idempotency-Key must return the original batch. A second
    // batch id would mean the same invitations were queued twice.
    send_batch_replay_mismatch: [{ threshold: "count==0", abortOnFail: true }],
    send_batch_invariant_violations: [
      { threshold: "count==0", abortOnFail: true },
    ],
    // Readiness reads the selected invitations, their snapshots and their prior
    // messages; it is the cheaper half of the pair.
    "http_req_duration{endpoint:send_readiness}": ["p(95)<5000"],
    // A launch takes a per-event advisory lock, so concurrent launches for one
    // event serialise by design. The ceiling allows for that queueing while
    // still failing if a launch starts taking tens of seconds.
    "http_req_duration{endpoint:send_batch}": ["p(95)<5000", "p(99)<10000"],
    "http_req_failed{endpoint:send_batch}": ["rate<0.01"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

export function setup() {
  if (AVAILABLE_SLICES === 0) {
    throw new Error(
      `The sendable band cannot serve a slice of ${BATCH_SIZE}. Lower BATCH_SIZE or reseed.`,
    );
  }
  console.info(
    `launching ${LAUNCHES} batches of ${BATCH_SIZE} invitations from ${AVAILABLE_SLICES} available slices`,
  );
}

// The launch returns the batch's current state, and a worker that is already
// consuming the queue may have moved it on before the response is read. What
// the launch must guarantee is that the batch exists, is not already finished,
// and counts exactly the invitations readiness reported.
const LAUNCHED_STATUSES = ["QUEUED", "DISPATCHING", "IN_PROGRESS"];

function batchViolations(batch, expectedMessages) {
  const problems = [];
  if (!batch || typeof batch !== "object")
    return ["response body is not an object"];
  if (!LAUNCHED_STATUSES.includes(batch.status))
    problems.push(`status ${batch.status} is not a launched status`);
  if (batch.totalMessages !== expectedMessages) {
    problems.push(
      `totalMessages ${batch.totalMessages} !== ${expectedMessages}`,
    );
  }
  if (batch.estimatedCreditUnits !== batch.totalMessages) {
    problems.push("estimated credit units do not match the message count");
  }
  return problems;
}

export default function launchBurst() {
  const sequence = exec.scenario.iterationInTest;
  const invitationIds = sendableSlice(sequence, BATCH_SIZE);
  if (invitationIds === null) return;

  const readiness = apiPost(
    eventPath("/sending/readiness"),
    { templateId: TEMPLATE_ID, invitationIds },
    { tags: { endpoint: "send_readiness" } },
  );
  const readinessOk = check(readiness, {
    "send readiness responds 200": (response) => response.status === 200,
  });
  if (!readinessOk) {
    accepted.add(false);
    rejections.add(1, { code: errorCode(readiness), step: "readiness" });
    console.error(`send readiness failed: ${describe(readiness)}`);
    return;
  }
  const summary = json(readiness);
  const readyInvitations = summary ? summary.summary.readyInvitations : 0;
  check(summary, {
    "every selected invitation is ready to send": () =>
      readyInvitations === BATCH_SIZE,
  });
  if (readyInvitations === 0) {
    accepted.add(false);
    rejections.add(1, { code: "NO_READY_INVITATIONS", step: "readiness" });
    console.error(
      `slice ${sequence} has no ready invitations; reseed the load fixtures before launching`,
    );
    return;
  }

  const key = idempotencyKey("send", sequence);
  const payload = {
    templateId: TEMPLATE_ID,
    invitationIds,
    confirmationToken: summary.confirmationToken,
  };
  const launch = apiPost(eventPath("/send-batches"), payload, {
    headers: { "Idempotency-Key": key },
    tags: { endpoint: "send_batch" },
  });
  const launched = check(launch, {
    "send batch accepted with 202": (response) => response.status === 202,
  });
  accepted.add(launched);
  if (!launched) {
    rejections.add(1, { code: errorCode(launch), step: "launch" });
    console.error(`send batch rejected: ${describe(launch)}`);
    return;
  }

  const batch = json(launch);
  const problems = batchViolations(batch, readyInvitations);
  if (problems.length > 0) {
    invariantViolations.add(problems.length);
    console.error(`send batch invariant broken: ${problems[0]}`);
  }
  check(launch, { "send batch totals reconcile": () => problems.length === 0 });
  messagesQueued.add(batch.totalMessages);

  if (!SEND_REPLAY) return;

  const replay = apiPost(eventPath("/send-batches"), payload, {
    headers: { "Idempotency-Key": key },
    tags: { endpoint: "send_batch_replay" },
  });
  const replayed = check(replay, {
    "send batch replay responds 202": (response) => response.status === 202,
  });
  if (!replayed) {
    rejections.add(1, { code: errorCode(replay), step: "replay" });
    console.error(`send batch replay rejected: ${describe(replay)}`);
    return;
  }
  const replayBody = json(replay);
  const sameBatch = Boolean(replayBody) && replayBody.id === batch.id;
  if (!sameBatch) {
    replayMismatch.add(1);
    console.error(
      `replayed key ${key} produced batch ${replayBody ? replayBody.id : "none"} instead of ${batch.id}`,
    );
  }
  check(replay, {
    "send batch replay returns the original batch": () => sameBatch,
  });
}
