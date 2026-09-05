// ---------------------------------------------------------------------------
// Background job scheduler - node-cron
// ---------------------------------------------------------------------------
//   - 00:00 daily -> prefetch next 7 days of fixtures (midnight-fixtures)
//
// Live scores are served on-demand via the cache-aside layer (24h TTL), so
// there is no background live-poll here. In production the midnight job runs
// as a Vercel Cron hitting /api/cron/fixtures (see vercel.json); this worker
// exists for local development and container deployments.
// Start via the standalone worker:  npm run cron   (scripts/cron-worker.ts)
// ---------------------------------------------------------------------------

import cron from "node-cron";
import { fetchNext7DaysFixtures } from "./midnight-fixtures";

let started = false;

/** Start all scheduled jobs. Safe to call multiple times (idempotent). */
export function startScheduler(): void {
  if (started) return;

  if (process.env.DISABLE_CRON === "true") {
    console.warn("[cron] scheduler skipped - DISABLE_CRON=true");
    return;
  }

  started = true;
  const tz = process.env.CRON_TZ || "UTC";

  // --- Midnight: prefetch next 7 days of fixtures -------------------------
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[cron:midnight] starting -> fetch next 7 days of fixtures");
      try {
        const result = await fetchNext7DaysFixtures();
        console.log("[cron:midnight] done:", result);
      } catch (err) {
        console.error("[cron:midnight] failed:", err);
      }
    },
    { timezone: tz }
  );

  console.log("[cron] scheduler started - midnight fixtures prefetch");
}
