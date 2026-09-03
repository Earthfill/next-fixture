// ---------------------------------------------------------------------------
// Admin Dashboard — Preview management & site overview
// ---------------------------------------------------------------------------

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { getUpcomingFixtures, getAvailableMatchdays } from "@/lib/sports-api";
import { Trophy, Calendar, BarChart3, RefreshCw, ExternalLink, TrendingUp, DollarSign, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const fixtures = await getUpcomingFixtures();
  const matchdays = await getAvailableMatchdays();

  const totalFixtures = fixtures.length;
  const totalMatchdays = matchdays.length;
  const leagues = [...new Set(fixtures.map((f) => f.competition))];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Admin Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Overview of your football preview platform</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-900 flex items-center gap-1"
          >
            <ExternalLink className="h-4 w-4" /> View Site
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Trophy className="h-4 w-4 text-emerald-600" />
            <span>Upcoming Fixtures</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{totalFixtures}</p>
        </div>
        <div className="border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span>Matchdays</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{totalMatchdays}</p>
        </div>
        <div className="border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <BarChart3 className="h-4 w-4 text-amber-600" />
            <span>Leagues</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{leagues.length}</p>
        </div>
        <div className="border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <span>Preview Pages</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900">{totalFixtures}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div className="border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-emerald-600" />
            Data Management
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Run the scraper to fetch latest data from API-Football. Data is cached for 24 hours to minimize API calls.
          </p>
          <form action="/api/admin/seed" method="POST" className="flex gap-2">
            <input type="hidden" name="token" value="kingsley" />
            <button
              type="submit"
              className="text-xs font-semibold text-white px-4 py-2"
              style={{ background: '#002b5c' }}
            >
              Run Scraper Now
            </button>
          </form>
        </div>

        <div className="border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-600" />
            Monetization
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Configure your ad slots and affiliate links. AdSense and affiliate integrations go here.
          </p>
          <div className="text-xs text-zinc-400 space-y-1">
            <p>• Ad Slot 1 (leaderboard): <code className="bg-zinc-100 px-1">preview-leaderboard-1</code></p>
            <p>• Ad Slot 2 (rectangle): <code className="bg-zinc-100 px-1">preview-rectangle-1</code></p>
            <p>• Ad Slot 3 (banner): <code className="bg-zinc-100 px-1">preview-banner-2</code></p>
          </div>
        </div>
      </div>

      {/* Upcoming Fixtures Table */}
      <div className="border border-zinc-200 bg-white">
        <div className="p-4 border-b border-zinc-200">
          <h2 className="text-sm font-bold text-zinc-800">Upcoming Fixtures ({totalFixtures})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">Date</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">Competition</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">Home</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">vs</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">Away</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-zinc-500 uppercase">Preview</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.slice(0, 20).map((f) => (
                <tr key={f.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="py-2 px-3 text-xs text-zinc-500">
                    {new Date(f.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                  <td className="py-2 px-3 text-xs text-zinc-500">{f.competition}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      <Image src={f.homeTeam.logo} alt="" width={16} height={16} className="h-4 w-4" />
                      <span className="text-sm text-zinc-800">{f.homeTeam.shortName}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center text-xs text-zinc-400">vs</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      <Image src={f.awayTeam.logo} alt="" width={16} height={16} className="h-4 w-4" />
                      <span className="text-sm text-zinc-800">{f.awayTeam.shortName}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Link
                      href={`/previews/${f.slug}`}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEO Tips */}
      <div className="mt-6 border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-bold text-zinc-800 mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-600" />
          SEO Tips for Passive Income
        </h2>
        <ul className="text-xs text-zinc-500 space-y-1.5">
          <li>• Each preview page targets long-tail keywords: <strong>"Arsenal vs Chelsea Preview"</strong></li>
          <li>• JSON-LD structured data helps Google show rich results in search</li>
          <li>• OpenGraph tags ensure good previews when shared on social media</li>
          <li>• Set up Google Search Console to monitor which pages rank</li>
        </ul>
      </div>
    </div>
  );
}
