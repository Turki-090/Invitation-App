import { z } from "zod";

/**
 * Public, non-secret credential used only by the explicitly enabled local
 * development auth bypass. The API always rejects it in production.
 */
export const DEVELOPMENT_ACCESS_TOKEN = "dawah-local-development";

/**
 * Failure envelope required by Supabase Auth hooks.
 *
 * The hook is called by Supabase rather than by a product client, and Supabase
 * surfaces `message` to the caller that asked for a code. It therefore keeps
 * the provider's own shape instead of the platform `ApiError` shape, and the
 * message stays operator-readable without naming the recipient.
 */
export const supabaseAuthHookErrorSchema = z.object({
  error: z.object({
    http_code: z.number().int().min(400).max(599),
    message: z.string().min(1),
  }),
});
export type SupabaseAuthHookError = z.infer<typeof supabaseAuthHookErrorSchema>;
