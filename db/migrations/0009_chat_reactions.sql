-- Like/dislike reactions on preview chat messages. One row per (message, user),
-- so toggling is a single upsert/delete and each user affects a message once.
-- Cascade deletes keep reactions in sync when a finished match's thread is
-- purged by the daily cron, an admin hard-deletes a message, or an account
-- is removed.

CREATE TABLE IF NOT EXISTS "preview_chat_reactions" (
  message_id TEXT NOT NULL REFERENCES "preview_chat_messages"(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "app_users"(id) ON DELETE CASCADE,
  reaction   TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON "preview_chat_reactions" (message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user    ON "preview_chat_reactions" (user_id);
