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

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
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
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
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
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
