import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createProducerRedis,
  defaultJobOptions,
  queueNames,
} from "@dawah/queue";
import { currentCorrelationId } from "@dawah/observability";
import { Queue } from "bullmq";

export interface ImportQueueJobData {
  operation: "PARSE" | "VALIDATE";
  eventId: string;
  importJobId: string;
  expectedRevision: number;
  correlationId?: string;
}

@Injectable()
export class ImportsQueueService implements OnModuleDestroy {
  private readonly connection;
  private readonly queue: Queue<ImportQueueJobData>;

  public constructor(
    @Inject(ConfigService)
    config: ConfigService<ApiEnvironment, true>,
  ) {
    this.connection = createProducerRedis(
      config.get("REDIS_URL", { infer: true }),
      "dawah-api-imports",
    );
    this.queue = new Queue<ImportQueueJobData>(queueNames.imports, {
      connection: this.connection,
      prefix: config.get("QUEUE_PREFIX", { infer: true }),
      defaultJobOptions,
    });
  }

  public enqueue(data: ImportQueueJobData): Promise<unknown> {
    const name = data.operation === "PARSE" ? "parse" : "validate";
    return this.queue.add(
      name,
      { ...data, correlationId: currentCorrelationId() },
      { jobId: `${name}-${data.importJobId}-${data.expectedRevision}` },
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect(false);
  }
}
