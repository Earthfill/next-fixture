"use client";

// ---------------------------------------------------------------------------
// RegisteredUsersCard — /admin "Registered Users" stat card + account drawer
// ---------------------------------------------------------------------------
// The card is server-rendered from getUserStats() so the dashboard stays a
// single pass; clicking it opens a slide-in drawer (same animation as the
// header Competitions drawer) holding the actual accounts, fetched lazily from
// /api/admin/users with the ADMIN_SECRET bearer token. Search + verified filter
// run in the browser, mirroring the FixtureList toolbar.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  MailCheck,
  MailWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

interface UserStats {
  total: number;
  verified: number;
  /** Registered but email not confirmed yet — surfaced as a nudge on the card. */
  pending: number;
}

interface RegisteredUser {
  id: string;
  email: string;
  displayName: string;
  verified: boolean;
  joinedAt: string | null;
  messageCount: number;
  approvedMessageCount: number;
  lastSeenAt: string | null;
  /** Unused, unexpired verification links the account can still click. */
  pendingTokenCount: number;
  /** When the most recent verification email was generated. */
  lastTokenSentAt: string | null;
}

type VerifiedFilter = "all" | "verified" | "unverified";

const VERIFIED_STYLE: Record<"verified" | "unverified", string> = {
  verified: "bg-emerald-50 text-emerald-700",
  unverified: "bg-amber-50 text-amber-700",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "3 days ago" — used to show how long a pending account has been waiting. */
function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : formatDate(iso);
}

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function RegisteredUsersCard({
  token,
  stats,
}: {
  token: string;
  stats: UserStats | null;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAvailable(data.available !== false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  /** Mark an unverified account as verified without waiting for the email link. */
  const verifyUser = useCallback(
    async (user: RegisteredUser) => {
      if (user.verified || verifyingId) return;
      setVerifyingId(user.id);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: user.id, action: "verify" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Could not verify (${res.status})`);
        setNotice(`${user.displayName}'s email was marked as verified.`);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setVerifyingId(null);
      }
    },
    [token, verifyingId, load]
  );

  // Fetch when the drawer opens (and on Refresh) — never for the closed card.
  // Deferred so the state updates land in async callbacks
  // (keeps the effect pure per react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [open, load]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const verifiedCount = users.filter((u) => u.verified).length;
  const pendingCount = users.length - verifiedCount;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (verifiedFilter === "verified" && !u.verified) return false;
      if (verifiedFilter === "unverified" && u.verified) return false;
      if (!q) return true;
      return `${u.displayName} ${u.email}`.toLowerCase().includes(q);
    });
  }, [users, query, verifiedFilter]);

  return (
    <>
      {/* Stats card — clicking it opens the registered-users drawer */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="View registered users"
        className="group rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 cursor-pointer"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Users className="h-5 w-5" />
          </div>
          {stats !== null && stats.verified > 0 && (
            <span
              title={`${stats.verified} of ${stats.total} accounts have a verified email`}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
            >
              <CheckCircle2 className="h-3 w-3" /> {stats.verified}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold leading-none text-zinc-900">
          {stats === null ? "—" : stats.total}
        </p>
        <p className="mt-1.5 flex items-center gap-0.5 text-xs font-medium text-zinc-500">
          Registered Users
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 transition-colors group-hover:text-[#002b5c]" />
        </p>
        {/* Nudge: accounts that registered but never clicked the emailed link. */}
        {stats !== null && stats.pending > 0 && (
          <p className="mt-1 text-[11px] font-medium text-amber-600">
            {stats.pending} awaiting email verification
          </p>
        )}
      </button>

      {/* ─── Registered-users drawer ────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Registered users"
        >
          <div
            className="flex-1 bg-black/40 animate-[fadeIn_200ms_ease-out]"
            onClick={() => setOpen(false)}
          />
          <div className="flex w-full max-w-lg flex-col bg-white shadow-xl animate-[slideInRight_250ms_ease-out]">
            {/* Drawer header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">Registered Users</h2>
                  <p className="text-xs text-zinc-500">
                    {available
                      ? `${users.length} account${users.length === 1 ? "" : "s"} · ${verifiedCount} verified${
                          pendingCount > 0 ? ` · ${pendingCount} awaiting verification` : ""
                        }`
                      : "User store unavailable"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
                />
              </div>
              <select
                value={verifiedFilter}
                onChange={(e) => setVerifiedFilter(e.target.value as VerifiedFilter)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-[#002b5c]/40 focus:outline-none"
              >
                <option value="all">All accounts</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified only</option>
              </select>
              {/* Quick view: jump straight to the follow-up list. */}
              {pendingCount > 0 && verifiedFilter !== "unverified" && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setVerifiedFilter("unverified");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 cursor-pointer"
                >
                  <MailWarning className="h-3.5 w-3.5" /> Needs follow-up ({pendingCount})
                </button>
              )}
            </div>

            {/* Account list */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {error && (
                <p className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </p>
              )}
              {notice && (
                <p className="mb-3 flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {notice}
                </p>
              )}
              {!available && !error && (
                <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  The user store is unreachable, so accounts cannot be listed right now. Try Refresh in a
                  moment.
                </p>
              )}

              {loading && users.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
                </p>
              ) : users.length === 0 ? (
                <p className="flex items-center gap-2 py-6 text-sm text-zinc-400">
                  <Inbox className="h-4 w-4" /> No registered users yet.
                </p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-sm text-zinc-400">
                  {verifiedFilter === "unverified" && pendingCount === 0
                    ? "Every account has a verified email."
                    : verifiedFilter === "verified" && verifiedCount === 0
                    ? "No verified accounts yet."
                    : "No accounts match your filters."}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-zinc-500">
                    Showing {rows.length} of {users.length} accounts
                  </p>
                  <ul className="divide-y divide-zinc-100">
                    {rows.map((u) => (
                      <li key={u.id} className="flex items-start gap-3 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#002b5c]/5 text-[11px] font-bold text-[#002b5c]">
                          {initials(u.displayName, u.email)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-zinc-900">
                              {u.displayName}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                u.verified ? VERIFIED_STYLE.verified : VERIFIED_STYLE.unverified
                              }`}
                            >
                              {u.verified ? (
                                <MailCheck className="h-3 w-3" />
                              ) : (
                                <MailWarning className="h-3 w-3" />
                              )}
                              {u.verified ? "Verified" : "Awaiting verification"}
                            </span>
                            {!u.verified && (
                              <button
                                type="button"
                                onClick={() => verifyUser(u)}
                                disabled={verifyingId === u.id}
                                title="Mark this email as verified without waiting for the link"
                                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                              >
                                {verifyingId === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-3 w-3" />
                                )}
                                Verify
                              </button>
                            )}
                          </div>
                          <a
                            href={`mailto:${u.email}`}
                            className="block truncate text-xs text-zinc-500 hover:text-[#002b5c] hover:underline"
                          >
                            {u.email}
                          </a>
                          <p className="mt-1 text-[11px] text-zinc-400">
                            Joined {formatDate(u.joinedAt)} · {u.messageCount} message
                            {u.messageCount === 1 ? "" : "s"}
                            {u.messageCount > 0 && u.approvedMessageCount !== u.messageCount
                              ? ` (${u.approvedMessageCount} live)`
                              : ""}
                            {" · "}Last login {formatDate(u.lastSeenAt)}
                          </p>
                          {/* Registered but never confirmed: show how long they have
                              been waiting and whether a live link is still out there. */}
                          {!u.verified && (
                            <p className="mt-0.5 text-[11px] text-amber-600">
                              {u.lastTokenSentAt
                                ? `Verification link sent ${formatAge(u.lastTokenSentAt)}`
                                : "No verification email on record"}
                              {u.pendingTokenCount > 0 ? " · still valid" : " · link expired"}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
