import { z } from "zod";

export const EXPORT_FORMATS = ["CSV", "XLSX"] as const;
export const EXPORT_PRESETS = [
  "FULL_GUEST_LIST",
  "CONFIRMED_ATTENDANCE",
  "PENDING_RSVP",
  "CHECK_IN_LIST",
  "FINAL_ATTENDANCE",
] as const;
export const EXPORT_JOB_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
] as const;

export const exportFormatSchema = z.enum(EXPORT_FORMATS);
export const exportPresetSchema = z.enum(EXPORT_PRESETS);
export const exportJobStatusSchema = z.enum(EXPORT_JOB_STATUSES);

export const createExportSchema = z.object({
  format: exportFormatSchema,
  preset: exportPresetSchema,
});

export type CreateExportInput = z.infer<typeof createExportSchema>;

export const exportOutputSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadUrl: z.string().min(1),
});

export const exportJobSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  format: exportFormatSchema,
  preset: exportPresetSchema,
  status: exportJobStatusSchema,
  rowCount: z.number().int().nonnegative().nullable(),
  output: exportOutputSchema.nullable(),
  failureCode: z.string().max(100).nullable(),
  failureMessage: z.string().max(1_000).nullable(),
  requestedAt: z.string(),
  processingAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export type ExportJob = z.infer<typeof exportJobSchema>;

export const listExportJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: exportJobStatusSchema.optional(),
});

export type ListExportJobsQuery = z.infer<typeof listExportJobsQuerySchema>;

export const listExportJobsResponseSchema = z.object({
  items: z.array(exportJobSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(50),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type ListExportJobsResponse = z.infer<
  typeof listExportJobsResponseSchema
>;

export const exportDownloadQuerySchema = z.object({
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ExportDownloadQuery = z.infer<typeof exportDownloadQuerySchema>;
