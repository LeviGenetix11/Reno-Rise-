// Database operations for tracked calls. Used by the voice Worker (recording what
// Twilio reports), the forms Worker's alert job, and the dashboard (Calls pages).
//
// Design rules, because Twilio can send the same callback twice, or send callbacks in
// the wrong order:
//   * One row per customer call, keyed by the inbound call's Twilio id (UNIQUE), created
//     with INSERT ... ON CONFLICT DO NOTHING, so a repeat can never make a second record.
//   * Every update is monotonic: a status only moves FORWARD (queued < ringing <
//     in-progress < finished); a duration only grows; `accepted_at` is set once and
//     never cleared; a confirmed recording is never downgraded. So the final state is the
//     same whatever the arrival order.
//   * The outcome is always RECOMPUTED from the stored facts (deriveOutcome), never patched.
//   * Nothing here sends an email, enrolls anyone in a sequence, or creates an appointment.
//
// All queries are prepared statements with bound parameters.

import { callerIdentity, deriveOutcome, deriveHangupStage, needsCallback, isTerminal, rankOf, OUTCOME_LABEL, formatPhoneDisplay } from './calls.js';
import { torontoToday } from './time.js';

const newId = () => crypto.randomUUID();
const iso = (now) => (now instanceof Date ? now : new Date(now || Date.now())).toISOString();

const PARENT_RANK_SQL = "CASE %c WHEN 'queued' THEN 0 WHEN 'initiated' THEN 1 WHEN 'ringing' THEN 2 WHEN 'in-progress' THEN 3 WHEN 'answered' THEN 3 ELSE 4 END";
const RECORDING_RANK_SQL = "CASE %c WHEN 'in-progress' THEN 1 WHEN 'absent' THEN 2 WHEN 'failed' THEN 2 WHEN 'completed' THEN 3 ELSE 0 END";
const sqlRank = (tmpl, col) => tmpl.replace('%c', col);

// ------------------------------------------------------------------ events and de-duplication

/** True the first time this webhook is seen; false for a repeat delivery. */
export async function firstTimeEvent(db, key, now = new Date()) {
  const res = await db.prepare('INSERT OR IGNORE INTO voice_events (event_key, received_at) VALUES (?, ?)').bind(String(key).slice(0, 200), iso(now)).run();
  return Boolean(res.meta && res.meta.changes);
}

