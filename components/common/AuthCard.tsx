"use client";

// ---------------------------------------------------------------------------
// AuthCard — shared login / register form (posts to /api/auth/*).
// ---------------------------------------------------------------------------
// Register no longer redirects straight after the POST: the account is created
// unverified, so we show a "Check your inbox" panel (with resend + a link to
// carry on) and announce the new session through the shared auth store so the
// header updates immediately instead of still reading "Sign in / Register".

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, LogIn,
  Mail, MailCheck, TriangleAlert, User, UserPlus,
} from "lucide-react";
import { notifyAuthChanged, resendVerificationEmail, type AuthUser } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

/** Accounts created since email verification shipped must confirm their inbox. */
interface PendingSignup {
  email: string;
  /** False when Resend isn't configured or the send failed. */
  emailSent: boolean;
  /** Provider's reason (when the send failed) — shown so a rejection is visible. */
  emailError?: string | null;
}

const FIELD_WRAP =
  "flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#002b5c]";
const FIELD_INPUT =
  "w-full bg-transparent py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none";
const FIELD_LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500";

export default function AuthCard({
  mode,
  next,
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const router = useRouter();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Post-registration confirmation panel.
  const [pending, setPending] = useState<PendingSignup | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const target = next && next.startsWith("/") ? next : "/";
  const passwordsMatch = !confirmPassword || password === confirmPassword;

  function validate(): string | null {
    if (isLogin) return null;
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setResendNote(null);

    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isLogin ? { email, password } : { email, displayName, password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      // The session cookie is set — tell every consumer (header, banner, chat).
      const user: AuthUser | null = data?.user ?? null;
      notifyAuthChanged(user);

      if (!isLogin) {
        // Stay here and confirm: the account exists but the email is unverified.
        setPending({
          email,
          emailSent: data?.verificationEmailSent === true,
          emailError: data?.verificationEmailError ?? null,
        });
        return;
      }

      router.push(target);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Back to an empty register form from the confirmation panel. A plain
   * `<Link href="/register">` would be a no-op here (same route, no remount), so
   * the panel would stay put — reset the local state instead.
   */
  function resetSignup() {
    setPending(null);
    setResendNote(null);
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function onResend() {
    setResending(true);
    setResendNote(null);
    const result = await resendVerificationEmail();
    setResending(false);
    if (result.ok) {
      setResendNote("Verification email sent — check your inbox.");
    } else {
      setError(result.error ?? "Could not send the verification email.");
    }
  }

  // ── After registering: confirm the inbox instead of silently redirecting ──
  // The account exists from the moment the POST returns, but it starts
  // unverified. Previously we pushed to "/" straight away, so a brand-new
  // signup gave no feedback at all and looked like a failure.
  if (pending) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">Check your inbox</h1>
              <p className="text-xs text-zinc-500">One more step before you can post.</p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-zinc-600">
            Your account is ready — we sent a verification link to{" "}
            <strong className="font-semibold text-zinc-900">{pending.email}</strong>. Click it to
            confirm your address and join the match discussions.
          </p>

          {pending.emailSent ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verification email sent
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                The link expires in 24 hours. Can&apos;t see it? Check your spam or promotions
                folder.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <TriangleAlert className="h-3.5 w-3.5" /> We couldn&apos;t send the email
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Your account was created, but the verification email didn&apos;t go through.
                {pending.emailError
                  ? ` ${pending.emailError}`
                  : " Use “Resend email” below to try again."}
              </p>
            </div>
          )}

          <ol className="mt-5 space-y-2.5">
            {[
              "Open the email from NextFixture.",
              "Click “Verify my email”.",
              "Come back here — you can post straight away.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-600">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#002b5c]/10 text-[10px] font-bold text-[#002b5c]">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {resendNote && (
            <p className="mt-4 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {resendNote}
            </p>
          )}
          {error && (
            <p className="mt-4 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Resend email
            </button>
            <Link
              href={target}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#002b5c] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001a3a]"
            >
              Continue to the site <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-500">
            Wrong address?{" "}
            <button
              type="button"
              onClick={resetSignup}
              className="font-semibold text-[#002b5c] hover:underline cursor-pointer"
            >
              Use a different email
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Login / register form ────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#002b5c] text-white">
            {isLogin ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">
              {isLogin ? "Welcome back" : "Create a free account"}
            </h1>
            <p className="text-xs text-zinc-500">
              {isLogin
                ? "Sign in to join the match discussions."
                : "We'll email you a link to confirm, then you can start discussing."}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="display-name" className={FIELD_LABEL}>
                Display name
              </label>
              <div className={FIELD_WRAP}>
                <User className="h-4 w-4 text-zinc-400" />
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={30}
                  required
                  autoComplete="nickname"
                  placeholder="e.g. Alex"
                  className={FIELD_INPUT}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className={FIELD_LABEL}>
              Email
            </label>
            <div className={FIELD_WRAP}>
              <Mail className="h-4 w-4 text-zinc-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={FIELD_INPUT}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className={FIELD_LABEL}>
              Password
            </label>
            <div className={FIELD_WRAP}>
              <Lock className="h-4 w-4 text-zinc-400" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder={isLogin ? "Your password" : "8+ characters"}
                className={FIELD_INPUT}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!isLogin && (
              <p className="mt-1 text-xs text-zinc-500">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="confirm-password" className={FIELD_LABEL}>
                Confirm password
              </label>
              <div
                className={`${FIELD_WRAP}${
                  passwordsMatch ? "" : " border-red-300 focus-within:border-red-400"
                }`}
              >
                <Lock className="h-4 w-4 text-zinc-400" />
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  aria-invalid={!passwordsMatch}
                  className={FIELD_INPUT}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  aria-pressed={showConfirmPassword}
                  className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword &&
                (passwordsMatch ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match.
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
                    <TriangleAlert className="h-3.5 w-3.5" /> Passwords do not match.
                  </p>
                ))}
            </div>
          )}
          {error && (
            <p className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#002b5c] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLogin ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500">
          {isLogin ? (
            <>
              Don&apos;t have an account?{" "}
              <Link
                href={`/register?next=${encodeURIComponent(next ?? "/")}`}
                className="font-semibold text-[#002b5c] hover:underline"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href={`/login?next=${encodeURIComponent(next ?? "/")}`}
                className="font-semibold text-[#002b5c] hover:underline"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}