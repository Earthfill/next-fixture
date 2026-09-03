// ---------------------------------------------------------------------------
// HeadToHeadTable — Simple results grid (SportsMole-style)
// ---------------------------------------------------------------------------
import type { HeadToHeadMatch } from "@/lib/sports-api";

export default function HeadToHeadTable({ matches, homeTeam, awayTeam }: { matches: HeadToHeadMatch[]; homeTeam: string; awayTeam: string }) {
  const homeWins = matches.filter(m => 
    (m.homeTeam.toLowerCase() === homeTeam.toLowerCase() && m.homeScore > m.awayScore) ||
    (m.awayTeam.toLowerCase() === homeTeam.toLowerCase() && m.awayScore > m.homeScore)
  ).length;
  const awayWins = matches.filter(m =>
    (m.homeTeam.toLowerCase() === awayTeam.toLowerCase() && m.homeScore > m.awayScore) ||
    (m.awayTeam.toLowerCase() === awayTeam.toLowerCase() && m.awayScore > m.homeScore)
  ).length;
  const draws = matches.length - homeWins - awayWins;

  return (
    <div>
      <h2 className="sm-section-heading">Head-to-Head</h2>

      <div className="flex items-center justify-center gap-6 text-xs text-zinc-600 mb-4">
        <span><span className="font-bold text-green-600">{homeWins}</span> {homeTeam} wins</span>
        <span><span className="font-bold text-amber-600">{draws}</span> draws</span>
        <span><span className="font-bold text-red-600">{awayWins}</span> {awayTeam} wins</span>
      </div>

      <table className="sm-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Competition</th>
            <th>Home</th>
            <th className="text-center">Score</th>
            <th>Away</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const homeWin = m.homeScore > m.awayScore;
            const awayWin = m.awayScore > m.homeScore;

            return (
              <tr key={i}>
                <td className="text-xs text-zinc-500">{m.date}</td>
                <td className="text-xs text-zinc-500">{m.competition}</td>
                <td className={`text-sm ${homeWin ? 'font-bold text-zinc-800' : ''}`}>{m.homeTeam}</td>
                <td className="text-left text-sm text-zinc-500 font-bold">{m.homeScore} - {m.awayScore}</td>
                <td className={`text-sm ${awayWin ? 'font-bold text-zinc-800' : ''}`}>{m.awayTeam}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
