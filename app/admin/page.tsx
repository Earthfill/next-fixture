// ---------------------------------------------------------------------------
// Admin Dashboard — Preview management & site overview
// ---------------------------------------------------------------------------

import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getUpcomingFixturesFresh, getPredictionReview } from "@/lib/cache/pages";
import { buildAvailableMatchdays } from "@/lib/football/service";
import { getOverriddenSlugs } from "@/lib/admin-overrides";
import { getHiddenSlugs } from "@/lib/hidden-fixtures";
import { getUserStats } from "@/lib/auth";
import { PROVIDER_IDS, PROVIDER_META, getActiveProviderId, providerHasKey } from "@/lib/football/providers";
import JobRunner from "@/components/admin/JobRunner";
import FixtureList from "@/components/admin/FixtureList";
import ProviderControl from "@/components/admin/ProviderControl";
import ChatModeration from "@/components/admin/ChatModeration";
import RegisteredUsersTable from "@/components/admin/RegisteredUsersTable";
import {
  Trophy, Calendar, BarChart3, RefreshCw, ExternalLink,
  DollarSign, Eye, Pencil, PenLine, CalendarDays, Sparkles, Server, TriangleAlert,
  Users, CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  // Fresh fixtures straight from the API — the admin table must always show the
  // updated list (new matches, finished matches dropping off), not a stale
  // cached snapshot. Matchdays are derived from the same fresh list.
  const fixtures = await getUpcomingFixturesFresh();
  const matchdays = buildAvailableMatchdays(fixtures);
  const adminToken = process.env.ADMIN_SECRET;

  // Which fixtures already have an admin override (edited previews).
  const overriddenSlugs = new Set(
    await getOverriddenSlugs(fixtures.map((f) => f.slug))
  );

  // Which fixtures are hidden from the public site.
  const hiddenSlugs = await getHiddenSlugs();

  // Registered-user counts (Postgres app_users). null = store unreachable, so
  // the stats card can render "—" rather than a misleading 0.
  const userStats = await getUserStats();

  const totalFixtures = fixtures.length;
  const totalMatchdays = matchdays.length;
  const leagues = [...new Set(fixtures.map((f) => f.competition))];
  const totalEdited = overriddenSlugs.size;
  // Hidden count scoped to the fixtures currently in this table (hidden slugs
  // for long-finished matches may linger in the store).
  const totalHidden = fixtures.filter((f) => hiddenSlugs.has(f.slug)).length;

  // Prediction quality review — which fixtures have a betting tip that
  // contradicts their predicted scoreline or win probability. These are hidden
  // from the public preview until an admin edits them. Once a fixture has an
  // admin override it is treated as "reviewed" and is no longer flagged.
  const reviews = await Promise.all(
    fixtures.map((f) => getPredictionReview(f.slug).catch(() => null))
  );
  const flaggedReasons: Record<string, string[]> = {};
  reviews.forEach((r, i) => {
    const f = fixtures[i];
    if (r?.flagged && f && !overriddenSlugs.has(f.slug)) flaggedReasons[f.slug] = r.reasons;
  });
  const totalFlagged = Object.keys(flaggedReasons).length;

  // Active sports data provider + each provider's key status (for the switch UI).
  const activeProvider = await getActiveProviderId();
  const providerOptions = PROVIDER_IDS.map((id) => ({
    id,
    label: PROVIDER_META[id].label,
    keyConfigured: providerHasKey(id),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#002b5c]/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#002b5c]">
            <Sparkles className="h-3 w-3" /> Control Panel
          </span>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">Admin Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage predictions, previews and site data</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-600 hover:border-[#002b5c]/30 hover:text-[#002b5c] shadow-sm"
        >
          <ExternalLink className="h-4 w-4" /> View Site
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Trophy className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none text-zinc-900">{totalFixtures}</p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500">Upcoming Fixtures</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none text-zinc-900">{totalMatchdays}</p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500">Matchdays</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none text-zinc-900">{leagues.length}</p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500">Competitions</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <PenLine className="h-5 w-5" />
            </div>
            {totalEdited > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                <Pencil className="h-3 w-3" /> {totalEdited}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold leading-none text-zinc-900">{totalEdited}</p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500">Edited Previews</p>
        </div>
        {/* Registered users — read-only stat; the full table sits below the grid */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Users className="h-5 w-5" />
            </div>
            {userStats !== null && userStats.verified > 0 && (
              <span
                title={`${userStats.verified} of ${userStats.total} accounts have a verified email`}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
              >
                <CheckCircle2 className="h-3 w-3" /> {userStats.verified}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold leading-none text-zinc-900">
            {userStats === null ? "—" : userStats.total}
          </p>
          <p className="mt-1.5 text-xs font-medium text-zinc-500">Registered Users</p>
          {userStats !== null && userStats.pending > 0 && (
            <p className="mt-1 text-[11px] font-medium text-amber-600">
              {userStats.pending} awaiting email verification
            </p>
          )}
        </div>
      </div>

      {/* Registered Users — full table view (no drawer) */}
      <div className="mb-8">
        <RegisteredUsersTable token={adminToken as string} stats={userStats} />
      </div>

      {/* Data Provider */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Data Provider</h2>
            <p className="text-xs text-zinc-500">
              Switch between API-Football and Highlightly — useful when a daily quota is exhausted
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <ProviderControl
            token={adminToken as string}
            active={activeProvider}
            providers={providerOptions}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Data Management</h2>
              <p className="text-xs text-zinc-500">Manually run background jobs</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
              Fixtures/standings are cached (24h). Re-run a job here to refresh the
              public site data on demand — the fixtures table below updates immediately.
            </p>
            <JobRunner token={adminToken as string} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Monetization</h2>
              <p className="text-xs text-zinc-500">Ad slots &amp; affiliate links</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
              AdSense and affiliate integrations go here. Configure your ad slots below.
            </p>
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 space-y-1.5">
              <p className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Ad Slot 1 (leaderboard): <code className="bg-zinc-100 px-1 rounded">preview-leaderboard-1</code>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Ad Slot 2 (rectangle): <code className="bg-zinc-100 px-1 rounded">preview-rectangle-1</code>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Ad Slot 3 (banner): <code className="bg-zinc-100 px-1 rounded">preview-banner-2</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Prediction Review Warning Banner */}
      {totalFlagged > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                {totalFlagged} match{totalFlagged === 1 ? "" : "es"} need prediction review
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                These fixtures have a betting tip that contradicts their predicted scoreline or win probability, so they are
                hidden from the public site. Edit each match in the table below to fix the prediction and publish it again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Fixtures Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Upcoming Fixtures</h2>
              <p className="text-xs text-zinc-500">
                {totalFixtures} matches · {totalMatchdays} matchdays · {totalHidden} hidden · {totalFlagged} need review · fetched live from API
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
          </span>
        </div>
        <FixtureList
          fixtures={fixtures}
          overriddenSlugs={Array.from(overriddenSlugs)}
          hiddenSlugs={Array.from(hiddenSlugs)}
          flaggedReasons={flaggedReasons}
          token={adminToken as string}
        />
      </div>

      {/* SEO Tips */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-zinc-900 mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Eye className="h-4 w-4" />
          </div>
          SEO Tips for Passive Income
        </h2>
        <ul className="text-xs text-zinc-500 space-y-1.5 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#002b5c]" />
            Each preview page targets long-tail keywords: <strong className="text-zinc-700">&quot;Arsenal vs Chelsea Preview&quot;</strong>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#002b5c]" />
            JSON-LD structured data helps Google show rich results in search
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#002b5c]" />
            OpenGraph tags ensure good previews when shared on social media
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#002b5c]" />
            Set up Google Search Console to monitor which pages rank
          </li>
        </ul>
      </div>

      {/* Chat Moderation */}
      <ChatModeration token={adminToken as string} />
    </div>
  );
}
