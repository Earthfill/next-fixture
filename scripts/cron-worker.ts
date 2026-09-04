// ---------------------------------------------------------------------------
// Standalone cron worker — run with:  npm run cron
// ---------------------------------------------------------------------------
// Next.js loads .env.local automatically, but a standalone Node process does
// not — so we load it here first (in production, variables are supplied by the
// host environment instead). The scheduler then keeps this process alive via
// node-cron's timers.
// ---------------------------------------------------------------------------

import { startScheduler } from "../lib/jobs/scheduler";

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore — the file may be absent; env vars then come from the host.
  }
}

// Local overrides for development. Harmless no-op when missing.
loadEnvFile(".env.local");

console.log(`[cron] worker starting — ${new Date().toISOString()} — node ${process.version}`);

try {
  startScheduler();
} catch (err) {
  console.error("[cron] failed to start scheduler:", err);
  process.exitCode = 1;
}