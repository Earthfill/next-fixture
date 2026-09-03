// ---------------------------------------------------------------------------
// Odds Service — Fetch odds from API-Football + affiliate link injection
// ---------------------------------------------------------------------------

import { apiFetch } from "@/lib/football/api";
import type { AffiliateConfig } from "@/lib/types";

// ─── Affiliate Configurations ────────────────────────────────────────
// Replace the affValue placeholders with your actual affiliate IDs

export const AFFILIATES: Record<string, AffiliateConfig> = {
  bet365: {
    key: "bet365",
    name: "Bet365",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Bet365_Logo.svg/256px-Bet365_Logo.svg.png",
    baseUrl: "https://www.bet365.com",
    affParam: "affiliate",
    affValue: "YOUR_BET365_ID",
  },
  williamhill: {
    key: "williamhill",
    name: "William Hill",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/William_Hill_logo.svg/256px-William_Hill_logo.svg.png",
    baseUrl: "https://sports.williamhill.com",
    affParam: "affiliate_id",
    affValue: "YOUR_WH_ID",
  },
  draftkings: {
    key: "draftkings",
    name: "DraftKings",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/DraftKings_logo.svg/256px-DraftKings_logo.svg.png",
    baseUrl: "https://www.draftkings.com",
    affParam: "aff",
    affValue: "YOUR_DK_ID",
  },
  fanduel: {
    key: "fanduel",
    name: "FanDuel",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/FanDuel_logo.svg/256px-FanDuel_logo.svg.png",
    baseUrl: "https://www.fanduel.com",
    affParam: "affiliateId",
    affValue: "YOUR_FD_ID",
  },
  betfair: {
    key: "betfair",
    name: "Betfair",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Betfair_logo.svg/256px-Betfair_logo.svg.png",
    baseUrl: "https://www.betfair.com",
    affParam: "affiliate",
    affValue: "YOUR_BETFAIR_ID",
  },
};

function bookmakerKey(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n.includes("bet365")) return "bet365";
  if (n.includes("williamhill")) return "williamhill";
  if (n.includes("draftkings")) return "draftkings";
  if (n.includes("fanduel")) return "fanduel";
  if (n.includes("betfair")) return "betfair";
  return name.toLowerCase().replace(/\s+/g, "");
}

export function buildAffiliateUrl(bookmakerKey: string, path: string = ""): string {
  const aff = AFFILIATES[bookmakerKey];
  if (!aff) return `https://www.${bookmakerKey}.com${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${aff.baseUrl}${path}${sep}${aff.affParam}=${aff.affValue}`;
}

let oddsBookmakers: { id: number; name: string }[] | null = null;
let bookmakersFetchedAt = 0;
const BOOKMAKERS_CACHE_TTL = 86400_000; // 24h

async function getBookmakerName(id: number): Promise<string> {
  if (!oddsBookmakers || Date.now() - bookmakersFetchedAt > BOOKMAKERS_CACHE_TTL) {
    const data = await apiFetch<{ response: { id: number; name: string }[] }>("/odds/bookmakers");
    if (data?.response) {
      oddsBookmakers = data.response;
      bookmakersFetchedAt = Date.now();
    }
  }
  return oddsBookmakers?.find((b) => b.id === id)?.name || `Bookmaker ${id}`;
}

// ─── Helper to find a bet by id or name ────────────────────────────

function findBet(bets: any[], id: number, nameSubstring?: string) {
  return (bets || []).find(
    (bet: any) =>
      bet.id === id ||
      (nameSubstring && bet.name?.toLowerCase().includes(nameSubstring))
  );
}

// ─── Market value finders ──────────────────────────────────────────

function findValue(values: any[], matchValue: string): number | undefined {
  const v = values.find(
    (x: any) => x.value?.toString().toLowerCase() === matchValue.toLowerCase()
  );
  return v ? parseFloat(v.odd) : undefined;
}

function extractOverUnder(values: any[]): { line: number; over: number; under: number }[] {
  const results: { line: number; over: number; under: number }[] = [];
  const parsed = new Map<number, { over?: number; under?: number }>();
  for (const v of values || []) {
    const raw = v.value as string;
    const odd = parseFloat(v.odd);
    const overMatch = raw.match(/^Over\s+([\d.]+)$/i);
    const underMatch = raw.match(/^Under\s+([\d.]+)$/i);
    const line = overMatch ? parseFloat(overMatch[1]) : underMatch ? parseFloat(underMatch[1]) : NaN;
    if (isNaN(line)) continue;
    if (!parsed.has(line)) parsed.set(line, {});
    const entry = parsed.get(line)!;
    if (overMatch) entry.over = odd;
    if (underMatch) entry.under = odd;
  }
  for (const [line, { over, under }] of parsed) {
    if (over !== undefined && under !== undefined) {
      results.push({ line, over, under });
    }
  }
  results.sort((a, b) => a.line - b.line);
  return results;
}

