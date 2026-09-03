// ---------------------------------------------------------------------------
// API-Football client (RapidAPI) — lightweight, no file cache
// ---------------------------------------------------------------------------
// In-memory cache deduplicates within a single request cycle.
// Persistent in-memory cache with 30-minute TTL reduces cross-request calls.
// Page-level ISR (revalidate: 3600) handles cross-request caching.
// ---------------------------------------------------------------------------

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "v3.football.api-sports.io";
const API_BASE = "https://" + RAPIDAPI_HOST;

export function hasApi(): boolean {
  return Boolean(RAPIDAPI_KEY);
}

// ─── In-memory dedup cache (request-scoped only) ────────────────────────

const dedupCache = new Map<string, Promise<any>>();

// ─── Persistent cache (cross-request, 30-minute TTL) ───────────────────

const persistentCache = new Map<string, { data: any; expiresAt: number }>();
const PERSISTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Public fetch function ───────────────────────────────────────────

export async function apiFetch<T>(path: string): Promise<T | null> {
  if (!RAPIDAPI_KEY) return null;

  // 1. Check persistent cache first (cross-request)
  const cached = persistentCache.get(path);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }

  // 2. Deduplicate concurrent calls within the same request
  if (dedupCache.has(path)) {
    return dedupCache.get(path)! as Promise<T | null>;
  }

  const promise = fetchWithRetry<T>(path);
  dedupCache.set(path, promise);
  promise.finally(() => dedupCache.delete(path));

  // 3. Store in persistent cache on success
  promise.then((result) => {
    if (result) {
      persistentCache.set(path, { data: result, expiresAt: Date.now() + PERSISTENT_TTL_MS });
    }
  });

  return promise;
}

async function fetchWithRetry<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "x-apisports-key": RAPIDAPI_KEY! } as HeadersInit,
        next: { revalidate: 3600 },
      });

      if (res.status === 429) {
        console.warn("API-Football rate limited (429) — retry", attempt + 1);
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }

      if (!res.ok) {
        console.warn("API-Football error:", res.status, "for", path);
        return null;
      }

      const json = await res.json();
      if (json.errors && Object.keys(json.errors).length > 0) {
        console.warn("API-Football errors:", json.errors);
        return null;
      }

      return json as T;
    } catch (err) {
      console.warn("API-Football fetch failed:", path, err);
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

// ─── Clear both caches (for admin panel) ──────────────────────────────

export function clearApiCache(): void {
  dedupCache.clear();
  persistentCache.clear();
}
