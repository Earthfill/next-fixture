// ---------------------------------------------------------------------------
// /teams/[slug] — Team profile page
// ---------------------------------------------------------------------------
// ISR (6h) page showing: header, league position, form guide, upcoming
// fixtures (linking to previews), recent results, predicted lineup, squad,
// top scorers, injury news and latest team headlines.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTeamBySlug } from "@/lib/football/team-slugs";
import { COMPETITION_NAMES, COMPETITION_SLUGS, primaryCompetitionRank } from "@/lib/football/config";
import {
  getTeamUpcomingFixtures,
  getTeamRecentResults,
  getTeamHeadToHead,
  getTeamSquadData,
  getTeamInjuriesData,
  getTeamTopScorersData,
  getTeamTopAssistsData,
  getLeagueStandings,
  getFixtureLineups,
} from "@/lib/cache/pages";
import { getFootballNews } from "@/lib/news";
import type { Fixture, TeamForm } from "@/lib/types";
import TeamHeader from "@/components/football/TeamHeader";
import TeamPositionCard from "@/components/football/TeamPositionCard";
import TeamResultsSection from "@/components/football/TeamResultsSection";
import TeamSquadSection from "@/components/football/TeamSquadSection";
import TeamTopScorers from "@/components/football/TeamTopScorers";
import TeamTopAssists from "@/components/football/TeamTopAssists";
import FormGuide from "@/components/football/FormGuide";
import UpcomingFixtures from "@/components/football/UpcomingFixtures";
import LineupDisplay from "@/components/football/LineupDisplay";
import HeadToHeadTable from "@/components/football/HeadToHeadTable";
import NewsSection from "@/components/football/NewsSection";

export const revalidate = 86400; // 24 hours — matches the 24h data cache underneath

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL as string;

/** Resolve the primary competition slug for a team from its index competitions. */
function primaryLeagueSlug(competitions: string[]): string | null {
  // Rank every recognized competition and pick the strongest one: a domestic
  // league first, then a UEFA league phase, and only fall back to a cup (which
  // has no real league table) when nothing better exists.
  let best: { slug: string; rank: number } | null = null;
  for (const comp of competitions) {
    const slug = COMPETITION_SLUGS[comp];
    if (!slug) continue;
    const rank = primaryCompetitionRank(slug);
    if (!best || rank < best.rank) {
      best = { slug, rank };
    }
  }
  return best?.slug ?? null;
}

