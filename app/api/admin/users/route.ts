// ---------------------------------------------------------------------------
// Admin registered users — /api/admin/users
//   GET  → registered accounts (newest first) with chat + login activity,
//          including accounts that registered but never verified their email.
//   POST → { id, action: "verify" } — force an account's email to verified.
// Protected with the same ADMIN_SECRET as the rest of /api/admin/*.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { listUsers, verifyUserByAdmin } from "@/lib/auth";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, parseInt(limitParam ?? "200", 10) || 200));

  const users = await listUsers(limit);
  if (users === null) {
    // Store unreachable — say so explicitly, otherwise an empty list would read
    // as "no accounts" on the dashboard.
    return NextResponse.json({ users: [], available: false });
  }

  return NextResponse.json({ users, available: true });
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  let body: { id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }
  if (body.action !== "verify") {
    return NextResponse.json({ error: "Action must be 'verify'." }, { status: 400 });
  }

  const ok = await verifyUserByAdmin(id).catch(() => false);
  if (!ok) {
    // Either the account is already verified or it no longer exists.
    return NextResponse.json(
      { error: "Account not found or already verified." },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
}
