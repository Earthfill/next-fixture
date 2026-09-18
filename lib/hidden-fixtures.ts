// ---------------------------------------------------------------------------
// Hidden fixtures — matches the admin has removed from the public site.
// ---------------------------------------------------------------------------
// Backed by the dedicated `hidden_fixtures` table + a short-lived in-memory
// cache. Deliberately NOT part of lib/cache (api_cache), so the daily midnight
// cron and the admin "Clear Cache" action never resurrect hidden matches.
//
// Postgres is the single source of truth. Reads go through a short-TTL memory
// cache so public pages don't pay a DB round-trip on every render; after a
// hide/unhide the cache is refreshed immediately (with a bounded read-back so
// a slow replica can't leave a stale entry behind).
//
// A read that fails (PG down, pooler saturated, query timeout) must NEVER be
// treated as an empty store: doing so re-publishes every hidden match on the
// public site — and because the listing pages are ISR-cached for 5 minutes, one
// blip could be frozen into HTML for that whole window. Failed reads therefore
// keep serving the last successfully read set and retry within seconds.
// ---------------------------------------------------------------------------

import {
  initPostgres,
  pgAvailable,
  pgDrainPool,
  pgHiddenList,
  pgHiddenAdd,
  pgHiddenRemove,
} from "@/lib/cache/postgres";
import { writeCache, peekCache } from "@/lib/cache";
import { HIDDEN_SLUGS_KEY, HIDDEN_SLUGS_TTL } from "@/lib/cache/keys";
import { normalizeSlug } from "@/lib/football/config";

/** Canonical fixture slug used as the hidden-store key (ASCII-safe). */
function canonicalSlug(slug: string): string {
  return normalizeSlug(slug);
}

// How long a process-local copy of the hidden set is trusted before it is
// re-read from Postgres. Short enough that a hide/unhide on another serverless
// instance propagates quickly; long enough that pages aren't doing a DB query
// per render.
const MEMORY_TTL_MS = 30_000;

// After a FAILED read we serve the last known set for this long before trying
// Postgres again — earlier than the normal TTL so a transient blip resolves
// quickly, but long enough that a struggling database isn't hit on every render
// (each attempt can otherwise block for the whole connect timeout).
const RETRY_TTL_MS = 5_000;

let memorySet: Set<string> | null = null;
let memoryExpiresAt = 0;
// Last set that came from a SUCCESSFUL read. Never cleared by a failed read, so
// one PG hiccup (timeout, pooler saturation, cold start during a deploy) can
// never wipe the hidden knowledge of a process that already had it.
let lastGoodSet: Set<string> | null = null;
let inflight: Promise<Set<string> | null> | null = null;

function refreshMemory(items: string[]): void {
  // Store canonical keys — legacy rows written before slugs were ASCII-safe
  // (e.g. "…münchen…") still have to match the fixture's generated slug.
  memorySet = new Set(items.map(canonicalSlug));
  lastGoodSet = memorySet;
  memoryExpiresAt = Date.now() + MEMORY_TTL_MS;
}

/**
 * Read the current hidden slugs from Postgres (source of truth).
 * Returns `null` when the read failed, in which case the caller must keep
 * serving the last known set instead of assuming nothing is hidden.
 */
async function readFromPg(): Promise<Set<string> | null> {
  const slugs = await pgHiddenList().catch(() => null);
  if (slugs === null) {
    // A read that couldn't complete is NOT an empty store: keep the last known
    // set (memorySet stays untouched) and retry shortly.
    memoryExpiresAt = (memorySet ?? lastGoodSet) ? Date.now() + RETRY_TTL_MS : 0;
    console.warn("[admin:hidden] list unavailable — keeping last known hidden set");
    return null;
  }
  refreshMemory(slugs);
  // Self-heal the shared cross-instance snapshot so a subsequent render doesn't
  // have to hit this PG table again (and so warm instances pick up the freshest
  // set even if no hide/unhide happened in this process).
  await writeCache(HIDDEN_SLUGS_KEY, slugs, HIDDEN_SLUGS_TTL).catch(() => undefined);
  return memorySet;
}

/** Get the hidden set, using the process-local cache when it's fresh. */
export async function getHiddenSlugs(): Promise<Set<string>> {
  await initPostgres();

  // 1. Prefer the SHARED cross-instance snapshot. After any hide/unhide the
  // fresh set is written here (Redis + PG cache-aside), so every serverless
  // instance — not just the one that handled the write — sees it on its very
  // next render instead of serving a process-local copy that can be up to 30s
  // stale. This is what makes "hidden in admin" vanish from the homepage right
  // away instead of lingering in warm instances.
  const shared = await peekCache<string[]>(HIDDEN_SLUGS_KEY).catch(() => null);
  if (Array.isArray(shared)) {
    refreshMemory(shared);
    return memorySet as Set<string>;
  }

  // 2. The freshness window is honoured for the last successfully read set too,
  // so a failing store degrades to "same as last time" instead of a DB attempt
  // on every single render.
  const lastKnown = memorySet ?? lastGoodSet;
  if (lastKnown && Date.now() < memoryExpiresAt) {
    return lastKnown;
  }

  if (!pgAvailable()) {
    // No-PG fallback: keep whatever we last knew — never fall back to "empty".
    return lastKnown ?? new Set<string>();
  }

  // 3. Coalesce concurrent refreshes into a single PG call.
  if (!inflight) {
    inflight = readFromPg().finally(() => {
      inflight = null;
    });
  }
  const fresh = await inflight;
  return fresh ?? lastKnown ?? new Set<string>();
}

