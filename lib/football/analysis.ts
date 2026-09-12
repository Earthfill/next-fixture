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

/**
 * Build an internally-consistent prediction (tip, scoreline and win-probability
 * all point at the SAME outcome). Previously the tip/win-prob came from form
 * strength while the scoreline was derived independently from goals average,
 * which could emit e.g. "Home favoured" + 58% home win + a 1-1 scoreline — a
 * self-contradiction the prediction-quality gate now flags.
 */
export function buildPrediction(
  homeForm: TeamForm, awayForm: TeamForm, homeTeam: string, awayTeam: string
): PredictionData {
  const hW = homeForm.results.filter((r) => r === "W").length;
  const aW = awayForm.results.filter((r) => r === "W").length;
  const hS = homeForm.results.length ? hW / homeForm.results.length : 0.4;
  const aS = awayForm.results.length ? aW / awayForm.results.length : 0.3;

  // Outcome derived from form strength (with a small neutral band).
  const diff = hS - aS;
  let outcome: "home" | "draw" | "away";
  if (diff > 0.03) outcome = "home";
  else if (diff < -0.03) outcome = "away";
  else outcome = "draw";

  // Base goal expectation (capped to keep scorelines realistic).
  const hGoalsSum = homeForm.results.reduce((sum, r) => sum + (r === "W" ? 2.5 : r === "D" ? 2 : 1.5), 0);
  const ga = homeForm.results.length
    ? Math.min(4.5, hGoalsSum / homeForm.results.length)
    : 2.5;

  // ── Scoreline — winner matches `outcome` ──────────────────────────────
  let homeScore: number;
  let awayScore: number;
  const baseHome = Math.max(Math.round(ga / 2), 0);
  const baseAway = Math.max(Math.round(ga / 3), 0);
  if (outcome === "home") {
    homeScore = Math.max(baseHome, 1);
    awayScore = baseAway < homeScore ? baseAway : Math.max(0, homeScore - 1);
  } else if (outcome === "away") {
    awayScore = Math.max(baseAway, 1);
    homeScore = baseHome < awayScore ? baseHome : Math.max(0, awayScore - 1);
  } else {
    homeScore = Math.max(baseHome, baseAway, 1);
    awayScore = homeScore; // draw → level scoreline
  }

  // ── Win probability — favourite matches `outcome` ─────────────────────
  const edge = Math.min(Math.abs(diff) * 60, 30); // 0–30% edge from form gap
  let hp: number, dp: number, ap: number;
  if (outcome === "home") {
    hp = 45 + edge;
    dp = Math.round((100 - hp) * 0.5);
    ap = 100 - hp - dp;
  } else if (outcome === "away") {
    ap = 45 + edge;
    dp = Math.round((100 - ap) * 0.5);
    hp = 100 - ap - dp;
  } else {
    dp = 40;
    hp = Math.round((100 - dp) / 2);
    ap = 100 - dp - hp;
  }

  const tip =
    outcome === "home"
      ? `${homeTeam} are favoured based on recent form.`
      : outcome === "away"
        ? `${awayTeam} are favoured based on recent form.`
        : "This looks tight on paper — a draw cannot be ruled out.";

  const expectedGoals = Math.min(3.5, ga);
  const expectedTotal = homeScore + awayScore;

  return {
    predictedScore: { home: homeScore, away: awayScore },
    confidence: Math.min(55 + Math.round(Math.abs(diff) * 30), 90),
    tip,
    winProbability: { home: hp, draw: dp, away: ap },
    btts: { yes: Math.round(Math.min(expectedTotal * 18, 80)), no: Math.max(20, 100 - Math.round(Math.min(expectedTotal * 18, 80))) },
    overUnder: {
      over: Math.round(Math.min(expectedGoals * 22, 82)),
      under: Math.max(18, 100 - Math.round(Math.min(expectedGoals * 22, 82))),
    },
  };
}