// ---------------------------------------------------------------------------
// Highlightly client (sports.highlightly.net) — a football-data-style REST API
// ---------------------------------------------------------------------------
// Translates the api-sports-style paths the app already uses into highlightly
// `/football/*` calls, then normalizes highlightly's `{ data }` / `{ groups }`
// envelopes back into the api-sports `{ response }` shape the rest of the app
// consumes — so service.ts / football-api.ts run unchanged on this provider.
//
// Coverage on the Basic tier (live-verified):
//   /leagues  →  /football/leagues
//   /fixtures →  /football/matches?leagueId=   (no from/to support → client-side
//                date filtering)
//   /standings→  /football/standings?leagueId=&season=
// Everything the app needs but highlightly doesn't offer / that needs an id
// cross-map (predictions, top scorers, injuries, paywalled odds, team-scoped
// fixtures, squads, lineups, bookmakers) returns null → the existing null→
// fallback path engages (and the UI hides empty sections).
// ---------------------------------------------------------------------------

interface AuthCfg {
  base: string;
  authHeaders: Record<string, string>;
}

const FETCH_TIMEOUT_MS = 10_000;

async function rawGet<T>(reqPath: string, cfg: AuthCfg): Promise<T | null> {
  try {
    const res = await fetch(`${cfg.base}${reqPath}`, {
      headers: cfg.authHeaders as HeadersInit,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[highlightly] HTTP", res.status, "for", reqPath);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[highlightly] fetch failed:", (err as Error).message);
    return null;
  }
}

// ─── Entry point ------------------------------------------------------------

export async function hlFetch(
  path: string,
  cfg: AuthCfg
): Promise<{ response: unknown[] } | null> {
  const qIndex = path.indexOf("?");
  const rawPath = qIndex === -1 ? path : path.slice(0, qIndex);
  const params = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));

  try {
    if (rawPath === "/leagues") return await hlLeagues(cfg);

    if (rawPath === "/fixtures") {
      // Team-scoped fixtures need an id cross-map highlightly doesn't provide
      // affordably; let them fall back (they feed form + predicted lineups).
      if (params.get("team")) return null;
      return await hlMatches(params, cfg);
    }

    if (rawPath === "/standings") return await hlStandings(params, cfg);

    // Everything else is unsupported on highlightly's available endpoints /
    // plan → hand back null so the existing fallback (seed/template/hide) runs.
    return null;
  } catch (err) {
    console.warn("[highlightly] translate failed:", (err as Error).message);
    return null;
  }
}

// ─── /leagues ----------------------------------------------------------------

interface HlLeague {
  id: number;
  name: string;
  logo: string | null;
  seasons?: { season: number }[];
}

async function hlLeagues(cfg: AuthCfg): Promise<{ response: any[] }> {
  const data = await rawGet<{ data: HlLeague[] }>("/football/leagues", cfg);
  if (!data?.data) return { response: [] };

  const response = data.data.map((l) => ({
    league: { id: l.id, name: l.name, logo: l.logo || "" },
    // highlightly lists seasons newest-first; mark the first as current
    seasons: (l.seasons || []).map((s, i) => ({
      year: s.season,
      current: i === 0,
      coverage: {
        fixtures: { events: true },
        standings: true,
        top_scorers: false,
        top_assists: false,
        predictions: false,
      },
    })),
  }));

  return { response };
}
// ─── /fixtures ───────────────────────────────────────────────────────────────

