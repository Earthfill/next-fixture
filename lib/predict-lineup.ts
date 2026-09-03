// ---------------------------------------------------------------------------
// predict-lineup — Pure, testable lineup prediction algorithm
// ---------------------------------------------------------------------------
// The algorithm: recency-weighted player scoring from past lineups,
// formation selection, and squad fallback for missing positions.
// ---------------------------------------------------------------------------

import type { ConfirmedLineupFixture, PredictedLineup, PredictedPlayer, SquadPlayerWithRating, PlayerSeasonStats } from "@/lib/types";

export interface PredictLineupInput {
  recentLineups: ConfirmedLineupFixture[];
  confirmedUnavailableIds: Set<number>;  // injuries API + red card suspensions
  possiblyUnavailableIds: Set<number>;   // appearance drop-off / stale minutes
  playerSeasonStats: Map<number, PlayerSeasonStats>;
  squad: SquadPlayerWithRating[];
}

// ─── Formation definitions ────────────────────────────────────────────

const FORMATION_ROWS: Record<string, { pos: string; count: number }[]> = {
  "4-3-3":   [{ pos: "G", count: 1 }, { pos: "D", count: 4 }, { pos: "M", count: 3 }, { pos: "F", count: 3 }],
  "4-2-3-1": [{ pos: "G", count: 1 }, { pos: "D", count: 4 }, { pos: "M", count: 2 }, { pos: "M", count: 3 }, { pos: "F", count: 1 }],
  "3-4-3":   [{ pos: "G", count: 1 }, { pos: "D", count: 3 }, { pos: "M", count: 4 }, { pos: "F", count: 3 }],
  "4-4-2":   [{ pos: "G", count: 1 }, { pos: "D", count: 4 }, { pos: "M", count: 4 }, { pos: "F", count: 2 }],
  "3-5-2":   [{ pos: "G", count: 1 }, { pos: "D", count: 3 }, { pos: "M", count: 5 }, { pos: "F", count: 2 }],
  "5-3-2":   [{ pos: "G", count: 1 }, { pos: "D", count: 5 }, { pos: "M", count: 3 }, { pos: "F", count: 2 }],
  "4-5-1":   [{ pos: "G", count: 1 }, { pos: "D", count: 4 }, { pos: "M", count: 5 }, { pos: "F", count: 1 }],
  "3-4-2-1": [{ pos: "G", count: 1 }, { pos: "D", count: 3 }, { pos: "M", count: 4 }, { pos: "M", count: 2 }, { pos: "F", count: 1 }],
  "4-1-4-1": [{ pos: "G", count: 1 }, { pos: "D", count: 4 }, { pos: "M", count: 1 }, { pos: "M", count: 4 }, { pos: "F", count: 1 }],
  "3-4-1-2": [{ pos: "G", count: 1 }, { pos: "D", count: 3 }, { pos: "M", count: 4 }, { pos: "M", count: 1 }, { pos: "F", count: 2 }],
};

// Centered column layouts per player count in a row (pitch 5 columns wide)
const COLUMN_LAYOUTS: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

function getColumnsForCount(count: number): number[] {
  return COLUMN_LAYOUTS[count] || Array.from({ length: count }, (_, i) => i + 1);
}

function recencyWeight(index: number): number {
  return Math.max(1.0 - index * 0.15, 0.25);
}

// ─── Proper grid layouts (row + centered column per slot) ──────────────

