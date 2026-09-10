import { z } from "zod";
import { preparationLocaleSchema, readinessIssueSchema } from "./preparation";

export const SEND_BATCH_STATUSES = [
  "QUEUED",
  "DISPATCHING",
  "IN_PROGRESS",
  "COMPLETED",
  "PARTIALLY_FAILED",
  "FAILED",
  "CANCELLED",
] as const;

export const MESSAGE_STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "RESPONDED",
  "FAILED",
  "CANCELLED",
] as const;

export const MESSAGE_TYPES = [
  "INVITATION",
  "REMINDER",
  "RSVP_CONFIRMATION",
  "ENTRY_PASS",
  "MANUAL",
] as const;

export const MESSAGING_FAILURE_CLASSES = [
  "TRANSIENT",
  "PERMANENT",
  "AMBIGUOUS",
] as const;

export const RESEND_INELIGIBILITY_REASON_CODES = [
  "NOT_FAILED",
  "AMBIGUOUS_OUTCOME",
  "ALREADY_RESENT",
  "TEMPLATE_NOT_APPROVED",
  "SNAPSHOT_STALE",
] as const;

export const sendBatchStatusSchema = z.enum(SEND_BATCH_STATUSES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const messageTypeSchema = z.enum(MESSAGE_TYPES);
export const messagingFailureClassSchema = z.enum(MESSAGING_FAILURE_CLASSES);
export const resendIneligibilityReasonCodeSchema = z.enum(
  RESEND_INELIGIBILITY_REASON_CODES,
);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[\x21-\x7e]+$/, "Idempotency-Key must contain visible ASCII only.");

const invitationSelectionSchema = z.object({
  templateId: z.uuid(),
  invitationIds: z.array(z.uuid()).min(1).max(5_000).optional(),
});

export const sendReadinessRequestSchema = invitationSelectionSchema;
export type SendReadinessRequest = z.infer<typeof sendReadinessRequestSchema>;

export const sendReadinessResponseSchema = z.object({
  templateId: z.uuid(),
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string(),
  summary: z.object({
    selectedInvitations: z.number().int().nonnegative(),
    readyInvitations: z.number().int().nonnegative(),
    alreadySentInvitations: z.number().int().nonnegative(),
    blockedInvitations: z.number().int().nonnegative(),
    estimatedCreditUnits: z.number().int().nonnegative(),
  }),
  blocked: z.array(
    z.object({
      invitationId: z.uuid(),
      issues: z.array(readinessIssueSchema),
    }),
  ),
  alreadySentInvitationIds: z.array(z.uuid()),
});
export type SendReadinessResponse = z.infer<typeof sendReadinessResponseSchema>;

export const createSendBatchSchema = invitationSelectionSchema.extend({
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CreateSendBatchInput = z.infer<typeof createSendBatchSchema>;

export const sendBatchProgressSchema = z.object({
  queued: z.number().int().nonnegative(),
  sending: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  read: z.number().int().nonnegative(),
  responded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});
export type SendBatchProgress = z.infer<typeof sendBatchProgressSchema>;

export const sendBatchSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: sendBatchStatusSchema,
  messageType: messageTypeSchema,
  totalMessages: z.number().int().positive(),
  estimatedCreditUnits: z.number().int().positive(),
  progress: sendBatchProgressSchema,
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type SendBatch = z.infer<typeof sendBatchSchema>;

export const listSendBatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSendBatchesQuery = z.infer<typeof listSendBatchesQuerySchema>;

export const listSendBatchesResponseSchema = z.object({
  items: z.array(sendBatchSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListSendBatchesResponse = z.infer<
  typeof listSendBatchesResponseSchema
>;

export const messageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: messageStatusSchema.optional(),
});
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;

export const messageSummarySchema = z.object({
  id: z.uuid(),
  invitationGroupId: z.uuid(),
  invitationDisplayName: z.string(),
  maskedPhone: z.string(),
  status: messageStatusSchema,
  locale: preparationLocaleSchema,
  providerMessageId: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  failureClass: messagingFailureClassSchema.nullable(),
  failureCode: z.string().nullable(),
  failureReason: z.string().nullable(),
  canResend: z.boolean(),
  queuedAt: z.string(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  failedAt: z.string().nullable(),
});
export type MessageSummary = z.infer<typeof messageSummarySchema>;

export const sendBatchDetailSchema = z.object({
  batch: sendBatchSchema,
  messages: z.array(messageSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type SendBatchDetail = z.infer<typeof sendBatchDetailSchema>;

export const resendReadinessResponseSchema = z.object({
  messageId: z.uuid(),
  invitationGroupId: z.uuid(),
  eligible: z.boolean(),
  estimatedCreditUnits: z.number().int().min(0).max(1),
  confirmationToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  expiresAt: z.string().nullable(),
  reasonCode: resendIneligibilityReasonCodeSchema.nullable(),
  reason: z.string().nullable(),
});
export type ResendReadinessResponse = z.infer<
  typeof resendReadinessResponseSchema
>;

export const resendMessageSchema = z.object({
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ResendMessageInput = z.infer<typeof resendMessageSchema>;

export const whatsappWebhookAcknowledgementSchema = z.object({
  accepted: z.literal(true),
  queuedEvents: z.number().int().nonnegative(),
  duplicateEvents: z.number().int().nonnegative(),
});
export type WhatsappWebhookAcknowledgement = z.infer<
  typeof whatsappWebhookAcknowledgementSchema
>;
