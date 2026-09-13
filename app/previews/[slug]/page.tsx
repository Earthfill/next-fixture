// ---------------------------------------------------------------------------
// Core Match Preview — SportsMole-style newspaper layout
// ---------------------------------------------------------------------------
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMatchPreviewBySlug } from "@/lib/cache/pages";
import MatchHeader from "@/components/football/MatchHeader";
import TacticalAnalysis from "@/components/football/TacticalAnalysis";
import HeadToHeadTable from "@/components/football/HeadToHeadTable";
import FormGuide from "@/components/football/FormGuide";
import OddsWidget from "@/components/football/OddsWidget";
import { getFixtureLineups, getTeamUpcomingFixtures, getLeagueStandings, getFixtureOdds, writePredictionReview, getPredictionReview } from "@/lib/cache/pages";
import { evaluatePrediction } from "@/lib/prediction-review";
import { computePrediction } from "@/lib/football/win-probability";
import { generateNlgAnalysis } from "@/lib/football/nlg-analysis";
import { getAdminOverride } from "@/lib/admin-overrides";
import { normalizeSlug } from "@/lib/football/config";
import AdSlot from "@/components/common/AdSlot";
import { AD_SLOTS } from "@/lib/ads";
import PredictionCard from "@/components/football/PredictionCard";
import WinProbability from "@/components/football/WinProbability";
import TeamNews from "@/components/football/TeamNews";
import UpcomingFixtures from "@/components/football/UpcomingFixtures";

