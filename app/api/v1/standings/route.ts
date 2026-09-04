// ---------------------------------------------------------------------------
// GET /api/v1/standings — League standings (and a few upcoming fixtures)
// ---------------------------------------------------------------------------
// Reads from the cache-aside layer with a 12-hour TTL for league tables.
// Requires ?league=<slug> e.g. /api/v1/standings?league=premier-league
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type { LeagueData } from "@/lib/types";
import { cacheAside } from "@/lib/cache";
import { standingsKey, TTL } from "@/lib/cache/keys";
import { fetchStandings } from "@/lib/cache/fetchers";
import { checkRateLimit } from "@/lib/api/rate-limiter";
import { getQuota } from "@/lib/football/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "standings");
  if (!rl.allowed) {
    const retryAfter = Math.max(Math.ceil((rl.resetAt - Date.now()) / 1000), 1);
    return NextResponse.json(
      { error: "Too many requests. Please slow down.", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const league = request.nextUrl.searchParams.get("league")?.trim() || "";
  if (!league) {
    return NextResponse.json(
      { success: false, error: "Missing required query param: ?league=<slug>" },
      { status: 400 }
    );
  }

  const key = standingsKey(league);
  const { data, source } = await cacheAside<LeagueData>(key, TTL.standings, () =>
    fetchStandings(league)
  );

  if (!data) {
    return NextResponse.json(
      { success: false, error: `No standings found for league "${league}".` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data,
    meta: {
      cached: source !== "api",
      source,
      cacheTtlSeconds: TTL.standings,
      generatedAt: new Date().toISOString(),
      quota: getQuota(),
    },
  });
}