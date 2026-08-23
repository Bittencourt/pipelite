import Redis from "ioredis"
import { log } from "@/lib/log"

let redis: Redis | null = null

/**
 * Get Redis client (optional - for session caching)
 * Returns null if REDIS_URL is not configured
 */
export function getRedisClient(): Redis | null {
  if (redis) return redis

  if (!process.env.REDIS_URL) {
    log.info("lib/redis", "REDIS_URL not configured - using database sessions only")
    return null
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })

    redis.on("error", (err) => {
      log.error("lib/redis", "Redis connection error", { err })
    })

    redis.on("connect", () => {
      log.info("lib/redis", "Redis connected successfully")
    })

    return redis
  } catch (error) {
    log.error("lib/redis", "Failed to initialize Redis", { err: error })
    return null
  }
}

/**
 * Cache helper with TTL
 */
export async function cacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const client = getRedisClient()

  if (client) {
    const cached = await client.get(key)
    if (cached) {
      return JSON.parse(cached) as T
    }
  }

  const data = await fetcher()

  if (client) {
    await client.setex(key, ttlSeconds, JSON.stringify(data))
  }

  return data
}

/**
 * Invalidate cache key
 */
export async function cacheInvalidate(key: string): Promise<void> {
  const client = getRedisClient()
  if (client) {
    await client.del(key)
  }
}
