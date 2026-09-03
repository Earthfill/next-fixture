// ---------------------------------------------------------------------------
// MatchHeader — Simple match banner (SportsMole-style)
// ---------------------------------------------------------------------------

import Image from "next/image";
import React from "react";
import { Calendar, Clock, MapPin } from "lucide-react";
import type { Fixture } from "@/lib/sports-api";

interface MatchHeaderProps {
  match: Fixture;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

export default function MatchHeader({ match }: MatchHeaderProps) {
  const { homeTeam, awayTeam, competition, competitionLogo, venue, date, score, status } = match;

  const homeWin = score && score.home > score.away;
  const awayWin = score && score.away > score.home;

  return (
    <div>
      {/* Competition breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
        <span>Home</span>
        <span>›</span>
        <span>{competition}</span>
        <span>›</span>
        <span className="font-medium text-zinc-700">{homeTeam.name} vs {awayTeam.name}</span>
      </div>

      {/* Match title */}
      <h1 className="sm-heading-lg mb-2">
        {homeTeam.name} vs {awayTeam.name}
      </h1>

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-4">
        <span className="flex items-center gap-1">{competitionLogo && <Image src={competitionLogo} alt="" width={16} height={16} className="h-4 w-4" />}{competition}</span>
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(date)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(date)}</span>
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{venue.name}, {venue.city}</span>
      </div>

      {/* Team badges */}
      <div className="flex items-center justify-between border-y border-zinc-200 bg-[#fafafa]">
        <div className="w-14 shrink-0 text-center">
          <span className="text-xs font-bold text-zinc-600">
            {status === "upcoming" ? null : (
              status === "live" ? <span className="text-red-600">LIVE</span> : "FT"
            )}
          </span>
        </div>
        <div className="flex items-center justify-center gap-6 py-4 flex-1">
          <div className="flex items-center gap-2">
            <Image src={homeTeam.logo} alt={homeTeam.name} width={36} height={36} className="sm-crest-lg" />
            <span className="text-sm font-bold text-zinc-800">{homeTeam.name}</span>
            {match.score ? <span className={`${homeWin ? 'font-bold text-zinc-800' : ''}`}>{match.score.home}</span> : <span className="text-[10px] uppercase text-zinc-400 ml-1">(H)</span>}
          </div>

          <span className="text-lg font-extrabold text-zinc-400">vs</span>

          <div className="flex items-center gap-2">
            {match.score ? <span className={`${awayWin ? 'font-bold text-zinc-800' : ''}`}>{match.score.away}</span> : <span className="text-[10px] uppercase text-zinc-400 mr-1">(A)</span>}
            <span className="text-sm font-bold text-zinc-800">{awayTeam.name}</span>
            <Image src={awayTeam.logo} alt={awayTeam.name} width={36} height={36} className="sm-crest-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
