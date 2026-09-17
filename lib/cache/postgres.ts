// ---------------------------------------------------------------------------
// PostgreSQL cache/durable store - pg Pool with graceful degradation
// ---------------------------------------------------------------------------
// One table (created by `npm run migrate`, NOT at runtime):
//   api_cache - key/value TTL store (the "PostgreSQL" tier of the cache-aside
//               pattern). Lives behind Redis as the durable layer.
//
// If DATABASE_URL is missing/unreachable the layer silently disables itself.

import { Pool } from "pg";
import type { ChatModerationStatus } from "@/lib/types";

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
    // Generous connect window: establishing a client to the Supabase pooler can
    // take ~1s (TLS handshake). A tight 3s here turns ordinary queue contention
    // into a flood of "timeout exceeded when trying to connect" errors.
    connectionTimeoutMillis: 10_000,
    // Bound any single query so a stuck statement cannot hold a connection open.
    statement_timeout: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

// ---------- Availability lifecycle ------------------------------------------
// A database blip must never turn into a stuck app. Two things used to cause
// exactly that on the public pages:
//
//   1. NO BACKOFF — every caller re-attempted the connection. One listing
//      render fans out to hundreds of store reads, so a struggling database
//      was hit with hundreds of fresh 10s connect attempts per request.
//   2. STALE `available` — once the pool had connected successfully the flag
//      stayed true while queries timed out, so callers kept queueing slow
//      attempts instead of taking their no-PG fallback path.
//
// Both are fixed by a cooldown: after a failure the store is marked down for
// RETRY_AFTER_MS, during which `pgAvailable()` is false (callers immediately
// use their in-memory/no-PG paths) and not a single connection is attempted.

const RETRY_AFTER_MS = 30_000;
let downUntil = 0;

/** Connection-level failures (reachability) — as opposed to, say, a constraint
 * violation, which says nothing about whether the database is reachable. */
const CONNECTION_FAILURE =
  /timeout exceeded when trying to connect|ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|Connection terminated|server closed the connection|too many clients|terminating connection/i;

function isConnectionFailure(err: unknown): boolean {
  return CONNECTION_FAILURE.test(String((err as Error)?.message ?? err));
}

/** Mark the store down for a cooldown and release the pool it was using. */
function markDown(): void {
  available = false;
  downUntil = Date.now() + RETRY_AFTER_MS;
  const stale = pool;
  pool = null;
  // end() disposes queued/pending clients. Without it a discarded pool keeps
  // its connect attempts (and their timers) alive.
  void stale?.end().catch(() => undefined);
}

/** Log a store failure, and back off when it means the database is unreachable. */
function noteFailure(label: string, err: unknown): void {
  console.warn(label, (err as Error)?.message ?? err);
  if (isConnectionFailure(err)) markDown();
}

/**
 * Initialize the pool (connect + cheap availability check). This intentionally
 * does NOT run any DDL - schema is applied once at deploy time by
 * `npm run migrate` (scripts/migrate.ts). Safe to call repeatedly: concurrent
 * callers share one attempt, and a failure is not retried until the cooldown
 * above has elapsed.
 */
export async function initPostgres(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (available && pool) return true;
  if (initPromise) return initPromise;
  if (Date.now() < downUntil) return false; // cooling down after a failure

  const attempt = (async () => {
    try {
      const created = createPool();
      if (!created) return false;
      pool = created;
      await created.query("SELECT 1");
      available = true;
      downUntil = 0;
      return true;
    } catch (err) {
      // An init failure is never worth retrying per-request (bad credentials,
      // unreachable host, pooler refusing) — back off regardless of the cause.
      console.warn("[cache:pg] unavailable:", (err as Error)?.message ?? err);
      markDown();
      return false;
    }
  })();

  initPromise = attempt;
  void attempt.finally(() => {
    if (initPromise === attempt) initPromise = null;
  });
  return attempt;
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
    noteFailure("[cache:pg] get failed:", err);
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
    noteFailure("[cache:pg] set failed:", err);
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

/** Map a raw admin_overrides row to the reader shape — shared by the per-slug
 * and batched readers so both always agree. */
function mapOverrideRow(row: Record<string, unknown>): AdminOverrideRow {
  return {
    slug: String(row.slug),
    predictedScore: (row.predicted_score as AdminOverrideRow["predictedScore"]) ?? null,
    tip: (row.tip as string) ?? null,
    winProbability: (row.win_probability as AdminOverrideRow["winProbability"]) ?? null,
    previewText: (row.preview_text as string) ?? null,
    expiresAt:
      row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
  };
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
    return row ? mapOverrideRow(row) : null;
  } catch (err) {
    noteFailure("[admin:override] pg get failed:", err);
    return null;
  }
}

