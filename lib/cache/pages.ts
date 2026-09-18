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

import { cacheAside, writeCache, peekCache, invalidateCache } from "@/lib/cache";
import { predictionReviewKey, standingsKey, upcomingFixturesKey, UPCOMING_DAYS, TTL } from "@/lib/cache/keys";
import { getHiddenSlugs, isSlugHidden } from "@/lib/hidden-fixtures";
import { getAdminOverride, getOverrideMap, type AdminOverride } from "@/lib/admin-overrides";
import { evaluatePrediction } from "@/lib/prediction-review";
import { normalizeSlug } from "@/lib/football/config";

/** Canonical fixture slug used for cache keys (ASCII-safe, matches generateSlug). */
function canonicalSlug(slug: string): string {
  return normalizeSlug(slug);
}
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
import { getTeamRecentResults as getTeamRecentResultsRaw, getTeamHeadToHeadByIds as getTeamHeadToHeadByIdsRaw } from "@/lib/football/service";
import { getTeamSquad as getTeamSquadRaw, getTeamInjuries as getTeamInjuriesRaw } from "@/lib/football-api";
import { computePrediction } from "@/lib/football/win-probability";
import { generateNlgAnalysis } from "@/lib/football/nlg-analysis";
import { computeRoundGoalStats } from "@/lib/football/round-stats";
import type { SquadPlayerWithRating } from "@/lib/types";

/**
 * Public visibility gate for fixture lists. Returns only items that should be
 * visible to site visitors:
 *   - manually hidden matches are always dropped, and
 *   - matches flagged for admin review are dropped unless they have already
 *     been reviewed (an admin override counts as "reviewed").
 */
export async function filterPublicVisible<T extends { slug?: string }>(items: T[]): Promise<T[]> {
  if (!items || items.length === 0) return items;
  const slugs = items.map((i) => i.slug).filter((s): s is string => Boolean(s));
  if (slugs.length === 0) return items;

  // ONE batched store read each. The override VALUES are needed here (the review
  // gate below compares the effective tip/scoreline), and reading them per
  // fixture costs hundreds of round trips per listing render.
  const [manualHidden, overrideMap] = await Promise.all([
    getHiddenSlugs(),
    getOverrideMap(slugs),
  ]);
  // `getOverrideMap` keys the map by canonicalSlug, but `item.slug` from the
  // cached fixture list can be the RAW (un-normalized) form — e.g. accented
  // team names that normalize to ASCII. Add BOTH forms for every slug that
  // ACTUALLY has an override, so a raw slug still resolves to its override.
  // (This must iterate `overrideMap.keys()`, NOT the input `slugs` — otherwise
  // every fixture would look overridden and the review gate below would never
  // hide a flagged match.)
  const overriddenSet = new Set<string>();
  for (const s of overrideMap.keys()) {
    overriddenSet.add(canonicalSlug(s));
    overriddenSet.add(s);
  }

  // The review gate below must ALWAYS run, including when PostgreSQL just had a
  // transient blip. `pgAvailable()` flips to false for a 30s cooldown after any
  // pool-saturation/connection failure (see postgres.ts), and skipping the gate
  // in that window re-publishes every review-flagged match on the public site —
  // exactly the "hidden in admin but still on the homepage" bug. The review
  // lookup reads ONLY cached data (Redis/PG preview + predreview entries) and
  // never fires an upstream API call, so it is safe and cheap in every state.
  // (Overrides are still resolved via the batched map above; if PG was down the
  // map may be empty, and a not-yet-reviewed match staying hidden is the
  // conservative, correct default.)
  const reviewBySlug = await getPredictionReviews(slugs, overrideMap);

  return items.filter((item) => {
    if (!item.slug) return true;
    const key = canonicalSlug(item.slug);
    if (manualHidden.has(key)) return false;
    // Flagged for admin review but not yet reviewed (no override) → hidden by
    // default until an admin actually reviews/edits it.
    if (!overriddenSet.has(key) && reviewBySlug.get(key)?.flagged) return false;
    return true;
  });
}

/** Upcoming fixtures across all covered leagues (24h). Hidden + pending-review matches excluded. */
export async function getUpcomingFixtures(value?: number): Promise<Fixture[]> {
  const days = value ?? UPCOMING_DAYS;
  const { data } = await cacheAside<Fixture[]>(
    upcomingFixturesKey(days),
    TTL.fixtures,
    () => getUpcomingFixturesRaw(days).then((r) => r ?? [])
  );
  return filterPublicVisible(data ?? []);
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
      upcomingFixtures: await filterPublicVisible(data.upcomingFixtures),
    };
  }
  return data;
}

