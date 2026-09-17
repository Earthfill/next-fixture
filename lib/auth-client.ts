"use client";

// ---------------------------------------------------------------------------
// Client-side auth store — shared by the auth forms, header menu and chat.
// ---------------------------------------------------------------------------
// The header lives in the root layout, so it never remounts on a client-side
// navigation. It used to fetch /api/auth/me exactly once on mount, which meant
// that after registering or logging in the header kept showing
// "Sign in / Register" until a hard reload — so a brand-new signup looked like
// it had failed. Every consumer now reads this store instead:
//
//   const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, SERVER_SNAPSHOT);
//
// and calls loadCurrentUser() on mount. Writers (login, register, logout,
// verify) announce the change with notifyAuthChanged(), which drops the cache
// and dispatches AUTH_CHANGED_EVENT so every consumer resyncs at once.
// Reads are deduped, so the menu + banner + chat share one request.

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  verified: boolean;
}

export interface AuthSnapshot {
  user: AuthUser | null;
  /** False until the first /api/auth/me response has landed. */
  loaded: boolean;
}

export const AUTH_CHANGED_EVENT = "nf:auth-changed";

/** Stable reference for SSR / hydration (useSyncExternalStore getServerSnapshot). */
export const SERVER_AUTH_SNAPSHOT: AuthSnapshot = { user: null, loaded: false };

let snapshot: AuthSnapshot = SERVER_AUTH_SNAPSHOT;
let inflight: Promise<AuthUser | null> | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Current auth state — read via useSyncExternalStore, never mutated directly. */
export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/** Subscribe to store changes. Returns the unsubscribe function. */
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current user from the session cookie, or null when signed out. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.user;
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      // Older responses omit the flag; treat "missing" as unverified so the
      // verify prompt is never silently hidden.
      verified: user.verified === true,
    };
  } catch {
    return null;
  }
}

/**
 * Load the current user through the shared cache. Concurrent callers get the
 * same request; pass `force` to refetch after a known session change.
 */
export async function loadCurrentUser({ force = false } = {}): Promise<AuthUser | null> {
  if (!force && snapshot.loaded) return snapshot.user;
  if (inflight) return inflight;
  inflight = fetchCurrentUser()
    .then((user) => {
      publish({ user, loaded: true });
      return user;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Announce that the session changed (login, register, verify, logout).
 * Pass the freshly-returned user to update every consumer immediately, or omit
 * it to just invalidate the cache and let consumers refetch.
 */
export function notifyAuthChanged(user?: AuthUser | null): void {
  inflight = null;
  if (user !== undefined) publish({ user, loaded: true });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** POST /api/auth/resend-verification — shared by the banner, menu and chat. */
export async function resendVerificationEmail(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, error: data?.error ?? "Could not send the verification email." };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