/**
 * Override rows for MANY slugs in ONE query.
 *
 * Public listings need the override *values* (not just their presence) for every
 * fixture on the page, and the same page render visits the same fixture list
 * once per matchday — reading them per slug costs hundreds of round trips per
 * render. One batched read replaces the whole fan-out.
 */
export async function pgOverrideRows(slugs: string[]): Promise<AdminOverrideRow[]> {
  await initPostgres();
  if (!pool || !available || slugs.length === 0) return [];
  try {
    const res = await pool.query(
      `SELECT slug, predicted_score, tip, win_probability, preview_text, expires_at
       FROM "${OVERRIDES_TABLE}"
       WHERE slug = ANY($1) AND expires_at > now()`,
      [slugs]
    );
    return res.rows.map(mapOverrideRow);
  } catch (err) {
    noteFailure("[admin:override] pg rows failed:", err);
    return [];
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
    noteFailure("[admin:override] pg set failed:", err);
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
  } catch (err) {
    // A failed read must not look like "no overrides" silently: log it and let
    // the cooldown in noteFailure take the store out of rotation.
    noteFailure("[admin:override] pg list failed:", err);
    return [];
  }
}

// ---------- Hidden fixtures (separate table, never bulk-cleared) -------------

const HIDDEN_TABLE = "hidden_fixtures";

/**
 * Every slug currently hidden from the public site.
 *
 * Returns `null` when the list could not be read (PG unavailable, or the query
 * failed/timed out) so callers can tell "nothing is hidden" apart from "could
 * not ask". A failed read must never be mistaken for an empty store — that
 * re-publishes every hidden fixture on the public site.
 */
export async function pgHiddenList(): Promise<string[] | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(`SELECT slug FROM "${HIDDEN_TABLE}"`);
    return res.rows.map((r) => String(r.slug));
  } catch (err) {
    noteFailure("[admin:hidden] pg list failed:", err);
    return null;
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
    noteFailure("[admin:hidden] pg add failed:", err);
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
    noteFailure("[admin:hidden] pg remove failed:", err);
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
    noteFailure("[settings:pg] get failed:", err);
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
    noteFailure("[settings:pg] set failed:", err);
    return false;
  }
}
// ---------- App users (auth) -----------------------------------------------
// Hosted auth for the logged-in preview chat. Deliberately NOT part of
// api_cache (never bulk-cleared). Postgres is the source of truth; callers in
// lib/auth.ts keep an in-memory fallback for no-PG (dev/standalone) runs.

const USERS_TABLE = "app_users";
const SESSIONS_TABLE = "app_sessions";
const CHAT_TABLE = "preview_chat_messages";
const EMAIL_TOKENS_TABLE = "email_tokens";

export interface AppUserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  verifiedAt: string | null;
}

export async function pgUserFindByEmail(email: string): Promise<AppUserRow | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT id, email, display_name, password_hash, verified_at
       FROM "${USERS_TABLE}" WHERE email = $1`,
      [email]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      verifiedAt: row.verified_at ? toIso(row.verified_at) : null,
    };
  } catch (err) {
    noteFailure("[auth:pg] find by email failed:", err);
    return null;
  }
}

export async function pgUserGetById(id: string): Promise<AppUserRow | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT id, email, display_name, password_hash, verified_at
       FROM "${USERS_TABLE}" WHERE id = $1`,
      [id]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      verifiedAt: row.verified_at ? toIso(row.verified_at) : null,
    };
  } catch (err) {
    noteFailure("[auth:pg] get user failed:", err);
    return null;
  }
}

export async function pgUserCreate(data: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${USERS_TABLE}" (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [data.id, data.email, data.displayName, data.passwordHash]
    );
    return true;
  } catch (err) {
    noteFailure("[auth:pg] create user failed:", err);
    return false;
  }
}

/** Aggregate registered-user counts for the admin dashboard. Returns null when
 *  Postgres is unreachable so the caller can render "unavailable" instead of 0. */
