// ---------------------------------------------------------------------------
// TeamResultsSection — recent finished matches with scores
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { Fixture } from "@/lib/types";

interface TeamResultsSectionProps {
  teamName: string;
  results: Fixture[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function TeamResultsSection({ teamName, results }: TeamResultsSectionProps) {
  if (!results.length) return null;

  return (
    <div>
      <h2 className="sm-section-heading mb-2">Recent League Results</h2>
      <div className="border border-zinc-200 bg-white">
        {results.map((f) => {
          const isHome = f.homeTeam.name === teamName;
          const opponent = isHome ? f.awayTeam.name : f.homeTeam.name;
          const score = f.score ? `${f.score.home}-${f.score.away}` : "–";
          const won = f.score && (isHome ? f.score.home > f.score.away : f.score.away > f.score.home);
          const lost = f.score && (isHome ? f.score.home < f.score.away : f.score.away < f.score.home);
          return (
            <Link
              key={f.id}
              href={`/previews/${f.slug}`}
              prefetch={false}
              className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0 hover:bg-zinc-50 transition-colors"
            >
              <span className="w-12 shrink-0 text-[11px] text-zinc-400">{formatDate(f.date)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{opponent}</span>
              <span
                className={`shrink-0 text-sm font-bold ${
                  won ? "text-emerald-600" : lost ? "text-red-600" : "text-zinc-500"
                }`}
              >
                {score}
              </span>
              <span className="hidden sm:block w-28 shrink-0 truncate text-right text-[11px] text-zinc-400">
                {f.competition}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}