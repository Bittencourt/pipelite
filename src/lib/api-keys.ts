import { randomBytes, createHash } from "crypto"
import { db } from "@/db"
import { apiKeys } from "@/db/schema/api-keys"
import { eq } from "drizzle-orm"

const KEY_PREFIX = "pk_live_" // Identifiable prefix for Pipelite keys

interface CreateApiKeyResult {
  fullKey: string // Only shown ONCE on creation
  keyPrefix: string // Stored for display (first 12 chars)
  id: string
}

/**
 * Generate a new API key for a user
 * - Creates 32 random bytes, base64url encoded
 * - Stores SHA-256 hash only (never store full key)
 * - Returns full key ONCE - cannot be retrieved again
 */
export async function generateApiKey(
  userId: string,
  name: string
): Promise<CreateApiKeyResult> {
  // Generate random key material
  const randomPart = randomBytes(32).toString("base64url")
  const fullKey = `${KEY_PREFIX}${randomPart}`

  // Hash for storage - NEVER store full key
  const keyHash = createHash("sha256").update(fullKey).digest("hex")
  const keyPrefix = fullKey.slice(0, 12) // pk_live_abc1

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyPrefix,
      keyHash,
    })
    .returning()

  return {
    fullKey, // Return once - caller must display immediately
    keyPrefix: apiKey.keyPrefix,
    id: apiKey.id,
  }
}

/**
 * Validate an API key and return the associated user
 * - Hashes the provided key and compares to stored hash
 * - Updates lastUsedAt timestamp
 * - Returns null if key not found or soft-deleted
 */
export async function validateApiKey(
  key: string
): Promise<{ userId: string; keyId: string } | null> {
  if (!key.startsWith(KEY_PREFIX)) {
    return null
  }

  const keyHash = createHash("sha256").update(key).digest("hex")

  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  })

  if (!apiKey || apiKey.deletedAt) {
    return null
  }

  // Update last used timestamp (fire-and-forget, don't block validation)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(console.error)

  return {
    userId: apiKey.userId,
    keyId: apiKey.id,
  }
}

/**
 * Regenerate an API key (creates new key value, keeps name)
 * - Soft deletes old key by setting deletedAt
 * - Creates new key with same name
 * - Returns full key ONCE
 */
export async function regenerateApiKey(
  keyId: string,
  userId: string
): Promise<CreateApiKeyResult | null> {
  // Get existing key
  const existingKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, keyId),
  })

  if (!existingKey || existingKey.userId !== userId || existingKey.deletedAt) {
    return null
  }

  // Soft delete old key
  await db
    .update(apiKeys)
    .set({ deletedAt: new Date() })
    .where(eq(apiKeys.id, keyId))

  // Generate new key with same name
  return generateApiKey(userId, existingKey.name)
}

/**
 * Mask a key for display (show prefix and last 4 chars)
 * e.g., pk_live_abc1****xyz9
 */
export function maskKey(key: string): string {
  if (key.length < 16) return key
  return key.slice(0, 12) + "****" + key.slice(-4)
}

/**
 * Mask from stored keyPrefix (for display when full key not available)
 * e.g., pk_live_abc1**** (without suffix)
 */
export function maskFromPrefix(keyPrefix: string): string {
  return keyPrefix + "****"
}
