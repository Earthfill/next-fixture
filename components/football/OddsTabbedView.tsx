// ---------------------------------------------------------------------------
// OddsTabbedView — Client component that renders odds markets in tabs
// ---------------------------------------------------------------------------
"use client";

import { useState, useMemo } from "react";

interface OddsRow {
  name: string;
  key: string;
  logo: string;
  home: number;
  draw: number;
  away: number;
  doubleChance: { homeDraw: number; homeAway: number; drawAway: number } | null;
  goalsOverUnder: { line: number; over: number; under: number }[];
  bothTeamsScore: { yes: number; no: number } | null;
  affiliateUrl: string;
}

interface Props {
  rows: OddsRow[];
}

type TabId = "winner" | "double-chance" | "goals-ou" | "btts";

export default function OddsTabbedView({ rows }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("winner");

  const tabs: { id: TabId; label: string; available: boolean }[] = [
    { id: "winner", label: "Match Winner", available: true },
    { id: "double-chance", label: "Double Chance", available: rows.some((r) => r.doubleChance) },
    { id: "goals-ou", label: "Goals O/U", available: rows.some((r) => r.goalsOverUnder.length > 0) },
    { id: "btts", label: "Both Teams Score", available: rows.some((r) => r.bothTeamsScore) },
  ];

  // Only show tabs with available data, default to first available
  const visibleTabs = tabs.filter((t) => t.available);
  const activeId = visibleTabs.find((t) => t.id === activeTab)?.id ?? visibleTabs[0]?.id ?? "winner";

  // ── Best-values lookup ──────────────────────────────────────────
  const best = useMemo(() => {
    const bestHome = Math.max(...rows.map((r) => r.home));
    const bestDraw = Math.max(...rows.map((r) => r.draw));
    const bestAway = Math.max(...rows.map((r) => r.away));

    const dcRows = rows.filter((r) => r.doubleChance);
    const bestHD = Math.max(...dcRows.map((r) => r.doubleChance!.homeDraw));
    const bestHA = Math.max(...dcRows.map((r) => r.doubleChance!.homeAway));
    const bestDA = Math.max(...dcRows.map((r) => r.doubleChance!.drawAway));

    const bestOverByLine = new Map<number, number>();
    const bestUnderByLine = new Map<number, number>();
    for (const row of rows) {
      for (const g of row.goalsOverUnder) {
        bestOverByLine.set(g.line, Math.max(bestOverByLine.get(g.line) ?? 0, g.over));
        bestUnderByLine.set(g.line, Math.max(bestUnderByLine.get(g.line) ?? 0, g.under));
      }
    }

    const bttsRows = rows.filter((r) => r.bothTeamsScore);
    const bestYes = Math.max(...bttsRows.map((r) => r.bothTeamsScore!.yes));
    const bestNo = Math.max(...bttsRows.map((r) => r.bothTeamsScore!.no));

    return { bestHome, bestDraw, bestAway, bestHD, bestHA, bestDA, bestOverByLine, bestUnderByLine, bestYes, bestNo };
  }, [rows]);

  // ── Consolidation helpers ──────────────────────────────────────────
  // When all bookmakers return the same value for a given market,
  // we render a single consolidated row without the bookmaker column.
  function areAllIdentical(values: number[]): boolean {
    if (values.length <= 1) return false;
    return values.every((v) => v === values[0]);
  }

  const winnerAllSame = useMemo(() => {
    return (
      areAllIdentical(rows.map((r) => r.home)) &&
      areAllIdentical(rows.map((r) => r.draw)) &&
      areAllIdentical(rows.map((r) => r.away))
    );
  }, [rows]);

  const dcAllSame = useMemo(() => {
    const dcRows = rows.filter((r) => r.doubleChance);
    if (dcRows.length <= 1) return false;
    return (
      areAllIdentical(dcRows.map((r) => r.doubleChance?.homeDraw ?? 0)) &&
      areAllIdentical(dcRows.map((r) => r.doubleChance?.homeAway ?? 0)) &&
      areAllIdentical(dcRows.map((r) => r.doubleChance?.drawAway ?? 0))
    );
  }, [rows]);

  const goalsAllSame = useMemo(() => {
    const ouRows = rows.filter((r) => r.goalsOverUnder.length > 0);
    if (ouRows.length <= 1) return false;
    // Compare every O/U value across all bookmakers for each line
    const lines = ouRows[0].goalsOverUnder.map((g) => g.line);
    return lines.every((line) => {
      const overs = ouRows.map((r) => r.goalsOverUnder.find((g) => g.line === line)?.over ?? 0);
      const unders = ouRows.map((r) => r.goalsOverUnder.find((g) => g.line === line)?.under ?? 0);
      return areAllIdentical(overs) && areAllIdentical(unders);
    });
  }, [rows]);

  const bttsAllSame = useMemo(() => {
    const bttsRows = rows.filter((r) => r.bothTeamsScore);
    if (bttsRows.length <= 1) return false;
    return (
      areAllIdentical(bttsRows.map((r) => r.bothTeamsScore?.yes ?? 0)) &&
      areAllIdentical(bttsRows.map((r) => r.bothTeamsScore?.no ?? 0))
    );
  }, [rows]);

  
  return (
    <div>
      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="flex border-b border-zinc-300 mb-3 text-xs font-medium">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 transition-colors ${activeId === tab.id
              ? "border-b-2 border-(--sm-blue) text-(--sm-blue) font-semibold"
              : "text-zinc-500 hover:text-zinc-700"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Match Winner ─────────────────────────────────────────── */}
      {activeId === "winner" && (
        <table className="sm-table">
          <thead>
            <tr>
              {!winnerAllSame && <th>Bookmaker</th>}
              <th className="text-center">Home</th>
              <th className="text-center">Draw</th>
              <th className="text-center">Away</th>
            </tr>
          </thead>
          <tbody>
            {winnerAllSame ? (
              <tr>
                <td className={`font-bold text-left text-sm text-zinc-800`}>
                  {rows[0].home.toFixed(2)}
                </td>
                <td className={`font-bold text-left text-sm text-zinc-800`}>
                  {rows[0].draw.toFixed(2)}
                </td>
                <td className={`font-bold text-left text-sm text-zinc-800`}>
                  {rows[0].away.toFixed(2)}
                </td>
              </tr>
            ) : (
              rows.map((b, i) => (
                <tr key={i}>
                  <td className="font-medium text-zinc-700">{b.name}</td>
                  <td className={`${b.home === best.bestHome ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                    {b.home.toFixed(2)}
                    {b.home === best.bestHome && <span className="ml-1 text-[10px] text-green-600">★</span>}
                  </td>
                  <td className={`${b.draw === best.bestDraw ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                    {b.draw.toFixed(2)}
                    {b.draw === best.bestDraw && <span className="ml-1 text-[10px] text-green-600">★</span>}
                  </td>
                  <td className={`${b.away === best.bestAway ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                    {b.away.toFixed(2)}
                    {b.away === best.bestAway && <span className="ml-1 text-[10px] text-green-600">★</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* ── Double Chance ──────────────────────────────────────────── */}
      {activeId === "double-chance" && (
        <table className="sm-table">
          <thead>
            <tr>
              {!dcAllSame && <th>Bookmaker</th>}
              <th className="text-center">Home or Draw</th>
              <th className="text-center">Home or Away</th>
              <th className="text-center">Draw or Away</th>
            </tr>
          </thead>
          <tbody>
            {dcAllSame ? (
              (() => {
                const dc = rows.find((r) => r.doubleChance)!.doubleChance!;
                return (
                  <tr>
                    <td className="font-bold text-left text-sm text-zinc-800">{dc.homeDraw.toFixed(2)}</td>
                    <td className="font-bold text-left text-sm text-zinc-800">{dc.homeAway.toFixed(2)}</td>
                    <td className="font-bold text-left text-sm text-zinc-800">{dc.drawAway.toFixed(2)}</td>
                  </tr>
                );
              })()
            ) : (
              rows.filter((r) => r.doubleChance).map((b, i) => {
                const dc = b.doubleChance!;
                return (
                  <tr key={i}>
                    <td className="font-medium text-zinc-700">{b.name}</td>
                    <td className={`${dc.homeDraw === best.bestHD ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                      {dc.homeDraw.toFixed(2)}
                      {dc.homeDraw === best.bestHD && <span className="ml-1 text-[10px] text-green-600">★</span>}
                    </td>
                    <td className={`${dc.homeAway === best.bestHA ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                      {dc.homeAway.toFixed(2)}
                      {dc.homeAway === best.bestHA && <span className="ml-1 text-[10px] text-green-600">★</span>}
                    </td>
                    <td className={`${dc.drawAway === best.bestDA ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                      {dc.drawAway.toFixed(2)}
                      {dc.drawAway === best.bestDA && <span className="ml-1 text-[10px] text-green-600">★</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}

      {/* ── Goals Over/Under ──────────────────────────────────────── */}
      {activeId === "goals-ou" && (
        <table className="sm-table">
          <thead>
            <tr>
              {!goalsAllSame && <th>Bookmaker</th>}
              {rows[0]?.goalsOverUnder.map((g) => (
                <th key={g.line} className="text-center">O/U {g.line}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {goalsAllSame ? (
              <tr>
                {rows[0].goalsOverUnder.slice(0, 5).map((g) => (
                  <td key={g.line} className="text-left text-sm p-1">
                    <div className="inline-block min-w-13 rounded-sm px-1.5 py-0.5 font-bold">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-0.5">O</span>
                      {g.over.toFixed(2)}
                    </div>
                    <span className="block h-px bg-zinc-200 mx-2 my-0.5" />
                    <div className="inline-block min-w-13 rounded-sm px-1.5 py-0.5 font-bold">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-0.5">U</span>
                      {g.under.toFixed(2)}
                    </div>
                  </td>
                ))}
              </tr>
            ) : (
              rows.filter((r) => r.goalsOverUnder.length > 0).map((b, i) => {
                return (
                <tr key={i}>
                  <td className="font-medium text-zinc-700 align-middle">{b.name}</td>
                  {b.goalsOverUnder.slice(0, 5).map((g) => {
                    const isBestOver = g.over === best.bestOverByLine.get(g.line);
                    const isBestUnder = g.under === best.bestUnderByLine.get(g.line);
                    return (
                      <td key={g.line} className="text-left text-sm p-1">
                        <div className={`inline-block min-w-13 rounded-sm px-1.5 py-0.5 ${isBestOver ? "font-bold" : "text-zinc-700"}`}>
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-0.5">O</span>
                          {g.over.toFixed(2)}
                          {isBestOver && <span className="ml-0.5 text-[10px] text-green-800">★</span>}
                        </div>
                        <span className="block h-px bg-zinc-200 mx-2 my-0.5" />
                        <div className={`inline-block min-w-13 rounded-sm px-1.5 py-0.5 ${isBestUnder ? "font-bold" : "text-zinc-700"}`}>
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-0.5">U</span>
                          {g.under.toFixed(2)}
                          {isBestUnder && <span className="ml-0.5 text-[10px] text-green-800">★</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )})
            )}
          </tbody>
        </table>
      )}

      {/* ── Both Teams Score ─────────────────────────────────────── */}
      {activeId === "btts" && (
        <table className="sm-table">
          <thead>
            <tr>
              {!bttsAllSame && <th>Bookmaker</th>}
              <th className="text-center">Yes</th>
              <th className="text-center">No</th>
            </tr>
          </thead>
          <tbody>
            {bttsAllSame ? (
              (() => {
                const btts = rows.find((r) => r.bothTeamsScore)!.bothTeamsScore!;
                return (
                  <tr>
                    <td className="font-bold text-left text-sm text-zinc-800">{btts.yes.toFixed(2)}</td>
                    <td className="font-bold text-left text-sm text-zinc-800">{btts.no.toFixed(2)}</td>
                  </tr>
                );
              })()
            ) : (
              rows.filter((r) => r.bothTeamsScore).map((b, i) => {
                const btts = b.bothTeamsScore!;
                return (
                  <tr key={i}>
                    <td className="font-medium text-zinc-700">{b.name}</td>
                    <td className={`${btts.yes === best.bestYes ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                      {btts.yes.toFixed(2)}
                      {btts.yes === best.bestYes && <span className="ml-1 text-[10px] text-green-600">★</span>}
                    </td>
                    <td className={`${btts.no === best.bestNo ? "font-bold" : ""} text-left text-sm text-zinc-800`}>
                      {btts.no.toFixed(2)}
                      {btts.no === best.bestNo && <span className="ml-1 text-[10px] text-green-600">★</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}