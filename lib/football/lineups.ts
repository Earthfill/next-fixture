// ---------------------------------------------------------------------------
// Lineups Service — Fetch lineups (confirmed API first, then predicted fallback)
// ---------------------------------------------------------------------------

import { apiFetch } from "@/lib/football/api";
import type { LineupEntry, LineupTeamColors, Team } from "@/lib/types";
import { getPredictedLineup } from "@/lib/lineup-service";

const DEFAULT_COLORS: LineupTeamColors = {
  player: { primary: "#e8e8e8", number: "#333333", border: "#cccccc" },
  goalkeeper: { primary: "#ffcc00", number: "#333333", border: "#cccccc" },
};

// ─── Get lineups for a fixture ──────────────────────────────────

export async function getFixtureLineups(
  fixtureId: string | number,
  context?: {
    homeTeam: Team;
    awayTeam: Team;
  }
): Promise<LineupEntry[]> {
  const fid = Number(fixtureId);

  // 1. Try confirmed lineups from API first
  const data = await apiFetch<{ response: LineupEntry[] }>(
    `/fixtures/lineups?fixture=${fid}`
  );
  if (data?.response?.length) {
    return data.response.map((entry) => ({ ...entry, predicted: false }));
  }

  // 2. Fall back to predicted lineups (no AI — deterministic from history)
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

// ─── Convert service result to LineupEntry ──────────────────────

function serviceResultToEntry(
  result: { source: "confirmed" | "predicted"; formation: string; startXI: any[]; substitutes: any[]; confidence?: string; coach?: { name: string; photo: string } },
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
    startXI: result.startXI.map((p: any) => ({
      player: {
        id: p.id,
        name: p.name,
        number: p.number,
        pos: p.pos,
        grid: p.grid || null,
      },
    })),
    substitutes: result.substitutes.map((p: any) => ({
      player: {
        id: p.id,
        name: p.name,
        number: p.number,
        pos: p.pos,
        grid: null,
      },
    })),
    coach: result.coach
      ? { id: 0, name: result.coach.name, photo: result.coach.photo }
      : { id: 0, name: "—", photo: "" },
    predicted: result.source === "predicted",
  };
}