export async function addCallEvent(db, callId, kind, summary, actor = 'system', now = new Date()) {
  await db.prepare('INSERT INTO call_events (id, call_id, kind, summary, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), callId, kind, summary, actor, iso(now)).run();
}

export async function getCallBySid(db, callSid) {
  return db.prepare('SELECT * FROM calls WHERE call_sid = ?').bind(callSid).first();
}
export async function getCallById(db, id) {
  return db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
}

// ------------------------------------------------------------------ recording what Twilio reports

/**
 * Makes sure a call row exists (a later callback may arrive first). When the callback is
 * about the inbound call itself, `from` / `to` fill in the caller and the business number
 * exactly once. A withheld number stays withheld: nothing is guessed.
 */
export async function ensureCall(db, { callSid, from, to, hasIdentity = false, now = new Date() }) {
  const t = iso(now);
  const created = await db
    .prepare('INSERT INTO calls (id, call_sid, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(call_sid) DO NOTHING')
    .bind(newId(), callSid, t, t, t)
    .run();
  if (hasIdentity) {
    const who = callerIdentity(from);
    await db
      .prepare('UPDATE calls SET from_number = ?, from_norm = ?, caller_withheld = ?, to_number = ?, updated_at = ? WHERE call_sid = ? AND to_number IS NULL')
      .bind(who.number, who.norm, who.withheld ? 1 : 0, String(to || '').trim() || 'unknown', t, callSid)
      .run();
  }
  const row = await getCallBySid(db, callSid);
  if (created.meta && created.meta.changes && row) await addCallEvent(db, row.id, 'call_received', 'Call received', 'twilio', now);
  return row;
}

export async function applyParentStatus(db, { callSid, status, duration, now = new Date() }) {
  const t = iso(now);
  const newRank = rankOf(status);
  if (newRank < 0) return;
  await db
    .prepare(
      `UPDATE calls SET parent_status = ?, ended_at = CASE WHEN ? >= 4 THEN COALESCE(ended_at, ?) ELSE ended_at END, updated_at = ?
       WHERE call_sid = ? AND (parent_status IS NULL OR ${sqlRank(PARENT_RANK_SQL, 'parent_status')} < ?)`
    )
    .bind(status, newRank, t, t, callSid, newRank)
    .run();
  const seconds = Number(duration);
  if (Number.isFinite(seconds) && seconds >= 0) {
    await db.prepare('UPDATE calls SET duration_seconds = ?, updated_at = ? WHERE call_sid = ? AND ? > COALESCE(duration_seconds, -1)').bind(Math.floor(seconds), t, callSid, Math.floor(seconds)).run();
  }
}

/** A report about the forwarded (cellphone) leg. It belongs to the same customer call. */
export async function applyLegStatus(db, { parentSid, legSid, status, duration, now = new Date() }) {
  const t = iso(now);
  const call = await ensureCall(db, { callSid: parentSid, now });
  await db.prepare('INSERT INTO call_legs (id, call_id, leg_sid, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(leg_sid) DO NOTHING').bind(newId(), call.id, legSid, t, t).run();
  const newRank = rankOf(status);
  if (newRank >= 0) {
    await db
      .prepare(
        `UPDATE call_legs SET status = ?, ended_at = CASE WHEN ? >= 4 THEN COALESCE(ended_at, ?) ELSE ended_at END, updated_at = ?
         WHERE leg_sid = ? AND (status IS NULL OR ${sqlRank(PARENT_RANK_SQL, 'status')} < ?)`
      )
      .bind(status, newRank, t, t, legSid, newRank)
      .run();
  }
  const seconds = Number(duration);
  if (Number.isFinite(seconds) && seconds >= 0) {
    await db.prepare('UPDATE call_legs SET duration_seconds = ?, updated_at = ? WHERE leg_sid = ? AND ? > COALESCE(duration_seconds, -1)').bind(Math.floor(seconds), t, legSid, Math.floor(seconds)).run();
  }
  // "answered" = Twilio says the phone picked up (or a call that ran for a while was clearly answered).
  if (status === 'in-progress' || status === 'answered' || (status === 'completed' && seconds > 0)) {
    await db.prepare('UPDATE call_legs SET answered_at = COALESCE(answered_at, ?) WHERE leg_sid = ?').bind(t, legSid).run();
  }
  const legs = (await db.prepare('SELECT * FROM call_legs WHERE call_id = ?').bind(call.id).all()).results || [];
  let best = null;
  for (const l of legs) if (l.status && (!best || rankOf(l.status) > rankOf(best.status))) best = l;
  const answeredAt = legs.map((l) => l.answered_at).filter(Boolean).sort()[0] || null;
  await db
    .prepare('UPDATE calls SET forward_status = COALESCE(?, forward_status), forward_answered_at = COALESCE(forward_answered_at, ?), updated_at = ? WHERE id = ?')
    .bind(best ? best.status : null, answeredAt, t, call.id)
    .run();
  return getCallById(db, call.id);
}

/**
 * The "Press 1 to accept" prompt result. ONLY a pressed 1 sets accepted_at, once, and it can
 * never be undone by a late or repeated report. Anything else records that it was not accepted.
 */
export async function applyScreen(db, { parentSid, digits, noInput = false, now = new Date() }) {
  const t = iso(now);
  const call = await ensureCall(db, { callSid: parentSid, now });
  if (String(digits ?? '').trim() === '1') {
    const res = await db.prepare("UPDATE calls SET screen_outcome = 'accepted', accepted_at = COALESCE(accepted_at, ?), updated_at = ? WHERE id = ?").bind(t, t, call.id).run();
    if (!call.accepted_at && res.meta && res.meta.changes) await addCallEvent(db, call.id, 'accepted', 'You pressed 1 to accept the call', 'twilio', now);
    return getCallById(db, call.id);
  }
  const value = noInput || !String(digits ?? '').trim() ? 'no_input' : 'rejected';
  const res = await db.prepare("UPDATE calls SET screen_outcome = ?, updated_at = ? WHERE id = ? AND screen_outcome IS NULL").bind(value, t, call.id).run();
  if (res.meta && res.meta.changes) {
    await addCallEvent(db, call.id, 'not_accepted', value === 'no_input' ? 'The phone answered or rang out, but 1 was not pressed, so the call was not accepted' : 'A key other than 1 was pressed, so the call was not accepted', 'twilio', now);
  }
  return getCallById(db, call.id);
}

export async function applyDialComplete(db, { callSid, dialStatus, dialDuration, now = new Date() }) {
  const t = iso(now);
  const call = await ensureCall(db, { callSid, now });
  await db.prepare('UPDATE calls SET dial_status = COALESCE(?, dial_status), updated_at = ? WHERE id = ?').bind(dialStatus || null, t, call.id).run();
  const secs = Number(dialDuration);
  if (Number.isFinite(secs) && secs >= 0) await db.prepare('UPDATE calls SET dial_duration_seconds = ? WHERE id = ? AND ? > COALESCE(dial_duration_seconds, -1)').bind(Math.floor(secs), call.id, Math.floor(secs)).run();
  return getCallById(db, call.id);
}

export async function markVoicemailOffered(db, callSid, now = new Date()) {
  const t = iso(now);
  const call = await ensureCall(db, { callSid, now });
  const res = await db.prepare('UPDATE calls SET voicemail_offered_at = COALESCE(voicemail_offered_at, ?), updated_at = ? WHERE id = ? AND voicemail_offered_at IS NULL').bind(t, t, call.id).run();
  if (res.meta && res.meta.changes) await addCallEvent(db, call.id, 'voicemail_offered', 'The caller was offered business voicemail', 'system', now);
}

/** Recording progress from Twilio's Record action or its completion callback. */
export async function applyRecording(db, { callSid, recordingSid, status, duration, now = new Date() }) {
  const t = iso(now);
  const call = await ensureCall(db, { callSid, now });
  const secs = Number(duration);
  const hasSecs = Number.isFinite(secs) && secs >= 0;
  let effective = status;
  if (!effective) effective = hasSecs && secs > 0 ? 'in-progress' : 'absent'; // the Record "action" request carries no status
  if (effective === 'completed' && hasSecs && secs < 1) effective = 'absent'; // an empty recording is not a voicemail
  const newRank = { 'in-progress': 1, absent: 2, failed: 2, completed: 3 }[effective] || 0;
  await db
    .prepare(
      `UPDATE calls SET
         recording_sid = COALESCE(recording_sid, ?),
         recording_status = CASE WHEN ? > ${sqlRank(RECORDING_RANK_SQL, 'recording_status')} THEN ? ELSE recording_status END,
         recording_confirmed_at = CASE WHEN ? = 'completed' THEN COALESCE(recording_confirmed_at, ?) ELSE recording_confirmed_at END,
         updated_at = ?
       WHERE id = ?`
    )
    .bind(recordingSid || null, newRank, effective, effective, t, t, call.id)
    .run();
  if (hasSecs) await db.prepare('UPDATE calls SET recording_duration_seconds = ? WHERE id = ? AND ? > COALESCE(recording_duration_seconds, -1)').bind(Math.floor(secs), call.id, Math.floor(secs)).run();
  const after = await getCallById(db, call.id);
  if (effective === 'completed' && after.recording_confirmed_at === t) await addCallEvent(db, call.id, 'voicemail_confirmed', `Voicemail recording confirmed by Twilio (${Math.round(after.recording_duration_seconds || 0)} seconds)`, 'twilio', now);
  return after;
}

// ------------------------------------------------------------------ matching a caller to a contact

/**
 * Match ONLY when exactly one contact has this normalised number. Two or more contacts
 * sharing a number (for example before duplicates are reviewed) is "ambiguous": the call
 * stays unassigned and shows the candidates. Nothing is ever guessed.
 */
export async function matchContact(db, norm) {
  if (!norm) return { status: 'withheld', contactId: null, candidates: [] };
  const rows = (
    await db
      .prepare(
        `SELECT DISTINCT c.id AS id FROM contacts c LEFT JOIN contact_identifiers i ON i.contact_id = c.id AND i.kind = 'phone'
         WHERE c.merged_into_id IS NULL AND (c.phone_norm = ? OR i.norm = ?)`
      )
      .bind(norm, norm)
      .all()
  ).results || [];
  if (rows.length === 1) return { status: 'matched', contactId: rows[0].id, candidates: [rows[0].id] };
  if (rows.length > 1) return { status: 'ambiguous', contactId: null, candidates: rows.map((r) => r.id) };
  return { status: 'unmatched', contactId: null, candidates: [] };
}

// ------------------------------------------------------------------ recompute and side effects

/**
 * Recomputes a call's outcome from the stored facts, matches the caller once, and keeps the
 * callback task in step. Safe to run any number of times.
 */
export async function refreshCall(db, callId, now = new Date()) {
  let call = await getCallById(db, callId);
  if (!call) return null;
  const t = iso(now);
  const outcome = deriveOutcome(call);
  const stage = deriveHangupStage(call, outcome);
  if (outcome !== call.outcome || stage !== call.hangup_stage) {
    await db.prepare('UPDATE calls SET outcome = ?, hangup_stage = ?, updated_at = ? WHERE id = ?').bind(outcome, stage, t, call.id).run();
    if (outcome !== call.outcome && outcome !== 'in_progress') await addCallEvent(db, call.id, 'outcome', `Outcome: ${OUTCOME_LABEL[outcome]}`, 'system', now);
  }
  // Match once, when the caller's identity is known. A manual link is never overwritten.
  if (!call.match_status && call.to_number) {
    const m = call.caller_withheld ? { status: 'withheld', contactId: null } : await matchContact(db, call.from_norm);
    await db.prepare('UPDATE calls SET match_status = ?, contact_id = COALESCE(contact_id, ?), updated_at = ? WHERE id = ? AND match_status IS NULL').bind(m.status, m.contactId, t, call.id).run();
    await addCallEvent(db, call.id, 'match', { matched: 'Matched to one existing contact by phone number', ambiguous: 'More than one contact has this number, so it was left unassigned', unmatched: 'No existing contact has this number', withheld: 'The caller’s number was withheld' }[m.status], 'system', now);
  }
  call = await getCallById(db, call.id);
  await syncCallbackTask(db, call, now);
  return getCallById(db, call.id);
}

/**
 * A missed call or voicemail from a KNOWN contact gets a callback task on their record
 * (one per call, idempotent). Spam / irrelevant calls do not, and a call marked so later
 * has its still-open callback task cancelled. Answering a call never becomes an appointment.
 */
export async function syncCallbackTask(db, call, now = new Date()) {
  const t = iso(now);
  const wants = needsCallback(call) && Boolean(call.contact_id) && call.outcome !== 'in_progress';
  if (wants && !call.task_id) {
    const taskId = `tk-call-${call.id}`;
    const title = call.outcome === 'voicemail' ? 'Call back about the voicemail' : 'Call back the missed call';
    await db
      .prepare(
        `INSERT OR IGNORE INTO tasks (id, contact_id, opportunity_id, type, title, due_on, priority, status, source, created_at, created_by, updated_at)
         VALUES (?, ?, ?, 'call', ?, ?, 'normal', 'open', 'call_callback', ?, 'system', ?)`
      )
      .bind(taskId, call.contact_id, call.opportunity_id || null, title, torontoToday(now), t, t)
      .run();
    const res = await db.prepare('UPDATE calls SET task_id = ?, updated_at = ? WHERE id = ? AND task_id IS NULL').bind(taskId, t, call.id).run();
    if (res.meta && res.meta.changes) await addCallEvent(db, call.id, 'callback_task', 'A callback task was created', 'system', now);
  } else if (call.task_id && call.disposition !== 'open') {
    await db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ?, completed_by = 'system', updated_at = ? WHERE id = ? AND status = 'open'").bind(t, t, call.task_id).run();
  }
}

/**
 * A call that never received its final report from Twilio (a lost callback) must not stay
 * "in progress" forever. After a while it is closed using what we DO know.
 */
export async function finalizeStaleCalls(db, now = new Date(), staleMinutes = 45) {
  const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000).toISOString();
  const stale = (await db.prepare("SELECT id, updated_at FROM calls WHERE outcome = 'in_progress' AND updated_at < ? LIMIT 50").bind(cutoff).all()).results || [];
  for (const c of stale) {
    const res = await db.prepare('UPDATE calls SET ended_at = COALESCE(ended_at, updated_at) WHERE id = ? AND ended_at IS NULL').bind(c.id).run();
    if (res.meta && res.meta.changes) await addCallEvent(db, c.id, 'closed_without_report', `No final report arrived from Twilio, so the call was closed after ${staleMinutes} minutes using what was recorded`, 'system', now);
    await refreshCall(db, c.id, now);
  }
  return stale.length;
}

export { formatPhoneDisplay, isTerminal };
