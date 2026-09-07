-- Admin overrides: manual prediction scoreline / tip / win-probability / preview
-- text edits. These live OUTSIDE api_cache so the daily midnight cache clear and
-- the admin "Clear Cache" action never reset them. Entries expire at match kickoff.

CREATE TABLE IF NOT EXISTS "admin_overrides" (
  slug            TEXT PRIMARY KEY,
  predicted_score JSONB,
  tip             TEXT,
  win_probability JSONB,
  preview_text    TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_expires ON "admin_overrides" (expires_at);
