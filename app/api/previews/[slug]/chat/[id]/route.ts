// ---------------------------------------------------------------------------
// Preview chat message management — DELETE /api/previews/[slug]/chat/[id]
// Author (own message) or admin (ADMIN_SECRET) may remove a message (soft).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { normalizeSlug } from "@/lib/football/config";
import { findMessage, removeMessage } from "@/lib/preview-chat";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug: rawSlug, id } = await params;
  const slug = normalizeSlug(rawSlug);

  const user = await getSessionUser();
  const isAdmin = isAdminAuthorized(request);
  if (!user && !isAdmin) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }
  // Authors must be verified to moderate their own messages; admins are exempt.
  if (!isAdmin && !user?.verified) {
    return NextResponse.json(
      { error: "Please verify your email before joining the discussion." },
      { status: 403 }
    );
  }

  const message = await findMessage(slug, id).catch(() => null);
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  // Author may remove their own; admins may remove anything.
  if (!isAdmin && message.user.id !== user?.id) {
    return NextResponse.json({ error: "You can only remove your own messages." }, { status: 403 });
  }

  await removeMessage(id, isAdmin ? "admin" : user?.id ?? "unknown").catch(() => undefined);
  return NextResponse.json({ success: true });
}