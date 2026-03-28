import crypto from "node:crypto"

/**
 * Generate a cryptographically secure webhook secret.
 * Returns a 64-character hex string (32 random bytes).
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Verify a provided webhook secret against a stored secret using
 * timing-safe comparison to prevent timing attacks.
 *
 * Returns false for empty strings or different-length strings.
 */
export function verifyWebhookSecret(provided: string, stored: string): boolean {
  if (!provided || !stored) return false

  const providedBuf = Buffer.from(provided, "utf-8")
  const storedBuf = Buffer.from(stored, "utf-8")

  if (providedBuf.length !== storedBuf.length) return false

  return crypto.timingSafeEqual(providedBuf, storedBuf)
}
