// ---------------------------------------------------------------------------
// Rate limiter - Redis-backed fixed-window counter per IP + scope, with an
// in-memory fallback when Redis is unreachable.
// ---------------------------------------------------------------------------
// Next.js Route Handlers don't use Express middleware, so express-rate-limit
// is not applicable here. The limiter enforces a per-IP, per-scope budget
// (defaults below, overridable via env):
//   RATE_LIMIT_MAX     - max requests per IP per window (default 120)
//   RATE_LIMIT_WINDOW  - window in seconds (default 60)
//
// State lives in Redis (Upstash) so the limit is SHARED across every
// serverless instance - a bad actor cannot bypass it by hitting different
// instances. If Redis is down we degrade to a best-effort in-memory counter
// (per-instance) rather than failing requests.
// ---------------------------------------------------------------------------

import { redisClient } from "@/lib/cache/redis";

export type RateScope = "fixtures" | "standings" | "live";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window resets
}

const MAX = parseInt(process.env.RATE_LIMIT_MAX as string, 10);
const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW as string, 10);
const WINDOW_MS = WINDOW_SECONDS * 1000;

// Per-scope stricter limits (fixtures/live are the most likely to be scraped).
const SCOPE_LIMITS: Record<RateScope, number> = {
  fixtures: Math.min(MAX, 60),
  standings: Math.min(MAX, 60),
  live: Math.min(MAX, 120),
};

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// --- Redis (shared) implementation -----------------------------------------
// Atomic INCR + EXPIRE in one Lua script so a new window always gets a TTL
// (no orphaned keys if the process dies between two separate commands).

const LUA_INCR = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('TTL', KEYS[1])}
`;

async function redisCheck(scope: RateScope, ip: string, limit: number): Promise<RateLimitResult | null> {
  const client = await redisClient();
  if (!client) return null;
  const key = `rl:${scope}:${ip}`;
  try {
    const result = (await client.eval(LUA_INCR, 1, key, WINDOW_SECONDS)) as [unknown, unknown];
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    const resetAt = Date.now() + ttl * 1000;
    if (count > limit) {
      return { allowed: false, remaining: 0, resetAt };
    }
    return { allowed: true, remaining: limit - count, resetAt };
  } catch {
    return null; // Redis failure -> fall back to in-memory
  }
}

// --- In-memory fallback (per-instance, best-effort when Redis is down) -----

const buckets = new Map<string, number[]>();

function pruneBuckets(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, arr] of buckets) {
    const fresh = arr.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

function memoryCheck(key: string, limit: number, now: number): RateLimitResult {
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    const resetAt = (hits[0] || now) + WINDOW_MS;
    return { allowed: false, remaining: 0, resetAt };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, resetAt: (hits[0] || now) + WINDOW_MS };
}

/** Apply the per-IP, per-scope rate limit. Await at the top of a handler. */
export async function checkRateLimit(request: Request, scope: RateScope): Promise<RateLimitResult> {
  const ip = clientIp(request);
  const limit = SCOPE_LIMITS[scope];
  const now = Date.now();

  const redisResult = await redisCheck(scope, ip, limit);
  if (redisResult) return redisResult;

  pruneBuckets(now);
  return memoryCheck(`${scope}:${ip}`, limit, now);
}
