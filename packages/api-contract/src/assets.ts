import { z } from "zod";

export const ASSET_KINDS = ["EVENT_IMAGE", "INVITATION_ASSET"] as const;

export const assetKindSchema = z.enum(ASSET_KINDS);

export const storedAssetSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  kind: assetKindSchema,
  originalFilename: z.string().min(1).max(255),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type StoredAsset = z.infer<typeof storedAssetSchema>;

export const listAssetsQuerySchema = z.object({
  kind: assetKindSchema.optional(),
  includeArchived: z
    .preprocess(
      (value) => (value === "true" ? true : value === "false" ? false : value),
      z.boolean(),
    )
    .default(false),
});

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export const listAssetsResponseSchema = z.object({
  items: z.array(storedAssetSchema),
});

export type ListAssetsResponse = z.infer<typeof listAssetsResponseSchema>;

export const assetUploadFieldsSchema = z.object({
  kind: z.enum(["EVENT_IMAGE", "INVITATION_ASSET"]),
});

export type AssetUploadFields = z.infer<typeof assetUploadFieldsSchema>;
