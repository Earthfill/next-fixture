// ---------------------------------------------------------------------------
// MatchdayList — Client component for togglable matchday sections
// ---------------------------------------------------------------------------
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import FootballMatchCard from "@/components/football/FootballMatchCard";

import type { MatchdayGroup } from "@/lib/types";

interface Props {
  matchdays: MatchdayGroup[];
}

// Persisted per-browser preference so open matchdays survive a refresh
// (or browser restart) until the user explicitly closes them.
const STORAGE_KEY = "matchday-open-days";

// Deterministic default state used for BOTH the server render and the client's
// first render. It must never read localStorage: if SSR and the first client
// render disagreed, the isOpen CSS classes would mismatch and React would throw
// a hydration error (and keep the server DOM, i.e. "state resets on refresh").
function defaultOpenDays(slugs: string[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  slugs.forEach((slug, index) => {
    state[slug] = index === 0;
  });
  return state;
}

function readSavedOpenDays(): Record<string, boolean> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, boolean>;
    }
  } catch {
    // Unavailable or corrupted — falls back to defaults.
  }
  return null;
}

function writeOpenDays(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // non-fatal
  }
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MatchdayList({ matchdays }: Props) {
  const slugs = matchdays.map((matchday) => matchday.slug);
  const slugsKey = slugs.join("|");

  // Server and client agree on this first value — localStorage is applied in
  // the effect below, so hydration can never see mismatched open/closed attrs.
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() =>
    defaultOpenDays(slugs)
  );

  // Apply persisted per-browser preferences after hydration. Runs only on the
  // client, so a saved (open) matchday is restored on refresh without breaking
  // SSR hydration.
  useEffect(() => {
    const list = slugsKey ? slugsKey.split("|") : [];
    const saved = readSavedOpenDays();
    const next = defaultOpenDays(list);
    if (saved) {
      for (const slug of list) {
        if (typeof saved[slug] === "boolean") next[slug] = saved[slug];
      }
    }
    setOpenDays(next);
    writeOpenDays(next);
  }, [slugsKey]);

  const toggleDay = (slug: string) => {
    const nextOpen = !(openDays[slug] ?? false);
    setOpenDays((prev) => ({ ...prev, [slug]: nextOpen }));
    writeOpenDays({ ...openDays, [slug]: nextOpen });
  };

  return (
    <div className="space-y-10">
      {matchdays.map((matchday, idx) => {
        const isOpen = openDays[matchday.slug] ?? false; // default open (closes only on user action)

        return (
          <section key={matchday.date}>
            {/* Collapsible date heading + link to dedicated date page */}
            <button
              onClick={() => toggleDay(matchday.slug)}
              className="flex-1 text-left cursor-pointer"
            >
              <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2 hover:text-[#002b5c] transition-colors">
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
              className={`overflow-hidden mt-6 transition-all duration-300 ${isOpen ? "opacity-100" : "max-h-0 opacity-0"
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