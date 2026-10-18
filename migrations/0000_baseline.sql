-- Baseline: the mailer_* schema as it runs in production on 2026-10-18.
-- IF NOT EXISTS makes it a no-op there; on a fresh local D1 it creates the schema.

CREATE TABLE IF NOT EXISTS mailer_sent_emails (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL, -- "sent" | "failed"
  resend_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
, body TEXT);

CREATE INDEX IF NOT EXISTS mailer_sent_emails_created_at_idx ON mailer_sent_emails (created_at);
