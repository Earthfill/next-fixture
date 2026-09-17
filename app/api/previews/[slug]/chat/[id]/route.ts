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

  // Industry-standard self-removal window: 5 minutes from posting. Admins are
  // exempt — they moderate through the admin panel at any age.
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  if (!isAdmin) {
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    if (Number.isNaN(ageMs) || ageMs > FIVE_MINUTES_MS) {
      return NextResponse.json(
        { error: "Messages can only be removed within 5 minutes of posting." },
        { status: 403 }
      );
    }
  }

  await removeMessage(id, isAdmin ? "admin" : user?.id ?? "unknown").catch(() => undefined);
  return NextResponse.json({ success: true });
}