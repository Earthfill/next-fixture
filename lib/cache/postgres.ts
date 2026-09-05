// ---------------------------------------------------------------------------
// PostgreSQL cache/durable store - pg Pool with graceful degradation
// ---------------------------------------------------------------------------
// Two tables (created by `npm run migrate`, NOT at runtime):
//   api_cache - key/value TTL store (the "PostgreSQL" tier of the cache-aside
//               pattern). Lives behind Redis as the durable layer.
//   matches   - one row per fixture. Used by the live-poll job to determine
//               whether "active live matches are occurring in the database"
//               before spending an API-Football request.
//
// If DATABASE_URL is missing/unreachable the layer silently disables itself.

import { Pool } from "pg";

import type { Fixture } from "@/lib/types";

let pool: Pool | null = null;
let available = false;
let initPromise: Promise<boolean> | null = null;

const KV_TABLE = "api_cache";
const MATCHES_TABLE = "matches";

/** Fixture statuses from apiFixtureToFixture() ("upcoming" | "live" | "finished"). */
function matchesStillActive(): string {
  return `(
    status = 'live'
    OR (
      status = 'upcoming'
      AND kickoff BETWEEN now() - interval '3 hours' AND now() + interval '30 minutes'
    )
  )`;
}

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
  const max = parseInt(process.env.PG_POOL_MAX as string, 10);

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
  if (!pool || !available) return;
  try {
    await pool.query(`DELETE FROM "${KV_TABLE}" WHERE cache_key = $1`, [key]);
  } catch {
    // non-fatal
  }
}

// ---------- Matches table (durable source for the live-poll gate) ----------

export async function upsertMatches(fixtures: Fixture[]): Promise<void> {
  if (!pool || !available || !fixtures.length) return;
  for (const f of fixtures) {
    try {
      await pool.query(
        `INSERT INTO "${MATCHES_TABLE}"
           (id, league, season, home_team, away_team, kickoff, status, home_score, away_score, payload, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (id)
         DO UPDATE SET
           status = EXCLUDED.status,
           home_score = EXCLUDED.home_score,
           away_score = EXCLUDED.away_score,
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [
          f.id,
          f.competition,
          f.matchday ?? null,
          f.homeTeam.name,
          f.awayTeam.name,
          new Date(f.date),
          f.status,
          f.score?.home ?? null,
          f.score?.away ?? null,
          JSON.stringify(f),
        ]
      );
    } catch {
      // Non-fatal per-row; keep serving even if one upsert fails.
    }
  }
}

/**
 * Does the database currently contain "active live matches"?
 * Returns true/false, or null when PostgreSQL is unavailable (caller falls
 * back to the cache-tier gate).
 */
export async function pgHasActiveLiveMatches(): Promise<boolean | null> {
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM "${MATCHES_TABLE}" WHERE ${matchesStillActive()}
       ) AS active`
    );
    return res.rows[0]?.active === true;
  } catch (err) {
    console.warn("[cache:pg] live-match check failed:", (err as Error).message);
    return null;
  }
}

/** Mark live fixtures no longer in the live feed as finished. */
export async function finalizeStaleLiveMatches(activeLiveIds: Set<string>): Promise<void> {
  if (!pool || !available) return;
  try {
    await pool.query(
      `UPDATE "${MATCHES_TABLE}"
       SET status = 'finished', updated_at = now()
       WHERE status = 'live' AND NOT (id = ANY($1::text[]))`,
      [Array.from(activeLiveIds)]
    );
  } catch {
    // non-fatal
  }
}

export function shutdownPg(): void {
  if (pool) {
    pool.end().catch(() => undefined);
    pool = null;
    available = false;
  }
}

// ---------- Clear all cached rows (admin "Clear Cache" action) -------------

export async function pgCacheClear(): Promise<boolean> {
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${KV_TABLE}"`);
    return true;
  } catch {
    return false;
  }
}

/** Clear the `matches` table (live-poll gate source data). */
export async function pgMatchesClear(): Promise<boolean> {
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${MATCHES_TABLE}"`);
    return true;
  } catch {
    return false;
  }
}
