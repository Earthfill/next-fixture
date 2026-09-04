// ---------------------------------------------------------------------------
// Data fetchers — thin adapters that turn service/API calls into cacheable
// units. Used by the API routes (as the cache-miss fetcher) and the cron jobs
// (to pre-warm the caches).
// ---------------------------------------------------------------------------

import type { Fixture, LeagueData } from "@/lib/types";
import {
  fetchFixturesForRange,
  fetchLiveMatches,
  getLeagueStandings,
} from "@/lib/football/service";

/** Nagging-normalize helper: "2026-09-04" style date string from a Date. */
export function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Fetch fixtures for a single day (optionally scoped to one league slug). */
export function fetchFixtures(date: string, leagueSlug?: string): Promise<Fixture[]> {
  return fetchFixturesForRange(date, date, leagueSlug);
}

/** Fetch league standings (includes the league + upcoming fixtures). */
export function fetchStandings(leagueSlug: string): Promise<LeagueData | null> {
  return getLeagueStandings(leagueSlug);
}

/** Fetch currently-live matches from API-Football. */
export function fetchLive(): Promise<Fixture[]> {
  return fetchLiveMatches();
}