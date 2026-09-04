// ---------------------------------------------------------------------------
// Midnight job — prefetch the next 7 days of fixtures into the cache layer
// ---------------------------------------------------------------------------
// Runs daily at 00:00 (scheduled by scheduler.ts). Fetches each covered
// league once for a 7-day window (≈12-14 API calls), then seeds every
// granularity of cache key:
//   fixtures:<date>            → all fixtures for that date
//   fixtures:<date>:<league>  → per-league view (matches the fixtures route)
// It also upserts the fixtures into the PostgreSQL `matches` table so the
// live-poll gate knows which matches are on today.
// ---------------------------------------------------------------------------

import { fetchFixturesForRange } from "@/lib/football/service";
import { writeCache } from "@/lib/cache";
import { fixturesKey, TTL } from "@/lib/cache/keys";
import { upsertMatches } from "@/lib/cache/postgres";
import { toDateString } from "@/lib/cache/fetchers";
import { COMPETITION_SLUGS } from "@/lib/football/config";
import type { Fixture } from "@/lib/types";

export interface MidnightFixturesResult {
  daysFetched: number;
  fixtureCount: number;
  cacheKeysWritten: number;
}

export async function fetchNext7DaysFixtures(): Promise<MidnightFixturesResult> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fromStr = toDateString(start);
  const toStr = toDateString(end);

  const fixtures = await fetchFixturesForRange(fromStr, toStr);
  if (!fixtures.length) {
    return { daysFetched: 7, fixtureCount: 0, cacheKeysWritten: 0 };
  }

  const byDate = new Map<string, Fixture[]>();
  const byDateLeague = new Map<string, Fixture[]>();

  for (const f of fixtures) {
    const date = f.date.split("T")[0] || fromStr;

    const dayList = byDate.get(date) || [];
    dayList.push(f);
    byDate.set(date, dayList);

    const slug = COMPETITION_SLUGS[f.competition] || f.competition.toLowerCase().replace(/\s+/g, "-");
    const subKey = `${date}:${slug}`;
    const subList = byDateLeague.get(subKey) || [];
    subList.push(f);
    byDateLeague.set(subKey, subList);
  }

  // Seed per-league keys first, then the aggregate per-date keys.
  let cacheKeysWritten = 0;

  for (const [subKey, list] of byDateLeague) {
    const [date, slug] = subKey.split(":");
    await writeCache(fixturesKey(date, slug), list, TTL.fixtures);
    cacheKeysWritten++;
  }
  for (const [date, list] of byDate) {
    await writeCache(fixturesKey(date), list, TTL.fixtures);
    cacheKeysWritten++;
  }

  // Persist the fixtures to PostgreSQL so the live-poll job can gate itself.
  await upsertMatches(fixtures);

  return {
    daysFetched: 7,
    fixtureCount: fixtures.length,
    cacheKeysWritten,
  };
}