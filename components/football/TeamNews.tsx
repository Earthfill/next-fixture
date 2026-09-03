// ---------------------------------------------------------------------------
// TeamNews — Simple injury list (SportsMole-style)
// ---------------------------------------------------------------------------

import { Cross } from "lucide-react";
import LineupDisplay from "./LineupDisplay";

interface PlayerNews {
  name: string; status: string; reason?: string;
}

export default function TeamNews({ homeTeam, awayTeam, homeNews, awayNews, lineups }: { homeTeam: string; awayTeam: string; homeNews: PlayerNews[]; awayNews: PlayerNews[]; lineups: any[] }) {

  return (
    <div>
      <h2 className="sm-section-heading">Team News</h2>

      {lineups.length > 0 && lineups.some((l) => l.startXI && l.startXI.length > 0) && (
        <LineupDisplay lineups={lineups} />
      )}

      {homeNews.length === 0 && awayNews.length === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-700 mb-2">{homeTeam}</h3>
            {homeNews.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No reported issues</p>
            ) : (
              <ul className="text-xs text-zinc-600 space-y-1.5">
                {[...new Map(homeNews.map((p) => [p.name, p])).values()]
                  .sort((a, b) => {
                    if (a.status === "doubtful") return 1;
                    if (b.status === "doubtful") return -1;
                    return 0;
                  })
                  .map((p) => (
                    <li key={p.name} className="flex items-start gap-1.5">
                      <Cross
                        fill={p.status === "doubtful" ? "orange" : "red"}
                        color={p.status === "doubtful" ? "orange" : "red"}
                        className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-75"
                      />
                      <span>
                        <strong>{p.name}</strong> — {p.reason || p.status}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-700 mb-2">{awayTeam}</h3>
            {awayNews.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No reported issues</p>
            ) : (
              <ul className="text-xs text-zinc-600 space-y-1.5">
                {[...new Map(awayNews.map((p) => [p.name, p])).values()]
                  .sort((a, b) => {
                    if (a.status === "doubtful") return 1;
                    if (b.status === "doubtful") return -1;
                    return 0;
                  })
                  .map((p) => (
                    <li key={p.name} className="flex items-start gap-1.5">
                      <Cross
                        fill={p.status === "doubtful" ? "orange" : "red"}
                        color={p.status === "doubtful" ? "orange" : "red"}
                        className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-75"
                      />
                      <span>
                        <strong>{p.name}</strong> — {p.reason || p.status}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