export async function pgUserStats(): Promise<{ total: number; verified: number } | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT count(*)::int AS total,
              count(verified_at)::int AS verified
       FROM "${USERS_TABLE}"`
    );
    const row = res.rows[0] ?? {};
    return { total: Number(row.total ?? 0), verified: Number(row.verified ?? 0) };
  } catch (err) {
    noteFailure("[auth:pg] user stats failed:", err);
    return null;
  }
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  verifiedAt: string | null;
  createdAt: string | null;
  /** Chat messages posted by the account (any moderation status). */
  messageCount: number;
  /** Of those, the ones currently visible on the public site. */
  approvedMessageCount: number;
  /** Most recent session start — a proxy for "last login". */
  lastSeenAt: string | null;
  /** Unused, unexpired verify_email links — i.e. the account can still click. */
  pendingTokenCount: number;
  /** When the most recent verification email was generated (used to say how
   *  long a pending account has been waiting). */
  lastTokenSentAt: string | null;
}

/** Registered accounts for the admin "Registered Users" drawer, newest first,
 *  each with its chat + session activity and any outstanding verification link.
 *  Returns null when Postgres is unreachable so the caller can report "store
 *  unavailable" instead of an empty list that looks like "no accounts". */
export async function pgUserList(limit = 200): Promise<AdminUserRow[] | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.verified_at, u.created_at,
              (SELECT count(*)::int FROM "${CHAT_TABLE}" m
                WHERE m.user_id = u.id) AS message_count,
              (SELECT count(*)::int FROM "${CHAT_TABLE}" m
                WHERE m.user_id = u.id AND m.moderation_status = 'approved') AS approved_message_count,
              (SELECT max(s.created_at) FROM "${SESSIONS_TABLE}" s
                WHERE s.user_id = u.id) AS last_seen_at,
              (SELECT count(*)::int FROM "${EMAIL_TOKENS_TABLE}" t
                WHERE t.user_id = u.id AND t.purpose = 'verify_email'
                  AND t.used_at IS NULL AND t.expires_at > now()) AS pending_token_count,
              (SELECT max(t.created_at) FROM "${EMAIL_TOKENS_TABLE}" t
                WHERE t.user_id = u.id AND t.purpose = 'verify_email') AS last_token_sent_at
       FROM "${USERS_TABLE}" u
       ORDER BY u.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      verifiedAt: r.verified_at ? toIso(r.verified_at) : null,
      createdAt: r.created_at ? toIso(r.created_at) : null,
      messageCount: Number(r.message_count ?? 0),
      approvedMessageCount: Number(r.approved_message_count ?? 0),
      lastSeenAt: r.last_seen_at ? toIso(r.last_seen_at) : null,
      pendingTokenCount: Number(r.pending_token_count ?? 0),
      lastTokenSentAt: r.last_token_sent_at ? toIso(r.last_token_sent_at) : null,
    }));
  } catch (err) {
    noteFailure("[auth:pg] user list failed:", err);
    return null;
  }
}

/** Admin: force an account's email to verified (no token needed). Returns true
 *  when a row was updated, false when it was already verified or missing. */
export async function pgUserVerify(userId: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    const res = await pool.query(
      `UPDATE "${USERS_TABLE}" SET verified_at = COALESCE(verified_at, now())
       WHERE id = $1 AND verified_at IS NULL`,
      [userId]
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    noteFailure("[auth:pg] admin verify failed:", err);
    return false;
  }
}

export async function pgSessionCreate(data: {
  token: string;
  userId: string;
  expiresAt: string;
}): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${SESSIONS_TABLE}" (token, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [data.token, data.userId, data.expiresAt]
    );
    return true;
  } catch (err) {
    noteFailure("[auth:pg] create session failed:", err);
    return false;
  }
}

export async function pgSessionGet(token: string): Promise<{ userId: string } | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT s.user_id
       FROM "${SESSIONS_TABLE}" s
       JOIN "${USERS_TABLE}" u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    const row = res.rows[0];
    return row ? { userId: row.user_id } : null;
  } catch (err) {
    noteFailure("[auth:pg] get session failed:", err);
    return null;
  }
}

export async function pgSessionDelete(token: string): Promise<void> {
  await initPostgres();
  if (!pool || !available) return;
  try {
    await pool.query(`DELETE FROM "${SESSIONS_TABLE}" WHERE token = $1`, [token]);
  } catch {
    // non-fatal
  }
}

// ---------- Preview chat messages ------------------------------------------

export interface ChatMessageRow {
  id: string;
  slug: string;
  userId: string;
  body: string;
  parentId: string | null;
  moderationStatus: ChatModerationStatus;
  removedBy: string | null;
  createdAt: string;
  matchDate: string | null;
  displayName: string | null;
  email: string | null;
}

const APP_STATUSES: ChatModerationStatus[] = ["approved", "pending", "removed"];

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** List chat for a slug whose status is in `statuses` (public list = ["approved"]). */
export async function pgChatList(
  slug: string,
  statuses: ChatModerationStatus[]
): Promise<ChatMessageRow[]> {
  await initPostgres();
  if (!pool || !available) return [];
  try {
    const statusArg = statuses.length ? statuses : APP_STATUSES;
    const res = await pool.query(
      `SELECT m.id, m.slug, m.user_id, m.body, m.parent_id,
              m.moderation_status, m.removed_by, m.created_at, m.match_date,
              u.display_name, u.email
       FROM "${CHAT_TABLE}" m
       LEFT JOIN "${USERS_TABLE}" u ON u.id = m.user_id
       WHERE m.slug = $1 AND m.moderation_status = ANY($2::text[])
       ORDER BY m.created_at DESC
       LIMIT 500`,
      [slug, statusArg]
    );
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      userId: r.user_id,
      body: r.body,
      parentId: r.parent_id ?? null,
      moderationStatus: r.moderation_status as ChatModerationStatus,
      removedBy: r.removed_by ?? null,
      createdAt: toIso(r.created_at),
      matchDate: r.match_date ? toIso(r.match_date) : null,
      displayName: r.display_name ?? null,
      email: r.email ?? null,
    }));
  } catch (err) {
    noteFailure("[chat:pg] list failed:", err);
    return [];
  }
}

/** Create a chat message; returns the row with server-assigned created_at. */
export async function pgChatCreate(data: {
  id: string;
  slug: string;
  userId: string;
  body: string;
  parentId: string | null;
  matchDate: string | null;
}): Promise<ChatMessageRow | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `INSERT INTO "${CHAT_TABLE}" (id, slug, user_id, body, parent_id, match_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, slug, user_id, body, parent_id, moderation_status, removed_by, created_at, match_date`,
      [data.id, data.slug, data.userId, data.body, data.parentId, data.matchDate]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      slug: r.slug,
      userId: r.user_id,
      body: r.body,
      parentId: r.parent_id ?? null,
      moderationStatus: r.moderation_status as ChatModerationStatus,
      removedBy: r.removed_by ?? null,
      createdAt: toIso(r.created_at),
      matchDate: r.match_date ? toIso(r.match_date) : null,
      displayName: null,
      email: null,
    };
  } catch (err) {
    noteFailure("[chat:pg] create failed:", err);
    return null;
  }
}

/** Mark a message removed (author self-removal or admin). */
export async function pgChatRemove(id: string, removedBy: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `UPDATE "${CHAT_TABLE}" SET moderation_status = 'removed', removed_by = $2
       WHERE id = $1`,
      [id, removedBy]
    );
    return true;
  } catch (err) {
    noteFailure("[chat:pg] remove failed:", err);
    return false;
  }
}

/** Admin moderation — approve or delete (hard remove) a message. */
export async function pgChatModerate(id: string, action: "approve" | "delete"): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    if (action === "delete") {
      await pool.query(`DELETE FROM "${CHAT_TABLE}" WHERE id = $1`, [id]);
    } else {
      await pool.query(
        `UPDATE "${CHAT_TABLE}" SET moderation_status = 'approved', removed_by = NULL
         WHERE id = $1`,
        [id]
      );
    }
    return true;
  } catch (err) {
    noteFailure("[chat:pg] moderate failed:", err);
    return false;
  }
}

/** Whether a given message id exists (used to validate reply parents). */
export async function pgChatExists(id: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    const res = await pool.query(`SELECT 1 FROM "${CHAT_TABLE}" WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Admin moderation feed — recent messages across all slugs with any status. */
export async function pgAdminChatList(limit = 200): Promise<ChatMessageRow[]> {
  await initPostgres();
  if (!pool || !available) return [];
  try {
    const res = await pool.query(
      `SELECT m.id, m.slug, m.user_id, m.body, m.parent_id,
              m.moderation_status, m.removed_by, m.created_at, m.match_date,
              u.display_name, u.email
       FROM "${CHAT_TABLE}" m
       LEFT JOIN "${USERS_TABLE}" u ON u.id = m.user_id
       ORDER BY m.created_at DESC
       LIMIT $1`,
      [limit]
    );   
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      userId: r.user_id,
      body: r.body,
      parentId: r.parent_id ?? null,
      moderationStatus: r.moderation_status as ChatModerationStatus,
      removedBy: r.removed_by ?? null,
      createdAt: toIso(r.created_at),
      matchDate: r.match_date ? toIso(r.match_date) : null,
      displayName: r.display_name ?? null,
      email: r.email ?? null,
    }));
  } catch (err) {
    noteFailure("[chat:pg] admin list failed:", err);
    return [];
  }
}