async function hlMatches(
  params: URLSearchParams,
  cfg: AuthCfg
): Promise<{ response: any[] } | null> {
  const leagueId = params.get("league");
  if (!leagueId) return null;

  // highlightly has no from/to — fetch the league's matches (one call) and
  // filter the date range + status here.
  const q = new URLSearchParams();
  q.set("leagueId", leagueId);
  const data = await rawGet<{ data: HlMatch[] }>(
    `/football/matches?${q.toString()}`,
    cfg
  );
  if (!data?.data) return { response: [] };

  const from = params.get("from");
  const to = params.get("to");
  const status = params.get("status") || "";

  const matches = (data.data || [])
    .filter((m) => {
      if (from || to) {
        const d = (m.date || "").slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      const short = hlStateShort(m);
      if (status === "ft") return short === "FT" || short === "AET" || short === "PEN";
      if (status === "ns") return short === "NS";
      return true;
    })
    .map(hlMatchToApi);

  return { response: matches };
}

// ─── /standings ──────────────────────────────────────────────────────────────

async function hlStandings(
  params: URLSearchParams,
  cfg: AuthCfg
): Promise<{ response: any[] } | null> {
  const leagueId = params.get("league");
  const season = params.get("season");
  if (!leagueId || !season) return null;

  const data = await rawGet<{ groups: HlStandingGroup[] }>(
    `/football/standings?leagueId=${leagueId}&season=${season}`,
    cfg
  );
  if (!data?.groups) return { response: [] };

  const standings = data.groups.map((g) =>
    (g.standings || []).map((row) => hlStandingToApi(row, g.name))
  );

  return {
    response: [
      {
        league: { id: Number(leagueId), name: "", standings },
      },
    ],
  };
}

// ─── highlightly → api-sports mappers ────────────────────────────────────────

interface HlMatch {
  id: number;
  date: string;
  round?: string;
  homeTeam?: { id: number; name: string; logo?: string };
  awayTeam?: { id: number; name: string; logo?: string };
  league?: { id: number; name: string; logo?: string; season?: number };
  state?: {
    description?: string;
    score?: { current?: string; penalties?: string };
  };
}

interface HlStandingGroup {
  name: string;
  standings: HlStandingRow[];
}

interface HlStandingRow {
  position: number;
  points: number;
  team: { id: number; name: string; logo?: string };
  total?: { wins: number; draws: number; games: number; loses: number; scoredGoals: number; receivedGoals: number };
}

function hlStateShort(m: HlMatch): string {
  const desc = (m.state?.description || "").toLowerCase();
  const score = m.state?.score;
  if (score?.penalties) return "PEN";
  if (/aet|extra time/.test(desc)) return "AET";
  if (/not started|notstarted/.test(desc)) return "NS";
  if (score?.current) return "FT";
  return "NS";
}

function parseScorePair(userStr?: string): [number, number] {
  const [a, b] = String(userStr || "")
    .split(/[-:]/)
    .map((n) => parseInt(n.trim(), 10));
  return [Number.isNaN(a) ? 0 : a, Number.isNaN(b) ? 0 : b];
}

function hlMatchToApi(m: HlMatch): any {
  const short = hlStateShort(m);
  const finished = short === "FT" || short === "AET" || short === "PEN";
  const goalsRaw = finished ? parseScorePair(m.state?.score?.current) : [null, null];

  return {
    fixture: {
      id: m.id,
      date: m.date,
      status: { short },
      venue: { name: "", city: "" },
    },
    teams: {
      home: { id: m.homeTeam?.id, name: m.homeTeam?.name, logo: m.homeTeam?.logo || "" },
      away: { id: m.awayTeam?.id, name: m.awayTeam?.name, logo: m.awayTeam?.logo || "" },
    },
    league: {
      id: m.league?.id,
      name: m.league?.name,
      logo: m.league?.logo || "",
      round: m.round,
      season: m.league?.season,
    },
    goals: { home: goalsRaw[0], away: goalsRaw[1] },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: goalsRaw[0], away: goalsRaw[1] },
      extratime: null,
      penalty: null,
    },
  };
}

function hlStandingToApi(r: HlStandingRow, groupName: string): any {
  const total = r.total || {
    games: 0, wins: 0, draws: 0, loses: 0, scoredGoals: 0, receivedGoals: 0,
  };
  return {
    rank: r.position,
    // exposed so getLeagueStandings' ROUND_RE stage filter works with the group
    group: groupName,
    team: { id: r.team?.id, name: r.team?.name, logo: r.team?.logo || "" },
    all: {
      played: total.games || 0,
      win: total.wins || 0,
      draw: total.draws || 0,
      lose: total.loses || 0,
      goals: { for: total.scoredGoals || 0, against: total.receivedGoals || 0 },
    },
    points: r.points || 0,
    form: "",
  };
}
