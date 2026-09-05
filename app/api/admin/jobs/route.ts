// ---------------------------------------------------------------------------
// POST /api/admin/jobs - manually trigger a background job from the admin UI.
// Body: { "token": "<ADMIN_SECRET>", "job": "fixtures" | "live" | "all" }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { fetchNext7DaysFixtures } from "@/lib/jobs/midnight-fixtures";
import { pollLiveMatches } from "@/lib/jobs/live-poll";
import { clearAllCaches } from "@/lib/cache";
import { pgMatchesClear } from "@/lib/cache/postgres";
import { getQuota, clearApiCache } from "@/lib/football/api";
import { resetCoveredLeagues } from "@/lib/football/service";
import { clearAllCache as clearLineupCache } from "@/lib/lineup-service";

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
        break;
      }
      case "live": {
        result = await pollLiveMatches();
        break;
      }
      case "all": {
        const fixtures = await fetchNext7DaysFixtures();
        const live = await pollLiveMatches();
        result = { fixtures, live };
        break;
      }
      case "clear": {
        // 1. Request-scoped API dedup + module-level caches.
        clearApiCache();
        resetCoveredLeagues();
        clearLineupCache();

        // 2. Cache-aside tiers (memory, Redis, PostgreSQL api_cache).
        const cacheResult = await clearAllCaches();

        // 3. PostgreSQL `matches` table (live-poll gate source data).
        const matchesCleared = await pgMatchesClear();

        // 4. Next.js Full Route Cache (ISR) + Data Cache tags.
        let fullRouteCacheRevalidated = true;
        try {
          revalidatePath("/", "layout");
          revalidateTag("news", { expire: 0 });
          revalidateTag("lineups", { expire: 0 });
        } catch (err) {
          fullRouteCacheRevalidated = false;
          console.warn("[admin:jobs] revalidation failed:", err);
        }

        result = { ...cacheResult, matchesCleared, fullRouteCacheRevalidated };
        break;
      }
      default: {
        return NextResponse.json(
          { success: false, error: `Unknown job "${job}". Use "fixtures", "live", or "all".` },
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