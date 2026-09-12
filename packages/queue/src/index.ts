import type { JobsOptions } from "bullmq";
import Redis from "ioredis";

export const queueNames = {
  health: "platform-health",
  whatsappSend: "whatsapp-send",
  whatsappWebhook: "whatsapp-webhook",
  reminders: "reminders",
  imports: "imports",
  exports: "exports",
  notifications: "notifications",
  eventMaintenance: "event-maintenance",
} as const;

export const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
} satisfies JobsOptions;

export type WhatsappSendJobData =
  | { readonly operation: "DISPATCH_BATCH"; readonly batchId: string }
  | { readonly operation: "SEND_MESSAGE"; readonly messageId: string }
  | {
      readonly operation: "SEND_RSVP_CONFIRMATION";
      readonly confirmationId: string;
    };

export interface WhatsappWebhookJobData {
  readonly webhookEventId: string;
}

export function whatsappBatchJobId(batchId: string): string {
  return `batch-${batchId}`;
}

export function whatsappMessageJobId(messageId: string): string {
  return `message-${messageId}`;
}

export function whatsappRsvpConfirmationJobId(confirmationId: string): string {
  return `rsvp-confirmation-${confirmationId}`;
}

export function whatsappMessageJobs(
  messageIds: readonly string[],
  maximumAttempts: number,
) {
  return messageIds.map((messageId) => ({
    name: "send" as const,
    data: { operation: "SEND_MESSAGE" as const, messageId },
    opts: {
      jobId: whatsappMessageJobId(messageId),
      attempts: maximumAttempts,
      backoff: defaultJobOptions.backoff,
    },
  }));
}

export function whatsappRsvpConfirmationJobs(
  confirmationIds: readonly string[],
  maximumAttempts: number,
) {
  return confirmationIds.map((confirmationId) => ({
    name: "send-rsvp-confirmation" as const,
    data: {
      operation: "SEND_RSVP_CONFIRMATION" as const,
      confirmationId,
    },
    opts: {
      jobId: whatsappRsvpConfirmationJobId(confirmationId),
      attempts: maximumAttempts,
      backoff: defaultJobOptions.backoff,
    },
  }));
}

export function whatsappWebhookJobId(webhookEventId: string): string {
  return `webhook-${webhookEventId}`;
}

export function createProducerRedis(
  redisUrl: string,
  connectionName: string,
): Redis {
  return new Redis(redisUrl, {
    connectionName,
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
}

export function createWorkerRedis(
  redisUrl: string,
  connectionName: string,
): Redis {
  return new Redis(redisUrl, {
    connectionName,
    connectTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

export async function probeRedis(
  redisUrl: string,
  timeoutMilliseconds: number,
): Promise<boolean> {
  const connection = createProducerRedis(redisUrl, "dawah-readiness");
  let timeout: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      connection.connect().then(() => connection.ping()),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Redis readiness probe timed out.")),
          timeoutMilliseconds,
        );
      }),
    ]);
    return result === "PONG";
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
    connection.disconnect(false);
  }
}
