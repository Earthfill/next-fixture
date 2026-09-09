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
// ---------------------------------------------------------------------------

import {
  initPostgres,
  pgAvailable,
  pgDrainPool,
  pgHiddenList,
  pgHiddenAdd,
  pgHiddenRemove,
} from "@/lib/cache/postgres";

// How long a process-local copy of the hidden set is trusted before it is
// re-read from Postgres. Short enough that a hide/unhide on another serverless
// instance propagates quickly; long enough that pages aren't doing a DB query
// per render.
const MEMORY_TTL_MS = 30_000;

let memorySet: Set<string> | null = null;
let memoryExpiresAt = 0;
let inflight: Promise<Set<string>> | null = null;

function refreshMemory(items: string[]): void {
  memorySet = new Set(items);
  memoryExpiresAt = Date.now() + MEMORY_TTL_MS;
}

/** Read the current hidden slugs from Postgres (source of truth). */
async function readFromPg(): Promise<Set<string>> {
  const slugs = await pgHiddenList().catch(() => [] as string[]);
  refreshMemory(slugs);
  return memorySet as Set<string>;
}

/** Get the hidden set, using the process-local cache when it's fresh. */
export async function getHiddenSlugs(): Promise<Set<string>> {
  await initPostgres();

  if (memorySet && Date.now() < memoryExpiresAt) {
    return memorySet;
  }

  if (!pgAvailable()) {
    // No-PG fallback: keep whatever we last knew.
    return memorySet ?? new Set<string>();
  }

  // Coalesce concurrent refreshes into a single PG call.
  if (!inflight) {
    inflight = readFromPg().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Drop every fixture/slug that is hidden from the public site. */
export async function filterHidden<T extends { slug?: string }>(items: T[]): Promise<T[]> {
  if (!items || items.length === 0) return items;
  const hidden = await getHiddenSlugs();
  if (hidden.size === 0) return items;
  return items.filter((item) => item.slug === undefined || !hidden.has(item.slug));
}

/** Is this specific slug hidden? */
export async function isSlugHidden(slug: string): Promise<boolean> {
  const hidden = await getHiddenSlugs();
  return hidden.has(slug);
}

export interface SetHiddenResult {
  hidden: Set<string>;
  persisted: boolean;
}

/**
 * Hide or un-hide a fixture. The write is made durable (sync pool drain) and
 * then verified with a bounded read-back so an immediate public render sees the
 * new state. The refreshed hidden set is returned.
 */
async function setHidden(slug: string, shouldHide: boolean): Promise<SetHiddenResult> {
  await initPostgres();

  let persisted = false;
  if (pgAvailable()) {
    persisted = shouldHide
      ? await pgHiddenAdd(slug).catch(() => false)
      : await pgHiddenRemove(slug).catch(() => false);
    if (persisted) {
      await pgDrainPool();
    }
  }

  // Force the memory cache to re-read from PG right away (even on no-PG the
  // in-memory copy is still the only store, so we update it below).
  memorySet = null;
  memoryExpiresAt = 0;

  if (pgAvailable()) {
    // Bounded read-back: give a laggy replica a moment to catch up.
    let hidden: Set<string> = new Set();
    for (let attempt = 0; attempt < 5; attempt++) {
      hidden = await readFromPg();
      const matches = hidden.has(slug) === shouldHide;
      if (matches) return { hidden, persisted };
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    return { hidden, persisted };
  }

  // No-PG fallback: update the process-local copy directly.
  const next = new Set<string>(memorySet ?? []);
  if (shouldHide) next.add(slug);
  else next.delete(slug);
  refreshMemory([...next]);
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