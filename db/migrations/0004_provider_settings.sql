-- Provider settings — key/value store for the active sports API provider
-- (and any future admin-settable global settings).
-- Written by /api/admin/provider, read at request time so an admin flip is
-- honoured immediately across serverless instances (like the override tables,
-- it is deliberately NOT part of api_cache so "Clear Cache" never resets it).

CREATE TABLE IF NOT EXISTS "app_settings" (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default active provider so reads never race an empty table.
-- The valid values are "rapid" and "highlightly".
INSERT INTO "app_settings" (key, value)
VALUES ('sports.provider', 'rapid')
ON CONFLICT (key) DO NOTHING;
