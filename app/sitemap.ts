// ---------------------------------------------------------------------------
// Dynamic Sitemap — all SEO-relevant URLs
// ---------------------------------------------------------------------------
import type { MetadataRoute } from "next";
import { getAvailableMatchdays } from "@/lib/sports-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com";

// League slugs covered by the platform
const LEAGUE_SLUGS = [
  "premier-league",
  "championship",
  "league-one",
  "league-two",
  "scottish-premiership",
  "la-liga",
  "segunda-division",
  "bundesliga",
  "bundesliga-2",
  "serie-a",
  "serie-b",
  "ligue-1",
  "ligue-2",
  "eredivisie",
  "primeira-liga",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.1,
    },
  ];

  // League pages
  const leaguePages: MetadataRoute.Sitemap = LEAGUE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/leagues/${slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Fixture date pages (next 14 days)
  const matchdays = await getAvailableMatchdays();
  const fixturePages: MetadataRoute.Sitemap = matchdays.map((md) => ({
    url: `${SITE_URL}/fixtures/${md.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  // Preview pages — fetch all fixtures across all matchdays
  const previewSlugs = new Set<string>();
  for (const md of matchdays) {
    const { getFixturesByDateGroupedByLeague } = await import("@/lib/sports-api");
    const data = await getFixturesByDateGroupedByLeague(md.slug);
    if (data) {
      for (const league of data.leagues) {
        for (const fixture of league.fixtures) {
          if (fixture.slug) previewSlugs.add(fixture.slug);
        }
      }
    }
  }

  const previewPages: MetadataRoute.Sitemap = Array.from(previewSlugs).map((slug) => ({
    url: `${SITE_URL}/previews/${slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));

  return [...staticPages, ...leaguePages, ...fixturePages, ...previewPages];
}