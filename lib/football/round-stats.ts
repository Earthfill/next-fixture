// ---------------------------------------------------------------------------
// round-stats — Goal statistics (top scorers / top assister) for a
// competition. Unlike /players/topscorers (which is season-cumulative), this
// reads each finished fixture's goal events (scorer + assist).
//
// Two modes:
//   • default  → a SINGLE matchday's finished fixtures ("Round N stats")
//   • cumulative → the full running total: every finished league-phase matchday
//     (up to 8 for UCL/UEL, 6 for UECL) PLUS every finished knockout-phase tie.
// ---------------------------------------------------------------------------
import { apiFetch, hasApi } from "@/lib/football/api";
import { teamLogo } from "@/lib/football/config";
import type { TopScorer } from "@/lib/types";

export interface RoundGoalEvent {
  fixtureId: string;
  teamId: number;
  teamName: string;
  scorerId: number;
  scorerName: string;
  assistId: number | null;
  assistName: string | null;
  minute: number | null;
  penalty: boolean;
  ownGoal: boolean;
}

export interface RoundStats {
  league: { id: number; name: string; season: number };
  round: number;
  fixturesFound: number;
  fixturesCounted: number;
  goals: number;
  scorers: TopScorer[];
  assisters: TopScorer[];
  /** True when at least one finished knockout-phase fixture was counted. */
  hasKnockouts: boolean;
}

// ─── Pure aggregation (no I/O) ───────────────────────────────────────────
// Given the goal events gathered across a round, tally per-player goals and
// assists. Own goals are not credited to a scorer (matching top-scorer
// conventions); goals from open play and penalties are both counted.
export function aggregateRoundStats(events: RoundGoalEvent[]): {
  goals: number;
  scorers: TopScorer[];
  assisters: TopScorer[];
} {
  const scorerMap = new Map<
    number,
    { playerName: string; teamId: number; teamName: string; goals: number; penalties: number }
  >();
  const assistMap = new Map<number, { playerName: string; teamId: number; teamName: string; assists: number }>();

  let goals = 0;
  for (const e of events) {
    // Own goals bump the match score but are credited to nobody.
    if (e.ownGoal) continue;
    if (e.scorerId) {
      goals += 1;
      const s = scorerMap.get(e.scorerId) ?? {
        playerName: e.scorerName,
        teamId: e.teamId,
        teamName: e.teamName,
        goals: 0,
        penalties: 0,
      };
      s.goals += 1;
      if (e.penalty) s.penalties += 1;
      scorerMap.set(e.scorerId, s);
    }

    if (e.assistId) {
      const a = assistMap.get(e.assistId) ?? {
        playerName: e.assistName || "Unknown",
        teamId: e.teamId,
        teamName: e.teamName,
        assists: 0,
      };
      a.assists += 1;
      assistMap.set(e.assistId, a);
    }
  }

  const scorers: TopScorer[] = [...scorerMap.values()]
    .map((s) => ({
      position: 0,
      player: { name: s.playerName },
      team: {
        id: String(s.teamId),
        name: s.teamName,
        shortName: s.teamName.substring(0, 3).toUpperCase(),
        logo: teamLogo(s.teamId),
      },
      goals: s.goals,
      assists: 0,
      penalties: s.penalties,
    }))
    .sort((a, b) => b.goals - a.goals || (b.penalties ?? 0) - (a.penalties ?? 0));

  const assisters: TopScorer[] = [...assistMap.values()]
    .map((a) => ({
      position: 0,
      player: { name: a.playerName },
      team: {
        id: String(a.teamId),
        name: a.teamName,
        shortName: a.teamName.substring(0, 3).toUpperCase(),
        logo: teamLogo(a.teamId),
      },
      goals: 0,
      assists: a.assists,
      penalties: 0,
    }))
    .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0));

  // Assign ranks (ties share the same position).
  scorers.forEach((s, i) => {
    s.position = i === 0 || scorers[i - 1].goals !== s.goals ? i + 1 : scorers[i - 1].position;
  });
  assisters.forEach((a, i) => {
    a.position = i === 0 || assisters[i - 1].assists !== a.assists ? i + 1 : assisters[i - 1].position;
  });

  return { goals, scorers, assisters };
}

