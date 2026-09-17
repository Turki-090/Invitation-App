import type { LoggerService } from "@nestjs/common";
import type { Logger } from "@dawah/observability";

/**
 * Routes the framework's own output through the structured logger.
 *
 * Nest writes startup, routing, and unhandled-error messages with its built-in
 * console logger. Without this adapter a deployed environment would emit two
 * different log formats, and framework messages would bypass redaction and the
 * correlation envelope entirely.
 */
export class NestLoggerAdapter implements LoggerService {
  public constructor(private readonly logger: Logger) {}

  public log(message: unknown, ...optional: unknown[]): void {
    this.logger.info("nest.log", this.fields(message, optional));
  }

  public error(message: unknown, ...optional: unknown[]): void {
    this.logger.error("nest.error", this.fields(message, optional));
  }

  public warn(message: unknown, ...optional: unknown[]): void {
    this.logger.warn("nest.warn", this.fields(message, optional));
  }

  public debug(message: unknown, ...optional: unknown[]): void {
    this.logger.debug("nest.debug", this.fields(message, optional));
  }

  public verbose(message: unknown, ...optional: unknown[]): void {
    this.logger.debug("nest.verbose", this.fields(message, optional));
  }

  public fatal(message: unknown, ...optional: unknown[]): void {
    this.logger.error("nest.fatal", this.fields(message, optional));
  }

  private fields(
    message: unknown,
    optional: unknown[],
  ): Record<string, unknown> {
    // Nest passes the emitting class name as the final argument.
    const context = optional.at(-1);
    const rest = typeof context === "string" ? optional.slice(0, -1) : optional;
    return {
      message,
      ...(typeof context === "string" ? { context } : {}),
      ...(rest.length > 0 ? { details: rest } : {}),
    };
  }
}
