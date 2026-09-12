// ---------------------------------------------------------------------------
// Admin overrides — manual scoreline/tip/probability/preview edits
// ---------------------------------------------------------------------------
// Backed by the dedicated `admin_overrides` table + an in-memory fallback.
// Deliberately NOT part of lib/cache (api_cache), so the daily midnight cron
// and the admin "Clear Cache" action do not reset these. Entries expire at the
// match kickoff time and are ignored after that.
//
// Postgres is the single source of truth: reads go to PG first so that edits
// made in one serverless instance are immediately visible in another. The
// in-memory map is ONLY a fallback for no-PG (dev/standalone) environments.
// ---------------------------------------------------------------------------

import {
  initPostgres,
  pgAvailable,
  pgDrainPool,
  pgOverrideGet,
  pgOverrideSet,
  pgOverrideDelete,
  pgOverrideList,
} from "@/lib/cache/postgres";
import { normalizeSlug } from "@/lib/football/config";

/** Canonical fixture slug used as the override store key (ASCII-safe). */
function canonicalSlug(slug: string): string {
  return normalizeSlug(slug);
}

export interface AdminOverride {
  predictedScore: { home: number; away: number } | null;
  tip: string | null;
  winProbability: { home: number; draw: number; away: number } | null;
  previewText: string | null;
  expiresAt: string;
}

export type AdminOverridePatch = {
  predictedScore?: { home: number; away: number } | null;
  tip?: string | null;
  winProbability?: { home: number; draw: number; away: number } | null;
  previewText?: string | null;
};

const memoryStore = new Map<string, AdminOverride>();

function isExpired(override: AdminOverride): boolean {
  return new Date(override.expiresAt).getTime() <= Date.now();
}

export async function getAdminOverride(slug: string): Promise<AdminOverride | null> {
  await initPostgres();
  const key = canonicalSlug(slug);

  if (pgAvailable()) {
    // Try the canonical (ASCII) form first, then the raw form — earlier slugs
    // (and older DB rows) can carry non-ASCII characters like "ü"/"%C3%BC",
    // while new ones are URL-safe. Either should resolve to the same override.
    const row = (await pgOverrideGet(key).catch(() => null)) ?? (await pgOverrideGet(slug).catch(() => null));
    if (row) {
      const override: AdminOverride = {
        predictedScore: row.predictedScore,
        tip: row.tip,
        winProbability: row.winProbability,
        previewText: row.previewText,
        expiresAt: row.expiresAt,
      };
      memoryStore.set(key, override);
      return override;
    }
    // PG is authoritative — an absent (or expired) row means no override.
    memoryStore.delete(key);
    return null;
  }

  // No-PG fallback (dev/standalone): process-local memory only.
  const mem = memoryStore.get(key) ?? memoryStore.get(slug);
  if (mem) {
    if (isExpired(mem)) {
      memoryStore.delete(key);
      memoryStore.delete(slug);
      return null;
    }
    return mem;
  }
  return null;
}

export interface SetAdminOverrideResult {
  override: AdminOverride;
  persisted: boolean;
}

export async function setAdminOverride(
  slug: string,
  patch: AdminOverridePatch,
  expiresAt: string,
  opts?: { sync?: boolean }
): Promise<SetAdminOverrideResult> {
  await initPostgres();
  const key = canonicalSlug(slug);

  const existing = await getAdminOverride(key);

  const override: AdminOverride = {
    predictedScore:
      patch.predictedScore !== undefined
        ? patch.predictedScore
        : (existing?.predictedScore ?? null),
    tip: patch.tip !== undefined ? patch.tip : (existing?.tip ?? null),
    winProbability:
      patch.winProbability !== undefined
        ? patch.winProbability
        : (existing?.winProbability ?? null),
    previewText:
      patch.previewText !== undefined
        ? patch.previewText
        : (existing?.previewText ?? null),
    expiresAt,
  };

  let persisted = false;
  if (pgAvailable()) {
    persisted = await pgOverrideSet(key, override, expiresAt).catch(() => false);
    // In sync mode we must not return until the write can be read back — the
    // caller re-renders/revalidates the preview immediately, and a write that
    // is still buffered would make the next render miss the override. pg's `idle`
    // event only fires after the query has been fully processed by the backend,
    // which is the strongest signal we have that the data is durable server-side.
    if (persisted && opts?.sync) {
      await pgDrainPool();
    }
  }
  // Keep the memory map warm for the no-PG fallback path.
  memoryStore.set(key, override);

  return { override, persisted };
}

export async function deleteAdminOverride(slug: string): Promise<void> {
  await initPostgres();
  const key = canonicalSlug(slug);
  if (pgAvailable()) {
    await pgOverrideDelete(key).catch(() => undefined);
  }
  memoryStore.delete(key);
}

/** Which of the given fixture slugs have a valid override right now? */
export async function getOverriddenSlugs(slugs: string[]): Promise<string[]> {
  await initPostgres();
  // Check both the canonical (ASCII) form and the raw form — older fixtures /
  // DB rows may carry non-ASCII characters while new ones are URL-safe.
  const keys = slugs.flatMap((s) => {
    const k = canonicalSlug(s);
    return k === s ? [k] : [k, s];
  });
  if (pgAvailable()) {
    const found = await pgOverrideList(keys).catch(() => []);
    const foundSet = new Set(found.map((f) => canonicalSlug(f)));
    return slugs.filter((s) => foundSet.has(canonicalSlug(s)) || foundSet.has(s));
  }
  return slugs.filter((slug) => {
    const mem = memoryStore.get(canonicalSlug(slug)) ?? memoryStore.get(slug);
    return mem !== undefined && !isExpired(mem);
  });
}
