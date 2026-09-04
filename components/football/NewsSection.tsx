// ---------------------------------------------------------------------------
// NewsSection — Football news display component
// ---------------------------------------------------------------------------
import NewsImage from "@/components/common/NewsImage";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import type { NewsItem } from "@/lib/news";

interface NewsSectionProps {
  news: NewsItem[];
  layout?: "sidebar" | "fullwidth";
  title?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NewsSection({ news, layout = "fullwidth", title = "Latest Football News" }: NewsSectionProps) {
  if (news.length === 0) return null;

  const displayItems = layout === "sidebar" ? news.slice(0, 5) : news;
  const featured = layout === "fullwidth" ? news[0] : null;

  // ─── Sidebar layout ───────────────────────────────────────────────
  if (layout === "sidebar") {
    return (
      <div>
        <h2 className="sm-section-heading flex items-center gap-2">
          <Newspaper className="h-4 w-4" />
          {title}
        </h2>
        <div className="flex items-center gap-2 mb-2 text-[10px] text-zinc-400">
          <span>Powered by <strong>The Guardian</strong></span>
        </div>
        <div className="border border-zinc-200 bg-white">
          {displayItems.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 px-3 py-2.5 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors group">
              {item.imageUrl && (
                <NewsImage src={item.imageUrl} alt="" width={48} height={48} className="h-12 w-12 object-cover rounded shrink-0" fallbackClassName="h-12 w-12 rounded shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-800 leading-snug group-hover:text-[#002b5c] transition-colors line-clamp-2">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{item.source}</span>
                  <span className="text-[10px] text-zinc-300">•</span>
                  <span className="text-[10px] text-zinc-400">{formatDate(item.date)}</span>
                </div>
              </div>
            </a>
          ))}
          <a href="https://www.theguardian.com/football" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 py-2 text-[11px] font-medium text-zinc-500 hover:text-[#002b5c] hover:bg-zinc-50 transition-colors border-t border-zinc-100">
            More football news <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  // ─── Full-width layout ────────────────────────────────────────────
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#002b5c]"></span>
          {title}
          <span className="text-xs font-normal text-zinc-400">from The Guardian</span>
        </h2>
        <a href="https://www.theguardian.com/football" target="_blank" rel="noopener noreferrer"
          className="text-[11px] font-medium flex items-center gap-0.5" style={{ color: '#002b5c' }}>
          All news <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <hr className="sm-divider mt-1 mb-0" />

      {/* Featured article with hero image */}
      {featured && (
        <a href={featured.url} target="_blank" rel="noopener noreferrer" className="group block">
          <div className="relative overflow-hidden bg-zinc-900">
            {featured.imageUrl ? (
              <NewsImage
                src={featured.imageUrl}
                alt=""
                fill
                className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                sizes="(max-width: 768px) 100vw, 50vw"
                fallbackClassName="w-full h-48 sm:h-64 bg-linear-to-br from-[#002b5c] to-zinc-800"
              />
            ) : (
              <div className="w-full h-48 sm:h-64 bg-linear-to-br from-[#002b5c] to-zinc-800 flex items-center justify-center">
                <Newspaper className="h-12 w-12 text-white/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-white/80 bg-[#002b5c] px-2 py-0.5 mb-2">{featured.source}</span>
              <h3 className="text-base sm:text-lg font-bold text-white leading-snug group-hover:underline">{featured.title}</h3>
              {featured.summary && <p className="text-xs sm:text-sm text-zinc-300 mt-1 line-clamp-2">{featured.summary}</p>}
              <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-400">
                <Clock className="h-3 w-3" />
                <span>{formatDate(featured.date)}</span>
              </div>
            </div>
          </div>
        </a>
      )}

      {/* News list */}
      <div className="border border-zinc-200 bg-white grid md:grid-cols-2">
        {displayItems.map((item, i) => {
          if (layout === "fullwidth" && i === 0) return null;
          return (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 px-4 py-3 border-b even:border-l border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors group">
              {item.imageUrl && (
                <NewsImage
                  src={item.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 sm:h-16 sm:w-16 object-cover rounded shrink-0"
                  fallbackClassName="h-14 w-14 sm:h-16 sm:w-16 rounded shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 leading-snug group-hover:text-[#002b5c] transition-colors line-clamp-2">{item.title}</p>
                {item.summary && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{item.summary}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{item.source}</span>
                  <span className="text-[10px] text-zinc-300">•</span>
                  <span className="text-[10px] text-zinc-400">{formatDate(item.date)}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
