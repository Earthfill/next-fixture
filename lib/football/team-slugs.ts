// ---------------------------------------------------------------------------
// team-slugs — resolve a /teams/[slug] URL to a team (+ its competitions)
// ---------------------------------------------------------------------------
// The team index is built from CACHE-ONLY sources (never triggers an upstream
// API call): the cached upcoming-fixture list the midnight cron seeds, plus any
// per-league standings already cached from league-page visits. This keeps the
// index free of API quota pressure while covering every team that appears in
// the upcoming window or in a cached league table.
//
// The whole index is itself cached (`teams:index`, 24h) via the shared
// cache-aside layer, so sitemap generation and team-page lookups are cheap.
// ---------------------------------------------------------------------------

import { cacheAside, peekCache } from "@/lib/cache";
import { TEAMS_INDEX_KEY, TEAMS_INDEX_TTL, upcomingFixturesKey, UPCOMING_DAYS, standingsKey } from "@/lib/cache/keys";
import { SLUG_TO_LEAGUE_ID, teamSlug } from "@/lib/football/config";
import type { Fixture, LeagueData, Team } from "@/lib/types";

export interface TeamInfo {
  slug: string;
  id: string;
  name: string;
  shortName: string;
  logo: string;
  /** The competitions this team appears in across cached sources. */
  competitions: string[];
}

const addTo = (map: Map<string, TeamInfo>, t: Team, competition: string): void => {
  if (!t?.name) return;
  const slug = teamSlug(t.name);
  const existing = map.get(slug);
  if (existing) {
    if (competition && !existing.competitions.includes(competition)) {
      existing.competitions.push(competition);
    }
    return;
  }
  map.set(slug, {
    slug,
    id: t.id,
    name: t.name,
    shortName: t.shortName || t.name.substring(0, 3).toUpperCase(),
    logo: t.logo || "",
    competitions: competition ? [competition] : [],
  });
};

/** Build the team index purely from cached sources (upcoming fixtures + cached standings). */
async function buildTeamIndex(): Promise<TeamInfo[]> {
  const map = new Map<string, TeamInfo>();

  // 1. Upcoming fixtures (seeded by the midnight cron → cache-only read).
  const upcoming = await peekCache<Fixture[]>(upcomingFixturesKey(UPCOMING_DAYS));
  if (upcoming) {
    for (const f of upcoming) {
      addTo(map, f.homeTeam, f.competition);
      addTo(map, f.awayTeam, f.competition);
    }
  }

  // 2. Cached per-league standings (only read if already cached — no API call).
  const leagueSlugs = Object.keys(SLUG_TO_LEAGUE_ID);
  const standings = await Promise.all(
    leagueSlugs.map((slug) => peekCache<LeagueData>(standingsKey(slug)).catch(() => null))
  );
  for (const data of standings) {
    if (!data?.standings?.length) continue;
    const compName = data.league?.name || "";
    for (const s of data.standings) {
      addTo(map, s.team, compName);
    }
  }

  const teams = [...map.values()];
  // Stable sort → stable slugs and sitemaps between builds.
  teams.sort((a, b) => a.name.localeCompare(b.name));
  return teams;
}

/** Full team index (cached 24h). Pass `fresh` to bypass the cache-aside read. */
export async function getAllTeams(fresh = false): Promise<TeamInfo[]> {
  if (fresh) {
    await invalidateTeamIndex();
  }
  const { data } = await cacheAside<TeamInfo[]>(TEAMS_INDEX_KEY, TEAMS_INDEX_TTL, buildTeamIndex);
  return data ?? [];
}

/** Resolve a team slug (URL segment) to team info, or null when unknown. */
export async function getTeamBySlug(slug: string): Promise<TeamInfo | null> {
  if (!slug) return null;
  const teams = await getAllTeams();
  return teams.find((t) => t.slug === slug) ?? null;
}

/** Drop the cached team index (e.g. after clearing caches or adding leagues). */
export async function invalidateTeamIndex(): Promise<void> {
  const { invalidateCache } = await import("@/lib/cache");
  await invalidateCache(TEAMS_INDEX_KEY).catch(() => undefined);
}

/** Team info lookup by numeric team id (used by sitemap/linking helpers). */
export async function getTeamById(id: string | number): Promise<TeamInfo | null> {
  const sid = String(id);
  const teams = await getAllTeams();
  return teams.find((t) => t.id === sid) ?? null;
}