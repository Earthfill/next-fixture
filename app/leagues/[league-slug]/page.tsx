// ---------------------------------------------------------------------------
// League Page — Simple standings & fixtures
// ---------------------------------------------------------------------------
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueStandings, getTopScorers, getTopAssists, getPastResults, getYouTubeHighlights } from "@/lib/cache/pages";
import { getFootballNews } from "@/lib/news";
import { Goal } from "lucide-react";
import NewsSection from "@/components/football/NewsSection";
import PastResults from "@/components/football/PastResults";
import VideoHighlights from "@/components/football/VideoHighlights";

const leagueNames: Record<string, string> = {
  "premier-league": "Premier League", "la-liga": "La Liga",
  "serie-a": "Serie A", "bundesliga": "Bundesliga",
  "ligue-1": "Ligue 1", "eredivisie": "Eredivisie", "primeira-liga": "Primeira Liga",
};

export const revalidate = 43200; // 12 hours

export async function generateMetadata({ params }: { params: Promise<{ "league-slug": string }> }): Promise<Metadata> {
  const s = (await params)["league-slug"];
  const n = leagueNames[s] ?? s;
  return {
    title: `${n} Standings & Predictions — Football League Table & Preview`,
    description: `Full ${n} standings, upcoming fixtures, top scorers and match predictions. Get expert analysis, betting tips and head-to-head stats for every ${n} match this season.`,
    openGraph: {
      title: `${n} Standings & Predictions | Next Fixture`,
      description: `Full ${n} league table, fixtures, top scorers and match predictions with expert analysis.`,
      url: `/leagues/${s}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${n} Standings & Predictions`,
      description: `Full ${n} league table, fixtures and match predictions with expert analysis.`,
    },
    alternates: { canonical: `/leagues/${s}` },
  };
}

