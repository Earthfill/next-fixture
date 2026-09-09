// ---------------------------------------------------------------------------
// Frontend-facing cached adapters — server components call THESE.
// ---------------------------------------------------------------------------
// This is the "call the backend" layer for the React/Next frontend. Every
// function wraps the raw service function (which hits API-Football) in the
// SAME cache-aside layer that the /api/v1/* routes use:
//
//    frontend page →  lib/cache/pages.ts →  cache-aside (Redis → PG → mem → API)
//
// Cache keys are SHARED with the public API routes (e.g. standings:<slug> is
// served from the exact same entry point), so a page visit and an /api/v1
// request populate/cool each other's cache.
//
// NOTE: server-only module. Client components keep using @/lib/sports-api
// (this module pulls in ioredis/pg, which must never enter the client bundle).

import { cacheAside, writeCache } from "@/lib/cache";
import { standingsKey, upcomingFixturesKey, UPCOMING_DAYS, TTL } from "@/lib/cache/keys";
import { filterHidden, isSlugHidden } from "@/lib/hidden-fixtures";
import type {
  Fixture, LeagueData, MatchdayGroup, MatchPreview, TopScorer, LineupEntry, Team, HighlightVideo,
} from "@/lib/types";
import {
  getUpcomingFixtures as getUpcomingFixturesRaw,
  buildAvailableMatchdays,
  buildMatchdayGroup,
  getLeagueStandings as getLeagueStandingsRaw,
  getTopScorers as getTopScorersRaw,
  getTopAssists as getTopAssistsRaw,
  getPastResults as getPastResultsRaw,
  getMatchPreviewBySlug as getMatchPreviewBySlugRaw,
  getTeamUpcomingFixtures as getTeamUpcomingFixturesRaw,
} from "@/lib/football/service";
import { getFixtureLineups as getFixtureLineupsRaw } from "@/lib/football/lineups";
import { getFixtureOdds as getFixtureOddsRaw } from "@/lib/football/odds";
import { getYouTubeHighlights as getYouTubeHighlightsRaw } from "@/lib/football/highlights";

/** Upcoming fixtures across all covered leagues (24h). Hidden matches excluded. */
export async function getUpcomingFixtures(value?: number): Promise<Fixture[]> {
  const days = value ?? UPCOMING_DAYS;
  const { data } = await cacheAside<Fixture[]>(
    upcomingFixturesKey(days),
    TTL.fixtures,
    () => getUpcomingFixturesRaw(days).then((r) => r ?? [])
  );
  return filterHidden(data ?? []);
}

/**
 * Fresh upcoming fixtures, bypassing the cache-aside layer (admin use).
 * Fetches straight from the API so the admin table always reflects reality
 * (newly added fixtures, finished matches dropping off, status changes).
 * The fresh list is written back into the shared cache (when non-empty) so the
 * public site serves the same updated data instead of a stale 24h snapshot.
 */
export async function getUpcomingFixturesFresh(): Promise<Fixture[]> {
  const fixtures = await getUpcomingFixturesRaw(UPCOMING_DAYS).then((r) => r ?? []);
  if (fixtures.length > 0) {
    await writeCache(upcomingFixturesKey(UPCOMING_DAYS), fixtures, TTL.fixtures);
  }
  // Matches whose kickoff has already passed are dropped. Their admin
  // overrides expire at kickoff (the read path filters `expires_at > now()`),
  // so letting an admin "edit" them writes a silently-invisible override — the
  // exact "saved but the preview didn't update" bug.
  const nowMs = Date.now();
  return fixtures.filter((f) => new Date(f.date).getTime() > nowMs);
}

/**
 * Available matchdays for the homepage (24h). Derived from the SAME cached
 * upcoming-fixtures list the cron prefetches — so the homepage no longer fires
 * its own multi-league API calls (and can't get stuck empty for 24h).
 */
export async function getAvailableMatchdays(): Promise<{ date: string; label: string; slug: string; fixtureCount: number }[]> {
  return buildAvailableMatchdays(await getUpcomingFixtures());
}

/** Fixtures for one date, grouped by league (24h). */
export async function getFixturesByDateGroupedByLeague(date?: string): Promise<MatchdayGroup | null> {
  return buildMatchdayGroup(await getUpcomingFixtures(), date);
}

/** League standings + upcoming fixtures (12h — SHARED key with /api/v1/standings). */
export async function getLeagueStandings(leagueSlug: string): Promise<LeagueData | null> {
  const { data } = await cacheAside<LeagueData | null>(
    standingsKey(leagueSlug),
    TTL.standings,
    () => getLeagueStandingsRaw(leagueSlug)
  );
  if (!data) return null;
  if (data.upcomingFixtures && data.upcomingFixtures.length > 0) {
    return {
      ...data,
      upcomingFixtures: await filterHidden(data.upcomingFixtures),
    };
  }
  return data;
}

