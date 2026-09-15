"use client";

// ---------------------------------------------------------------------------
// ChatModeration — admin view of preview chat messages (approve / delete).
// Protected client-side by the caller; server requires ADMIN_SECRET bearer.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Check, Trash2, Loader2, RefreshCw } from "lucide-react";

type Status = "approved" | "pending" | "removed";

interface ModMessage {
  id: string;
  slug: string;
  userId: string;
  body: string;
  parentId: string | null;
  moderationStatus: Status;
  removedBy: string | null;
  createdAt: string;
  displayName: string | null;
  email: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  approved: "Approved",
  pending: "Pending",
  removed: "Removed",
};

const STATUS_STYLE: Record<Status, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  removed: "bg-zinc-100 text-zinc-500",
};

export default function ChatModeration({ token }: { token: string }) {
  const [messages, setMessages] = useState<ModMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/chat?limit=200", { headers });
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Defer so the initial fetch's state updates land in async callbacks
    // (keeps the effect pure per react-hooks/set-state-in-effect).
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function moderate(id: string, action: "approve" | "delete") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error("Moderation failed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <MessageSquare className="h-4 w-4" />
          </div>
          Preview Chat Moderation
        </h2>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
        </p>
      ) : messages.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-400">No chat messages yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                  <span className="font-semibold text-zinc-800">{m.displayName ?? "Deleted user"}</span>
                  <span>·</span>
                  <span className="font-mono">{m.slug}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[m.moderationStatus]}`}
                  >
                    {STATUS_LABEL[m.moderationStatus]}
                    {m.moderationStatus === "removed" && m.removedBy ? ` by ${m.removedBy}` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-700 break-words">{m.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {m.moderationStatus !== "approved" && (
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => moderate(m.id, "approve")}
                    className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === m.id}
                  onClick={() => moderate(m.id, "delete")}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}