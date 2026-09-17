// Asynchronous 20,000-row guest-list export, end to end: request the job, poll
// until it reaches a terminal state, then fetch the signed private download.
//
// The worker processes the export queue with a concurrency of one, so the XLSX
// and CSV jobs are requested one after the other. Queueing them together would
// only measure the second job waiting for the first.
//
// Run:
//   k6 run load/k6/export-20k.js
//   k6 run -e FORMATS=CSV -e PRESET=CHECK_IN_LIST load/k6/export-20k.js

import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { API_ORIGIN, eventPath, integer, text } from "./lib/config.js";
import { absoluteGet, apiGet, apiPost, describe, json } from "./lib/http.js";

const FORMATS = text("FORMATS", "XLSX,CSV")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter((value) => value.length > 0);
const PRESET = text("PRESET", "FULL_GUEST_LIST");
const MIN_ROWS = integer("MIN_ROWS", 19000);
const POLL_INTERVAL_MS = integer("POLL_INTERVAL_MS", 2000);
const JOB_TIMEOUT_MS = integer("JOB_TIMEOUT_MS", 600000);
const MAX_DURATION = text("MAX_DURATION", "20m");

const CONTENT_TYPES = {
  CSV: "text/csv",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const endToEnd = new Trend("export_end_to_end_seconds");
const queueWait = new Trend("export_queue_wait_seconds");
const completed = new Rate("export_completed");
const downloaded = new Rate("export_downloaded");

export const options = {
  scenarios: {
    export_twenty_thousand: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: MAX_DURATION,
    },
  },
  thresholds: {
    // Every requested export must finish and every completed export must be
    // downloadable. Anything less is a failure, not a slow run.
    export_completed: ["rate==1"],
    export_downloaded: ["rate==1"],
    checks: ["rate==1"],
    // Wall-clock ceilings for 20,000 rows read through 40 keyset pages of 500,
    // serialised, checksummed and uploaded to private storage. They are set to
    // catch a collapse into per-row work, not to express a product target.
    "export_end_to_end_seconds{format:XLSX}": ["p(95)<240"],
    "export_end_to_end_seconds{format:CSV}": ["p(95)<180"],
    // The download itself is one signed, checksum-verified object read.
    "http_req_duration{endpoint:export_download}": ["p(95)<30000"],
    "http_req_failed{endpoint:export_download}": ["rate==0"],
    "http_req_failed{endpoint:export_create}": ["rate==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "max"],
};

function requestExport(format) {
  const response = apiPost(
    eventPath("/exports"),
    { format, preset: PRESET },
    { tags: { endpoint: "export_create", format } },
  );
  const accepted = check(response, {
    "export request accepted with 202": (result) => result.status === 202,
  });
  if (!accepted) {
    console.error(`export request for ${format} failed: ${describe(response)}`);
    return null;
  }
  return json(response);
}

function pollUntilTerminal(format, exportJobId, startedAt) {
  const deadline = startedAt + JOB_TIMEOUT_MS;
  let job = null;
  let processingSeen = false;
  while (Date.now() < deadline) {
    sleep(POLL_INTERVAL_MS / 1000);
    const response = apiGet(eventPath(`/exports/${exportJobId}`), {
      tags: { endpoint: "export_poll", format },
    });
    if (response.status !== 200) {
      console.error(`export poll for ${format} failed: ${describe(response)}`);
      return null;
    }
    job = json(response);
    if (!job) return null;
    if (!processingSeen && job.processingAt !== null) {
      processingSeen = true;
      queueWait.add((Date.now() - startedAt) / 1000, { format });
    }
    if (job.status !== "QUEUED" && job.status !== "PROCESSING") return job;
  }
  console.error(
    `export ${exportJobId} (${format}) was still ${job ? job.status : "unknown"} after ${JOB_TIMEOUT_MS}ms`,
  );
  return job;
}

function downloadExport(format, job) {
  const output = job.output;
  const present = check(job, {
    "completed export carries a signed download": () =>
      Boolean(output && output.downloadUrl && output.byteSize > 0),
  });
  if (!present) {
    downloaded.add(false, { format });
    return;
  }
  // XLSX is binary, so the body must not be decoded as text before it is sized.
  const response = absoluteGet(`${API_ORIGIN}${output.downloadUrl}`, {
    responseType: "binary",
    tags: { endpoint: "export_download", format },
  });
  const expectedType = CONTENT_TYPES[format];
  const ok = check(response, {
    "export download responds 200": (result) => result.status === 200,
    "export download returns the whole file": (result) =>
      result.status === 200 && result.body.byteLength === output.byteSize,
    "export download declares the requested content type": (result) => {
      const header = result.headers["Content-Type"] || "";
      return expectedType === undefined || header.indexOf(expectedType) === 0;
    },
    "export download is marked as an attachment": (result) =>
      (result.headers["Content-Disposition"] || "").indexOf("attachment;") ===
      0,
  });
  downloaded.add(ok, { format });
  if (!ok)
    console.error(
      `export download for ${format} failed: ${describe(response)}`,
    );
}

function runFormat(format) {
  const startedAt = Date.now();
  const created = requestExport(format);
  if (!created) {
    completed.add(false, { format });
    downloaded.add(false, { format });
    return;
  }

  const job = pollUntilTerminal(format, created.id, startedAt);
  const finishedAt = Date.now();
  const isComplete = Boolean(job) && job.status === "COMPLETED";
  completed.add(isComplete, { format });
  check(job, {
    "export reaches COMPLETED": () => isComplete,
    "export counts every active invitation group": () =>
      isComplete && job.rowCount >= MIN_ROWS,
    "export reports no failure": () => Boolean(job) && job.failureCode === null,
  });
  if (!isComplete) {
    downloaded.add(false, { format });
    return;
  }

  endToEnd.add((finishedAt - startedAt) / 1000, { format });
  console.info(
    `${format} export completed: ${job.rowCount} rows in ${((finishedAt - startedAt) / 1000).toFixed(1)}s`,
  );
  downloadExport(format, job);
}

export default function exportTwentyThousand() {
  for (const format of FORMATS) runFormat(format);
}
