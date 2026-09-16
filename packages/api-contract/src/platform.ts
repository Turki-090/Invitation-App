import { z } from "zod";

export const CURRENT_API_VERSION = "v1" as const;
export const MINIMUM_SUPPORTED_API_VERSION = "v1" as const;
/** Null until a native host/check-in client has been released. */
export const MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION: string | null = null;

const nativeClientVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/)
  .nullable();

export const platformMetadataSchema = z
  .object({
    apiVersion: z.literal(CURRENT_API_VERSION),
    minimumSupportedApiVersion: z.literal(MINIMUM_SUPPORTED_API_VERSION),
    features: z
      .object({
        reportsEnabled: z.boolean(),
        exportsEnabled: z.boolean(),
        checkInEnabled: z.boolean(),
        billingEnabled: z.boolean(),
        paymentsEnabled: z.boolean(),
      })
      .strict(),
    nativeClients: z
      .object({
        ios: z
          .object({
            minimumSupportedVersion: nativeClientVersionSchema,
            latestVersion: nativeClientVersionSchema,
          })
          .strict(),
        android: z
          .object({
            minimumSupportedVersion: nativeClientVersionSchema,
            latestVersion: nativeClientVersionSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type PlatformMetadata = z.infer<typeof platformMetadataSchema>;
