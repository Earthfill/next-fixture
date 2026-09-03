// ---------------------------------------------------------------------------
// POST /api/admin/seed — Clear API cache to force fresh data fetch
// ---------------------------------------------------------------------------
// Requires ADMIN_SECRET env var for authorization.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { clearApiCache } from "@/lib/football/api";

export async function POST(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;

  // Check authorization — allow Bearer header OR query param for easy testing
  const authHeader = request.headers.get("authorization");
  const queryToken = request.nextUrl.searchParams.get("token");
  const providedSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : queryToken?.trim() || null;

  if (adminSecret && providedSecret !== adminSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Pass ADMIN_SECRET via Authorization: Bearer <secret> or ?token=<secret>." },
      { status: 401 }
    );
  }

  try {
    clearApiCache();

    return NextResponse.json({
      success: true,
      message: "API cache cleared. Next page load will fetch fresh data from API-Football.",
    });
  } catch (error) {
    console.error("Seed endpoint error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear cache." },
      { status: 500 }
    );
  }
}