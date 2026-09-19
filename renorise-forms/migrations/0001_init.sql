-- Reno Rise lead capture — initial schema.
-- Non-destructive: only ever creates new objects, never drops or alters
-- anything. Safe to run against the existing renorise-leads database
-- even if it already has unrelated tables in it.

CREATE TABLE IF NOT EXISTS leads (
  id                     TEXT PRIMARY KEY,
  idempotency_key        TEXT NOT NULL UNIQUE,
  created_at             TEXT NOT NULL,
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL,
  phone                  TEXT NOT NULL,
  city                   TEXT NOT NULL,
  renovation_type        TEXT NOT NULL,
  project_timing         TEXT NOT NULL,
  target_deadline        TEXT,
  project_details        TEXT,
  source                 TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'new',
  customer_email_status  TEXT NOT NULL DEFAULT 'pending',
  internal_email_status  TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- One row per email that needs to go out for a lead (customer ack,
-- internal notification). Durable so a Worker restart or timeout never
-- loses track of an email that still needs sending or retrying.
CREATE TABLE IF NOT EXISTS email_jobs (
  id                 TEXT PRIMARY KEY,
  lead_id            TEXT NOT NULL REFERENCES leads(id),
  email_type         TEXT NOT NULL CHECK (email_type IN ('customer', 'internal')),
  idempotency_key    TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  max_attempts       INTEGER NOT NULL DEFAULT 5,
  last_error         TEXT,
  resend_message_id  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_retry ON email_jobs(status, attempts);
CREATE INDEX IF NOT EXISTS idx_email_jobs_lead ON email_jobs(lead_id);

-- Lightweight app-level rate limiting (the Worker runs on a workers.dev
-- subdomain, not proxied through the renosrise.com zone, so Cloudflare's
-- zone-level WAF rate-limit rules don't apply here — this table is the
-- actual enforcement). ip_hash is a SHA-256 of the caller's IP, not the
-- raw address.
CREATE TABLE IF NOT EXISTS rate_limit_events (
  ip_hash     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_time ON rate_limit_events(ip_hash, created_at);
