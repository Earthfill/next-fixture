// ---------------------------------------------------------------------------
// Dynamic OG Image — used when links are shared on WhatsApp, Twitter, etc.
// ---------------------------------------------------------------------------
import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#002b5c",
          color: "white",
          padding: 60,
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <svg width="120" height="96" viewBox="0 0 64 51" fill="none">
            <rect width="64" height="51" fill="#002B5C" />
            <path
              d="M29.1165 16.5455V34H25.929L18.3352 23.0142H18.2074V34H14.517V16.5455H17.7557L25.2898 27.5227H25.4432V16.5455H29.1165Z"
              fill="white"
            />
            <path
              d="M37.7202 34V16.5455H49.277V19.5881H41.4105V23.7472H48.5099V26.7898H41.4105V34H37.7202Z"
              fill="#FFD230"
            />
          </svg>
          <span
            style={{
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "white",
            }}
          >
            Next Fixture
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#ffd230",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 8,
          }}
        >
          Football Predictions &amp; Betting Tips
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 18,
            color: "#ffffffcc",
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.5,
          }}
        >
          Premier League · La Liga · Serie A · Bundesliga
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}