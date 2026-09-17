"use client";

// ---------------------------------------------------------------------------
// VerifyEmailBanner — site-wide prompt for signed-in, unverified accounts
// ---------------------------------------------------------------------------
// Registering creates the account immediately, but it starts unverified and
// nothing on screen said so — the only hint lived inside a match discussion, so
// a new signup looked broken. This banner sits under the header on every page,
// names the inbox the link went to, and can re-send it (with a cooldown). It
// reads the shared auth store, so it disappears the moment the account is
// verified — including when the link is opened in another tab, because the
// store re-checks the session on window focus.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, MailWarning, RefreshCw, X } from "lucide-react";
import {
  getAuthSnapshot,
  loadCurrentUser,
  resendVerificationEmail,
  subscribeAuth,
  SERVER_AUTH_SNAPSHOT,
} from "@/lib/auth-client";

/** The resend button stays locked this long after a successful send. */
const RESEND_COOLDOWN_SECONDS = 60;
/** A dismissal only lasts the browser session — the prompt returns next visit. */
const DISMISS_KEY = "nf:verify-banner-dismissed";

export default function VerifyEmailBanner() {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => SERVER_AUTH_SNAPSHOT);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Read the session on mount, then keep it fresh: verifying in the email tab
  // must clear this banner as soon as the visitor comes back here.
  useEffect(() => {
    void loadCurrentUser();
    const onFocus = () => void loadCurrentUser({ force: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Restore a dismissal from this browser session (deferred so the state update
  // lands in an async callback — keeps the effect pure per react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
      } catch {
        // Private mode / storage disabled — just keep showing the prompt.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const user = snapshot.user;

  if (!snapshot.loaded || !user || user.verified || dismissed) return null;

  async function onResend() {
    // Re-read from the store rather than the narrowed outer `user`: TypeScript
    // resets control-flow narrowing inside function declarations.
    const current = snapshot.user;
    if (!current || sending || cooldown > 0) return;
    setSending(true);
    setNote(null);
    const result = await resendVerificationEmail();
    setSending(false);
    if (result.ok) {
      setNote({ tone: "ok", text: "New link sent." });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setNote({ tone: "error", text: result.error ?? "Could not send the email." });
    }
  }

  function onDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 print:hidden"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <MailWarning className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <strong className="font-semibold">Verify your email to join the discussion.</strong>{" "}
          We sent a link to your email — click it to
          activate your account. Can&apos;t find it? Check your spam folder.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResend}
            disabled={sending || cooldown > 0}
            className="inline-flex items-center gap-1.5 rounded bg-[#002b5c] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss verification reminder"
            className="rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {note && (
          <p
            className={`w-full text-xs font-medium ${
              note.tone === "ok" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {note.text}
          </p>
        )}
      </div>
    </div>
  );
}
