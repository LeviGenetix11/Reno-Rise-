-- Twilio call tracking and business voicemail.
--
-- Additive and non-destructive: NEW tables only. Nothing existing is altered, dropped,
-- rewritten or backfilled. The public form Worker, confirmation emails, follow-up
-- sequences and the CRM tables are untouched.
--
-- Privacy: the number calls are FORWARDED TO (your cellphone) is never stored here. It
-- lives only in a Cloudflare secret on the voice Worker. Only the caller's number and
-- the business number called are recorded. A voicemail's audio is NOT stored here
-- either; only its Twilio recording id, so the dashboard can stream it on demand
-- behind the private sign-in.

-- One row per customer call. The inbound call and the forwarded cellphone leg are ONE
-- customer call: the inbound call's Twilio id is `call_sid`; forwarded legs are call_legs.
CREATE TABLE IF NOT EXISTS calls (
  id                          TEXT PRIMARY KEY,
  call_sid                    TEXT NOT NULL UNIQUE,      -- Twilio id of the inbound (parent) call
  from_number                 TEXT,                      -- caller, as Twilio reported it; NULL when withheld
  from_norm                   TEXT,                      -- normalised for matching only
  caller_withheld             INTEGER NOT NULL DEFAULT 0,
  to_number                   TEXT,                      -- the business number that was called
  started_at                  TEXT NOT NULL,             -- UTC: when we first heard of the call
  ended_at                    TEXT,                      -- UTC: when Twilio reported the inbound call finished
  duration_seconds            INTEGER,                   -- inbound leg, as Twilio reported it
  parent_status               TEXT,                      -- Twilio's own status for the inbound leg
  forward_status              TEXT,                      -- furthest status Twilio reported for the forwarded leg
  forward_answered_at         TEXT,                      -- Twilio says the forwarded phone answered (could be personal voicemail)

  screen_outcome              TEXT,                      -- accepted | rejected | no_input : what happened at the "Press 1" prompt
  accepted_at                 TEXT,                      -- set ONLY when 1 was pressed. Never inferred from Twilio's status
  dial_status                 TEXT,                      -- Twilio's DialCallStatus when forwarding ended
  dial_duration_seconds       INTEGER,

  voicemail_offered_at        TEXT,
  recording_sid               TEXT,                      -- Twilio recording id (audio stays at Twilio)
  recording_status            TEXT,                      -- in-progress | completed | absent | failed
  recording_duration_seconds  INTEGER,
  recording_confirmed_at      TEXT,                      -- when Twilio's completion callback confirmed the recording exists

  outcome                     TEXT NOT NULL DEFAULT 'in_progress',   -- in_progress | accepted | voicemail | no_message | missed
  hangup_stage                TEXT,                      -- ringing | screening | voicemail : where the caller gave up

  match_status                TEXT,                      -- matched | ambiguous | unmatched | withheld | manual
  contact_id                  TEXT REFERENCES contacts(id),
  opportunity_id              TEXT REFERENCES opportunities(id),

  disposition                 TEXT NOT NULL DEFAULT 'open',          -- open | spam | irrelevant
  disposition_by              TEXT,
  disposition_at              TEXT,
  callback_result             TEXT,                      -- done | not_needed (NULL = not handled yet)
  callback_done_at            TEXT,
  callback_done_by            TEXT,
  task_id                     TEXT REFERENCES tasks(id), -- the callback task, if one was created
  notes                       TEXT,
  notes_updated_at            TEXT,
  notes_updated_by            TEXT,

  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome, disposition);
CREATE INDEX IF NOT EXISTS idx_calls_norm ON calls(from_norm);

-- The forwarded leg(s) to the cellphone (Twilio's child calls). The destination number is deliberately not stored.
CREATE TABLE IF NOT EXISTS call_legs (
  id            TEXT PRIMARY KEY,
  call_id       TEXT NOT NULL REFERENCES calls(id),
  leg_sid       TEXT NOT NULL UNIQUE,
  status        TEXT,
  duration_seconds INTEGER,
  answered_at   TEXT,
  ended_at      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_legs_call ON call_legs(call_id);

-- Append-only activity for one call (automatic facts and staff actions), so it works even
-- for calls that are not linked to anyone yet.
CREATE TABLE IF NOT EXISTS call_events (
  id          TEXT PRIMARY KEY,
  call_id     TEXT NOT NULL REFERENCES calls(id),
  kind        TEXT NOT NULL,
  summary     TEXT NOT NULL,
  actor       TEXT NOT NULL,      -- 'twilio', 'system', or a staff email
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id, created_at);

-- Webhook de-duplication: Twilio may deliver the same callback more than once.
CREATE TABLE IF NOT EXISTS voice_events (
  event_key    TEXT PRIMARY KEY,
  received_at  TEXT NOT NULL
);

-- One durable email alert per call (missed call, or a finished voicemail), sent by the
-- forms Worker's existing 15-minute job through the existing Resend setup. UNIQUE(call_id)
-- is what makes a duplicate alert impossible, however many callbacks arrive.
CREATE TABLE IF NOT EXISTS call_alerts (
  id                 TEXT PRIMARY KEY,
  call_id            TEXT NOT NULL UNIQUE REFERENCES calls(id),
  kind               TEXT NOT NULL CHECK (kind IN ('missed', 'voicemail')),
  idempotency_key    TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  max_attempts       INTEGER NOT NULL DEFAULT 5,
  last_error         TEXT,
  resend_message_id  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_alerts_status ON call_alerts(status, attempts);
