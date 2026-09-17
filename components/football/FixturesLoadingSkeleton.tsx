// ---------------------------------------------------------------------------
// FixturesLoadingSkeleton — Skeleton placeholder shown while the
// /fixtures/[date] server component resolves its cached matchday data.
// Mirrors the real page layout (breadcrumb, date nav, heading, league sections
// and match rows) so the swap to real content causes no layout shift.
// ---------------------------------------------------------------------------

import React from "react";
import { Loader2 } from "lucide-react";

/** Generic pulsing block used to compose the skeleton shapes. */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-zinc-200 ${className}`} />;
}

/** Placeholder for a single FootballMatchCard row. */
function MatchRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 py-3 px-2 last:border-b-0">
      {/* Kickoff time */}
      <div className="w-14 shrink-0 flex justify-center">
        <SkeletonBlock className="h-3.5 w-10" />
      </div>

      {/* Home team — name + crest (right aligned) */}
      <div className="flex items-center gap-2 w-[40%] justify-end min-w-0">
        <SkeletonBlock className="h-3.5 w-24 max-w-full" />
        <SkeletonBlock className="h-5.5 w-5.5 shrink-0 rounded-full" />
      </div>

      {/* VS */}
      <div className="w-10 shrink-0 flex justify-center">
        <SkeletonBlock className="h-3 w-6" />
      </div>

      {/* Away team — crest + name */}
      <div className="flex items-center gap-2 w-[40%] min-w-0">
        <SkeletonBlock className="h-5.5 w-5.5 shrink-0 rounded-full" />
        <SkeletonBlock className="h-3.5 w-24 max-w-full" />
      </div>

      {/* Venue */}
      <div className="hidden sm:flex w-36 shrink-0 justify-end">
        <SkeletonBlock className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Placeholder for one league section (heading row + match list). */
function LeagueSectionSkeleton({ rows }: { rows: number }) {
  return (
    <section>
      {/* League heading row: logo + name + match count, right aligned link */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-5 w-5 rounded-full" />
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <SkeletonBlock className="h-px w-full rounded-none" />
      <div className="mt-0 border border-zinc-200 bg-white">
        {Array.from({ length: rows }).map((_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export default function FixturesLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading fixtures"
      className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6"
    >
      <span className="sr-only">Loading fixtures…</span>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <SkeletonBlock className="h-3 w-10" />
        <SkeletonBlock className="h-3 w-2" />
        <SkeletonBlock className="h-3 w-14" />
        <SkeletonBlock className="h-3 w-2" />
        <SkeletonBlock className="h-3 w-24" />
      </div>

      {/* Date navigation — prev arrow, matchday pills, next arrow */}
      <div className="mt-4 mb-2 flex items-center gap-2">
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden py-1">
          {[72, 84, 72, 78, 72, 84, 72].map((w, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-7 shrink-0 animate-pulse rounded-full bg-zinc-200"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
        <SkeletonBlock className="h-9 w-9 rounded-lg" />
      </div>

      {/* Header */}
      <div className="mt-4 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-[#002b5c]" aria-hidden="true" />
        <span className="text-sm font-medium text-zinc-500">Loading fixtures…</span>
      </div>
      <SkeletonBlock className="mt-3 h-8 w-4/5 max-w-xl" />
      <SkeletonBlock className="mt-3 h-4 w-56" />

      {/* League sections */}
      <div className="space-y-8 mt-6">
        <LeagueSectionSkeleton rows={6} />
        <LeagueSectionSkeleton rows={4} />
        <LeagueSectionSkeleton rows={5} />
      </div>
    </div>
  );
}
