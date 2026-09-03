// ---------------------------------------------------------------------------
// Service — All exported business logic functions
// ---------------------------------------------------------------------------

import type {
  Fixture, TeamForm, HeadToHeadMatch, LeagueStanding,
  MatchPreview, LeagueData, FixtureGroup, MatchdayGroup, PredictionData, TopScorer, PlayerNews,
} from "@/lib/types";
import { apiFetch, hasApi } from "@/lib/football/api";
import { loadTeams, loadH2H } from "@/lib/football/local";
import { buildPrediction, generateAnalysis } from "@/lib/football/analysis";
import {
  LEAGUE_IDS, LEAGUE_ID_TO_NAME, COMPETITION_LOGOS, COMPETITION_SLUGS,
  SLUG_TO_LEAGUE_ID, LEAGUE_ORDER, generateSlug, parseSlug, normalizeName,
} from "@/lib/football/config";

// ─── Covered leagues cache (fetched once, cached aggressively) ────────

interface CoveredLeague {
  id: number;
  name: string;
  season: number;
  hasFixtures: boolean;
  hasStandings: boolean;
  hasTopScorers: boolean;
  hasTopAssists: boolean;
  hasPredictions: boolean;
}

let coveredLeaguesCache: CoveredLeague[] | null = null;

async function getCoveredLeagues(): Promise<CoveredLeague[]> {
  if (coveredLeaguesCache) return coveredLeaguesCache;

  if (!hasApi()) return [];

  // Fetch all leagues with current season info
  const data = await apiFetch<{ response: any[] }>("/leagues?current=true");
  if (!data?.response?.length) return [];

  // Filter to only the leagues we track (by slug/name)
  const ourLeagueIds = new Set(Object.values(LEAGUE_IDS));

  coveredLeaguesCache = data.response
    .filter((entry: any) => {
      const leagueId = entry.league?.id;
      return ourLeagueIds.has(leagueId);
    })
    .map((entry: any) => {
      const league = entry.league;
      const seasons = entry.seasons || [];
      const currentSeason = seasons.find((s: any) => s.current === true) || seasons[0] || {};
      const coverage = currentSeason.coverage || {};
      return {
        id: league.id,
        name: league.name,
        season: currentSeason.year || 0,
        hasFixtures: coverage.fixtures?.events || false,
        hasStandings: coverage.standings || false,
        hasTopScorers: coverage.top_scorers || false, hasTopAssists: coverage.top_assists || false,
        hasPredictions: coverage.predictions || false,
      };
    });

  return coveredLeaguesCache;
}


// ─── Helpers ────────────────────────────────────────────────────────────

function apiFixtureToFixture(m: any): Fixture | null {
  if (!m?.teams?.home?.name || !m?.teams?.away?.name) return null;
  const f = m.fixture;
  const t = m.teams;
  const l = m.league;
  const status = f?.status?.short;
  return {
    id: String(f.id),
    slug: generateSlug(String(f.id), t.home.name, t.away.name),
    homeTeam: { id: String(t.home.id), name: t.home.name, shortName: t.home.name.substring(0, 3).toUpperCase(), logo: t.home.logo || "" },
    awayTeam: { id: String(t.away.id), name: t.away.name, shortName: t.away.name.substring(0, 3).toUpperCase(), logo: t.away.logo || "" },
    competition: LEAGUE_ID_TO_NAME[l?.id] || l?.name || "",
    competitionLogo: COMPETITION_LOGOS[LEAGUE_ID_TO_NAME[l?.id] || ""] || "",
    venue: { name: f?.venue?.name || "", city: f?.venue?.city || "" },
    date: f?.date || "",
    status: status === "NS" || status === "TBD" ? "upcoming" : status === "LIVE" || status === "1H" || status === "2H" || status === "HT" ? "live" : "finished",
    score: m.goals?.home !== null ? { home: m.goals.home, away: m.goals.away } : undefined,
    matchday: l?.round ? parseInt(l.round.replace(/[^0-9]/g, "")) || 0 : 0,
  };
}

// ─── Exported Functions ─────────────────────────────────────────────

