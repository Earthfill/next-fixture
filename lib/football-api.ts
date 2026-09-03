// ---------------------------------------------------------------------------
// Football API — Typed data-fetching wrappers for API-Football
// Handles fixtures, lineups, injuries, and squad data
// ---------------------------------------------------------------------------
// All functions use the existing apiFetch() which has retry/backoff built in.
// ---------------------------------------------------------------------------

import { apiFetch } from "@/lib/football/api";
import type { ConfirmedLineupFixture, SquadPlayerWithRating, PlayerSeasonStats, FixtureEvent } from "@/lib/types";

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

interface ApiLineupResponse {
  team: { id: number; name: string; logo: string };
  formation: string;
  startXI: { player: { id: number; name: string; number: number; pos: string; grid: string | null } }[];
  substitutes: { player: { id: number; name: string; number: number; pos: string; grid: string | null } }[];
}

interface ApiInjuryResponse {
  player: { id: number; name: string };
  team: { id: number };
  fixture: { id: number };
  status: string;
  type?: string | null;
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
 * Get confirmed lineups for a past fixture (both teams).
 * Returns array of lineup entries (one per team).
 */
export async function getFixtureLineup(
  fixtureId: number,
  teamId: number
): Promise<ConfirmedLineupFixture | null> {
  const data = await apiFetch<{ response: ApiLineupResponse[] }>(
    `/fixtures/lineups?fixture=${fixtureId}`
  );
  if (!data?.response?.length) return null;

  const entry = data.response.find((l) => l.team.id === teamId);
  if (!entry || !entry.startXI?.length) return null;

  return {
    fixtureId,
    formation: entry.formation,
    startXI: entry.startXI.map((s) => ({
      player: {
        id: s.player.id,
        name: s.player.name,
        number: s.player.number,
        pos: s.player.pos,
      },
    })),
  };
}

/**
 * Fetch current injury/suspension list for a team.
 */
export async function getTeamInjuries(
  teamId: number,
  season?: number
): Promise<{ playerId: number; playerName: string; status: string; type?: string | null }[]> {
  const s = season ?? currentSeason();
  const data = await apiFetch<{ response: ApiInjuryResponse[] }>(
    `/injuries?team=${teamId}&season=${s}`
  );
  if (!data?.response?.length) return [];

  return data.response.map((i) => ({
    playerId: i.player.id,
    playerName: i.player.name,
    status: i.status,
    type: i.type,
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
 * Fetch current coach/manager for a team.
 * Uses /coachs endpoint, returns response[0].name per spec.
 */
export async function getTeamCoach(
  teamId: number
): Promise<{ name: string; photo: string } | null> {
  const data = await apiFetch<{ response: { id: number; name: string; photo: string }[] }>(
    `/coachs?team=${teamId}`
  );
  if (!data?.response?.[0]) return null;
  const coach = data.response[0];
  return { name: coach.name, photo: coach.photo || "" };
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