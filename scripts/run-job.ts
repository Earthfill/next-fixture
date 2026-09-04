// ---------------------------------------------------------------------------
// One-off job runner — run a single background job manually:
//   npm run job -- fixtures   → prefetch next 7 days of fixtures
//   npm run job -- live       → poll live matches (gated by active matches)
// ---------------------------------------------------------------------------

import { fetchNext7DaysFixtures } from "../lib/jobs/midnight-fixtures";
import { pollLiveMatches } from "../lib/jobs/live-poll";

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore — may be absent in production (env vars come from the host).
  }
}

loadEnvFile(".env.local");

const job = process.argv[2];

async function main(): Promise<void> {
  switch (job) {
    case "fixtures": {
      const result = await fetchNext7DaysFixtures();
      console.log("[job:fixtures]", result);
      break;
    }
    case "live": {
      const result = await pollLiveMatches();
      console.log("[job:live]", result);
      break;
    }
    default: {
      console.error("Usage: npm run job -- fixtures|live");
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((err) => {
  console.error("[job] failed:", err);
  process.exit(1);
});