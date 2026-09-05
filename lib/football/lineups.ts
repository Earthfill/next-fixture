// ---------------------------------------------------------------------------
// Lineups Service - predicted lineups (no confirmed-lineup API calls)
// ---------------------------------------------------------------------------

import type { LineupEntry, LineupTeamColors, Team } from "@/lib/types";
import { getPredictedLineup } from "@/lib/lineup-service";

const DEFAULT_COLORS: LineupTeamColors = {
  player: { primary: "#e8e8e8", number: "#333333", border: "#cccccc" },
  goalkeeper: { primary: "#ffcc00", number: "#333333", border: "#cccccc" },
};

export async function getFixtureLineups(
  fixtureId: string | number,
  context?: { homeTeam: Team; awayTeam: Team }
): Promise<LineupEntry[]> {
  const fid = Number(fixtureId);

  if (!context) return [];

  const homeId = Number(context.homeTeam.id);
  const awayId = Number(context.awayTeam.id);

  const [homeResult, awayResult] = await Promise.all([
    getPredictedLineup(homeId, fid),
    getPredictedLineup(awayId, fid),
  ]);

  return [
    serviceResultToEntry(homeResult, context.homeTeam, fid),
    serviceResultToEntry(awayResult, context.awayTeam, fid + 1_000_000),
  ];
}

function serviceResultToEntry(
  result: {
    formation: string;
    startXI: { id: number; name: string; number: number; pos: string; grid: string | null }[];
    substitutes: { id: number; name: string; number: number; pos: string }[];
  },
  team: Team,
  fallbackTeamId: number
): LineupEntry {
  return {
    team: {
      id: fallbackTeamId,
      name: team.name,
      logo: team.logo,
      colors: DEFAULT_COLORS,
    },
    formation: result.formation || "4-3-3",
    startXI: result.startXI.map((p) => ({
      player: { id: p.id, name: p.name, number: p.number, pos: p.pos, grid: p.grid || null },
    })),
    substitutes: result.substitutes.map((p) => ({
      player: { id: p.id, name: p.name, number: p.number, pos: p.pos, grid: null },
    })),
    coach: { id: 0, name: "", photo: "" },
    predicted: true,
  };
}