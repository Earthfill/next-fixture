// ---------------------------------------------------------------------------
// API-Football client (RapidAPI) — lightweight, no file cache
// ---------------------------------------------------------------------------
// In-memory dedup cache prevents duplicate concurrent calls within a single
// request cycle. No cross-request caching — ISR handles that.
// ---------------------------------------------------------------------------

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "v3.football.api-sports.io";
const API_BASE = "https://" + RAPIDAPI_HOST;

export function hasApi(): boolean {
  return Boolean(RAPIDAPI_KEY);
}

// ─── In-memory dedup cache (request-scoped only) ────────────────────────

const dedupCache = new Map<string, Promise<any>>();

// ─── Public fetch function ───────────────────────────────────────────

export async function apiFetch<T>(path: string): Promise<T | null> {
  if (!RAPIDAPI_KEY) return null;

  // Deduplicate concurrent calls within the same request
  if (dedupCache.has(path)) {
    return dedupCache.get(path)! as Promise<T | null>;
  }

  const promise = fetchWithRetry<T>(path);
  dedupCache.set(path, promise);
  promise.finally(() => dedupCache.delete(path));

  return promise;
}

async function fetchWithRetry<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "x-apisports-key": RAPIDAPI_KEY! } as HeadersInit,
        cache: "no-store",
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

// ─── Clear dedup cache (for admin panel) ──────────────────────────────

export function clearApiCache(): void {
  dedupCache.clear();
}
