// ---------------------------------------------------------------------------
// GET /api/cron/fixtures - Vercel Cron entry point for the midnight prefetch
// ---------------------------------------------------------------------------
// Triggered by vercel.json ("0 0 * * *"). Vercel attaches an
// "Authorization: Bearer <CRON_SECRET>" header automatically when CRON_SECRET
// is set in the project's environment variables.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { fetchNext7DaysFixtures } from "@/lib/jobs/midnight-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await fetchNext7DaysFixtures();
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[cron:fixtures] failed:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message || "Job failed." },
      { status: 500 }
    );
  }
}
