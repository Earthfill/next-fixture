// ---------------------------------------------------------------------------
// Types — All shared interfaces for the football data layer
// ---------------------------------------------------------------------------

export interface Team { id: string; name: string; shortName: string; logo: string; color?: string; }
export interface Venue { name: string; city: string; capacity?: number; }

export interface Fixture {
  id: string; slug: string; homeTeam: Team; awayTeam: Team;
  competition: string; competitionLogo?: string; venue: Venue;
  date: string; status: "upcoming" | "live" | "finished";
  score?: { home: number; away: number }; matchday?: number;
}

export interface HeadToHeadMatch {
  date: string; homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number; competition: string;
}

export interface TeamForm {
  teamName: string;
  results: ("W" | "D" | "L")[];
  recentMatches: {
    opponent: string;
    result: "W" | "D" | "L";
    score: string;
    competition?: string;
    extratime?: { home: number | null; away: number | null };
    penalty?: { home: number | null; away: number | null };
  }[];
}

export interface LeagueStanding {
  position: number; team: Team; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
  form: ("W" | "D" | "L")[];
}

export interface SeasonStats {
  matchesPlayed: number; wins: number; draws: number; losses: number;
  goalsScored: number; goalsConceded: number; cleanSheets: number;
  avgGoalsScored: number; avgGoalsConceded: number;
}

export interface PlayerNews { name: string; status: "injured" | "doubtful" | "suspended" | "returning"; reason?: string; }

export interface PredictionData {
  predictedScore: { home: number; away: number };
  confidence: number; tip: string;
  winProbability: { home: number; draw: number; away: number };
  btts: { yes: number; no: number };
  overUnder: { over: number; under: number };
}

export interface MatchPreview {
  fixture: Fixture; homeForm: TeamForm; awayForm: TeamForm;
  headToHead: HeadToHeadMatch[]; analysis?: string;
  analysisSource?: "ai" | "nlg" | "template";
  homeNews?: PlayerNews[]; awayNews?: PlayerNews[];
  prediction?: PredictionData;
}

export interface LeagueData {
  league: { name: string; slug: string; logo: string };
  standings: LeagueStanding[]; upcomingFixtures: Fixture[];
}

export interface FixtureGroup {
  competition: string; competitionLogo: string; competitionSlug: string; fixtures: Fixture[];
}

export interface MatchdayGroup {
  date: string; label: string; slug: string; fixtureCount: number; leagues: FixtureGroup[];
}

// ─── Internal types (not exported) ───────────────────────────────────

export interface TeamRecord { id: number; name: string; shortName: string; logo: string; color?: string; }
export interface StandingRecord { position: number; teamId: number; teamName?: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; form: string[]; }
export interface FormRecord { results: string[]; recentMatches: { opponent: string; result: string; score: string }[]; }
export interface H2HRecord { date: string; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; competition: string; }

export interface TopScorer {
  position: number;
  player: { name: string; nationality?: string; position?: string };
  team: Team;
  goals: number;
  assists?: number;
  penalties?: number;
  appearances?: number;
}

// ─── Odds Types ──────────────────────────────────────────────────────

export interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  market: OddsMarket;
  affiliateUrl?: string;
}

export interface FixtureOdds {
  id: string;
  sportKey: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookmakers: Bookmaker[];
}

export interface AffiliateConfig {
  key: string;
  name: string;
  logo: string;
  baseUrl: string;
  affParam: string;
  affValue: string;
  clickValue?: string;
}
// ─── Lineup Types ─────────────────────────────────────────────────

export interface LineupPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
  grid: string | null;
}

export interface LineupTeamColors {
  player: { primary: string; number: string; border: string };
  goalkeeper: { primary: string; number: string; border: string };
}

export interface LineupCoach {
  id: number;
  name: string;
  photo: string;
}

export interface LineupTeam {
  id: number;
  name: string;
  logo: string;
  colors: LineupTeamColors;
}

export interface LineupEntry {
  team: LineupTeam;
  formation: string;
  startXI: { player: LineupPlayer }[];
  substitutes: { player: LineupPlayer }[];
  coach: LineupCoach;
  predicted?: boolean; // NEW
}
// ─── Lineup Prediction Types ────────────────────────────────────────

export interface ConfirmedLineupFixture {
  fixtureId: number;
  formation: string;
  startXI: { player: { id: number; name: string; number: number; pos: string } }[];
}

export interface PredictedPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
  grid: string | null;
  recentStarts: number;
  recentTotal: number;
}

export interface PredictedLineup {
  formation: string;
  startXI: PredictedPlayer[];
  substitutes: PredictedPlayer[];
  confidence: "high" | "medium" | "low";
  basedOnFixtures: number[];
}

export interface SquadPlayerWithRating {
  id: number;
  name: string;
  number: number;
  pos: string;
  rating?: number;
}

// ─── Prediction Availability Types ─────────────────────────────────

export type AvailabilityTier = "confirmed_unavailable" | "possibly_unavailable" | "available";

export interface PlayerSeasonStats {
  playerId: number;
  appearances: number;
  minutes: number;
  teamId: number;
}

export interface FixtureEvent {
  fixtureId: number;
  playerId: number;
  playerName: string;
  type: string; // "Card" | "Goal" | "subst" etc.
  detail: string; // "Red Card" | "Yellow Card" etc.
}

// ─── Video Highlights Types ──────────────────────────────────────────────

export interface HighlightVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  publishedAt: string;
}