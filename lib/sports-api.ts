// ---------------------------------------------------------------------------
// Sports Data Service Layer — Public API facade
// ---------------------------------------------------------------------------
// Imports from specialized modules. This file only exports.
// ---------------------------------------------------------------------------

export type {
  Team, Venue, Fixture, HeadToHeadMatch, TeamForm,
  LeagueStanding, SeasonStats, PlayerNews, PredictionData,
  MatchPreview, LeagueData, FixtureGroup, MatchdayGroup, TopScorer,
  FixtureOdds, Bookmaker, OddsOutcome, OddsMarket, AffiliateConfig,
  LineupEntry, LineupPlayer, HighlightVideo,
} from "@/lib/types";

export {
  getUpcomingFixtures,
  getMatchPreviewBySlug,
  getHeadToHead,
  getLeagueStandings,
  getAvailableMatchdays,
  getFixturesByDateGroupedByLeague,
  getTopScorers,
  getTopAssists,
  getPastResults,
  getTeamUpcomingFixtures,
} from "@/lib/football/service";

export {
  getFixtureOdds,
  getFallbackOdds,
  buildAffiliateUrl,
  AFFILIATES,
} from "@/lib/football/odds";

export {
  getFixtureLineups,
} from "@/lib/football/lineups";

export {
  getPredictedLineup,
  invalidateCache as invalidateLineupCache,
  clearAllCache as clearLineupCache,
} from "@/lib/lineup-service";

export {
  getTeamFixtures,
  getFixtureLineup,
  getTeamInjuries,
  getTeamSquad,
  getTeamCoach,
  getFixtureEvents,
  getPlayerStats,
} from "@/lib/football-api";

export {
  predictLineup,
} from "@/lib/predict-lineup";

export {
  getYouTubeHighlights,
} from "@/lib/football/highlights";
