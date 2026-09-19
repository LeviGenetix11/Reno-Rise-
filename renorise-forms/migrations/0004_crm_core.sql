-- CRM core (Stage A): contacts, projects (opportunities), tasks, call logs,
-- appointments, timeline events, communication permissions, CRM settings.
--
-- Additive and non-destructive, in the same spirit as 0002 and 0003:
--   * creates NEW tables only;
--   * adds two NULLABLE link columns to `leads` (contact_id, opportunity_id);
--   * drops, renames, rewrites and backfills NOTHING. Every original submission
--     (leads.name / email / phone / city / renovation_type / project_timing /
--     target_deadline / project_details / source / created_at) stays exactly as
--     the customer sent it, and email_jobs, consents, enrollments,
--     follow_ups, lead_notes and lead_activity keep pointing at the same lead ids.
--
-- The public form Worker lists its INSERT columns explicitly and never reads the
-- new columns, so form saving and both immediate emails are unaffected. The
-- dashboard creates a contact and a project for each submission the first time it
-- looks (see crm-db.js ensureCrmRecords), one contact per submission: people are
-- never merged automatically just because they share an email address or phone.
--
-- Vocabulary columns (stage, qualification, priority ...) are validated in code,
-- not with CHECK constraints, so a label can be added later without rebuilding a
-- table. Timestamps are UTC ISO-8601 instants; *_on columns are America/Toronto
-- calendar dates ('YYYY-MM-DD').

