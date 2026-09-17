import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ExceptionFilter,
} from "@nestjs/common";
import {
  getRequestContext,
  type ErrorReporter,
  type Logger,
} from "@dawah/observability";
import type { Request, Response } from "express";
import { ERROR_REPORTER, LOGGER } from "../observability/observability.tokens";

interface ExceptionPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ERROR_REPORTER) private readonly errorReporter: ErrorReporter,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payload: ExceptionPayload =
      typeof raw === "object" && raw !== null ? raw : {};

    if (!(exception instanceof HttpException)) {
      const context = getRequestContext();
      // The structured record carries the stack; the response never does.
      this.logger.error("http.unhandled_exception", {
        method: request.method,
        error: exception,
      });
      this.errorReporter.captureException(exception, {
        transaction: `${request.method} ${context?.route ?? "unknown"}`,
      });
    }

    const requestId = getRequestContext()?.requestId;
    response.status(status).json({
      error: {
        code:
          payload.code ??
          (status === 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED"),
        message:
          payload.message ??
          (status === 500
            ? "The request could not be completed."
            : String(raw)),
        ...(payload.details === undefined ? {} : { details: payload.details }),
        // Returned so a host can quote one identifier to support and an
        // operator can find the matching server-side record without guessing.
        ...(requestId === undefined ? {} : { requestId }),
      },
    });
  }
}