export async function getUpcomingFixtures(value?: number): Promise<Fixture[]> {
  if (!hasApi()) return [];

  const leagues = await getCoveredLeagues();
  if (!leagues.length) return [];

  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (value ?? 3));
  const to = endDate.toISOString().split("T")[0];

  // Fetch fixtures per league with from+to range
  const allFixtures: Fixture[] = [];
  for (const league of leagues) {
    const data = await apiFetch<{ response: any[] }>(
      `/fixtures?from=${today}&to=${to}&league=${league.id}&season=${league.season}`
    );
    if (data?.response?.length) {
      allFixtures.push(...data.response.map(apiFixtureToFixture).filter(Boolean) as Fixture[]);
    }
  }

  return allFixtures;
}

export async function getAvailableMatchdays(): Promise<{ date: string; label: string; slug: string; fixtureCount: number }[]> {
  const fixtures = await getUpcomingFixtures();
  const dateMap = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = f.date.split("T")[0];
    if (!dateMap.has(key)) dateMap.set(key, []);
    dateMap.get(key)!.push(f);
  }
  return Array.from(dateMap.entries()).map(([dateKey, dayFx]) => {
    const d = new Date(dateKey + "T12:00:00");
    return { date: dateKey, label: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), slug: dateKey, fixtureCount: dayFx.length };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getFixturesByDateGroupedByLeague(date?: string): Promise<MatchdayGroup | null> {
  const fixtures = await getUpcomingFixtures();
  if (fixtures.length === 0) return null;
  if (!date) {
    const dates = [...new Set(fixtures.map((f) => f.date.split("T")[0]))].sort();
    date = dates[0] ?? null;
    if (!date) return null;
  }
  const dayFixtures = fixtures.filter((f) => f.date.startsWith(date!));
  if (dayFixtures.length === 0) return null;
  const leagueMap = new Map<string, Fixture[]>();
  for (const f of dayFixtures) { if (!leagueMap.has(f.competition)) leagueMap.set(f.competition, []); leagueMap.get(f.competition)!.push(f); }
  const leagues: FixtureGroup[] = Array.from(leagueMap.entries())
    .map(([comp, compFixtures]) => ({ competition: comp, competitionLogo: COMPETITION_LOGOS[comp] || "", competitionSlug: COMPETITION_SLUGS[comp] || comp.toLowerCase().replace(/\s+/g, "-"), fixtures: compFixtures }))
    .sort((a, b) => LEAGUE_ORDER.indexOf(a.competition) - LEAGUE_ORDER.indexOf(b.competition));
  const d = new Date(date + "T12:00:00");
  return { date, label: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), slug: date, fixtureCount: dayFixtures.length, leagues };
}


export async function getLeagueStandings(leagueSlug: string): Promise<LeagueData | null> {
  const leagueId = SLUG_TO_LEAGUE_ID[leagueSlug];
  if (!leagueId || !hasApi()) return null;

  const leagues = await getCoveredLeagues();
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) return null;

  const season = league?.season;
  if (!season) return null;

  const name = LEAGUE_ID_TO_NAME[leagueId] || leagueSlug;

  const data = await apiFetch<{ response: { league: { standings: any[][] } }[] }>(
    `/standings?league=${leagueId}&season=${season}`
  );
  if (!data?.response?.[0]?.league?.standings?.[0]) return null;

  const standings: LeagueStanding[] = data.response[0].league.standings[0].map((row: any) => {
    const formStr: string = row.form || "";
    const form: ("W"|"D"|"L")[] = formStr
      ? formStr.split("").map((c: string) => c.replace("-", "L") as "W"|"D"|"L")
      : [];
    return {
      position: row.rank,
      team: { id: String(row.team?.id || ""), name: row.team?.name || "", shortName: row.team?.name?.substring(0, 3).toUpperCase() || "", logo: row.team?.logo || "" },
      played: row.all?.played || 0, won: row.all?.win || 0, drawn: row.all?.draw || 0, lost: row.all?.lose || 0,
      goalsFor: row.all?.goals?.for || 0, goalsAgainst: row.all?.goals?.against || 0,
      goalDifference: (row.all?.goals?.for || 0) - (row.all?.goals?.against || 0),
      points: row.points || 0,
      form: form.slice(0, 5),
    };
  });

  const fixtures = await getUpcomingFixtures(7);
  return { league: { name, slug: leagueSlug, logo: COMPETITION_LOGOS[name] || "" }, standings, upcomingFixtures: fixtures.filter((f) => f.competition === name).slice(0, 6) };
}

