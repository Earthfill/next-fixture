// ---------------------------------------------------------------------------
// NLG Analysis — Natural Language Generation for match previews
// ---------------------------------------------------------------------------
// A deterministic, high-quality text generation engine that produces
// 3-4 paragraphs of varied, data-driven football analysis.
// No AI, no API calls, no rate limits — scales to 10K+ users.
// ---------------------------------------------------------------------------

import type { TeamForm, HeadToHeadMatch } from "@/lib/types";

// ─── Seeded random (deterministic per fixture) ─────────────────────────

function seededHash(teamA: string, teamB: string, comp: string): number {
  let hash = 0;
  const str = `${teamA}:${teamB}:${comp}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(items: T[], seed: number, offset: number): T {
  return items[(seed + offset) % items.length];
}

// ─── Form analysis helpers ─────────────────────────────────────────────

interface FormSummary {
  wins: number; draws: number; losses: number; points: number;
  isStreak: boolean; streakType: "W" | "D" | "L" | null; streakLength: number;
  scored: number; conceded: number; avgScored: number; avgConceded: number;
  cleanSheets: number; failedToScore: number;
  label: "flying" | "strong" | "mixed" | "struggling" | "poor";
}

function analyzeForm(form: TeamForm): FormSummary {
  const results = form.results;
  if (results.length === 0) {
    return { wins: 0, draws: 0, losses: 0, points: 0, isStreak: false, streakType: null, streakLength: 0, scored: 0, conceded: 0, avgScored: 0, avgConceded: 0, cleanSheets: 0, failedToScore: 0, label: "mixed" };
  }
  const wins = results.filter((r) => r === "W").length;
  const draws = results.filter((r) => r === "D").length;
  const losses = results.filter((r) => r === "L").length;
  const points = wins * 3 + draws;
  let streakLength = 1;
  const streakType: "W" | "D" | "L" | null = results[results.length - 1];
  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === streakType) streakLength++; else break;
  }
  const isStreak = streakLength >= 3;
  let scored = 0, conceded = 0, cleanSheets = 0, failedToScore = 0;
  for (const m of form.recentMatches) {
    const parts = m.score.split("-").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      scored += parts[0]; conceded += parts[1];
      if (parts[1] === 0) cleanSheets++;
      if (parts[0] === 0) failedToScore++;
    }
  }
  const avgScored = results.length > 0 ? scored / results.length : 0;
  const avgConceded = results.length > 0 ? conceded / results.length : 0;
  const winPct = wins / results.length;
  const lossPct = losses / results.length;
  const label = winPct >= 0.6 ? "flying" : winPct >= 0.4 ? "strong" : lossPct >= 0.6 ? "poor" : lossPct >= 0.4 ? "struggling" : "mixed";
  return { wins, draws, losses, points, isStreak, streakType, streakLength, scored, conceded, avgScored, avgConceded, cleanSheets, failedToScore, label };
}

interface H2HSummary {
  homeWins: number; awayWins: number; draws: number; totalGoals: number;
  avgGoals: number; isOneSided: boolean; dominantSide: "home" | "away" | null;
  dominantWins: number; recentMeetings: number;
}

function analyzeH2H(matches: HeadToHeadMatch[]): H2HSummary {
  const homeWins = matches.filter((m) => m.homeScore > m.awayScore).length;
  const awayWins = matches.filter((m) => m.awayScore > m.homeScore).length;
  const draws = matches.filter((m) => m.homeScore === m.awayScore).length;
  const totalGoals = matches.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const avgGoals = matches.length > 0 ? totalGoals / matches.length : 0;
  const isOneSided = Math.abs(homeWins - awayWins) >= 2;
  const dominantSide = homeWins > awayWins ? "home" : awayWins > homeWins ? "away" : null;
  const dominantWins = Math.max(homeWins, awayWins);
  return { homeWins, awayWins, draws, totalGoals, avgGoals, isOneSided, dominantSide, dominantWins, recentMeetings: matches.length };
}
// ─── Sentence template banks ───────────────────────────────────────────

type FormSentence = (team: string, f: FormSummary) => string;
type TransitionSentence = (team: string, opp: string) => string;
type H2HSentence = (h: H2HSummary, home: string, away: string) => string;
type H2HGoalSentence = (h: H2HSummary) => string;
type TacticalSentence = (home: string, away: string, hf: FormSummary, af: FormSummary) => string;
type TacticalFavSentence = (fav: string, underdog: string) => string;
type PredictionSentence = (home: string, away: string, hf: FormSummary, af: FormSummary, h2h: H2HSummary) => string;
type PredictionCloserSentence = (comp: string) => string;

const FORM_OPENERS: FormSentence[] = [
  (t, f) => `${t} come into this on the back of ${f.isStreak && f.streakType === "W" ? `an impressive ${f.streakLength}-match winning run` : f.isStreak && f.streakType === "L" ? `a difficult run of ${f.streakLength} consecutive defeats` : f.isStreak && f.streakType === "D" ? `a steady run of ${f.streakLength} draws` : `a mixed run of form`}, having taken ${f.points} points from their last ${f.wins + f.draws + f.losses} matches.`,
  (t, f) => `${t} are ${f.label === "flying" ? "in impressive form" : f.label === "strong" ? "enjoying a solid spell" : f.label === "poor" ? "going through a rough patch" : f.label === "struggling" ? "finding things difficult" : "experiencing a mixed run"} with ${f.wins} wins, ${f.draws} draws and ${f.losses} defeats from their last ${f.wins + f.draws + f.losses} outings.`,
  (t, f) => `Recent form suggests ${t} are ${f.label === "flying" ? "in red-hot form" : f.label === "strong" ? "on a positive trajectory" : f.label === "poor" ? "in a worrying slump" : f.label === "struggling" ? "struggling for consistency" : "hard to predict right now"} — ${f.wins} wins, ${f.draws} draws and ${f.losses} losses in their last ${f.wins + f.draws + f.losses}.`,
  (t, f) => `${t} head into this fixture ${f.label === "flying" ? "brimming with belief" : f.label === "strong" ? "in decent shape" : f.label === "poor" ? "short of belief" : f.label === "struggling" ? "desperate for a turnaround" : "with mixed emotions"} after collecting ${f.points} points from a possible ${(f.wins + f.draws + f.losses) * 3} in their last ${f.wins + f.draws + f.losses}.`,
  (t, f) => `${t} arrive at this fixture ${f.label === "flying" ? "with real wind in their sails" : f.label === "strong" ? "on the back of a productive spell" : f.label === "poor" ? "searching for answers after a difficult run" : f.label === "struggling" ? "hoping a change of opponent sparks a revival" : "looking to turn decent patches into consistency"}, having picked up ${f.points} points from their last ${f.wins + f.draws + f.losses} games.`,
  (t, f) => `The numbers tell a clear story for ${t}: ${f.wins} wins, ${f.draws} draws and ${f.losses} losses in their last ${f.wins + f.draws + f.losses} outings, worth ${f.points} points — ${f.label === "flying" ? "an excellent return" : f.label === "strong" ? "a solid return" : f.label === "poor" ? "a worrying return" : f.label === "struggling" ? "a concerning return" : "a middling return"}.`,
  (t, f) => `${t} will approach this game ${f.label === "flying" ? "with the belief of a side that can beat anyone" : f.label === "strong" ? "with quiet assurance" : f.label === "poor" ? "with belief at a low ebb" : f.label === "struggling" ? "with a point to prove" : "with cautious optimism"}, after taking ${f.points} points from a possible ${(f.wins + f.draws + f.losses) * 3} in their last ${f.wins + f.draws + f.losses}.`,
];

const FORM_GOAL_ATTACK: FormSentence[] = [
  (t, f) => `They have scored ${f.avgScored >= 1.5 ? "freely" : f.avgScored >= 1 ? "at a steady rate" : "with difficulty"} averaging ${f.avgScored.toFixed(1)} goals per game, while conceding ${f.avgConceded.toFixed(1)}.`,
  (t, f) => `With ${f.avgScored >= 1.5 ? `${f.scored} goals in their last ${f.wins + f.draws + f.losses}` : `${f.scored} goals from ${f.wins + f.draws + f.losses} matches`}, their attack has been ${f.avgScored >= 1.5 ? "a real threat" : "somewhat inconsistent"}, while defensively they have conceded ${f.avgConceded >= 1.5 ? "more than they would like" : "relatively few"} (${f.avgConceded.toFixed(1)} per game).`,
  (t, f) => `Their attacking output stands at ${f.scored} goals in ${f.wins + f.draws + f.losses} matches${f.cleanSheets > 0 ? `, and they have kept ${f.cleanSheets} clean sheet${f.cleanSheets > 1 ? "s" : ""} in that period` : ""}.`,
  (t, f) => `${f.scored} goals scored and ${f.conceded} conceded in their last ${f.wins + f.draws + f.losses} appearances point to a side that ${f.avgScored >= 1.5 ? "carries a genuine goal threat" : f.avgScored >= 1 ? "can generally find a way to score" : "often struggles to break teams down"}.`,
  (t, f) => `In front of goal, ${t} have ${f.avgScored >= 1.5 ? "been clinical and ruthless" : f.avgScored >= 1 ? "been dependable rather than dazzling" : "found chances hard to convert"}, netting ${f.scored} times while conceding ${f.conceded}.`,
  (t, f) => `Averaging ${f.avgScored.toFixed(1)} goals scored per game, ${t}'s attack has ${f.avgScored >= 1.5 ? "misfired rarely" : f.avgScored >= 1 ? "done enough to compete" : "produced too little"}; at the other end, ${f.avgConceded.toFixed(1)} goals per game have gone in.`,
];

