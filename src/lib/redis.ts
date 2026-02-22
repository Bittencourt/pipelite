import Redis from "ioredis"

let redis: Redis | null = null

/**
 * Get Redis client (optional - for session caching)
 * Returns null if REDIS_URL is not configured
 */
export function getRedisClient(): Redis | null {
  if (redis) return redis

  if (!process.env.REDIS_URL) {
    console.info("REDIS_URL not configured - using database sessions only")
    return null
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })

    redis.on("error", (err) => {
      console.error("Redis connection error:", err)
    })

    redis.on("connect", () => {
      console.info("Redis connected successfully")
    })

    return redis
  } catch (error) {
    console.error("Failed to initialize Redis:", error)
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
