CREATE TABLE IF NOT EXISTS mailer_sent_emails (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL, -- "sent" | "failed"
  resend_id TEXT,
  error TEXT,
  body TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mailer_sent_emails_created_at_idx ON mailer_sent_emails (created_at);