const STREAK_SENTENCES: FormSentence[] = [
  (t, f) => `Notably, ${t} are on a ${f.streakLength}-match ${f.streakType === "W" ? "winning" : f.streakType === "L" ? "losing" : "unbeaten"} streak, which ${f.streakType === "W" ? "will fill them with belief" : "they will be desperate to end"} heading into this contest.`,
  (t, f) => `The momentum is ${f.streakType === "W" ? "firmly with" : "against"} ${t} right now — they have ${f.streakType === "W" ? "won" : f.streakType === "L" ? "lost" : "drawn"} their last ${f.streakLength} matches.`,
  (t, f) => `${t}'s recent run of ${f.streakLength} ${f.streakType === "W" ? "victories" : f.streakType === "L" ? "defeats" : "draws"} ${f.streakType === "W" ? "highlights their current momentum" : "will be a concern for the management"}.`,
  (t, f) => `${f.streakType === "W" ? `${t} will be riding a wave of momentum on their current ${f.streakLength}-game surge` : f.streakType === "L" ? `Stopping the rot of ${f.streakLength} straight defeats will be top of ${t}'s priority list` : `${t} will be eager to turn their run of ${f.streakLength} draws into something more tangible`}.`,
  (t, f) => `The recent sequence — ${f.streakType === "W" ? `${f.streakLength} consecutive wins` : f.streakType === "L" ? `${f.streakLength} losses on the trot` : `${f.streakLength} straight draws`} — ${f.streakType === "W" ? "gives this camp real momentum" : f.streakType === "L" ? "leaves this camp searching for solutions" : "underlines how finely balanced they currently are"}.`,
];

