// ---------------------------------------------------------------------------
// AdSlot — Simple ad container (SportsMole-style)
// ---------------------------------------------------------------------------

import React from "react";

interface AdSlotProps {
  slotId?: string;
  format?: "leaderboard" | "rectangle" | "banner";
  className?: string;
}

const formatHeights: Record<string, number> = {
  leaderboard: 90,
  rectangle: 250,
  banner: 90,
};

const formatWidths: Record<string, number> = {
  leaderboard: 728,
  rectangle: 300,
  banner: 468,
};

export default function AdSlot({
  slotId = "ad-slot-1",
  format = "leaderboard",
  className = "",
}: AdSlotProps) {
  return (
    <div
      id={slotId}
      className={`mx-auto ${className}`}
      style={{
        maxWidth: formatWidths[format] || 728,
        minHeight: formatHeights[format] || 90,
      }}
    >
      <span className="sm-ad-label">Advertisement</span>
      <div
        className="w-full bg-[#f2f2f2] border border-[#ddd] flex items-center justify-center"
        style={{ minHeight: formatHeights[format] || 90 }}
      >
        <span className="text-[11px] text-[#999]">
          {formatWidths[format]} × {formatHeights[format]}
        </span>
      </div>
    </div>
  );
}