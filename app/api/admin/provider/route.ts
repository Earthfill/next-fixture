// ---------------------------------------------------------------------------
// /api/admin/provider — read/change the active sports data provider
//   GET  → { provider, providers:[{id,label,keyConfigured}], quota }
//   POST → { token, provider: "rapid" | "highlightly" }
// Auth: ADMIN_SECRET via the shared isAdminAuthorized helper.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  PROVIDER_IDS,
  PROVIDER_META,
  getActiveProviderId,
  providerHasKey,
  setActiveProviderId,
} from "@/lib/football/providers";
import { clearApiCache, getQuota } from "@/lib/football/api";
import { resetCoveredLeagues } from "@/lib/football/service";
import { resetCircuitBreaker } from "@/lib/football/circuit-breaker";
import { clearAllCache as clearLineupCache } from "@/lib/lineup-service";
import { clearAllCaches } from "@/lib/cache";
import { tryRevalidatePublicSite } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const provider = await getActiveProviderId();
  return NextResponse.json({
    success: true,
    provider,
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDER_META[id].label,
      keyConfigured: providerHasKey(id),
    })),
    quota: getQuota(),
  });
}

export async function POST(request: NextRequest) {
  let body: { token?: string; provider?: string } = {};
  try {
    body = (await request.json()) as { token?: string; provider?: string };
  } catch {
    body = {};
  }

  if (!isAdminAuthorized(request, body.token)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const provider = body.provider;
  if (provider !== "rapid" && provider !== "highlightly") {
    return NextResponse.json(
      { success: false, error: "`provider` must be either 'rapid' or 'highlightly'." },
      { status: 400 }
    );
  }

  // Persist + warm the in-memory resolver so this instance honours the switch now.
  const { ok, provider: active } = await setActiveProviderId(provider);

  // Clearing caches means the next page load refetches from the new provider
  // instead of serving the other provider's 24h snapshot.
  const cacheResult = await (async () => {
    clearApiCache();
    resetCoveredLeagues();
    clearLineupCache();
    await resetCircuitBreaker();
    return clearAllCaches();
  })().catch(() => undefined);

  try {
    // Flush the ISR Full Route Cache (listings + preview pages) so previously
    // generated HTML from the OLD provider isn't served now that the data cache
    // was wiped and will re-fetch from the NEW provider.
    await tryRevalidatePublicSite();
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    success: true,
    provider: active,
    persisted: ok,
    cachesCleared: cacheResult ?? undefined,
    quota: getQuota(),
  });
}