/** Top scorers for a league (24h. */
export async function getTopScorers(leagueSlug: string, limit?: number): Promise<TopScorer[]> {
  const lim = limit ?? 10;
	
  const { data } = await cacheAside<TopScorer[]>(
    `topscorers:${leagueSlug}:${lim}`,
    TTL.fixtures,
    () => getTopScorersRaw(leagueSlug, lim).then((r) => r ?? [])
  );
	
  return data ?? [];
}

/** Top assists for a league (\24h. */
export async function getTopAssists(leagueSlug: string, limit?: number): Promise<TopScorer[]> {
  const lim = limit ??  ​10;
  const { data } = await cacheAside<TopScorer[]>(
    `topassists:${leagueSlug}:${lim}`,
    TTL.fixtures,
    () => getTopAssistsRaw(leagueSlug, lim).then((r) => r ?? [])
  );
  return data ?? [];
}

/** Recent completed matches for a league (12h). Hidden matches excluded. */
export async function getPastResults(leagueSlug: string, limit?: number): Promise<Fixture[]> {
  const lim = limit ?? 10;
  const { data } = await cacheAside<Fixture[]>(
    `pastresults:${leagueSlug}:${lim}`,
    TTL.standings,
    () => getPastResultsRaw(leagueSlug, lim).then((r) => r ?? [])
  );

  return filterHidden(data ?? []);
}

/**
 * Full match preview payload (~8-10 upstream calls; 10m TTL). Hidden matches
 * resolve to null so their preview page 404s on the public site.
 */
export async function getMatchPreviewBySlug(slug: string): Promise<MatchPreview | null> {
  if (await isSlugHidden(slug)) return null;
  const { data } = await cacheAside<MatchPreview | null>(
    `preview:${slug}`,
    TTL.preview,
    () => getMatchPreviewBySlugRaw(slug)
  );
	return data ?? null;
}

/** Upcoming fixtures for one team (24h). Hidden matches excluded. */
export async function getTeamUpcomingFixtures(teamId: number, count?: number): Promise<Fixture[]> {
  const c = count ?? 5;

  const { data } = await cacheAside<Fixture[]>(
    `teamupcoming:${teamId}:${c}`,
    TTL.fixtures,
    () => getTeamUpcomingFixturesRaw(teamId, c).then((r) => r ?? [])
  );

  return filterHidden(data ?? []);
}

/** Lineups for a fixture (confirmed + predicted fallback; 10m TTL. */
export async function getFixtureLineups(
  fixtureId: string | number,
  context?: { homeTeam: Team; awayTeam: Team }
): Promise<LineupEntry[]> {
  const { data } = await cacheAside<LineupEntry[]>(
    `lineups:${fixtureId}`,
    TTL.lineups,
    () => getFixtureLineupsRaw(fixtureId, context).then((r) => r ?? [])
  );
	
  return data ?? [];
}

/** Odds for a fixture (24h). */
export async function getFixtureOdds(
  fixtureId: string | number,
  homeTeam: string,
  awayTeam: string
): Promise<Awaited<ReturnType<typeof getFixtureOddsRaw>>> {
  const { data } = await cacheAside<Awaited<ReturnType<typeof getFixtureOddsRaw>>>(
    `odds:${fixtureId}`,
    TTL.odds,
    () => getFixtureOddsRaw(fixtureId, homeTeam, awayTeam)
  );
  return data ?? ([] as Awaited<ReturnType<typeof getFixtureOddsRaw>>);
}

/** YouTube highlights for a fixture — cached 24h (Redis → PG → mem). */
export async function getYouTubeHighlights(
  homeTeam: string,
  awayTeam: string,
  competition: string,
  date: string,
  maxResults: number = 3
): Promise<HighlightVideo[]> {
  const key = [
    "youtube:highlights",
    cacheKeyPart(homeTeam),
    cacheKeyPart(awayTeam),
    cacheKeyPart(competition),
    (date || "").split("T")[0],
    maxResults,
  ].join(":");
  const { data } = await cacheAside<HighlightVideo[]>(
    key,
    TTL.fixtures,
    () => getYouTubeHighlightsRaw(homeTeam, awayTeam, competition, date, maxResults)
  );
  return data ?? [];
}

/** Normalize a free-text term into a stable, URL-safe cache-key segment. */
function cacheKeyPart(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}