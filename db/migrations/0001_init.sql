-- Initial schema: cache-aside durable tier (api_cache).

CREATE TABLE IF NOT EXISTS "api_cache" (
  cache_key  TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON "api_cache" (expires_at);
