// ---------------------------------------------------------------------------
// FootballMatchCard — Single match row in a league-grouped list
// ---------------------------------------------------------------------------

import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Fixture } from "@/lib/sports-api";

interface FootballMatchCardProps {
  fixture: Fixture;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function FootballMatchCard({ fixture }: FootballMatchCardProps) {
  const homeWin = fixture.score && fixture.score.home > fixture.score.away;
  const awayWin = fixture.score && fixture.score.away > fixture.score.home;

  return (
    <Link
      href={`/previews/${fixture.slug}`}
      prefetch={false}
      className="flex items-center gap-3 border-b border-zinc-100 py-3 px-2 hover:bg-zinc-50 transition-colors last:border-b-0 group"
    >
      {/* Kickoff time / Score / Live indicator */}
      <div className="w-14 shrink-0 text-center">
        <span className="text-xs font-bold text-zinc-600">
          {fixture.status === "upcoming" ? formatTime(fixture.date) : (
            fixture.status === "live" ? <span className="text-red-600">LIVE</span> : "FT"
          )}
        </span>
      </div>

      {/* Home team */}
      <div className="flex items-center gap-2 w-[40%] justify-end">
        <span className="text-sm font-medium text-zinc-800 group-hover:text-blue-700 transition-colors truncate">
          {fixture.homeTeam.name}
        </span>
        <Image src={fixture.homeTeam.logo} alt={`${fixture.homeTeam.name} logo`} width={22} height={22} className="sm-crest shrink-0" />
      </div>

      {/* VS */}
      <div className="w-10 shrink-0 text-center">
        <span className={`${homeWin ? 'font-bold text-zinc-800' : ''}`}>{fixture.score ? fixture.score.home : ""}</span>
        <span className="text-[10px] mx-2 font-bold text-zinc-400 uppercase">vs</span>
        <span className={`${awayWin ? 'font-bold text-zinc-800' : ''}`}>{fixture.score ? fixture.score.away : ""}</span>
      </div>

      {/* Away team */}
      <div className="flex items-center gap-2 w-[40%]">
        <Image src={fixture.awayTeam.logo} alt={`${fixture.awayTeam.name} logo`} width={22} height={22} className="sm-crest shrink-0" />
        <span className="text-sm font-medium text-zinc-800 group-hover:text-blue-700 transition-colors truncate">
          {fixture.awayTeam.name}
        </span>
      </div>

      {/* Venue */}
      <div className="hidden sm:block w-36 shrink-0 text-right">
        <span className="text-[11px] text-zinc-400 truncate block">{fixture.venue.name}</span>
      </div>
    </Link>
  );
}
