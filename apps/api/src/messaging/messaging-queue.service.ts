import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createProducerRedis,
  defaultJobOptions,
  queueNames,
  whatsappBatchJobId,
  whatsappWebhookJobId,
  type WhatsappSendJobData,
  type WhatsappWebhookJobData,
} from "@dawah/queue";
import { Queue } from "bullmq";

@Injectable()
export class MessagingQueueService implements OnModuleDestroy {
  private readonly connection;
  private readonly sendQueue: Queue<WhatsappSendJobData>;
  private readonly webhookQueue: Queue<WhatsappWebhookJobData>;

  public constructor(config: ConfigService<ApiEnvironment, true>) {
    this.connection = createProducerRedis(
      config.get("REDIS_URL", { infer: true }),
      "dawah-api-messaging",
    );
    const queueOptions = {
      connection: this.connection,
      prefix: config.get("QUEUE_PREFIX", { infer: true }),
      defaultJobOptions,
    };
    this.sendQueue = new Queue(queueNames.whatsappSend, queueOptions);
    this.webhookQueue = new Queue(queueNames.whatsappWebhook, queueOptions);
  }

  public async enqueueBatch(
    batchId: string,
    beforeFailedJobRetry?: (exhaustedAt: Date) => Promise<void>,
  ): Promise<unknown> {
    const job = await this.sendQueue.add(
      "dispatch",
      { operation: "DISPATCH_BATCH", batchId },
      { jobId: whatsappBatchJobId(batchId) },
    );
    await this.retryFailedJob(job, beforeFailedJobRetry);
    return job;
  }

  public async enqueueWebhooks(
    webhookEventIds: readonly string[],
  ): Promise<unknown> {
    if (webhookEventIds.length === 0) return;
    const jobs = await this.webhookQueue.addBulk(
      webhookEventIds.map((webhookEventId) => ({
        name: "process",
        data: { webhookEventId },
        opts: { jobId: whatsappWebhookJobId(webhookEventId) },
      })),
    );
    await Promise.all(jobs.map((job) => this.retryFailedJob(job)));
    return jobs;
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all([this.sendQueue.close(), this.webhookQueue.close()]);
    this.connection.disconnect(false);
  }

  private async retryFailedJob(
    job: {
      readonly finishedOn?: number;
      readonly timestamp: number;
      getState(): Promise<string>;
      retry(
        state?: "failed" | "completed",
        options?: {
          resetAttemptsMade?: boolean;
          resetAttemptsStarted?: boolean;
        },
      ): Promise<void>;
    },
    beforeRetry?: (exhaustedAt: Date) => Promise<void>,
  ): Promise<void> {
    if ((await job.getState()) !== "failed") return;
    await beforeRetry?.(new Date(job.finishedOn ?? job.timestamp));
    try {
      await job.retry("failed", {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
    } catch (error) {
      if ((await job.getState()) === "failed") throw error;
    }
  }
}
