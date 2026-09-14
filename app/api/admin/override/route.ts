// ---------------------------------------------------------------------------
// GET / DELETE / POST /api/admin/override — manage per-fixture admin overrides
// (prediction scoreline, tip, win probability, match preview text).
// Auth: ADMIN_SECRET via the shared isAdminAuthorized helper.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  getAdminOverride,
  setAdminOverride,
  deleteAdminOverride,
  type AdminOverridePatch,
} from "@/lib/admin-overrides";
import { getPredictionReview, invalidatePredictionReview, writePredictionReview, getFixtureEffectivePrediction } from "@/lib/cache/pages";
import { normalizeSlug } from "@/lib/football/config";

/** Canonical (ASCII-safe) fixture slug — matches generateSlug & cache keys. */
function canonicalSlug(slug: string): string {
  return normalizeSlug(slug);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawSlug = request.nextUrl.searchParams.get("slug");
  if (!rawSlug) {
    return NextResponse.json({ success: false, error: "Missing slug." }, { status: 400 });
  }
  const slug = canonicalSlug(rawSlug);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  const override = await getAdminOverride(slug);
  // Prefill data for the FixtureEditor — the auto (pre-override) values and the
  // effective values actually displayed (override wins over auto).
  const pred = await getFixtureEffectivePrediction(slug).catch(() => null);
  return NextResponse.json({
    success: true,
    override,
    auto: pred?.auto ?? null,
    effective: pred?.effective ?? null,
    hasOverride: pred?.hasOverride ?? false,
  });
}

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
  const slug = canonicalSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ success: false, error: "Missing slug." }, { status: 400 });
  }

  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : "";
  if (!expiresAt) {
    return NextResponse.json(
      { success: false, error: "Missing expiresAt (fixture kickoff)." },
      { status: 400 }
    );
  }

  // Overrides expire at kickoff and the read path filters `expires_at > now()`,
  // so a save for an already-started match would be silently invisible to the
  // preview — the "saved but the preview didn't update" bug. Reject it loudly.
  const kickoffMs = new Date(expiresAt).getTime();
  if (Number.isNaN(kickoffMs) || kickoffMs <= Date.now() + 60_000) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This match has already kicked off, so a prediction override can't be shown. Overrides only apply before kickoff.",
      },
      { status: 400 }
    );
  }

  const patch: AdminOverridePatch = {};

  if ("predictedScore" in body) {
    const s = body.predictedScore as { home?: unknown; away?: unknown } | null | undefined;
    if (s == null) {
      patch.predictedScore = null;
    } else if (typeof s.home === "number" && typeof s.away === "number") {
      patch.predictedScore = {
        home: Math.max(0, Math.floor(s.home)),
        away: Math.max(0, Math.floor(s.away)),
      };
    }
  }

  if ("tip" in body) {
    const t = body.tip;
    patch.tip = t == null ? null : String(t).trim() || null;
  }

  if ("winProbability" in body) {
    const w = body.winProbability as { home?: unknown; draw?: unknown; away?: unknown } | null | undefined;
    if (w == null) {
      patch.winProbability = null;
    } else if (typeof w.home === "number" && typeof w.draw === "number" && typeof w.away === "number") {
      patch.winProbability = {
        home: Math.max(0, Math.floor(w.home)),
        draw: Math.max(0, Math.floor(w.draw)),
        away: Math.max(0, Math.floor(w.away)),
      };
    }
  }

  if ("previewText" in body) {
    const p = body.previewText;
    patch.previewText = p == null ? null : String(p).trim() || null;
  }

  // The page re-renders on the very next visit (no edge cache in Next 16 / this
  // stack), so we MUST NOT revalidate/acknowledge until the write is durably
  // committed. Make the DB write synchronous and confirm it reads back before
  // telling the admin "saved" — otherwise the preview can re-render before the
  // write is visible and show stale auto values.
  const { override, persisted } = await setAdminOverride(slug, patch, expiresAt, { sync: true });

  if (persisted) {
    let verified = false;
    // Compare every prediction field against the read-back so a changed score,
    // tip, win-probability or preview text is confirmed durable before the
    // admin is told "Saved".
    const expected =
      JSON.stringify([
        override.predictedScore ?? null,
        override.tip ?? null,
        override.winProbability ?? null,
        override.previewText ?? null,
      ]);
    for (let attempt = 0; attempt < 5 && !verified; attempt++) {
      const check = await getAdminOverride(slug).catch(() => null);
      const actual =
        check == null
          ? null
          : JSON.stringify([
              check.predictedScore ?? null,
              check.tip ?? null,
              check.winProbability ?? null,
              check.previewText ?? null,
            ]);
      verified = actual === expected;
      if (!verified && attempt < 4) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          error: "Saved to the database but the change isn't visible yet — refresh the page before re-rendering the preview.",
          persisted: true,
          override,
        },
        { status: 503 }
      );
    }
  }

  // The home page, /fixtures and league/team listings are ISR-cached; without
  // invalidating them an edited (previously hidden) match stays off the public
  // site until the 3h revalidate ticks over. Revalidate the listing pages too,
  // not just the preview page.
  try {
    revalidatePath("/", "layout");
    revalidatePath("/");
    revalidatePath("/fixtures");
    revalidatePath(`/previews/${slug}`);
  } catch {
    // non-fatal
  }

  // Recompute the prediction-quality review (tip ↔ scoreline ↔ win probability)
  // so the admin table's warning icon can update immediately after the edit.
  await invalidatePredictionReview(slug).catch(() => undefined);
  const review = await getPredictionReview(slug).catch(() => null);
  if (review) {
    await writePredictionReview(slug, review).catch(() => undefined);
  }

  return NextResponse.json({ success: true, override, persisted, review });
}

export async function DELETE(request: NextRequest) {
  const rawSlug = request.nextUrl.searchParams.get("slug");
  if (!rawSlug) {
    return NextResponse.json({ success: false, error: "Missing slug." }, { status: 400 });
  }
  const slug = canonicalSlug(rawSlug);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  await deleteAdminOverride(slug);

  // Revalidate public listing pages too so a reverted match updates on the
  // home page immediately (it is ISR-cached for 3 hours otherwise).
  try {
    revalidatePath("/", "layout");
    revalidatePath("/");
    revalidatePath("/fixtures");
    revalidatePath(`/previews/${slug}`);
  } catch {
    // non-fatal
  }

  // Recompute review after removing the override (auto values are back).
  await invalidatePredictionReview(slug).catch(() => undefined);
  const review = await getPredictionReview(slug).catch(() => null);
  if (review) {
    await writePredictionReview(slug, review).catch(() => undefined);
  }

  return NextResponse.json({ success: true, review });
}
