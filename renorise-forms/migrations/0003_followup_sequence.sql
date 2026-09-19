-- Follow-up email sequence (v2: three follow-ups over 14 days).
--
-- Additive and non-destructive: creates NEW tables only. It does not alter,
-- drop, or backfill leads, email_jobs (the immediate customer confirmation and
-- internal notification), or any other existing table. The confirmations keep
-- using email_jobs exactly as before; follow-ups get their own durable send
-- table modelled on it (email_jobs' CHECK constraint cannot be extended without
-- rebuilding the table, which would touch live data).
--
-- The global send switch is inserted as OFF ('0'). Nothing sends to customers
-- until the owner turns it on in the dashboard.

-- Immutable record of which schedule a version used. Old enrollments keep
-- their version; a schedule change is a NEW row, never an edit.
CREATE TABLE IF NOT EXISTS sequence_versions (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  day_offsets  TEXT NOT NULL,   -- JSON array, e.g. [1,4,14]
  created_at   TEXT NOT NULL
);
INSERT OR IGNORE INTO sequence_versions (id, label, day_offsets, created_at)
VALUES ('v2', 'Three follow-ups over 14 days', '[1,4,14]', '2026-09-19T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS sequence_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
INSERT OR IGNORE INTO sequence_settings (key, value, updated_at, updated_by)
VALUES ('global_send_enabled', '0', '2026-09-19T00:00:00.000Z', 'migration');

-- Recorded explicit permission to receive THIS sequence. Never inferred from a
-- call or a form submission.
CREATE TABLE IF NOT EXISTS consents (
  id               TEXT PRIMARY KEY,
  lead_id          TEXT NOT NULL REFERENCES leads(id),
  scope            TEXT NOT NULL DEFAULT 'followup_sequence',
  method           TEXT NOT NULL,     -- phone_verbal | written_reply | in_person | website_form | other
  given_on         TEXT NOT NULL,     -- Toronto calendar date the customer agreed, 'YYYY-MM-DD'
  evidence         TEXT NOT NULL,     -- who/how, in staff's words
  recorded_by      TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  withdrawn_at     TEXT,
  withdrawn_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_consents_lead ON consents(lead_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id                TEXT PRIMARY KEY,
  lead_id           TEXT NOT NULL REFERENCES leads(id),
  sequence_version  TEXT NOT NULL REFERENCES sequence_versions(id),
  source_kind       TEXT NOT NULL CHECK (source_kind IN ('website', 'call')),
  anchor_at         TEXT NOT NULL,    -- UTC: recorded call date (callers) or inquiry date (website)
  consent_id        TEXT NOT NULL REFERENCES consents(id),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'completed')),
  stop_reason       TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  stopped_at        TEXT,
  completed_at      TEXT
);
-- At most one open (active or paused) enrollment per lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_one_open ON enrollments(lead_id) WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);

CREATE TABLE IF NOT EXISTS enrollment_steps (
  id                    TEXT PRIMARY KEY,
  enrollment_id         TEXT NOT NULL REFERENCES enrollments(id),
  step_no               INTEGER NOT NULL,
  day_offset            INTEGER NOT NULL,
  template              TEXT NOT NULL,
  original_planned_for  TEXT NOT NULL,   -- UTC; never changes
  planned_for           TEXT NOT NULL,   -- UTC; revised after delays so spacing stays sensible
  status                TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'approved', 'queued', 'sent', 'skipped_elapsed', 'skipped_staff', 'cancelled', 'failed')),
  approved_at           TEXT,
  approved_by           TEXT,
  inbox_checked         INTEGER NOT NULL DEFAULT 0,  -- staff confirmed no reply in the hello@ inbox
  send_id               TEXT,
  sent_at               TEXT,
  cancel_reason         TEXT,
  updated_at            TEXT NOT NULL,
  UNIQUE (enrollment_id, step_no)
);
CREATE INDEX IF NOT EXISTS idx_steps_status ON enrollment_steps(status, planned_for);

-- Durable send record for follow-ups (and dashboard test emails). Same design
-- as email_jobs: stable idempotency key, atomic claim, bounded retries.
CREATE TABLE IF NOT EXISTS followup_sends (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('followup', 'test')),
  enrollment_step_id TEXT,
  lead_id            TEXT,
  to_email           TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL UNIQUE,
  template           TEXT,
  variant            TEXT,
  test_name          TEXT,   -- greeting name for dashboard test emails (kind = 'test')
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  max_attempts       INTEGER NOT NULL DEFAULT 5,
  last_error         TEXT,
  resend_message_id  TEXT,
  delivered_at       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followup_sends_status ON followup_sends(status, kind);
CREATE INDEX IF NOT EXISTS idx_followup_sends_message ON followup_sends(resend_message_id);

-- Addresses that must not receive follow-ups (unsubscribe, permanent bounce,
-- spam complaint). Applies to follow-ups only; the immediate confirmation and
-- internal notification are unaffected.
CREATE TABLE IF NOT EXISTS suppressions (
  email       TEXT PRIMARY KEY,   -- lower-cased
  reason      TEXT NOT NULL,      -- unsubscribe | bounce | complaint | manual
  detail      TEXT,
  source      TEXT,               -- e.g. 'unsubscribe_link', 'resend_webhook', 'staff'
  created_at  TEXT NOT NULL
);

-- Unguessable per-enrollment token used in the unsubscribe link.
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token          TEXT PRIMARY KEY,
  lead_id        TEXT NOT NULL,
  enrollment_id  TEXT NOT NULL,
  email          TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  used_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_unsub_lead ON unsubscribe_tokens(lead_id);

-- Webhook de-duplication (svix-id): Resend may deliver an event more than once.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  received_at  TEXT NOT NULL
);
