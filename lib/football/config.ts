// ---------------------------------------------------------------------------
// Competition config — League mappings, slugs, logos, country groupings
// ---------------------------------------------------------------------------

// API-Football league IDs
const LEAGUE_DATA: { id: number; name: string; country: string; countryCode: string; logo?: string }[] = [
  // 🏆 Europe (UEFA)
  { id: 2, name: "Champions League", country: "Europe", countryCode: "EU" },
  { id: 3, name: "Europa League", country: "Europe", countryCode: "EU" },
  { id: 848, name: "Conference League", country: "Europe", countryCode: "EU" },

  // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 England
  { id: 39, name: "Premier League", country: "England", countryCode: "GB" },
  { id: 40, name: "Championship", country: "England", countryCode: "GB" },
  { id: 41, name: "League One", country: "England", countryCode: "GB" },
  { id: 42, name: "League Two", country: "England", countryCode: "GB" },
  { id: 179, name: "Scottish Premiership", country: "Scotland", countryCode: "GB" },

  // 🇪🇸 Spain
  { id: 140, name: "La Liga", country: "Spain", countryCode: "ES" },
  { id: 141, name: "Segunda División", country: "Spain", countryCode: "ES" },

  // 🇩🇪 Germany
  { id: 78, name: "Bundesliga", country: "Germany", countryCode: "DE" },
  { id: 79, name: "Bundesliga 2", country: "Germany", countryCode: "DE" },

  // 🇮🇹 Italy
  { id: 135, name: "Serie A", country: "Italy", countryCode: "IT" },
  { id: 136, name: "Serie B", country: "Italy", countryCode: "IT" },

  // 🇫🇷 France
  { id: 61, name: "Ligue 1", country: "France", countryCode: "FR" },
  { id: 62, name: "Ligue 2", country: "France", countryCode: "FR" },

  // 🇳🇱 Netherlands
  { id: 88, name: "Eredivisie", country: "Netherlands", countryCode: "NL" },

  // 🇵🇹 Portugal
  { id: 94, name: "Primeira Liga", country: "Portugal", countryCode: "PT" },

  // 🏆 Domestic cups
  // { id: 45, name: "FA Cup", country: "England", countryCode: "GB" },
  { id: 48, name: "Carabao Cup", country: "England", countryCode: "GB" },
  { id: 143, name: "Copa del Rey", country: "Spain", countryCode: "ES" },
  { id: 81, name: "DFB-Pokal", country: "Germany", countryCode: "DE" },
  { id: 137, name: "Coppa Italia", country: "Italy", countryCode: "IT" },
  { id: 66, name: "Coupe de France", country: "France", countryCode: "FR" },
];

