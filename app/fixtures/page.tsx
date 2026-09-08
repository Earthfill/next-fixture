// ---------------------------------------------------------------------------
// /fixtures — Stable entry point that redirects to the soonest upcoming
// matchday (i.e. the first available /fixtures/[date] page).
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { getAvailableMatchdays } from "@/lib/cache/pages";

export const revalidate = 10800; // 3 hours

export const metadata = {
  title: "Football Fixtures",
  description:
    "Browse football fixtures by date across the Premier League, La Liga, Serie A, Bundesliga and more.",
};

export default async function FixturesIndexPage() {
  const matchdays = await getAvailableMatchdays();
  const first = matchdays[0]?.slug;
  redirect(first ? `/fixtures/${first}` : "/");
}