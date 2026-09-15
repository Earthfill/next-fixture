"use client";

// ---------------------------------------------------------------------------
// AccountMenu — header auth widget. Shows "Sign in / Register" when logged
// out, or the user's display name + Logout when logged in.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, UserPlus } from "lucide-react";

interface Me {
  id: string;
  displayName: string;
  email: string;
}

export default function AccountMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (active) {
          setMe(d.user ?? null);
          setChecked(true);
        }
      })
      .catch(() => active && setChecked(true));
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setMe(null);
    setOpen(false);
    router.refresh();
  }

  // Desktop/inline style: compact menu on the right side of the nav bar.
  return (
    <div className="relative">
      {!checked ? (
        <span className="text-xs text-white/60">…</span>
      ) : !me ? (
        <div className="flex items-center gap-1">
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden lg:inline">Sign in</span>
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(pathname)}`}
            className="flex items-center gap-1 rounded bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden lg:inline">Register</span>
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
            <span className="hidden lg:inline max-w-[10rem] truncate">{me.displayName}</span>
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