const FORM_GOAL_DEFENCE: FormSentence[] = [
  (t, f) => `Defensively, they have ${f.cleanSheets >= 2 ? "looked solid with multiple clean sheets" : "had mixed results"}, keeping ${f.cleanSheets} clean sheet${f.cleanSheets !== 1 ? "s" : ""} in their last ${f.wins + f.draws + f.losses}.`,
  (t, f) => `At the back, they have been ${f.cleanSheets >= 2 ? "difficult to break down" : "showing signs of vulnerability"}, conceding ${f.avgConceded.toFixed(1)} goals per game on average.`,
  (t, f) => `Behind the ball, ${t} have conceded ${f.conceded} goals in ${f.wins + f.draws + f.losses} matches, with ${f.cleanSheets} clean sheet${f.cleanSheets !== 1 ? "s" : ""} along the way.`,
  (t, f) => `The defensive numbers for ${t} read ${f.avgConceded.toFixed(1)} goals conceded per game — ${f.cleanSheets >= 2 ? "an encouraging level of stability" : "an area that could prove costly against dangerous attackers"}.`,
];
const FORM_FAILED_TO_SCORE: FormSentence[] = [
  (t, f) => `Worryingly for ${t}, they have drawn blanks in ${f.failedToScore} of their last ${f.wins + f.draws + f.losses} matches, a return that will need to improve against organised opposition.`,
  (t, f) => `Goalless afternoons have been a recurring issue for ${t}, who have failed to score ${f.failedToScore} times recently — breaking that habit will be crucial.`,
];
const FORM_TRANSITION = [
  (t: string) => `Turning to ${t}, their recent form paints a contrasting picture.`,
  (t: string) => `${t}, meanwhile, come into this with a different story to tell.`,
  (t: string) => `For ${t}, the picture is quite different.`,
  (t: string) => `As for ${t}, their recent results tell an interesting tale.`,
  (t: string) => `On the other side, ${t} have had a contrasting run of results.`,
  (t: string) => `Switching attention to ${t}, their form tells a rather different story.`,
  (t: string) => `${t} arrive with their own narrative, shaped by a set of results that pulls in another direction.`,
  (t: string) => `Now to ${t}, whose recent form offers a separate set of clues about how this one could play out.`,
];

