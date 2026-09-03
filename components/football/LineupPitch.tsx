// ---------------------------------------------------------------------------
// LineupPitch — Horizontal football pitch rendering
// ---------------------------------------------------------------------------
// Renders a pitch (CSS-only, no images). Home attacks left→right, away
// attacks right→left (mirrored). Players are grouped by grid row into
// vertical columns (GK left, DEF, MID, FWD right for home; reversed for away).
// ---------------------------------------------------------------------------

"use client";

import type { PredictedPlayer } from "@/lib/types";
import { useState } from "react";

const POS_LABELS: Record<string, string> = {
  G: "GK", D: "DEF", M: "MID", F: "FWD",
};

interface Props {
  formation: string;
  startXI: PredictedPlayer[];
  source: "confirmed" | "predicted";
  confidence?: "high" | "medium" | "low";
  mirrored?: boolean;
  teamName?: string;
  teamLogo?: string;
}

export default function LineupPitch({
  formation, startXI, source, confidence, mirrored = false, teamName, teamLogo,
}: Props) {
  const [hoveredPlayer, setHoveredPlayer] = useState<number | null>(null);

  // Group by grid row (1=GK, 2=DEF, 3=MID, 4=FWD) — each becomes a vertical column
  const byRow = new Map<number, { player: PredictedPlayer; col: number }[]>();
  for (const p of startXI) {
    if (!p.grid) continue;
    const [r, c] = p.grid.split(":");
    const row = parseInt(r, 10), col = parseInt(c, 10);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push({ player: p, col });
  }
  for (const [, players] of byRow) players.sort((a, b) => a.col - b.col);

  // Column order: home = left to right (GK→FWD), away = reversed (FWD→GK)
  const colKeys = Array.from(byRow.keys()).sort((a, b) =>
    mirrored ? b - a : a - b
  );

  if (!startXI.length) {
    return (
      <div className="border border-zinc-200 rounded-sm bg-zinc-50 p-6 text-center text-xs text-zinc-400">
        No lineup data available
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 rounded-sm overflow-hidden">
      {/* Horizontal pitch */}
      <div className="relative bg-linear-to-r from-emerald-800 to-emerald-700 py-2 px-4">
        {/* Pitch markings SVG — horizontal orientation */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="white" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="1" fill="white" />
          <rect x="0.5" y="0.5" width="99" height="99" fill="none" stroke="white" strokeWidth="0.5" />
          {mirrored ? (
            <rect x="92" y="25" width="8" height="50" fill="none" stroke="white" strokeWidth="0.5" />
          ) : (
            <rect x="0" y="25" width="8" height="50" fill="none" stroke="white" strokeWidth="0.5" />
          )}
        </svg>

        {/* Players — vertical columns */}
        <div className="relative flex justify-between items-stretch gap-1 h-80 z-10">
          {colKeys.map((row) => {
            const players = byRow.get(row)!;
            return (
              <div key={row} className="flex flex-col justify-center gap-2 flex-1">
                {players.map(({ player }) => (
                  <div
                    key={player.id}
                    className="relative flex flex-col items-center"
                    onMouseEnter={() => setHoveredPlayer(player.id)}
                    onMouseLeave={() => setHoveredPlayer(null)}
                  >
                    <div className={`h-7 w-7 rounded-full ${mirrored ? "bg-red-500" : "bg-blue-500"} flex items-center justify-center text-[10px] font-bold text-white/90 shadow-sm ring-1 ring-white/50`}>
                      {player.number}
                    </div>
                    <span className="text-[8px] leading-tight text-white text-center mt-0.5 truncate w-full font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                      {player.name}
                    </span>
                    <span className="text-[7px] uppercase text-white/70 font-medium">
                      {POS_LABELS[player.pos] || player.pos}
                    </span>
                    {hoveredPlayer === player.id && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-zinc-900 text-white text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-20">
                        {player.name}{" - "}{POS_LABELS[player.pos] || player.pos}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      {source === "predicted" && (
        <div className="px-3 py-1.5 border-t border-zinc-200 bg-amber-50">
          <p className="text-[9px] text-amber-700 text-center">
            Predicted lineup — based on recent form, not yet confirmed.
            {confidence === "low" && " Low confidence — limited recent data."}
          </p>
        </div>
      )}
    </div>
  );
}