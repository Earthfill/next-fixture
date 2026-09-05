// ---------------------------------------------------------------------------
// Circuit breaker for API-Football (shared across serverless instances via Redis)
// ---------------------------------------------------------------------------
// "3 failures in 60s -> open for 30s". When open, every API-Football call
// short-circuits to null so a down/throttled upstream can't cascade latency
// into our own responses. State is stored in Redis so the breaker is shared
// across all serverless instances; if Redis is unavailable we fall back to a
// per-instance in-memory breaker.
// ---------------------------------------------------------------------------

import { redisClient } from "@/lib/cache/redis";

const FAILS_KEY = "cb:football:fails";
const OPEN_KEY = "cb:football:open";

const THRESHOLD = parseInt(process.env.API_FOOTBALL_CB_THRESHOLD || "3", 10);
const WINDOW_SECONDS = parseInt(process.env.API_FOOTBALL_CB_WINDOW_SECONDS || "60", 10);
const OPEN_SECONDS = parseInt(process.env.API_FOOTBALL_CB_OPEN_SECONDS || "30", 10);

// --- Redis-backed state -----------------------------------------------------

async function redisIsOpen(): Promise<boolean | null> {
  const client = await redisClient();
  if (!client) return null;
  try {
    return (await client.exists(OPEN_KEY)) === 1;
  } catch {
    return null;
  }
}

async function redisRecordFailure(): Promise<boolean> {
  const client = await redisClient();
  if (!client) return false;
  try {
    const count = await client.incr(FAILS_KEY);
    if (count === 1) await client.expire(FAILS_KEY, WINDOW_SECONDS);
    if (count >= THRESHOLD) {
      await client.set(OPEN_KEY, "1", "EX", OPEN_SECONDS);
      await client.del(FAILS_KEY);
      console.warn(`[api-football:cb] OPEN for ${OPEN_SECONDS}s after ${count} failures`);
    }
    return true;
  } catch {
    return false;
  }
}

async function redisRecordSuccess(): Promise<void> {
  const client = await redisClient();
  if (!client) return;
  try {
    await client.del(FAILS_KEY);
  } catch {
    // non-fatal
  }
}

// --- In-memory fallback (per-instance) -------------------------------------

let memState: "closed" | "open" = "closed";
let memFails = 0;
let memWindowStart = 0;
let memOpenedAt = 0;

function memIsOpen(): boolean {
  if (memState === "open" && Date.now() - memOpenedAt >= OPEN_SECONDS * 1000) {
    memState = "closed"; // half-open: allow the next call through as a probe
    memFails = 0;
    memWindowStart = Date.now();
  }
  return memState === "open";
}

function memRecordFailure(): void {
  if (memState === "open") return;
  const now = Date.now();
  if (now - memWindowStart >= WINDOW_SECONDS * 1000) {
    memWindowStart = now;
    memFails = 0;
  }
  memFails += 1;
  if (memFails >= THRESHOLD) {
    memState = "open";
    memOpenedAt = now;
    memFails = 0;
    console.warn(`[api-football:cb] OPEN (memory) for ${OPEN_SECONDS}s`);
  }
}

function memRecordSuccess(): void {
  memFails = 0;
  memWindowStart = Date.now();
  if (memState === "open") memState = "closed"; // half-open probe succeeded
}

// --- Public API -------------------------------------------------------------

/** True when the breaker is open and calls should short-circuit. */
export async function isCircuitOpen(): Promise<boolean> {
  const redis = await redisIsOpen();
  if (redis !== null) return redis;
  return memIsOpen();
}

/** Record a failed upstream call. */
export async function recordFailure(): Promise<void> {
  const ok = await redisRecordFailure();
  if (!ok) memRecordFailure();
}

/** Record a successful upstream call. */
export async function recordSuccess(): Promise<void> {
  await redisRecordSuccess();
  memRecordSuccess();
}

/** Reset the breaker (used by the admin "Clear Cache" action). */
export async function resetCircuitBreaker(): Promise<void> {
  memFails = 0;
  memWindowStart = 0;
  memOpenedAt = 0;
  memState = "closed";
  const client = await redisClient();
  if (!client) return;
  try {
    await client.del(FAILS_KEY, OPEN_KEY);
  } catch {
    // non-fatal
  }
}
