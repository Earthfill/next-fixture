// ---------------------------------------------------------------------------
// Cache keys & TTLs - shared by the cache-aside layer, API routes and jobs
// ---------------------------------------------------------------------------

// Dynamic Time-To-Live (seconds)
export const TTL = {
  fixtures: 24 * 60 * 60, // 24h - schedules / leagues
  standings: 24 * 60 * 60, // 24h - league tables
  live: 60 * 60, // 1h - active live matches
  preview: 24 * 60 * 60, // 24h - match previews
  lineups: 24 * 60 * 60, // 24h - lineups
  odds: 24 * 60 * 60, // 24h - odds
} as const;

// Granular cache keys
export function fixturesKey(date: string, leagueSlug?: string): string {
  return leagueSlug ? `fixtures:${date}:${leagueSlug}` : `fixtures:${date}`;
}

export function standingsKey(leagueSlug: string): string {
  return `standings:${leagueSlug}`;
}

export function liveKey(): string {
  return "live:all";
}

// Sentinel used to remember "we have seen live matches recently" so the
// live-poll job can gate its API calls without hitting API-Football.
export function liveActiveKey(): string {
  return "live:active";
}