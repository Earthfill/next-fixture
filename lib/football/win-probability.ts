// ---------------------------------------------------------------------------
// Win Probability & Scoreline — Poisson-based model
// ---------------------------------------------------------------------------
// Football goals are Poisson-distributed. We estimate expected goals (lambda)
// for each team from H2H, form, and odds signals, then derive ALL outputs
// from the same Poisson probability mass function:
//
//   P(X = x, Y = y) = Pois(x | λ_home) × Pois(y | λ_away)
//
// This gives us:
//   - Scoreline: mode of the joint distribution
//   - Win/draw/away: sums of the appropriate regions
//   - Confidence: cumulative probability of the top-3 scorelines
//   - Tip: most likely match outcome
// ---------------------------------------------------------------------------

import type { HeadToHeadMatch, TeamForm, LeagueStanding } from "@/lib/types";

export interface OddsSignal {
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
}

export interface WinProbInput {
  headToHead: HeadToHeadMatch[];
  homeForm: TeamForm;
  awayForm: TeamForm;
  homeStanding?: LeagueStanding | null;
  awayStanding?: LeagueStanding | null;
  odds?: OddsSignal | null;
  venueNeutral?: boolean;
}

export interface WinProbResult {
  home: number;
  draw: number;
  away: number;
}

export interface ScorelineResult {
  home: number;
  away: number;
}

export interface PredictionResult {
  homeWin: number;      // probability 0-100
  draw: number;
  awayWin: number;
  homeScore: number;    // most likely scoreline
  awayScore: number;
  confidence: number;   // 0-100, the probability of the predicted outcome (the tip)
  tip: string;          // "Home Win" | "Draw" | "Away Win"
  doubleChance: {       // derived from the same Poisson distribution
    homeDraw: number;   // 1X — Home or Draw
    homeAway: number;   // 12 — Home or Away
    drawAway: number;   // X2 — Draw or Away
  };
}

function poissonProb(lambda: number, k: number): number {
  if (k > 15) return 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

function estimateLambda(input: WinProbInput): { home: number; away: number } {
  const { headToHead, homeForm, awayForm, odds } = input;
  let homeTotal = 0, awayTotal = 0, weightSum = 0;

  // Signal 1: H2H — already in proper home/away perspective per fixture
  if (headToHead.length > 0) {
    let hGoals = 0, aGoals = 0, wSum = 0;
    for (let i = 0; i < headToHead.length; i++) {
      const m = headToHead[i];
      const w = Math.max(0.3, 1.0 - (headToHead.length - 1 - i) * 0.15);
      hGoals += m.homeScore * w;
      aGoals += m.awayScore * w;
      wSum += w;
    }
    if (wSum > 0) {
      homeTotal += hGoals / wSum;
      awayTotal += aGoals / wSum;
      weightSum += 1.0;
    }
  }

  // Signal 2: Form — compute scored/conceded for each team from recent matches
  // Score is now stored as "ourGoals-opponentGoals" (team perspective, fixed)
  const parseScore = (score: string) => {
    const parts = score.split("-").map(Number);
    return parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])
      ? { scored: parts[0], conceded: parts[1] }
      : null;
  };

  // Home team's own matches: scored/conceded with recency weighting
  const homeFormScores = homeForm.recentMatches
    .map((m, i) => {
      const parsed = parseScore(m.score);
      if (!parsed) return null;
      // Recency weight: most recent match (highest index) = 1.0, decays by 0.15 per match
      const w = Math.max(0.3, 1.0 - (homeForm.recentMatches.length - 1 - i) * 0.15);
      return { ...parsed, w };
    })
    .filter(Boolean) as { scored: number; conceded: number; w: number }[];

  // Away team's own matches: scored/conceded with recency weighting
  const awayFormScores = awayForm.recentMatches
    .map((m, i) => {
      const parsed = parseScore(m.score);
      if (!parsed) return null;
      const w = Math.max(0.3, 1.0 - (awayForm.recentMatches.length - 1 - i) * 0.15);
      return { ...parsed, w };
    })
    .filter(Boolean) as { scored: number; conceded: number; w: number }[];

  if (homeFormScores.length >= 2 && awayFormScores.length >= 2) {
    let hScoredWeighted = 0, hConcededWeighted = 0, hWSum = 0;
    for (const s of homeFormScores) {
      hScoredWeighted += s.scored * s.w;
      hConcededWeighted += s.conceded * s.w;
      hWSum += s.w;
    }
    let aScoredWeighted = 0, aConcededWeighted = 0, aWSum = 0;
    for (const s of awayFormScores) {
      aScoredWeighted += s.scored * s.w;
      aConcededWeighted += s.conceded * s.w;
      aWSum += s.w;
    }

    const homeScored = hScoredWeighted / hWSum;
    const homeConceded = hConcededWeighted / hWSum;
    const awayScored = aScoredWeighted / aWSum;
    const awayConceded = aConcededWeighted / aWSum;

    // Dixon-Coles style: λ = 70% own scoring + 30% opponent conceding
    homeTotal += homeScored * 0.7 + awayConceded * 0.3;
    awayTotal += awayScored * 0.7 + homeConceded * 0.3;
    weightSum += 1.0;
  }

  // Signal 3: Odds-implied total goals, split by odds-implied win probability
  const oddsG = estimateOddsTotalGoals(odds);
  if (oddsG > 0 && odds?.homeOdds && odds?.awayOdds) {
    const homeImpl = 1 / odds.homeOdds;
    const awayImpl = 1 / odds.awayOdds;
    const totalImpl = homeImpl + awayImpl;
    if (totalImpl > 0) {
      const homeShare = homeImpl / totalImpl;
      homeTotal += oddsG * homeShare;
      awayTotal += oddsG * (1 - homeShare);
      weightSum += 0.6;
    }
  }

  // Fallback
  if (weightSum === 0) return { home: 1.35, away: 1.15 };

  const rawHome = homeTotal / weightSum;
  const rawAway = awayTotal / weightSum;

  // Home advantage: ~8% applied once (not double-counted from H2H)
  return {
    home: rawHome * 1.08,
    away: rawAway * 0.92,
  };
}

