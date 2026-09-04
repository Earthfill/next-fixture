// ---------------------------------------------------------------------------
// Cache-aside service — shared by API routes and cron jobs
// ---------------------------------------------------------------------------
// Read-through pattern:
//   1. Redis (hot tier)      → return immediately when valid & fresh
//   2. PostgreSQL (durable)  → return + repopulate Redis when fresh
//   3. In-memory (dev tier)  → used ONLY when both Redis + PG are unavailable
//   4. API-Football          → fetch upstream, write back to all tiers, return
// Dynamic TTLs (see keys.ts): 24h schedules · 12h standings · 30s live.
// ---------------------------------------------------------------------------

import { redisGet, redisSet, redisDel, redisClearPrefix } from "./redis";
import {
  initPostgres,
  pgAvailable,
  pgCacheGet,
  pgCacheSet,
  pgCacheDelete,
  pgCacheClear,
} from "./postgres";

export type CacheSource = "redis" | "postgres" | "memory" | "api";

export interface CacheAsideResult<T> {
  data: T | null;
  source: CacheSource;
  fetchedAt: string;
}

// ─── In-memory fallback (dev / no-infra mode) ───────────────────────────

interface MemoryEntry {
  data: unknown;
  expiresAt: number;
}
const memoryStore = new Map<string, MemoryEntry>();
const MEMORY_MAX = 500;

function memoryGet<T>(key: string): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data as T;
}

function memorySet(key: string, data: unknown, ttlSeconds: number): void {
  memoryStore.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memoryStore.size > MEMORY_MAX) {
    const oldest = memoryStore.keys().next().value as string | undefined;
    if (oldest) memoryStore.delete(oldest);
  }
}

// ─── Core read-through ──────────────────────────────────────────────────

export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>
): Promise<CacheAsideResult<T>> {
  // Make sure the PostgreSQL schema/flag is initialized (no-op if no DATABASE_URL).
  await initPostgres();

  // 1. Redis — hottest tier
  const redisRaw = await redisGet(key).catch(() => null);
  if (redisRaw) {
    try {
      return { data: JSON.parse(redisRaw) as T, source: "redis", fetchedAt: new Date().toISOString() };
    } catch {
      // Corrupt payload → ignore and fall through to the next tier.
    }
  }

  // 2. PostgreSQL — durable tier (refreshes Redis on hit)
  if (pgAvailable()) {
    const pgRow = await pgCacheGet<T>(key);
    if (pgRow !== null) {
      await redisSet(key, JSON.stringify(pgRow), ttlSeconds).catch(() => false);
      return { data: pgRow, source: "postgres", fetchedAt: new Date().toISOString() };
    }
  }

  // 3. In-memory — only when neither Redis nor PostgreSQL is reachable
  if (!redisRaw && !pgAvailable()) {
    const mem = memoryGet<T>(key);
    if (mem !== null) {
      return { data: mem, source: "memory", fetchedAt: new Date().toISOString() };
    }
  }

  // 4. Miss → fetch upstream and write back (read-through)
  const data = await fetcher();
  if (data !== null && data !== undefined) {
    const payload = JSON.stringify(data);
    await Promise.allSettled([
      redisSet(key, payload, ttlSeconds),
      pgCacheSet(key, data, ttlSeconds),
    ]);
    if (!redisRaw && !pgAvailable()) {
      memorySet(key, data, ttlSeconds);
    }
  }
  return { data, source: "api", fetchedAt: new Date().toISOString() };
}

/** Peek at a cache key without triggering a fetch. Returns null on miss. */
export async function peekCache<T>(key: string): Promise<T | null> {
  await initPostgres();

  const redisRaw = await redisGet(key).catch(() => null);
  if (redisRaw) {
    try {
      return JSON.parse(redisRaw) as T;
    } catch {
      // fall through
    }
  }
  if (pgAvailable()) {
    return pgCacheGet<T>(key);
  }
  return memoryGet<T>(key);
}

/** Write a value into every available tier (used by cron to seed caches). */
export async function writeCache<T>(key: string, data: T, ttlSeconds: number): Promise<CacheSource> {
  await initPostgres();
  const payload = JSON.stringify(data);
  const [r, p] = await Promise.allSettled([
    redisSet(key, payload, ttlSeconds),
    pgCacheSet(key, data, ttlSeconds),
  ]);
  if (r.status === "fulfilled" && r.value) return "redis";
  if (p.status === "fulfilled" && p.value) return "postgres";
  memorySet(key, data, ttlSeconds);
  return "memory";
}

/** Remove a key from every tier. */
export async function invalidateCache(key: string): Promise<void> {
  await Promise.allSettled([redisDel(key), pgCacheDelete(key)]);
  memoryStore.delete(key);
}

/** Clear ALL cache tiers (memory, Redis, PostgreSQL). Used by the admin panel. */
export async function clearAllCaches(): Promise<{ memory: number; redis: boolean; postgres: boolean }> {
  const memory = memoryStore.size;
  memoryStore.clear();

  const [redis, postgres] = await Promise.all([
    redisClearPrefix("").then(() => true).catch(() => false),
    pgCacheClear(),
  ]);

  return { memory, redis, postgres };
}