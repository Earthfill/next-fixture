// ---------------------------------------------------------------------------
// Live-poll job — poll API-Football live scores, gated by active matches
// ---------------------------------------------------------------------------
// Runs every 30 seconds. Crucially, it only calls API-Football when there are
// active live matches "occurring in the database" (the PostgreSQL `matches`
// table, populated by the midnight job + every poll). If no match is live (or
// kicking off within the next 30 minutes), it skips the upstream call entirely
// to protect the API-Football quota.
// ---------------------------------------------------------------------------

import { fetchLiveMatches } from "@/lib/football/service";
import { writeCache, peekCache } from "@/lib/cache";
import { liveKey, liveActiveKey, TTL } from "@/lib/cache/keys";
import {
  upsertMatches,
  pgHasActiveLiveMatches,
  finalizeStaleLiveMatches,
} from "@/lib/cache/postgres";
import type { Fixture } from "@/lib/types";

export interface LivePollResult {
  polled: boolean;
  skippedReason?: "no-live-matches" | "no-api-key";
  liveCount: number;
}

async function gateShouldPoll(): Promise<boolean> {
  // Primary gate: durable PostgreSQL source of truth.
  const dbActive = await pgHasActiveLiveMatches();

  // DB is authoritative when it can answer.
  if (dbActive !== null) return dbActive;

  // DB unavailable → fall back to the cache tiers as the gate.
  // If we previously saw live matches (sentinel) or still hold a fresh live
  // list, keep polling until we confirm they've finished.
  const sentinel = await peekCache<boolean>(liveActiveKey());
  if (sentinel === true) return true;
  const cachedLive = await peekCache<Fixture[]>(liveKey());
  return cachedLive !== null && cachedLive.length > 0;
}

export async function pollLiveMatches(): Promise<LivePollResult> {
  // 1. Only spend an API call when there are active live matches.
  const shouldPoll = await gateShouldPoll();
  if (!shouldPoll) {
    return { polled: false, skippedReason: "no-live-matches", liveCount: 0 };
  }

  // 2. Poll the live feed.
  const fixtures = await fetchLiveMatches();

  // 3. Diff against the previous set so we can finalize finished matches.
  const activeLiveIds = new Set(fixtures.map((f) => f.id));

  // 4. Persist + freshen caches + matches table.
  if (fixtures.length > 0) {
    await upsertMatches(fixtures);
    await writeCache(liveKey(), fixtures, TTL.live);
    // Sentinel keeps a widening window so a match that goes dead just before
    // full time is still finalised rather than leaving the poll loop running.
    await writeCache(liveActiveKey(), true, TTL.live * 8);
  } else {
    // The live feed is empty → all matches finished.
    await writeCache(liveActiveKey(), false, TTL.live);
    await writeCache(liveKey(), [], TTL.live);
  }
  await finalizeStaleLiveMatches(activeLiveIds);

  return { polled: true, liveCount: fixtures.length };
}