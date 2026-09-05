// ---------------------------------------------------------------------------
// PostgreSQL cache/durable store - pg Pool with graceful degradation
// ---------------------------------------------------------------------------
// Two tables:
//   api_cache - key/value TTL store (the "PostgreSQL" tier of the cache-aside
//               pattern). Lives behind Redis as the durable layer.
//   matches   - one row per fixture. Used by the live-poll job to determine
//               whether "active live matches are occurring in the database"
//               before spending an API-Football request.

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



  // "no pg_hba.conf entry / SSL required" errors once DNS starts resolving..



  const needsSsl = /\.supabase\.co/i.test(url) || /\.supabase\.com/i.test(url) || /sslmode=require|sslmode=verify-full/i.test(url);



  return new Pool({

    connectionString: url,

    max:  ​5,

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 3000,

    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,

  });

}





/** Initialize schema on first use. Safe to call repeatedly. */

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



      await pool.query(`

        CREATE TABLE IF NOT EXISTS "${KV_TABLE}" (

          cache_key  TEXT PRIMARY KEY,

          payload    JSONB NOT NULL,

          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "${MATCHES_TABLE}" (
          id         TEXT PRIMARY KEY,
          league     TEXT NOT NULL,
          season     INT,
          home_team  TEXT NOT NULL,
          away_team  TEXT NOT NULL,
          kickoff    TIMESTAMPTZ NOT NULL,
          status     TEXT NOT NULL,
          home_score INT,
          away_score INT,
          payload    JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON "${KV_TABLE}" (expires_at);
        CREATE INDEX IF NOT EXISTS idx_matches_status ON "${MATCHES_TABLE}" (status);
        CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON "${MATCHES_TABLE}" (kickoff);
      `);

      available = true;
    } catch (err) {
      available = false;
      console.warn("[cache:pg] unavailable:", (err as Error).message);
    }
    return available;
  })();



  return initPromise;

}





export function pgAvailable(): boolean {

  return available;

}





// ---------- Key/Value cache tier -------------------------------------


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
}// ---------- Matches table (durable source for the live-poll gate) -------


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
 * Returns:
 *   true  - matches exist that are live (or kicking off within minutes)
 *   false - no live matches at all
 *   null  - PostgreSQL unavailable (caller falls back to Redis/cached gate)
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


/**
 * Mark any fixture previously stored as "live" that is no longer in the live
 * feed as finished - keeps the matches table tidy after full-time whistle.
 */
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
}// ---------- Clear all cached rows (admin "Clear Cache" action) ----------

export async function pgCacheClear(): Promise<boolean> {
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${KV_TABLE}"`);
    return true;
  } catch {
    return false;
  }
}

/** Clear the `matches` table (live-poll gate source data). Used by admin "Clear Cache". */
export async function pgMatchesClear(): Promise<boolean> {
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${MATCHES_TABLE}"`);
    return true;
  } catch {
    return false;
  }
}