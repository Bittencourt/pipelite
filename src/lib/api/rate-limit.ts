import { getRedisClient } from "@/lib/redis"

const RATE_LIMIT = 500 // requests per window
const WINDOW_SECONDS = 60 // 1 minute window

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number
}

/**
 * Check rate limit for an API key using Redis sliding window
 * 
 * - 500 requests per 60 seconds per keyId
 * - Uses Redis INCR + EXPIRE pattern
 * - Fail-open: if Redis unavailable, log warning and allow request
 * 
 * @param keyId - The API key identifier
 * @returns Rate limit status with remaining count and seconds until reset
 */
export async function checkRateLimit(keyId: string): Promise<RateLimitResult> {
  const redis = getRedisClient()

  if (!redis) {
    // No Redis configured - fail open for availability
    console.warn(
      "Rate limiting skipped: Redis not configured. All requests allowed."
    )
    return { allowed: true, remaining: RATE_LIMIT, resetIn: WINDOW_SECONDS }
  }

  const key = `ratelimit:${keyId}`

  try {
    const current = await redis.incr(key)

    // Set expiry on first increment
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS)
    }

    const ttl = await redis.ttl(key)

    return {
      allowed: current <= RATE_LIMIT,
      remaining: Math.max(0, RATE_LIMIT - current),
      resetIn: ttl > 0 ? ttl : WINDOW_SECONDS,
    }
  } catch (error) {
    // Redis error - fail open
    console.error("Rate limiting error:", error)
    return { allowed: true, remaining: RATE_LIMIT, resetIn: WINDOW_SECONDS }
  }
}
