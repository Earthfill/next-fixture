// ---------------------------------------------------------------------------
// Football API — Typed data-fetching wrappers for API-Football
// Handles fixtures, lineups, injuries, and squad data
// ---------------------------------------------------------------------------
// All functions use the existing apiFetch() which has retry/backoff built in.
// ---------------------------------------------------------------------------

import { apiFetch } from "@/lib/football/api";
import type { SquadPlayerWithRating, PlayerSeasonStats, FixtureEvent, ConfirmedLineupFixture } from "@/lib/types";

// ─── Raw API response shapes (internal) ────────────────────────────────

interface ApiFixtureResponse {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { id: number }; away: { id: number } };
  league: { id: number; season: number };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

interface ApiInjuryResponse {
  player: { id: number; name: string; type?: string | null; reason?: string | null };
  team: { id: number };
  fixture: { id: number; date: string };
}

interface ApiSquadResponse {
  team: { id: number; name: string; logo: string };
  players: {
    id: number;
    name: string;
    number: number;
    position: string;
    rating?: string;
  }[];
}

interface ApiLineupResponse {
  team: { id: number; name: string; logo: string };
  formation: string;
  startXI: {
    player: { id: number; name: string; number: number; pos: string | null; grid?: string | null };
  }[];
  substitutes: {
    player: { id: number; name: string; number: number; pos: string | null };
  }[];
}

// ─── Season helpers ────────────────────────────────────────────────────

function currentSeason(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // Season starts August
}

// ─── Exported fetching functions ───────────────────────────────────────

/**
 * Fetch the last N completed fixtures for a team.
 * Returns minimal fixture data with scores.
 */
export async function getTeamFixtures(
  teamId: number,
  count: number = 10
): Promise<{ id: number; date: string; homeScore: number | null; awayScore: number | null; opponentId: number }[]> {
  const season = currentSeason();
  const data = await apiFetch<{ response: ApiFixtureResponse[] }>(
    `/fixtures?team=${teamId}&season=${season}&status=ft&last=${count}`
  );
  if (!data?.response?.length) return [];

  return data.response.map((f) => ({
    id: f.fixture.id,
    date: f.fixture.date,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    opponentId: f.teams.home.id === teamId ? f.teams.away.id : f.teams.home.id,
  }));
}

/**
 * Fetch current injury/suspension list for a team.
 */
export async function getTeamInjuries(
  teamId: number,
  season?: number
): Promise<{ playerId: number; playerName: string; status: string; type?: string | null; reason?: string | null; fixtureDate: string }[]> {
  const s = season ?? currentSeason();
  const data = await apiFetch<{ response: ApiInjuryResponse[] }>(
    `/injuries?team=${teamId}&season=${s}`
  );
  if (!data?.response?.length) return [];

  return data.response.map((i) => ({
    playerId: i.player.id,
    playerName: i.player.name,
    status: mapInjuryStatus(i.player.type, i.player.reason),
    type: i.player.type,
    reason: i.player.reason,
    fixtureDate: i.fixture.date,
  }));
}

/**
 * Fetch fixture events — used to detect red cards for suspension calculation.
 */
export async function getFixtureEvents(
  fixtureId: number
): Promise<{ playerId: number; playerName: string; type: string; detail: string }[]> {
  const data = await apiFetch<{ response: { type: string; detail: string; player: { id: number; name: string } }[] }>(
    `/fixtures/events?fixture=${fixtureId}`
  );
  if (!data?.response?.length) return [];

  return data.response
    .filter((e) => e.player?.id) // only events with a player
    .map((e) => ({
      playerId: e.player.id,
      playerName: e.player.name,
      type: e.type,
      detail: e.detail,
    }));
}

/**
 * Fetch cumulative season stats for a specific player.
 * Returns appearances and minutes — used as a staleness check.
 */
export async function getPlayerStats(
  playerId: number,
  season?: number
): Promise<PlayerSeasonStats | null> {
  const s = season ?? currentSeason();
  const data = await apiFetch<{ response: { player: { id: number }; statistics: { games: { appearences: number | null; minutes: number | null }; team: { id: number } }[] }[] }>(
    `/players?id=${playerId}&season=${s}`
  );
  if (!data?.response?.[0]?.statistics?.[0]) return null;
  const p = data.response[0];
  const stats = p.statistics[0];
  return {
    playerId: p.player.id,
    appearances: stats.games.appearences ?? 0,
    minutes: stats.games.minutes ?? 0,
    teamId: stats.team.id,
  };
}
/**
 * Get full squad with positions and ratings.
 * Used as fallback for players with no recent lineup history.
 */
