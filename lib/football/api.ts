// ---------------------------------------------------------------------------
// API-Football client (RapidAPI)  lightweight, no file cache
// ---------------------------------------------------------------------------
// In-memory dedup cache prevents duplicate concurrent calls within a single
// request cycle. No cross-request caching  ISR handles that.
// ---------------------------------------------------------------------------

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const API_BASE = "https://" + RAPIDAPI_HOST;

// Per-attempt timeout  never let a hanging DNS/TCP hold the request forever.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

// Global outbound rate limit (per-minute) - token bucket. Prevents bursts from
// tripping API-Football's per-minute limit (free tier is ~10 requests/minute).
// Raise via API_FOOTBALL_RATE_LIMIT_RPM if your plan allows more.
const RATE_LIMIT_RPM = Math.max(1, parseInt(process.env.API_FOOTBALL_RATE_LIMIT_RPM || "", 10) || 10);

// Backoff (ms) before retrying when a rate-limit error is returned. The retry
// delay scales with the attempt number (see fetchWithRetry).
const RATE_LIMIT_BACKOFF_MS = parseInt(process.env.API_FOOTBALL_RATE_LIMIT_BACKOFF_MS || "", 10) || 4000;

// DNS / network error codes that are usually TRANSIENT  worth retrying.
const TRANSIENT_CODES = new Set([
  "EAI_AGAIN", // temporary DNS resolution failure (server/network hiccup)
  "ENOTFOUND", // host not found (appears during DNS propagation failures
  "ENETUNREACH", // network unreachable
  "ECONNRESET", // connection reset by peer
  "ECONNREFUSED", // connection refused (API edge briefly down
  "ETIMEDOUT", // socket timeout
  "EPIPE", // broken pipe
  "EHOSTUNREACH", // host unreachable
  "UND_ERR", // undici fetch timeout / DNS error wrapper
  "ECONNABORTED",
]);

// Most recent quota info returned by API-Football response headers.


// Used to surface rate-limit awareness to the caching layer and jobs.
let lastQuota: { limit: number; used: number; remaining: number } | null = null;

export function hasApi(): boolean {
  return Boolean(RAPIDAPI_KEY);
}

/** Returns the last observed quota/rate-limit usage, or null if unknown yet. */
export function getQuota(): { limit: number; used: number; remaining: number } | null {
  return lastQuota;
}

//  In-memory dedup cache (request-scoped only) 
const dedupCache = new Map<string, Promise<any>>();

//  Public fetch function 
export async function apiFetch<T>(path: string): Promise<T | null> {
  if (!RAPIDAPI_KEY) return null;

  // Deduplicate concurrent calls within the same request
  if (dedupCache.has(path)) {
    return dedupCache.get(path)! as Promise<T | null>;
  }

  const promise = (async () => {
    await acquireRateSlot(); // throttle: stay under the per-minute limit
    return fetchWithRetry<T>(path);
  })();
  dedupCache.set(path, promise);
  promise.finally(() => dedupCache.delete(path));

  return promise;
}

/** Backoff delay with exponential growth + jitter: ~800ms  ~1.6s  ~3.2s max. */
function backoffMs(attempt: number): number {
  const base = Math.min(800 * Math.pow(2, attempt), 5000);
  return base + Math.floor(Math.random() * 300);
}

/** Classify an unknown thrown error: is it a transient network/DNS failure worth retrying? */
function isTransientError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } }).cause;
  const code = (err as { code?: string }).code || cause?.code;

  if (code && TRANSIENT_CODES.has(code)) return true;

  // undici wraps DNS failures as TypeError: fetch failed with cause.code = "EAI_AGAIN"
  if ((err as Error).message?.includes("fetch failed") && cause?.code) return true;

  return false;
}

// --- Token-bucket rate limiter (global, outbound) --------------------------
// Serializes bursts so we never exceed RATE_LIMIT_RPM requests per minute.
// Note: this is per-process; on serverless each instance has its own bucket.

