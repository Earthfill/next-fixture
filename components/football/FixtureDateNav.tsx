// ---------------------------------------------------------------------------
// FixtureDateNav — Date navigation for /fixtures/[date] pages.
// Server component (no "use client"): renders prev/next arrows plus a
// horizontally scrollable strip of every available matchday, highlighting the
// currently viewed date. Matchday metadata comes from the same cached
// upcoming-fixtures list the homepage / sitemap use, so no extra API call.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { siteToday } from "@/lib/dates";

export interface MatchdayMeta {
  date: string;
  label: string;
  slug: string;
  fixtureCount: number;
}

/** Short pill label e.g. "Fri 12 Sep". */
function pillLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function FixtureDateNav({
  matchdays,
  currentDate,
}: {
  matchdays: MatchdayMeta[];
  currentDate: string;
}) {
  if (!matchdays.length) return null;

  const index = matchdays.findIndex((md) => md.date === currentDate);
  const prev = index > 0 ? matchdays[index - 1] : undefined;
  const next = index >= 0 && index < matchdays.length - 1 ? matchdays[index + 1] : undefined;
  const today = siteToday();

  const arrowBase =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors";
  const arrowActive = "border-zinc-300 text-zinc-600 hover:border-[#002b5c] hover:text-[#002b5c]";
  const arrowDisabled = "border-zinc-100 text-zinc-300 cursor-not-allowed";

  return (
    <nav aria-label="Fixtures by date" className="mt-4 mb-2">
      <div className="flex items-center gap-2">
        {prev ? (
          <Link
            href={`/fixtures/${prev.slug}`}
            className={`${arrowBase} ${arrowActive}`}
            aria-label={`Previous fixtures: ${prev.label}`}
            title={prev.label}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className={`${arrowBase} ${arrowDisabled}`}>
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}

        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {matchdays.map((md) => {
            const active = md.date === currentDate;
            const isToday = md.date === today;
            return (
              <Link
                key={md.date}
                href={`/fixtures/${md.slug}`}
                title={md.label}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#002b5c] bg-[#002b5c] text-white"
                    : "border-zinc-200 text-zinc-600 hover:border-[#002b5c] hover:text-[#002b5c]"
                }`}
              >
                {pillLabel(md.date)}
                {isToday && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      active ? "bg-white/20 text-white" : "bg-[#002b5c] text-white"
                    }`}
                  >
                    Today
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {next ? (
          <Link
            href={`/fixtures/${next.slug}`}
            className={`${arrowBase} ${arrowActive}`}
            aria-label={`Next fixtures: ${next.label}`}
            title={next.label}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={`${arrowBase} ${arrowDisabled}`}>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}