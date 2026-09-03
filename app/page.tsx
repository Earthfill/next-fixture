// ---------------------------------------------------------------------------
// Homepage — SportsMole-style: All matchdays stacked vertically
// ---------------------------------------------------------------------------

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getAvailableMatchdays, getFixturesByDateGroupedByLeague } from "@/lib/sports-api";
import { getFootballNews } from "@/lib/news";
import FootballMatchCard from "@/components/football/FootballMatchCard";
import NewsSection from "@/components/football/NewsSection";
import { ChevronRight } from "lucide-react";

export const revalidate = 1800;

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

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
        <div className="space-y-10">
          {validMatchdays.map((matchday, idx) => (
            <section key={matchday.date}>
              {/* Date heading — like SportsMole's "Saturday 5th September 2026" */}
              <h2 className="text-base font-bold text-zinc-800 mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#002b5c]"></span>
                {formatDateLabel(matchday.date)}
                <span className="text-xs font-normal text-zinc-400">
                  ({matchday.fixtureCount} match{matchday.fixtureCount !== 1 ? 'es' : ''})
                </span>
              </h2>

              {/* League sections */}
              <div className="space-y-6">
                {matchday.leagues.map((league) => (
                  <div key={league.competition}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {league.competitionLogo && (
                          <Image src={league.competitionLogo} alt="" width={20} height={20} className="h-5 w-5" />
                        )}
                        <h3 className="sm-section-heading mb-0 pb-0" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                          {league.competition}
                        </h3>
                      </div>
                      <Link
                        href={`/leagues/${league.competitionSlug}`}
                        prefetch={false}
                        className="text-[11px] font-medium flex items-center gap-0.5"
                        style={{ color: '#002b5c' }}
                      >
                        Standings <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <hr className="sm-divider mt-1 mb-0" />
                    <div className="border border-zinc-200 bg-white">
                      {league.fixtures.map((fixture) => (
                        <FootballMatchCard key={fixture.id} fixture={fixture} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Spacer between matchdays */}
              {idx < validMatchdays.length - 1 && (
                <div className="mt-8 border-t border-zinc-200" />
              )}
            </section>
          ))}
        </div>
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
