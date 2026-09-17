// Identifier helpers. Idempotency keys are deliberately deterministic: a
// scenario that has to replay an earlier key must be able to rebuild it without
// sharing state between virtual users, which k6 does not allow.

import crypto from "k6/crypto";
import { RUN_ID } from "./config.js";

const HEX = "0123456789abcdef";

/** Random RFC 4122 version 4 UUID, for payload fields that must be unique. */
export function uuidv4() {
  const bytes = new Uint8Array(crypto.randomBytes(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += HEX[bytes[index] >> 4] + HEX[bytes[index] & 0x0f];
  }
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Deterministic `Idempotency-Key` for one logical attempt. Both contracts
 * require 8 to 200 visible ASCII characters with no spaces, which this shape
 * satisfies. `sequence` is normally `exec.scenario.iterationInTest`, which is
 * unique inside a scenario and repeats identically in a replay scenario that
 * runs the same number of iterations.
 */
export function idempotencyKey(prefix, sequence) {
  return `${prefix}-${RUN_ID}-${String(sequence).padStart(9, "0")}`;
}

/** Stable device identifier per virtual user, as a scanner device would send. */
export function deviceId(vuId) {
  return `k6-scanner-${String(vuId).padStart(4, "0")}`;
}
