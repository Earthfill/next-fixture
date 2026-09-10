// ---------------------------------------------------------------------------
// Homepage — SportsMole-style: All matchdays stacked vertically
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { getAvailableMatchdays, getFixturesByDateGroupedByLeague } from "@/lib/cache/pages";
import { getFootballNews } from "@/lib/news";
import NewsSection from "@/components/football/NewsSection";
import MatchdayList from "@/components/football/MatchdayList";
import AdSlot from "@/components/common/AdSlot";
import { AD_SLOTS } from "@/lib/ads";

export const revalidate = 10800; // 3 hours

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL as string;

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

/** Serialize an object to a JSON-LD string safe for inline <script> injection. */
function jsonLdScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

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
      {/* JSON-LD Structured Data — an Organization block with a logo is what
          Yandex (and Google's publisher logo) reads to show the brand in SERPs.
          Rendered as a plain SSR <script> so it's present in the raw HTML that
          non-JS crawlers (Yandex) fetch — afterInteractive next/script would
          only inject it post-hydration and crawlers would miss it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                name: "Next Fixture",
                url: SITE_URL,
                description: "Football predictions, match previews and betting tips for Europe's top leagues.",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
                publisher: {
                  "@type": "Organization",
                  name: "Next Fixture",
                  url: SITE_URL,
                  logo: `${SITE_URL}/logo.png`,
                },
              },
              {
                "@type": "Organization",
                name: "Next Fixture",
                url: SITE_URL,
                logo: `${SITE_URL}/logo.png`,
                image: `${SITE_URL}/logo.png`,
              },
            ],
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

      {/* Ad slot — homepage leaderboard (compact 60px until ads fill) */}
      {/* <AdSlot slotId="home-leaderboard-1" {...AD_SLOTS["home-leaderboard-1"]} className="mt-4" height={60} /> */}

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
