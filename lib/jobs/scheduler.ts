// ---------------------------------------------------------------------------
// Background job scheduler — node-cron
// ---------------------------------------------------------------------------
//   • 00:00 daily  → prefetch next 7 days of fixtures (midnight-fixtures)
//   • every 30s    → poll live scores, gated by active live matches (live-poll)
// Start via the standalone worker:  npm run cron   (scripts/cron-worker.ts)
// ---------------------------------------------------------------------------

import cron from "node-cron";
import { fetchNext7DaysFixtures } from "./midnight-fixtures";
import { pollLiveMatches } from "./live-poll";

let started = false;

/** Start all scheduled jobs. Safe to call multiple times (idempotent). */
export function startScheduler(): void {
  if (started) return;

  if (process.env.DISABLE_CRON === "true") {
    console.warn("[cron] scheduler skipped — DISABLE_CRON=true");
    return;
  }

  started = true;
  const tz = process.env.CRON_TZ || "UTC";

  // ── Midnight: prefetch next 7 days of fixtures ─────────────────────────
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[cron:midnight] starting → fetch next 7 days of fixtures");
      try {
        const result = await fetchNext7DaysFixtures();
        console.log("[cron:midnight] done:", result);
      } catch (err) {
        console.error("[cron:midnight] failed:", err);
      }
    },
    { timezone: tz }
  );

  // ── Every 30 seconds: poll live scores (only when active live matches) ──
  cron.schedule(
    "*/30 * * * * *",
    async () => {
      try {
        const result = await pollLiveMatches();
        if (!result.polled) {
          console.log("[cron:live] skipped — no active live matches in DB");
        } else if (result.liveCount > 0) {
          console.log(`[cron:live] polled → ${result.liveCount} live match(es)`);
        } else {
          console.log("[cron:live] polled → no live matches left");
        }
      } catch (err) {
        console.error("[cron:live] failed:", err);
      }
    },
    { timezone: tz }
  );

  console.log("[cron] scheduler started — midnight fixtures + 30s live poll");
}