// ---------------------------------------------------------------------------
// YouTube Highlights Service — Search for match highlights via YouTube Data API v3
// ---------------------------------------------------------------------------

import { normalizeName } from "@/lib/football/config";

export interface HighlightVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  publishedAt: string;
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

/**
 * Search YouTube for match highlights for a given fixture.
 * Returns up to `maxResults` videos (default 3).
 *
 * Videos whose embed is disabled (`status.embeddable === false`) are filtered
 * out up-front — otherwise the iframe player shows "Video unavailable — the
 * uploader has not made this video available", i.e. a broken embed. We over-fetch
 * from search (maxResults + 4) so filtering still yields up to `maxResults`.
 *
 * Returns an empty array if no API key is configured or no results found.
 */
export async function getYouTubeHighlights(
  homeTeam: string,
  awayTeam: string,
  competition: string,
  date: string,
  maxResults: number = 3,
): Promise<HighlightVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  // Build a focused search query
  const query = `${homeTeam} vs ${awayTeam} ${competition} Highlights`;

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    // NOTE: no videoDuration filter. Official league/club channel highlights and
    // recaps are frequently longer than 4 minutes (i.e. YouTube "long"), and a
    // `videoDuration=medium` filter silently drops exactly those — leaving a
    // league page with no highlights even though the official video exists.
    maxResults: String(maxResults + 4),
    order: "relevance",
    key: YOUTUBE_API_KEY,
    publishedAfter: date
  });

  try {
    // NOTE: no Next.js fetch-level caching here — the cache-aside layer
    // (lib/cache/pages.ts) owns the 24h TTL via Redis/PostgreSQL.
    const res = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`);

    if (!res.ok) {
      console.warn("YouTube API error:", res.status);
      return [];
    }

    const data: YouTubeSearchResponse = await res.json();

    if (!data.items?.length) return [];

    // Prefer videos uploaded by the fixture's OFFICIAL channels (home club, away
    // club, the competition league). Official uploads are globally playable /
    // embeddable, so leading with them avoids the "not available in your country"
    // player errors. This is a reorder only — results are never dropped purely for
    // being non-official, so unmapped fixtures fall back to relevance order.
    const ordered = preferOfficialChannels(data.items, [homeTeam, awayTeam, competition]);

    // Verify each matched video can actually be embedded before returning it.
    const embeddableIds = await filterEmbeddable(
      ordered.map((item) => item.id.videoId).filter(Boolean)
    );

    return ordered
      .filter((item) => embeddableIds.has(item.id.videoId))
      .slice(0, maxResults)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? "",
        channelName: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));
  } catch (err) {
    console.warn("YouTube API fetch failed:", err);
    return [];
  }
}

/**
 * Stable-reorder search results so videos uploaded by a fixture's OFFICIAL
 * channel (identified by an exact normalized channel-name match to the home or
 * away team, or the competition league) come first. Non-official results keep
 * their original relevance order behind them. A pure reorder — nothing is
 * dropped for being non-official, so there's always a graceful fallback.
 */
function preferOfficialChannels(
  items: NonNullable<YouTubeSearchResponse["items"]>,
  officialLabels: string[]
): NonNullable<YouTubeSearchResponse["items"]> {
  const targets = new Set<string>(officialLabels.map(normalizeName).filter(Boolean));
  if (targets.size === 0) return items;

  const isOfficial = (channelTitle?: string): boolean =>
    Boolean(channelTitle && targets.has(normalizeName(channelTitle)));

  // Array.prototype.sort is stable in modern engines, so official results keep
  // their relative order and non-official results do too.
  return [...items].sort((a, b) => {
    const aOff = isOfficial(a.snippet?.channelTitle) ? 1 : 0;
    const bOff = isOfficial(b.snippet?.channelTitle) ? 1 : 0;
    return bOff - aOff;
  });
}

/**
 * Return the subset of video IDs whose embed is allowed.
 *
 * Uses the Videos API (`status.embeddable`). Only NON-embeddable videos are
 * dropped — region-geo restrictions are intentionally NOT filtered here so we
 * never hide content that is available to visitors in other countries on this
 * global site. If the verification call itself fails we conservatively keep all
 * IDs (fail-open) rather than discard every highlight.
 */
async function filterEmbeddable(ids: string[]): Promise<Set<string>> {
  const kept = new Set<string>();
  if (ids.length === 0) return kept;

  try {
    const params = new URLSearchParams({
      part: "status",
      id: ids.join(","),
      key: YOUTUBE_API_KEY || "",
    });
    const res = await fetch(`${YOUTUBE_VIDEOS_URL}?${params}`);
    if (!res.ok) return new Set(ids); // fail-open

    const data = await res.json();
    for (const item of data.items || []) {
      if (item?.status?.embeddable === true) kept.add(item.id);
    }
  } catch (err) {
    console.warn("YouTube embeddability check failed:", err);
    return new Set(ids); // fail-open
  }

  return kept;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface YouTubeSearchResponse {
  items?: {
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      publishedAt: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }[];
}