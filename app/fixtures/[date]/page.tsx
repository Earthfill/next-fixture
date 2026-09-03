// ---------------------------------------------------------------------------
// /fixtures/[date] — All matches for a specific date, grouped by league
// ---------------------------------------------------------------------------

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFixturesByDateGroupedByLeague } from "@/lib/sports-api";
import FootballMatchCard from "@/components/football/FootballMatchCard";
import { ChevronRight, Calendar } from "lucide-react";

export const revalidate = 10800; // 3 hours

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const d = new Date(date + "T12:00:00");
  const label = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return {
    title: `Football Fixtures — ${label} | Premier League, La Liga & More`,
    description: `Full list of football fixtures for ${label} across the Premier League, La Liga, Serie A, Bundesliga and more. Get match previews, predictions and betting tips for all games.`,
    alternates: { canonical: `${SITE_URL}/fixtures/${date}` },
    openGraph: {
      title: `Football Fixtures — ${label} | Next Fixture`,
      description: `View all football fixtures for ${label} across Europe's top leagues. Match previews, predictions and betting tips available.`,
      url: `/fixtures/${date}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `Football Fixtures — ${label}`,
      description: `Full list of football fixtures for ${label} across Europe's top leagues.`,
    },
  };
}

export default async function FixturesByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const matchday = await getFixturesByDateGroupedByLeague(date);
  if (!matchday) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
        <Link href="/" className="hover:text-blue-700">Home</Link>
        <span>›</span>
        <span className="font-medium text-zinc-700">Fixtures</span>
        <span>›</span>
        <span className="text-zinc-500">{matchday.label}</span>
      </div>

      {/* Header */}
      <h1 className="sm-heading-lg mb-1">
        Football Fixtures — {matchday.label}
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        {matchday.fixtureCount} matches across {matchday.leagues.length} competitions
      </p>

      {/* League sections */}
      <div className="space-y-8">
        {matchday.leagues.map((league) => (
          <section key={league.competition}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {league.competitionLogo && (
                  <Image src={league.competitionLogo} alt="" width={20} height={20} className="h-5 w-5" />
                )}
                <h2 className="sm-section-heading mb-0 pb-0" style={{ borderBottom: "none", marginBottom: 0, paddingBottom: 0 }}>
                  {league.competition}
                </h2>
                <span className="text-xs text-zinc-400">({league.fixtures.length} matches)</span>
              </div>
              <Link
                href={`/leagues/${league.competitionSlug}`}
                className="text-[11px] font-medium flex items-center gap-0.5"
                style={{ color: "#002b5c" }}
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
          </section>
        ))}
      </div>

      {/* Back link */}
      <div className="mt-8 text-center">
        <Link href="/" className="text-sm font-medium flex items-center gap-1 justify-center" style={{ color: "#002b5c" }}>
          <Calendar className="h-4 w-4" /> View All Matchdays
        </Link>
      </div>
    </div>
  );
}