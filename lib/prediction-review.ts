// ---------------------------------------------------------------------------
// prediction-review — "Does the betting tip relate to the predicted scoreline
// and win probability?" quality gate.
// ---------------------------------------------------------------------------
// The tip is NOT a single signal. It can target any betting market:
//   outcome (1/X/2) · double chance (1X / 12 / X2) · over/under goals ·
//   both teams to score · correct score · combos of the above.
//
// This module classifies a free-text tip into detected "bets", then validates
// each detected bet against the matching prediction signal. A match is flagged
// ONLY when a detected bet contradicts a signal (never because we couldn't
// parse the tip — unparseable tips are neutral).
//
// Pure functions only — no I/O, safe to import anywhere.
// ---------------------------------------------------------------------------

export type TipOutcome = "home" | "draw" | "away";

export interface PredictionSignals {
  predictedScore: { home: number; away: number } | null;
  winProbability: { home: number; draw: number; away: number } | null;
  btts?: { yes: number; no: number } | null;
  overUnder?: { over: number; under: number } | null;
}

export type DetectedBet =
  | { market: "outcome"; outcome: TipOutcome }
  | { market: "double-chance"; outcomes: TipOutcome[] }
  | { market: "goals"; line: number; direction: "over" | "under" }
  | { market: "btts"; value: boolean }
  | { market: "correct-score"; home: number; away: number };

export interface ReviewResult {
  flagged: boolean;
  reasons: string[];
  bets: DetectedBet[];
}

const NO_PREDICTION_HINTS = /no prediction|prediction (?:is )?not available|predictions? unavailable/i;

// ─── Outcome helpers ────────────────────────────────────────────────────

/** Derived match outcome from a predicted scoreline. */
export function outcomeFromScore(score: { home: number; away: number }): TipOutcome {
  return score.home > score.away ? "home" : score.away > score.home ? "away" : "draw";
}

/**
 * Derived match outcome from win probabilities. Returns null when the max is
 * shared (a tie is genuinely ambiguous and must not be used to flag anything).
 */
export function outcomeFromProb(prob: { home: number; draw: number; away: number }): TipOutcome | null {
  const max = Math.max(prob.home, prob.draw, prob.away);
  const at = (v: number) => Math.abs(v - max) < 1e-9;
  const count = Number(at(prob.home)) + Number(at(prob.draw)) + Number(at(prob.away));
  if (count > 1) return null;
  if (at(prob.home)) return "home";
  if (at(prob.draw)) return "draw";
  if (at(prob.away)) return "away";
  return null;
}

// ─── Tip classification ─────────────────────────────────────────────────

