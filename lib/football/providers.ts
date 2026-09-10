// ---------------------------------------------------------------------------
// Sports data provider registry — "rapid" (API-Football) | "highlightly"
// ---------------------------------------------------------------------------
// Both providers return the SAME api-sports-shaped JSON envelope ({ response })
// so the rest of the app is provider-agnostic. The ACTIVE provider is chosen:
//   1. env default (`SPORTS_API_PROVIDER`), overridden by
//   2. a persisted Postgres setting (admin switch), mirrored in-memory.
// No-PG (dev/standalone) installs fall back to the env default. The resolved
// provider is cached for a short window to avoid a DB read on every request.
// ---------------------------------------------------------------------------

import { pgSettingGet, pgSettingSet } from "@/lib/cache/postgres";

export type SportsProviderId = "rapid" | "highlightly";

export function isProviderId(v: string): v is SportsProviderId {
  return v === "rapid" || v === "highlightly";
}

interface ProviderMeta {
  id: SportsProviderId;
  label: string;
  keyEnv: string;
  hostEnv: string;
  defaultHost: string;
}

export const PROVIDER_META: Record<SportsProviderId, ProviderMeta> = {
  rapid: {
    id: "rapid",
    label: "API-Football (RapidAPI)",
    keyEnv: "RAPIDAPI_KEY",
    hostEnv: "API_FOOTBALL_HOST",
    defaultHost: "v3.football.api-sports.io",
  },
  highlightly: {
    id: "highlightly",
    label: "Highlightly (sports.highlightly.net)",
    keyEnv: "HIGHLIGHTLY_API_KEY",
    hostEnv: "HIGHLIGHTLY_HOST",
    defaultHost: "sports.highlightly.net",
  },
};

export const PROVIDER_IDS: SportsProviderId[] = ["rapid", "highlightly"];

const SETTING_KEY = "sports.provider";
const CACHE_TTL = 30_000; // refresh from Postgres at most every 30s

function envDefault(): SportsProviderId {
  const v = (process.env.SPORTS_API_PROVIDER || "").toLowerCase().trim();
  return isProviderId(v) ? v : "rapid";
}

function hostOf(id: SportsProviderId): string {
  return process.env[PROVIDER_META[id].hostEnv] || PROVIDER_META[id].defaultHost;
}

/** Whether the given provider has an API key configured. */
export function providerHasKey(id: SportsProviderId): boolean {
  return Boolean(process.env[PROVIDER_META[id].keyEnv]);
}

// --- Resolved-provider cache -------------------------------------------------

let cachedProvider: SportsProviderId | null = null;
let cachedAt = 0;

export function invalidateProviderResolve(): void {
  cachedProvider = null;
  cachedAt = 0;
}

/**
 * Synchronous active-provider resolution — used by `hasApi()` gates which run
 * before any await. Returns the in-memory value when warm, otherwise the env
 * default (the persisted value is surfaced by the async resolver inside request
 * handling, which also warms this cache).
 */
export function syncProviderId(): SportsProviderId {
  if (cachedProvider && Date.now() - cachedAt < CACHE_TTL) return cachedProvider;
  return envDefault();
}

/**
 * Resolve the active provider (Postgres wins over the env default), warming the
 * in-memory cache so subsequent `hasApi()` calls in the same process agree.
 */
export async function getActiveProviderId(): Promise<SportsProviderId> {
  if (cachedProvider && Date.now() - cachedAt < CACHE_TTL) return cachedProvider;

  cachedAt = Date.now();
  let resolved = envDefault();

  const persisted = await pgSettingGet(SETTING_KEY).catch(() => null);
  if (isProviderId(persisted ?? "")) resolved = persisted as SportsProviderId;

  cachedProvider = resolved;
  return resolved;
}

/**
 * Persist a provider choice (admin control panel). Also warms the in-memory
 * cache immediately so this instance honours the switch right away.
 */
export async function setActiveProviderId(
  id: SportsProviderId
): Promise<{ ok: boolean; provider: SportsProviderId }> {
  const next: SportsProviderId = isProviderId(id) ? id : "rapid";
  cachedProvider = next;
  cachedAt = Date.now();
  const persisted = await pgSettingSet(SETTING_KEY, next);
  return { ok: persisted, provider: next };
}

/** Build the request context (base URL + auth headers) for a provider. */
export function getProviderConfig(id: SportsProviderId): {
  base: string;
  authHeaders: Record<string, string>;
} {
  if (id === "highlightly") {
    return {
      base: `https://${hostOf(id)}`,
      authHeaders: {
        "x-rapidapi-key": process.env[PROVIDER_META.highlightly.keyEnv] || "",
        "x-rapidapi-host": hostOf(id),
      },
    };
  }
  return {
    base: `https://${hostOf(id)}`,
    authHeaders: {
      "x-apisports-key": process.env[PROVIDER_META.rapid.keyEnv] || "",
    },
  };
}
