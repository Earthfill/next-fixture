-- Initial schema: cache-aside durable tier + matches table (live-poll gate).

CREATE TABLE IF NOT EXISTS "api_cache" (
  cache_key  TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "matches" (
  id         TEXT PRIMARY KEY,
  league     TEXT NOT NULL,
  season     INT,
  home_team  TEXT NOT NULL,
  away_team  TEXT NOT NULL,
  kickoff    TIMESTAMPTZ NOT NULL,
  status     TEXT NOT NULL,
  home_score INT,
  away_score INT,
  payload    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON "api_cache" (expires_at);
CREATE INDEX IF NOT EXISTS idx_matches_status ON "matches" (status);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON "matches" (kickoff);