export async function getFixtureOdds(
  fixtureId: string | number,
  homeTeam: string,
  awayTeam: string
): Promise<
  {
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
  }[]
> {
  const data = await apiFetch<{ response: any[] }>(`/odds?fixture=${fixtureId}`);
  if (!data?.response?.length) return getFallbackOdds(homeTeam, awayTeam);

  const fixtureOdds = data.response[0];
  if (!fixtureOdds?.bookmakers?.length) return getFallbackOdds(homeTeam, awayTeam);

  const rows: {
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
  }[] = [];

  for (const bm of fixtureOdds.bookmakers) {
    const bmName = await getBookmakerName(bm.id);
    const key = bookmakerKey(bmName);
    const aff = AFFILIATES[key];
    const bets = bm.bets || [];

    // ── 1. Match Winner (id: 1) ────────────────────────────────────
    const matchWinnerBet = findBet(bets, 1, "winner");
    let home = 2.00, draw = 3.25, away = 3.40;
    if (matchWinnerBet?.values?.length) {
      const vals = matchWinnerBet.values;
      home = parseFloat(vals.find((v: any) => v.value === "Home" || v.value === "1")?.odd || "2.00");
      draw = parseFloat(vals.find((v: any) => v.value === "Draw" || v.value === "X")?.odd || "3.25");
      away = parseFloat(vals.find((v: any) => v.value === "Away" || v.value === "2")?.odd || "3.40");
    }

    // ── 2. Double Chance (id: 12) ──────────────────────────────────
    let doubleChance: { homeDraw: number; homeAway: number; drawAway: number } | null = null;
    const dcBet = findBet(bets, 12, "double chance");
    if (dcBet?.values?.length) {
      const vals = dcBet.values;
      doubleChance = {
        homeDraw: findValue(vals, "Home/Draw") ?? 1.36,
        homeAway: findValue(vals, "Home/Away") ?? 1.33,
        drawAway: findValue(vals, "Draw/Away") ?? 1.50,
      };
    }

    // ── 3. Goals Over/Under (id: 5) ────────────────────────────────
    let goalsOverUnder: { line: number; over: number; under: number }[] = [];
    const ouBet = findBet(bets, 5, "goals over/under");
    if (ouBet?.values?.length) {
      goalsOverUnder = extractOverUnder(ouBet.values);
    }

    // ── 4. Both Teams Score (id: 8) ────────────────────────────────
    let bothTeamsScore: { yes: number; no: number } | null = null;
    const bttsBet = findBet(bets, 8, "both teams score");
    if (bttsBet?.values?.length) {
      const vals = bttsBet.values;
      bothTeamsScore = {
        yes: findValue(vals, "Yes") ?? 2.00,
        no: findValue(vals, "No") ?? 1.72,
      };
    }

    rows.push({
      name: bmName,
      key,
      logo: aff?.logo || "",
      home,
      draw,
      away,
      doubleChance,
      goalsOverUnder,
      bothTeamsScore,
      affiliateUrl: aff ? buildAffiliateUrl(key) : "",
    });
  }

  return rows.length ? rows : getFallbackOdds(homeTeam, awayTeam);
}

// ─── Fallback odds (when API key not set or fixture not found) ────────

export function getFallbackOdds(
  homeTeam: string,
  awayTeam: string
): {
  name: string; key: string; logo: string;
  home: number; draw: number; away: number;
  doubleChance: { homeDraw: number; homeAway: number; drawAway: number } | null;
  goalsOverUnder: { line: number; over: number; under: number }[];
  bothTeamsScore: { yes: number; no: number } | null;
  affiliateUrl: string;
}[] {
  return Object.values(AFFILIATES).map((aff) => ({
    name: aff.name,
    key: aff.key,
    logo: aff.logo,
    home: 2.10,
    draw: 3.40,
    away: 3.80,
    doubleChance: { homeDraw: 1.36, homeAway: 1.33, drawAway: 1.50 },
    goalsOverUnder: [
      { line: 0.5, over: 1.09, under: 6.25 },
      { line: 1.5, over: 1.44, under: 2.60 },
      { line: 2.5, over: 2.35, under: 1.55 },
      { line: 3.5, over: 4.20, under: 1.19 },
    ],
    bothTeamsScore: { yes: 2.00, no: 1.72 },
    affiliateUrl: buildAffiliateUrl(aff.key),
  }));
}