export const dynamic = "force-dynamic"; // admin overrides must render live — no ISR HTML cache
export const maxDuration = 60; // Vercel: allow up to 60s for the cold-cache API fetch

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL as string;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  const preview = await getMatchPreviewBySlug(slug);
  if (!preview) return { title: "Preview Not Found", robots: { index: false } };

  // A match that still needs admin review is hidden → keep it out of search
  // indexes so the pending-review/404 page isn't indexed or shared as live.
  const [override, review] = await Promise.all([
    getAdminOverride(slug),
    getPredictionReview(slug).catch(() => null),
  ]);
  const hasOverride = Boolean(
    override?.predictedScore || override?.tip || override?.winProbability || override?.previewText
  );
  if (review?.flagged && !hasOverride) {
    return { title: "Preview Not Found", robots: { index: false, follow: false } };
  }

  const { fixture } = preview;
  return {
    title: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} Preview, Prediction & Betting Tips`,
    description: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — ${fixture.competition} preview with score prediction, betting tips and team news.`,
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
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  const preview = await getMatchPreviewBySlug(slug);
  if (!preview) notFound();

  const { fixture, homeForm, awayForm, headToHead, homeNews, awayNews, prediction } = preview;

  // Admin override (scoreline / tip / win-probability / preview text) — wins
  // over auto-computed values until the match date elapses.
  const override = await getAdminOverride(slug);

  // Has the admin saved any override field? An override marks the match as
  // "reviewed" — it becomes public regardless of the quality gate.
  const overrideHasPrediction = Boolean(
    override?.predictedScore || override?.tip || override?.winProbability || override?.previewText
  );

  // ─── Review gate — hide the whole match until it has been reviewed ─────
  // A fixture whose auto prediction fails the quality gate stays private until
  // an admin edits it (creating an override). We use the cached authoritative
  // review here so a hidden match isn't forced through the heavy fetches below.
  const reviewGate = await getPredictionReview(slug).catch(() => null);
  if (reviewGate?.flagged && !overrideHasPrediction) notFound();

  const compSlug = fixture.competition.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const homeId = parseInt(fixture.homeTeam.id);
  const awayId = parseInt(fixture.awayTeam.id);

  // Fetch every secondary data source in parallel. They only depend on `fixture`
  // (which we already have), so collapsing these sequential round-trips into one
  // Promise.all cuts a cold preview render from several seconds down to ~1-2s.
  const [leagueData, oddsRows, lineups, homeUpcoming, awayUpcoming] = await Promise.all([
    getLeagueStandings(compSlug),
    getFixtureOdds(fixture.id, fixture.homeTeam.shortName, fixture.awayTeam.shortName).catch(() => null),
    getFixtureLineups(fixture.id, {
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
    }),
    getTeamUpcomingFixtures(homeId),
    getTeamUpcomingFixtures(awayId),
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

  // Effective values: admin override wins, otherwise API prediction, otherwise
  // the Poisson-computed result.
  const predictedScore = override?.predictedScore
    ?? (prediction?.predictedScore ?? { home: predictionResult.homeScore, away: predictionResult.awayScore });
  const tip = override?.tip ?? prediction?.tip ?? predictionResult.tip;
  const homeWin = override?.winProbability?.home ?? predictionResult.homeWin;
  const draw = override?.winProbability?.draw ?? predictionResult.draw;
  const awayWin = override?.winProbability?.away ?? predictionResult.awayWin;

  // Regenerate analysis text aligned with the actual prediction data
  const alignedAnalysis = generateNlgAnalysis(
    fixture.homeTeam.name, fixture.awayTeam.name, fixture.competition,
    homeForm, awayForm, headToHead,
  );

  // Admin-written preview text replaces the generated analysis entirely.
  const analysisText = override?.previewText?.trim() || alignedAnalysis;

  // ─── Prediction quality gate (tip ↔ scoreline ↔ win-probability) ──────
  // Auto-computed predictions that fail the consistency check stay hidden
  // ("under review") until an admin explicitly edits the match. Once ANY
  // override field is set the admin has reviewed that prediction and it is
  // treated as authoritative — it gets published.
  // `prediction` here is the auto payload; `override` is the admin edit.
  const review = evaluatePrediction(
    tip,
    {
      predictedScore,
      winProbability: { home: homeWin, draw, away: awayWin },
      btts: prediction?.btts ?? null,
      overUnder: prediction?.overUnder ?? null,
    },
    fixture.homeTeam.name,
    fixture.awayTeam.name,
    fixture.homeTeam.shortName,
    fixture.awayTeam.shortName
  );
  const predictionBlocked = review.flagged && !overrideHasPrediction;

  // Persist the authoritative review result so the admin table reads it from cache.
  void writePredictionReview(slug, { flagged: review.flagged, reasons: review.reasons, available: true });

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
        {!predictionBlocked && tip !== "No predictions available" && (
          <div className="mt-6">
            <PredictionCard
              homeTeam={fixture.homeTeam.shortName}
              awayTeam={fixture.awayTeam.shortName}
              predictedScore={predictedScore}
              tip={tip}
            />
          </div>
        )}

        {/* Prediction review notice — shown in place of hidden prediction sections */}
        {predictionBlocked && (
          <div className="mt-6 rounded border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Prediction Under Review</p>
            <p className="mt-0.5 text-sm leading-relaxed text-amber-800">
              Our editors are checking this match&apos;s prediction before it is published. The winning tip and probability
              will appear here once they are verified.
            </p>
          </div>
        )}

        {/* 3. Win Probability + Ad */}
        {!predictionBlocked && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:block">
            <div className="lg:mr-80">
              <WinProbability
                homeWin={homeWin}
                draw={draw}
                awayWin={awayWin}
                homeTeam={fixture.homeTeam.shortName}
                awayTeam={fixture.awayTeam.shortName}
              />
            </div>
            <div className="flex items-start justify-center min-w-0">
              {/* <AdSlot slotId="preview-rect-1" {...AD_SLOTS["preview-rect-1"]} /> */}
            </div>
          </div>
        )}

        <hr className="sm-divider clear-both" />

        {/* 4. Tactical analysis */}
        {!predictionBlocked && tip !== "No predictions available" && (
          <div className="mt-6">
            <TacticalAnalysis analysis={analysisText} homeTeam={fixture.homeTeam.name} awayTeam={fixture.awayTeam.name} />
            <hr className="sm-divider" />
          </div>
        )}


        {/* 5. Team News */}
        {lineups[1].startXI.length > 1 && (
          <div className="mt-6">
            <TeamNews
              homeTeam={fixture.homeTeam.name}
              awayTeam={fixture.awayTeam.name}
              homeNews={homeNews ?? []}
              awayNews={awayNews ?? []}
              lineups={lineups}
            />

            <hr className="sm-divider" />
          </div>
        )}

        {/* 7. Head-to-head */}
        <div className="mt-6">
          <HeadToHeadTable matches={headToHead} homeTeam={fixture.homeTeam.name} awayTeam={fixture.awayTeam.name} />
          <hr className="sm-divider" />
        </div>


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
          {/* <AdSlot slotId="preview-leaderboard-2" format="leaderboard" /> */}
        </div>
      </article>
    </>
  );
}
