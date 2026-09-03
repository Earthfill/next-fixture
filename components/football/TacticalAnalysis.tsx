// ---------------------------------------------------------------------------
// TacticalAnalysis — Clean text analysis (SportsMole-style)
// ---------------------------------------------------------------------------

import React from "react";

export default function TacticalAnalysis({ analysis, homeTeam, awayTeam }: { analysis: string; homeTeam: string; awayTeam: string }) {
  if (!analysis || analysis.length < 50) {
    return (
      <div>
        <h2 className="sm-section-heading">Match Preview</h2>
        <div className="bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-500 italic">
          {analysis || "Preview coming soon."}
        </div>
      </div>
    );
  }

  // Split by double newlines into paragraphs (NLG output format)
  const paragraphs = analysis.split(/\n\n+/).filter(Boolean);

  return (
    <div>
      <h2 className="sm-section-heading">Match Preview</h2>
      <div className="sm-body">
        {paragraphs.map((p, i) => (
          <p key={i} className={i < paragraphs.length - 1 ? "mb-4" : ""}>{p}</p>
        ))}
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <div className="bg-zinc-50 border border-zinc-200 p-3">
            <h3 className="text-sm font-bold text-zinc-800 mb-1">{homeTeam} Key Points</h3>
            <ul className="text-sm text-zinc-600 space-y-1 list-disc pl-4">
              <li>Home advantage at familiar venue</li>
              <li>Strong attacking transitions</li>
              <li>Set-piece efficiency</li>
            </ul>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 p-3">
            <h3 className="text-sm font-bold text-zinc-800 mb-1">{awayTeam} Key Points</h3>
            <ul className="text-sm text-zinc-600 space-y-1 list-disc pl-4">
              <li>Compact defensive structure</li>
              <li>Counter-attacking speed</li>
              <li>Midfield press resistance</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
