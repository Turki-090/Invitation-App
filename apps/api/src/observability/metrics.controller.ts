import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  isAuthorizedMetricsRequest,
  metricsContentType,
  type PlatformMetrics,
} from "@dawah/observability";
import type { Response } from "express";
import { PLATFORM_METRICS } from "./observability.tokens";

/**
 * Prometheus scrape endpoint.
 *
 * It lives under `/internal` and is bearer-guarded because it describes the
 * platform's internal shape — route inventory, traffic volumes, queue depth —
 * even though it carries no personal data. When metrics are disabled the route
 * reports as absent rather than as forbidden, so a disabled deployment does not
 * advertise the endpoint at all.
 */
@Controller("internal")
export class MetricsController {
  public constructor(
    @Inject(PLATFORM_METRICS) private readonly metrics: PlatformMetrics,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  @Get("metrics")
  public scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ): void {
    if (!this.config.get("METRICS_ENABLED", { infer: true })) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "The requested resource does not exist.",
      });
    }
    if (
      !isAuthorizedMetricsRequest(
        authorization,
        this.config.get("METRICS_TOKEN", { infer: true }),
      )
    ) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "A bearer access token is required.",
      });
    }

    response
      .status(200)
      .setHeader("Content-Type", metricsContentType)
      .setHeader("Cache-Control", "no-store")
      .send(this.metrics.registry.render());
  }
}
