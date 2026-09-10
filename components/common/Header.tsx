// ---------------------------------------------------------------------------
// Header — Dark blue nav bar with Leagues drawer + News link
// ---------------------------------------------------------------------------

"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Trophy, ChevronRight, Newspaper, CalendarDays, Menu } from "lucide-react";
import { LEAGUE_BY_COUNTRY, COUNTRY_ORDER } from "@/lib/football/config";
import { usePathname } from "next/navigation";

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const slug = pathname.split("/leagues/")[1];

  return (
    <header className="relative w-full" style={{ background: '#002b5c' }}>
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

          <nav className="hidden md:flex items-center gap-1">
            <Link href="/fixtures" className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              <CalendarDays className="h-4 w-4" />
              Fixtures
            </Link>
            <Link href="/news" className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              <Newspaper className="h-4 w-4" />
              News
            </Link>
            <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
              <Trophy className="h-4 w-4" />
              Competitions
            </button>
          </nav>

          {/* ─── Mobile Burger Button ─────────────────────────────── */}
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden flex items-center justify-center rounded p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* ─── Mobile Menu ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden absolute top-full inset-x-0 z-40 border-t border-white/10 bg-[#002b5c] animate-[slideDown_250ms_ease-out] origin-top">
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-col gap-1">
            <Link
              href="/fixtures"
              onClick={() => setMobileOpen(false)}
              className="animate-[fadeInUp_200ms_ease-out_both] flex items-center gap-1.5 rounded px-3 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              style={{ animationDelay: "80ms" }}
            >
              <CalendarDays className="h-4 w-4" />
              Fixtures
            </Link>
            <Link
              href="/news"
              onClick={() => setMobileOpen(false)}
              className="animate-[fadeInUp_200ms_ease-out_both] flex items-center gap-1.5 rounded px-3 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              style={{ animationDelay: "120ms" }}
            >
              <Newspaper className="h-4 w-4" />
              News
            </Link>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setDrawerOpen(true);
              }}
              className="animate-[fadeInUp_200ms_ease-out_both] flex items-center gap-1.5 rounded px-3 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              style={{ animationDelay: "160ms" }}
            >
              <Trophy className="h-4 w-4" />
              Competitions
            </button>
          </nav>
        </div>
      )}

      {/* ─── Leagues Drawer with Slide-in Animation ──────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 animate-[fadeIn_200ms_ease-out]" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white overflow-y-auto shadow-xl animate-[slideInRight_250ms_ease-out]">
            <div className="sticky top-0 bg-white border-b border-zinc-200 z-10 flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#002b5c]" />
                Competitions
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
                      {leagues.map((league) => {
                        const isActive = slug === league.slug;
                        return (
                          <Link
                            key={league.slug}
                            href={`/leagues/${league.slug}`}
                            // prefetch={false} 
                            onClick={() => setDrawerOpen(false)}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-700 transition-colors group ${isActive ? "bg-[#002b5c] text-white" : "hover:text-[#002b5c] hover:bg-zinc-50"}`}
                          >
                            {league.logo && <Image src={league.logo} alt={`${league.name} logo`} width={20} height={20} className="h-5 w-5 object-contain" />}
                            <span className={`${isActive ? "text-white" : ""} flex-1 font-medium`}>{league.name}</span>
                            <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-[#002b5c] transition-colors" />
                          </Link>
                        )
                      })}
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