// ─── Main function: computes all outputs from Poisson model ───────

export function computePrediction(input: WinProbInput): PredictionResult {
  const { home: lambdaHome, away: lambdaAway } = estimateLambda(input);
  return computeFromLambdas(lambdaHome, lambdaAway);
}

// ─── Scoreline only (for backward compat) ─────────────────────────

export function predictScoreline(input: WinProbInput): ScorelineResult {
  const result = computePrediction(input);
  return { home: result.homeScore, away: result.awayScore };
}

// ─── Win probability only (for backward compat) ───────────────────

export function computeWinProbability(input: WinProbInput): WinProbResult {
  const result = computePrediction(input);
  return { home: result.homeWin, draw: result.draw, away: result.awayWin };
}

// ─── Core Poisson computation ─────────────────────────────────────

function computeFromLambdas(lambdaHome: number, lambdaAway: number): PredictionResult {
  const maxGoals = 8;

  // Compute Poisson probabilities for all scorelines up to (maxGoals, maxGoals)
  type Scoreline = { h: number; a: number; prob: number };
  const scorelines: Scoreline[] = [];

  let totalProb = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      scorelines.push({ h, a, prob });
      totalProb += prob;
    }
  }

  // Normalise
  for (const sl of scorelines) sl.prob /= totalProb;

  // Sum probabilities by match outcome
  let homeWin = 0, draw = 0, awayWin = 0;
  for (const sl of scorelines) {
    if (sl.h > sl.a) homeWin += sl.prob;
    else if (sl.h === sl.a) draw += sl.prob;
    else awayWin += sl.prob;
  }

  // Tip = most likely outcome
  const tip = homeWin >= draw && homeWin >= awayWin ? "Home Win"
    : awayWin >= draw ? "Away Win"
    : "Draw";

  // Confidence = probability of the most likely outcome (the tip)
  const confidence = tip === "Home Win" ? homeWin
    : tip === "Away Win" ? awayWin
    : draw;

  // Scoreline = rounded expected goals (not the mode)
  // This avoids the paradox where the mode is 1-1 but the tip is Home Win
  const homeScore = Math.max(0, Math.round(lambdaHome));
  const awayScore = Math.max(0, Math.round(lambdaAway));

  // Fix: if the rounded expected scoreline contradicts the tip
  // (e.g. tip = Home Win but homeScore <= awayScore), nudge
  // the favourite up by 1
  let finalHome = homeScore;
  let finalAway = awayScore;
  if (tip === "Home Win" && homeScore <= awayScore) {
    finalHome = awayScore + 1;
  } else if (tip === "Away Win" && awayScore <= homeScore) {
    finalAway = homeScore + 1;
  }

  return {
    homeWin: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    awayWin: Math.round(awayWin * 100),
    homeScore: Math.min(6, finalHome),
    awayScore: Math.min(6, finalAway),
    confidence: Math.round(confidence * 100),
    tip,
    doubleChance: {
      homeDraw: Math.round((homeWin + draw) * 100),
      homeAway: Math.round((homeWin + awayWin) * 100),
      drawAway: Math.round((draw + awayWin) * 100),
    },
  };
}

function estimateOddsTotalGoals(odds: OddsSignal | null | undefined): number {
  if (!odds?.homeOdds || odds.homeOdds <= 0 || !odds.awayOdds || odds.awayOdds <= 0) return 0;
  const imp = (1 / odds.homeOdds) + (1 / (odds.drawOdds || 2)) + (1 / odds.awayOdds);
  return Math.max(0, Math.min(5, (imp - 0.85) * 5));
}