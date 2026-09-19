-- Lead-management dashboard schema (renorise-dashboard).
--
-- Additive and non-destructive: creates new tables and adds new NULLABLE
-- columns to `leads`. Nothing is dropped, renamed, rewritten, or backfilled,
-- and no existing row's data changes. The public form Worker (renorise-forms)
-- lists its INSERT columns explicitly and never reads these columns, so it is
-- unaffected.
--
-- Existing operational values in leads.status are untouched ('new' is the only
-- value the public Worker ever writes). The dashboard uses these stage values,
-- all compatible with that existing 'new':
--   new | contacted | assessment_booked | quote_sent | won | lost
-- leads.status is the LEAD stage. Email delivery state stays separate, in
-- leads.customer_email_status / internal_email_status and email_jobs.

CREATE TABLE IF NOT EXISTS contractors (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  company        TEXT,
  service_types  TEXT,
  service_area   TEXT,
  email          TEXT,
  phone          TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  archived_at    TEXT
);

-- New nullable columns on the existing leads table.
--   updated_at    : last dashboard change (NULL = never changed since submit)
--   archived_at   : soft-archive marker (NULL = active); leads are never deleted
--   contractor_id : assigned contractor (internal only; nothing is sent to them)
--   assessment_at : recorded assessment date/time, UTC ISO-8601
ALTER TABLE leads ADD COLUMN updated_at TEXT;
ALTER TABLE leads ADD COLUMN archived_at TEXT;
ALTER TABLE leads ADD COLUMN contractor_id TEXT REFERENCES contractors(id);
ALTER TABLE leads ADD COLUMN assessment_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived_at);
CREATE INDEX IF NOT EXISTS idx_leads_contractor ON leads(contractor_id);

CREATE TABLE IF NOT EXISTS lead_notes (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id),
  body          TEXT NOT NULL,
  author_email  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at);

-- Append-only history of dashboard actions on a lead.
CREATE TABLE IF NOT EXISTS lead_activity (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT NOT NULL REFERENCES leads(id),
  type         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  actor_email  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON lead_activity(lead_id, created_at);

-- Follow-up tasks. due_on is a calendar date in America/Toronto ('YYYY-MM-DD');
-- completed_at is a UTC ISO-8601 instant (NULL = still open).
CREATE TABLE IF NOT EXISTS follow_ups (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads(id),
  due_on        TEXT NOT NULL,
  note          TEXT,
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_open ON follow_ups(completed_at, due_on);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON follow_ups(lead_id);
