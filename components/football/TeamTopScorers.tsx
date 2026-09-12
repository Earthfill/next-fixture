// ---------------------------------------------------------------------------
// TeamTopScorers — a team's top scorers in a league
// ---------------------------------------------------------------------------

import type { TopScorer } from "@/lib/types";

interface TeamTopScorersProps {
  scorers: TopScorer[];
}

export default function TeamTopScorers({ scorers }: TeamTopScorersProps) {
  if (!scorers.length) return null;

  return (
    <div>
      <h2 className="sm-section-heading mb-2">Top Scorers</h2>
      <div className="border border-zinc-200 bg-white divide-y divide-zinc-100">
        {scorers.map((s, i) => (
          <div key={`${s.player.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
            <span className="w-6 shrink-0 text-right text-xs font-bold text-zinc-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{s.player.name}</span>
            <span className="shrink-0 text-sm font-bold text-zinc-900">
              {s.goals}
              {s.assists != null && (
                <span className="ml-1.5 text-[11px] font-normal text-zinc-400">({s.assists})</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}