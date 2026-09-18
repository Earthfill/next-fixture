// ---------------------------------------------------------------------------
// POST /api/admin/hidden — hide/unhide a fixture from the public site.
// Body: { "token": "<ADMIN_SECRET>", "slug": "<fixture slug>", "hidden": bool }
// Auth: ADMIN_SECRET via the shared isAdminAuthorized helper.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { hideFixture, unhideFixture } from "@/lib/hidden-fixtures";
import { normalizeSlug } from "@/lib/football/config";
import { invalidateCache } from "@/lib/cache";
import { upcomingFixturesKey, UPCOMING_DAYS } from "@/lib/cache/keys";
import { revalidatePreviewMutation } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!isAdminAuthorized(request, typeof body.token === "string" ? body.token : undefined)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug = normalizeSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ success: false, error: "Missing slug." }, { status: 400 });
  }

  const shouldHide = body.hidden === true || body.hidden === "true";
  const shouldShow = body.hidden === false || body.hidden === "false";
  if (!shouldHide && !shouldShow) {
    return NextResponse.json(
      { success: false, error: "Missing boolean `hidden` — true to hide, false to restore." },
      { status: 400 }
    );
  }

  const { hidden, persisted } = shouldHide
    ? await hideFixture(slug)
    : await unhideFixture(slug);

  // The write did not land in Postgres. This is NOT a silent success — the
  // match is still public, so tell the admin the truth instead of showing a
  // "Hidden" badge that vanishes on refresh.
  if (!persisted) {
    return NextResponse.json(
      {
        success: false,
        error: "The change could not be saved to the database. The match is still visible on the public site — please try again.",
        persisted: false,
        hiddenSlugs: Array.from(hidden),
      },
      { status: 502 }
    );
  }

  if (persisted && hidden.has(slug) !== shouldHide) {
    return NextResponse.json(
      {
        success: false,
        error: "The change was written but isn't visible everywhere yet — it will propagate within seconds. Refresh the admin panel.",
        persisted: true,
        hiddenSlugs: Array.from(hidden),
      },
      { status: 503 }
    );
  }

  // The listing pages (/ , /fixtures , /fixtures/[date]) are ISR-cached for 5
  // minutes, so a hide must invalidate them explicitly or the match keeps
  // rendering from the already-generated HTML for up to 5 minutes. Also drop the
  // cached upcoming-fixtures snapshot the homepage filters against, so it
  // refetches a fresh list whose slugs match the one just stored. Same sequence
  // as /api/admin/override, whose edits are known to appear immediately.
  await invalidateCache(upcomingFixturesKey(UPCOMING_DAYS)).catch(() => undefined);
  await revalidatePreviewMutation(slug).catch(() => undefined);

  return NextResponse.json({ success: true, hidden: shouldHide, hiddenSlugs: Array.from(hidden), persisted });
}