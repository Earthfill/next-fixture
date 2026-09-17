// ---------------------------------------------------------------------------
// /fixtures/[date] — Instant loading UI.
// Next.js streams this in immediately during navigation while the server
// component awaits its cached matchday data, so the user sees a skeleton
// instead of a blank page.
// ---------------------------------------------------------------------------

import FixturesLoadingSkeleton from "@/components/football/FixturesLoadingSkeleton";

export default function Loading() {
  return <FixturesLoadingSkeleton />;
}
