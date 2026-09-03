// ---------------------------------------------------------------------------
// WinProbability — Probability bar with double chance display
// ---------------------------------------------------------------------------

import React from "react";

interface WinProbabilityProps {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeTeam: string;
  awayTeam: string;
}

export default function WinProbability({ homeWin, draw, awayWin, homeTeam, awayTeam }: WinProbabilityProps) {
  const total = homeWin + draw + awayWin;
  const h = Math.round((homeWin / total) * 100);
  const d = Math.round((draw / total) * 100);
  const a = Math.round((awayWin / total) * 100);

  return (
    <div>
      <h2 className="sm-section-heading-alt">Win Probability</h2>
      <div className="flex h-6 w-full overflow-hidden rounded-sm border border-zinc-300">
        <div className="bg-green-500 text-center text-[10px] font-bold text-white leading-6" style={{ width: `${h}%` }}>{h > 8 ? `${h}%` : ''}</div>
        <div className="bg-amber-500 text-center text-[10px] font-bold text-white leading-6" style={{ width: `${d}%` }}>{d > 8 ? `${d}%` : ''}</div>
        <div className="bg-red-500 text-center text-[10px] font-bold text-white leading-6" style={{ width: `${a}%` }}>{a > 8 ? `${a}%` : ''}</div>
      </div>
      <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
        <span>{homeTeam} {h}%</span>
        <span>Draw {d}%</span>
        <span>{a}% {awayTeam}</span>
      </div>
    </div>
  );
}
