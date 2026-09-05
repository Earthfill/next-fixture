// ---------------------------------------------------------------------------
// News Aggregator — The Guardian Open Platform
// ---------------------------------------------------------------------------
// Free tier: 500 requests/day, API key required.
// Sign up: https://open-platform.theguardian.com/access/
// ---------------------------------------------------------------------------

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: "The Guardian";
  url: string;
  imageUrl: string | null;
  date: string;
}

const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY;
const API_BASE = "https://content.guardianapis.com";

export function hasGuardianApi(): boolean {
  return Boolean(GUARDIAN_API_KEY);
}

function truncate(str: string, max: number = 200): string {
  return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, "") + "…" : str;
}

/**
 * Fetch football news from The Guardian API.
 */
export async function getFootballNews(options?: { pageSize?: number; page?: number }): Promise<{ articles: NewsItem[]; totalPages: number }> {
  if (!GUARDIAN_API_KEY) return { articles: [], totalPages: 0 };

  const pageSize = options?.pageSize ?? 7;
  const page = options?.page ?? 1;

  try {
    const res = await fetch(
      `${API_BASE}/search?` +
      `section=football&` +
      `show-fields=headline,trailText,thumbnail,byline&` +
      `show-tags=contributor&` +
      `order-by=newest&` +
      `page-size=${pageSize}&` +
      `page=${page}&` +
      `api-key=${GUARDIAN_API_KEY}`,
      { next: { revalidate: 1800, tags: ["news"] } as any }
    );

    if (!res.ok) {
      console.warn("Guardian API error:", res.status);
      return { articles: [], totalPages: 0 };
    }

    const json = await res.json();

    if (!json?.response?.results?.length) {
      console.warn("Guardian API returned no results");
      return { articles: [], totalPages: 0 };
    }

    const totalPages = json.response.pages || 1;

    const articles = json.response.results.map((item: any) => ({
      id: `guardian-${item.id?.replace(/\//g, "-") || item.webTitle}`,
      title: item.fields?.headline || item.webTitle || "",
      summary: truncate(item.fields?.trailText?.replace(/<[^>]*>/g, "") || "", 250),
      source: "The Guardian" as const,
      url: item.webUrl || "",
      imageUrl: item.fields?.thumbnail || null,
      date: item.webPublicationDate || "",
    }));

    return { articles, totalPages };
  } catch (err) {
    console.warn("Guardian API fetch error:", err);
    return { articles: [], totalPages: 0 };
  }
}

/**
 * Fetch all news (alias for backwards compatibility).
 */
export async function getNews(): Promise<NewsItem[]> {
  const result = await getFootballNews();
  return result.articles;
}
