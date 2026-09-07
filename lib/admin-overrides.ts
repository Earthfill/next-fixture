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
  pgOverrideGet,
  pgOverrideSet,
  pgOverrideDelete,
  pgOverrideList,
} from "@/lib/cache/postgres";

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

  if (pgAvailable()) {
    const row = await pgOverrideGet(slug).catch(() => null);
    if (row) {
      const override: AdminOverride = {
        predictedScore: row.predictedScore,
        tip: row.tip,
        winProbability: row.winProbability,
        previewText: row.previewText,
        expiresAt: row.expiresAt,
      };
      memoryStore.set(slug, override);
      return override;
    }
    // PG is authoritative — an absent (or expired) row means no override.
    memoryStore.delete(slug);
    return null;
  }

  // No-PG fallback (dev/standalone): process-local memory only.
  const mem = memoryStore.get(slug);
  if (mem) {
    if (isExpired(mem)) {
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
  expiresAt: string
): Promise<SetAdminOverrideResult> {
  await initPostgres();

  const existing = await getAdminOverride(slug);

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
    persisted = await pgOverrideSet(slug, override, expiresAt).catch(() => false);
  }
  // Keep the memory map warm for the no-PG fallback path.
  memoryStore.set(slug, override);

  return { override, persisted };
}

export async function deleteAdminOverride(slug: string): Promise<void> {
  await initPostgres();
  if (pgAvailable()) {
    await pgOverrideDelete(slug).catch(() => undefined);
  }
  memoryStore.delete(slug);
}

/** Which of the given fixture slugs have a valid override right now? */
export async function getOverriddenSlugs(slugs: string[]): Promise<string[]> {
  await initPostgres();
  if (pgAvailable()) {
    return pgOverrideList(slugs).catch(() => []);
  }
  return slugs.filter((slug) => {
    const mem = memoryStore.get(slug);
    return mem !== undefined && !isExpired(mem);
  });
}
