// ---------------------------------------------------------------------------
// POST /api/admin/hidden — hide/unhide a fixture from the public site.
// Body: { "token": "<ADMIN_SECRET>", "slug": "<fixture slug>", "hidden": bool }
// Auth: ADMIN_SECRET via the shared isAdminAuthorized helper.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { hideFixture, unhideFixture } from "@/lib/hidden-fixtures";

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

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
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

  // Public pages re-render per request, but revalidate anyway for any host that
  // keeps a full-route cache (self-host, proxies).
  try {
    revalidatePath("/", "layout");
    revalidatePath("/fixtures");
    revalidatePath(`/previews/${slug}`);
  } catch {
    // non-fatal
  }

  return NextResponse.json({ success: true, hidden: shouldHide, hiddenSlugs: Array.from(hidden), persisted });
}