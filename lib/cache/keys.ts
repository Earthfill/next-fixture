// ---------------------------------------------------------------------------
// Cache keys & TTLs - shared by the cache-aside layer, API routes and jobs
// ---------------------------------------------------------------------------

import { siteToday } from "@/lib/dates";

// Dynamic Time-To-Live (seconds)
export const TTL = {
  fixtures: 24 * 60 * 60, // 24h - schedules / leagues
  standings: 24 * 60 * 60, // 24h - league tables
  preview: 24 * 60 * 60, // 24h - match previews
  lineups: 24 * 60 * 60, // 24h - lineups
  odds: 24 * 60 * 60, // 24h - odds
} as const;

// Granular cache keys
export function fixturesKey(date: string, leagueSlug?: string): string {
  return leagueSlug ? `fixtures:${date}:${leagueSlug}` : `fixtures:${date}`;
}

// Number of days the homepage's "upcoming fixtures" window covers. Shared by
// the cached page adapter (lib/cache/pages.ts) and the midnight cron prefetch
// (lib/jobs/midnight-fixtures.ts) so both read/write the exact same key — and
// the homepage never has to fire its own multi-league API fetch.
export const UPCOMING_DAYS = 3;

export function upcomingFixturesKey(days: number = UPCOMING_DAYS): string {
  return `fixtures:upcoming:${days}:${siteToday()}`;
}

export function standingsKey(leagueSlug: string): string {
  return `standings:${leagueSlug}`;
}