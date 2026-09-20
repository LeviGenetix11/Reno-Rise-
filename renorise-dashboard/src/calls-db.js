// Dashboard operations for tracked phone calls. The voice Worker records what Twilio
// reports (renorise-voice); this file is what YOU do with those records: link a call to
// a contact, turn it into a lead, mark spam, write notes, handle callbacks.
//
// Rules:
//   * Nothing here contacts anyone, enrolls anyone in a sequence, or books anything.
//   * A call is only ever linked to a contact by an unambiguous phone match (done by the
//     voice Worker) or by YOU. Contact details are never invented: a lead made from a
//     call uses only what Twilio reported and what you type.
//   * Every action is written to the call's own activity log (works for unlinked calls).
//
// Every function returns { ok, code } with a code that maps to a fixed message.

import { refreshCall, addCallEvent, getCallById } from '../../renorise-shared/calls-db.js';
import { torontoToday } from './time.js';
import { getContact, getOpportunity, createManualProject, ID_RE, clip, nowIso, newId } from './crm-db.js';
import { PAGE_SIZE } from './constants.js';

export const CALL_FILTERS = [
  ['all', 'All calls'],
  ['callbacks', 'Callbacks needed'],
  ['missed', 'Missed'],
  ['voicemail', 'Voicemail'],
  ['answered', 'Answered'],
  ['unassigned', 'Not linked to a contact'],
  ['spam', 'Spam and irrelevant'],
];

const CALLBACK_SQL = "c.outcome IN ('missed','no_message','voicemail') AND c.disposition = 'open' AND c.callback_done_at IS NULL";
const FILTER_SQL = {
  all: "c.disposition = 'open'",
  callbacks: CALLBACK_SQL,
  missed: "c.outcome IN ('missed','no_message') AND c.disposition = 'open'",
  voicemail: "c.outcome = 'voicemail' AND c.disposition = 'open'",
  answered: "c.outcome = 'accepted' AND c.disposition = 'open'",
  unassigned: "c.contact_id IS NULL AND c.disposition = 'open'",
  spam: "c.disposition != 'open'",
};

export function parseCallFilters(url) {
  const p = url.searchParams;
  const pageNum = parseInt(p.get('page') || '1', 10);
  return {
    f: Object.prototype.hasOwnProperty.call(FILTER_SQL, p.get('f')) ? p.get('f') : 'all',
    q: (p.get('q') || '').trim().slice(0, 60),
    page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10000) : 1,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

function searchClause(q) {
  if (!q) return { sql: '', binds: [] };
  const digits = q.replace(/\D/g, '');
  const parts = ["ct.display_name LIKE ? ESCAPE '\\'", "c.notes LIKE ? ESCAPE '\\'"];
  const binds = [like(q), like(q)];
  if (digits.length >= 3) {
    parts.push('c.from_norm LIKE ?');
    binds.push(`%${digits}%`);
  }
  return { sql: ` AND (${parts.join(' OR ')})`, binds };
}

export async function listCalls(db, filters) {
  const s = searchClause(filters.q);
  const where = `WHERE ${FILTER_SQL[filters.f]}${s.sql}`;
  const from = 'FROM calls c LEFT JOIN contacts ct ON ct.id = c.contact_id';
  const total = (await db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).bind(...s.binds).first()).n;
  const rows = await db
    .prepare(`SELECT c.*, ct.display_name AS contact_name ${from} ${where} ORDER BY c.started_at DESC, c.id LIMIT ? OFFSET ?`)
    .bind(...s.binds, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE)
    .all();
  return { rows: rows.results || [], total, pageSize: PAGE_SIZE };
}

