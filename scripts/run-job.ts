// ---------------------------------------------------------------------------
// One-off job runner — run a single background job manually:
//   npm run job -- fixtures   → prefetch next 7 days of fixtures
// ---------------------------------------------------------------------------

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore — may be absent in production (env vars come from the host).
  }
}

loadEnvFile(".env.local");

// Load env BEFORE importing the job modules: they read process.env.* at module
// scope (e.g. RAPIDAPI_KEY in lib/football/api.ts), so importing them first
// would capture undefined values and silently no-op every API call.
const job = process.argv[2];

async function main(): Promise<void> {
  const { fetchNext7DaysFixtures } = await import("../lib/jobs/midnight-fixtures");

  switch (job) {
    case "fixtures": {
      const result = await fetchNext7DaysFixtures();
      console.log("[job:fixtures]", result);
      break;
    }
    default: {
      console.error("Usage: npm run job -- fixtures");
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((err) => {
  console.error("[job] failed:", err);
  process.exit(1);
});

export {};