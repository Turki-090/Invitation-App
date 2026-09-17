import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  createProducerRedis,
  defaultJobOptions,
  queueNames,
  whatsappBatchJobId,
  whatsappRsvpConfirmationJobs,
  whatsappWebhookJobId,
  type WhatsappSendJobData,
  type WhatsappWebhookJobData,
} from "@dawah/queue";
import { currentCorrelationId } from "@dawah/observability";
import { Queue } from "bullmq";

@Injectable()
export class MessagingQueueService implements OnModuleDestroy {
  private readonly connection;
  private readonly sendQueue: Queue<WhatsappSendJobData>;
  private readonly webhookQueue: Queue<WhatsappWebhookJobData>;
  private readonly confirmationMaximumAttempts: number;

  public constructor(
    @Inject(ConfigService) config: ConfigService<ApiEnvironment, true>,
  ) {
    this.connection = createProducerRedis(
      config.get("REDIS_URL", { infer: true }),
      "dawah-api-messaging",
    );
    this.confirmationMaximumAttempts = config.get(
      "META_WHATSAPP_MAX_ATTEMPTS",
      { infer: true },
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
      {
        operation: "DISPATCH_BATCH",
        batchId,
        correlationId: currentCorrelationId(),
      },
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
        data: { webhookEventId, correlationId: currentCorrelationId() },
        opts: { jobId: whatsappWebhookJobId(webhookEventId) },
      })),
    );
    await Promise.all(jobs.map((job) => this.retryFailedJob(job)));
    return jobs;
  }

  public async enqueueRsvpConfirmation(
    confirmationId: string,
  ): Promise<unknown> {
    const definition = whatsappRsvpConfirmationJobs(
      [confirmationId],
      this.confirmationMaximumAttempts,
    )[0]!;
    const job = await this.sendQueue.add(
      definition.name,
      { ...definition.data, correlationId: currentCorrelationId() },
      definition.opts,
    );
    await this.retryFailedJob(job);
    return job;
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
