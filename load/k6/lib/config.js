// Every value a scenario needs comes from a k6 environment variable with a
// local default. No secret is ever committed here: the defaults are the same
// throwaway values already published in `.env.example` and `.env.test.example`,
// and any run against a shared environment must override them with `-e`.

import { FIXTURES } from "./fixtures.js";

export function text(name, fallback) {
  const value = __ENV[name];
  return value === undefined || value === "" ? fallback : value;
}

export function integer(name, fallback) {
  const value = __ENV[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer, received "${value}".`);
  }
  return parsed;
}

export function flag(name, fallback) {
  const value = __ENV[name];
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/** Versioned API root, for example `http://127.0.0.1:4000/api/v1`. */
export const BASE_URL = trimTrailingSlash(
  text("BASE_URL", "http://127.0.0.1:4000/api/v1"),
);

/**
 * Scheme and authority only. Signed export download URLs are returned as
 * absolute paths that already contain `/api/v1`, so they are joined to this
 * origin rather than to `BASE_URL`.
 */
export const API_ORIGIN = BASE_URL.replace(/\/api\/v\d+$/, "");

/**
 * Bearer token sent on every authenticated request. The default is the
 * deterministic development credential, which the API accepts only when it runs
 * with `NODE_ENV=development` and `DAWAH_DEV_AUTH_BYPASS=true`. Supply a real
 * Supabase access token with `-e ACCESS_TOKEN=...` for any other environment.
 */
export const ACCESS_TOKEN = text("ACCESS_TOKEN", "dawah-local-development");

export const EVENT_ID = text("EVENT_ID", FIXTURES.eventId);
export const TEMPLATE_ID = text("TEMPLATE_ID", FIXTURES.templateId);

/**
 * Namespaces every idempotency key a run generates. Keys are derived from
 * `RUN_ID` plus the in-test iteration number so the replay pass can rebuild the
 * exact keys the first pass used. Change it for every fresh run against a
 * database that was not reset, or the first pass replays the previous run.
 */
export const RUN_ID = text("RUN_ID", "run1");

/** Meta webhook credentials. These mirror the local example environments. */
export const WEBHOOK_APP_SECRET = text(
  "WEBHOOK_APP_SECRET",
  "dawah-local-meta-app-secret",
);
export const WEBHOOK_PHONE_NUMBER_ID = text(
  "WEBHOOK_PHONE_NUMBER_ID",
  "000000000000000",
);

export function eventPath(suffix) {
  return `/events/${EVENT_ID}${suffix}`;
}