/** Drop every fixture/slug that is hidden from the public site. */
export async function filterHidden<T extends { slug?: string }>(items: T[]): Promise<T[]> {
  if (!items || items.length === 0) return items;
  const hidden = await getHiddenSlugs();
  if (hidden.size === 0) return items;
  return items.filter((item) => item.slug === undefined || !hidden.has(canonicalSlug(item.slug)));
}

/** Is this specific slug hidden? */
export async function isSlugHidden(slug: string): Promise<boolean> {
  const hidden = await getHiddenSlugs();
  return hidden.has(canonicalSlug(slug));
}

export interface SetHiddenResult {
  hidden: Set<string>;
  persisted: boolean;
}

/**
 * Delete stored rows that normalise to `key` but are not stored in canonical
 * form, e.g. legacy rows written before slugs were made ASCII-safe
 * ("1635632--bayern-münchen-vs-bodo/glimt"). Those rows can never be matched by
 * the canonical key, so without this sweep un-hiding such a fixture in /admin
 * would look like it worked while the match stayed hidden.
 */
async function removeLegacyRows(key: string): Promise<boolean> {
  const rows = await pgHiddenList().catch(() => null);
  if (!rows) return false;
  let removed = false;
  for (const row of rows) {
    if (row !== key && canonicalSlug(row) === key) {
      const ok = await pgHiddenRemove(row).catch(() => false);
      removed = removed || ok;
    }
  }
  return removed;
}

/**
 * Hide or un-hide a fixture. The write is made durable (sync pool drain) and
 * then verified with a bounded read-back so an immediate public render sees the
 * new state. The refreshed hidden set is returned.
 */
async function setHidden(slug: string, shouldHide: boolean): Promise<SetHiddenResult> {
  await initPostgres();
  const key = canonicalSlug(slug);

  let persisted = false;
  if (pgAvailable()) {
    persisted = shouldHide
      ? await pgHiddenAdd(key).catch(() => false)
      : await pgHiddenRemove(key).catch(() => false);
    if (persisted) {
      await pgDrainPool();
    }
    if (!shouldHide) {
      // A legacy row is stored under a different key, so the delete above found
      // nothing and reported "not persisted" — sweep it and count that as the
      // write, or /admin would show the un-hide as failed while it worked.
      const swept = await removeLegacyRows(key);
      if (swept) {
        persisted = true;
        await pgDrainPool();
      }
    }
  }

  // Force the memory cache to re-read from PG right away (even on no-PG the
  // in-memory copy is still the only store, so we update it below).
  memorySet = null;
  memoryExpiresAt = 0;

  if (pgAvailable()) {
    // Bounded read-back: give a laggy replica a moment to catch up. A read that
    // can't complete (PG down/slow) keeps the last known set — an empty set
    // would tell the route the change never landed and re-publish the match.
    let hidden: Set<string> = lastGoodSet ?? new Set<string>();
    for (let attempt = 0; attempt < 5; attempt++) {
      const read = await readFromPg();
      if (read) hidden = read;
      const matches = hidden.has(key) === shouldHide;
      if (matches) {
        // Publish the confirmed set to the shared cross-instance snapshot so
        // every serverless instance drops this match from its listings on the
        // very next render instead of serving a stale process-local copy.
        await writeCache(HIDDEN_SLUGS_KEY, Array.from(hidden), HIDDEN_SLUGS_TTL).catch(() => undefined);
        return { hidden, persisted };
      }
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return { hidden, persisted };
  }

  // No-PG fallback: update the process-local copy directly.
  const next = new Set<string>(memorySet ?? lastGoodSet ?? []);
  if (shouldHide) next.add(key);
  else next.delete(key);
  refreshMemory([...next]);
  // Also publish to the shared snapshot if any tier is reachable.
  await writeCache(HIDDEN_SLUGS_KEY, Array.from(next), HIDDEN_SLUGS_TTL).catch(() => undefined);
  return { hidden: next, persisted };
}

/** Hide a fixture from the public site. */
export async function hideFixture(slug: string): Promise<SetHiddenResult> {
  return setHidden(slug, true);
}

/** Restore a previously hidden fixture to the public site. */
export async function unhideFixture(slug: string): Promise<SetHiddenResult> {
  return setHidden(slug, false);
}