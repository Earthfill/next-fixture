// ---------------------------------------------------------------------------
// OddsWidget — Dynamic odds comparison with tabbed market views
// ---------------------------------------------------------------------------

import { getFixtureOdds } from "@/lib/sports-api";
import OddsTabbedView from "./OddsTabbedView";

interface OddsWidgetProps {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
}

export default async function OddsWidget({ fixtureId, homeTeam, awayTeam }: OddsWidgetProps) {
  const rows = await getFixtureOdds(fixtureId, homeTeam, awayTeam);

  return (
    <div>
      <h2 className="sm-section-heading">Match Odds</h2>
      <OddsTabbedView rows={rows} />
      <p className="text-[10px] text-zinc-400 mt-2 text-center">
        18+ | Odds subject to change | Please gamble responsibly | #ad
      </p>
      {rows.some((r) => r.affiliateUrl.includes("YOUR_")) && (
        <p className="text-[9px] text-amber-600 mt-1 text-center">
          Affiliate links are placeholders. Set your affiliate IDs in lib/football/odds.ts
        </p>
      )}
    </div>
  );
}
