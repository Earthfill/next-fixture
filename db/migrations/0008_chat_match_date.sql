-- Match discussion cleanup: adds a kickoff date (match_date) to each chat message
-- so the daily cron can delete a finished match's thread at the same moment its
-- preview data is removed from the cache. No-PG/legacy rows (match_date NULL)
-- are covered by a created_at age fallback in the cleanup query.

ALTER TABLE "preview_chat_messages" ADD COLUMN IF NOT EXISTS match_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_preview_chat_match_date ON "preview_chat_messages" (match_date);