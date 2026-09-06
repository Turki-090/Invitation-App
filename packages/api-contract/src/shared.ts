import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const readinessSchema = z.object({
  status: z.literal("ok"),
  checks: z.object({
    database: z.literal("ok"),
    redis: z.literal("ok"),
  }),
});

export type Readiness = z.infer<typeof readinessSchema>;
