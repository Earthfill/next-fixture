// ---------------------------------------------------------------------------
// UpcomingFixtures — Shows next 5 matches for a team (SportsMole-style)
// ---------------------------------------------------------------------------
import type { Fixture } from "@/lib/sports-api";

export default function UpcomingFixtures({
  teamName,
  fixtures,
}: {
  teamName: string;
  fixtures: Fixture[];
}) {
  if (!fixtures.length) return null;

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
    return d.toLocaleDateString("en-GB", options);
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-zinc-800 mb-2">{teamName} — Next 5 Matches</h3>
      <div className="text-sm text-zinc-500 space-y-1">
        {fixtures.map((m, i) => (
          <div key={i}>
            <div className="flex justify-between items-center">
              <span className="truncate">
                {m.homeTeam.name === teamName ? (
                  <>{m.homeTeam.name} vs {m.awayTeam.name}</>
                ) : (
                  <>{m.homeTeam.name} vs {m.awayTeam.name}</>
                )}
              </span>
              <span className="text-[11px] text-zinc-400 shrink-0 ml-2">
                {formatDate(m.date)}
              </span>
            </div>
            {m.competition && (
              <div className="text-[10px] text-zinc-400 leading-tight">{m.competition}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}