// ---------------------------------------------------------------------------
// Core Match Preview — SportsMole-style newspaper layout
// ---------------------------------------------------------------------------
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMatchPreviewBySlug } from "@/lib/sports-api";
import MatchHeader from "@/components/football/MatchHeader";
import TacticalAnalysis from "@/components/football/TacticalAnalysis";
import HeadToHeadTable from "@/components/football/HeadToHeadTable";
import FormGuide from "@/components/football/FormGuide";
import OddsWidget from "@/components/football/OddsWidget";
import { getFixtureLineups, getTeamUpcomingFixtures, getLeagueStandings, getFixtureOdds } from "@/lib/sports-api";
import { computePrediction } from "@/lib/football/win-probability";
import { generateNlgAnalysis } from "@/lib/football/nlg-analysis";
import AdSlot from "@/components/common/AdSlot";
import PredictionCard from "@/components/football/PredictionCard";
import WinProbability from "@/components/football/WinProbability";
import TeamNews from "@/components/football/TeamNews";
import UpcomingFixtures from "@/components/football/UpcomingFixtures";

export const revalidate = 7200; // 2 hours

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const preview = await getMatchPreviewBySlug(slug);
  if (!preview) return { title: "Preview Not Found", robots: { index: false } };

  const { fixture } = preview;
  return {
    title: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} Preview, Prediction & Betting Tips`,
    description: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — ${fixture.competition} preview with score prediction, betting tips, team news, stats, H2H and odds. Expert analysis for this match.`,
    alternates: { canonical: `${SITE_URL}/previews/${slug}` },
    openGraph: {
      type: "website", locale: "en_GB",
      url: `${SITE_URL}/previews/${slug}`,
      siteName: "NextFixture",
      title: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — Match Preview, Prediction & Betting Tips`,
      description: `${fixture.competition} preview with score prediction, betting tips, team news and odds. Expert analysis.`,
      images: [{ url: fixture.homeTeam.logo, width: 512, height: 512 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — Preview & Prediction`,
      description: `${fixture.competition} match preview with score prediction, betting tips and expert analysis.`,
      images: [fixture.homeTeam.logo],
    },
    robots: { index: true, follow: true },
  };
}

