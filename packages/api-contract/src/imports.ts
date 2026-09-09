import { z } from "zod";
import { invitationTypeSchema } from "./invitations";

export const IMPORT_JOB_STATUSES = [
  "UPLOADED",
  "PARSING",
  "AWAITING_MAPPING",
  "VALIDATING",
  "REVIEWING",
  "READY",
  "IMPORTING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;

export const IMPORT_ROW_STATUSES = [
  "UNMAPPED",
  "VALID",
  "INVALID",
  "DUPLICATE",
  "SKIPPED",
  "IMPORTED",
] as const;

export const IMPORT_MAPPING_FIELDS = [
  "displayName",
  "contactName",
  "phoneNumber",
  "phoneCountry",
  "invitationType",
  "maxCompanions",
  "members",
  "internalNote",
] as const;

export const importJobStatusSchema = z.enum(IMPORT_JOB_STATUSES);
export const importRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export const importMappingFieldSchema = z.enum(IMPORT_MAPPING_FIELDS);

const importColumnMappingShape = {
  displayName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(120).optional(),
  phoneCountry: z.string().trim().min(1).max(120).optional(),
  invitationType: z.string().trim().min(1).max(120).optional(),
  maxCompanions: z.string().trim().min(1).max(120).optional(),
  members: z.string().trim().min(1).max(120).optional(),
  internalNote: z.string().trim().min(1).max(120).optional(),
} as const;

function requireUniqueMappedColumns(
  mapping: Record<string, string | undefined>,
  context: z.RefinementCtx,
): void {
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length) {
    context.addIssue({
      code: "custom",
      message: "A source column can map to only one invitation field.",
    });
  }
}

export const importColumnMappingSchema = z
  .object(importColumnMappingShape)
  .superRefine(requireUniqueMappedColumns);

const suggestedImportColumnMappingSchema = z
  .object(importColumnMappingShape)
  .partial()
  .superRefine(requireUniqueMappedColumns);

export type ImportColumnMappingInput = z.infer<
  typeof importColumnMappingSchema
>;

export const importIssueSchema = z.object({
  code: z.string().trim().min(1).max(100),
  field: z.union([importMappingFieldSchema, z.literal("row")]),
  message: z.string().trim().min(1).max(500),
  duplicateInvitationIds: z.array(z.uuid()).max(100).optional(),
  duplicateRowNumbers: z.array(z.number().int().positive()).max(100).optional(),
});

export type ImportIssue = z.infer<typeof importIssueSchema>;

export const normalizedImportInvitationSchema = z.object({
  displayName: z.string().min(1).max(160),
  contactName: z.string().min(1).max(120),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/),
  phoneCountry: z.string().regex(/^[A-Z]{2}$/),
  invitationType: invitationTypeSchema,
  maxCompanions: z.number().int().min(0).max(100),
  members: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        isPrimary: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  internalNote: z.string().max(1_000).nullable(),
});

export type NormalizedImportInvitation = z.infer<
  typeof normalizedImportInvitationSchema
>;

const jsonScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export const importSourceDataSchema = z.record(z.string(), jsonScalarSchema);

export const importRowSchema = z.object({
  id: z.uuid(),
  rowNumber: z.number().int().min(2),
  status: importRowStatusSchema,
  sourceData: importSourceDataSchema,
  correctedData: importSourceDataSchema.nullable(),
  normalizedData: normalizedImportInvitationSchema.nullable(),
  errors: z.array(importIssueSchema),
  warnings: z.array(importIssueSchema),
  importedInvitationGroupId: z.uuid().nullable(),
  updatedAt: z.string(),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export const importJobSummarySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: importJobStatusSchema,
  originalFilename: z.string().min(1).max(255),
  mediaType: z.string().min(1).max(160),
  fileSizeBytes: z.number().int().positive(),
  worksheetName: z.string().max(120).nullable(),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  importedRows: z.number().int().nonnegative(),
  skippedRows: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});

export type ImportJobSummary = z.infer<typeof importJobSummarySchema>;

export const listImportJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: importJobStatusSchema.optional(),
});

export type ListImportJobsQuery = z.infer<typeof listImportJobsQuerySchema>;

export const listImportJobsResponseSchema = z.object({
  items: z.array(importJobSummarySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(50),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type ListImportJobsResponse = z.infer<
  typeof listImportJobsResponseSchema
>;

export const getImportJobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  rowStatus: importRowStatusSchema.optional(),
});

export type GetImportJobQuery = z.infer<typeof getImportJobQuerySchema>;

export const importJobDetailResponseSchema = z.object({
  job: importJobSummarySchema.extend({
    headers: z.array(z.string().min(1).max(120)).max(64),
    suggestedMapping: suggestedImportColumnMappingSchema.nullable(),
    columnMapping: importColumnMappingSchema.nullable(),
  }),
  rows: z.array(importRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type ImportJobDetailResponse = z.infer<
  typeof importJobDetailResponseSchema
>;

export const updateImportMappingSchema = z.object({
  mapping: importColumnMappingSchema,
  expectedVersion: z.number().int().positive(),
});

export type UpdateImportMappingInput = z.infer<
  typeof updateImportMappingSchema
>;

export const updateImportRowSchema = z.object({
  corrections: z
    .partialRecord(
      importMappingFieldSchema,
      z.union([z.string().max(1_000), z.number(), z.null()]),
    )
    .refine((value) => Object.keys(value).length > 0, {
      message: "Provide at least one corrected field.",
    }),
  expectedJobVersion: z.number().int().positive(),
});

export type UpdateImportRowInput = z.infer<typeof updateImportRowSchema>;

export const confirmImportSchema = z.object({
  duplicatePolicy: z.enum(["SKIP", "IMPORT"]),
  expectedVersion: z.number().int().positive(),
});

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;

export const confirmImportResultSchema = z.object({
  importJobId: z.uuid(),
  importedRows: z.number().int().nonnegative(),
  skippedRows: z.number().int().nonnegative(),
  duplicateRowsImported: z.number().int().nonnegative(),
  invitationGroupIds: z.array(z.uuid()),
  completedAt: z.string(),
});

export type ConfirmImportResult = z.infer<typeof confirmImportResultSchema>;

export const importLimitsSchema = z.object({
  acceptedExtensions: z.tuple([z.literal(".xlsx"), z.literal(".csv")]),
  maximumFileBytes: z
    .number()
    .int()
    .positive()
    .max(16 * 1024 * 1024),
  maximumRows: z.number().int().positive(),
  maximumColumns: z.number().int().positive(),
  maximumCellCharacters: z.number().int().positive(),
});

export type ImportLimits = z.infer<typeof importLimitsSchema>;
