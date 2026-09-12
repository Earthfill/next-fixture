// ---------------------------------------------------------------------------
// compute-round-stats — Compute per-round top scorers & top assist providers
// for a UEFA competition from its finished fixtures' goal events.
//
//   npm run stats:round -- 1                      → UCL + EL + ECL, round 1
//   npm run stats:round -- 1 2,3                 → UCL (2) + EL (3), round 1
//   npm run stats:round -- --round 2             → UCL + EL + ECL, round 2
//   npm run stats:round -- --cumulative          → full-season cumulative
//                                                   (runs without --round)
//
// Requires RAPIDAPI_KEY (or HIGHLIGHTLY_API_KEY) and network access.
// By default results are scoped to a single matchday because we read
// /fixtures/events for each finished fixture of that round (not the cumulative
// /players endpoints). Pass --cumulative to roll up every finished league-phase
// matchday plus all knockout-phase ties instead.
// ---------------------------------------------------------------------------

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore — may be absent in production (env vars come from the host).
  }
}

loadEnvFile(".env.local");

const DEFAULT_LEAGUES = [
  { cd: "UCL", name: "Champions League", id: 2 },
  { cd: "UEL", name: "Europa League", id: 3 },
  { cd: "UECL", name: "Conference League", id: 848 },
];

function parseArgs(argv: string[]): { round?: number; cumulative?: boolean; leagues: typeof DEFAULT_LEAGUES } {
  let round: number | undefined;
  let cumulative = false;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--round") {
      round = parseInt(argv[i + 1], 10) || undefined;
      i++;
    } else if (argv[i] === "--cumulative") {
      cumulative = true;
    } else {
      rest.push(argv[i]);
    }
  }
  let leagues = DEFAULT_LEAGUES;
  if (rest.length > 0) {
    const ids = rest.flatMap((r) => r.split(",")).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (ids.length) leagues = DEFAULT_LEAGUES.filter((l) => ids.includes(l.id));
  }
  return { round, cumulative, leagues };
}

function printTable(title: string, rows: { position?: number; name: string; stat: number; team?: string }[]): void {
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log("  (no data)");
    return;
  }
  for (const r of rows) {
    const pos = r.position != null ? `#${r.position}`.padEnd(4) : "    ";
    const name = r.name.padEnd(28);
    const team = r.team ? `  ${r.team}` : "";
    console.log(`${pos} ${name} ${String(r.stat).padStart(3)}${team}`);
  }
}

async function main(): Promise<void> {
  const { round, cumulative, leagues } = parseArgs(process.argv.slice(2));

  const { computeRoundGoalStats } = await import("../lib/football/round-stats");
  const opts = cumulative ? { cumulative: true } : undefined;

  for (const league of leagues) {
    const stats = await computeRoundGoalStats(league.id, round, opts);
    const label = !stats.round
      ? "no finished league-stage match"
      : cumulative
        ? `Full season (through Matchday ${stats.round}${stats.hasKnockouts ? " + knockouts" : ""})`
        : `Round ${stats.round}`;
    console.log(
      `\n${league.name} (league ${league.id}) — ${label} · season ${stats.league.season} · ` +
        `${stats.fixturesCounted}/${stats.fixturesFound} finished · ${stats.goals} goals`
    );

    printTable(
      "Top Scorers",
      stats.scorers.map((s) => ({
        position: s.position,
        name: s.player.name,
        stat: s.goals,
        team: s.team.name,
      }))
    );

    printTable(
      "Top Assists",
      stats.assisters.map((a) => ({
        position: a.position,
        name: a.player.name,
        stat: a.assists ?? 0,
        team: a.team.name,
      }))
    );
  }
}

main().catch((err) => {
  console.error("[stats:round] failed:", err);
  process.exit(1);
});

export {};