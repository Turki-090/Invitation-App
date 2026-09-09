import { z } from "zod";
import { invitationTypeSchema } from "./invitations";

export const TEMPLATE_STATUSES = ["DRAFT", "APPROVED", "ARCHIVED"] as const;
export const PREPARATION_LOCALES = ["ar-SA", "en"] as const;
export const MESSAGE_VARIABLES = [
  "guest_name",
  "event_name",
  "event_date",
  "event_time",
  "venue",
  "allowed_companions",
] as const;

export const templateStatusSchema = z.enum(TEMPLATE_STATUSES);
export const preparationLocaleSchema = z.enum(PREPARATION_LOCALES);
export const messageVariableSchema = z.enum(MESSAGE_VARIABLES);

const templateNameSchema = z.string().trim().min(1).max(120);
const templateBodySchema = z.string().trim().min(1).max(1_500);
const extraMessageSchema = z.string().trim().max(500);

export const createInvitationTemplateSchema = z.object({
  name: templateNameSchema,
  locale: preparationLocaleSchema,
  body: templateBodySchema,
  extraMessage: extraMessageSchema.optional(),
  assetId: z.uuid().nullable().optional(),
});

export type CreateInvitationTemplateInput = z.infer<
  typeof createInvitationTemplateSchema
>;

export const updateInvitationTemplateSchema = z
  .object({
    name: templateNameSchema.optional(),
    locale: preparationLocaleSchema.optional(),
    body: templateBodySchema.optional(),
    extraMessage: z.union([extraMessageSchema, z.null()]).optional(),
    assetId: z.uuid().nullable().optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (input) => Object.keys(input).some((field) => field !== "expectedVersion"),
    { message: "Provide at least one template field to update." },
  );

export type UpdateInvitationTemplateInput = z.infer<
  typeof updateInvitationTemplateSchema
>;

export const invitationTemplateSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  locale: preparationLocaleSchema,
  body: z.string(),
  extraMessage: z.string().nullable(),
  variableKeys: z.array(messageVariableSchema),
  assetId: z.uuid().nullable(),
  assetChecksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  status: templateStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export type InvitationTemplate = z.infer<typeof invitationTemplateSchema>;

export const listInvitationTemplatesResponseSchema = z.object({
  items: z.array(invitationTemplateSchema),
});

export type ListInvitationTemplatesResponse = z.infer<
  typeof listInvitationTemplatesResponseSchema
>;

export const approveInvitationTemplateSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export type ApproveInvitationTemplateInput = z.infer<
  typeof approveInvitationTemplateSchema
>;

export const invitationPreviewRequestSchema = z.object({
  templateId: z.uuid(),
  invitationType: invitationTypeSchema,
  invitationId: z.uuid().optional(),
});

export type InvitationPreviewRequest = z.infer<
  typeof invitationPreviewRequestSchema
>;

export const invitationPreviewSchema = z.object({
  templateId: z.uuid(),
  templateVersion: z.number().int().positive(),
  locale: preparationLocaleSchema,
  invitationType: invitationTypeSchema,
  renderedBody: z.string(),
  renderedExtraMessage: z.string().nullable(),
  scopeDescription: z.string(),
  replyActions: z.array(z.string().min(1)).min(2).max(102),
  variables: z.partialRecord(messageVariableSchema, z.string()),
  assetId: z.uuid().nullable(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const readinessIssueSchema = z.object({
  code: z.string().min(1).max(100),
  field: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
});

export const invitationReadinessItemSchema = z.object({
  invitationId: z.uuid(),
  ready: z.boolean(),
  issues: z.array(readinessIssueSchema),
  sourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  latestSnapshotId: z.uuid().nullable(),
});

export type InvitationReadinessItem = z.infer<
  typeof invitationReadinessItemSchema
>;

export const readinessQuerySchema = z.object({
  templateId: z.uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ReadinessQuery = z.infer<typeof readinessQuerySchema>;

export const readinessResponseSchema = z.object({
  template: invitationTemplateSchema,
  summary: z.object({
    totalInvitations: z.number().int().nonnegative(),
    readyInvitations: z.number().int().nonnegative(),
    blockedInvitations: z.number().int().nonnegative(),
    snapshottedInvitations: z.number().int().nonnegative(),
  }),
  items: z.array(invitationReadinessItemSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const createPreparationSnapshotsSchema = z.object({
  templateId: z.uuid(),
  invitationIds: z.array(z.uuid()).min(1).max(5_000).optional(),
});

export type CreatePreparationSnapshotsInput = z.infer<
  typeof createPreparationSnapshotsSchema
>;

export const createPreparationSnapshotsResultSchema = z.object({
  templateId: z.uuid(),
  createdCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  snapshotIds: z.array(z.uuid()),
  blockedInvitationIds: z.array(z.uuid()),
});

export type CreatePreparationSnapshotsResult = z.infer<
  typeof createPreparationSnapshotsResultSchema
>;

export const invitationContentSnapshotSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  invitationGroupId: z.uuid(),
  templateId: z.uuid(),
  templateVersion: z.number().int().positive(),
  locale: preparationLocaleSchema,
  invitationType: invitationTypeSchema,
  variables: z.partialRecord(messageVariableSchema, z.string()),
  renderedBody: z.string(),
  renderedExtraMessage: z.string().nullable(),
  scopeDescription: z.string(),
  replyActions: z.array(z.string()),
  assetId: z.uuid().nullable(),
  assetChecksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string(),
});

export type InvitationContentSnapshot = z.infer<
  typeof invitationContentSnapshotSchema
>;