export async function getTeamSquad(
  teamId: number
): Promise<SquadPlayerWithRating[]> {
  const data = await apiFetch<{ response: ApiSquadResponse[] }>(
    `/players/squads?team=${teamId}`
  );
  if (!data?.response?.[0]?.players?.length) return [];

  return data.response[0].players.map((p) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    pos: mapPosition(p.position),
    rating: p.rating ? parseFloat(p.rating) : undefined,
  }));
}

/**
 * Fetch the confirmed starting XI for one team from a completed fixture.
 * Returns the team's lineup mapped to ConfirmedLineupFixture (feed for the
 * lineup prediction algorithm), or null if no lineup is available yet.
 */
export async function getFixtureLineup(
  fixtureId: number,
  teamId: number,
  squadPosById?: Map<number, string>
): Promise<ConfirmedLineupFixture | null> {
  const data = await apiFetch<{ response: ApiLineupResponse[] }>(
    `/fixtures/lineups?fixture=${fixtureId}`
  );
  if (!data?.response?.length) return null;

  const lineup = data.response.find((l) => l.team?.id === teamId) ?? data.response[0];
  if (!lineup?.startXI?.length) return null;

  return {
    fixtureId,
    formation: lineup.formation || "4-3-3",
    startXI: lineup.startXI.map(({ player }) => ({
      player: {
        id: player.id,
        name: player.name,
        number: player.number,
        pos: resolveLineupPos(player.pos, squadPosById?.get(player.id)),
        grid: player.grid || null,
      },
    })),
  };
}

/**
 * Fetch a team's last N completed fixtures and their confirmed starting XIs.
 * This is the "who actually played" step: coaches rarely change more than
 * 2-3 players week-to-week, so recent lineups are the strongest signal.
 */
export async function getTeamRecentLineups(
  teamId: number,
  count: number = 3
): Promise<ConfirmedLineupFixture[]> {
  const fixtures = await getTeamFixtures(teamId, count);
  if (!fixtures.length) return [];

  // Cross-reference squad positions by player id. Some fixture lineups return
  // `pos: null` for every player (a known API-Football data gap), so the squad
  // endpoint is the authoritative fallback for the player's real position.
  const squad = await getTeamSquad(teamId);
  const squadPosById = new Map<number, string>();
  for (const p of squad) squadPosById.set(p.id, p.pos);

  const lineups: (ConfirmedLineupFixture | null)[] = await Promise.all(
    fixtures.map(async (f) => {
      const lu = await getFixtureLineup(f.id, teamId, squadPosById);
      return lu ? { ...lu, date: f.date } : null;
    })
  );

  return lineups.filter((l): l is ConfirmedLineupFixture => l !== null);
}

// ─── Position mapping ──────────────────────────────────────────────────

function mapPosition(apiPos: string): string {
  const map: Record<string, string> = {
    Goalkeeper: "G",
    Defender: "D",
    "Midfielder": "M",
    Attacker: "F",
  };
  return map[apiPos] || "M"; // default to midfielder if unknown
}

// Lineup endpoints use a different, shorter position vocabulary than squads.
// Returns null for unknown/missing positions (never silently misclassifies).
function normalizeLineupPos(pos: string | null | undefined): string | null {
  if (!pos) return null;
  const p = pos.toUpperCase();
  if (p === "G" || p === "GK") return "G";
  if (p === "D" || p === "DEF" || p === "DF") return "D";
  if (p === "M" || p === "MID" || p === "MF") return "M";
  if (p === "F" || p === "FWD" || p === "A" || p === "AT") return "F";
  return null;
}

// Resolve a lineup player's position: use the lineup's own value first, then
// the squad's authoritative position when the lineup returns pos: null.
function resolveLineupPos(pos: string | null | undefined, squadPos?: string): string {
  return normalizeLineupPos(pos) ?? normalizeLineupPos(squadPos) ?? "M";
}

// The injuries endpoint encodes availability in `player.type` ("Missing Fixture",
// "Questionable", "Suspended") and `player.reason` (e.g. "Foot Injury").
function mapInjuryStatus(type: string | null | undefined, reason?: string | null): string {
  const t = (type || "").toLowerCase();
  const r = (reason || "").toLowerCase();
  if (t.includes("suspend") || r.includes("suspend")) return "suspended";
  if (t.includes("questionable") || t.includes("doubtful")) return "doubtful";
  return "injured"; // "Missing Fixture", "Injured", etc.
}