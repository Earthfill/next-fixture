// ---------------------------------------------------------------------------
// Shared admin revalidation helpers — make admin edits/hides instantly visible
// on the public site regardless of which Next instance/replica served the
// previously cached HTML.
// ---------------------------------------------------------------------------
// Two cache layers matter here:
//
//  1. Next's Full Route Cache (ISR). Preview pages are ISR-cached (revalidate
//     = 86400) and listing pages have revalidate = 300. On-demand invalidation
//     uses revalidatePath, which only purges the entry on the INSTANCE that
//     receives the call. On serverless/multi-instance setups the admin request
//     can land on a different replica than the one that cached the page, so a
//     local revalidatePath alone is not guaranteed to refresh public HTML.
//
//  2. The cache-aside data layer (lib/cache), keys like `preview:<slug>` and
//     `fixtures:upcoming:3:<today>` live in Redis/PG/memory. Those must be
//     dropped too so the re-rendered page refetches from upstream rather than
//     serving stale data.
//
// revalidatePath must receive the EXACT path the route is served on. The old
// admin code passed `/previews/${slug}` — in App Router `app/previews/[slug]`
// is a single dynamic segment, so the real URL is `/previews/<slug>`.
// ---------------------------------------------------------------------------

import { revalidatePath, revalidateTag } from "next/cache";
import { normalizeSlug } from "@/lib/football/config";

/** Revalidate a single public page path on the local instance. */
function tryRevalidatePath(path: string, type?: "page" | "layout"): void {
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  } catch {
    // non-fatal — on-demand revalidation is best-effort
  }
}

function previewPath(slug: string): string {
  return `/previews/${normalizeSlug(slug)}`;
}

/**
 * Revalidate the public homepage/listing from this instance when a background
 * job (midnight fixtures prefetch, admin "Clear Cache") refreshes the data
 * layer. ISR listing pages (revalidate=300) would otherwise keep serving stale
 * HTML for up to 5 minutes on this instance, while the data cache is already
 * fresh. This is the tag/path + cross-instance fallback for jobs that don't
 * target a specific fixture.
 */
export async function tryRevalidatePublicSite(): Promise<void> {
  // Local invalidation: root layout + listing routes.
  // NOTE: dynamic routes MUST pass the type ("page") — without it revalidatePath
  // is a silent no-op (Next warns "type parameter is missing"). For non-dynamic
  // routes passing "page" is the safe, explicit form.
  tryRevalidatePath("/", "layout");
  tryRevalidatePath("/", "page");
  tryRevalidatePath("/fixtures", "page");
  tryRevalidatePath("/fixtures/[date]", "page");
  tryRevalidatePath("/previews/[slug]", "page");
  try {
    revalidateTag("news", { expire: 0 });
    revalidateTag("lineups", { expire: 0 });
    revalidateTag("previews", { expire: 0 });
    revalidateTag("fixtures", { expire: 0 });
  } catch {
    // older/newer Next-version signature differences — non-fatal
  }

  // Cross-instance cover: warm the public homepage through the canonical URL so
  // the replica that actually serves the site re-renders the list now (the
  // instance running the job may be a different one).
  const publicBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicBase && /^https?:\/\//i.test(publicBase)) {
    const base = publicBase.replace(/\/+$/, "");
    for (const path of ["/", "/fixtures"]) {
      void fetch(`${base}${path}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: { "x-next-revalidate": "1" },
      })
        .then(() => undefined)
        .catch(() => undefined);
    }
  }
}
export async function revalidatePreviewMutation(slug: string): Promise<void> {
  const slugPath = previewPath(slug);

  // 1. Local Full Route Cache invalidation (exact dynamic-segment path).
  //    "page" type is REQUIRED for revalidatePath to take effect (dynamic
  //    routes without it are silent no-ops).
  tryRevalidatePath("/", "layout");
  tryRevalidatePath(slugPath, "page");
  tryRevalidatePath("/", "page");
  tryRevalidatePath("/fixtures", "page");
  tryRevalidatePath("/fixtures/[date]", "page");

  // 2. Tag-based invalidation for any next-managed caches bound to this tag.
  try {
    revalidateTag("previews", { expire: 0 });
    revalidateTag("fixtures", { expire: 0 });
  } catch {
    // older/newer Next-version signature differences — non-fatal
  }

  // 3. Cross-instance cover: hit the public URL so the replica that serves the
  // site re-renders this page now. Without this, a multi-instance deployment
  // can keep serving stale HTML from a different worker than the one that
  // handled the admin mutation above.
  const publicBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicBase && /^https?:\/\//i.test(publicBase)) {
    const url = `${publicBase.replace(/\/+$/, "")}${slugPath}`;
    void fetch(url, {
      method: "GET",
      // Make sure this request is not itself cached by Next's fetch dedupe /
      // data cache, and keep it off the critical path.
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { "x-next-revalidate": "1" },
    })
      .then(() => undefined)
      .catch(() => undefined);
  }
}
