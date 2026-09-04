// ---------------------------------------------------------------------------
// Rate limiter — lightweight in-memory sliding-window per IP + scope
// ---------------------------------------------------------------------------
// Next.js Route Handlers don't use Express middleware, so express-rate-limit
// is not applicable here. This in-memory limiter implements the same
// sliding-window semantics (defaults below, overridable via env):
//   RATE_LIMIT_MAX   — max requests per IP per window (default 120)
//   RATE_LIMIT_WINDOW— window in seconds (default 60)
// ---------------------------------------------------------------------------

export type RateScope = "fixtures" | "standings" | "live";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window resets
}

const MAX = parseInt(process.env.RATE_LIMIT_MAX || "120", 10);
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW || "60", 10) * 1000;

// Per-scope stricter limits (fixtures/live are the most likely to be scraped).
const SCOPE_LIMITS: Record<RateScope, number> = {
  fixtures: Math.min(MAX, 60),
  standings: Math.min(MAX, 60),
  live: Math.min(MAX, 120),
};

const buckets = new Map<string, number[]>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function pruneBuckets(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, arr] of buckets) {
    const fresh = arr.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

/** Apply the classic sliding-window rate limit. Call at the top of a handler. */
export function checkRateLimit(request: Request, scope: RateScope): RateLimitResult {
  const key = `${scope}:${clientIp(request)}`;
  const now = Date.now();
  const limit = SCOPE_LIMITS[scope];

  pruneBuckets(now);

  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (hits.length >= limit) {
    const resetAt = (hits[0] || now) + WINDOW_MS;
    return { allowed: false, remaining: 0, resetAt };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, remaining: limit - hits.length, resetAt: (hits[0] || now) + WINDOW_MS };
}