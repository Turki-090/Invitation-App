import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createProducerRedis,
  defaultJobOptions,
  exportJobId,
  queueNames,
  type ExportJobData,
} from "@dawah/queue";
import { currentCorrelationId } from "@dawah/observability";
import { Queue } from "bullmq";

@Injectable()
export class ExportsQueueService implements OnModuleDestroy {
  private readonly connection;
  private readonly queue: Queue<ExportJobData>;

  public constructor(
    @Inject(ConfigService)
    config: ConfigService<ApiEnvironment, true>,
  ) {
    this.connection = createProducerRedis(
      config.get("REDIS_URL", { infer: true }),
      "dawah-api-exports",
    );
    this.queue = new Queue<ExportJobData>(queueNames.exports, {
      connection: this.connection,
      prefix: config.get("QUEUE_PREFIX", { infer: true }),
      defaultJobOptions,
    });
  }

  public enqueue(data: ExportJobData): Promise<unknown> {
    // The correlation identifier rides in the payload, never in the job id:
    // the deterministic id is what makes enqueueing idempotent.
    return this.queue.add(
      "generate",
      { ...data, correlationId: currentCorrelationId() },
      { jobId: exportJobId(data.exportJobId) },
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect(false);
  }
}
