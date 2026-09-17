"use client";

// ---------------------------------------------------------------------------
// AccountMenu — header auth widget. Shows "Sign in / Register" when logged
// out, or the user's display name + Logout when logged in.
// ---------------------------------------------------------------------------

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, MailWarning, UserPlus } from "lucide-react";
import {
  AUTH_CHANGED_EVENT,
  getAuthSnapshot,
  loadCurrentUser,
  notifyAuthChanged,
  subscribeAuth,
  SERVER_AUTH_SNAPSHOT,
} from "@/lib/auth-client";

export default function AccountMenu() {
  // Shared auth store rather than a one-shot fetch: this widget sits in the root
  // layout and so never remounts on navigation. Reading the store means a
  // successful login/register flips it immediately instead of after a reload.
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => SERVER_AUTH_SNAPSHOT);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const me = snapshot.user;

  // First load, then resync whenever the session changes elsewhere (another
  // component, another tab) or the tab regains focus.
  useEffect(() => {
    void loadCurrentUser();
    const sync = () => void loadCurrentUser({ force: true });
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    notifyAuthChanged(null); // clears the store for every consumer at once
    setOpen(false);
    router.refresh();
  }

  const checked = snapshot.loaded;

  // Desktop/inline style: compact menu on the right side of the nav bar.
  return (
    <div className="relative">
      {!checked ? (
        <span className="text-xs text-white/60">…</span>
      ) : !me ? (
        <div className="flex flex-col md:flex-row items-center gap-2 lg:gap-3 [&_span]:w-full [&_span]:text-center">
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="flex items-center gap-1 w-full md:w-fit rounded px-3 py-1.5 text-sm font-medium text-black hover:bg-yellow-400/70 bg-yellow-400 transition-colors"
          >
            <LogIn className="hidden md:inline h-4 w-4" />
            <span className="inline md:hidden lg:inline">Sign in</span>
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(pathname)}`}
            className="flex items-center gap-1 w-full md:w-fit rounded bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25 transition-colors"
          >
            <UserPlus className="hidden md:inline h-4 w-4" />
            <span className="inline md:hidden lg:inline">Register</span>
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white">
              {me.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden lg:inline max-w-40 truncate">{me.displayName}</span>
            {!me.verified && (
              <span title="Email not verified yet">
                <MailWarning aria-label="Email not verified yet" className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              </span>
            )}
          </button>
          {open && (
            <button
              type="button"
              onClick={logout}
              onBlur={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Log out</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}