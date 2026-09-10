// ---------------------------------------------------------------------------
// News Aggregator — RSS football feeds via rss-parser (no APIs / keys required)
// ---------------------------------------------------------------------------
// Sources are the RSS feeds in NEWS_FEEDS (comma-separated URLs). When NEWS_FEEDS
// is unset a sensible default set (BBC Sport Football + ESPN Soccer) is used.
// Each feed is parsed server-side with `rss-parser`, all feeds are merged,
// deduped by URL, sorted newest-first and paginated. Every fetch is cached for
// NEWS_REVALIDATE seconds (3 hours). One failing feed never breaks the page.
// ---------------------------------------------------------------------------

import Parser from "rss-parser";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  date: string;
}

// Headlines don't churn fast enough to justify frequent refetches — 3 hours.
const NEWS_REVALIDATE = 10_800; // seconds (3h)
const NEWS_CACHE_TAG = "news";

// Verified football-only RSS feeds, used when NEWS_FEEDS env is unset.
const DEFAULT_FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.espn.com/espn/rss/soccer/news",
];

// Comma-separated RSS feed URLs for football news (NEWS_FEEDS) — falls back to
// DEFAULT_FEEDS so the news sections work without any configuration.
const NEWS_FEEDS: string[] = (process.env.NEWS_FEEDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ACTIVE_FEEDS: string[] = NEWS_FEEDS.length ? NEWS_FEEDS : DEFAULT_FEEDS;

// How many items we grab per source before merging (bounded pagination set).
const PER_SOURCE = 30;

function truncate(str: string, max: number = 200): string {
  return str.length > max ? str.slice(0, max).replace(/\s+\S*$/, "") + "…" : str;
}

function stripHtml(html: string): string {
  return String(html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// ─── RSS providers (rss-parser) ─────────────────────────────────────────────

interface FeedItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  enclosure?: { url?: string; type?: string };
  mediaThumbnail?: unknown;
  mediaContent?: unknown;
}

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

/** Extract a URL from a media:* custom field (string or { $: { url } } / array). */
function mediaUrl(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) value = value[0];
  if (typeof value === "string") return value;
  const obj = value as { $?: { url?: string }; url?: string; attrs?: { url?: string } };
  return obj?.$?.url || obj?.url || obj?.attrs?.url || null;
}

async function fetchFeed(feedUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(feedUrl, {
      next: { revalidate: NEWS_REVALIDATE, tags: [NEWS_CACHE_TAG] },
    });
    if (!res.ok) {
      console.warn("News RSS error:", res.status, feedUrl);
      return [];
    }

    const xml = await res.text();
    const feed = await parser.parseString(xml);

    let source = (feed.title || "").trim();
    if (!source) {
      try {
        source = new URL(feedUrl).hostname.replace(/^www\./i, "");
      } catch {
        source = feedUrl;
      }
    }

    return (feed.items || [])
      .slice(0, PER_SOURCE)
      .map((raw) => {
        const item = raw as unknown as FeedItem;
        const title = item.title || "";
        const url = item.link || "";
        const imageUrl =
          item.enclosure?.url ||
          mediaUrl(item.mediaThumbnail) ||
          mediaUrl(item.mediaContent);
        return {
          id: `rss-${item.guid || item.link || title}`,
          title,
          summary: truncate(stripHtml(item.contentSnippet || item.content || ""), 250),
          source,
          url,
          imageUrl: imageUrl || null,
          date: item.isoDate || item.pubDate || "",
        };
      });
  } catch (err) {
    console.warn("News RSS fetch/parse error:", feedUrl, (err as Error).message);
    return [];
  }
}

// ─── Aggregator ─────────────────────────────────────────────────────────────

/**
 * Fetch football news from every ACTIVE RSS feed. Feeds run in parallel and are
 * isolated — one failing source never breaks the page. Results are deduped by
 * URL, sorted newest-first and paginated.
 */
export async function getFootballNews(
  options?: { pageSize?: number; page?: number }
): Promise<{ articles: NewsItem[]; totalPages: number }> {
  const pageSize = options?.pageSize ?? 7;
  const page = options?.page ?? 1;

  const feedGroups = await Promise.all(ACTIVE_FEEDS.map((url) => fetchFeed(url)));

  const seen = new Set<string>();
  const merged = ([] as NewsItem[])
    .concat(...feedGroups)
    .filter((n) => {
      if (!n.url || seen.has(n.url)) return false;
      seen.add(n.url);
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPages = Math.max(1, Math.ceil(merged.length / pageSize));
  const start = (page - 1) * pageSize;

  return { articles: merged.slice(start, start + pageSize), totalPages };
}

/**
 * Fetch all news (alias for backwards compatibility).
 */
export async function getNews(): Promise<NewsItem[]> {
  const result = await getFootballNews();
  return result.articles;
}
