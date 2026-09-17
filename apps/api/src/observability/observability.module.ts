import {
  Global,
  Inject,
  Module,
  type MiddlewareConsumer,
  type NestModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { ApiEnvironment } from "@dawah/config";
import {
  createLogger,
  createNoopErrorReporter,
  createPlatformMetrics,
  createSentryErrorReporter,
  recordBuildInfo,
  type ErrorReporter,
  type Logger,
  type PlatformMetrics,
} from "@dawah/observability";
import { MetricsController } from "./metrics.controller";
import {
  ERROR_REPORTER,
  LOGGER,
  PLATFORM_METRICS,
} from "./observability.tokens";
import { RequestContextMiddleware } from "./request-context.middleware";
import { RequestIdentityInterceptor } from "./request-identity.interceptor";

const serviceName = "api";

/**
 * Builds the API's logging, metrics, and error-reporting singletons from the
 * validated environment, and installs the correlation middleware across every
 * route. The module is global so that any service can log with the same
 * redaction rules and correlation envelope without re-importing it.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>): Logger =>
        createLogger({
          service: serviceName,
          environment: config.get("DAWAH_ENV", { infer: true }),
          release: config.get("RELEASE_VERSION", { infer: true }),
          level: config.get("LOG_LEVEL", { infer: true }),
          format: config.get("LOG_FORMAT", { infer: true }),
        }),
    },
    {
      provide: PLATFORM_METRICS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<ApiEnvironment, true>,
      ): PlatformMetrics => {
        const metrics = createPlatformMetrics();
        recordBuildInfo(metrics, {
          service: serviceName,
          environment: config.get("DAWAH_ENV", { infer: true }),
          release: config.get("RELEASE_VERSION", { infer: true }),
        });
        return metrics;
      },
    },
    {
      provide: ERROR_REPORTER,
      inject: [ConfigService, LOGGER],
      useFactory: (
        config: ConfigService<ApiEnvironment, true>,
        logger: Logger,
      ): ErrorReporter => {
        const dsn = config.get("SENTRY_DSN", { infer: true });
        if (!dsn) return createNoopErrorReporter();
        return createSentryErrorReporter({
          dsn,
          service: serviceName,
          environment: config.get("DAWAH_ENV", { infer: true }),
          release: config.get("RELEASE_VERSION", { infer: true }),
          sampleRate: config.get("SENTRY_SAMPLE_RATE", { infer: true }),
          logger,
        });
      },
    },
    { provide: APP_INTERCEPTOR, useClass: RequestIdentityInterceptor },
    RequestContextMiddleware,
  ],
  exports: [LOGGER, PLATFORM_METRICS, ERROR_REPORTER],
})
export class ObservabilityModule implements NestModule, OnApplicationShutdown {
  public constructor(
    @Inject(ERROR_REPORTER) private readonly errorReporter: ErrorReporter,
  ) {}

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*splat");
  }

  /**
   * Gives queued error reports a bounded chance to leave the process before it
   * exits, so the failure that caused the restart is not the one report that is
   * lost.
   */
  public async onApplicationShutdown(): Promise<void> {
    await this.errorReporter.flush(2_000);
  }
}
