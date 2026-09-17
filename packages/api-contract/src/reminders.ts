import { z } from "zod";
import { preparationLocaleSchema } from "./preparation";
import { sendBatchProgressSchema, sendBatchStatusSchema } from "./messaging";

export const REMINDER_AUDIENCES = [
  "ALL_PENDING",
  "SENT_UNREAD",
  "READ_NO_RESPONSE",
  "APPROACHING_DEADLINE",
] as const;
export const REMINDER_TRIGGER_KINDS = [
  "AFTER_INITIAL_INVITATION",
  "BEFORE_RSVP_DEADLINE",
] as const;
export const REMINDER_EXCLUSION_REASON_CODES = [
  "EVENT_NOT_REMINDABLE",
  "INVITATION_CANCELLED",
  "RSVP_NOT_PENDING",
  "INITIAL_INVITATION_NOT_SENT",
  "INITIAL_DELIVERY_FAILED",
  "COOLDOWN_ACTIVE",
  "TEMPLATE_NOT_APPROVED",
  "CURRENT_SNAPSHOT_REQUIRED",
  "AUDIENCE_MISMATCH",
  "RULE_NOT_DUE",
  "RULE_LIMIT_REACHED",
  "INSUFFICIENT_CREDITS",
] as const;

export const reminderAudienceSchema = z.enum(REMINDER_AUDIENCES);
export const reminderTriggerKindSchema = z.enum(REMINDER_TRIGGER_KINDS);
export const reminderExclusionReasonCodeSchema = z.enum(
  REMINDER_EXCLUSION_REASON_CODES,
);
export const reminderRunSourceSchema = z.enum(["MANUAL", "SCHEDULED"]);

const reminderSelectionFields = {
  templateId: z.uuid(),
  invitationIds: z.array(z.uuid()).min(1).max(5_000).optional(),
  audience: reminderAudienceSchema.default("ALL_PENDING"),
  cooldownHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
};

export const reminderReadinessRequestSchema = z.object(reminderSelectionFields);
export type ReminderReadinessRequest = z.infer<
  typeof reminderReadinessRequestSchema
>;

export const reminderReadinessResponseSchema = z.object({
  template: z.object({
    id: z.uuid(),
    displayName: z.string(),
    locale: preparationLocaleSchema,
  }),
  audience: reminderAudienceSchema,
  cooldownHours: z.number().int().positive(),
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string(),
  summary: z.object({
    selectedInvitations: z.number().int().nonnegative(),
    eligibleInvitations: z.number().int().nonnegative(),
    excludedInvitations: z.number().int().nonnegative(),
    recentlyRemindedInvitations: z.number().int().nonnegative(),
    estimatedCreditUnits: z.number().int().nonnegative(),
  }),
  eligibleInvitationIds: z.array(z.uuid()),
  excluded: z.array(
    z.object({
      invitationId: z.uuid(),
      reasonCodes: z.array(reminderExclusionReasonCodeSchema).min(1),
      nextEligibleAt: z.string().nullable(),
    }),
  ),
});
export type ReminderReadinessResponse = z.infer<
  typeof reminderReadinessResponseSchema
>;

export const sendRemindersSchema = z.object(reminderSelectionFields).extend({
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SendRemindersInput = z.infer<typeof sendRemindersSchema>;

export const reminderRuleSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  templateId: z.uuid(),
  name: z.string(),
  triggerKind: reminderTriggerKindSchema,
  offsetDays: z.number().int().min(1).max(30),
  cooldownHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  maximumReminders: z.number().int().min(1).max(5),
  enabled: z.boolean(),
  lastEvaluatedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReminderRule = z.infer<typeof reminderRuleSchema>;

export const createReminderRuleSchema = z.object({
  templateId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  triggerKind: reminderTriggerKindSchema,
  offsetDays: z.number().int().min(1).max(30),
  cooldownHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
  maximumReminders: z.number().int().min(1).max(5).default(1),
  enabled: z.boolean().default(true),
});
export type CreateReminderRuleInput = z.infer<typeof createReminderRuleSchema>;

export const updateReminderRuleSchema = createReminderRuleSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one reminder rule field to update.",
  });
export type UpdateReminderRuleInput = z.infer<typeof updateReminderRuleSchema>;

export const reminderRunSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  ruleId: z.uuid().nullable(),
  sendBatchId: z.uuid().nullable(),
  source: reminderRunSourceSchema,
  status: sendBatchStatusSchema,
  selectedCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  cooldownHours: z.number().int().positive(),
  progress: sendBatchProgressSchema,
  evaluatedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReminderRun = z.infer<typeof reminderRunSchema>;

export const reminderRunDetailSchema = reminderRunSchema.extend({
  items: z.array(
    z.object({
      invitationId: z.uuid(),
      outcome: z.enum(["ELIGIBLE", "EXCLUDED"]),
      reasonCodes: z.array(reminderExclusionReasonCodeSchema),
      messageId: z.uuid().nullable(),
      initialInvitationSentAt: z.string().nullable(),
      lastReminderAt: z.string().nullable(),
    }),
  ),
});
export type ReminderRunDetail = z.infer<typeof reminderRunDetailSchema>;

export const listReminderRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReminderRunsQuery = z.infer<typeof listReminderRunsQuerySchema>;

export const listReminderRunsResponseSchema = z.object({
  items: z.array(reminderRunSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListReminderRunsResponse = z.infer<
  typeof listReminderRunsResponseSchema
>;
