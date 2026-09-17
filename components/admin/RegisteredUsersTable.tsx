"use client";

// ---------------------------------------------------------------------------
// RegisteredUsersTable — /admin "Registered Users" table view (inline section)
// ---------------------------------------------------------------------------
// The accounts render directly on the admin page in a full-width panel, no
// drawer — matching the FixtureList table language (sortable headers, badges,
// right-aligned numeric cells). Loads /api/admin/users with the ADMIN_SECRET
// bearer; search + verified filter + sort all run in the browser.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronsDown,
  ChevronsUp,
  ChevronsUpDown,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";

interface UserStats {
  total: number;
  verified: number;
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
  pendingTokenCount: number;
  lastTokenSentAt: string | null;
}

type VerifiedFilter = "all" | "verified" | "unverified";
type SortKey = "name" | "email" | "status" | "joined" | "messages" | "lastLogin" | "linkAge";
type SortDir = "asc" | "desc";

const SORTABLE: { key: SortKey; label: string }[] = [
  { key: "name", label: "User" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "linkAge", label: "Verification link" },
  { key: "joined", label: "Joined" },
  { key: "messages", label: "Messages" },
  { key: "lastLogin", label: "Last login" },
];

const VERIFIED_STYLE: Record<"verified" | "unverified", string> = {
  verified: "bg-emerald-50 text-emerald-700",
  unverified: "bg-amber-50 text-amber-700",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "3 days ago" — used for link age and last login. */
function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function sortValue(u: RegisteredUser, key: SortKey): string | number {
  switch (key) {
    case "name":
      return u.displayName.toLowerCase();
    case "email":
      return u.email.toLowerCase();
    case "status":
      return u.verified ? 1 : 0;
    case "joined":
      return u.joinedAt ? new Date(u.joinedAt).getTime() : 0;
    case "messages":
      return u.messageCount;
    case "lastLogin":
      return u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
    case "linkAge":
      return u.lastTokenSentAt ? new Date(u.lastTokenSentAt).getTime() : 0;
  }
}


export default function RegisteredUsersTable({
  token,
  stats,
}: {
  token: string;
  stats: UserStats | null;
}) {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("verified");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  useEffect(() => {
    // Deferred so state updates land in async callbacks (react-hooks purity).
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

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

  const verifiedCount = users.filter((u) => u.verified).length;
  const pendingCount = users.length - verifiedCount;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sign = sortDir === "asc" ? 1 : -1;
    return users
      .filter((u) => {
        if (verifiedFilter === "verified" && !u.verified) return false;
        if (verifiedFilter === "unverified" && u.verified) return false;
        if (!q) return true;
        return `${u.displayName} ${u.email}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
        return sign * String(av).localeCompare(String(bv));
      });
  }, [users, query, verifiedFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronsUp className="h-3 w-3 text-[#002b5c]" />
    ) : (
      <ChevronsDown className="h-3 w-3 text-[#002b5c]" />
    );
  };


  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Registered Users</h2>
            <p className="text-xs text-zinc-500">
              {stats === null
                ? "User store unavailable"
                : `${stats.total} account${stats.total === 1 ? "" : "s"} · ${stats.verified} verified${
                    stats.pending > 0 ? ` · ${stats.pending} awaiting verification` : ""
                  }`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setVerifiedFilter((f) => (f === "unverified" ? "all" : "unverified"))}
              aria-pressed={verifiedFilter === "unverified"}
              title="Show only accounts that registered but never clicked the email link"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                verifiedFilter === "unverified"
                  ? "bg-[#002b5c] text-white"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              <MailWarning className="h-3.5 w-3.5" /> Needs follow-up ({pendingCount})
            </button>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
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
        {!loading && (
          <span className="ml-auto text-xs text-zinc-500">
            Showing {rows.length} of {users.length} accounts
          </span>
        )}
      </div>
      {/* Notice / error / states */}
      <div className="px-5 py-3">
        {notice && (
          <p className="mb-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <MailCheck className="h-3.5 w-3.5 shrink-0" /> {notice}
          </p>
        )}
        {error && (
          <p className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
        {!available && !error && (
          <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            The user store is unreachable, so accounts cannot be listed right now. Try Refresh in a
            moment.
          </p>
        )}
      </div>

      {loading && users.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-xs text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </p>
      ) : users.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-6 text-sm text-zinc-400">
          <Inbox className="h-4 w-4" /> No registered users yet.
        </p>
      ) : (
        <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left">
                {SORTABLE.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${
                      col.key === "messages" ? "text-right" : ""
                    } ${col.key === "name" ? "px-5" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-zinc-700"
                    >
                      {col.label} {sortIcon(col.key)}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-zinc-400">
                    No accounts match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((u) => {
                  const busy = verifyingId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/70">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#002b5c]/5 text-[11px] font-bold text-[#002b5c]">
                            {initials(u.displayName, u.email)}
                          </div>
                          <span className="text-sm font-medium text-zinc-800">{u.displayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`mailto:${u.email}`}
                          title={u.email}
                          className="block max-w-[220px] truncate text-xs text-zinc-500 hover:text-[#002b5c] hover:underline"
                        >
                          {u.email}
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-500">
                        {u.verified ? (
                          "—"
                        ) : u.lastTokenSentAt ? (
                          <>
                            Sent {formatAge(u.lastTokenSentAt)}
                            <span className={u.pendingTokenCount > 0 ? "text-emerald-600" : "text-red-500"}>
                              {" · "}
                              {u.pendingTokenCount > 0 ? "still valid" : "link expired"}
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-400">No link on record</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-600">
                        {formatDate(u.joinedAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-medium text-zinc-800">{u.messageCount}</span>
                        {u.messageCount > 0 && u.approvedMessageCount !== u.messageCount && (
                          <span className="ml-1 text-[11px] text-zinc-400">
                            ({u.approvedMessageCount} live)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-600">
                        {formatAge(u.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`mailto:${u.email}`}
                            aria-label={`Email ${u.displayName}`}
                            title={`Email ${u.displayName}`}
                            className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-[#002b5c]"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                          {!u.verified && (
                            <button
                              type="button"
                              onClick={() => verifyUser(u)}
                              disabled={busy}
                              title="Mark this email as verified without waiting for the link"
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3 w-3" />
                              )}
                              Verify
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