const H2H_OPENERS = [
  (h: H2HSummary, home: string, away: string) => {
    if (h.recentMeetings === 0) return "The two sides have limited recent history to draw upon.";
    if (h.recentMeetings <= 2) return `The sides have met ${h.recentMeetings} time${h.recentMeetings > 1 ? "s" : ""} recently, with ${h.dominantSide === "home" ? home : h.dominantSide === "away" ? away : "neither side"} holding the edge.`;
    return `Looking at the head-to-head record, the last ${h.recentMeetings} meetings have produced ${h.homeWins} ${home} wins, ${h.awayWins} ${away} wins and ${h.draws} draws.`;
  },
  (h: H2HSummary, home: string, away: string) => {
    if (h.recentMeetings === 0) return "There is no recent head-to-head data to separate these sides.";
    return `In recent encounters between these sides, ${h.isOneSided ? `${h.dominantSide === "home" ? home : away} have dominated with ${h.dominantWins} wins` : "the results have been fairly evenly split"}, with ${h.homeWins} home wins, ${h.awayWins} away wins and ${h.draws} draws.`;
  },
  (h: H2HSummary, home: string, away: string) => {
    if (h.recentMeetings === 0) return "These teams have not crossed paths recently, making this something of a fresh encounter.";
    return `History between these two shows ${h.homeWins} home wins, ${h.awayWins} away wins and ${h.draws} draws from ${h.recentMeetings} meetings.`;
  },
  (h: H2HSummary, home: string, away: string) => {
    if (h.recentMeetings === 0) return "Finding historical comparisons between these sides is tricky, as they have not met recently.";
    if (h.isOneSided) return `The head-to-head ledger leans heavily towards ${h.dominantSide === "home" ? home : away}, who have won ${h.dominantWins} of the last ${h.recentMeetings} meetings.`;
    return `The recent head-to-head between ${home} and ${away} has been a competitive affair, with wins and draws traded in fairly equal measure.`;
  },
  (h: H2HSummary, home: string, away: string) => {
    if (h.recentMeetings === 0) return "With no recent meetings on record, this fixture carries an element of the unknown.";
    return `Over their last ${h.recentMeetings} meetings, ${h.homeWins} have ended in home victories, ${h.awayWins} in away victories and ${h.draws} in draws.`;
  },
];

