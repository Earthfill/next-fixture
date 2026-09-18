// ---------------------------------------------------------------------------
// POST /api/admin/jobs - manually trigger a background job from the admin UI.
// Body: { "token": "<ADMIN_SECRET>", "job": "fixtures" | "clear" }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { fetchNext7DaysFixtures } from "@/lib/jobs/midnight-fixtures";
import { clearAllCaches } from "@/lib/cache";
import { runStaleDataCleanup } from "@/lib/cleanup";
import { getQuota, clearApiCache } from "@/lib/football/api";
import { resetCoveredLeagues } from "@/lib/football/service";
import { resetCircuitBreaker } from "@/lib/football/circuit-breaker";
import { clearAllCache as clearLineupCache } from "@/lib/lineup-service";
import { tryRevalidatePublicSite } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { token?: string; job?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!isAdminAuthorized(request, body.token)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - invalid admin token." },
      { status: 401 }
    );
  }

  const job = body.job;
  try {
    let result: unknown;

    switch (job) {
      case "fixtures": {
        result = await fetchNext7DaysFixtures();
        // A fresh fixture list upstream means the listings may be stale; warm
        // them now instead of waiting up to 5 minutes (ISR) for the homepage.
        await tryRevalidatePublicSite().catch(() => undefined);
        break;
      }
      case "clear": {
        // 1. Request-scoped API dedup + module-level caches.
        clearApiCache();
        resetCoveredLeagues();
        clearLineupCache();
        await resetCircuitBreaker();

        // 2. Cache-aside tiers (memory, Redis, PostgreSQL api_cache).
        const cacheResult = await clearAllCaches();

        // 2b. Prune durable rows whose lifetime has ended (expired-match chat,
        // stale sessions, used/expired email tokens).
        const cleanup = await runStaleDataCleanup().catch(() => null);

        // 3. Next.js Full Route Cache (ISR) + Data Cache tags. Revalidate the
        // listings AND the preview route so previously generated HTML (built
        // before the clear) isn't served stale once the data cache is reset.
        let fullRouteCacheRevalidated = true;
        try {
          await tryRevalidatePublicSite();
        } catch (err) {
          fullRouteCacheRevalidated = false;
          console.warn("[admin:jobs] revalidation failed:", err);
        }

        result = { ...cacheResult, cleanup, fullRouteCacheRevalidated };
        break;
      }
      default: {
        return NextResponse.json(
          { success: false, error: `Unknown job "${job}". Use "fixtures" or "clear".` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true, result, quota: getQuota() });
  } catch (err) {
    console.error("[admin:jobs] job failed:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message || "Job failed." },
      { status: 500 }
    );
  }
}