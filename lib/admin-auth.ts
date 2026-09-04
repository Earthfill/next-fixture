// ---------------------------------------------------------------------------
// Admin authorization helper - shared by /api/admin/* route handlers.
// ---------------------------------------------------------------------------
// Accepts the ADMIN_SECRET via Bearer header, ?token= query param, or a JSON
// body field named "token". If ADMIN_SECRET is unset, auth is skipped (dev).

import { NextRequest } from "next/server";

export function isAdminAuthorized(request: NextRequest, bodyToken?: string): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return true;

  const header = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("token");

  const provided =
    (header?.startsWith("Bearer ") ? header.slice(7).trim() : null) ||
    query?.trim() ||
    bodyToken?.trim() ||
    null;

  return provided === adminSecret;
}