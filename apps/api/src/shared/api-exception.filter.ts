import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

interface ExceptionPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payload: ExceptionPayload =
      typeof raw === "object" && raw !== null ? raw : {};

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        "Unhandled request exception.",
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

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
      },
    });
  }
}
