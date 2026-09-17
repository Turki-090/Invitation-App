// Shared request helpers. Every authenticated call goes through `apiGet` or
// `apiPost` so that a misconfigured run fails loudly and immediately instead of
// producing a page of meaningless latency numbers.

import http from "k6/http";
import exec from "k6/execution";
import { ACCESS_TOKEN, BASE_URL } from "./config.js";

export function url(path) {
  return `${BASE_URL}${path}`;
}

export function authHeaders(extra) {
  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    Accept: "application/json",
  };
  if (extra) {
    for (const key of Object.keys(extra)) headers[key] = extra[key];
  }
  return headers;
}

export function jsonHeaders(extra) {
  return authHeaders(
    Object.assign({ "Content-Type": "application/json" }, extra || {}),
  );
}

function withDefaults(params, headers) {
  const merged = Object.assign({}, params || {});
  merged.headers = Object.assign({}, headers, merged.headers || {});
  return merged;
}

/**
 * Turns the three configuration mistakes that silently ruin a load run into an
 * immediate abort with an actionable message.
 */
function guard(response) {
  if (response.status === 401 || response.status === 403) {
    exec.test.abort(
      `The API rejected the bearer token with ${response.status}. Start the API with ` +
        "NODE_ENV=development and DAWAH_DEV_AUTH_BYPASS=true, or pass -e ACCESS_TOKEN=<token>. " +
        "See load/README.md.",
    );
  }
  if (response.status === 429) {
    exec.test.abort(
      "The API returned 429. The global throttler allows 120 requests per minute per client " +
        "address, which no load scenario can stay under. Raise the limit for the load window " +
        "as described in load/README.md before measuring anything.",
    );
  }
  if (response.status === 0) {
    exec.test.abort(
      `No response from ${BASE_URL}. Confirm the API is listening and BASE_URL is correct.`,
    );
  }
  return response;
}

export function apiGet(path, params) {
  return guard(http.get(url(path), withDefaults(params, authHeaders())));
}

export function apiPost(path, body, params) {
  return guard(
    http.post(
      url(path),
      JSON.stringify(body),
      withDefaults(params, jsonHeaders()),
    ),
  );
}

/** Absolute GET used for signed export download URLs, which are full paths. */
export function absoluteGet(absoluteUrl, params) {
  return guard(http.get(absoluteUrl, withDefaults(params, authHeaders())));
}

/** Parses a JSON body, returning null rather than throwing on a broken response. */
export function json(response) {
  try {
    return response.json();
  } catch (error) {
    return null;
  }
}

/** Error code from the standard `{ error: { code, message } }` envelope. */
export function errorCode(response) {
  const body = json(response);
  if (body && body.error && typeof body.error.code === "string") {
    return body.error.code;
  }
  return `HTTP_${response.status}`;
}

/** One-line description used when a check fails, so the log names the cause. */
export function describe(response) {
  return `${response.status} ${errorCode(response)}`;
}