// ---------------------------------------------------------------------------
// I/O helpers (api-sports shaped responses)
// ---------------------------------------------------------------------------

interface SeasonInfo { year: number; current?: boolean }

/** Resolve the current season year for a league id (mirrors covered-leagues). */
async function resolveSeason(leagueId: number): Promise<{ id: number; name: string; season: number } | null> {
  const data = await apiFetch<{ response: { league: { id: number; name: string }; seasons: SeasonInfo[] }[] }>(
    "/leagues?current=true"
  );
  const entry = data?.response?.find((l) => l.league.id === leagueId);
  if (!entry) return null;
  const season = entry.seasons.find((s) => s.current === true)?.year || entry.seasons[0]?.year || 0;
  return { id: entry.league.id, name: entry.league.name, season };
}

/** Matches a league-stage matchday (e.g. "League Stage - 1") for the target round number. */
function isLeagueStageRound(label: string, round: number): boolean {
  const re = /^league\s*stage\s*-\s*(\d+)/i;
  const m = label.trim().match(re);
  return m ? parseInt(m[1], 10) === round : false;
}

// Knockout-phase round labels (Round of 16, Quarter-finals, Semi-finals, Final,
// Round of 32 / knock-out play-offs). Qualifying rounds are matched separately
// and always excluded from the cumulative leaderboard.
const KNOCKOUT_ROUND_RE = /round|quarter|semi|final|play-?off|knockout/i;
const QUALIFYING_RE = /qualif/i;

/**
 * Whether a fixture's goals should count toward the cumulative leaderboard:
 * any league-phase matchday up to `latest`, or any knockout-phase tie.
 * Qualifying-round matches (label contains "qualif") are never counted, so
 * early-round goals from clubs that never reach the league phase don't leak in.
 */
function isScoreableRound(label: string, roundNum: number, latest: number): boolean {
  if (QUALIFYING_RE.test(label)) return false;
  if (isLeagueStageRound(label, roundNum)) return roundNum <= latest;
  return KNOCKOUT_ROUND_RE.test(label);
}

interface FixtureBrief { id: string; status: string; roundLabel: string; round: number }

/** Fetch one season's fixtures for a league and collapse them to a lightweight summary. */
async function fetchAllFixtures(leagueId: number, season: number): Promise<FixtureBrief[]> {
  const data = await apiFetch<{ response: any[] }>(`/fixtures?league=${leagueId}&season=${season}`);
  if (!data?.response?.length) return [];
  return data.response.map((f) => ({
    id: String(f.fixture?.id),
    status: f.fixture?.status?.short as string,
    roundLabel: String(f.league?.round || ""),
    round: parseInt(String(f.league?.round || "").replace(/[^0-9]/g, ""), 10) || 0,
  }));
}

const FINISHED = ["FT", "AET", "PEN"];

/** Highest league-stage matchday that has at least one finished fixture, or null. */
function latestFinishedLeagueStage(fixtures: FixtureBrief[]): number | null {
  let latest: number | null = null;
  for (const f of fixtures) {
    if (!isLeagueStageRound(f.roundLabel, f.round)) continue;
    if (!FINISHED.includes(f.status)) continue;
    if (latest === null || f.round > latest) latest = f.round;
  }
  return latest;
}

