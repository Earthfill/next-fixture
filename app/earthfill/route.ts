// ---------------------------------------------------------------------------
// GET /earthfill - secret entry point to the admin dashboard.
// ---------------------------------------------------------------------------
// Sets a short-lived cookie, then redirects to /admin. middleware.ts only
// allows /admin when that cookie is present, so the admin panel is reachable
// exclusively through this handshake.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/admin", request.url), 307);
  res.cookies.set("nf_admin_key", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60,
    path: "/",
  });
  return res;
}
