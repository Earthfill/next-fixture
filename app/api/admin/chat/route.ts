// ---------------------------------------------------------------------------
// Admin chat moderation — /api/admin/chat
//   GET  → recent messages across all previews (any status)
//   POST → { id, action: "approve" | "delete" } moderation
// Protected with the same ADMIN_SECRET as the rest of /api/admin/*.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { pgAdminChatList } from "@/lib/cache/postgres";
import { moderateMessage } from "@/lib/preview-chat";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, parseInt(limitParam ?? "200", 10) || 200));
  const rows = await pgAdminChatList(limit).catch(() => []);
  return NextResponse.json({
    messages: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      userId: r.userId,
      body: r.body,
      parentId: r.parentId,
      moderationStatus: r.moderationStatus,
      removedBy: r.removedBy,
      createdAt: r.createdAt,
      displayName: r.displayName,
      email: r.email,
    })),
  });
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
  const action = body.action;
  if (!id) {
    return NextResponse.json({ error: "Missing message id." }, { status: 400 });
  }
  if (action !== "approve" && action !== "delete") {
    return NextResponse.json({ error: "Action must be 'approve' or 'delete'." }, { status: 400 });
  }

  const ok = await moderateMessage(id, action).catch(() => false);
  if (!ok) {
    return NextResponse.json({ error: "Could not moderate message." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}