/** Counts for the filter tabs. */
export async function callCounts(db) {
  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN c.disposition = 'open' THEN 1 ELSE 0 END) AS all_n,
        SUM(CASE WHEN ${CALLBACK_SQL} THEN 1 ELSE 0 END) AS callbacks,
        SUM(CASE WHEN c.outcome IN ('missed','no_message') AND c.disposition = 'open' THEN 1 ELSE 0 END) AS missed,
        SUM(CASE WHEN c.outcome = 'voicemail' AND c.disposition = 'open' THEN 1 ELSE 0 END) AS voicemail,
        SUM(CASE WHEN c.outcome = 'accepted' AND c.disposition = 'open' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN c.contact_id IS NULL AND c.disposition = 'open' THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN c.disposition != 'open' THEN 1 ELSE 0 END) AS spam
       FROM calls c`
    )
    .first();
  const n = (v) => Number(v || 0);
  return { all: n(row.all_n), callbacks: n(row.callbacks), missed: n(row.missed), voicemail: n(row.voicemail), answered: n(row.answered), unassigned: n(row.unassigned), spam: n(row.spam) };
}

export async function callDetail(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  const call = await db
    .prepare('SELECT c.*, ct.display_name AS contact_name, o.title AS project_title FROM calls c LEFT JOIN contacts ct ON ct.id = c.contact_id LEFT JOIN opportunities o ON o.id = c.opportunity_id WHERE c.id = ?')
    .bind(id)
    .first();
  if (!call) return null;
  const [legs, events, task, candidates, projects] = await Promise.all([
    db.prepare('SELECT * FROM call_legs WHERE call_id = ? ORDER BY created_at').bind(id).all(),
    db.prepare('SELECT * FROM call_events WHERE call_id = ? ORDER BY created_at, rowid').bind(id).all(),
    call.task_id ? db.prepare('SELECT * FROM tasks WHERE id = ?').bind(call.task_id).first() : null,
    call.match_status === 'ambiguous' && call.from_norm
      ? db
          .prepare(
            `SELECT DISTINCT c.id, c.display_name, c.email FROM contacts c LEFT JOIN contact_identifiers i ON i.contact_id = c.id AND i.kind = 'phone'
             WHERE c.merged_into_id IS NULL AND (c.phone_norm = ? OR i.norm = ?) ORDER BY c.display_name COLLATE NOCASE`
          )
          .bind(call.from_norm, call.from_norm)
          .all()
      : null,
    call.contact_id ? db.prepare('SELECT id, title, stage, archived_at FROM opportunities WHERE contact_id = ? ORDER BY created_at DESC').bind(call.contact_id).all() : null,
  ]);
  return { call, legs: legs.results || [], events: events.results || [], task, candidates: candidates ? candidates.results || [] : [], projects: projects ? projects.results || [] : [] };
}

/** People to link a call to (by name, email or phone), most recent first. Never lists merged-away contacts. */
export async function searchContactsToLink(db, q) {
  const text = String(q || '').trim().slice(0, 60);
  if (!text) return [];
  const digits = text.replace(/\D/g, '');
  const parts = ["c.display_name LIKE ? ESCAPE '\\'", "c.email LIKE ? ESCAPE '\\'"];
  const binds = [like(text), like(text)];
  if (digits.length >= 4) {
    parts.push('c.phone_norm LIKE ?');
    binds.push(`%${digits}%`);
  }
  return ((await db.prepare(`SELECT c.id, c.display_name, c.email, c.phone FROM contacts c WHERE c.merged_into_id IS NULL AND (${parts.join(' OR ')}) ORDER BY c.created_at DESC LIMIT 15`).bind(...binds).all()).results) || [];
}

// ------------------------------------------------------------------ actions

const touch = (db, id) => db.prepare('UPDATE calls SET updated_at = ? WHERE id = ?').bind(nowIso(), id).run();

export async function linkCall(db, callId, contactId, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  const contact = await getContact(db, contactId);
  if (!contact || contact.merged_into_id) return { ok: false, code: 'not_found' };
  if (call.contact_id === contact.id) return { ok: true, code: 'no_change' };
  await db.prepare("UPDATE calls SET contact_id = ?, opportunity_id = NULL, match_status = 'manual', updated_at = ? WHERE id = ?").bind(contact.id, nowIso(), call.id).run();
  await addCallEvent(db, call.id, 'linked', `Linked to ${contact.display_name} by you`, actor);
  await refreshCall(db, call.id);
  return { ok: true, code: 'call_linked' };
}

export async function unlinkCall(db, callId, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  if (!call.contact_id) return { ok: true, code: 'no_change' };
  const now = nowIso();
  if (call.task_id) await db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(now, actor, now, call.task_id).run();
  await db.prepare("UPDATE calls SET contact_id = NULL, opportunity_id = NULL, task_id = NULL, match_status = 'unmatched', updated_at = ? WHERE id = ?").bind(now, call.id).run();
  await addCallEvent(db, call.id, 'unlinked', 'Unlinked from its contact by you', actor);
  return { ok: true, code: 'call_unlinked' };
}

export async function attachCallToProject(db, callId, oppId, actor) {
  const call = await getCallById(db, callId);
  if (!call || !call.contact_id) return { ok: false, code: 'call_needs_contact' };
  const opp = oppId ? await getOpportunity(db, oppId) : null;
  if (oppId && (!opp || opp.contact_id !== call.contact_id)) return { ok: false, code: 'not_found' };
  if ((call.opportunity_id || null) === (opp ? opp.id : null)) return { ok: true, code: 'no_change' };
  const now = nowIso();
  const stmts = [db.prepare('UPDATE calls SET opportunity_id = ?, updated_at = ? WHERE id = ?').bind(opp ? opp.id : null, now, call.id)];
  // A call you accepted (pressed 1) and had a conversation on is a recorded human contact for that project.
  if (opp && call.accepted_at) {
    stmts.push(
      db
        .prepare(
          `UPDATE opportunities SET first_contact_at = CASE WHEN first_contact_at IS NULL OR first_contact_at > ? THEN ? ELSE first_contact_at END,
             last_contact_at = CASE WHEN last_contact_at IS NULL OR last_contact_at < ? THEN ? ELSE last_contact_at END, updated_at = ? WHERE id = ?`
        )
        .bind(call.started_at, call.started_at, call.started_at, call.started_at, now, opp.id)
    );
  }
  await db.batch(stmts);
  await addCallEvent(db, call.id, 'project', opp ? `Attached to the project "${opp.title}"` : 'Detached from its project', actor);
  return { ok: true, code: 'call_attached' };
}

/**
 * Turns a call into a lead: a contact + project entered as a phone inquiry at the time the call arrived.
 * Only the caller's own number (from Twilio) and what you type is used. An email is optional. Nothing is emailed.
 */
export async function createLeadFromCall(db, callId, contactValue, projectValue, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  if (call.contact_id) return { ok: false, code: 'call_already_linked' };
  const res = await createManualProject(db, { contactValue, projectValue, channel: 'phone', receivedAtIso: call.started_at }, actor);
  if (!res.ok) return res;
  await db.prepare("UPDATE calls SET contact_id = ?, opportunity_id = ?, match_status = 'manual', updated_at = ? WHERE id = ?").bind(res.contactId, res.opportunityId, nowIso(), call.id).run();
  await addCallEvent(db, call.id, 'lead_created', 'A new lead was created from this call by you', actor);
  await refreshCall(db, call.id);
  return { ok: true, code: 'call_lead_created', opportunityId: res.opportunityId, contactId: res.contactId };
}

export async function setDisposition(db, callId, value, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  if (!['open', 'spam', 'irrelevant'].includes(value)) return { ok: false, code: 'bad_request' };
  if (call.disposition === value) return { ok: true, code: 'no_change' };
  await db.prepare('UPDATE calls SET disposition = ?, disposition_by = ?, disposition_at = ?, updated_at = ? WHERE id = ?').bind(value, actor, nowIso(), nowIso(), call.id).run();
  await addCallEvent(db, call.id, 'disposition', value === 'open' ? 'Marked as a real call again' : `Marked as ${value === 'spam' ? 'spam' : 'irrelevant'}`, actor);
  await refreshCall(db, call.id);
  return { ok: true, code: value === 'open' ? 'call_reopened' : 'call_marked' };
}

export async function saveCallNotes(db, callId, text, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  const body = clip(text, 5001);
  if (body.length > 5000) return { ok: false, code: 'note_long' };
  if (body === (call.notes || '')) return { ok: true, code: 'no_change' };
  await db.prepare('UPDATE calls SET notes = ?, notes_updated_at = ?, notes_updated_by = ?, updated_at = ? WHERE id = ?').bind(body || null, nowIso(), actor, nowIso(), call.id).run();
  await addCallEvent(db, call.id, 'notes', body ? 'Notes updated' : 'Notes cleared', actor);
  return { ok: true, code: 'call_notes_saved' };
}

/** Marks the callback handled ("done") or unnecessary ("not_needed"), or reopens it. Completes the linked task too. */
export async function setCallback(db, callId, action, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  const now = nowIso();
  if (action === 'reopen') {
    if (!call.callback_done_at) return { ok: true, code: 'no_change' };
    await db.prepare('UPDATE calls SET callback_result = NULL, callback_done_at = NULL, callback_done_by = NULL, updated_at = ? WHERE id = ?').bind(now, call.id).run();
    if (call.task_id) await db.prepare("UPDATE tasks SET status = 'open', completed_at = NULL, completed_by = NULL, updated_at = ? WHERE id = ? AND status = 'done'").bind(now, call.task_id).run();
    await addCallEvent(db, call.id, 'callback', 'Callback reopened', actor);
    return { ok: true, code: 'callback_reopened' };
  }
  if (!['done', 'not_needed'].includes(action)) return { ok: false, code: 'bad_request' };
  if (call.callback_done_at) return { ok: true, code: 'no_change' };
  const res = await db.prepare('UPDATE calls SET callback_result = ?, callback_done_at = ?, callback_done_by = ?, updated_at = ? WHERE id = ? AND callback_done_at IS NULL').bind(action, now, actor, now, call.id).run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  if (call.task_id) await db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ?, completion_note = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(now, actor, action === 'done' ? 'Callback recorded on the call' : 'No callback needed', now, call.task_id).run();
  await addCallEvent(db, call.id, 'callback', action === 'done' ? 'Callback marked done' : 'Marked as no callback needed', actor);
  return { ok: true, code: action === 'done' ? 'callback_done' : 'callback_not_needed' };
}

/** A callback task on the linked contact, when the automatic one was not created (or was cancelled). */
export async function createCallbackTask(db, callId, actor) {
  const call = await getCallById(db, callId);
  if (!call) return { ok: false, code: 'not_found' };
  if (!call.contact_id) return { ok: false, code: 'call_needs_contact' };
  if (call.task_id) {
    const t = await db.prepare('SELECT status FROM tasks WHERE id = ?').bind(call.task_id).first();
    if (t && t.status === 'open') return { ok: true, code: 'no_change' };
  }
  const now = nowIso();
  const taskId = `tk-call-${call.id}-${newId().slice(0, 8)}`;
  await db.batch([
    db
      .prepare("INSERT INTO tasks (id, contact_id, opportunity_id, type, title, due_on, priority, status, source, created_at, created_by, updated_at) VALUES (?, ?, ?, 'call', ?, ?, 'normal', 'open', 'call_callback', ?, ?, ?)")
      .bind(taskId, call.contact_id, call.opportunity_id, call.outcome === 'voicemail' ? 'Call back about the voicemail' : 'Call back', torontoToday(), now, actor, now),
    db.prepare('UPDATE calls SET task_id = ?, callback_result = NULL, callback_done_at = NULL, callback_done_by = NULL, updated_at = ? WHERE id = ?').bind(taskId, now, call.id),
  ]);
  await addCallEvent(db, call.id, 'callback_task', 'A callback task was created by you', actor);
  return { ok: true, code: 'callback_task_saved' };
}