/** Build a TeamForm (W/D/L) from finished fixtures, newest first. */
function buildForm(teamName: string, results: Fixture[]): TeamForm | null {
  if (!results.length) return null;
  const recentMatches = results
    .filter((f) => f.score)
    .slice(0, 5)
    .map((f) => {
      const isHome = f.homeTeam.name === teamName;
      const home = f.score!.home;
      const away = f.score!.away;
      const result: "W" | "D" | "L" = home === away ? "D" : (isHome ? home > away : away > home) ? "W" : "L";
      const opponent = isHome ? f.awayTeam.name : f.homeTeam.name;
      const score = isHome ? `${home}-${away}` : `${away}-${home}`;
      return { opponent, result, score, isHome, competition: f.competition };
    });
  return {
    teamName,
    results: recentMatches.map((m) => m.result),
    recentMatches,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) return { title: "Team Not Found", robots: { index: false } };

  return {
    title: `${team.name} Fixtures, Results & Predicted Lineup`,
    description: `${team.name} — upcoming fixtures, recent results, form guide, squad, top scorers and predicted lineups for ${team.competitions.slice(0, 3).join(", ")}.`,
    alternates: { canonical: `${SITE_URL}/teams/${team.slug}` },
    openGraph: {
      title: `${team.name} — Fixtures, Results & Lineups | Next Fixture`,
      description: `Full ${team.name} profile: fixtures, results, form, squad and predicted lineups.`,
      url: `/teams/${team.slug}`,
      images: team.logo ? [{ url: team.logo, width: 512, height: 512 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${team.name} — Fixtures, Results & Lineups`,
      description: `Full ${team.name} profile with fixtures, results, form and predicted lineups.`,
    },
  };
}

const INJURY_STYLES: Record<string, string> = {
  injured: "bg-red-100 text-red-700",
  doubtful: "bg-amber-100 text-amber-700",
  suspended: "bg-zinc-200 text-zinc-700",
};

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const teamId = Number(team.id);
  const leagueSlug = primaryLeagueSlug(team.competitions);

  const [upcoming, results, squad, injuries, standings] = await Promise.all([
    getTeamUpcomingFixtures(teamId, 5),
    getTeamRecentResults(teamId, 8),
    getTeamSquadData(teamId),
    getTeamInjuriesData(teamId),
    leagueSlug ? getLeagueStandings(leagueSlug).catch(() => null) : Promise.resolve(null),
  ]);

  const form = buildForm(team.name, results);
  const standing =
    standings?.standings.find((s) => s.team.name === team.name || String(s.team.id) === team.id) ?? null;

  const scorers = leagueSlug ? await getTeamTopScorersData(teamId, leagueSlug) : [];
  const assists = leagueSlug ? await getTeamTopAssistsData(teamId, leagueSlug) : [];

  // Next fixture's confirmed/predicted lineups (via the cached lineups adapter).
  const nextFixture = [...(upcoming ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )[0];
  const lineups = nextFixture
    ? await getFixtureLineups(Number(nextFixture.id), {
      homeTeam: nextFixture.homeTeam,
      awayTeam: nextFixture.awayTeam,
    }).catch(() => [])
    : [];

  // H2H vs next opponent.
  let h2h: Awaited<ReturnType<typeof getTeamHeadToHead>> = [];
  if (nextFixture) {
    const oppId = nextFixture.homeTeam.id === team.id ? nextFixture.awayTeam.id : nextFixture.homeTeam.id;
    h2h = await getTeamHeadToHead(teamId, Number(oppId), 6).catch(() => []);
  }

  // Latest headlines mentioning this team.
  const { articles: allNews } = await getFootballNews({ pageSize: 25 });
  const teamNews = allNews.filter((n) => {
    const t = `${n.title} ${n.summary}`.toLowerCase();
    return t.includes(team.name.toLowerCase());
  });

  const oppName = nextFixture
    ? nextFixture.homeTeam.id === team.id
      ? nextFixture.awayTeam.name
      : nextFixture.homeTeam.name
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    url: `${SITE_URL}/teams/${team.slug}`,
    logo: team.logo || undefined,
    memberOf: team.competitions.map((c) => ({ "@type": "SportsOrganization", name: c })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6">
        <TeamHeader team={team} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main column */}
          <div className="min-w-0 space-y-8">
            {leagueSlug && (
              <TeamPositionCard
                leagueName={standings?.league?.name || COMPETITION_NAMES[leagueSlug] || leagueSlug}
                leagueSlug={leagueSlug}
                standing={standing}
              />
            )}

            {form && <FormGuide form={form} />}

            {upcoming.length > 0 && (
              <UpcomingFixtures teamName={team.name} fixtures={upcoming} />
            )}

            <TeamResultsSection teamName={team.name} results={results} />

            {lineups.length > 0 && nextFixture && (
              <div>
                <h2 className="sm-section-heading mb-2">Predicted Lineup vs {oppName}</h2>
                <LineupDisplay lineups={lineups} />
              </div>
            )}

            {h2h.length > 0 && nextFixture && (
              <HeadToHeadTable matches={h2h} homeTeam={team.name} awayTeam={oppName} />
            )}

            {injuries.length > 0 && (
              <div>
                <h2 className="sm-section-heading mb-2">Injuries &amp; Suspensions</h2>

                <div className="divide-y divide-zinc-100 border border-zinc-200 bg-white">
                  {[...new Map(injuries.map((i) => [i.playerName, i])).values()].map((i) => (
                    <div key={i.playerId} className="flex items-center gap-3 px-3 py-2">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${INJURY_STYLES[i.status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                      >
                        {i.reason === "Red Card" ? "Suspended" : i.status}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                        {i.playerName}
                      </span>

                      {i.reason && (
                        <span className="shrink-0 text-[11px] text-zinc-400">
                          {i.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <TeamSquadSection squad={squad} />
            <TeamTopScorers scorers={scorers} />
            <TeamTopAssists assists={assists} />
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <NewsSection news={teamNews} layout="sidebar" title={`${team.name} News`} />
          </aside>
        </div>
      </article>
    </>
  );
}