// ---------------------------------------------------------------------------
// Footer — Clean, simple footer with responsible gambling disclaimer
// ---------------------------------------------------------------------------

import React from "react";
import Link from "next/link";
import { LEAGUE_BY_COUNTRY, COUNTRY_ORDER } from "@/lib/football/config";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full" style={{ background: '#f7f7f7', borderTop: '2px solid #002b5c' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Responsible Gambling */}
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-4 text-center text-xs leading-relaxed text-amber-800">
          <strong className="text-sm">18+ Only | Please Gamble Responsibly</strong>
          <br />
          All betting content is for informational purposes only. Never gamble more than you can afford to lose.
          If you or someone you know has a gambling problem, please seek help at{" "}
          <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            BeGambleAware.org
          </a>{" "}
          or call 0808 8020 133 (UK free).
        </div>

        {/* League Links by Country */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {COUNTRY_ORDER.map((country) => {
            const leagues = LEAGUE_BY_COUNTRY[country];
            if (!leagues) return null;
            return (
              <div key={country}>
                <h4 className="text-xs font-bold text-zinc-700 mb-2 uppercase tracking-wider">{country}</h4>
                <ul className="space-y-1">
                  {leagues.map((league) => (
                    <li key={league.slug}>
                      <Link
                        href={`/leagues/${league.slug}`}
                        className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
                      >
                        {league.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* General Links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500 mb-4">
          <Link href="/" className="hover:text-zinc-800 transition-colors">Home</Link>
          <Link href="/about" className="hover:text-zinc-800 transition-colors">About</Link>
          <Link href="/contact" className="hover:text-zinc-800 transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-zinc-800 transition-colors">Privacy</Link>
        </div>

        <div className="text-center text-[11px] text-zinc-400">
          <p>&copy; {year} Next Fixture. Independent football previews. Not affiliated with FIFA, UEFA or any league.</p>
          <p className="mt-1">Some links are affiliate links. We may earn a commission at no extra cost to you.</p>
        </div>
      </div>
    </footer>
  );
}
