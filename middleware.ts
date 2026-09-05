// ---------------------------------------------------------------------------
// Middleware — admin gate + CORS for the public API (/api/v1/*)
// ---------------------------------------------------------------------------
// 1. /admin is only reachable via the /earthfill handshake (a short-lived
//    nf_admin_key cookie set by that route). Everything else bounces to /.
// 2. Adds permissive CORS headers so the frontend (or any web client) can call
//    /api/v1/* directly. Restrict origins via CORS_ORIGINS in .env.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS as string)
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
  const { pathname } = request.nextUrl;

  // 1. Admin gate — /admin is only reachable via the /earthfill handshake.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (request.cookies.get("nf_admin_key")?.value !== "1") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 2. CORS for the public API — everything else passes straight through.
  if (!pathname.startsWith("/api")) {
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
  matcher: ["/admin", "/admin/:path*", "/api/:path*"],
};
