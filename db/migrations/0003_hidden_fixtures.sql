-- Hidden fixtures: matches the admin has removed from the public site.
-- Lives OUTSIDE api_cache (same principle as admin_overrides) so the daily
-- midnight cache clear and the admin "Clear Cache" action never resurrect them.
-- Removed via the admin panel (DELETE /api/admin/hidden or the hide toggle).

CREATE TABLE IF NOT EXISTS "hidden_fixtures" (
  slug       TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hidden_fixtures_created ON "hidden_fixtures" (created_at);