// ---------------------------------------------------------------------------
// Middleware — CORS for the public API (/api/v1/*)
// ---------------------------------------------------------------------------
// Adds permissive CORS headers so the React/Next frontend (or any web client)
// can call /api/v1/fixtures, /api/v1/standings and /api/v1/live directly.
// Restrict origins via CORS_ORIGINS="https://a.com,https://b.com" in .env.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-apisports-key",
  "Access-Control-Max-Age": "86400",
};

export function middleware(request: NextRequest) {
  // Only involved for API routes — everything else passes straight through.
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const allowOrigin = isOriginAllowed(origin) && origin ? origin : ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS[0] || "*";

  const headers = { ...CORS_HEADERS, "Access-Control-Allow-Origin": allowOrigin };

  // Handle CORS preflight in one shot.
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
