import type { MessageDeliveryStatus } from "@dawah/domain";
import type { WhatsappWebhookJobData } from "@dawah/queue";
import type { Job } from "bullmq";

export type PersistedWebhookEvidence =
  | {
      readonly kind: "STATUS";
      readonly providerMessageId: string;
      readonly logicalMessageId?: string;
      readonly status: Extract<
        MessageDeliveryStatus,
        "SENT" | "DELIVERED" | "READ" | "FAILED"
      >;
      readonly occurredAt: Date;
      readonly failureCode?: string;
      readonly failureReason?: string;
    }
  | {
      readonly kind: "RESPONSE";
      readonly contextProviderMessageId?: string;
      readonly occurredAt: Date;
      readonly responseType: "BUTTON" | "TEXT" | "UNKNOWN";
      readonly responseValue?: string;
    };

export interface WhatsappWebhookRepository {
  claimWebhook(webhookEventId: string): Promise<
    | {
        readonly outcome: "PROCESS";
        readonly evidence: PersistedWebhookEvidence;
      }
    | { readonly outcome: "SKIP" }
  >;
  applyWebhook(
    webhookEventId: string,
    evidence: PersistedWebhookEvidence,
  ): Promise<"APPLIED" | "IGNORED">;
  recordWebhookFailure(webhookEventId: string): Promise<void>;
}

export function createWhatsappWebhookProcessor(
  repository: WhatsappWebhookRepository,
) {
  return async (
    job: Pick<Job<WhatsappWebhookJobData>, "data">,
  ): Promise<{ readonly outcome: "APPLIED" | "IGNORED" | "SKIPPED" }> => {
    const claim = await repository.claimWebhook(job.data.webhookEventId);
    if (claim.outcome === "SKIP") return { outcome: "SKIPPED" };
    try {
      return {
        outcome: await repository.applyWebhook(
          job.data.webhookEventId,
          claim.evidence,
        ),
      };
    } catch (error) {
      await repository.recordWebhookFailure(job.data.webhookEventId);
      throw error;
    }
  };
}
