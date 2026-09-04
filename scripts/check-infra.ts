// ---------------------------------------------------------------------------
// Infra diagnostic - pin down WHERE connectivity is breaking:
//   1. DNS resolution (dns.lookup, both address families)
//   2. TCP reachability (net.connect, 5s timeout)
//   3. Real handshake (Redis PING / Postgres SELECT 1) when reachable.
// Run:  npm run check:infra
// ---------------------------------------------------------------------------

import dns from "node:dns/promises";
import net from "node:net";

function loadEnvFile(path: string): void {
  try {
    const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
    if (loader) loader(path);
  } catch {
    // Ignore - may be absent in production (env vars come from the host).
  }
}

loadEnvFile(".env.local");

interface Target {
  name: string;
  url: string;
  host: string;
  port: number;
  tls?: boolean;
}

function parseHostPort(url: string, fallbackPort: number): { host: string; port: number } | null {
  const match = url.match(/@([^:/]+):(\d+)/);
  if (!match) return null;
  return { host: match[1], port: parseInt(match[2], 10) || fallbackPort };
}

const API_HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const REDIS_URL = process.env.REDIS_URL || "";
const PG_URL = process.env.DATABASE_URL || "";

const targets: Target[] = [
  { name: "API-Football", url: `https://${API_HOST}`, host: API_HOST, port: 443 },
];

const redis = parseHostPort(REDIS_URL, 6379);
if (redis) targets.push({ name: "Upstash Redis", url: REDIS_URL, host: redis.host, port: redis.port, tls: REDIS_URL.startsWith("rediss://") });

const pg = parseHostPort(PG_URL, 5432);
if (pg) targets.push({ name: "Supabase Postgres", url: PG_URL, host: pg.host, port: pg.port, tls: true });

function tcpProbe(host: string, port: number, timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (msg: string): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(msg);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done("TCP connect OK"));
    socket.once("timeout", () => done("TCP connect TIMEOUT"));
    socket.once("error", (err: NodeJS.ErrnoException) => done(`TCP connect FAIL: ${err.code || err.message}`));
    socket.connect(port, host);
  });
}

async function main(): Promise<void> {
  console.log("[check:infra] targets:");
  if (!targets.length) {
    console.log("  (none) - set REDIS_URL / DATABASE_URL to include infra checks");
  }
  for (const t of targets) {
    console.log(`\n== ${t.name} ==`);
    console.log(`  url:   ${t.url}`);
    console.log(`  host:   ${t.host}:${t.port}`);

    // 1. DNS
    try {
      const addrs = await dns.lookup(t.host, { all: true, verbatim: true });
      console.log(`  DNS:    OK -> ${addrs.map((a) => `${a.address} (${a.family === 4 ? "ipv4" : "ipv6"})`).join(", ") || "(no records)"}`);
    } catch (err) {
      console.log(`  DNS:    FAIL -> ${(err as NodeJS.ErrnoException).code || (err as Error).message}`);
      console.log("  (skip TCP/handshake - DNS must resolve first)");
      continue;
    }

    // 2. TCP
    const tcp = await tcpProbe(t.host, t.port);
    console.log(`  TCP:    ${tcp}`);
    if (!tcp.includes("OK")) continue;

    // 3. Real handshake (only when TCP is reachable)
    if (t.name === "Upstash Redis") {
      try {
        const { default: Redis } = await import("ioredis");
        const client = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 8000, maxRetriesPerRequest: 1 });
        const pong = await client.ping();
        console.log(`  Redis:  PING -> ${pong}`);
        client.disconnect();
      } catch (err) {
        console.log(`  Redis:  PING FAIL -> ${(err as Error).message}`);
      }
    }
    if (t.name === "Supabase Postgres") {
      try {
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } });
        const res = await pool.query("SELECT 1 AS ok");
        console.log(`  PG:     SELECT 1 -> ${JSON.stringify(res.rows[0])}`);
        await pool.end();
      } catch (err) {
        console.log(`  PG:     SELECT 1 FAIL -> ${(err as Error).message}`);
      }
    }
    if (t.name === "API-Football") {
      try {
        const res = await fetch(`https://${API_HOST}/status`, { headers: { "x-apisports-key": process.env.RAPIDAPI_KEY || "" } as HeadersInit, signal: AbortSignal.timeout(8000) });
        console.log(`  HTTP:   GET /status -> ${res.status}`);
      } catch (err) {
        console.log(`  HTTP:   GET /status FAIL -> ${(err as Error).message}`);
      }
    }
  }
  console.log("\n[check:infra] done.");
}

main().catch((err) => {
  console.error("[check:infra] fatal:", err);
  process.exit(1);
});