"use client";

// ---------------------------------------------------------------------------
// FixtureList — client-side fixtures table for /admin
// ---------------------------------------------------------------------------
// All filtering & sorting happen in the browser (no server round-trips):
//   - Free-text search (home / away / competition)
//   - Competition dropdown filter
//   - State filter (All / Edited / Auto)
//   - Sortable columns (Kick-off, Competition, Home, Away, State)
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronsUp,
  ChevronsDown,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Pencil,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import FixtureEditor from "@/components/admin/FixtureEditor";
import type { Fixture } from "@/lib/types";

interface FixtureListProps {
  fixtures: Fixture[];
  overriddenSlugs: string[];
  token: string;
}

type SortKey = "date" | "competition" | "home" | "away" | "state";
type SortDir = "asc" | "desc";
type StateFilter = "all" | "edited" | "auto";

const SORTABLE: { key: SortKey; label: string; align?: "center" | "right" }[] = [
  { key: "date", label: "Kick-off" },
  { key: "competition", label: "Competition" },
  { key: "home", label: "Home" },
  { key: "away", label: "Away" },
  { key: "state", label: "State", align: "center" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FixtureList({ fixtures, overriddenSlugs, token }: FixtureListProps) {
  const editedSet = useMemo(() => new Set(overriddenSlugs), [overriddenSlugs]);

  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const competitions = useMemo(
    () => [...new Set(fixtures.map((f) => f.competition))].sort(),
    [fixtures]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = fixtures.filter((f) => {
      if (competition && f.competition !== competition) return false;
      if (stateFilter === "edited" && !editedSet.has(f.slug)) return false;
      if (stateFilter === "auto" && editedSet.has(f.slug)) return false;
      if (q) {
        const haystack =
          `${f.homeTeam.name} ${f.awayTeam.name} ${f.competition}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sign = sortDir === "asc" ? 1 : -1;
    const stateVal = (f: Fixture) => (editedSet.has(f.slug) ? 1 : 0);

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "date":
          return sign * (new Date(a.date).getTime() - new Date(b.date).getTime());
        case "competition":
          return sign * a.competition.localeCompare(b.competition);
        case "home":
          return sign * a.homeTeam.name.localeCompare(b.homeTeam.name);
        case "away":
          return sign * a.awayTeam.name.localeCompare(b.awayTeam.name);
        case "state":
          return sign * (stateVal(a) - stateVal(b));
      }
    });
  }, [fixtures, editedSet, query, competition, stateFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronsUp className="h-3 w-3 text-[#002b5c]" />
    ) : (
      <ChevronsDown className="h-3 w-3 text-[#002b5c]" />
    );
  };

  const hasFilters = query !== "" || competition !== "" || stateFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setCompetition("");
    setStateFilter("all");
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams or competition…"
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#002b5c]/40 focus:outline-none"
          />
        </div>

        <div className="relative">
          <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <select
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-sm text-zinc-700 focus:border-[#002b5c]/40 focus:outline-none"
          >
            <option value="">All competitions</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-[#002b5c]/40 focus:outline-none"
        >
          <option value="all">All states</option>
          <option value="edited">Edited</option>
          <option value="auto">Auto</option>
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {rows.length} of {fixtures.length} matches
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-[#002b5c] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

  {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left">
              {SORTABLE.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${
                    col.align === "center" ? "text-center" : ""
                  } ${col.key === "date" ? "px-5" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-zinc-700"
                  >
                    {col.label} {sortIcon(col.key)}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-zinc-400">
                  No fixtures match your filters.
                </td>
              </tr>
            ) : (
              rows.map((f) => {
                const edited = editedSet.has(f.slug);
                return (
                  <tr key={f.id} className="hover:bg-zinc-50/70">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-zinc-800">{formatDate(f.date)}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                        <Clock className="h-3 w-3" /> {formatTime(f.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {f.competition}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-800">{f.homeTeam.name}</td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-zinc-400">vs</td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-800">{f.awayTeam.name}</td>
                    <td className="px-4 py-3 text-center">
                      {edited ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          <Pencil className="h-3 w-3" /> Edited
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                          Auto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/previews/${f.slug}`}
                        prefetch={false}
                        className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-[#002b5c] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> View
                      </Link>
                      <FixtureEditor
                        slug={f.slug}
                        date={f.date}
                        homeTeam={f.homeTeam.name}
                        awayTeam={f.awayTeam.name}
                        token={token}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}