import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import {
  correlationIdHeader,
  createRequestId,
  getRequestContext,
  normalizeRouteTemplate,
  requestIdHeader,
  runWithRequestContext,
  sanitizeCorrelationId,
  type Logger,
  type PlatformMetrics,
} from "@dawah/observability";
import type { NextFunction, Request, Response } from "express";
import { LOGGER, PLATFORM_METRICS } from "./observability.tokens";

/**
 * Establishes the correlation context for every request and records its
 * outcome once the response is finished.
 *
 * This runs as middleware rather than as an interceptor so that requests
 * rejected before a handler is reached — unknown routes, throttled callers,
 * failed authentication, oversized bodies — are still correlated, counted, and
 * logged. Those are exactly the requests an operator needs during an incident.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  public constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(PLATFORM_METRICS) private readonly metrics: PlatformMetrics,
  ) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const inboundRequestId = sanitizeCorrelationId(
      request.headers[requestIdHeader],
    );
    const inboundCorrelationId = sanitizeCorrelationId(
      request.headers[correlationIdHeader],
    );
    const requestId = inboundRequestId ?? createRequestId();
    const correlationId = inboundCorrelationId ?? requestId;
    const route = normalizeRouteTemplate(request.originalUrl);
    const method = request.method;

    // Echoed so a host, a support engineer, and the log pipeline can all refer
    // to the same identifier for a failed operation.
    response.setHeader(requestIdHeader, requestId);
    response.setHeader(correlationIdHeader, correlationId);

    runWithRequestContext({ requestId, correlationId, route }, () => {
      // The stored object is captured by reference. Response lifecycle events
      // are emitted from the socket's asynchronous context rather than the
      // request's, so the outcome handler cannot read the context back out of
      // async storage; it re-enters the captured one instead. The reference
      // also means enrichment performed mid-request — the resolved actor and
      // event — is visible here.
      const context = getRequestContext() ?? {
        requestId,
        correlationId,
        route,
      };
      const startedAt = process.hrtime.bigint();
      this.metrics.httpRequestsInFlight.increment(undefined, 1);

      let settled = false;
      const complete = (): void => {
        if (settled) return;
        settled = true;
        this.metrics.httpRequestsInFlight.increment(undefined, -1);

        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1e9;
        const status = response.statusCode;
        const labels = { method, route };
        this.metrics.httpRequestDuration.observe(labels, durationSeconds);
        this.metrics.httpRequests.increment({ ...labels, status });
        if (status >= 400) {
          this.metrics.httpErrors.increment({
            ...labels,
            kind: status >= 500 ? "server" : "client",
          });
        }

        const fields = {
          method,
          statusCode: status,
          durationMs: Math.round(durationSeconds * 1_000),
        };
        runWithRequestContext(context, () => {
          if (status >= 500) {
            this.logger.error("http.request_failed", fields);
          } else if (status >= 400) {
            this.logger.warn("http.request_rejected", fields);
          } else if (isHealthRoute(route)) {
            // Liveness, readiness, and scrapes run continuously; logging them
            // at info would bury the traffic an operator is looking at.
            this.logger.debug("http.request_completed", fields);
          } else {
            this.logger.info("http.request_completed", fields);
          }
        });
      };

      response.on("finish", complete);
      response.on("close", complete);
      next();
    });
  }
}

function isHealthRoute(route: string): boolean {
  return route.includes("/health/") || route.endsWith("/internal/metrics");
}
