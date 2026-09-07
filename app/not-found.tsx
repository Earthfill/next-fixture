// ---------------------------------------------------------------------------
// app/not-found.tsx — Global 404 page
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="text-8xl font-bold tracking-tight text-[#002b5c]">
        404
      </div>

      <h1 className="sm-heading-lg mt-6 mb-2">
        Page not found
      </h1>

      <p className="max-w-md text-sm leading-relaxed text-zinc-500">
        Sorry, we couldn&apos;t find the page you&apos;re looking for. It may
        have been moved, deleted, or the URL may be incorrect.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#002b5c] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001a3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#002b5c] focus-visible:ring-offset-2"
        >
          <Home className="h-4 w-4" />
          Go to homepage
        </Link>

        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#002b5c] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
      </div>
    </div>
  );
}
