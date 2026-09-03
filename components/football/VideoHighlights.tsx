// ---------------------------------------------------------------------------
// VideoHighlights — Display YouTube match highlights as embed + thumbnail grid
// ---------------------------------------------------------------------------
"use client";

import Image from "next/image";
import { useState } from "react";
import type { HighlightVideo } from "@/lib/football/highlights";

interface VideoHighlightsProps {
  videos: HighlightVideo[];
}

export default function VideoHighlights({ videos }: VideoHighlightsProps) {
  if (!videos.length) return null;

  const [activeVideo, setActiveVideo] = useState<HighlightVideo>(videos[0]);
  const rest = videos.filter((v) => v.videoId !== activeVideo.videoId);

  return (
    <section>
      <h2 className="sm-section-heading mb-3">Match Highlights</h2>

      {/* Active video (larger embed) */}
      <div className="aspect-video w-full overflow-hidden rounded-sm bg-black mb-3">
        <iframe
          key={activeVideo.videoId}
          src={`https://www.youtube.com/embed/${activeVideo.videoId}`}
          title={activeVideo.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>

      {/* Thumbnail grid for other videos */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {rest.map((video) => (
            <button
              key={video.videoId}
              onClick={() => setActiveVideo(video)}
              className="group block w-full text-left overflow-hidden rounded-sm bg-zinc-100 cursor-pointer"
            >
              <div className="aspect-video relative overflow-hidden">
                <Image
                  src={video.thumbnail}
                  alt={video.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
              <p className="truncate px-1.5 py-1 text-[11px] font-medium text-zinc-700 group-hover:text-blue-700 transition-colors">
                {video.title}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}