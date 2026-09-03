// ---------------------------------------------------------------------------
// PastResults — Recent match results for a league
// ---------------------------------------------------------------------------
import Image from "next/image";
import type { Fixture } from "@/lib/types";

interface PastResultsProps {
  results: Fixture[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function PastResults({ results }: PastResultsProps) {
  if (!results.length) return null;

  return (
    <div>
      <h2 className="sm-section-heading">Past Results</h2>
      <div className="border border-zinc-200 bg-white">
        {results.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors group"
          >
            {/* Date */}
            <div className="w-14 shrink-0 text-center">
              <span className="text-[10px] font-medium text-zinc-400">{formatDate(f.date)}</span>
            </div>

            {/* Home team */}
            <div className="flex items-center gap-1.5 w-[35%] justify-end">
              <span className="text-xs font-medium text-zinc-700 truncate group-hover:text-[#002b5c] transition-colors">
                {f.homeTeam.shortName}
              </span>
              <Image src={f.homeTeam.logo} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
            </div>

            {/* Score */}
            <div className="w-14 shrink-0 text-center">
              {f.score ? (
                <span className="text-xs font-bold text-zinc-800">
                  {f.score.home} - {f.score.away}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-300">–</span>
              )}
            </div>

            {/* Away team */}
            <div className="flex items-center gap-1.5 w-[35%]">
              <Image src={f.awayTeam.logo} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              <span className="text-xs font-medium text-zinc-700 truncate group-hover:text-[#002b5c] transition-colors">
                {f.awayTeam.shortName}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
