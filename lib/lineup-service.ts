// ---------------------------------------------------------------------------
// Lineup Service - predicted lineup orchestration (no confirmed lineups/coaches)
// ---------------------------------------------------------------------------
// Predictions are cached per-team in-memory for 24h. The caller (getFixtureLineups)
// additionally caches the combined result in Redis under lineups:<fixtureId>.

import type { SquadPlayerWithRating, PredictedLineup, PlayerSeasonStats } from "@/lib/types";
import { getTeamInjuries, getTeamSquad, getTeamRecentLineups } from "@/lib/football-api";
import { predictLineup, type PredictLineupInput } from "@/lib/predict-lineup";

export interface LineupServiceResult {
  source: "predicted";
  formation: string;
  startXI: { id: number; name: string; number: number; pos: string; grid: string | null; recentStarts: number; recentTotal: number }[];
  substitutes: { id: number; name: string; number: number; pos: string; grid: string | null; recentStarts: number; recentTotal: number }[];
  confidence?: "high" | "medium" | "low";
  basedOnFixtures?: number[];
}

// ---------- In-memory cache (24h TTL) --------------------------------------

interface CacheEntry {
  data: PredictedLineup;
  computedAt: number;
  expiresAt: number;
}

const predictionCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached(teamId: number): PredictedLineup | null {
  const entry = predictionCache.get(teamId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    predictionCache.delete(teamId);
    return null;
  }
  return entry.data;
}

function setCache(teamId: number, data: PredictedLineup): void {
  predictionCache.set(teamId, {
    data,
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

// ---------- Main orchestrator ---------------------------------------------

export async function getPredictedLineup(
  teamId: number,
  _fixtureId: number
): Promise<LineupServiceResult> {
  const season = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const cached = getCached(teamId);
  if (cached) {
    return { ...cached, source: "predicted" };
  }

  const result = await computePrediction(teamId, season);

  if (result) {
    setCache(teamId, result);
    return { ...result, source: "predicted" };
  }

  return {
    source: "predicted",
    formation: "4-3-3",
    startXI: [],
    substitutes: [],
    confidence: "low",
  };
}

// ---------- Core prediction --------------------------------------------
// 1. Query the team's last 3 completed fixtures to see who actually started.
// 2. Score starters by frequency (recency-weighted) and pick the top 11.
// 3. Cross-reference the current injury/suspension list and drop them out.
// 4. Fill any vacant positions from the full squad (highest-rated backup).

async function computePrediction(
  teamId: number,
  season: number
): Promise<PredictedLineup | null> {
  const [injuries, squad, recentLineups] = await Promise.all([
    getTeamInjuries(teamId, season),
    getTeamSquad(teamId),
    getTeamRecentLineups(teamId, 3),
  ]);

  // Latest date each player actually started (from recent lineups).
  const latestStartDateById = new Map<number, string>();
  for (const lu of recentLineups) {
    for (const { player } of lu.startXI) {
      const prev = latestStartDateById.get(player.id);
      if (!prev || (lu.date && lu.date > prev)) latestStartDateById.set(player.id, lu.date || "");
    }
  }

  // Dedupe injuries: keep only the most recent record per player.
  const latestInjuryById = new Map<number, { status: string; fixtureDate: string }>();
  for (const i of injuries) {
    const prev = latestInjuryById.get(i.playerId);
    if (!prev || i.fixtureDate > prev.fixtureDate) {
      latestInjuryById.set(i.playerId, { status: i.status, fixtureDate: i.fixtureDate });
    }
  }

  const confirmedUnavailableIds = new Set<number>();
  const possiblyUnavailableIds = new Set<number>();
  for (const [playerId, inj] of latestInjuryById) {
    const startedAt = latestStartDateById.get(playerId);
    // A player who started at/after their injury record has already recovered.
    if (startedAt !== undefined && startedAt >= inj.fixtureDate) continue;
    if (inj.status === "injured" || inj.status === "suspended") confirmedUnavailableIds.add(playerId);
    else if (inj.status === "doubtful") possiblyUnavailableIds.add(playerId);
  }

  const squadPlayers: SquadPlayerWithRating[] = squad;
  if (!squadPlayers.length) return null;

  const input: PredictLineupInput = {
    recentLineups,
    confirmedUnavailableIds,
    possiblyUnavailableIds,
    playerSeasonStats: new Map<number, PlayerSeasonStats>(),
    squad: squadPlayers,
  };

  return predictLineup(input);
}