const H2H_GOALS = [
  (h: H2HSummary) => `Goals have been ${h.avgGoals >= 3 ? "plentiful in these fixtures" : h.avgGoals >= 2 ? "at a reasonable level" : "hard to come by"}, with an average of ${h.avgGoals.toFixed(1)} per game.`,
  (h: H2HSummary) => `These meetings have ${h.avgGoals >= 3 ? "tended to produce plenty of goals" : h.avgGoals >= 2 ? "generally delivered a steady flow of goals" : "often been tight affairs"}, averaging ${h.avgGoals.toFixed(1)} goals per match.`,
  (h: H2HSummary) => `With ${h.totalGoals} goals in ${h.recentMeetings} games (${h.avgGoals.toFixed(1)} per match), the fixture has ${h.avgGoals >= 3 ? "a reputation for entertainment" : "tended to be more measured"}.`,
  (h: H2HSummary) => `The fixture has averaged ${h.avgGoals.toFixed(1)} goals per meeting, with ${h.avgGoals >= 3 ? "goals rarely in short supply" : h.avgGoals >= 2 ? "a decent amount of goalmouth action" : "scoring at a genuine premium"}.`,
  (h: H2HSummary) => `${h.recentMeetings} recent meetings have produced ${h.totalGoals} goals in total, underlining that this tie tends to be ${h.avgGoals >= 3 ? "an open, adventurous affair" : h.avgGoals >= 2 ? "a reasonably lively fixture" : "a tight, cagey contest"}.`,
];
const TACTICAL_HIGH_SCORING = [
  (h: string, a: string, hf: FormSummary) => `With both teams averaging over ${Math.max(hf.avgScored, 0).toFixed(1)} goals per game recently, this fixture has the hallmarks of an open, entertaining contest. The attacking quality on both sides suggests we could see goals at both ends.`,
  (h: string, a: string) => `Given the attacking firepower on display, this could be a high-scoring affair. Both sides have shown they can find the net regularly, and the defensive records suggest opportunities will come.`,
  (h: string, a: string) => `The statistics point towards an open game here. Both teams have been involved in matches with plenty of goalmouth action recently, and the tactical setup suggests a similar pattern could emerge.`,
  (h: string, a: string) => `Expect attacking ambition here: both sides have regularly found the net, and each will back themselves to outscore the other. It could take several goals to settle this fixture.`,
  (h: string, a: string) => `The form figures point toward goals. With both teams averaging above a goal a game, neither defence looks built to silence the other's attack — a lively, multi-goal afternoon feels on the cards.`,
];

const TACTICAL_DEFENSIVE = [
  (h: string, a: string) => `Both defences have been relatively solid recently, which could make this a tight contest where chances are at a premium. The midfield battle will likely be decisive in such a close encounter.`,
  (h: string, a: string) => `With both teams showing defensive organisation recently, this could be a game where patience and discipline are rewarded. Set pieces and individual moments may prove decisive.`,
  (h: string, a: string) => `This has the feel of a closely contested match where goals may be hard to come by. The team that can break the deadlock will be in a strong position to control the game.`,
  (h: string, a: string) => `Low-scoring games have been something of a theme for both sides recently, and this meeting could follow suit. Keeping it tight for sixty minutes could leave one moment of quality to decide it.`,
  (h: string, a: string) => `With both teams conceding precious little of late, this promises to be a tactical chess match in which the first goal — if it comes — could carry enormous weight.`,
];

const TACTICAL_MIXED = [
  (h: string, a: string, hf: FormSummary, af: FormSummary) => `${hf.avgScored >= 1.5 ? h : a} have been the more prolific side in front of goal recently, but ${hf.avgConceded <= 1 ? h : a} boast the stronger defensive record. The contrasting styles could make for a fascinating tactical battle.`,
  (h: string, a: string, hf: FormSummary, af: FormSummary) => `The key battle could be between ${h}'s ${hf.avgScored >= 1.5 ? "attacking threat" : "defensive resilience"} and ${a}'s ${af.avgScored >= 1.5 ? "attacking threat" : "defensive resilience"}. Whichever side imposes their style early could gain a crucial advantage.`,
  (h: string, a: string) => `Tactically, this promises to be an intriguing contest. The midfield battle will be crucial, and the team that can control the tempo of the game will likely emerge victorious.`,
  (h: string, a: string, hf: FormSummary, af: FormSummary) => `There is a clear stylistic mismatch at play: ${hf.avgScored >= 1.5 ? `${h} like to attack with purpose` : `${h} prioritise defensive security`}, while ${af.avgScored >= 1.5 ? `${a} carry their own attacking threat` : `${a} lean on defensive organisation`}. How that clash resolves could decide everything.`,
  (h: string, a: string, hf: FormSummary) => `One side arrives in better attacking form, the other may need to absorb pressure and strike on the break. The opening quarter-hour could hint at how this tactical battle will unfold.`,
];

const TACTICAL_FAVOURITE = [
  (f: string, u: string) => `${f} will look to assert their authority early and put pressure on ${u}'s defence. If they can convert their dominance into goals, it could be a long afternoon for the visitors.`,
  (f: string, u: string) => `${f} will be expected to take the initiative, but ${u} have shown they can be dangerous on the counter. The dynamic between attack and defence will shape the narrative.`,
  (f: string, u: string) => `As the stronger side on paper, ${f} will want to dictate proceedings. However, ${u} will be well aware of the threat they pose and may look to frustrate and hit on the break.`,
  (f: string, u: string) => `${f} will sense an opportunity to stamp their authority on this game early, knowing that an early goal could force ${u} to take risks they would rather avoid.`,
  (f: string, u: string) => `The onus will be on ${f} to make the running, while ${u} can play without the weight of expectation. Patience will be key for the favourites against a side set up to frustrate.`,
];

