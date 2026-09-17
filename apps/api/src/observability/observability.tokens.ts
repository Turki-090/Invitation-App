/**
 * Injection tokens for the observability boundary. Interfaces rather than
 * concrete classes are injected so that tests, and any future replacement of
 * the error-reporting vendor, do not reach into call sites.
 */
export const LOGGER = Symbol("DAWAH_LOGGER");
export const PLATFORM_METRICS = Symbol("DAWAH_PLATFORM_METRICS");
export const ERROR_REPORTER = Symbol("DAWAH_ERROR_REPORTER");
