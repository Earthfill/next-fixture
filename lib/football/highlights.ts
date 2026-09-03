// ---------------------------------------------------------------------------
// YouTube Highlights Service — Search for match highlights via YouTube Data API v3
// ---------------------------------------------------------------------------

export interface HighlightVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelName: string;
  publishedAt: string;
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

/**
 * Search YouTube for match highlights for a given fixture.
 * Returns up to `maxResults` videos (default 3).
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
    videoDuration: "medium",
    maxResults: String(maxResults),
    order: "relevance",
    key: YOUTUBE_API_KEY,
    publishedAfter: date
  });

  console.log(date, "Date for Youtube")

  try {
    const res = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`, {
      next: { revalidate: 86400 }, // cache for 24 hours
    });

    if (!res.ok) {
      console.warn("YouTube API error:", res.status);
      return [];
    }

    const data: YouTubeSearchResponse = await res.json();
    
    if (!data.items?.length) return [];

    return data.items.map((item) => ({
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