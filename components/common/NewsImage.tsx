"use client";

// ---------------------------------------------------------------------------
// NewsImage — resilient thumbnail for third-party news CDNs (The Guardian)
// ---------------------------------------------------------------------------
// Two safeguards against broken-image 500s from the Next.js image optimizer:
//   1. unoptimized — loads media.guim.co.uk DIRECTLY (bypasses /_next/image
//       entirely). The Guardian URL already requests a sized crop (e.g. /500.jpg),
//       so we lose ~nothing by skipping re-optimization.
//   2. onError — if the remote image fails (DNS blip, blocked host, etc.), render
//       a neutral placeholder instead of a broken-image icon/console 500..
// ---------------------------------------------------------------------------

import Image, { type ImageProps } from "next/image";
import { Newspaper } from "lucide-react";
import { useState } from "react";

type NewsImageProps = Omit<ImageProps, "onError" | "onLoad"> & {
  fallbackClassName?: string;
};

export default function NewsImage({ fallbackClassName, ...props }: NewsImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center bg-zinc-100 text-zinc-300 ${props.className ?? ""} ${fallbackClassName ?? ""}`}
      >
        <Newspaper className="w-1/3 h-1/3" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <Image
      {...props}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}