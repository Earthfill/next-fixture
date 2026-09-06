// ---------------------------------------------------------------------------
// Standalone cron worker — run with:  npm run cron
// ---------------------------------------------------------------------------
// Next.js loads .env.local automatically, but a standalone Node process does
// not — so we load it here first (in production, variables are supplied by the
// host environment instead). The scheduler then keeps this process alive via
// node-cron's timers.
// ---------------------------------------------------------------------------

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore — the file may be absent; env vars then come from the host.
  }
}

// Load env BEFORE importing the scheduler (which transitively imports
// lib/football/api.ts — that module captures process.env.RAPIDAPI_KEY at
// module scope).
loadEnvFile(".env.local");

console.log(`[cron] worker starting — ${new Date().toISOString()} — node ${process.version}`);

async function main(): Promise<void> {
  const { startScheduler } = await import("../lib/jobs/scheduler");
  startScheduler();
}

main().catch((err) => {
  console.error("[cron] failed to start scheduler:", err);
  process.exitCode = 1;
});

export {};