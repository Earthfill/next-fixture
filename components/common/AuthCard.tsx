"use client";

// ---------------------------------------------------------------------------
// AuthCard — shared login / register form (posts to /api/auth/*).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Loader2, User, UserPlus, LogIn } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const target = isLogin ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isLogin ? { email, password } : { email, displayName, password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }
      router.push(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

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
                : "We'll email you a link to confirm and start discussing."}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="display-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Display name
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#002b5c]">
                <User className="h-4 w-4 text-zinc-400" />
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={30}
                  required
                  placeholder="e.g. Alex"
                  className="w-full bg-transparent py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#002b5c]">
              <Lock className="h-4 w-4 text-zinc-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder={isLogin ? "Your password" : "8+ characters"}
                className="w-full bg-transparent py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
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
              <Link href={`/register?next=${encodeURIComponent(next ?? "/")}`} className="font-semibold text-[#002b5c] hover:underline">
                Register
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href={`/login?next=${encodeURIComponent(next ?? "/")}`} className="font-semibold text-[#002b5c] hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
