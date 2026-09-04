// ---------------------------------------------------------------------------
// GET /api/v1/live — Currently-live matches (30s cache)
// ---------------------------------------------------------------------------
// Returns only matches with status "live". Because the TTL is extremely short,
// a page refresh returns near-real-time scores from the cache-aside layer.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type { Fixture } from "@/lib/types";
import { cacheAside, peekCache } from "@/lib/cache";
import { liveKey, TTL } from "@/lib/cache/keys";
import { fetchLive } from "@/lib/cache/fetchers";
import { checkRateLimit } from "@/lib/api/rate-limiter";
import { getQuota } from "@/lib/football/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "live");
  if (!rl.allowed) {
    const retryAfter = Math.max(Math.ceil((rl.resetAt - Date.now()) / 1000), 1);
    return NextResponse.json(
      { error: "Too many requests. Please slow down.", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);

  const key = liveKey();
  const { data, source } = await cacheAside<Fixture[]>(key, TTL.live, () => fetchLive());

  const all = data ?? [];
  const liveOnly = all.filter((f) => f.status === "live");

  const total = liveOnly.length;
  const start = (page - 1) * limit;
  const items = liveOnly.slice(start, start + limit);

  return NextResponse.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: start + limit < total,
    },
    meta: {
      liveCount: total,
      cached: source !== "api",
      source,
      cacheTtlSeconds: TTL.live,
      generatedAt: new Date().toISOString(),
      quota: getQuota(),
      // Quick liveness peek at the "are there any live matches at all" sentinel.
      active: (await peekCache<boolean>("live:active")) === true,
    },
  });
}