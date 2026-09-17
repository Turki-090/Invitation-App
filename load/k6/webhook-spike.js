// Provider webhook spike. The endpoint is unauthenticated, signature verified
// and explicitly exempt from the request throttler, so it is the one path that
// a provider can genuinely flood.
//
// Each request carries a batch of delivery-status callbacks. A configurable
// share of them repeats an identifier that was already sent, which drives the
// duplicate branch that relies on the `webhook_events_provider_event_key`
// unique index rather than the insert path.
//
// Run:
//   k6 run load/k6/webhook-spike.js
//   k6 run -e PEAK_RATE=400 -e SPIKE_DURATION=2m load/k6/webhook-spike.js

import http from "k6/http";
import crypto from "k6/crypto";
import exec from "k6/execution";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  WEBHOOK_APP_SECRET,
  WEBHOOK_PHONE_NUMBER_ID,
  RUN_ID,
  integer,
  text,
} from "./lib/config.js";
import { url, json, describe } from "./lib/http.js";

const BASE_RATE = integer("BASE_RATE", 20);
const PEAK_RATE = integer("PEAK_RATE", 200);
const SPIKE_DURATION = text("SPIKE_DURATION", "1m");
const WARMUP = text("WARMUP", "30s");
const RAMP = text("RAMP", "15s");
const EVENTS_PER_REQUEST = integer("EVENTS_PER_REQUEST", 5);
const DUPLICATE_PERCENT = integer("DUPLICATE_PERCENT", 20);
const PRE_ALLOCATED_VUS = integer("PRE_ALLOCATED_VUS", 50);
const MAX_VUS = integer("MAX_VUS", 400);

const STATUSES = ["sent", "delivered", "read", "failed"];

const acceptedRate = new Rate("webhook_accepted");
const queuedEvents = new Counter("webhook_queued_events");
const duplicateEvents = new Counter("webhook_duplicate_events");
const rejections = new Counter("webhook_rejections");

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: BASE_RATE,
      timeUnit: "1s",
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
      stages: [
        { target: BASE_RATE, duration: WARMUP },
        { target: PEAK_RATE, duration: RAMP },
        { target: PEAK_RATE, duration: SPIKE_DURATION },
        { target: BASE_RATE, duration: RAMP },
        { target: 0, duration: RAMP },
      ],
    },
  },
  thresholds: {
    webhook_accepted: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    // Ingestion is one bulk insert, one selective read, one bulk update and one
    // queue push. It must stay fast enough that the provider does not retry.
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    // k6 drops an iteration when no virtual user is free. A large count means
    // the API could not absorb the arrival rate, not that the script is slow.
    dropped_iterations: ["count<100"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

function statusEvent(sequence, index) {
  // Position in the whole stream, so the duplicate share is exactly
  // DUPLICATE_PERCENT whatever EVENTS_PER_REQUEST is set to.
  const position = sequence * EVENTS_PER_REQUEST + index;
  const duplicate = position % 100 < DUPLICATE_PERCENT;
  const status = STATUSES[position % STATUSES.length];
  const event = {
    id: duplicate
      ? `wamid.${RUN_ID}.repeat.${position % 50}`
      : `wamid.${RUN_ID}.${position}`,
    status,
    timestamp: String(Math.floor(Date.now() / 1000)),
    recipient_id: "966500000000",
  };
  if (status === "failed") {
    event.errors = [{ code: 131026, title: "Message undeliverable" }];
  }
  return event;
}

function payloadFor(sequence) {
  const statuses = [];
  for (let index = 0; index < EVENTS_PER_REQUEST; index += 1) {
    statuses.push(statusEvent(sequence, index));
  }
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "966500000000",
                phone_number_id: WEBHOOK_PHONE_NUMBER_ID,
              },
              statuses,
            },
          },
        ],
      },
    ],
  };
}

export default function webhookSpike() {
  // The API verifies the signature over the exact transmitted bytes, so the
  // body is serialised once and both signed and sent in that form.
  const raw = JSON.stringify(payloadFor(exec.scenario.iterationInTest));
  const signature = `sha256=${crypto.hmac("sha256", WEBHOOK_APP_SECRET, raw, "hex")}`;
  const response = http.post(url("/webhooks/whatsapp"), raw, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Hub-Signature-256": signature,
    },
    tags: { endpoint: "webhook" },
  });

  const ok = response.status === 200;
  acceptedRate.add(ok);
  check(response, {
    "webhook responds 200": () => ok,
    // `queuedEvents` counts the rows that were persisted or re-queued and
    // `duplicateEvents` counts the identifiers the insert skipped. They are
    // measured over overlapping sets, so each is bounded by the batch size on
    // its own and their sum is not. A repeat whose row the worker has already
    // processed is counted in neither, so neither has a useful lower bound.
    "webhook acknowledges every event": () => {
      if (!ok) return false;
      const body = json(response);
      return (
        Boolean(body) &&
        body.accepted === true &&
        body.queuedEvents <= EVENTS_PER_REQUEST &&
        body.duplicateEvents <= EVENTS_PER_REQUEST
      );
    },
  });

  if (!ok) {
    rejections.add(1, { code: `HTTP_${response.status}` });
    if (response.status === 401) {
      exec.test.abort(
        "The webhook signature was rejected. Pass -e WEBHOOK_APP_SECRET=<META_WHATSAPP_APP_SECRET> " +
          "and -e WEBHOOK_PHONE_NUMBER_ID=<META_WHATSAPP_PHONE_NUMBER_ID> that the API is running with.",
      );
    }
    console.error(`webhook rejected: ${describe(response)}`);
    return;
  }

  const body = json(response);
  if (body) {
    queuedEvents.add(body.queuedEvents);
    duplicateEvents.add(body.duplicateEvents);
  }
}
