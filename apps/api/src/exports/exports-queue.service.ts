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
    return this.queue.add("generate", data, {
      jobId: exportJobId(data.exportJobId),
    });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect(false);
  }
}
