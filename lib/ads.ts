// ---------------------------------------------------------------------------
// Ad placement config — single source of truth for Google AdSense ad units.
// Each logical slot key maps to its AdSense data-ad-slot ID and display format.
// Update here whenever a new ad unit is created in the AdSense dashboard.
// ---------------------------------------------------------------------------

export interface AdSlotConfig {
  format: "leaderboard" | "rectangle" | "banner";
  adSlot: string;
}

export const AD_SLOTS: Record<string, AdSlotConfig> = {
  "home-leaderboard-1": { format: "leaderboard", adSlot: "7354964539" },
  "news-leaderboard-1": { format: "leaderboard", adSlot: "6065933591" },
  "fixture-leaderboard-1": { format: "leaderboard", adSlot: "1916407770" },
  "preview-leaderboard-2": { format: "leaderboard", adSlot: "5120673116" },
  "preview-rect-1": { format: "rectangle", adSlot: "6186342775" },
};