function getGridForFormation(formation: string): string[] {
  const layout = FORMATION_ROWS[formation];
  if (!layout) return [];
  const grids: string[] = [];
  // Single counter: G=1, D=2, then increments for each subsequent group
  let rowCounter = 2;

  for (const group of layout) {
    let row: number;
    if (group.pos === "G") {
      row = 1;
    } else if (group.pos === "D") {
      row = 2;
    } else {
      rowCounter++;
      row = rowCounter;
    }
    const cols = getColumnsForCount(group.count);
    for (const col of cols) {
      grids.push(`${row}:${col}`);
    }
  }
  return grids;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function pickFormation(recentLineups: ConfirmedLineupFixture[]): string {
  if (recentLineups.length === 0) return "4-3-3";
  const scores = new Map<string, number>();
  recentLineups.forEach((lu, i) => {
    const w = recencyWeight(i);
    const f = normalizeFormation(lu.formation || "4-3-3") || "4-3-3";
    scores.set(f, (scores.get(f) || 0) + w);
  });
  let best = "4-3-3", bestScore = 0;
  scores.forEach((sc, f) => { if (sc > bestScore) { bestScore = sc; best = f; } });
  return FORMATION_ROWS[best] ? best : "4-3-3";
}

function normalizeFormation(f: string): string | null {
  const cleaned = f.replace(/[^0-9]/g, "");
  if (cleaned.length < 2) return null;
  const parts = cleaned.split("");
  if (parts.length === 3) return parts.join("-");
  if (parts.length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  return null;
}

function getPosGroup(pos: string): string {
  if (pos === "G" || pos === "GK") return "G";
  if (pos === "D" || pos === "DEF") return "D";
  if (pos === "M" || pos === "MID") return "M";
  if (pos === "F" || pos === "FWD" || pos === "A") return "F";
  return "M";
}

function pickBestAvailable(
  scored: { id: number; name: string; number: number; pos: string; score: number }[],
  squadByPos: Map<string, SquadPlayerWithRating[]>,
  used: Set<number>,
  posGroup: string,
  possiblyUnavailable: Set<number>
): { id: number; name: string; number: number } | null {
  // 1. Best available player (not possibly unavailable)
  const available = scored.filter((p) => getPosGroup(p.pos) === posGroup && !used.has(p.id) && !possiblyUnavailable.has(p.id));
  if (available.length > 0) return { id: available[0].id, name: available[0].name, number: available[0].number };
  // 2. Squad fallback (not possibly unavailable)
  const fromSquad = (squadByPos.get(posGroup) || []).filter((p) => !used.has(p.id) && !possiblyUnavailable.has(p.id));
  if (fromSquad.length > 0) return { id: fromSquad[0].id, name: fromSquad[0].name, number: fromSquad[0].number };
  // 3. Possibly unavailable player as last resort
  const possiblyAvail = scored.filter((p) => getPosGroup(p.pos) === posGroup && !used.has(p.id));
  if (possiblyAvail.length > 0) return { id: possiblyAvail[0].id, name: possiblyAvail[0].name, number: possiblyAvail[0].number };
  // 4. Any remaining squad player
  const anySquad = (squadByPos.get(posGroup) || []).filter((p) => !used.has(p.id));
  if (anySquad.length > 0) return { id: anySquad[0].id, name: anySquad[0].name, number: anySquad[0].number };
  // 5. Any remaining scored player
  const anyGuy = scored.filter((p) => !used.has(p.id));
  if (anyGuy.length > 0) return { id: anyGuy[0].id, name: anyGuy[0].name, number: anyGuy[0].number };
  return null;
}

function assignGridPositions(players: PredictedPlayer[], formation: string): void {
  const grids = getGridForFormation(formation);
  if (grids.length === 0) {
    // Fallback: simple sequential
    const ctr: Record<string, number> = { G: 0, D: 0, M: 0, F: 0 };
    for (const p of players) {
      const row = { G: 1, D: 2, M: 3, F: 4 }[p.pos] || 2;
      p.grid = `${row}:${++ctr[p.pos]}`;
    }
    return;
  }
  for (let i = 0; i < players.length && i < grids.length; i++) {
    players[i].grid = grids[i];
  }
}

function buildSubstitutes(
  scored: { id: number; name: string; number: number; pos: string; appearances: number }[],
  squadByPos: Map<string, SquadPlayerWithRating[]>,
  used: Set<number>,
  total: number,
  possiblyUnavailable: Set<number>
): PredictedPlayer[] {
  const subs: PredictedPlayer[] = [];
  for (const pos of ["G", "D", "M", "F"]) {
    if (subs.length >= 7) break;
    // Available players first
    const available = scored.filter(
      (p) => getPosGroup(p.pos) === pos && !used.has(p.id) && !subs.some((s) => s.id === p.id) && !possiblyUnavailable.has(p.id)
    );
    for (const p of available) {
      if (subs.length >= 7) break;
      used.add(p.id);
      subs.push({ id: p.id, name: p.name, number: p.number, pos, grid: null, recentStarts: p.appearances, recentTotal: total });
    }
    // Available squad
    const availableSquad = (squadByPos.get(pos) || []).filter(
      (p) => !used.has(p.id) && !subs.some((s) => s.id === p.id) && !possiblyUnavailable.has(p.id)
    );
    for (const p of availableSquad) {
      if (subs.length >= 7) break;
      used.add(p.id);
      subs.push({ id: p.id, name: p.name, number: p.number, pos, grid: null, recentStarts: 0, recentTotal: total });
    }
    // Possibly unavailable as last resort
    const possibly = scored.filter(
      (p) => getPosGroup(p.pos) === pos && !used.has(p.id) && !subs.some((s) => s.id === p.id)
    );
    for (const p of possibly) {
      if (subs.length >= 7) break;
      used.add(p.id);
      subs.push({ id: p.id, name: p.name, number: p.number, pos, grid: null, recentStarts: p.appearances, recentTotal: total });
    }
  }
  return subs;
}

function determineConfidence(
  n: number, fallbacksUsed: number, total: number,
  dropoffSignals: number, staleSignals: number
): "high" | "medium" | "low" {
  if (n < 2 || fallbacksUsed / total > 0.3) return "low";
  if (n < 4 || fallbacksUsed > 0 || dropoffSignals > 0 || staleSignals > 0) return "medium";
  return "high";
}

// ─── Main prediction function ─────────────────────────────────────────

export function predictLineup(input: PredictLineupInput): PredictedLineup {
  const { recentLineups, confirmedUnavailableIds, possiblyUnavailableIds, playerSeasonStats, squad } = input;
  const formation = pickFormation(recentLineups);

  // Track how many signals were detected for confidence degradation
  let dropoffSignals = 0;
  let staleStatsSignals = 0;

  // Score players from recent lineups
  const playerScores = new Map<number, {
    name: string; number: number; pos: string;
    totalWeight: number; appearances: number; mainPos: string;
    posCounts: Record<string, number>; fixtureIndexes: number[];
  }>();
  recentLineups.forEach((lineup, i) => {
    const weight = recencyWeight(i);
    lineup.startXI.forEach(({ player }) => {
      const existing = playerScores.get(player.id);
      if (existing) {
        existing.totalWeight += weight;
        existing.appearances += 1;
        existing.fixtureIndexes.push(i);
        existing.posCounts[player.pos] = (existing.posCounts[player.pos] || 0) + 1;
        existing.mainPos = Object.entries(existing.posCounts).sort((a, b) => b[1] - a[1])[0][0];
      } else {
        playerScores.set(player.id, {
          name: player.name, number: player.number, pos: player.pos,
          totalWeight: weight, appearances: 1, mainPos: player.pos,
          posCounts: { [player.pos]: 1 }, fixtureIndexes: [i],
        });
      }
    });
  });

  // Detect appearance drop-off: regular starters absent from most recent 1-2 matches
  const autoPossiblyUnavailable = new Set<number>();
  if (recentLineups.length >= 3) {
    for (const [id, data] of playerScores) {
      if (data.appearances < 3) continue; // not a regular starter
      const minIndex = Math.min(...data.fixtureIndexes);
      // If the player's most recent start is more than 1 fixture ago, they've dropped off
      if (minIndex > 1) {
        // Started regularly but missing from the last 1-2 fixtures
        autoPossiblyUnavailable.add(id);
        dropoffSignals++;
      }
    }
  }

  // Build combined possibly-unavailable set (input + auto-detected)
  const combinedPossiblyUnavailable = new Set([
    ...possiblyUnavailableIds,
    ...autoPossiblyUnavailable,
  ]);

  // Filter: hard exclude confirmed unavailable; downweight possibly unavailable
  const scoredPlayers = Array.from(playerScores.entries())
    .filter(([id]) => !confirmedUnavailableIds.has(id))
    .map(([id, d]) => {
      let score = d.totalWeight;
      // Heavy downweight for possibly unavailable
      if (combinedPossiblyUnavailable.has(id)) {
        score *= 0.15;
      }
      return { id, name: d.name, number: d.number, pos: d.mainPos, score, appearances: d.appearances };
    })
    .sort((a, b) => b.score - a.score);

  // Build squad fallback map (position -> sorted by rating)
  // Also apply the same downweight logic: only skip confirmed unavailable
  const squadByPos = new Map<string, SquadPlayerWithRating[]>();
  for (const p of squad) {
    if (confirmedUnavailableIds.has(p.id)) continue;
    const list = squadByPos.get(p.pos) || [];
    list.push(p);
    squadByPos.set(p.pos, list);
  }
  for (const [, pl] of squadByPos) pl.sort((a, b) => (b.rating ?? 5) - (a.rating ?? 5));

  // Fill formation slots
  const slots = FORMATION_ROWS[formation] || FORMATION_ROWS["4-3-3"];
  const startXI: PredictedPlayer[] = [];
  const usedIds = new Set<number>();
  const basedOnFixtures = recentLineups.length > 0 ? recentLineups.map((l) => l.fixtureId) : [];
  let fallbacksUsed = 0;

  for (const slot of slots) {
    const grp = getPosGroup(slot.pos);
    for (let i = 0; i < slot.count; i++) {
      const c = pickBestAvailable(
        scoredPlayers, squadByPos, usedIds, grp, combinedPossiblyUnavailable
      );
      if (!c) break;
      usedIds.add(c.id);
      const info = scoredPlayers.find((sp) => sp.id === c.id);
      startXI.push({
        id: c.id, name: c.name, number: c.number, pos: grp, grid: null,
        recentStarts: info?.appearances ?? 0,
        recentTotal: recentLineups.length,
      });
      if (!info) fallbacksUsed++;
    }
  }

  assignGridPositions(startXI, formation);
  const substitutes = buildSubstitutes(scoredPlayers, squadByPos, usedIds, recentLineups.length, combinedPossiblyUnavailable);
  const confidence = determineConfidence(
    recentLineups.length, fallbacksUsed, slots.length,
    dropoffSignals, staleStatsSignals
  );

  return { formation, startXI, substitutes, confidence, basedOnFixtures };
}