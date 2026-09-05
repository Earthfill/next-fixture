// ---------------------------------------------------------------------------
// Lineup Service - predicted lineup orchestration (no confirmed lineups/coaches)
// ---------------------------------------------------------------------------
// Predictions are cached per-team in-memory for 24h. The caller (getFixtureLineups)
// additionally caches the combined result in Redis under lineups:<fixtureId>.

import type { SquadPlayerWithRating, PredictedLineup, PlayerSeasonStats } from "@/lib/types";
import { getTeamInjuries, getTeamSquad } from "@/lib/football-api";
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

// ---------- Core prediction (squad + injuries only; no lineup history) ------

async function computePrediction(
  teamId: number,
  season: number
): Promise<PredictedLineup | null> {
  const injuries = await getTeamInjuries(teamId, season);

  const confirmedUnavailableIds = new Set(
    injuries
      .filter((i) => i.status === "injured" || i.status === "suspended")
      .map((i) => i.playerId)
  );

  const squad: SquadPlayerWithRating[] = await getTeamSquad(teamId);
  if (!squad.length) return null;

  const input: PredictLineupInput = {
    recentLineups: [],
    confirmedUnavailableIds,
    possiblyUnavailableIds: new Set<number>(),
    playerSeasonStats: new Map<number, PlayerSeasonStats>(),
    squad,
  };

  return predictLineup(input);
}