/** Which team does this tip support winning? Uses full name, first token and short name. */
function winnerSideFromTip(
  t: string,
  home: string,
  away: string,
  homeShort: string,
  awayShort: string
): TipOutcome | null {
  const word = (v: string) => v.toLowerCase().trim();
  const variants = {
    home: [word(home), word(home).split(" ")[0], word(homeShort)].filter((v) => v.length >= 3),
    away: [word(away), word(away).split(" ")[0], word(awayShort)].filter((v) => v.length >= 3),
  };

  const homeMentioned = variants.home.some((v) => t.includes(v));
  const awayMentioned = variants.away.some((v) => t.includes(v));

  const winPhrase =
    /\b(to win|should win|will win|are (?:the )?favou?r(?:ed|ite)|is (?:the )?favou?r(?:ed|ite)|win this|win the match|predicted to win|beats?|more likely to win|stronger side)\b/.test(
      t
    );

  // "the winner is <team>" / "Winner : <team>" / "Combo Winner : <team> and ..."
  // Greedy capture stops at the first char outside [a-z0-9 '.-] (e.g. "+2.5 goals").
  const winnerIs = t.match(/(?:combo\s+)?winner\s*[:–-]?\s*(?:of this match )?\s*(?:is|will be|are)?\s*([a-z][a-z0-9 '.-]*)/);
  if (winnerIs) {
    const raw = winnerIs[1].trim();
    if (variants.home.some((v) => raw.startsWith(v))) return "home";
    if (variants.away.some((v) => raw.startsWith(v))) return "away";
  }

  if (!winPhrase) return null;

  if (homeMentioned && !awayMentioned) return "home";
  if (awayMentioned && !homeMentioned) return "away";

  // Both names mentioned — fall back to the explicit home/away words.
  if (/\bhome\b/.test(t) && /\b(?:win|victory)\b/.test(t)) return "home";
  if (/\baway\b/.test(t) && /\b(?:win|victory)\b/.test(t)) return "away";

  return null;
}

function detectCorrectScore(t: string): DetectedBet | null {
  const m = t.match(/\bcorrect(?:ly (?:predict|score))?[^0-9]{0,8}(\d{1,2})\s*[-:]\s*(\d{1,2})\b/);
  if (!m) return null;
  return { market: "correct-score", home: +m[1], away: +m[2] };
}

function detectGoals(t: string): DetectedBet | null {
  const overM = t.match(/\bover\s*(\d+(?:\.\d+)?)\b/) || t.match(/\bo\s*(\d+(?:\.\d+)?)\b/);
  const underM = t.match(/\bunder\s*(\d+(?:\.\d+)?)\b/) || t.match(/\bu\s*(\d+(?:\.\d+)?)\b/);
  // Signed goal lines — "+2.5 goals" = Over, "-3.5 goals" = Under. Requiring the
  // word "goals" after the number keeps correct scores ("2-1") out of this market.
  const signedM = t.match(/([+-])(\d+(?:\.\d+)?)\s*goals?/);
  if (overM) return { market: "goals", line: +overM[1], direction: "over" };
  if (underM) return { market: "goals", line: +underM[1], direction: "under" };
  if (signedM) return { market: "goals", line: +signedM[2], direction: signedM[1] === "+" ? "over" : "under" };
  return null;
}

function detectBtts(t: string): DetectedBet | null {
  const phrase = /\bbtts\b|both (?:teams?|sides?) (?:to |will |should )?score|both (?:teams?|sides?) to score/i;
  if (!phrase.test(t)) return null;
  const no =
    /(?:btts|both (?:teams?|sides?) (?:to |will |should )?score).{0,25}\b(no|won'?t|not)\b/.test(t) ||
    /\b(no|won'?t|not)\b.{0,25}(?:btts|both (?:teams?|sides?) (?:to |will |should )?score)/.test(t);
  return { market: "btts", value: !no };
}

function mentionsTeam(s: string, names: string[]): boolean {
  const safe = names.filter((n) => n && n.length >= 3);
  return safe.some((n) => {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(s);
  });
}

/** Resolve one side of a "X or Y" double-chance phrase to home/draw/away. */
function resolveDcSide(
  raw: string,
  home: string,
  away: string,
  homeShort: string,
  awayShort: string
): TipOutcome | null {
  const s = raw.toLowerCase().replace(/[:.]+$/, "").trim();
  if (!s) return null;

  const homeNames = [home.toLowerCase(), (homeShort || "").toLowerCase()];
  const awayNames = [away.toLowerCase(), (awayShort || "").toLowerCase()];
  const both = [...homeNames, ...awayNames].filter((n) => n.length >= 3);

  // A raw "draw" phrase (with the team possibly in one side only).
  if (/\bdraw\b/.test(s) && !mentionsTeam(s, both)) return "draw";
  if (mentionsTeam(s, homeNames)) return "home";
  if (mentionsTeam(s, awayNames)) return "away";
  if (/\b(?:home|home team)\b/.test(s)) return "home";
  if (/\b(?:away|away team)\b/.test(s)) return "away";
  if (/\bdraw\b/.test(s)) return "draw";
  return null;
}

function detectDoubleChance(
  t: string,
  home: string,
  away: string,
  homeShort: string,
  awayShort: string
): DetectedBet | null {
  if (/\b1x2\b/.test(t)) return null; // full-time 1X2 market ≠ double chance

  const outcomes = new Set<TipOutcome>();

  // Compact notation: 1X = home/draw · X2 = draw/away · 12 = home/away
  if (/\b1x\b/.test(t)) {
    outcomes.add("home");
    outcomes.add("draw");
  }
  if (/\bx2\b/.test(t)) {
    outcomes.add("draw");
    outcomes.add("away");
  }
  if (/\b12\b/.test(t)) {
    outcomes.add("home");
    outcomes.add("away");
  }
  if (/\beither (?:team|side)\b/.test(t)) {
    outcomes.add("home");
    outcomes.add("away");
  }

  // "X or Y" pairs — sides may be literal words or the actual team names
  // ("draw or Chelsea", "Arsenal or draw", "home or away").
  const pairRe = /\b([a-z][a-z0-9 .'&-]*?)\s+or\s+([a-z][a-z0-9 .'&-]*?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(t)) !== null) {
    const a = resolveDcSide(m[1], home, away, homeShort, awayShort);
    const b = resolveDcSide(m[2], home, away, homeShort, awayShort);
    if (a && b) {
      outcomes.add(a);
      outcomes.add(b);
    }
  }

  if (outcomes.size < 2) return null;
  return { market: "double-chance", outcomes: [...outcomes] };
}
function detectOutcome(t: string, home: string, away: string, homeShort: string, awayShort: string): DetectedBet | null {
  // Explicit outcome phrases first (work even when both team names appear).
  if (/\bhome (?:team )?win\b|\bhome win\b|\bhome teamwin\b/.test(t)) {
    return { market: "outcome", outcome: "home" };
  }
  if (/\baway (?:team )?win\b|\baway win\b|\baway teamwin\b/.test(t)) {
    return { market: "outcome", outcome: "away" };
  }
  if (/\ba draw\b|\bthe draw\b|\bdraw (?:is|looks) (?:likely|expected|a good)\b|\bpoints (?:to be )?shared\b|\bto draw\b/.test(t)) {
    return { market: "outcome", outcome: "draw" };
  }
  const side = winnerSideFromTip(t, home, away, homeShort, awayShort);
  return side ? { market: "outcome", outcome: side } : null;
}

/**
 * Classify a free-text betting tip into detected markets. Returns an empty
 * array when nothing is recognised (the tip is then treated as neutral).
 */
export function classifyTip(
  tip: string | null | undefined,
  home: string,
  away: string,
  homeShort?: string,
  awayShort?: string
): DetectedBet[] {
  if (!tip) return [];
  const t = tip.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || NO_PREDICTION_HINTS.test(t)) return [];

  const bets: DetectedBet[] = [];

  const cs = detectCorrectScore(t);
  if (cs) bets.push(cs);

  const goals = detectGoals(t);
  if (goals) bets.push(goals);

  const btts = detectBtts(t);
  if (btts) bets.push(btts);

  const dc = detectDoubleChance(t, home, away, homeShort ?? "", awayShort ?? "");
  if (dc) bets.push(dc);

  const outcome = detectOutcome(t, home, away, homeShort ?? "", awayShort ?? "");
  if (outcome) bets.push(outcome);

  return bets;
}

// ─── Evaluation ─────────────────────────────────────────────────────────

const fmt = (s: { home: number; away: number }) => `${s.home}-${s.away}`;

/** Plain-English label for an outcome. */
export function outcomeLabel(outcome: TipOutcome): string {
  return outcome === "home" ? "a home win" : outcome === "away" ? "an away win" : "a draw";
}

/**
 * Evaluate whether a tip "relates" to the predicted scoreline / win probability.
 * Only detected contradictions flag the match — unknown tip text never does.
 */
export function evaluatePrediction(
  tip: string | null | undefined,
  signals: PredictionSignals,
  home: string,
  away: string,
  homeShort?: string,
  awayShort?: string
): ReviewResult {
  const bets = classifyTip(tip, home, away, homeShort, awayShort);
  const reasons: string[] = [];

  if (bets.length === 0) {
    return { flagged: false, reasons, bets };
  }

  const { predictedScore, winProbability } = signals;
  const scoreOutcome = predictedScore ? outcomeFromScore(predictedScore) : null;
  const probOutcome = winProbability ? outcomeFromProb(winProbability) : null;

  for (const bet of bets) {
    switch (bet.market) {
      case "correct-score": {
        if (predictedScore && (predictedScore.home !== bet.home || predictedScore.away !== bet.away)) {
          reasons.push(
            `Tip "correct score ${bet.home}-${bet.away}" conflicts with the predicted ${fmt(predictedScore)} scoreline.`
          );
        }
        break;
      }

      case "goals": {
        if (predictedScore) {
          const total = predictedScore.home + predictedScore.away;
          if (bet.direction === "over" && total <= bet.line) {
            reasons.push(`Tip "Over ${bet.line} goals" contradicts the predicted ${fmt(predictedScore)} scoreline (total ${total}).`);
          }
          if (bet.direction === "under" && total >= bet.line) {
            reasons.push(`Tip "Under ${bet.line} goals" contradicts the predicted ${fmt(predictedScore)} scoreline (total ${total}).`);
          }
        } else if (signals.overUnder) {
          const pct = bet.direction === "over" ? signals.overUnder.over : signals.overUnder.under;
          if (pct != null && pct < 50) {
            reasons.push(`Tip "${bet.direction === "over" ? "Over" : "Under"} ${bet.line} goals" conflicts with the goal-market probabilities.`);
          }
        }
        break;
      }

      case "btts": {
        if (predictedScore) {
          const both = predictedScore.home > 0 && predictedScore.away > 0;
          if (bet.value && !both) {
            reasons.push(`Tip "Both teams to score" contradicts the predicted ${fmt(predictedScore)} scoreline.`);
          }
          if (!bet.value && both) {
            reasons.push(`Tip "No both-teams-to-score" contradicts the predicted ${fmt(predictedScore)} scoreline (both teams score).`);
          }
        } else if (signals.btts) {
          const pct = bet.value ? signals.btts.yes : signals.btts.no;
          if (pct != null && pct < 50) {
            reasons.push(`Tip "${bet.value ? "BTTS Yes" : "BTTS No"}" conflicts with the BTTS market probabilities.`);
          }
        }
        break;
      }

      case "double-chance": {
        const dc = bet.outcomes.join("/").toUpperCase();
        if (scoreOutcome && !bet.outcomes.includes(scoreOutcome)) {
          reasons.push(`Tip "double chance ${dc}" contradicts the predicted ${fmt(predictedScore!)} scoreline (${outcomeLabel(scoreOutcome)}).`);
        }
        if (probOutcome && !bet.outcomes.includes(probOutcome)) {
          reasons.push(`Tip "double chance ${dc}" contradicts the win probability (favours ${outcomeLabel(probOutcome)}).`);
        }
        break;
      }

      case "outcome": {
        if (scoreOutcome && scoreOutcome !== bet.outcome) {
          reasons.push(
            `Tip says ${outcomeLabel(bet.outcome)} but the predicted ${fmt(predictedScore!)} scoreline points to ${outcomeLabel(scoreOutcome)}.`
          );
        }
        if (probOutcome && probOutcome !== bet.outcome) {
          reasons.push(
            `Tip says ${outcomeLabel(bet.outcome)} but the win probability favours ${outcomeLabel(probOutcome)}.`
          );
        }
        break;
      }
    }
  }

  return { flagged: reasons.length > 0, reasons, bets };
}