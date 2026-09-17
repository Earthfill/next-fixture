// ---------------------------------------------------------------------------
// Preview chat reactions — POST /api/previews/[slug]/chat/[id]/reaction
// Body: { reaction: "like" | "dislike" | null }  (null clears the viewer's vote)
// Same gates as posting: logged in + verified, message must exist and not be
// removed. Returns the message's updated tallies + the viewer's own reaction.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { normalizeSlug } from "@/lib/football/config";
import { findMessage, setMessageReaction } from "@/lib/preview-chat";
import type { ChatReaction } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug: rawSlug, id } = await params;
  const slug = normalizeSlug(rawSlug);

  let body: { reaction?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const reaction = body?.reaction ?? null;
  if (reaction !== null && reaction !== "like" && reaction !== "dislike") {
    return NextResponse.json(
      { error: "Reaction must be 'like', 'dislike' or null." },
      { status: 400 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in to react." }, { status: 401 });
  }
  if (!user.verified) {
    return NextResponse.json(
      { error: "Please verify your email before joining the discussion." },
      { status: 403 }
    );
  }

  const message = await findMessage(slug, id, user.id).catch(() => null);
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  if (message.moderationStatus === "removed") {
    return NextResponse.json(
      { error: "This message was removed and can no longer be reacted to." },
      { status: 409 }
    );
  }

  const counts = await setMessageReaction(id, user.id, reaction as ChatReaction | null).catch(() => null);
  if (!counts) {
    return NextResponse.json(
      { error: "Could not update the reaction. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json(counts);
}
