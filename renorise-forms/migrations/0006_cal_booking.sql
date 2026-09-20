-- Consultation booking (Cal.com). ADDITIVE ONLY: new columns and new tables, nothing dropped or rewritten.
-- Existing leads, contacts, opportunities, appointments, enrollments and sends are untouched.

-- An opaque per-lead reference. It rides on booking links as metadata so a booking can be linked back to an inquiry
-- WITHOUT putting raw lead ids or contact details in a public URL. It is a hint, never proof of identity: the matcher
-- still requires the booker's email or phone to agree (see renorise-shared/bookings-db.js).
ALTER TABLE leads ADD COLUMN booking_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_booking_ref ON leads(booking_ref) WHERE booking_ref IS NOT NULL;

-- Earliest still-scheduled phone consultation for this lead's project (UTC). A phone consultation is NOT an on-site
-- assessment, so it has its own column and never touches leads.assessment_at. The follow-up sender checks it before
-- every send (renorise-shared/eligibility.js).
ALTER TABLE leads ADD COLUMN consultation_at TEXT;

-- Appointments keep their existing meaning (staff-managed CRM record). New optional detail for Cal.com-sourced rows.
ALTER TABLE appointments ADD COLUMN ends_at TEXT;
ALTER TABLE appointments ADD COLUMN timezone TEXT;
ALTER TABLE appointments ADD COLUMN booking_id TEXT;
ALTER TABLE appointments ADD COLUMN status_source TEXT NOT NULL DEFAULT 'staff';   -- staff | provider

-- The provider's view of each booking, kept separately from the CRM appointment so that (a) a booking can exist
-- before it is matched to anyone and (b) provider events and staff outcomes are never mixed up.
CREATE TABLE IF NOT EXISTS bookings (
  id                    TEXT PRIMARY KEY,
  provider              TEXT NOT NULL DEFAULT 'calcom',
  provider_uid          TEXT NOT NULL,
  kind                  TEXT NOT NULL DEFAULT 'phone_consultation',
  status                TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected', 'rescheduled')),
  starts_at             TEXT,                 -- UTC
  ends_at               TEXT,                 -- UTC
  attendee_timezone     TEXT,                 -- IANA name as reported by the provider
  organizer_timezone    TEXT,
  attendee_name         TEXT,
  attendee_email        TEXT,
  attendee_email_norm   TEXT,                 -- for matching only
  attendee_phone        TEXT,
  attendee_phone_norm   TEXT,                 -- for matching only
  project_note          TEXT,                 -- the booker's short description (capped)
  lead_ref              TEXT,                 -- opaque reference from booking metadata (a hint, not proof)
  lead_id               TEXT REFERENCES leads(id),
  contact_id            TEXT REFERENCES contacts(id),
  opportunity_id        TEXT REFERENCES opportunities(id),
  match_status          TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched', 'ambiguous', 'unmatched', 'manual', 'dismissed')),
  match_method          TEXT,                 -- ref+email | ref+phone | email | staff
  match_note            TEXT,
  appointment_id        TEXT REFERENCES appointments(id),
  rescheduled_from_uid  TEXT,                 -- the booking this one replaced
  replaced_by_uid       TEXT,                 -- the booking that replaced this one
  cancellation_reason   TEXT,
  provider_no_show      INTEGER NOT NULL DEFAULT 0,   -- provider says the attendee did not show (informational; staff record the outcome)
  event_type_slug       TEXT,
  provider_created_at   TEXT,
  last_event_at         TEXT NOT NULL,        -- provider timestamp of the newest event applied; older events are ignored
  last_trigger          TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (provider, provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_bookings_when ON bookings(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_opportunity ON bookings(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_bookings_match ON bookings(match_status, status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(attendee_email_norm);

-- Every webhook delivery that reached the receiver, for idempotency and for the integration-health panel.
-- The raw payload is NOT stored (it contains contact details and manage links).
CREATE TABLE IF NOT EXISTS booking_events (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL DEFAULT 'calcom',
  event_key          TEXT NOT NULL UNIQUE,    -- sha-256 of the raw body: an identical redelivery is recognised
  trigger_event      TEXT NOT NULL,
  provider_uid       TEXT,
  provider_event_at  TEXT,
  received_at        TEXT NOT NULL,
  processed_at       TEXT,
  outcome            TEXT NOT NULL CHECK (outcome IN ('applied', 'duplicate', 'stale', 'ignored', 'failed', 'rejected', 'not_configured')),
  error              TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_events_recent ON booking_events(received_at);
CREATE INDEX IF NOT EXISTS idx_booking_events_outcome ON booking_events(outcome, received_at);

-- Booking-page settings live next to the other follow-up settings and are edited in the dashboard.
-- The link is included in follow-up emails ONLY when booking_url is set AND booking_link_tested = '1'.
INSERT OR IGNORE INTO sequence_settings (key, value, updated_at, updated_by) VALUES ('booking_url', '', '2026-09-20T00:00:00.000Z', 'migration');
INSERT OR IGNORE INTO sequence_settings (key, value, updated_at, updated_by) VALUES ('booking_link_tested', '0', '2026-09-20T00:00:00.000Z', 'migration');

-- One CRM appointment per Cal.com booking (guards against a duplicate delivery racing another).
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_calcom_ref ON appointments(external_ref) WHERE source = 'calcom' AND external_ref IS NOT NULL;
