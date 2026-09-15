-- Threaded match discussion for /previews/[slug] — logged-in users only.
-- Lives OUTSIDE api_cache so the daily midnight cache clear / admin "Clear
-- Cache" action never resets the discussion.

CREATE TABLE IF NOT EXISTS "preview_chat_messages" (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL,                    -- normalized preview slug
  user_id            TEXT NOT NULL REFERENCES "app_users"(id) ON DELETE CASCADE,
  body               TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  parent_id          TEXT REFERENCES "preview_chat_messages"(id) ON DELETE CASCADE, -- threaded reply
  moderation_status  TEXT NOT NULL DEFAULT 'approved', -- approved | pending | removed
  removed_by         TEXT,                             -- user id (self-removed) or 'admin'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preview_chat_slug    ON "preview_chat_messages" (slug, created_at);
CREATE INDEX IF NOT EXISTS idx_preview_chat_status  ON "preview_chat_messages" (moderation_status);
