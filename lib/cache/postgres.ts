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

/** Resolve after the pool has finished processing all queued statements
 * (including the write just submitted) — the closest cross-platform signal
 * that a committed write is visible to subsequent reads. Best-effort; times
 * out rather than hanging a request. */
export async function pgDrainPool(): Promise<void> {
  if (!pool || !available) return;
  const p = pool;
  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000);
      p.once("idle", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch {
    // best-effort — caller retries with reads as a fallback
  }
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

// ---------- Admin overrides (separate table, never bulk-cleared) ------------

const OVERRIDES_TABLE = "admin_overrides";

export interface AdminOverrideRow {
  slug: string;
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
  expiresAt: string;
}

export async function pgOverrideGet(slug: string): Promise<AdminOverrideRow | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT slug, predicted_score, tip, win_probability, preview_text, expires_at
       FROM "${OVERRIDES_TABLE}"
       WHERE slug = $1 AND expires_at > now()`,
      [slug]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      slug: row.slug,
      predictedScore: row.predicted_score ?? null,
      tip: row.tip ?? null,
      winProbability: row.win_probability ?? null,
      previewText: row.preview_text ?? null,
      expiresAt:
        row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : String(row.expires_at),
    };
  } catch (err) {
    console.warn("[admin:override] pg get failed:", (err as Error).message);
    return null;
  }
}

export async function pgOverrideSet(
  slug: string,
  data: {
    predictedScore: { home: number; away: number } | null;
    tip: string | null;
    winProbability: { home: number; draw: number; away: number } | null;
    previewText: string | null;
  },
  expiresAt: string
): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${OVERRIDES_TABLE}"
         (slug, predicted_score, tip, win_probability, preview_text, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (slug)
       DO UPDATE SET
         predicted_score = EXCLUDED.predicted_score,
         tip = EXCLUDED.tip,
         win_probability = EXCLUDED.win_probability,
         preview_text = EXCLUDED.preview_text,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()`,
      [
        slug,
        data.predictedScore ? JSON.stringify(data.predictedScore) : null,
        data.tip,
        data.winProbability ? JSON.stringify(data.winProbability) : null,
        data.previewText,
        expiresAt,
      ]
    );
    return true;
  } catch (err) {
    console.warn("[admin:override] pg set failed:", (err as Error).message);
    return false;
  }
}

export async function pgOverrideDelete(slug: string): Promise<void> {
  await initPostgres();
  if (!pool || !available) return;
  try {
    await pool.query(`DELETE FROM "${OVERRIDES_TABLE}" WHERE slug = $1`, [slug]);
  } catch {
    // non-fatal
  }
}

/** Return the subset of slugs that still have a valid (non-expired) override. */
export async function pgOverrideList(slugs: string[]): Promise<string[]> {
  await initPostgres();
  if (!pool || !available || slugs.length === 0) return [];
  try {
    const res = await pool.query(
      `SELECT slug FROM "${OVERRIDES_TABLE}"
       WHERE slug = ANY($1) AND expires_at > now()`,
      [slugs]
    );
    return res.rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

// ---------- Hidden fixtures (separate table, never bulk-cleared) -------------

const HIDDEN_TABLE = "hidden_fixtures";

/** Every slug currently hidden from the public site. */
export async function pgHiddenList(): Promise<string[]> {
  await initPostgres();
  if (!pool || !available) return [];
  try {
    const res = await pool.query(`SELECT slug FROM "${HIDDEN_TABLE}"`);
    return res.rows.map((r) => String(r.slug));
  } catch (err) {
    console.warn("[admin:hidden] pg list failed:", (err as Error).message);
    return [];
  }
}

/** Hide a fixture (upsert). Returns true when committed. */
export async function pgHiddenAdd(slug: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${HIDDEN_TABLE}" (slug) VALUES ($1)
       ON CONFLICT (slug) DO NOTHING`,
      [slug]
    );
    return true;
  } catch (err) {
    console.warn("[admin:hidden] pg add failed:", (err as Error).message);
    return false;
  }
}

/** Un-hide a fixture. Returns true when committed. */
export async function pgHiddenRemove(slug: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(`DELETE FROM "${HIDDEN_TABLE}" WHERE slug = $1`, [slug]);
    return true;
  } catch (err) {
    console.warn("[admin:hidden] pg remove failed:", (err as Error).message);
    return false;
  }
}

// ---------- App settings (key/value — active provider, etc.) ------------
// Separate table (never bulk-cleared) so an admin runtime setting survives the
// "Clear Cache" job. Postgres is the single source of truth; callers keep an
// in-memory fallback for no-PG (dev/standalone) environments.

const SETTINGS_TABLE = "app_settings";

/** Read a raw app setting, or null when absent/unavailable. */
export async function pgSettingGet(key: string): Promise<string | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT value FROM "${SETTINGS_TABLE}" WHERE key = $1`,
      [key]
    );
    return res.rows[0]?.value ?? null;
  } catch (err) {
    console.warn("[settings:pg] get failed:", (err as Error).message);
    return null;
  }
}

/** Upsert an app setting. Returns true when committed. */
export async function pgSettingSet(key: string, value: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${SETTINGS_TABLE}" (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    );
    return true;
  } catch (err) {
    console.warn("[settings:pg] set failed:", (err as Error).message);
    return false;
  }
}
