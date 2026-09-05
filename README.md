# NextFixture

A football predictions & previews site (Next.js 16 + API-Football) with a dedicated
backend service layer that fetches, caches, schedules,and serves API-Football data using
a **Cache-Aside pattern** (Redis hot tier → PostgreSQL durable → in-memory fallback →
API-Football upstream). The Next.js app itself exposes the REST API — no separate service
is needed.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## Backend Service Layer — API-Football

### REST API endpoints

| Endpoint | Description | Query params |
|-----------|-------------|--------------|
| `GET /api/v1/fixtures` | Fixture schedules (read-through 24h cache) | `date=YYYY-MM-DD`, `league=<slug>`, `page`, `limit` (≤50) |
| `GET /api/v1/standings` | League standings (+ upcoming fixtures),12h cache) | `league=<slug>` (required) |
| `GET /api/v1/live` | Live matches (30s cache) | `page`, `limit` (≤100) |

Every response includes `meta.source` (`redis` | `postgres` | `memory` | `api`) and
`meta.quota` — the last observed API-Football rate-limit headers (`limit` / `used` / `remaining`).

**Example:**

```bash
curl "http://localhost:3000/api/v1/fixtures?date=2026-09-04&league=premier-league&page=1&limit=10"
curl "http://localhost:3000/api/v1/standings?league=serie-a"
curl "http://localhost:3000/api/v1/live"
```

### Scheduled background jobs (cron))

| Command | What it does |
|---------|--------------|
| `npm run cron` | Start the long-running scheduler (midnight fixtures + 30s live poll; set `DISABLE_CRON=true` to turn off) |
| `npm run job:fixtures` | Run the 7-day fixture prefetch once (what midnight runs daily) |
| `npm run job:live` | Run the live-poll once (gated by active matches) |

- **Midnight job** (`0 0 * * *`): fetches the next 7 days of fixtures across all covered
  leagues into the cache layer ais well ais the PostgreSQL `matches` table.
- **Live-poll job** (`*/30 * * * * *`): polls live scores every 30 seconds **only when**
  active live matches exist in the database — preservingthe API-Football quota
  (if no match is live or kicking off within 30 minutes,the upstream call is skipped).

### Environment variables

See `.env.example` for the full list. Key additions:

```bash
# Redis — hot cache tier (leave empty to fall back to PostgreSQL / in-memory)
REDIS_URL=redis://localhost:6379

# PostgreSQL — durable cache tier + matches table (auto-creates tables on first use)
DATABASE_URL=postgresql://user:pass@localhost:5432/nextfixture

# Rate limiting (sliding window per IP) / CORS
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW=60
CORS_ORIGINS=*          # comma-separated, or * for all

# Cron
# DISABLE_CRON=true
# CRON_TZ=UTC

# Site content timezone (used to compute "today" for fixtures/homepage)
# SITE_TIMEZONE=Europe/London

# Optional API-Football host override
# API_FOOTBALL_HOST=v3.football.api-sports.io
```

### Cache TTLs (dynamic)

| Data | TTL |
|------|-----|
| Fixture schedules / leagues | 24 hours |
| Standings | 12 hours |
| Active live matches | 30 seconds |

### Notes

- Rate limiting is a **sliding-window in-memory limiter** per IP + scope (Next.js
  Route Handlers don't run Express middleware, so `express-rate-limit` isn't applicable;.
  Defaults: 120 req/min/IP; override with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`.
- CORS is enabled for all `/api/*` routes via `middleware.ts` (Next.js v16 suggests renaming
  to `proxy.ts` for new projects)....
- All cache layers degrade gracefully — if Redis or PostgreSQL are unreachable, the app
  continues with the remaining tiers and never crashes..

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) — your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.



Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.