export default async function MatchPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const preview = await getMatchPreviewBySlug(slug);
  if (!preview) notFound();

  const { fixture, homeForm, awayForm, headToHead, analysis, homeNews, awayNews, prediction } = preview;

  // Fetch standings for heuristic win probability
  const compSlug = fixture.competition.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const [leagueData, oddsRows] = await Promise.all([
    getLeagueStandings(compSlug),
    getFixtureOdds(fixture.id, fixture.homeTeam.shortName, fixture.awayTeam.shortName).catch(() => null),
  ]);

  const homeStanding = leagueData?.standings?.find(
    (s) => s.team.name === fixture.homeTeam.name
  );
  const awayStanding = leagueData?.standings?.find(
    (s) => s.team.name === fixture.awayTeam.name
  );

  const odds = oddsRows?.[0]
    ? { homeOdds: oddsRows[0].home, drawOdds: oddsRows[0].draw, awayOdds: oddsRows[0].away }
    : null;

  const predictionResult = computePrediction({
    headToHead,
    homeForm,
    awayForm,
    homeStanding: homeStanding ?? null,
    awayStanding: awayStanding ?? null,
    odds: odds ?? null,
  });

  // Regenerate analysis text aligned with the actual prediction data
  const alignedAnalysis = generateNlgAnalysis(
    fixture.homeTeam.name, fixture.awayTeam.name, fixture.competition,
    homeForm, awayForm, headToHead,
    prediction ? {
      tip: prediction.tip,
      homeScore: prediction.predictedScore.home,
      awayScore: prediction.predictedScore.away,
      confidence: prediction.confidence,
      homeWin: prediction.winProbability.home,
      draw: prediction.winProbability.draw,
      awayWin: prediction.winProbability.away,
    } : {
      tip: predictionResult.tip,
      homeScore: predictionResult.homeScore,
      awayScore: predictionResult.awayScore,
      confidence: predictionResult.confidence,
      homeWin: predictionResult.homeWin,
      draw: predictionResult.draw,
      awayWin: predictionResult.awayWin,
    }
  );

  const lineups = await getFixtureLineups(fixture.id, {
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
  });

  // Fetch upcoming fixtures for both teams
  const homeId = parseInt(fixture.homeTeam.id);
  const awayId = parseInt(fixture.awayTeam.id);
  const [homeUpcoming, awayUpcoming] = await Promise.all([
    getTeamUpcomingFixtures(homeId),
    getTeamUpcomingFixtures(awayId),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    startDate: fixture.date,
    location: { "@type": "Place", name: fixture.venue.name, address: { "@type": "PostalAddress", addressLocality: fixture.venue.city } },
    homeTeam: { "@type": "SportsTeam", name: fixture.homeTeam.name },
    awayTeam: { "@type": "SportsTeam", name: fixture.awayTeam.name },
    competition: { "@type": "SportsEvent", name: fixture.competition },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6">
        {/* 1. Match header */}
        <MatchHeader match={fixture} />

        {/* 2. Prediction */}
        <div className="mt-6">
          <PredictionCard
            homeTeam={fixture.homeTeam.shortName}
            awayTeam={fixture.awayTeam.shortName}
            predictedScore={prediction?.predictedScore ?? { home: predictionResult.homeScore, away: predictionResult.awayScore }}
            tip={prediction?.tip ?? predictionResult.tip}
          />
        </div>

        {/* 3. Win Probability + Ad */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WinProbability
              homeWin={predictionResult.homeWin}
              draw={predictionResult.draw}
              awayWin={predictionResult.awayWin}
              homeTeam={fixture.homeTeam.shortName}
              awayTeam={fixture.awayTeam.shortName}
            />
          </div>
          <div className="flex items-start justify-center lg:justify-end">
            <AdSlot slotId="preview-rect-1" format="rectangle" />
          </div>
        </div>

        <hr className="sm-divider" />

        {/* 4. Tactical analysis */}
        <div className="mt-6">
          <TacticalAnalysis analysis={alignedAnalysis} homeTeam={fixture.homeTeam.name} awayTeam={fixture.awayTeam.name} />
        </div>

        <hr className="sm-divider" />

        {/* 5. Team News */}
        <div className="mt-6">
          <TeamNews
            homeTeam={fixture.homeTeam.name}
            awayTeam={fixture.awayTeam.name}
            homeNews={homeNews ?? []}
            awayNews={awayNews ?? []}
            lineups={lineups}
          />
        </div>

        <hr className="sm-divider" />

        {/* 7. Head-to-head */}
        <div className="mt-6">
          <HeadToHeadTable matches={headToHead} homeTeam={fixture.homeTeam.name} awayTeam={fixture.awayTeam.name} />
        </div>

        <hr className="sm-divider" />

        {/* 8. Form guides */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <FormGuide form={homeForm} />
          <FormGuide form={awayForm} />
        </div>

        {/* 8b. Upcoming fixtures */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <UpcomingFixtures teamName={fixture.homeTeam.name} fixtures={homeUpcoming} />
          <UpcomingFixtures teamName={fixture.awayTeam.name} fixtures={awayUpcoming} />
        </div>

        <hr className="sm-divider" />

        {/* 9. Odds */}
        <div className="mt-6">
          <OddsWidget fixtureId={fixture.id} homeTeam={fixture.homeTeam.shortName} awayTeam={fixture.awayTeam.shortName} />
        </div>

        <hr className="sm-divider" />

        {/* 11. Bottom ad */}
        <div className="mt-8 flex justify-center">
          <AdSlot slotId="preview-leaderboard-2" format="leaderboard" />
        </div>
      </article>
    </>
  );
}
