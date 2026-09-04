// ---------------------------------------------------------------------------
// Homepage — SportsMole-style: All matchdays stacked vertically
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { getAvailableMatchdays, getFixturesByDateGroupedByLeague } from "@/lib/cache/pages";
import { getFootballNews } from "@/lib/news";
import NewsSection from "@/components/football/NewsSection";
import MatchdayList from "@/components/football/MatchdayList";

export const revalidate = 10800; // 3 hours

export const metadata: Metadata = {
  title: "Football Predictions, Previews & Betting Tips Today",
  description:
    "Get today's football predictions, match previews, score predictions and betting tips for Premier League, La Liga, Serie A & Bundesliga. Expert analysis and head-to-head stats for every fixture.",
  openGraph: {
    title: "Football Predictions, Previews & Betting Tips Today | Next Fixture",
    description:
      "Get today's football predictions, match previews, score predictions and betting tips for Premier League, La Liga, Serie A & Bundesliga.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football Predictions, Previews & Betting Tips Today",
    description:
      "Get today's football predictions, match previews, score predictions and betting tips for top European leagues.",
  },
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const matchdays = await getAvailableMatchdays();
  const { articles: news } = await getFootballNews();


  // Fetch all matchdays in parallel
  const matchdayResults = await Promise.all(
    matchdays.map((md) => getFixturesByDateGroupedByLeague(md.slug))
  );

  const validMatchdays = matchdayResults.filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Next Fixture",
            url: process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com",
            description: "Football predictions, match previews and betting tips for Europe's top leagues.",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${
                  process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com"
                }/search?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />

      <h1 className="sm-heading-lg mb-2">
        Football Previews &amp; Predictions
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Match previews, predictions, team news and odds for the coming matchdays
      </p>

      {validMatchdays.length === 0 ? (
        <div className="border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-500">No upcoming fixtures found.</p>
        </div>
      ) : (
        <MatchdayList matchdays={validMatchdays} />
      )}

      {/* Latest Football News */}
      <div className="mt-10">
        <NewsSection news={news} layout="fullwidth" />
      </div>
      {/* SEO Text */}
      <div className="mt-10 max-w-3xl mx-auto text-center py-4">
        <hr className="sm-divider" />
        <h2 className="text-sm font-bold text-zinc-800 mt-4 mb-2">Football Predictions &amp; Betting Tips</h2>
        <p className="text-sm text-zinc-500 leading-relaxed sm-body">
          Next Fixture provides in-depth football match previews across Europe&apos;s top leagues.
          Our expert analysis covers team news, head-to-head statistics, form guides, and score
          predictions for every match. Get accurate betting tips and predictions for the Premier League,
          La Liga, Serie A, Bundesliga and more. We analyse upcoming fixtures daily to bring you the
          best football predictions and betting advice.
        </p>
      </div>
    </div>
  );
}
