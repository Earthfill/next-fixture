// ---------------------------------------------------------------------------
// Competition config — League mappings, slugs, logos, country groupings
// ---------------------------------------------------------------------------

// API-Football league IDs
const LEAGUE_DATA: { id: number; name: string; country: string; countryCode: string; logo?: string }[] = [
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
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

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
export const COUNTRY_ORDER = ["England", "Scotland", "Spain", "Germany", "Italy", "France", "Netherlands", "Portugal"];

export function generateSlug(id: string, home: string, away: string): string {
  return `${id}--${home.toLowerCase().replace(/\s+/g, "-")}-vs-${away.toLowerCase().replace(/\s+/g, "-")}`;
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
