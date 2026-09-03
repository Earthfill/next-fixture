// ---------------------------------------------------------------------------
// LineupDisplay — Formation with starting XI, substitutes and coach
// ---------------------------------------------------------------------------

import Image from "next/image";
import type { LineupEntry } from "@/lib/types";
import LineupPitch from "./LineupPitch";

interface Props {
  lineups: LineupEntry[];
}

const POS_LABELS: Record<string, string> = {
  G: "GK", D: "DEF", M: "MID", F: "FWD",
};

function TeamLineupCard({ entry, side }: { entry: LineupEntry; side: "home" | "away" }) {
  const { team, formation, startXI, substitutes, coach, predicted } = entry;

  // Convert to PredictedPlayer-like format for LineupPitch
  const pitchPlayers = startXI.map(({ player }) => ({
    id: player.id,
    name: player.name,
    number: player.number,
    pos: player.pos,
    grid: player.grid,
    recentStarts: 0,
    recentTotal: 0,
  }));

  const subs = substitutes.filter((s) => !s.player.grid);

  return (
    <div className="border border-zinc-200 bg-white rounded-sm overflow-hidden">
      {/* Team header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-zinc-50">
        <Image src={team.logo} alt={team.name} width={20} height={20} className="h-5 w-5 object-contain" />
        <span className="text-sm font-semibold text-zinc-800">{team.name}</span>
        <span className="text-[11px] text-zinc-500 ml-auto">Formation: {formation || "N/A"}</span>
        {predicted && (
          <span className="text-[9px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            Predicted
          </span>
        )}
      </div>

      {/* Coach */}
      {/* {coach?.name && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500 border-b border-zinc-100">
          <span className="font-medium">Coach:</span>
          {coach?.photo && (
            <Image src={coach.photo} alt={coach.name} width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
          )}
          <span>{coach?.name || "N/A"}</span>
        </div>
      )} */}

      {/* Pitch via LineupPitch */}
      <LineupPitch
        formation={formation || ""}
        startXI={pitchPlayers}
        source={predicted ? "predicted" : "confirmed"}
        mirrored={side === "away"}
        teamName={team.name}
        teamLogo={team.logo}
      />

      {/* Substitutes */}
      <div className="px-3 py-2 border-t border-zinc-200">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
          Substitutes
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {subs.map(({ player }) => (
            <span key={player.id} className="text-[10px] text-zinc-600 whitespace-nowrap">
              {player.number} {player.name}
              <span className="text-zinc-400 ml-0.5">({POS_LABELS[player.pos] || player.pos})</span>
            </span>
          ))}
          {subs.length === 0 && (
            <span className="text-[10px] text-zinc-400 italic">No substitutes listed</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LineupDisplay({ lineups }: Props) {
  if (!lineups.length) return null;
  const homeLineup = lineups[0];
  const awayLineup = lineups.length > 1 ? lineups[1] : null;
  const isPredicted = homeLineup.predicted;

  return (
    <div className="mb-6">
      <h3 className="sm-subheading mb-2">{isPredicted ? "Projected" : "Confirmed"} Lineups</h3>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <TeamLineupCard entry={homeLineup} side="home" />
        {awayLineup && <TeamLineupCard entry={awayLineup} side="away" />}
      </div>
      <p className="text-[10px] text-zinc-400 mt-2 text-center">
        {isPredicted
          ? "Subject to last-minute changes"
          : "Lineups are confirmed"}
      </p>
    </div>
  );
}
