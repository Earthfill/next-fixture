// ---------------------------------------------------------------------------
// MatchdayList — Client component for togglable matchday sections
// ---------------------------------------------------------------------------
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import FootballMatchCard from "@/components/football/FootballMatchCard";

import type { MatchdayGroup } from "@/lib/types";

interface Props {
  matchdays: MatchdayGroup[];
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MatchdayList({ matchdays }: Props) {
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const toggleDay = (slug: string) => {
    setOpenDays((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <div className="space-y-10">
      {matchdays.map((matchday, idx) => {
        const isOpen = openDays[matchday.slug] !== false; // default open (closes only on user action)

        return (
          <section key={matchday.date}>
            {/* Collapsible date heading */}
            <button
              onClick={() => toggleDay(matchday.slug)}
              className="w-full text-left cursor-pointer"
            >
              <h2 className="text-base font-bold text-zinc-800 mb-3 flex items-center gap-2 hover:text-[#002b5c] transition-colors">
                <span className="inline-block w-2 h-2 rounded-full bg-[#002b5c]" />
                {formatDateLabel(matchday.date)}
                <span className="text-xs font-normal text-zinc-400">
                  <span>
                    ({matchday.fixtureCount})
                  </span>
                  <span className="ml-0.5 hidden md:inline-block">
                    match{matchday.fixtureCount !== 1 ? "es" : ""}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"
                    } animate-bounce`}
                />
              </h2>
            </button>

            {/* League sections — collapsible */}
            <div
              className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                }`}
            >
              <div className="space-y-6">
                {matchday.leagues.map((league) => (
                  <div key={league.competition}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {league.competitionLogo && (
                          <Image src={league.competitionLogo} alt="" width={20} height={20} className="h-5 w-5" />
                        )}
                        <h3
                          className="sm-section-heading mb-0 pb-0"
                          style={{ borderBottom: "none", marginBottom: 0, paddingBottom: 0 }}
                        >
                          {league.competition}
                        </h3>
                      </div>
                      <Link
                        href={`/leagues/${league.competitionSlug}`}
                        prefetch={false}
                        className="text-[11px] font-medium flex items-center gap-0.5"
                        style={{ color: "#002b5c" }}
                      >
                        Standings <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <hr className="sm-divider mt-1 mb-0" />
                    <div className="border border-zinc-200 bg-white">
                      {league.fixtures.map((fixture) => (
                        <FootballMatchCard key={fixture.id} fixture={fixture} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spacer between matchdays */}
            {idx < matchdays.length - 1 && <div className="mt-8 border-t border-zinc-200" />}
          </section>
        );
      })}
    </div>
  );
}