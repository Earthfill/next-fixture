// ---------------------------------------------------------------------------
// PostgreSQL cache/durable store - pg Pool with graceful degradation
// ---------------------------------------------------------------------------
// One table (created by `npm run migrate`, NOT at runtime):
//   api_cache - key/value TTL store (the "PostgreSQL" tier of the cache-aside
//               pattern). Lives behind Redis as the durable layer.
//
// If DATABASE_URL is missing/unreachable the layer silently disables itself.

import { Pool } from "pg";

let pool: Pool | null = null;
let available = false;
let initPromise: Promise<boolean> | null = null;

const KV_TABLE = "api_cache";

function createPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  // Supabase (and most managed Postgres) REQUIRE TLS for direct connections.
  // Detect it via the host suffix or an explicit sslmode param - avoids the
  // "no pg_hba.conf entry / SSL required" errors once DNS starts resolving.
  const needsSsl =
    /\.supabase\.co/i.test(url) ||
    /\.supabase\.com/i.test(url) ||
    /sslmode=require|sslmode=verify-full/i.test(url);

  // Sized conservatively: on serverless each invocation gets its own module
  // instance, so a small pool avoids exhausting the database. The Supabase
  // pooler (used here) multiplexes connections in front of us.
  const rawMax = parseInt(process.env.PG_POOL_MAX as string, 10);
  const max = Number.isNaN(rawMax) ? undefined : Math.max(1, rawMax);

  return new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3000,
    // Bound any single query so a stuck statement cannot hold a connection open.
    statement_timeout: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Initialize the pool (connect + cheap availability check). This intentionally
 * does NOT run any DDL - schema is applied once at deploy time by
 * `npm run migrate` (scripts/migrate.ts). Safe to call repeatedly.
 */
export async function initPostgres(): Promise<boolean> {
  if (initPromise) return initPromise;

  if (!process.env.DATABASE_URL) {
    initPromise = Promise.resolve(false);
    return initPromise;
  }

  initPromise = (async () => {
    try {
      pool = createPool();
      if (!pool) return false;
      await pool.query("SELECT 1");
      available = true;
    } catch (err) {
      available = false;
      pool = null;
      initPromise = null; // allow a retry on the next request
      console.warn("[cache:pg] unavailable:", (err as Error).message);
    }
    return available;
  })();

  return initPromise;
}

export function pgAvailable(): boolean {
  return available;
}

// ---------- Key/Value cache tier -------------------------------------------

export async function pgCacheGet<T>(key: string): Promise<T | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT payload FROM "${KV_TABLE}" WHERE cache_key = $1 AND expires_at > now()`,
      [key]
    );
    return (res.rows[0]?.payload as T) ?? null;
  } catch (err) {
    console.warn("[cache:pg] get failed:", (err as Error).message);
    return null;
  }
}

export async function pgCacheSet(key: string, payload: unknown, ttlSeconds: number): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${KV_TABLE}" (cache_key, payload, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))
       ON CONFLICT (cache_key)
       DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(payload), ttlSeconds]
    );
    return true;
  } catch (err) {
    console.warn("[cache:pg] set failed:", (err as Error).message);
    return false;
  }
}

export async function pgCacheDelete(key: string): Promise<void> {
  await initPostgres();
  if (!pool || !available) return;
  try {
    await pool.query(`DELETE FROM "${KV_TABLE}" WHERE cache_key = $1`, [key]);
  } catch {
    // non-fatal
  }
}

// ---------- Clear all cached rows (admin "Clear Cache" action) -------------

export async function pgCacheClear(): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${KV_TABLE}"`);
    return true;
  } catch {
    return false;
  }
}
