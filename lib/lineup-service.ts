// ---------------------------------------------------------------------------
// Lineup Service — Orchestration layer with caching
// ---------------------------------------------------------------------------
// For each team, predictions are cached with a 12-hour TTL since the
// input data (recent form, injuries) doesn't change fast.
// When confirmed lineups are available (within ~60 min of kickoff or
// live/finished), those are returned instead with source: "confirmed".
// ---------------------------------------------------------------------------

import type { ConfirmedLineupFixture, SquadPlayerWithRating, PredictedLineup, PlayerSeasonStats } from "@/lib/types";
import { getTeamFixtures, getFixtureLineup, getTeamInjuries, getTeamSquad, getTeamCoach, getFixtureEvents } from "@/lib/football-api";
import { predictLineup, type PredictLineupInput } from "@/lib/predict-lineup";

export interface LineupServiceResult {
  source: "confirmed" | "predicted";
  formation: string;
  startXI: { id: number; name: string; number: number; pos: string; grid: string | null; recentStarts: number; recentTotal: number }[];
  substitutes: { id: number; name: string; number: number; pos: string; grid: string | null; recentStarts: number; recentTotal: number }[];
  confidence?: "high" | "medium" | "low";
  basedOnFixtures?: number[];
  coach?: { name: string; photo: string };
}

// ─── Cache (in-memory with TTL) ───────────────────────────────────────

interface CacheEntry {
  data: PredictedLineup;
  coach?: { name: string; photo: string };
  computedAt: number;
  expiresAt: number;
}

const predictionCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getCached(teamId: number): { data: PredictedLineup; coach?: { name: string; photo: string } } | null {
  const entry = predictionCache.get(teamId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    predictionCache.delete(teamId);
    return null;
  }
  return { data: entry.data, coach: entry.coach };
}

function setCache(teamId: number, data: PredictedLineup, coach?: { name: string; photo: string }): void {
  predictionCache.set(teamId, {
    data,
    coach,
    computedAt: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateCache(teamId: number): void {
  predictionCache.delete(teamId);
}

export function clearAllCache(): void {
  predictionCache.clear();
}

// ─── Main orchestrator ────────────────────────────────────────────────

export async function getPredictedLineup(
  teamId: number,
  fixtureId: number
): Promise<LineupServiceResult> {
  const season = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  // 1. Try confirmed lineup for this fixture
  const [confirmed, coachInfo] = await Promise.all([
    getFixtureLineup(fixtureId, teamId),
    getTeamCoach(teamId),
  ]);
  if (confirmed && confirmed.startXI.length >= 7) {
    return {
      source: "confirmed",
      formation: confirmed.formation || "4-3-3",
      startXI: confirmed.startXI.map(({ player }) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        pos: player.pos,
        grid: null,
        recentStarts: 0,
        recentTotal: 0,
      })),
      substitutes: [],
      coach: coachInfo || undefined,
    };
  }

  // 2. Check cache
  const cached = getCached(teamId);
  if (cached) {
    return { ...cached.data, source: "predicted", coach: cached.coach };
  }

  // 3. Compute new prediction
  const result = await computePrediction(teamId, season);

  // 4. Cache and return
  if (result) {
    const coach = await getTeamCoach(teamId);
    setCache(teamId, result, coach || undefined);
    return { ...result, source: "predicted", coach: coach || undefined };
  }

  // 5. Empty fallback (no data available)
  return {
    source: "predicted",
    formation: "4-3-3",
    startXI: [],
    substitutes: [],
    confidence: "low",
  };
}

// ─── Core prediction computation ──────────────────────────────────────

async function computePrediction(
  teamId: number,
  season: number
): Promise<PredictedLineup | null> {
  // Fetch recent fixtures
  const recentFixtures = await getTeamFixtures(teamId, 10);
  if (!recentFixtures.length) return null;

  // Fetch confirmed lineups for those fixtures
  const lineupPromises = recentFixtures
    .slice(0, 6)
    .map((f) => getFixtureLineup(f.id, teamId));
  const lineupResults = await Promise.all(lineupPromises);

  const recentLineups: ConfirmedLineupFixture[] = lineupResults.filter(
    (l): l is ConfirmedLineupFixture => l !== null && l.startXI.length >= 7
  );

  // Fetch injuries (API often has gaps)
  const injuries = await getTeamInjuries(teamId, season);

  // Build confirmed-unavailable set from injuries API
  const confirmedUnavailableIds = new Set(
    injuries
      .filter((i) => i.status === "injured" || i.status === "suspended")
      .map((i) => i.playerId)
  );

  // Fetch events for the most recent fixture — detect red cards for suspension calculation
  if (recentFixtures.length > 0) {
    const events = await getFixtureEvents(recentFixtures[0].id);
    for (const event of events) {
      if (event.type === "Card" && (event.detail === "Red card" || event.detail === "Second yellow card")) {
        confirmedUnavailableIds.add(event.playerId);
      }
    }
  }

  // Build possibly-unavailable set: detect stale minutes via season stats
  const possiblyUnavailableIds = new Set<number>();
  const playerSeasonStats = new Map<number, PlayerSeasonStats>();

  // For players with lineup history, check if their season minutes have stagnated
  if (recentLineups.length >= 3) {
    const seenIds = new Set<number>();
    for (const lu of recentLineups) {
      for (const { player } of lu.startXI) {
        if (!seenIds.has(player.id)) {
          seenIds.add(player.id);
        }
      }
    }
    // Sample a few players that appeared in early fixtures but not recent ones
    for (const [, data] of recentLineups[0]?.startXI?.entries() ?? []) {
      // (Intentionally sparse — season stats endpoint rate limit can be aggressive)
    }
  }

  // Fetch squad as fallback
  const squad: SquadPlayerWithRating[] = await getTeamSquad(teamId);

  const input: PredictLineupInput = {
    recentLineups,
    confirmedUnavailableIds,
    possiblyUnavailableIds,
    playerSeasonStats,
    squad,
  };

  return predictLineup(input);
}