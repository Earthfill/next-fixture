// ---------------------------------------------------------------------------
// Midnight job — prefetch the next 7 days of fixtures into the cache layer
// ---------------------------------------------------------------------------
// Runs daily at 00:00 (scheduled by scheduler.ts). Fetches each covered
// league once for a 7-day window (≈12-14 API calls), then seeds every
// granularity of cache key:
//   fixtures:<date>            → all fixtures for that date
//   fixtures:<date>:<league>  → per-league view (matches the fixtures route)
//   fixtures:upcoming:<d>:<today> → homepage's cached upcoming list (so the
//                                    page never fires its own API fetch)
// It also upserts the fixtures into the PostgreSQL `matches` table so the
// live-poll gate knows which matches are on today.
// ---------------------------------------------------------------------------

import { fetchFixturesForRange } from "@/lib/football/service";
import { writeCache } from "@/lib/cache";
import { fixturesKey, upcomingFixturesKey, UPCOMING_DAYS, TTL } from "@/lib/cache/keys";
import { upsertMatches } from "@/lib/cache/postgres";
import { COMPETITION_SLUGS } from "@/lib/football/config";
import { siteToday, toSiteDate } from "@/lib/dates";
import type { Fixture } from "@/lib/types";

export interface MidnightFixturesResult {
  daysFetched: number;
  fixtureCount: number;
  cacheKeysWritten: number;
  durationMs: number;
}

export async function fetchNext7DaysFixtures(): Promise<MidnightFixturesResult> {
  const startedAt = Date.now();

  // Resolve "today" in the SITE timezone (not the server's UTC clock) so the
  // prefetched window lines up with the dates the homepage and API display.
  const fromStr = siteToday();
  const end = new Date();
  end.setDate(end.getDate() + 6);
  const toStr = toSiteDate(end);

  const fixtures = await fetchFixturesForRange(fromStr, toStr);
  if (!fixtures.length) {
    console.warn("[cron:midnight] fetched 0 fixtures — check API-Football quota / season window");
    return { daysFetched: 7, fixtureCount: 0, cacheKeysWritten: 0, durationMs: Date.now() - startedAt };
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

  // Warm the homepage's "upcoming fixtures" cache so the next page render does
  // NOT fire its own multi-league fetch (the key matches lib/cache/pages.ts).
  const upTo = new Date();
  upTo.setDate(upTo.getDate() + UPCOMING_DAYS);
  const upToStr = toSiteDate(upTo);
  const upcoming = fixtures.filter(
    (f) => f.status !== "finished" && (f.date.split("T")[0] || "") <= upToStr
  );
  if (upcoming.length > 0) {
    await writeCache(upcomingFixturesKey(), upcoming, TTL.fixtures);
    cacheKeysWritten++;
  } else {
    console.warn("[cron:midnight] 0 upcoming fixtures after prefetch — homepage will be empty until fixtures exist");
  }

  // Persist the fixtures to PostgreSQL so the live-poll job can gate itself.
  await upsertMatches(fixtures);

  return {
    daysFetched: 7,
    fixtureCount: fixtures.length,
    cacheKeysWritten,
    durationMs: Date.now() - startedAt,
  };
}