/** Top scorers for a league (24h. */
export async function getTopScorers(leagueSlug: string, limit?: number): Promise<TopScorer[]> {
  const lim = limit ?? 10;
	
  const { data } = await cacheAside<TopScorer[]>(
    `topscorers:v2:${leagueSlug}:${lim}`,
    TTL.fixtures,
    () => getTopScorersRaw(leagueSlug, lim).then((r) => r ?? [])
  );
	
  return data ?? [];
}

/** Top assists for a league (\24h. */
export async function getTopAssists(leagueSlug: string, limit?: number): Promise<TopScorer[]> {
  const lim = limit ??  10;
  const { data } = await cacheAside<TopScorer[]>(
    `topassists:v2:${leagueSlug}:${lim}`,
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

  return filterPublicVisible(data ?? []);
}

/**
 * Full match preview payload (~8-10 upstream calls; 24h TTL). Hidden matches
 * resolve to null so their preview page 404s on the public site.
 */
export async function getMatchPreviewBySlug(slug: string): Promise<MatchPreview | null> {
  const key = canonicalSlug(slug);
  if (await isSlugHidden(key)) return null;
  const { data } = await cacheAside<MatchPreview | null>(
    `preview:${key}`,
    TTL.preview,
    () => getMatchPreviewBySlugRaw(key)
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

  return filterPublicVisible(data ?? []);
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
// ─── Prediction-consistency review (tip ↔ scoreline ↔ win probability) ──

export interface PredictionReviewResult {
  flagged: boolean;
  reasons: string[];
  /** false = no cached prediction data to evaluate against. */
  available: boolean;
}

/**
 * Per-process memo for prediction reviews.
 *
 * A public listing evaluates the review for EVERY fixture on the page, and the
 * homepage walks the same fixture list once per matchday — so without a memo a
 * single render asks the store for the same review several hundred times (the
 * store is the bottleneck, not the evaluation). Entries are short-lived and are
 * dropped the moment an admin edit invalidates the authoritative cached review.
 */
const REVIEW_MEMO_TTL_MS = 60_000;
const reviewMemo = new Map<string, { result: PredictionReviewResult; expiresAt: number }>();

function memoReview(key: string, result: PredictionReviewResult): PredictionReviewResult {
  if (reviewMemo.size > 2000) {
    const now = Date.now();
    for (const [k, v] of reviewMemo) if (v.expiresAt <= now) reviewMemo.delete(k);
  }
  reviewMemo.set(key, { result, expiresAt: Date.now() + REVIEW_MEMO_TTL_MS });
  return result;
}

/** Still-warm memoized review for a fixture key, or null. */
function memoizedReview(key: string): PredictionReviewResult | null {
  const hit = reviewMemo.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    reviewMemo.delete(key);
    return null;
  }
  return hit.result;
}

/** Evaluate a fixture's effective prediction (cached preview + given override). */
async function computeReview(
  key: string,
  override: AdminOverride | null
): Promise<PredictionReviewResult> {
  const preview = await peekCache<MatchPreview>(`preview:${key}`);
  const prediction = preview?.prediction;
  if (!preview?.fixture || !prediction?.predictedScore || !prediction?.tip) {
    return { flagged: false, reasons: [], available: false };
  }

  const effective = {
    predictedScore: override?.predictedScore ?? prediction.predictedScore,
    tip: override?.tip ?? prediction.tip,
    winProbability: override?.winProbability ?? prediction.winProbability,
    btts: prediction.btts ?? null,
    overUnder: prediction.overUnder ?? null,
  };
  if (!effective.predictedScore || !effective.tip) {
    return { flagged: false, reasons: [], available: false };
  }

  const review = evaluatePrediction(
    effective.tip,
    {
      predictedScore: effective.predictedScore,
      winProbability: effective.winProbability,
      btts: effective.btts,
      overUnder: effective.overUnder,
    },
    preview.fixture.homeTeam.name,
    preview.fixture.awayTeam.name,
    preview.fixture.homeTeam.shortName,
    preview.fixture.awayTeam.shortName
  );

  return { flagged: review.flagged, reasons: review.reasons, available: true };
}

/**
 * Resolve a fixture's review from already-cached data. `overrideFor` is only
 * consulted on a miss, so a batched caller never pays for a store round trip it
 * already did itself.
 */
async function reviewFrom(
  slug: string,
  overrideFor: () => Promise<AdminOverride | null>
): Promise<PredictionReviewResult> {
  const key = canonicalSlug(slug);
  const warm = memoizedReview(key);
  if (warm) return warm;
  // Authoritative cached result (written by a preview page render or an override save).
  const cached = await peekCache<PredictionReviewResult>(predictionReviewKey(key));
  if (cached) return memoReview(key, cached);
  return memoReview(key, await computeReview(key, await overrideFor()));
}

/**
 * Evaluate a fixture's prediction for tip↔scoreline↔win-probability conflicts.
 * Cheap for the admin table: reads ONLY cached data (cached preview + admin
 * override) — never triggers an upstream API call.
 */
export async function getPredictionReview(slug: string): Promise<PredictionReviewResult> {
  return reviewFrom(slug, () => getAdminOverride(canonicalSlug(slug)));
}

/**
 * Batched review lookup for a listing. `overrideMap` comes from the single
 * batched override read the caller already performed, so no per-fixture store
 * round trip happens here.
 */
async function getPredictionReviews(
  slugs: string[],
  overrideMap: Map<string, AdminOverride>
): Promise<Map<string, PredictionReviewResult>> {
  const out = new Map<string, PredictionReviewResult>();
  await Promise.all(
    slugs.map(async (s) => {
      const key = canonicalSlug(s);
      out.set(key, await reviewFrom(key, async () => overrideMap.get(key) ?? null));
    })
  );
  return out;
}

/** Persist an authoritative review result (preview page render, override save). */
export async function writePredictionReview(slug: string, result: PredictionReviewResult): Promise<void> {
  const key = canonicalSlug(slug);
  // Keep the per-process memo in step with the authoritative value (the admin
  // route writes then immediately re-reads it).
  memoReview(key, result);
  await writeCache(predictionReviewKey(key), result, TTL.preview).catch(() => undefined);
}

/** Drop the cached review so the next read recomputes (after an admin edit). */
export async function invalidatePredictionReview(slug: string): Promise<void> {
  const key = canonicalSlug(slug);
  reviewMemo.delete(key);
  await invalidateCache(predictionReviewKey(key)).catch(() => undefined);
}

// ─── Team-page data adapters (cached) ─────────────────────────────────

/** Recent finished results for a team (12h). */
export async function getTeamRecentResults(
  teamId: number | string,
  count: number = 8
): Promise<Fixture[]> {
  const id = Number(teamId);
  const { data } = await cacheAside<Fixture[]>(
    `teamresults:${id}:${count}`,
    TTL.standings,
    () => getTeamRecentResultsRaw(id, count).then((r) => r ?? [])
  );
  return data ?? [];
}

/** Head-to-head between two teams by id (24h). */
export async function getTeamHeadToHead(
  teamAId: number | string,
  teamBId: number | string,
  count: number = 6
): Promise<ReturnType<typeof getTeamHeadToHeadByIdsRaw>> {
  const a = Number(teamAId);
  const b = Number(teamBId);
  const { data } = await cacheAside(
    `teamh2h:${a}:${b}:${count}`,
    TTL.standings,
    () => getTeamHeadToHeadByIdsRaw(a, b, count).then((r) => r ?? [])
  );
  return data ?? [];
}

/** Team squad / players list (24h). */
export async function getTeamSquadData(teamId: number | string): Promise<SquadPlayerWithRating[]> {
  const id = Number(teamId);
  const { data } = await cacheAside<SquadPlayerWithRating[]>(
    `teamsquad:${id}`,
    TTL.standings,
    () => getTeamSquadRaw(id)
  );
  return data ?? [];
}

/** Current injury/suspension list for a team (12h). */
export async function getTeamInjuriesData(teamId: number | string): Promise<Awaited<ReturnType<typeof getTeamInjuriesRaw>>> {
  const id = Number(teamId);
  const { data } = await cacheAside(
    `teaminjuries:${id}`,
    TTL.standings,
    () => getTeamInjuriesRaw(id).then((r) => r ?? [])
  );
  return data ?? [];
}

/** Top scorers restricted to one team (reads the per-league topscorers cache). */
export async function getTeamTopScorersData(
  teamId: number | string,
  leagueSlug: string
): Promise<TopScorer[]> {
  const id = String(teamId);
  const scorers = await getTopScorers(leagueSlug, 50);
  return (scorers ?? []).filter((s) => String(s.team.id) === id || s.team.id === id);
}

/** Top assists restricted to one team (reads the per-league topassists cache). */
export async function getTeamTopAssistsData(
  teamId: number | string,
  leagueSlug: string
): Promise<TopScorer[]> {
  const id = String(teamId);
  const assists = await getTopAssists(leagueSlug, 50);
  return (assists ?? []).filter((s) => String(s.team.id) === id || s.team.id === id);
}

// ─── Per-matchday top scorers/assists for UEFA league-phase (round-scoped) ──

const UEFA_LEAGUE_SLUG_TO_ID: Record<string, number> = {
  "champions-league": 2,
  "europa-league": 3,
  "conference-league": 848,
};

export interface LeagueRoundStats {
  round: number;
  scorers: TopScorer[];
  assisters: TopScorer[];
  /** True once at least one knockout-phase match has finished (goals included). */
  hasKnockouts: boolean;
}

/**
 * Cumulative top scorers & assist providers for a UEFA competition, computed
 * from its finished fixtures' goal events (NOT the season-cumulative /players
 * endpoints). Numbers accumulate across every finished league-phase matchday
 * (up to 8 for UCL/UEL, 6 for UECL) plus every finished knockout-phase tie, so
 * the leaderboard is a full-season running total rather than a single matchday.
 * Returns null for non-UEFA slugs or before any league-phase match has finished.
 */
export async function getLeagueRoundStats(leagueSlug: string): Promise<LeagueRoundStats | null> {
  const id = UEFA_LEAGUE_SLUG_TO_ID[leagueSlug];
  if (id == null) return null;

  const { data } = await cacheAside<LeagueRoundStats | null>(
    `roundstats:v3:${leagueSlug}`,
    TTL.fixtures,
    () =>
      computeRoundGoalStats(id, undefined, { cumulative: true }).then((s) =>
        s.fixturesCounted > 0 && s.scorers.length
          ? { round: s.round, scorers: s.scorers, assisters: s.assisters, hasKnockouts: s.hasKnockouts }
          : null
      )
  );
  return data ?? null;
}
// ─── Effective prediction for the admin FixtureEditor ──────────────────
// Mirrors the preview page's effective-value computation exactly, so the
// editor prefills with the SAME numbers/text the public page displays
// (override wins → API prediction → Poisson model). `auto` holds the pure
// pre-override values so the editor can detect which fields the admin changed.

export interface FixturePredictionValues {
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
}

export interface EffectivePredictionResult {
  auto: FixturePredictionValues;
  effective: FixturePredictionValues;
  /** true when any part of this prediction actually came from an admin override. */
  hasOverride: boolean;
}

export async function getFixtureEffectivePrediction(slug: string): Promise<EffectivePredictionResult | null> {
  const key = canonicalSlug(slug);
  const [preview, override] = await Promise.all([
    getMatchPreviewBySlug(key),
    getAdminOverride(key),
  ]);
  if (!preview?.fixture) return null;

  const { fixture, homeForm, awayForm, headToHead, prediction } = preview;

  const compSlug = fixture.competition.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const [leagueData, oddsRows] = await Promise.all([
    getLeagueStandings(compSlug).catch(() => null),
    getFixtureOdds(fixture.id, fixture.homeTeam.shortName, fixture.awayTeam.shortName).catch(() => null),
  ]);

  const homeStanding = leagueData?.standings?.find((s) => s.team.name === fixture.homeTeam.name) ?? null;
  const awayStanding = leagueData?.standings?.find((s) => s.team.name === fixture.awayTeam.name) ?? null;
  const odds = oddsRows?.[0]
    ? { homeOdds: oddsRows[0].home, drawOdds: oddsRows[0].draw, awayOdds: oddsRows[0].away }
    : null;

  const predictionResult = computePrediction({
    headToHead,
    homeForm,
    awayForm,
    homeStanding,
    awayStanding,
    odds,
  });

  // Pure auto values — exactly what the preview page renders with no override.
  const auto: FixturePredictionValues = {
    predictedScore: prediction?.predictedScore
      ?? { home: predictionResult.homeScore, away: predictionResult.awayScore },
    tip: prediction?.tip ?? predictionResult.tip,
    winProbability: {
      home: predictionResult.homeWin,
      draw: predictionResult.draw,
      away: predictionResult.awayWin,
    },
    previewText: generateNlgAnalysis(
      fixture.homeTeam.name, fixture.awayTeam.name, fixture.competition,
      homeForm, awayForm, headToHead,
    ),
  };

  // Effective = override wins over auto (what the public page actually shows).
  const effective: FixturePredictionValues = {
    predictedScore: override?.predictedScore ?? auto.predictedScore,
    tip: override?.tip ?? auto.tip,
    winProbability: override?.winProbability ?? auto.winProbability,
    previewText: override?.previewText?.trim() || auto.previewText,
  };

  return {
    auto,
    effective,
    hasOverride: Boolean(override && (override.predictedScore || override.tip || override.winProbability || override.previewText)),
  };
}
