import "reflect-metadata";
import type { ApiEnvironment } from "@dawah/config";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, type Request, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./shared/api-exception.filter";
import { configureTrustedProxy } from "./shared/trusted-proxy";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService<ApiEnvironment, true>);

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
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
