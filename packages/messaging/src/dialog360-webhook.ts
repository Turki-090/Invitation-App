import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 360dialog forwards Meta's webhook body unchanged but does not forward or
 * re-create Meta's `X-Hub-Signature-256`, because the Meta app secret belongs
 * to 360dialog. What it does offer is static headers stored with the webhook
 * configuration and sent on every delivery, so the platform registers this
 * header with a high-entropy token and rejects any request that lacks it.
 */
export const DIALOG360_WEBHOOK_TOKEN_HEADER = "x-dawah-webhook-token";

export function verifyDialog360WebhookToken(
  suppliedToken: string | undefined,
  expectedToken: string,
): boolean {
  if (!suppliedToken || expectedToken.length === 0) return false;
  // Hashing first gives equal-length inputs, so the comparison time reveals
  // neither the token length nor how much of a guess was right.
  return timingSafeEqual(digest(suppliedToken), digest(expectedToken));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