/** Goal events for one finished fixture. */
async function fetchFixtureGoalEvents(fixtureId: string): Promise<RoundGoalEvent[]> {
  const data = await apiFetch<{
    response: {
      time?: { elapsed?: number | null };
      team?: { id?: number; name?: string };
      player?: { id?: number; name?: string } | null;
      assist?: { id?: number; name?: string } | null;
      type?: string;
      detail?: string;
    }[];
  }>(`/fixtures/events?fixture=${fixtureId}`);
  if (!data?.response?.length) return [];

  return data.response
    .filter((e) => e.type === "Goal")
    .map((e): RoundGoalEvent | null => {
      if (!e.player?.id || !e.team?.name) return null;
      const detail = (e.detail || "").toLowerCase();
      return {
        fixtureId,
        teamId: e.team.id ?? 0,
        teamName: e.team.name,
        scorerId: e.player.id,
        scorerName: e.player.name || "",
        assistId: e.assist?.id ?? null,
        assistName: e.assist?.name || null,
        minute: e.time?.elapsed ?? null,
        penalty: detail.includes("penalty"),
        ownGoal: detail.includes("own goal"),
      };
    })
    .filter((e): e is RoundGoalEvent => e !== null);
}
// ---------------------------------------------------------------------------
// Public compute function
// ---------------------------------------------------------------------------
/**
 * Compute top scorers and top assist providers for a league.
 * It does NOT read the /players endpoints — it reads each finished fixture's
 * goal events (scorer + assist).
 *
 * Default: numbers are scoped to a SINGLE matchday (not cumulative).
 * With `options.cumulative: true`, numbers are the full-season running total —
 * every finished league-phase matchday up to the latest one (up to 8 for
 * UCL/UEL, 6 for UECL) PLUS every finished knockout-phase tie. Qualifying
 * rounds are excluded.
 *
 * When `round` is omitted it resolves to the LATEST finished league-stage
 * matchday automatically, so callers always show the current round.
 */
export async function computeRoundGoalStats(
  leagueId: number,
  round?: number,
  options?: { cumulative?: boolean }
): Promise<RoundStats> {
  const empty = (r: number): RoundStats => ({
    league: { id: leagueId, name: "", season: 0 },
    round: r,
    fixturesFound: 0,
    fixturesCounted: 0,
    goals: 0,
    scorers: [],
    assisters: [],
    hasKnockouts: false,
  });
  if (!hasApi()) return empty(round ?? 0);

  const resolved = await resolveSeason(leagueId);
  if (!resolved) return empty(round ?? 0);

  const all = await fetchAllFixtures(resolved.id, resolved.season);
  const targetRound = round ?? latestFinishedLeagueStage(all);
  if (targetRound === null) {
    return { ...empty(0), league: resolved, fixturesFound: all.length };
  }

  const cumulative = options?.cumulative === true;

  // Which fixtures are eligible for the leaderboard?
  //   • default    → just the target (latest) matchday.
  //   • cumulative → EVERY scoreable fixture (finished league-phase matchdays
  //                  up to the latest one, plus everything in the knockout phase).
  // `fixturesFound` counts every eligible tie (incl. future/unfinished ones);
  // `fixturesCounted` is the finished subset actually aggregated.
  const eligible = cumulative
    ? all.filter((f) => isScoreableRound(f.roundLabel, f.round, targetRound))
    : all.filter((f) => isLeagueStageRound(f.roundLabel, targetRound));
  const finished = eligible.filter((f) => FINISHED.includes(f.status));

  const stats: RoundStats = {
    league: resolved,
    round: targetRound,
    fixturesFound: eligible.length,
    fixturesCounted: finished.length,
    hasKnockouts: finished.some((f) => KNOCKOUT_ROUND_RE.test(f.roundLabel)),
    goals: 0,
    scorers: [],
    assisters: [],
  };

  const events: RoundGoalEvent[] = [];
  for (const f of finished) {
    const evs = await fetchFixtureGoalEvents(f.id);
    events.push(...evs);
  }

  const agg = aggregateRoundStats(events);
  stats.goals = agg.goals;
  stats.scorers = agg.scorers;
  stats.assisters = agg.assisters;
  return stats;
}
