// ---------------------------------------------------------------------------
// Header — Dark blue nav bar with Leagues drawer + News link
// ---------------------------------------------------------------------------

"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Trophy, ChevronRight, Newspaper } from "lucide-react";
import { LEAGUE_BY_COUNTRY, COUNTRY_ORDER } from "@/lib/football/config";

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="w-full" style={{ background: '#002b5c' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-4">
            <Image
              src="/logo.svg"
              alt="Next Fixture"
              width={120}
              height={30}
              className="h-4 w-auto"
              priority
            />
            <span className="hidden sm:inline text-[10px] font-medium text-white/80 uppercase tracking-wider">
              Football Previews
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link href="/" className="rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              Home
            </Link>
            <Link href="/news" className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              <Newspaper className="h-4 w-4" />
              News
            </Link>
            <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
              <Trophy className="h-4 w-4" />
              Leagues
            </button>
          </nav>
        </div>
      </div>

      {/* ─── Leagues Drawer with Slide-in Animation ──────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 animate-[fadeIn_200ms_ease-out]" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white overflow-y-auto shadow-xl animate-[slideInRight_250ms_ease-out]">
            <div className="sticky top-0 bg-white border-b border-zinc-200 z-10 flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#002b5c]" />
                Leagues
              </h2>
              <button onClick={() => setDrawerOpen(false)} className="rounded p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-6">
              {COUNTRY_ORDER.map((country) => {
                const leagues = LEAGUE_BY_COUNTRY[country];
                if (!leagues) return null;
                return (
                  <div key={country}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">{country}</h3>
                    <div className="space-y-0.5">
                      {leagues.map((league) => (
                        <Link key={league.slug} href={`/leagues/${league.slug}`} onClick={() => setDrawerOpen(false)}
                          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-700 hover:text-[#002b5c] hover:bg-zinc-50 transition-colors group">
                          {league.logo && <Image src={league.logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
                          <span className="flex-1 font-medium">{league.name}</span>
                          <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-[#002b5c] transition-colors" />
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
