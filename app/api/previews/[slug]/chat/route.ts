// ---------------------------------------------------------------------------
// Preview chat API — /api/previews/[slug]/chat
//   GET  → public thread (approved messages only, no login required)
//   POST → post a message or reply (login required, per-IP rate limited)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { normalizeSlug } from "@/lib/football/config";
import { getMatchPreviewBySlug } from "@/lib/cache/pages";
import {
  listPublicMessages,
  createMessage,
  MAX_BODY_LENGTH,
} from "@/lib/preview-chat";

export const runtime = "nodejs";

// Compact per-instance rate limiter for POSTs (keeps load off Redis for a
// rarely-hit chat; a Redis-backed limiter can replace it if chat gets hot).
const postRateMap = new Map<string, { count: number; resetAt: number }>();
const POST_MAX = 10;
const POST_WINDOW = 60_000;

function canPost(ip: string): boolean {
  const now = Date.now();
  const entry = postRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    postRateMap.set(ip, { count: 1, resetAt: now + POST_WINDOW });
    return true;
  }
  if (entry.count >= POST_MAX) return false;
  entry.count += 1;
  return true;
}

/** Cheap sanity check that this looks like a real preview slug (id--home-vs-away). */
function isPreviewSlug(slug: string): boolean {
  return slug.includes("--") && slug.includes("-vs-");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  if (!isPreviewSlug(slug)) return NextResponse.json({ messages: [] });

  // Anonymous visitors still get counts; a signed-in viewer also learns their
  // own reaction (the UI highlights it).
  const viewer = await getSessionUser().catch(() => null);
  const messages = await listPublicMessages(slug, viewer?.id ?? null).catch(() => []);
  return NextResponse.json({ messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);

  // 404 for slugs that could never be a preview — prevents arbitrary rows.
  if (!isPreviewSlug(slug)) {
    return NextResponse.json({ error: "Unknown preview." }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (!canPost(ip)) {
    return NextResponse.json(
      { error: "Slow down — you're posting messages too quickly." },
      { status: 429 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in to chat." }, { status: 401 });
  }
  if (!user.verified) {
    return NextResponse.json(
      { error: "Please verify your email before joining the discussion." },
      { status: 403 }
    );
  }

  let body: { body?: string; parentId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Strip control characters but keep newlines (chat is one message, though).
  const text = (body.body ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_BODY_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  let parentId: string | null = null;
  if (body.parentId) {
    if (typeof body.parentId !== "string" || !body.parentId.trim()) {
      return NextResponse.json({ error: "Invalid reply target." }, { status: 400 });
    }
    parentId = body.parentId.trim();
  }

  // Capture the fixture kickoff so the daily cleanup can drop this thread the
  // moment its match expires (same midnight cron that clears the cache). The
  // preview read is cached; if it ever fails we store null and the created_at
  // age fallback still covers cleanup.
  const preview = await getMatchPreviewBySlug(slug).catch(() => null);

  const message = await createMessage({
    slug,
    userId: user.id,
    body: text,
    parentId,
    displayName: user.displayName,
    email: user.email,
    matchDate: preview?.fixture?.date ?? null,
  }).catch(() => null);

  if (!message) {
    return NextResponse.json({ error: "Could not post your message. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ message }, { status: 201 });
}