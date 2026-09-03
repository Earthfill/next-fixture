// ---------------------------------------------------------------------------
// GET /api/lineups/[fixtureId] — Predicted + confirmed lineups for a fixture
// ---------------------------------------------------------------------------
// Returns home and away team lineups with source, formation, and confidence.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getPredictedLineup } from "@/lib/lineup-service";

// Revalidate every 5 minutes as kickoff approaches
export const revalidate = 300;

// ─── GET handler ──────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const { fixtureId } = await params;
  const id = parseInt(fixtureId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid fixture ID" }, { status: 400 });
  }

  try {
    // Fetch fixture data to determine both team IDs
    const fixtureData = await fetchFixtureMeta(id);
    if (!fixtureData) {
      return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
    }

    const { homeTeamId, awayTeamId, kickoff } = fixtureData;

    // Compute predictions for both teams concurrently
    const [home, away] = await Promise.all([
      getPredictedLineup(homeTeamId, id),
      getPredictedLineup(awayTeamId, id),
    ]);

    const response = {
      home: {
        teamId: homeTeamId,
        teamName: fixtureData.homeTeamName,
        source: home.source,
        formation: home.formation,
        startXI: home.startXI,
        substitutes: home.substitutes,
        confidence: home.confidence,
        basedOnFixtures: home.basedOnFixtures,
      },
      away: {
        teamId: awayTeamId,
        teamName: fixtureData.awayTeamName,
        source: away.source,
        formation: away.formation,
        startXI: away.startXI,
        substitutes: away.substitutes,
        confidence: away.confidence,
        basedOnFixtures: away.basedOnFixtures,
      },
      fixtureKickoff: kickoff,
    };

    // Use a 60-second s-maxage if either side is confirmed
    const hasConfirmed = home.source === "confirmed" || away.source === "confirmed";
    const cacheSeconds = hasConfirmed ? 60 : 300;

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
      },
    });
  } catch (err) {
    console.error("Lineup API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Fixture metadata helper ──────────────────────────────────────────

interface FixtureMeta {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: string;
}

async function fetchFixtureMeta(fixtureId: number): Promise<FixtureMeta | null> {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPIDAPI_KEY) return null;

  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,
    {
      headers: { "x-apisports-key": RAPIDAPI_KEY } as HeadersInit,
      next: { revalidate: 3600 },
    }
  );

  if (!res.ok) return null;
  const json = await res.json();
  const fixture = json?.response?.[0];
  if (!fixture) return null;

  return {
    homeTeamId: fixture.teams.home.id,
    awayTeamId: fixture.teams.away.id,
    homeTeamName: fixture.teams.home.name,
    awayTeamName: fixture.teams.away.name,
    kickoff: fixture.fixture.date || "",
  };
}