export async function getMatchPreviewBySlug(slug: string): Promise<MatchPreview | null> {
  if (!hasApi()) return null;

  // Try to extract fixture ID from the slug (format: "{fixtureId}--{home}-vs-{away}")
  const { fixtureId: extractedId } = parseSlug(slug);

  let fixture: Fixture | undefined;
  let fixtureId = 0;
  let homeId = 0;
  let awayId = 0;

  if (extractedId) {
    // Direct API fetch by fixture ID — most reliable path
    const fixtureData = await apiFetch<any>(`/fixtures?id=${extractedId}`);
    const m = fixtureData?.response?.[0];
    if (m?.teams?.home?.name && m?.teams?.away?.name) {
      const f = m.fixture;
      const t = m.teams;
      const l = m.league;
      fixture = {
        id: String(f.id),
        slug,
        homeTeam: { id: String(t.home.id), name: t.home.name, shortName: t.home.name.substring(0, 3).toUpperCase(), logo: t.home.logo || "" },
        awayTeam: { id: String(t.away.id), name: t.away.name, shortName: t.away.name.substring(0, 3).toUpperCase(), logo: t.away.logo || "" },
        competition: l?.name || "",
        competitionLogo: COMPETITION_LOGOS[l?.name] || l?.logo || "",
        venue: { name: f?.venue?.name || "", city: f?.venue?.city || "" },
        date: f?.date || "",
        status: f?.status?.short === "FT" || f?.status?.short === "AET" || f?.status?.short === "PEN" ? "finished" : f?.status?.short === "LIVE" || f?.status?.short === "1H" || f?.status?.short === "2H" || f?.status?.short === "HT" || f?.status?.short === "ET" ? "live" : "upcoming",
        score: f?.status?.short === "FT" || f?.status?.short === "AET" || f?.status?.short === "PEN" || f?.status?.short === "LIVE" || f?.status?.short?.includes("H") ? { home: m.goals?.home ?? 0, away: m.goals?.away ?? 0 } : undefined,
      };
      fixtureId = parseInt(f.id);
      homeId = parseInt(t.home.id);
      awayId = parseInt(t.away.id);
    }
  }

  // Fallback: search in the upcoming fixtures cache (old format slugs)
  if (!fixture) {
    const fixtures = await getUpcomingFixtures();
    fixture = fixtures.find((f) => f.slug === slug);
    if (!fixture) return null;
    fixtureId = parseInt(fixture.id);
    homeId = parseInt(fixture.homeTeam.id);
    awayId = parseInt(fixture.awayTeam.id);
  }

  // Get the season for this fixture's league
  const leagues = await getCoveredLeagues();
  const leagueObj = leagues.find((l) => l.name === fixture.competition);
  const season = leagueObj?.season;

  const [homeFormData, awayFormData, h2hData, predictionsData, injuriesData] = await Promise.all([
    apiFetch<any>(`/fixtures?team=${homeId}&status=ft&last=5&season=${season}`),
    apiFetch<any>(`/fixtures?team=${awayId}&status=ft&last=5&season=${season}`),
    apiFetch<any>(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=6`),
    apiFetch<any>(`/predictions?fixture=${fixtureId}`),
    apiFetch<any>(`/injuries?fixture=${fixtureId}`),
  ]);

  const homeForm: TeamForm = { teamName: fixture.homeTeam.name, results: [], recentMatches: [] };
  if (homeFormData?.response?.length) {
    for (const m of homeFormData.response.reverse()) {
      const isHome = m.teams?.home?.id === homeId;
      const hs = m.goals?.home ?? 0; const as = m.goals?.away ?? 0;
      const r: "W"|"D"|"L" = hs === as ? "D" : (isHome ? hs > as : as > hs) ? "W" : "L";
      homeForm.results.push(r);
      homeForm.recentMatches.push({
        opponent: isHome ? m.teams?.away?.name : m.teams?.home?.name || "",
        result: r,
        score: isHome ? `${hs}-${as}` : `${as}-${hs}`,
        competition: m.league?.name || "",
        extratime: m.score?.extratime ? { home: m.score.extratime.home, away: m.score.extratime.away } : undefined,
        penalty: m.score?.penalty ? { home: m.score.penalty.home, away: m.score.penalty.away } : undefined,
      });
    }
  }

  const awayForm: TeamForm = { teamName: fixture.awayTeam.name, results: [], recentMatches: [] };
  if (awayFormData?.response?.length) {
    for (const m of awayFormData.response.reverse()) {
      const isHome = m.teams?.home?.id === awayId;
      const hs = m.goals?.home ?? 0; const as = m.goals?.away ?? 0;
      const r: "W"|"D"|"L" = hs === as ? "D" : (isHome ? hs > as : as > hs) ? "W" : "L";
      awayForm.results.push(r);
      awayForm.recentMatches.push({
        opponent: isHome ? m.teams?.away?.name : m.teams?.home?.name || "",
        result: r,
        score: isHome ? `${hs}-${as}` : `${as}-${hs}`,
        competition: m.league?.name || "",
        extratime: m.score?.extratime ? { home: m.score.extratime.home, away: m.score.extratime.away } : undefined,
        penalty: m.score?.penalty ? { home: m.score.penalty.home, away: m.score.penalty.away } : undefined,
      });
    }
  }

  const headToHead: HeadToHeadMatch[] = (h2hData?.response || []).map((m: any) => ({
    date: m.fixture?.date?.split("T")[0] || "",
    homeTeam: m.teams?.home?.name || "", awayTeam: m.teams?.away?.name || "",
    homeScore: m.goals?.home ?? 0, awayScore: m.goals?.away ?? 0,
    competition: m.league?.name || "",
  }));

  let prediction: PredictionData;
  const p = predictionsData?.response?.[0]?.predictions;
  if (p?.percent) {
    const homePct = parseInt(p.percent.home) || 40;
    const drawPct = parseInt(p.percent.draw) || 25;
    const awayPct = parseInt(p.percent.away) || 35;
    const homeScore = Math.floor(Math.abs(Number(p.goals.home)));
    const awayScore = Math.floor(Math.abs(Number(p.goals.away)));

    prediction = {
      predictedScore: { home: homeScore, away: awayScore },
      confidence: Math.max(homePct, drawPct, awayPct),
      tip: p.advice || `${p.winner?.name || "Either side"} predicted to win.`,
      winProbability: { home: homePct, draw: drawPct, away: awayPct },
      btts: { yes: 50, no: 50 },
      overUnder: { over: 50, under: 50 },
    };
  } else {
    prediction = buildPrediction(homeForm, awayForm, fixture.homeTeam.name, fixture.awayTeam.name);
  }

  const { text: analysis, source: analysisSource } = await generateAnalysis(fixture.homeTeam.name, fixture.awayTeam.name, fixture.competition, homeForm, awayForm, headToHead);

  // Parse injuries from the API response
  const allInjuries = injuriesData?.response || [];
  const homeNews: PlayerNews[] = allInjuries
    .filter((i: any) => i.team?.id === homeId)
    .map((i: any) => ({
      name: i.player?.name || "",
      status: i.player?.type === "Questionable" ? "doubtful" as const : "injured" as const,
      reason: i.player?.reason || "",
    }));
  const awayNews: PlayerNews[] = allInjuries
    .filter((i: any) => i.team?.id === awayId)
    .map((i: any) => ({
      name: i.player?.name || "",
      status: i.player?.type === "Questionable" ? "doubtful" as const : "injured" as const,
      reason: i.player?.reason || "",
    }));

  return { fixture, homeForm, awayForm, headToHead, analysis, analysisSource, prediction, homeNews, awayNews };
}

export async function getHeadToHead(teamA: string, teamB: string): Promise<HeadToHeadMatch[]> {
  const teams = loadTeams();
  const normA = normalizeName(teamA); const normB = normalizeName(teamB);
  const tA = teams.find((t) => normalizeName(t.name).includes(normA) || normA.includes(normalizeName(t.name)));
  const tB = teams.find((t) => normalizeName(t.name).includes(normB) || normB.includes(normalizeName(t.name)));
  if (!tA || !tB) return [];
  const h2hData = loadH2H();
  return (h2hData[`${tA.id}-${tB.id}`] || h2hData[`${tB.id}-${tA.id}`] || []).map((m) => ({
    date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
    homeScore: m.homeScore, awayScore: m.awayScore, competition: m.competition,
  }));
}

export async function getTopScorers(leagueSlug: string, limit: number = 10): Promise<TopScorer[]> {
  const leagueId = SLUG_TO_LEAGUE_ID[leagueSlug];
  if (!leagueId || !hasApi()) return [];

  const leagues = await getCoveredLeagues();
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) return [];

  const season = league?.season;
  const data = await apiFetch<any>(`/players/topscorers?league=${leagueId}&season=${season}`);
  if (!data?.response?.length) return [];

  return data.response.slice(0, limit).map((s: any, i: number) => ({
    position: i + 1,
    player: { name: s.player?.name || "" },
    team: { id: String(s.statistics?.[0]?.team?.id || ""), name: s.statistics?.[0]?.team?.name || "", shortName: (s.statistics?.[0]?.team?.name || "").substring(0, 3).toUpperCase(), logo: s.statistics?.[0]?.team?.logo || "" },
    goals: s.statistics?.[0]?.goals?.total || 0,
    assists: s.statistics?.[0]?.goals?.assists || 0,
    penalties: s.statistics?.[0]?.penalty?.scored || 0,
    appearances: s.statistics?.[0]?.games?.appearences || 0,
  }));
}

export async function getTopAssists(leagueSlug: string, limit: number = 10): Promise<TopScorer[]> {
  const leagueId = SLUG_TO_LEAGUE_ID[leagueSlug];
  if (!leagueId || !hasApi()) return [];

  const leagues = await getCoveredLeagues();
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) return [];

  const season = league?.season;
  const data = await apiFetch<any>(`/players/topassists?league=${leagueId}&season=${season}`);
  if (!data?.response?.length) return [];

  return data.response.slice(0, limit).map((s: any, i: number) => ({
    position: i + 1,
    player: { name: s.player?.name || "" },
    team: { id: String(s.statistics?.[0]?.team?.id || ""), name: s.statistics?.[0]?.team?.name || "", shortName: (s.statistics?.[0]?.team?.name || "").substring(0, 3).toUpperCase(), logo: s.statistics?.[0]?.team?.logo || "" },
    goals: s.statistics?.[0]?.goals?.total || 0,
    assists: s.statistics?.[0]?.goals?.assists || 0,
    penalties: s.statistics?.[0]?.penalty?.scored || 0,
    appearances: s.statistics?.[0]?.games?.appearences || 0,
  }));
}

export async function getPastResults(leagueSlug: string, limit: number = 10): Promise<Fixture[]> {
  const leagueId = SLUG_TO_LEAGUE_ID[leagueSlug];
  if (!leagueId || !hasApi()) return [];

  const leagues = await getCoveredLeagues();
  const league = leagues.find((l) => l.id === leagueId);
  const season = league?.season;
  if (!season) return [];

  const today = new Date().toISOString().split("T")[0];
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const from = pastDate.toISOString().split("T")[0];

  const data = await apiFetch<{ response: any[] }>(
    `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${today}&status=ft`
  );
  if (!data?.response?.length) return [];

  return (data.response
    .map(apiFixtureToFixture)
    .filter(Boolean) as Fixture[])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

// ─── Next fixtures for a team ────────────────────────────────────

export async function getTeamUpcomingFixtures(
  teamId: number,
  count: number = 5
): Promise<Fixture[]> {
  if (!hasApi()) return [];

  const leagues = await getCoveredLeagues();
  const season = leagues[0]?.season;

  const data = await apiFetch<{ response: any[] }>(
    `/fixtures?team=${teamId}&season=${season}&status=ns&next=${count}`
  );
  if (!data?.response?.length) return [];

  return data.response
    .map(apiFixtureToFixture)
    .filter((f: Fixture | null): f is Fixture => f !== null);
}
