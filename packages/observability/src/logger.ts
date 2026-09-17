import { getRequestContext } from "./context";
import { redact, redactText } from "./redact";

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" &&
    (logLevels as readonly string[]).includes(value)
  );
}

export type LogFields = Record<string, unknown>;

export interface LoggerOptions {
  /** Emitting process: `api`, `worker`, or a test harness name. */
  readonly service: string;
  /** Deployment selector, mirrored from `DAWAH_ENV`. */
  readonly environment: string;
  readonly release?: string;
  readonly level?: LogLevel;
  /**
   * `json` is the deployed format: one object per line, machine parsed by the
   * log pipeline. `pretty` stays human-readable for local development.
   */
  readonly format?: "json" | "pretty";
  /** Injectable sink; defaults to stdout/stderr. */
  readonly write?: (line: string, level: LogLevel) => void;
  readonly now?: () => Date;
  /** Fields merged into every line emitted by this logger. */
  readonly base?: LogFields;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Derives a logger that always carries the supplied fields. */
  child(fields: LogFields): Logger;
  readonly level: LogLevel;
}

/**
 * Structured application logger.
 *
 * Every line is a single JSON object so that a deployed log pipeline can index
 * `event`, `requestId`, and `correlationId` without parsing prose, and every
 * value passes through redaction first. Call sites therefore cannot leak a
 * guest name or a capability token by logging an object they did not inspect.
 */
export function createLogger(options: LoggerOptions): Logger {
  const level = options.level ?? "info";
  const format = options.format ?? "json";
  const now = options.now ?? (() => new Date());
  const write = options.write ?? defaultWrite;
  const base = options.base ?? {};

  const emit = (
    logLevel: LogLevel,
    event: string,
    fields?: LogFields,
  ): void => {
    if (levelRank[logLevel] < levelRank[level]) return;

    const context = getRequestContext();
    const record: Record<string, unknown> = {
      timestamp: now().toISOString(),
      level: logLevel,
      service: options.service,
      environment: options.environment,
      event: redactText(event),
    };
    if (options.release !== undefined) record.release = options.release;
    if (context) {
      record.requestId = context.requestId;
      record.correlationId = context.correlationId;
      if (context.actorId !== undefined) record.actorId = context.actorId;
      if (context.eventId !== undefined) record.eventId = context.eventId;
      if (context.route !== undefined) record.route = context.route;
      if (context.queue !== undefined) record.queue = context.queue;
      if (context.jobId !== undefined) record.jobId = context.jobId;
    }

    const merged = { ...base, ...fields };
    for (const [key, value] of Object.entries(
      redact(merged) as Record<string, unknown>,
    )) {
      // Context and envelope keys are authoritative; a caller-supplied field
      // of the same name must not be able to rewrite the correlation trail.
      if (key in record) continue;
      record[key] = value;
    }

    write(format === "json" ? serialize(record) : prettify(record), logLevel);
  };

  const logger: Logger = {
    level,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (fields) =>
      createLogger({ ...options, level, base: { ...base, ...fields } }),
  };
  return logger;
}

/** A logger that discards everything; used by tests and by disabled paths. */
export function createNullLogger(): Logger {
  const logger: Logger = {
    level: "error",
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return logger;
}

function defaultWrite(line: string, level: LogLevel): void {
  const stream = level === "error" || level === "warn" ? "stderr" : "stdout";
  process[stream].write(`${line}\n`);
}

function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({
      timestamp: record.timestamp,
      level: record.level,
      service: record.service,
      event: "log.serialization_failed",
    });
  }
}

function prettify(record: Record<string, unknown>): string {
  const { timestamp, level, event, ...rest } = record;
  const details = Object.entries(rest)
    .filter(([key]) => key !== "service" && key !== "environment")
    .map(([key, value]) => `${key}=${formatScalar(value)}`)
    .join(" ");
  return `${String(timestamp)} ${String(level).toUpperCase()} ${String(event)}${
    details ? ` ${details}` : ""
  }`;
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}
