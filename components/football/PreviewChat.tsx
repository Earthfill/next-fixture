"use client";

// ---------------------------------------------------------------------------
// PreviewChat — logged-in threaded discussion widget for /previews/[slug]
// ---------------------------------------------------------------------------
// Fetches the approved thread (public GET), requires a session for the POST /
// reply composer, and polls every ~8s for near-live updates without needing a
// websocket/broadcast provider. Author can remove their own messages.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, Send, Lock, Reply, X, Trash2, Loader2, Mail } from "lucide-react";
import { usePathname } from "next/navigation";

type ChatStatus = "approved" | "pending" | "removed";

interface ChatUser {
  id: string;
  displayName: string;
  email: string;
}

interface ChatMessage {
  id: string;
  slug: string;
  user: ChatUser;
  body: string;
  parentId: string | null;
  moderationStatus: ChatStatus;
  removedBy: string | null;
  createdAt: string;
}

interface Me {
  id: string;
  displayName: string;
  email: string;
  verified: boolean;
}

const POLL_MS = 8000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return "";
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
export default function PreviewChat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [posting, setPosting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const pathname = usePathname();

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/previews/${encodeURIComponent(slug)}/chat`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch {
      // non-fatal; keep last known list
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    mounted.current = true;
    // Defer the initial fetch so state updates land in async callbacks (keeps
    // the effect pure per react-hooks/set-state-in-effect).
    const initial = setTimeout(() => loadMessages(), 0);
    // Determine logged-in state (a 401 simply resolves to null).
    setTimeout(() => {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { user: null }))
        .then((data) => mounted.current && setMe(data.user ?? null))
        .catch(() => mounted.current && setMe(null));
    }, 0);

    const interval = setInterval(loadMessages, POLL_MS);
    const onFocus = () => loadMessages();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadMessages]);

  const topLevel = useMemo(
    () => messages.filter((m) => !m.parentId),
    [messages]
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (m.parentId) {
        const arr = map.get(m.parentId) ?? [];
        arr.push(m);
        map.set(m.parentId, arr);
      }
    }
    map.forEach((arr) => arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [messages]);

  async function handlePost() {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/previews/${encodeURIComponent(slug)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: replyingTo?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not post your message.");
        if (res.status === 401) setMe(null);
        return;
      }
      if (data?.message) {
        setMessages((prev) => [data.message, ...prev]);
      }
      setText("");
      setReplyingTo(null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleRemove(msg: ChatMessage) {
    try {
      const res = await fetch(`/api/previews/${encodeURIComponent(slug)}/chat/${msg.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, moderationStatus: "removed" } : m))
        );
      } else {
        setError("Could not remove the message.");
      }
    } catch {
      setError("Could not remove the message.");
    }
  }

  async function handleResend() {
    setResending(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendMessage("Verification email sent — check your inbox.");
      } else {
        setError(data?.error ?? "Could not resend the verification email.");
      }
    } catch {
      setError("Could not resend the verification email.");
    } finally {
      setResending(false);
    }
  }

  function renderMessage(msg: ChatMessage, isReply: boolean) {
    const isMine = me?.id === msg.user.id;
    const removed = msg.moderationStatus === "removed";
    return (
      <div
        key={msg.id}
        className={
          isReply ? "ml-4 sm:ml-8 mt-1.5 border-l-2 border-zinc-100 pl-3" : undefined
        }
      >
        <div
          className={
            removed
              ? "rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
              : "rounded-lg border border-zinc-200 bg-white px-3 py-2"
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {removed ? (
                <p className="text-[11px] italic text-zinc-400">Message removed</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                    <span className="font-semibold text-[#002b5c]">{msg.user.displayName}</span>
                    <span>{timeAgo(msg.createdAt)}</span>
                    {isReply && <span className="text-zinc-400">· reply</span>}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-800">
                    {msg.body}
                  </p>
                </>
              )}
            </div>
            {!removed && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setReplyingTo(msg)}
                  aria-label="Reply"
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-[#002b5c] cursor-pointer"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
                {isMine && (
                  <button
                    type="button"
                    onClick={() => handleRemove(msg)}
                    aria-label="Remove message"
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {repliesByParent.get(msg.id)?.map((r) => renderMessage(r, true))}
      </div>
    );
  }

  return (
    <section aria-label="Match discussion" className="mt-8" id="discussion">
      <h2 className="sm-section-heading flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Match Discussion
      </h2>

      {/* Logged-out gate */}
      {!me && !loading && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <Lock className="h-4 w-4 text-zinc-400" />
          <span>
            Join the discussion —{" "}
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="font-semibold text-[#002b5c] hover:underline"
            >
              sign in
            </Link>{" "}
            or{" "}
            <Link
              href={`/register?next=${encodeURIComponent(pathname)}`}
              className="font-semibold text-[#002b5c] hover:underline"
            >
              create a free account
            </Link>
            .
          </span>
        </div>
      )}

      {/* Composer / verify gate */}
      {me && !me.verified ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Verify your email</p>
          <p className="mt-0.5 text-sm leading-relaxed text-amber-800">
            Please confirm your email address to join the discussion. We emailed a link to{" "}
            <span className="font-medium">{me.email}</span>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 rounded bg-[#002b5c] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#001a3a] disabled:opacity-60 cursor-pointer"
            >
              {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Resend verification email
            </button>
          </div>
          {resendMessage && (
            <p className="mt-2 text-xs font-medium text-emerald-700">{resendMessage}</p>
          )}
        </div>
      ) : (
      <div className="mt-3">
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded border border-[#002b5c]/20 bg-[#002b5c]/5 px-3 py-1.5 text-xs text-zinc-600">
            <span className="truncate">
              Replying to{" "}
              <span className="font-semibold text-[#002b5c]">{replyingTo.user.displayName}</span>
              {replyingTo.body.length > 40
                ? `: "${replyingTo.body.slice(0, 40)}…"`
                : `: "${replyingTo.body}"`}
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="ml-2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePost();
            }}
            rows={2}
            maxLength={1000}
            disabled={!me || posting}
            placeholder={
              me ? "Join the discussion about this match…" : "Sign in to join the discussion."
            }
            className="w-full resize-y rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400">{text.length}/1000</span>
            <button
              type="button"
              onClick={handlePost}
              disabled={!me || !text.trim() || posting}
              className="inline-flex items-center gap-1.5 rounded bg-[#002b5c] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post
            </button>
          </div>
        </div>
        {me && (
          <p className="mt-1 text-[11px] text-zinc-400">
            Posting as <span className="font-medium text-zinc-600">{me.displayName}</span>
          </p>
        )}
        {error && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
      )}

      {/* Thread */}
      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-zinc-400">Loading discussion…</p>}
        {!loading && topLevel.length === 0 && (
          <p className="text-sm text-zinc-400">No discussion yet — be the first to comment.</p>
        )}
        {topLevel.map((msg) => renderMessage(msg, false))}
      </div>
    </section>
  );
}

