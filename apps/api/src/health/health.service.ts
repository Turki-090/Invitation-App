import type { ApiEnvironment } from "@dawah/config";
import type { Readiness } from "@dawah/api-contract";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisHealthService } from "./redis-health.service";

type CheckStatus = "ok" | "error";

@Injectable()
export class HealthService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisHealthService) private readonly redis: RedisHealthService,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async ready(): Promise<Readiness> {
    const timeout = this.config.get("API_READY_TIMEOUT_MS", { infer: true });
    const [databaseReady, redisReady] = await Promise.all([
      this.prisma.isHealthy(timeout),
      this.redis.isHealthy(timeout),
    ]);
    const checks: Record<"database" | "redis", CheckStatus> = {
      database: databaseReady ? "ok" : "error",
      redis: redisReady ? "ok" : "error",
    };

    if (!databaseReady || !redisReady) {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "One or more required dependencies are unavailable.",
        details: { checks },
      });
    }

    return {
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    };
  }
}
