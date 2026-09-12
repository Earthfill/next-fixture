// ---------------------------------------------------------------------------
// TeamSquadSection — squad grouped by position
// ---------------------------------------------------------------------------

import type { SquadPlayerWithRating } from "@/lib/types";

interface TeamSquadSectionProps {
  squad: SquadPlayerWithRating[];
}

const POS_ORDER = ["G", "D", "M", "F"] as const;
const POS_LABELS: Record<string, string> = {
  G: "Goalkeepers",
  D: "Defenders",
  M: "Midfielders",
  F: "Forwards",
};

export default function TeamSquadSection({ squad }: TeamSquadSectionProps) {
  if (!squad.length) return null;

  return (
    <div>
      <h2 className="sm-section-heading mb-2">Squad</h2>
      <div className="space-y-4">
        {POS_ORDER.map((pos) => {
          const players = squad.filter((p) => p.pos === pos);
          if (!players.length) return null;
          return (
            <div key={pos}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                {POS_LABELS[pos]}
              </h3>
              <div className="border border-zinc-200 bg-white divide-y divide-zinc-100">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="w-8 shrink-0 text-right text-xs font-semibold text-zinc-400">
                      {p.number || "–"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{p.name}</span>
                    {p.rating != null && (
                      <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                        {p.rating.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}