const LOGO_URLS: Record<string, string> = {
  "Premier League": "https://crests.football-data.org/PL.png",
  "Championship": "https://crests.football-data.org/ELC.png",
  "League One": "https://crests.football-data.org/ELC.png",
  "League Two": "https://crests.football-data.org/ELC.png",
  "Scottish Premiership": "https://crests.football-data.org/SPL.png",
  "La Liga": "https://crests.football-data.org/PD.png",
  "Segunda División": "https://crests.football-data.org/SD.png",
  "Bundesliga": "https://crests.football-data.org/BL1.png",
  "Bundesliga 2": "https://crests.football-data.org/BL2.png",
  "Serie A": "https://crests.football-data.org/SA.png",
  "Serie B": "https://crests.football-data.org/SB.png",
  "Ligue 1": "https://crests.football-data.org/FL1.png",
  "Ligue 2": "https://crests.football-data.org/FL2.png",
  "Eredivisie": "https://crests.football-data.org/ED.png",
  "Primeira Liga": "https://crests.football-data.org/PPL.png",

  // UEFA
  "Champions League": "https://media.api-sports.io/football/leagues/2.png",
  "Europa League": "https://media.api-sports.io/football/leagues/3.png",
  "Conference League": "https://media.api-sports.io/football/leagues/848.png",
  // Domestic cups
  "FA Cup": "https://media.api-sports.io/football/leagues/45.png",
  "Carabao Cup": "https://media.api-sports.io/football/leagues/48.png",
  "Copa del Rey": "https://media.api-sports.io/football/leagues/143.png",
  "DFB-Pokal": "https://media.api-sports.io/football/leagues/81.png",
  "Coppa Italia": "https://media.api-sports.io/football/leagues/137.png",
  "Coupe de France": "https://media.api-sports.io/football/leagues/66.png",
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Deterministic API-Football team-crest URL.
 * The /players/topscorers, /fixtures, /events etc. endpoints sometimes omit the
 * team logo, but the media host serves every club crest from its numeric team
 * id at a stable path — so a missing logo can always be reconstructed locally
 * with zero extra API calls (e.g. /football/teams/569.png → Club Brugge KV).
 * Empty/unknown ids return "" so existing empty-logo handling keeps working.
 */
export function teamLogo(teamId?: string | number | null): string {
  const id = String(teamId ?? "").trim();
  if (id === "") return "";
  return `https://media.api-sports.io/football/teams/${id}.png`;
}

// Cup/knockout competitions — tracked for fixtures, but NOT shown in the
// header/footer league links.
const CUP_LEAGUE_IDS = new Set([45, 48, 143, 81, 137, 66]);

// ─── Build lookup maps ───────────────────────────────────────────────────

export const LEAGUE_IDS: Record<string, number> = {};
export const LEAGUE_ID_TO_NAME: Record<number, string> = {};
export const COMPETITION_LOGOS: Record<string, string> = {};
export const COMPETITION_SLUGS: Record<string, string> = {};
export const COMPETITION_NAMES: Record<string, string> = {};
export const SLUG_TO_LEAGUE_ID: Record<string, number> = {};
export const LEAGUE_BY_COUNTRY: Record<string, { name: string; slug: string; logo: string }[]> = {};
export const LEAGUE_ORDER: string[] = [];

for (const l of LEAGUE_DATA) {
  const slug = slugify(l.name);
  LEAGUE_IDS[l.name] = l.id;
  LEAGUE_ID_TO_NAME[l.id] = l.name;
  COMPETITION_LOGOS[l.name] = LOGO_URLS[l.name] || "";
  COMPETITION_SLUGS[l.name] = slug;
  COMPETITION_NAMES[slug] = l.name;
  SLUG_TO_LEAGUE_ID[slug] = l.id;
  LEAGUE_ORDER.push(l.name);

  // Cups aren't listed in the header/footer league links.
  if (CUP_LEAGUE_IDS.has(l.id)) continue;

  if (!LEAGUE_BY_COUNTRY[l.country]) {
    LEAGUE_BY_COUNTRY[l.country] = [];
  }
  LEAGUE_BY_COUNTRY[l.country].push({
    name: l.name,
    slug,
    logo: LOGO_URLS[l.name] || "",
  });
}

// Country display order (for the drawer)
export const COUNTRY_ORDER = ["Europe", "England", "Scotland", "Spain", "Germany", "Italy", "France", "Netherlands", "Portugal"];

// UEFA club-competition league-phase ids — these DO produce a real league table
// (used for primary-league selection, ranked below domestic leagues).
const UEFA_LEAGUE_PHASE_IDS = new Set([2, 3, 848]);

/**
 * Whether a competition slug yields a real league table (a domestic league or a
 * UEFA league phase) as opposed to a domestic cup, which only ever has bracket
 * stages and no meaningful position. Used to pick a sensible primary league for
 * a team page instead of accidentally landing on a cup.
 */
export function hasLeagueStandings(leagueSlug: string | null | undefined): boolean {
  if (!leagueSlug) return false;
  const id = SLUG_TO_LEAGUE_ID[leagueSlug];
  if (id == null) return false;
  return !CUP_LEAGUE_IDS.has(id);
}

/**
 * Priority rank for choosing a team's primary league: domestic leagues ranked
 * highest, then UEFA league-phase competitions, and domestic cups last.
 */
export function primaryCompetitionRank(leagueSlug: string | null | undefined): number {
  const id = leagueSlug ? SLUG_TO_LEAGUE_ID[leagueSlug] : undefined;
  if (id == null || CUP_LEAGUE_IDS.has(id)) return 3; // unmapped or cup / no table
  if (UEFA_LEAGUE_PHASE_IDS.has(id)) return 2; // UCL / UEL / UECL league phase
  return 1; // domestic league
}

export function teamSlug(name: string): string {
  return slugify(name);
}

/**
 * Fold common Latin diacritics to ASCII before slugifying, so non-ASCII team
 * names ("SpVgg Greuther Fürth") produce stable, URL-safe fixture slugs like
 * "...-vs-spvgg-greuther-furth". Without this, the raw "ü" ends up percent-
 * encoded in the URL (%C3%BC) while the admin override and cache keys store the
 * raw character — they stop matching, which breaks revalidation and the
 * prediction-review flow for any match with an accented team name.
 */
export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics (é→e, ü→u, ń→n)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateSlug(id: string, home: string, away: string): string {
  return `${id}--${normalizeSlug(home)}-vs-${normalizeSlug(away)}`;
}

export function parseSlug(slug: string): { fixtureId: string | null; homeSlug: string; awaySlug: string } {
  // Format: "{fixtureId}--{home}-vs-{away}" or old "{home}-vs-{away}"
  const doubleDashIdx = slug.indexOf("--");
  if (doubleDashIdx > -1) {
    const fixtureId = slug.substring(0, doubleDashIdx);
    const rest = slug.substring(doubleDashIdx + 2);
    const parts = rest.split("-vs-");
    return {
      fixtureId,
      homeSlug: parts[0] || "",
      awaySlug: parts[1] || "",
    };
  }
  // Old format: "{home}-vs-{away}" — no fixture ID
  const parts = slug.split("-vs-");
  return {
    fixtureId: null,
    homeSlug: parts[0] || "",
    awaySlug: parts[1] || "",
  };
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/fc|afc|ac|ssc|ssd|as\.|cf\./g, "").trim();
}
