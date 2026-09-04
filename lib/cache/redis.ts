// ---------------------------------------------------------------------------
// Redis client — ioredis singleton with graceful degradation
// ---------------------------------------------------------------------------
// If REDIS_URL is missing or Redis is unreachable, redisAvailable() becomes
// false and the cache-aside layer silently falls back to PostgreSQL (or the
// in-memory store). The Next.js app must never crash over an unavailable cache.

import Redis from "ioredis";

let redis: Redis | null = null;
let available = false;
let connecting: Promise<void> | null = null;

export function redisAvailable(): boolean {
  return available;
}

function getClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis) return redis;

  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    // Never keep retrying forever — mark unavailable and let the caller fall back.
    retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
  });

  redis.on("connect", () => {
    available = true;
  });
  redis.on("error", (err) => {
    available = false;
    console.warn("[cache:redis] error:", err.message);
  });
  redis.on("close", () => {
    available = false;
  });

  connecting = redis.connect().catch((err) => {
    available = false;
    console.warn("[cache:redis] connection failed:", err.message);
  });

  return redis;
}

async function ensureConnected(): Promise<Redis | null> {
  const client = getClient();
  if (!client) return null;
  if (connecting) {
    await connecting.catch(() => undefined);
    connecting = null;
  }
  if (!available) return null;
  return client;
}

/** Get a raw value from Redis, or null when missing/unavailable. */
export async function redisGet(key: string): Promise<string | null> {
  const client = await ensureConnected();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (err) {
    available = false;
    console.warn("[cache:redis] get failed:", (err as Error).message);
    return null;
  }
}

/** Set a value in Redis with a TTL in seconds. Returns false when unavailable. */
export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const client = await ensureConnected();
  if (!client) return false;
  try {
    await client.set(key, value, "EX", ttlSeconds);
    available = true;
    return true;
  } catch (err) {
    available = false;
    console.warn("[cache:redis] set failed:", (err as Error).message);
    return false;
  }
}

/** Delete a key (used by the admin/seed flow). */
export async function redisDel(key: string): Promise<void> {
  const client = await ensureConnected();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // non-fatal
  }
}

/** Clear all cache keys under a prefix (e.g. all fixture keys). */
export async function redisClearPrefix(prefix: string): Promise<void> {
  const client = await ensureConnected();
  if (!client) return;
  try {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(...keys);
  } catch {
    // non-fatal
  }
}

export function shutdownRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
    available = false;
  }
}