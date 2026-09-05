// ---------------------------------------------------------------------------
// GET /api/health - liveness/readiness probe
// ---------------------------------------------------------------------------
// `ok` is always true while the function runs (liveness). Service flags
// reflect the current cached availability state (best-effort).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { redisAvailable } from "@/lib/cache/redis";
import { initPostgres, pgAvailable } from "@/lib/cache/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Cheap availability check (no DDL runs at runtime anymore).
  await initPostgres();

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    services: {
      redis: redisAvailable(),
      postgres: pgAvailable(),
    },
  });
}
