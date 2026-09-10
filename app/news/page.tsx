// ---------------------------------------------------------------------------
// News Page — Football news from RSS feeds (Guardian-independent)
// ---------------------------------------------------------------------------

import React from "react";
import type { Metadata } from "next";
import { getFootballNews } from "@/lib/news";
import NewsSection from "@/components/football/NewsSection";
import { Newspaper } from "lucide-react";

// Render fresh on every request so the featured (large) first story is never a
// stale prerender. News DATA itself is still cached ~3h via the "news" tag,
// so this does not hammer the feeds.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Football News — Latest Transfer News & Match Reports",
  description:
    "Latest football news including transfer rumours, match reports, injury updates and analysis. Stay informed with daily football headlines across Premier League, La Liga, Serie A and Bundesliga.",
  openGraph: {
    title: "Football News — Latest Updates | Next Fixture",
    description:
      "Latest football news including transfer rumours, match reports, injury updates and analysis from top European leagues.",
    url: "/news",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football News — Latest Updates",
    description:
      "Latest football news including transfer rumours, match reports and injury updates.",
  },
  alternates: {
    canonical: "/news",
  },
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageStr || "1"));
  const { articles: news, totalPages } = await getFootballNews({ pageSize: 13, page: currentPage });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="sm-heading-lg mb-1">Football News</h1>
          <p className="text-sm text-zinc-500">Latest football headlines from multiple sources</p>
        </div>
      </div>

      {/* Ad slot — news leaderboard */}
      {/* <AdSlot slotId="news-leaderboard-1" {...AD_SLOTS["news-leaderboard-1"]} className="mt-4" /> */}

      {news.length === 0 ? (
        <div className="border border-zinc-200 p-8 text-center">
          <Newspaper className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No news available right now — check back soon.</p>
        </div>
      ) : (
        <>
          <NewsSection news={news} layout="fullwidth" title="Latest News" />

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {currentPage > 1 ? (
              <a
                href={`/news?page=${currentPage - 1}`}
                className="border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition-colors"
              >
                ← Previous
              </a>
            ) : (
              <span className="border border-zinc-100 px-4 py-2 text-sm font-medium text-zinc-300 cursor-not-allowed">
                ← Previous
              </span>
            )}

            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <a
                    key={pageNum}
                    href={`/news?page=${pageNum}`}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      pageNum === currentPage
                        ? "bg-[#002b5c] text-white"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                    }`}
                  >
                    {pageNum}
                  </a>
                );
              })}
              {totalPages > 5 && (
                <span className="px-2 text-sm text-zinc-400">…</span>
              )}
            </div>

            {currentPage < totalPages ? (
              <a
                href={`/news?page=${currentPage + 1}`}
                className="border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition-colors"
              >
                Next →
              </a>
            ) : (
              <span className="border border-zinc-100 px-4 py-2 text-sm font-medium text-zinc-300 cursor-not-allowed">
                Next →
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}