const TACTICAL_EVEN = [
  (h: string, a: string) => `This is a difficult one to call, with both sides evenly matched on recent form. The game could hinge on a single moment of quality or a defensive lapse.`,
  (h: string, a: string) => `With little to separate these sides, the match could go either way. The team that handles the pressure better and makes fewer mistakes will likely come out on top.`,
  (h: string, a: string) => `Expect a closely fought contest between two evenly matched sides. The result may well come down to which team is more clinical in the final third.`,
  (h: string, a: string) => `Form and personnel are remarkably balanced heading into this one, and the margin between the sides could be razor-thin. Fresh legs from the bench could prove pivotal in the closing stages.`,
  (h: string, a: string) => `With nothing substantive separating these two on paper, a draw would surprise no one — but neither will either side be content with sharing the points. The first goal, again, looks decisive.`,
];

const PREDICTION_OPENERS = [
  (h: string, a: string, hf: FormSummary, af: FormSummary, h2h: H2HSummary) => {
    const diff = hf.points - af.points;
    if (diff >= 6) return `All signs point towards a home advantage here, with ${h} in notably stronger form than their opponents.`;
    if (diff <= -6) return `Despite being away from home, ${a} come into this with the stronger recent record and will fancy their chances.`;
    if (h2h.isOneSided && h2h.dominantWins >= 3) return `The head-to-head record strongly favours ${h2h.dominantSide === "home" ? h : a}, which could play a psychological role in this fixture.`;
    return `This is a genuinely difficult fixture to call, with both sides having their strengths and weaknesses.`;
  },
  (h: string, a: string, hf: FormSummary, af: FormSummary) => {
    const diff = hf.points - af.points;
    if (diff >= 6) return `${h} will be confident of continuing their strong run, and the statistics suggest they have the edge here.`;
    if (diff <= -6) return `${a} will travel with belief given their recent results, and they will back themselves to get a positive result.`;
    return `With both sides showing flashes of quality, this could go either way. The team that executes their game plan better will prevail.`;
  },
  (h: string, a: string) => `Fans can expect a competitive match with plenty at stake. The first goal could be crucial in shaping how the game unfolds.`,
  (h: string, a: string, hf: FormSummary, af: FormSummary) => {
    const diff = hf.points - af.points;
    if (diff >= 6) return `${h} hold a significant form advantage on paper, and the numbers make them the ones to beat here.`;
    if (diff <= -6) return `${a} bring the superior current form to this fixture, and the numbers suggest they can leave with something meaningful.`;
    return `Neither side can be written off, given how close their recent returns have been — it is a genuine coin-flip.`;
  },
  (h: string, a: string, hf: FormSummary, af: FormSummary, h2h: H2HSummary) => {
    const diff = hf.points - af.points;
    if (diff >= 6) return `The form table points one way, with ${h} looking well placed to extend their momentum.`;
    if (diff <= -6) return `The form table points one way, and it favours ${a}, who will back themselves to make home advantage count for little.`;
    if (h2h.isOneSided && h2h.dominantWins >= 3) return `Recent meetings between these sides have followed a one-sided pattern, and history may weigh heavily on ${h2h.dominantSide === "home" ? h : a}'s chances.`;
    return `This could genuinely go either way, with neither side holding an obvious edge on recent evidence.`;
  },
];

const PREDICTION_CLOSERS: PredictionCloserSentence[] = [
  (comp) => `Kick-off in the ${comp} awaits.`,
  (comp) => `All eyes turn to the ${comp} when this one gets under way.`,
  (comp) => `The stage is set in the ${comp}; kick-off cannot come soon enough.`,
  (comp) => `Whatever unfolds, this ${comp} contest is not to be missed.`,
];
// ─── Main NLG generation function (no AI, no API calls) ────────────────

