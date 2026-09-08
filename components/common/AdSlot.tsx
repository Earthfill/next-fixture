"use client";

// ---------------------------------------------------------------------------
// AdSlot — Renders a Google AdSense display ad unit inside a SportsMole-style
// container. Falls back to a static placeholder when no adSlot ID is given.
// The AdSense JS engine is loaded once globally in app/layout.tsx; this
// component only needs to push {} onto window.adsbygoogle after mount.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

interface AdSlotProps {
  slotId?: string;
  format?: "leaderboard" | "rectangle" | "banner";
  className?: string;
  /** Real Google AdSense data-ad-slot ID (10-digit number). */
  adSlot?: string;
  /** Optional height override (px). Defaults to the format height. */
  height?: number;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

const ADSENSE_CLIENT = "ca-pub-3188740496800409";

const formatHeights: Record<string, number> = {
  leaderboard: 90,
  rectangle: 50,
  banner: 90,
};

const formatWidths: Record<string, number> = {
  leaderboard: 728,
  rectangle: 728,
  banner: 468,
};

export default function AdSlot({
  slotId = "ad-slot-1",
  format = "leaderboard",
  className = "",
  adSlot,
  height,
}: AdSlotProps) {
  const slotHeight = height ?? formatHeights[format] ?? 90;
  useEffect(() => {
    if (!adSlot) return;

    // AdSense sizes the unit from the <ins> element's measured width, so the
    // ins must fill its container as a block element (width:100% below) and we
    // must not push until that element reports a non-zero layout width.
    //
    // The push MUST be idempotent: React 19 dev StrictMode double-invokes
    // useEffect (setup → cleanup → setup), and pushing a unit that is already
    // filled throws "All 'ins' elements ... already have ads in them". We mark
    // the ins as pushed before pushing, and skip it if it already has an ad.
    const tryPush = (attemptsLeft: number) => {
      const pushOnce = () => {
        const el = document.getElementById(slotId);
        const adEl = el?.querySelector("ins.adsbygoogle") as HTMLElement | null;
        if (!adEl || adEl.dataset.pushed === "true") return;
        if (adEl.querySelector("iframe") !== null) return; // already filled
        adEl.dataset.pushed = "true";
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      };

      if (attemptsLeft <= 0) {
        pushOnce();
        return;
      }
      requestAnimationFrame(() => {
        const el = document.getElementById(slotId);
        const adEl = el?.querySelector("ins.adsbygoogle") as HTMLElement | null;
        if (!el || !adEl || adEl.getBoundingClientRect().width === 0) {
          tryPush(attemptsLeft - 1);
        } else {
          pushOnce();
        }
      });
    };

    tryPush(8);
  }, [adSlot, slotId]);

  return (
    <div
      id={slotId}
      className={`mx-auto ${className}`}
      style={{
        // Explicit width per format so AdSense never sees a 0-width container
        // (maxWidth 100% prevents overflow on narrow viewports).
        width: formatWidths[format] || 728,
        maxWidth: "100%",
        minHeight: slotHeight,
      }}
    >
      <span className="sm-ad-label">Advertisement</span>
      {adSlot ? (
        // Plain block container (no flex) so the empty <ins> fills the full
        // width — flex-based centering collapses content-less ads to 0px.
        <div
          className="w-full bg-[#f2f2f2] border border-[#ddd]"
          style={{ minHeight: slotHeight }}
        >
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%" }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={adSlot}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      ) : (
        <div
          className="w-full bg-[#f2f2f2] border border-[#ddd] flex items-center justify-center"
          style={{ minHeight: slotHeight }}
        >
          <span className="text-[11px] text-[#999]">
            {formatWidths[format]} × {formatHeights[format]}
          </span>
        </div>
      )}
    </div>
  );
}