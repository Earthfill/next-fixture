// ---------------------------------------------------------------------------
// Stale-data cleanup — run daily (midnight cron) so durable rows are removed
// at the moment their match is removed from the cache. Gracefully no-ops when
// Postgres is unavailable (like every other store).
// ---------------------------------------------------------------------------

import { initPostgres, pgAvailable, pgCleanupStaleData } from "@/lib/cache/postgres";
import type { CleanupStats } from "@/lib/cache/postgres";

export interface CleanupResult {
  /** false when the DB was unreachable (nothing cleaned). */
  ran: boolean;
  stats: CleanupStats;
}

export async function runStaleDataCleanup(): Promise<CleanupResult> {
  await initPostgres();
  if (!pgAvailable()) {
    return { ran: false, stats: { chat: 0, sessions: 0, tokens: 0 } };
  }
  const stats = await pgCleanupStaleData().catch(() => null);
  if (!stats) {
    return { ran: false, stats: { chat: 0, sessions: 0, tokens: 0 } };
  }
  return { ran: true, stats };
}
