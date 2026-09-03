// ---------------------------------------------------------------------------
// Preview Generation Endpoint — Template-based NLG analysis
// ---------------------------------------------------------------------------
// POST /api/generate-preview — Generate tactical analysis
// Accepts { homeTeam, awayTeam, competition, homeForm, awayForm, headToHead }
// Uses the NLG template system (no external AI calls).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { generateAnalysis } from "@/lib/football/analysis";
import type { TeamForm, HeadToHeadMatch } from "@/lib/types";

// ─── Rate limiting ────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

// ─── GET handler — Health check ───────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "/api/generate-preview",
    method: "POST",
    description: "Generates tactical match analysis using the NLG template system.",
    requestBody: { homeTeam: "string", awayTeam: "string", competition: "string", homeForm: "object (optional)", awayForm: "object (optional)", h2h: "array (optional)" },
  });
}

// ─── POST handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: {
    homeTeam?: string; awayTeam?: string; competition?: string;
    homeForm?: TeamForm; awayForm?: TeamForm; headToHead?: HeadToHeadMatch[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { homeTeam, awayTeam, competition, homeForm, awayForm, headToHead } = body;

  if (!homeTeam || !awayTeam || !competition) {
    return NextResponse.json(
      { error: "Missing required fields: homeTeam, awayTeam, competition." },
      { status: 400 }
    );
  }

  const defaultForm: TeamForm = { teamName: "", results: [], recentMatches: [] };
  const defaultH2H: HeadToHeadMatch[] = [];

  // Use NLG template analysis
  const { text, source } = await generateAnalysis(homeTeam, awayTeam, competition, homeForm ?? defaultForm, awayForm ?? defaultForm, headToHead ?? defaultH2H);
  return NextResponse.json({ analysis: text, source });
}
