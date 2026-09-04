// ---------------------------------------------------------------------------
// GET /api/v1/fixtures — Fixture schedules for a given day/league
// ---------------------------------------------------------------------------
// Consumes data via the cache-aside layer (Redis → PostgreSQL → API-Football).
// Supports: ?date=YYYY-MM-DD, ?league=<slug>, ?page, ?limit (default page 1,
// limit 20, max 50). Responses are never merged into the static build.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type { Fixture } from "@/lib/types";
import { cacheAside } from "@/lib/cache";
import { fixturesKey, TTL } from "@/lib/cache/keys";
import { fetchFixtures, toDateString } from "@/lib/cache/fetchers";
import { checkRateLimit } from "@/lib/api/rate-limiter";
import { getQuota } from "@/lib/football/api";

// Enforce Node runtime + bypass static caching so live data stays fresh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 1. Rate limit per IP
  const rl = checkRateLimit(request, "fixtures");
  if (!rl.allowed) {
    const retryAfter = Math.max(Math.ceil((rl.resetAt - Date.now()) / 1000), 1);
    return NextResponse.json(
      { error: "Too many requests. Please slow down.", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const searchParams = request.nextUrl.searchParams;

  // 2. Parse query params
  const date = searchParams.get("date") || toDateString(new Date());
  const league = searchParams.get("league")?.trim() || undefined;
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 50);

  // 3. Read-through cache (24h TTL for schedules)
  const key = fixturesKey(date, league);
  const { data, source } = await cacheAside<Fixture[]>(key, TTL.fixtures, () =>
    fetchFixtures(date, league)
  );

  if (!data) {
    return NextResponse.json(
      { success: false, error: "No fixtures found for the requested date/league." },
      { status: 404 }
    );
  }

  // 4. Paginate in-memory
  const total = data.length;
  const start = (page - 1) * limit;
  const items = data.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: items,
    pagination: {
      date,
      league,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: start + limit < total,
    },
    meta: {
      cached: source !== "api",
      source,
      cacheTtlSeconds: TTL.fixtures,
      generatedAt: new Date().toISOString(),
      quota: getQuota(),
    },
  });
}