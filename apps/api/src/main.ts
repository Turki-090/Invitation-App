import "reflect-metadata";
import type { ApiEnvironment } from "@dawah/config";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./shared/api-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService<ApiEnvironment, true>);

  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(json({ limit: config.get("API_BODY_LIMIT_BYTES", { infer: true }) }));
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