export default async function LeaguePage({ params }: { params: Promise<{ "league-slug": string }> }) {
  const s = (await params)["league-slug"];
  const data = await getLeagueStandings(s);

  const { league, standings, upcomingFixtures } = data!;
  const scorers = await getTopScorers(s, 10);
  const assists = await getTopAssists(s, 10);
  const { articles: news } = await getFootballNews();
  const pastResults = await getPastResults(s, 12);

  // Fetch YouTube highlights for top goal-scoring matches
  const topMatches = pastResults
    .filter((m) => m.score)
    .sort((a, b) => (b.score!.home + b.score!.away) - (a.score!.home + a.score!.away))
    .slice(0, 4);

  const highlights = (await Promise.all(
    topMatches.map((m) =>
      getYouTubeHighlights(m.homeTeam.name, m.awayTeam.name, m.competition, m.date, 3)
    )
  )).flat();

  const scorersData = [...scorers].sort(
    (a, b) =>
      b.goals !== a.goals
        ? b.goals - a.goals
        : (b.assists ?? 0) - (a.assists ?? 0)
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* JSON-LD Structured Data for League */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: league.name,
            description: `${league.name} standings, fixtures and match predictions.`,
            url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com"}/leagues/${s}`,
          }),
        }}
      />

      <div className="flex items-center gap-3 mb-6">
        <Image src={league.logo} alt="" width={32} height={32} className="h-8 w-8" />
        <h1 className="sm-heading-lg">{league.name}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="sm-section-heading">Standings</h2>
          <table className="sm-table">
            <thead>
              <tr>
                {["#", "Team", "P", "W", "D", "L", "GD", "Pts", "Form"].map(h => <th key={h} className={h === "Team" ? "text-left" : "text-center"}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {standings.map(st => (
                <tr key={st.team.id}>
                  <td className={`text-left font-bold text-sm ${st.position <= 4 ? 'text-green-600' : 'text-zinc-500'}`}>{st.position}</td>
                  <td><span className="text-sm font-medium text-zinc-800">{st.team.name}</span></td>
                  <td className="text-sm text-zinc-600">{st.played}</td>
                  <td className="text-sm text-zinc-600">{st.won}</td>
                  <td className="text-sm text-zinc-600">{st.drawn}</td>
                  <td className="text-sm text-zinc-600">{st.lost}</td>
                  <td className={`text-sm font-semibold ${st.goalDifference > 0 ? 'text-green-600' : st.goalDifference == 0 ? "text-neutral-600" : 'text-red-600'}`}>{st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}</td>
                  <td className="text-sm font-bold text-zinc-800">{st.points}</td>
                  <td>
                    <div className="flex justify-start items-center gap-0.5">
                      {st.form.map((r, i) => (
                        <span key={i} className={r === 'W' ? 'sm-form-w' : r === 'D' ? 'sm-form-d' : 'sm-form-l'} style={{ width: 18, height: 18, fontSize: 9 }}>{r}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Past Results — below standings on large screens */}
          <div className="mt-8 hidden lg:block">
            <PastResults results={pastResults} />
          </div>

          {/* Video Highlights — under Past Results on large screens */}
          {highlights.length > 0 && (
            <div className="mt-8 hidden lg:block">
              <VideoHighlights videos={highlights} />
            </div>
          )}
        </div>

        <div className="space-y-8">
          {upcomingFixtures.length > 0 && (
            <div>
              <h2 className="sm-section-heading">Upcoming</h2>
              <div className="md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-none">
                {upcomingFixtures.map(f => (
                  <div key={f.id} className="block border border-zinc-200 p-3 hover:bg-zinc-50 transition-colors bg-white">
                    <div className="text-xs text-zinc-400 mb-1">
                      {new Date(f.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                    <div className="grid grid-cols-[1fr_15px_1fr] gap-x-6 text-sm">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-medium text-zinc-700">{f.homeTeam.shortName}</span>
                        <Image src={f.homeTeam.logo} alt={f.homeTeam.shortName} width={20} height={20} className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] text-zinc-400">vs</span>
                      <div className="flex items-center gap-2">
                        <Image src={f.awayTeam.logo} alt={f.homeTeam.shortName} width={20} height={20} className="h-5 w-5" />
                        <span className="font-medium text-zinc-700">{f.awayTeam.shortName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past Results + News — side by side on tablet, stacked on mobile, hidden on large */}
          <div className="grid md:grid-cols-2 gap-5 lg:hidden">
            <PastResults results={pastResults} />
            <NewsSection news={news} layout="sidebar" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-none gap-5">
            {/* Top Scorers */}
            {scorers.length > 0 && (
              <div>
                <div>
                  <h2 className="sm-section-heading flex items-center gap-2">
                    <Goal className="h-4 w-4" />
                    Top Scorers
                  </h2>
                  <div className="border border-zinc-200 bg-white">
                    {scorersData.map((scorer, i) => {
                      const previous = scorersData[i - 1];

                      const isTied = previous && scorer.goals === previous.goals && (scorer.assists ?? 0) === (previous.assists ?? 0);

                      const rank = isTied
                        ? (() => {
                          let firstIndex = i - 1;
                          while (firstIndex > 0 && scorersData[firstIndex - 1].goals === scorer.goals && (scorersData[firstIndex - 1].assists ?? 0) === (scorer.assists ?? 0)) { firstIndex--; }
                          return firstIndex + 1;
                        })()
                        : i + 1;

                      return (
                        <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 last:border-b-0 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {rank <= 3 ? (
                              <span className={`text-xs font-bold w-5 text-center ${rank === 1 ? "text-amber-500" : rank === 2 ? "text-zinc-400" : "text-amber-700"}`}>
                                {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400 w-5 text-center">{rank}</span>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-800 truncate">{scorer.player.name}</p>
                              <div className="flex items-center gap-1">
                                <Image src={scorer.team.logo} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                                <span className="text-[11px] text-zinc-500 truncate">{scorer.team.name}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="text-sm font-bold text-zinc-900">{scorer.goals}</span>
                            {scorer.assists != null && <span className="text-[11px] text-zinc-400 ml-2">({scorer.assists})</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Top Assists */}
            {assists.length > 0 && (
              <div>
                <h2 className="sm-section-heading flex items-center gap-2">
                  <Goal className="h-4 w-4" />
                  Top Assists
                </h2>
                <div className="border border-zinc-200 bg-white">
                  {assists.map((player, i) => {
                    const previous = assists[i - 1];
                    const isTied = previous && player.assists === previous.assists;
                    const rank = isTied
                      ? (() => {
                        let firstIndex = i - 1;
                        while (firstIndex > 0 && assists[firstIndex - 1].assists === player.assists) { firstIndex--; }
                        return firstIndex + 1;
                      })()
                      : i + 1;

                    return (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-100 last:border-b-0 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {rank <= 3 ? (
                            <span className={`text-xs font-bold w-5 text-center ${rank === 1 ? "text-amber-500" : rank === 2 ? "text-zinc-400" : "text-amber-700"}`}>
                              {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400 w-5 text-center">{rank}</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-800 truncate">{player.player.name}</p>
                            <div className="flex items-center gap-1">
                              <Image src={player.team.logo} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                              <span className="text-[11px] text-zinc-500 truncate">{player.team.name}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-sm font-bold text-zinc-900">{player.assists}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Latest Football News — large screens only (mobile/tablet shown above) */}
            <div className="hidden lg:block">
              <NewsSection news={news} layout="sidebar" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
