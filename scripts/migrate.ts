// ---------------------------------------------------------------------------
// Versioned SQL migration runner - runs automatically at deploy time:
//   package.json "build": "npm run migrate && next build"
// ---------------------------------------------------------------------------
// Applies db/migrations/*.sql in filename order, tracking applied migrations
// in a _migrations table so each file runs exactly once (idempotent). A session
// advisory lock serializes concurrent runs (e.g. overlapping deploys).
//
// - No DATABASE_URL -> warn and exit 0 (previews/builds without a DB still pass).
// - A migration fails -> exit 1 (fail the deploy).
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore - may be absent in production (env vars come from the host).
  }
}

loadEnvFile(".env.local");

// Migrations apply DDL. Managed providers (Supabase) behave differently for
// direct connections vs. the transaction pooler: the pooler multiplexes many
// clients and can reject DDL (CREATE TABLE) → FATAL/XX000. The app runtime
// intentionally uses the pooler (DATABASE_URL); migrations should use a DIRECT
// connection when one is available. Set MIGRATE_DATABASE_URL to point
// migrations at a direct connection while the app keeps using the pooler.
const DB_URL_FOR_MIGRATE =
  process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

const MAX_CONNECT_ATTEMPTS = 5;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Probe the connection with a trivial query, retrying with backoff. Transient
 * failures (cold start, DB pausing/resuming, build-sandbox races) shouldn't
 * fail the deploy outright — but a genuinely unreachable DB still fails loudly
 * because the schema is required at runtime. */
async function connectWithRetry(pool: Pool): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[migrate] DB connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${(err as Error)?.message ?? String(err)}`
      );
      if (attempt < MAX_CONNECT_ATTEMPTS) await sleep(750 * attempt);
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const url = DB_URL_FOR_MIGRATE;
  if (!url) {
    console.warn("[migrate] DATABASE_URL is not set - nothing to migrate (skipping).");
    return;
  }

  const needsSsl =
    /\.supabase\.co/i.test(url) ||
    /\.supabase\.com/i.test(url) ||
    /sslmode=require|sslmode=verify-full/i.test(url);

  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Resolve transient connectivity issues before touching DDL.
    await connectWithRetry(pool);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS "_migrations" (
         name       TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );

    // Serialize concurrent runs (e.g. two builds racing) with an advisory lock.
    const lockClient = await pool.connect();
    await lockClient.query(`SELECT pg_advisory_lock(hashtext('nextfixture_migrations'))`);
    try {
      const dir = join(process.cwd(), "db", "migrations");
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      let failed = false;
      for (const file of files) {
        const existing = await pool.query(`SELECT 1 FROM "_migrations" WHERE name = $1`, [file]);
        if (existing.rowCount) {
          console.log(`[migrate] skip ${file} (already applied)`);
          continue;
        }

        const sql = readFileSync(join(dir, file), "utf8");
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query(
            `INSERT INTO "_migrations" (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
            [file]
          );
          await client.query("COMMIT");
          console.log(`[migrate] applied ${file}`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`[migrate] failed ${file}:`, (err as Error).message);
          failed = true;
          break;
        } finally {
          client.release();
        }
      }

      if (failed) process.exitCode = 1;
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext('nextfixture_migrations'))`);
      lockClient.release();
    }
  } finally {
    await pool.end();
  }

  console.log(process.exitCode ? "[migrate] finished with errors." : "[migrate] done.");
}

main().catch((err) => {
  console.error("");
  console.error("[migrate] FATAL: could not run database migrations.");
  console.error("  " + ((err as Error)?.message ?? String(err)));
  console.error("");
  console.error("Likely causes & fixes:");
  console.error("  1. Supabase free-tier DB is PAUSED -> open it in the Supabase dashboard (or query it once).");
  console.error("  2. DDL through the transaction pooler fails -> set MIGRATE_DATABASE_URL to the DIRECT");
  console.error("     connection (host:5432, not the pooler host:port). The app runtime keeps using the pooler.");
  console.error("  3. Password in DATABASE_URL/MIGRATE_DATABASE_URL contains special chars that are not URL-encoded.");
  console.error("  4. The build sandbox cannot reach the DB host/port (firewall, paused project, IP restrictions).");
  process.exit(1);
});
