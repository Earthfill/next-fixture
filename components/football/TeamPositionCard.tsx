// ---------------------------------------------------------------------------
// TeamPositionCard — current league position summary
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { LeagueStanding } from "@/lib/types";
import { ArrowUpRight } from "lucide-react";

interface TeamPositionCardProps {
  leagueName: string;
  leagueSlug: string;
  standing: LeagueStanding | null;
}

export default function TeamPositionCard({ leagueName, leagueSlug, standing }: TeamPositionCardProps) {
  if (!standing) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">{leagueName}</p>
        <p className="text-sm text-zinc-500">Position unavailable right now.</p>
      </div>
    );
  }

  const { position, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points, form } = standing;

  return (
    <Link
      href={`/leagues/${leagueSlug}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-[#002b5c]/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{leagueName}</p>
        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-extrabold leading-none text-zinc-900">{position}</span>
        <span className="pb-0.5 text-sm font-medium text-zinc-500">
          {position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        P{played} · W{won} · D{drawn} · L{lost} · {goalsFor}:{goalsAgainst} ({goalDifference >= 0 ? "+" : ""}{goalDifference}) ·{" "}
        <span className="font-semibold text-zinc-700">{points} pts</span>
      </p>
      {form.length > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 mr-1">Form</span>
          {form.map((r, i) => (
            <span key={i} className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${r === "W" ? "bg-emerald-500" : r === "D" ? "bg-zinc-400" : "bg-red-500"}`}>
              {r}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}