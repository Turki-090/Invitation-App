import "reflect-metadata";
import type { ApiEnvironment } from "@dawah/config";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, type Request, urlencoded } from "express";
import helmet from "helmet";
import {
  correlationIdHeader,
  requestIdHeader,
  type Logger,
} from "@dawah/observability";
import { AppModule } from "./app.module";
import { NestLoggerAdapter } from "./observability/nest-logger.adapter";
import { LOGGER } from "./observability/observability.tokens";
import { configureTrustedProxy } from "./shared/trusted-proxy";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const logger = app.get<Logger>(LOGGER);
  // Replaces the buffered default console logger, so framework output is
  // redacted, structured, and correlated like every other line.
  app.useLogger(new NestLoggerAdapter(logger));

  app.setGlobalPrefix("api/v1");
  // Honor forwarded client addresses only from local/private ingress hops. A
  // directly exposed API keeps using the socket address and cannot be tricked
  // by an arbitrary X-Forwarded-For header.
  configureTrustedProxy(app);
  app.use(helmet());
  app.use(
    json({
      limit: config.get("API_BODY_LIMIT_BYTES", { infer: true }),
      verify: (request: Request & { rawBody?: Buffer }, _response, body) => {
        if (request.originalUrl.includes("/webhooks/whatsapp")) {
          request.rawBody = Buffer.from(body);
        }
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      limit: config.get("API_BODY_LIMIT_BYTES", { infer: true }),
    }),
  );
  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: config.get("API_CORS_ORIGINS", { infer: true }),
    // Browser clients need to read the correlation identifiers so a host can
    // quote one back to support for a failed operation.
    exposedHeaders: [requestIdHeader, correlationIdHeader],
  });
  app.enableShutdownHooks();

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  logger.info("api.started", {
    port,
    metricsEnabled: config.get("METRICS_ENABLED", { infer: true }),
    // Boolean, not a defined check: an unset variable still reaches the
    // config service as an empty string, which would report as configured.
    errorReportingEnabled: Boolean(config.get("SENTRY_DSN", { infer: true })),
  });
}

void bootstrap();
