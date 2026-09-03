// ---------------------------------------------------------------------------
// FormGuide — Simple form guide (SportsMole-style W/D/L badges)
// ---------------------------------------------------------------------------
import type { TeamForm } from "@/lib/sports-api";

function formatExtra(match: TeamForm["recentMatches"][0]): string {
  let suffix = "";
  if (match.extratime?.home != null && match.extratime?.away != null) {
    suffix = ` (aet ${match.extratime.home}-${match.extratime.away})`;
  }
  if (match.penalty?.home != null && match.penalty?.away != null) {
    suffix = ` (p ${match.penalty.home}-${match.penalty.away})`;
  }
  return suffix;
}

export default function FormGuide({ form }: { form: TeamForm }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-zinc-800 mb-2">{form.teamName} — Last 5 Matches</h3>
      <div className="flex items-center gap-1.5 mb-4">
        {form.results.map((r, i) => (
          <span key={i} className={r === 'W' ? 'sm-form-w' : r === 'D' ? 'sm-form-d' : 'sm-form-l'}>
            {r}
          </span>
        ))}
      </div>
      {form.recentMatches.length > 0 && (
        <div className="text-sm text-zinc-500 space-y-1">
          {form.recentMatches.map((m, i) => (
            <div key={i}>
              <div className="flex justify-between items-center">
                <span className="truncate">{m.opponent}</span>
                <span className={`font-medium shrink-0 ml-2 ${m.result === 'W' ? 'text-green-600' : m.result === 'D' ? 'text-amber-600' : 'text-red-600'}`}>
                  {m.score}{formatExtra(m)}
                </span>
              </div>
              {m.competition && (
                <div className="text-[10px] text-zinc-400 leading-tight">{m.competition}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
