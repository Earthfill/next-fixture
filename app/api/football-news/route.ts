// ---------------------------------------------------------------------------
// GET /api/football-news — Returns latest football news
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getFootballNews } from "@/lib/news";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "8");
    const { articles: news, totalPages } = await getFootballNews({ pageSize, page });

    return NextResponse.json(
      { success: true, news, page, totalPages, pageSize },
      {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      }
    );
  } catch (error) {
    console.error("GET /api/football-news error:", error);
    return NextResponse.json({ success: false, news: [] }, { status: 500 });
  }
}