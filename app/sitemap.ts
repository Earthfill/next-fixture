// ---------------------------------------------------------------------------
// Dynamic Sitemap — all SEO-relevant URLs
// ---------------------------------------------------------------------------
// IMPORTANT: Only uses static data and cached API calls to avoid rate limits.
// Preview pages are linked from every fixture card on the homepage and fixture
// pages, so Google will discover them through crawl links automatically.
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

  // Fixture date pages — these use a cached API call and don't trigger
  // per-fixture requests (avoids rate limiting)
  const matchdays = await getAvailableMatchdays();
  const fixturePages: MetadataRoute.Sitemap = matchdays.map((md) => ({
    url: `${SITE_URL}/fixtures/${md.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  // Preview pages are NOT fetched here to avoid hitting API rate limits.
  // Google discovers them via internal links from the homepage and fixture pages.
  // Every FootballMatchCard on the homepage links to /previews/{slug}.
  // As the sitemap regenerates hourly, preview pages will be indexed through
  // organic crawl of those links.

  return [...staticPages, ...leaguePages, ...fixturePages];
}