let rateTokens = RATE_LIMIT_RPM;
let rateLastRefill = Date.now();

function refillRateTokens(): void {
  const now = Date.now();
  const elapsedSec = (now - rateLastRefill) / 1000;
  rateTokens = Math.min(RATE_LIMIT_RPM, rateTokens + elapsedSec * (RATE_LIMIT_RPM / 60));
  rateLastRefill = now;
}

async function acquireRateSlot(): Promise<void> {
  while (true) {
    refillRateTokens();
    if (rateTokens >= 1) {
      rateTokens -= 1;
      return;
    }
    // Not enough tokens - wait until one refills, then re-check.
    const waitMs = Math.min(
      Math.ceil(((1 - rateTokens) / (RATE_LIMIT_RPM / 60)) * 1000),
      60_000
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

async function fetchWithRetry<T>(path: string): Promise<T | null> {
  for (let attempt =  0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "x-apisports-key": RAPIDAPI_KEY! } as HeadersInit,
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 429) {
        console.warn("[api-football] rate limited (429)  retry", attempt + 1);
        await new Promise((r) => setTimeout(r, (attempt +  1) * 2000));
        updateQuotaFromHeaders(res.headers);
        continue;
      }

      if (!res.ok) {
        console.warn("[api-football] HTTP", res.status, "for", path);
        updateQuotaFromHeaders(res.headers);
        return null;
      }

      // Rate-limit awareness  track and log remaining quota headers
      updateQuotaFromHeaders(res.headers);

      const json = await res.json();
      if (json.errors && Object.keys(json.errors).length > 0) {
        // API-Football reports the per-minute limit as HTTP 200 + errors.rateLimit
        // (NOT as an HTTP 429). Back off and retry instead of giving up.
        if (json.errors.rateLimit) {
          console.warn("[api-football] rate limit:", json.errors.rateLimit);
          if (attempt < MAX_ATTEMPTS - 1) {
            const delay = RATE_LIMIT_BACKOFF_MS * (attempt + 1);
            console.warn(`[api-football] backing off ${delay}ms then retrying...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }
        console.warn("[api-football] errors:", json.errors);
        return null;
      }

      return json as T;
    } catch (err) {
      const transient =isTransientError(err);
      const code = (err as { cause?: { code?: string } }).cause?.code || (err as { code?: string }).code || "unknown";

      if (!transient || attempt === MAX_ATTEMPTS -  1) {
        console.warn(`[api-football] fetch failed (${code}): ${path}  ${transient ? "giving up after retries" : "non-retryable"}`);
        return null;
      }

      const delay = backoffMs(attempt);
      console.warn(`[api-football] transient ${code} error on ${path}  retry ${attempt +  1}/${MAX_ATTEMPTS} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

//  Clear dedup cache (for admin panel) 
export function clearApiCache(): void {
  dedupCache.clear();
}

//  Rate-limit header parsing 
// API-Football / RapidAPI returns x-ratelimit-remaining, x-ratelimit-limit
// and x-ratelimit-used on every response. We log them (especially when the
// quota is getting low) so the backend is aware of limits without calling out.

function updateQuotaFromHeaders(headers: Headers): void {
  try {
    const remaining = parseInt(headers.get("x-ratelimit-remaining") || "", 10);
    const limit = parseInt(headers.get("x-ratelimit-limit") || "", 10);
    const used = parseInt(headers.get("x-ratelimit-used") || "",  10);

    if (Number.isNaN(remaining)) return; // header absent on this environment
    lastQuota = { limit: Number.isNaN(limit) ? 0 : limit, used: Number.isNaN(used) ? 0 : used, remaining };

    if (remaining <= 10) {
      console.warn(`[api-football] quota low  ${remaining}/${limit || "?"} remaining (${used || "?"} used)`);
    } else if (remaining <= 50) {
      console.log(`[api-football] quota remaining: ${remaining}/${limit || "?"}`);
    }
  } catch {
    // Non-fatal  never let header parsing break a request.


  }
}