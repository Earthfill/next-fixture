// ---------------------------------------------------------------------------
// Analysis & Prediction — NLG analysis + prediction engine
// ---------------------------------------------------------------------------

import type { TeamForm, HeadToHeadMatch, PredictionData } from "@/lib/types";
import { generateNlgAnalysis } from "@/lib/football/nlg-analysis";

// ─── Analysis (always uses NLG template system) ──────────────────────

export async function generateAnalysis(
  homeTeam: string, awayTeam: string, competition: string,
  homeForm: TeamForm, awayForm: TeamForm, headToHead: HeadToHeadMatch[]
): Promise<{ text: string; source: "nlg" }> {
  return {
    text: generateNlgAnalysis(homeTeam, awayTeam, competition, homeForm, awayForm, headToHead),
    source: "nlg",
  };
}

// ─── Prediction Engine ───────────────────────────────────────────────

export function buildPrediction(
  homeForm: TeamForm, awayForm: TeamForm, homeTeam: string, awayTeam: string
): PredictionData {
  const hW = homeForm.results.filter((r) => r === "W").length;
  const aW = awayForm.results.filter((r) => r === "W").length;
  const hS = homeForm.results.length ? hW / homeForm.results.length : 0.4;
  const aS = awayForm.results.length ? aW / awayForm.results.length : 0.3;
  let hp = Math.round((hS + 0.12) * 60 + 15);
  let dp = Math.round(25);
  let ap = Math.round(aS * 60 + 10);
  const t = hp + dp + ap;
  if (t > 100) { const s = 100 / t; hp = Math.round(hp * s); dp = Math.round(dp * s); ap = Math.round(ap * s); }
  const ga = homeForm.results.length
    ? (hW * 2 + (homeForm.results.length - hW - homeForm.results.filter((r) => r === "D").length)) / homeForm.results.length
    : 2.5;
  return {
    predictedScore: { home: Math.max(Math.round(ga / 2), 1), away: Math.max(Math.round(ga / 3), 0) },
    confidence: Math.min(55 + Math.round(Math.abs(hS - aS) * 30), 90),
    tip: hS > aS ? `${homeTeam} are favoured based on recent form.` : `This looks tight on paper.`,
    winProbability: { home: hp, draw: dp, away: ap },
    btts: { yes: Math.round(Math.min(ga * 20, 70)), no: 100 - Math.round(Math.min(ga * 20, 70)) },
    overUnder: { over: Math.round(Math.min(ga * 25, 85)), under: 100 - Math.round(Math.min(ga * 25, 85)) },
  };
}