-- The person. Display values are stored as entered; *_norm columns exist only
-- for duplicate suggestions and are never shown as the customer's details.
CREATE TABLE IF NOT EXISTS contacts (
  id                        TEXT PRIMARY KEY,
  display_name              TEXT NOT NULL,
  email                     TEXT,
  email_norm                TEXT,
  phone                     TEXT,
  phone_norm                TEXT,
  preferred_contact_method  TEXT,     -- email | phone | text | NULL (not asked)
  preferred_contact_time    TEXT,     -- free text, e.g. "weekday evenings"
  notes                     TEXT,     -- standing notes about the customer
  tags                      TEXT,     -- comma-separated
  is_test                   INTEGER NOT NULL DEFAULT 0,
  archived_at               TEXT,
  merged_into_id            TEXT REFERENCES contacts(id),   -- reserved for the duplicate-review stage
  created_at                TEXT NOT NULL,
  created_by                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_email_norm ON contacts(email_norm);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm ON contacts(phone_norm);

-- Every email address / phone number a contact has been known by, so matching
-- still works after a contact's details are edited or two contacts are linked.
CREATE TABLE IF NOT EXISTS contact_identifiers (
  id          TEXT PRIMARY KEY,
  contact_id  TEXT NOT NULL REFERENCES contacts(id),
  kind        TEXT NOT NULL,          -- email | phone
  value       TEXT NOT NULL,          -- as entered
  norm        TEXT NOT NULL,          -- normalised for matching
  source      TEXT NOT NULL,          -- submission | manual | edit
  created_at  TEXT NOT NULL,
  UNIQUE (contact_id, kind, norm)
);
CREATE INDEX IF NOT EXISTS idx_contact_identifiers_norm ON contact_identifiers(kind, norm);

-- The renovation project / sales opportunity. One contact can have many.
-- A project can have several submissions (a repeat submission of the SAME project
-- is a duplicate submission, not a new project); a new project for the same
-- person is a new row here.
CREATE TABLE IF NOT EXISTS opportunities (
  id                       TEXT PRIMARY KEY,
  contact_id               TEXT NOT NULL REFERENCES contacts(id),
  title                    TEXT NOT NULL,
  renovation_type          TEXT,
  property_address         TEXT,
  property_city            TEXT,
  property_postal_code     TEXT,
  scope                    TEXT,
  description              TEXT,
  desired_start_date       TEXT,      -- Toronto calendar date, when known
  desired_start_note       TEXT,      -- what the customer said ("Within 1-3 months")
  target_completion_date   TEXT,
  target_completion_note   TEXT,
  budget_status            TEXT NOT NULL DEFAULT 'not_discussed',   -- not_discussed | stated
  budget_min               INTEGER,   -- whole currency units
  budget_max               INTEGER,
  budget_currency          TEXT NOT NULL DEFAULT 'CAD',
  is_homeowner             TEXT NOT NULL DEFAULT 'unknown',         -- unknown | yes | no
  decision_maker           TEXT,      -- free text, only where supplied

  qualification            TEXT NOT NULL DEFAULT 'not_assessed',    -- not_assessed | qualified | not_a_fit
  qualification_reason     TEXT,
  qualification_note       TEXT,
  qualification_at         TEXT,

  stage                    TEXT,      -- NULL only while stage_needs_review = 1
  stage_needs_review       INTEGER NOT NULL DEFAULT 0,
  legacy_status            TEXT,      -- leads.status when this project was created, kept for the record
  stage_changed_at         TEXT,
  stage_reason             TEXT,      -- lost / on-hold reason code
  stage_note               TEXT,
  hold_from_stage          TEXT,
  hold_review_on           TEXT,      -- Toronto date the hold should be reviewed
  delivery_status          TEXT NOT NULL DEFAULT 'not_started',     -- work status, separate from the sales outcome

  priority                 TEXT NOT NULL DEFAULT 'normal',          -- low | normal | high
  first_contact_at         TEXT,      -- first RECORDED human outreach (staff-logged), never inferred
  last_contact_at          TEXT,

  contractor_id            TEXT REFERENCES contractors(id),         -- currently assigned (history arrives with handoffs)
  marketing_source         TEXT NOT NULL DEFAULT 'unknown',
  customer_reported_source TEXT,

  is_test                  INTEGER NOT NULL DEFAULT 0,
  archived_at              TEXT,
  created_at               TEXT NOT NULL,
  created_by               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage, archived_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_contractor ON opportunities(contractor_id);

-- Links from each original submission (a leads row) to its contact and project.
ALTER TABLE leads ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE leads ADD COLUMN opportunity_id TEXT REFERENCES opportunities(id);
CREATE INDEX IF NOT EXISTS idx_leads_opportunity ON leads(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact_id);

-- Tasks. The dashboard's existing "Follow-ups" become tasks: existing follow_ups
-- rows are copied in with the SAME id (follow_ups itself is left untouched).
-- A task links to a contact, a project, a contractor, or any combination.
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  contact_id       TEXT REFERENCES contacts(id),
  opportunity_id   TEXT REFERENCES opportunities(id),
  contractor_id    TEXT REFERENCES contractors(id),
  type             TEXT NOT NULL DEFAULT 'general',   -- call | email | quote_check | contractor_check | general
  title            TEXT NOT NULL,
  due_on           TEXT NOT NULL,                     -- Toronto calendar date
  due_at           TEXT,                              -- optional UTC instant when a time of day matters
  priority         TEXT NOT NULL DEFAULT 'normal',
  assigned_to      TEXT,                              -- a signed-in staff email
  status           TEXT NOT NULL DEFAULT 'open',      -- open | done | cancelled
  completed_at     TEXT,
  completed_by     TEXT,
  completion_note  TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',    -- manual | call_log | legacy_follow_up
  created_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (contact_id IS NOT NULL OR opportunity_id IS NOT NULL OR contractor_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(status, due_on);
CREATE INDEX IF NOT EXISTS idx_tasks_opportunity ON tasks(opportunity_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id, status);

-- Manually logged calls. A tapped phone link proves nothing, so a call only
-- exists here because a person recorded it. `source` / `provider_ref` are ready
-- for a future telephony integration; nothing writes them today.
CREATE TABLE IF NOT EXISTS call_logs (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT NOT NULL REFERENCES contacts(id),
  opportunity_id  TEXT REFERENCES opportunities(id),
  occurred_at     TEXT NOT NULL,
  direction       TEXT NOT NULL DEFAULT 'outbound',   -- outbound | inbound
  outcome         TEXT NOT NULL,                      -- connected | no_answer | voicemail | wrong_number | other
  summary         TEXT,
  task_id         TEXT REFERENCES tasks(id),          -- the next action created from this call, if any
  source          TEXT NOT NULL DEFAULT 'manual',
  provider_ref    TEXT,
  logged_by       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_logs_opportunity ON call_logs(opportunity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs(contact_id, occurred_at);

-- Consultations and on-site assessments. Recorded by staff today (no booking
-- integration exists in this repository); `source` / `external_ref` are ready for
-- one. The two kinds are different things and are never conflated.
CREATE TABLE IF NOT EXISTS appointments (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id),
  contact_id      TEXT NOT NULL REFERENCES contacts(id),
  kind            TEXT NOT NULL,                      -- phone_consultation | onsite_assessment
  starts_at       TEXT NOT NULL,                      -- UTC instant
  status          TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | completed | cancelled | no_show
  source          TEXT NOT NULL DEFAULT 'manual',     -- manual | legacy_assessment | calcom
  external_ref    TEXT,
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_when ON appointments(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_opportunity ON appointments(opportunity_id);

-- Timeline entries and the audit trail for everything the CRM does that has no
-- table of its own (notes, stage changes, qualification, contact edits,
-- permissions, rescheduling...). Append-only: no code path updates or deletes a row.
CREATE TABLE IF NOT EXISTS crm_events (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT NOT NULL REFERENCES contacts(id),
  opportunity_id  TEXT REFERENCES opportunities(id),
  kind            TEXT NOT NULL,
  summary         TEXT NOT NULL,
  detail          TEXT,                               -- JSON: before/after values, reason codes
  provenance      TEXT NOT NULL DEFAULT 'manual',     -- manual (staff) | system (automatic)
  actor           TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_events_opportunity ON crm_events(opportunity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_crm_events_contact ON crm_events(contact_id, occurred_at);

-- Communication permissions recorded against the PERSON. Append-only ledger: the
-- current state of a channel is its newest row; withdrawing adds a row.
CREATE TABLE IF NOT EXISTS contact_permissions (
  id           TEXT PRIMARY KEY,
  contact_id   TEXT NOT NULL REFERENCES contacts(id),
  channel      TEXT NOT NULL,                         -- email | phone | text
  status       TEXT NOT NULL,                         -- granted | withdrawn
  method       TEXT NOT NULL,                         -- phone_verbal | written_reply | in_person | website_form | other
  given_on     TEXT NOT NULL,                         -- Toronto calendar date
  evidence     TEXT NOT NULL,                         -- who / how, in staff's words
  recorded_by  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_permissions_contact ON contact_permissions(contact_id, created_at);

-- Editable thresholds (hours / days) for the Today view. Internal reminders,
-- not promises to customers.
CREATE TABLE IF NOT EXISTS crm_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
