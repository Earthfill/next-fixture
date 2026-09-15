-- Email verification for app_users: adds verified_at + a one-time token table
-- used by the verify-on-register email flow (Resend). Lives OUTSIDE api_cache
-- (like app_users/app_sessions) so cache clears never wipe verification state.

ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "email_tokens" (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "app_users"(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'verify_email', -- 'verify_email' (future: reset/magic_link)
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user  ON "email_tokens" (user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON "email_tokens" (token);