export function generateNlgAnalysis(
  homeTeam: string, awayTeam: string, competition: string,
  homeForm: TeamForm, awayForm: TeamForm, headToHead: HeadToHeadMatch[]
): string {
  const seed = seededHash(homeTeam, awayTeam, competition);
  const hf = analyzeForm(homeForm);
  const af = analyzeForm(awayForm);
  const h2h = analyzeH2H(headToHead);
  const paragraphs: string[] = [];

  // Paragraph 1: Home team form
  const p1: string[] = [];
  p1.push(pick(FORM_OPENERS, seed, 0)(homeTeam, hf));
  if (hf.avgScored > 0 || hf.avgConceded > 0) {
    p1.push(pick(FORM_GOAL_ATTACK, seed, 1)(homeTeam, hf));
  }
  if (hf.isStreak) {
    p1.push(pick(STREAK_SENTENCES, seed, 2)(homeTeam, hf));
  }
  if (hf.cleanSheets > 0 && hf.avgConceded < 1.5) {
    p1.push(pick(FORM_GOAL_DEFENCE, seed, 3)(homeTeam, hf));
  }
  if (hf.failedToScore >= 2 && hf.avgScored < 1.5) {
    p1.push(pick(FORM_FAILED_TO_SCORE, seed, 17)(homeTeam, hf));
  }
  paragraphs.push(p1.join(" "));

  // Paragraph 2: Away team form + H2H
  const p2: string[] = [];
  p2.push(pick(FORM_TRANSITION, seed, 4)(awayTeam));
  p2.push(pick(FORM_OPENERS, seed, 5)(awayTeam, af));
  if (af.avgScored > 0 || af.avgConceded > 0) {
    p2.push(pick(FORM_GOAL_ATTACK, seed, 6)(awayTeam, af));
  }
  if (af.isStreak) {
    p2.push(pick(STREAK_SENTENCES, seed, 7)(awayTeam, af));
  }
  if (af.failedToScore >= 2 && af.avgScored < 1.5) {
    p2.push(pick(FORM_FAILED_TO_SCORE, seed, 18)(awayTeam, af));
  }
  if (h2h.recentMeetings > 0) {
    p2.push(pick(H2H_OPENERS, seed, 8)(h2h, homeTeam, awayTeam));
    p2.push(pick(H2H_GOALS, seed, 9)(h2h));
  }
  paragraphs.push(p2.join(" "));

  // Paragraph 3: Tactical analysis
  const p3: string[] = [];
  const totalAvg = hf.avgScored + af.avgScored;
  const homeStronger = hf.points > af.points + 3;
  const awayStronger = af.points > hf.points + 3;
  if (totalAvg >= 3) {
    p3.push(pick(TACTICAL_HIGH_SCORING, seed, 10)(homeTeam, awayTeam, hf));
  } else if (totalAvg <= 1.5) {
    p3.push(pick(TACTICAL_DEFENSIVE, seed, 11)(homeTeam, awayTeam));
  } else {
    p3.push(pick(TACTICAL_MIXED, seed, 12)(homeTeam, awayTeam, hf, af));
  }
  if (homeStronger) {
    p3.push(pick(TACTICAL_FAVOURITE, seed, 13)(homeTeam, awayTeam));
  } else if (awayStronger) {
    p3.push(pick(TACTICAL_FAVOURITE, seed, 14)(awayTeam, homeTeam));
  } else {
    p3.push(pick(TACTICAL_EVEN, seed, 15)(homeTeam, awayTeam));
  }
  paragraphs.push(p3.join(" "));

  // Paragraph 4: Prediction / outlook
  const p4: string[] = [];
  p4.push(pick(PREDICTION_OPENERS, seed, 16)(homeTeam, awayTeam, hf, af, h2h));
  const ptsDiff = Math.abs(hf.points - af.points);
  if (ptsDiff >= 6) {
    p4.push("The form guide points clearly in one direction, but football has a habit of defying expectations.");
  } else if (ptsDiff >= 3) {
    p4.push("The team in better form holds a slight edge, but this is far from a foregone conclusion.");
  } else {
    p4.push("With so little to separate these sides, it could come down to which team wants it more on the day.");
  }
  p4.push(pick(PREDICTION_CLOSERS, seed, 19)(competition));
  paragraphs.push(p4.join(" "));

  return paragraphs.join("\n\n");
}
