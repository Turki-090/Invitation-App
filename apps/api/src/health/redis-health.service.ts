import type { ApiEnvironment } from "@dawah/config";
import { probeRedis } from "@dawah/queue";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RedisHealthService {
  public constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public isHealthy(timeoutMilliseconds: number): Promise<boolean> {
    return probeRedis(
      this.config.get("REDIS_URL", { infer: true }),
      timeoutMilliseconds,
    );
  }
}
