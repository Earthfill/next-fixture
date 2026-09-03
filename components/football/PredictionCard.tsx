// ---------------------------------------------------------------------------
// PredictionCard — "We say: [score]" SportsMole-style prediction
// ---------------------------------------------------------------------------

import { TrendingUp, ShieldCheck } from "lucide-react";

interface PredictionCardProps {
  homeTeam: string;
  awayTeam: string;
  predictedScore: { home: number; away: number };
  tip: string;
}

export default function PredictionCard({ homeTeam, awayTeam, predictedScore, tip }: PredictionCardProps) {
  return (
    <div>
      <h2 className="sm-section-heading">Match Prediction</h2>

      <div className="sm-prediction-box mb-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">We say:</p>
        <p className="sm-prediction-score">
          {homeTeam} {predictedScore.home} – {predictedScore.away} {awayTeam}
        </p>
        {/* <p className="text-xs text-zinc-500 mt-2">
          Confidence: <span className="font-bold text-zinc-700">{confidence}%</span>
        </p> */}
      </div>

      {/* Tip */}
      <div className="bg-zinc-50 border border-zinc-200 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Betting Tip</p>
            <p className="text-sm text-zinc-700 leading-relaxed">{tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
