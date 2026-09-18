// ---------------------------------------------------------------------------
// Redis client — ioredis singleton with graceful degradation
// ---------------------------------------------------------------------------
// If REDIS_URL is missing or Redis is unreachable, redisAvailable() becomes
// false and the cache-aside layer silently falls back to PostgreSQL (or the
// in-memory store). The Next.js app must never crash over an unavailable cache.

import Redis, { type RedisOptions } from "ioredis";

let redis: Redis | null = null;
let available = false;
let connecting: Promise<void> | null = null;

export function redisAvailable(): boolean {
  return available;
}

/** Parse REDIS_URL into explicit ioredis options (handles rediss:// with no port
 * and passes TLS SNI servername, which the string-URL form can mishandle). */
function parseRedisOptions(url: string): RedisOptions | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname;
  if (!host) return null;
  const opts: RedisOptions = {
    host,
    port: Number(u.port || 6379),
  };
  if (u.username) opts.username = u.username;
  if (u.password) opts.password = u.password;
  if (u.protocol === "rediss:") opts.tls = { servername: host };
  return opts;
}

function getClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis) return redis;

  const opts = parseRedisOptions(url);
  if (!opts) return null;

  redis = new Redis({
    ...opts,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 15000,
    // Keep retrying with capped backoff so a hibernating DB (Layerbase cold-wakes
    // take ~1-5s) reconnects instead of permanently killing Redis for this
    // process. Bounded (~40-60s window) so serverless invocations don't hang.
    retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 1000, 8000)),
  } as RedisOptions);

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

/**
 * Expose the connected client for advanced/atomic commands (INCR, EVAL, ...).
 * Returns null when Redis is not configured or currently unavailable.
 */
export async function redisClient(): Promise<Redis | null> {
  return ensureConnected();
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