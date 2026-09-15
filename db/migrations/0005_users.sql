-- User accounts + sessions — powers the logged-in chat feature.
-- Lives OUTSIDE api_cache (like admin_overrides / app_settings) so cache clears
-- never wipe users or active sessions.

CREATE TABLE IF NOT EXISTS "app_users" (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON "app_users" (email);

CREATE TABLE IF NOT EXISTS "app_sessions" (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "app_users"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON "app_sessions" (user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON "app_sessions" (expires_at);
