// ---------------------------------------------------------------------------
// app/error.tsx — Route-segment error boundary (App Router)
// ---------------------------------------------------------------------------
// Catches runtime errors thrown by any page/server component in this segment
// and renders a friendly fallback while keeping the global <Header>/<Footer>
// intact. Must be a Client Component so it can receive the `reset` callback.
// ---------------------------------------------------------------------------

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forward to your error-reporting service (Sentry, LogRocket, etc.) here.
    console.error("[error.tsx] Unhandled route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#002b5c]/10">
        <AlertTriangle className="h-7 w-7 text-[#002b5c]" />
      </div>

      <h1 className="sm-heading-lg mt-6 mb-2">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-500 leading-relaxed">
        We couldn&apos;t load this page. This is usually a temporary issue — please
        try again, or head back to the homepage.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#002b5c] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001a3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#002b5c] focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>

        <Link
          href="/"
          className="inline-flex items-center gap-2 border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <Home className="h-4 w-4" />
          Go to homepage
        </Link>
      </div>

      {/* Developer-only detail (never shown in production). */}
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-8 max-w-md text-xs text-zinc-400">
          {error.message || "Unknown error"}
          {error.digest ? ` (digest: ${error.digest})` : ""}
        </p>
      )}
    </div>
  );
}
