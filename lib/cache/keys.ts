// ---------------------------------------------------------------------------
// Cache keys & TTLs - shared by the cache-aside layer, API routes and jobs
// ---------------------------------------------------------------------------

// Dynamic Time-To-Live (seconds)
export const TTL = {
  fixtures: 24 * 60 * 60, // 24h - schedules / leagues
  standings: 12 * 60 * 60, // 12h - league tables
  live: 30, // 30s - active live matches
  preview: 600, // 10m - match previews (~8-10 upstream calls each!)
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