// ---------- Email verification tokens --------------------------------------

export interface EmailTokenRow {
  id: string;
  userId: string;
  email: string;
  purpose: string;
  token: string;
  expiresAt: string;
}

export async function pgEmailTokenCreate(data: {
  id: string;
  userId: string;
  email: string;
  purpose: string;
  token: string;
  expiresAt: string;
}): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `INSERT INTO "${EMAIL_TOKENS_TABLE}" (id, user_id, email, purpose, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.id, data.userId, data.email, data.purpose, data.token, data.expiresAt]
    );
    return true;
  } catch (err) {
    noteFailure("[email:pg] token create failed:", err);
    return false;
  }
}

/** Fetch a token that exactly matches purpose, is unused and not yet expired. */
export async function pgEmailTokenGetValid(
  token: string,
  purpose: string
): Promise<EmailTokenRow | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const res = await pool.query(
      `SELECT id, user_id, email, purpose, token, expires_at
       FROM "${EMAIL_TOKENS_TABLE}"
       WHERE token = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()`,
      [token, purpose]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      purpose: row.purpose,
      token: row.token,
      expiresAt: toIso(row.expires_at),
    };
  } catch (err) {
    noteFailure("[email:pg] token get failed:", err);
    return null;
  }
}

export async function pgEmailTokenMarkUsed(id: string): Promise<void> {
  await initPostgres();
  if (!pool || !available) return;
  try {
    await pool.query(
      `UPDATE "${EMAIL_TOKENS_TABLE}" SET used_at = now() WHERE id = $1`,
      [id]
    );
  } catch {
    // non-fatal
  }
}

/** Mark a user's email as verified (verified_at = now). */
export async function pgUserSetVerified(userId: string): Promise<boolean> {
  await initPostgres();
  if (!pool || !available) return false;
  try {
    await pool.query(
      `UPDATE "${USERS_TABLE}" SET verified_at = COALESCE(verified_at, now())
       WHERE id = $1`,
      [userId]
    );
    return true;
  } catch (err) {
    noteFailure("[email:pg] set verified failed:", err);
    return false;
  }
}

// ---------- Stale data cleanup (daily cron) --------------------------------
// Removes durable rows whose lifetime ended: match discussion for finished
// matches (match_date < now, with a created_at age fallback for legacy rows
// that have no match_date), expired sessions and used/expired email tokens.

export interface CleanupStats {
  chat: number;
  sessions: number;
  tokens: number;
}

export async function pgCleanupStaleData(): Promise<CleanupStats | null> {
  await initPostgres();
  if (!pool || !available) return null;
  try {
    const chatRes = await pool.query(
      `DELETE FROM "${CHAT_TABLE}"
       WHERE (match_date IS NOT NULL AND match_date < now())
          OR (match_date IS NULL AND created_at < now() - interval '3 days')`
    );
    const sessionsRes = await pool.query(
      `DELETE FROM "${SESSIONS_TABLE}" WHERE expires_at < now()`
    );
    const tokensRes = await pool.query(
      `DELETE FROM "${EMAIL_TOKENS_TABLE}" WHERE used_at IS NOT NULL OR expires_at < now()`
    );
    return {
      chat: chatRes.rowCount ?? 0,
      sessions: sessionsRes.rowCount ?? 0,
      tokens: tokensRes.rowCount ?? 0,
    };
  } catch (err) {
    noteFailure("[cleanup:pg] failed:", err);
    return null;
  }
}
