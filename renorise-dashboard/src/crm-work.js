// CRM data layer, part 2: tasks, logged calls, and appointments.
//
//   * Tasks EXTEND the dashboard's Follow-ups: the earlier follow-ups were copied
//     into `tasks` with the same ids (see crm-db.js ensureCrmRecords).
//   * A call exists only because a person logged it. A tapped phone link or
//     mail link proves nothing, so nothing here is inferred from a click.
//   * Recording an appointment stops the project's automatic follow-up emails
//     (a booked person is no longer an "unbooked lead"). Cancelling or
//     rescheduling never restarts them; restarting is always an explicit review.
//
// Nothing here sends a message.

import { stopEnrollmentsForOpportunity } from '../../renorise-shared/followup-db.js';
import { torontoToday, isValidDateString, torontoInputToUtcIso, formatDateTime } from './time.js';
import {
  TASK_TYPES,
  TASK_TYPE_LABEL,
  PRIORITIES,
  CALL_OUTCOMES,
  CALL_DIRECTIONS,
  APPOINTMENT_KINDS,
  APPOINTMENT_KIND_LABEL,
  STAGES,
  CLOSED_STAGES,
} from './crm-constants.js';
import { getOpportunity, getContact, setStage, eventStmt, newId, nowIso, ID_RE, clip } from './crm-db.js';

const keys = (list) => list.map(([k]) => k);
const orNull = (v) => (v === '' || v === undefined || v === null ? null : v);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- tasks

/** allowedAssignees: the signed-in staff emails (ADMIN_EMAILS). With one staff member there is nothing to choose. */
export function readTaskForm(form, allowedAssignees = []) {
  const type = clip(form.get('type'), 20) || 'general';
  const dueOn = clip(form.get('due_on'), 10);
  const dueTime = clip(form.get('due_time'), 5);
  const priority = clip(form.get('priority'), 10) || 'normal';
  const assigned = clip(form.get('assigned_to'), 254).toLowerCase();
  const title = clip(form.get('title') ?? form.get('note'), 300);
  if (!keys(TASK_TYPES).includes(type) || !keys(PRIORITIES).includes(priority)) return { ok: false, code: 'bad_request' };
  if (!isValidDateString(dueOn)) return { ok: false, code: 'bad_date' };
  let dueAt = null;
  if (dueTime) {
    if (!TIME_RE.test(dueTime)) return { ok: false, code: 'bad_datetime' };
    dueAt = torontoInputToUtcIso(`${dueOn}T${dueTime}`);
    if (!dueAt) return { ok: false, code: 'bad_datetime' };
  }
  if (assigned && !allowedAssignees.map((e) => e.toLowerCase()).includes(assigned)) return { ok: false, code: 'bad_assignee' };
  return { ok: true, value: { type, title: title || TASK_TYPE_LABEL[type], due_on: dueOn, due_at: dueAt, priority, assigned_to: assigned || null } };
}

/**
 * Creates a task linked to a project, a contact, a contractor, or several. An identical
 * OPEN task (same links, type, date and title) is not created twice, so a double click
 * or a resubmitted form changes nothing.
 */
export async function createTask(db, links, value, actor) {
  let contactId = links.contactId || null;
  let oppId = links.opportunityId || null;
  let contractorId = links.contractorId || null;
  if (oppId) {
    const opp = await getOpportunity(db, oppId);
    if (!opp) return { ok: false, code: 'not_found' };
    oppId = opp.id;
    contactId = opp.contact_id;
  } else if (contactId) {
    if (!(await getContact(db, contactId))) return { ok: false, code: 'not_found' };
  }
  if (contractorId) {
    if (!ID_RE.test(contractorId) || !(await db.prepare('SELECT 1 AS x FROM contractors WHERE id = ?').bind(contractorId).first())) return { ok: false, code: 'not_found' };
  }
  if (!contactId && !oppId && !contractorId) return { ok: false, code: 'bad_request' };
  const id = newId();
  const now = nowIso();
  const res = await db
    .prepare(
      `INSERT INTO tasks (id, contact_id, opportunity_id, contractor_id, type, title, due_on, due_at, priority, assigned_to, status, source, created_at, created_by, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'manual', ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM tasks WHERE status = 'open' AND COALESCE(contact_id, '') = ? AND COALESCE(opportunity_id, '') = ? AND COALESCE(contractor_id, '') = ?
           AND type = ? AND due_on = ? AND title = ?
       )`
    )
    .bind(id, contactId, oppId, contractorId, value.type, value.title, value.due_on, value.due_at, value.priority, value.assigned_to, now, actor, now, contactId || '', oppId || '', contractorId || '', value.type, value.due_on, value.title)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  if (oppId) await db.prepare('UPDATE opportunities SET updated_at = ? WHERE id = ?').bind(now, oppId).run();
  return { ok: true, code: 'task_saved', id };
}

export async function getTask(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
}

export async function completeTask(db, taskId, note, actor) {
  const task = await getTask(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  const text = clip(note, 501);
  if (text.length > 500) return { ok: false, code: 'completion_note_long' };
  const now = nowIso();
  // Conditional update: a double click (or a second tab) completes a task once only.
  const res = await db
    .prepare("UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ?, completion_note = ?, updated_at = ? WHERE id = ? AND status = 'open'")
    .bind(now, actor, orNull(text), now, taskId)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  if (task.opportunity_id) await db.prepare('UPDATE opportunities SET updated_at = ? WHERE id = ?').bind(now, task.opportunity_id).run();
  // Finishing a callback task also closes the callback on the phone call it came from.
  if (task.source === 'call_callback') {
    await db.prepare("UPDATE calls SET callback_result = 'done', callback_done_at = ?, callback_done_by = ?, updated_at = ? WHERE task_id = ? AND callback_done_at IS NULL").bind(now, actor, now, task.id).run();
  }
  return { ok: true, code: 'task_done' };
}

export async function cancelTask(db, taskId, actor) {
  const task = await getTask(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  const now = nowIso();
  const res = await db.prepare("UPDATE tasks SET status = 'cancelled', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(now, actor, now, taskId).run();
  return { ok: true, code: res.meta && res.meta.changes ? 'task_cancelled' : 'no_change' };
}

export async function rescheduleTask(db, taskId, dueOn, actor) {
  const task = await getTask(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  if (!isValidDateString(dueOn)) return { ok: false, code: 'bad_date' };
  if (task.status !== 'open') return { ok: false, code: 'task_not_open' };
  if (task.due_on === dueOn && !task.due_at) return { ok: true, code: 'no_change' };
  await db.prepare('UPDATE tasks SET due_on = ?, due_at = NULL, updated_at = ? WHERE id = ? AND status = ?').bind(dueOn, nowIso(), taskId, 'open').run();
  return { ok: true, code: 'task_rescheduled' };
}

export function parseTaskFilters(url) {
  const p = url.searchParams;
  return {
    type: keys(TASK_TYPES).includes(p.get('type')) ? p.get('type') : '',
    assigned: (p.get('assigned') || '').slice(0, 254),
    priority: keys(PRIORITIES).includes(p.get('priority')) ? p.get('priority') : '',
  };
}

const TASK_SELECT = `
  SELECT t.*, c.display_name AS contact_name, o.title AS project_title, o.stage AS project_stage, o.archived_at AS project_archived_at, o.is_test AS project_is_test, k.name AS contractor_name
  FROM tasks t
  LEFT JOIN contacts c ON c.id = t.contact_id
  LEFT JOIN opportunities o ON o.id = t.opportunity_id
  LEFT JOIN contractors k ON k.id = t.contractor_id`;

/** Overdue / today / upcoming / recently finished. Tasks on archived projects are not listed as open. */
export async function listTasks(db, filters = {}, today = torontoToday()) {
  const where = [];
  const binds = [];
  if (filters.type) { where.push('t.type = ?'); binds.push(filters.type); }
  if (filters.priority) { where.push('t.priority = ?'); binds.push(filters.priority); }
  if (filters.assigned === 'unassigned') where.push('t.assigned_to IS NULL');
  else if (filters.assigned) { where.push('t.assigned_to = ?'); binds.push(filters.assigned.toLowerCase()); }
  const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
  const open = "t.status = 'open' AND (o.id IS NULL OR o.archived_at IS NULL)";
  const order = "ORDER BY t.due_on ASC, COALESCE(t.due_at, ''), CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.created_at";
  const [overdue, dueToday, upcoming, done] = await Promise.all([
    db.prepare(`${TASK_SELECT} WHERE ${open} AND t.due_on < ?${extra} ${order}`).bind(today, ...binds).all(),
    db.prepare(`${TASK_SELECT} WHERE ${open} AND t.due_on = ?${extra} ${order}`).bind(today, ...binds).all(),
    db.prepare(`${TASK_SELECT} WHERE ${open} AND t.due_on > ?${extra} ${order} LIMIT 200`).bind(today, ...binds).all(),
    db.prepare(`${TASK_SELECT} WHERE t.status IN ('done', 'cancelled')${extra} ORDER BY t.completed_at DESC LIMIT 50`).bind(...binds).all(),
  ]);
  return { today, overdue: overdue.results || [], dueToday: dueToday.results || [], upcoming: upcoming.results || [], done: done.results || [] };
}

export async function tasksFor(db, { opportunityId, contactId, contractorId }) {
  const col = opportunityId ? 't.opportunity_id' : contractorId ? 't.contractor_id' : 't.contact_id';
  const id = opportunityId || contractorId || contactId;
  return ((await db.prepare(`${TASK_SELECT} WHERE ${col} = ? ORDER BY t.status != 'open', t.due_on ASC, t.created_at`).bind(id).all()).results) || [];
}

// ---------------------------------------------------------------- calls

const STAGE_ORDER = STAGES.map(([k]) => k);

/**
 * Logs a call a person made or took. Optionally records the next action as a task
 * and (only when asked, and only if the project has not moved past it yet) moves a
 * new inquiry to Contact attempted / In conversation. Nothing is inferred from a click.
 */
export async function logCall(db, links, input, actor) {
  let opp = null;
  let contact = null;
  if (links.opportunityId) {
    opp = await getOpportunity(db, links.opportunityId);
    if (!opp) return { ok: false, code: 'not_found' };
    contact = await getContact(db, opp.contact_id);
  } else {
    contact = await getContact(db, links.contactId);
  }
  if (!contact) return { ok: false, code: 'not_found' };
  const outcome = clip(input.outcome, 20);
  const direction = clip(input.direction, 10) || 'outbound';
  if (!keys(CALL_OUTCOMES).includes(outcome) || !keys(CALL_DIRECTIONS).includes(direction)) return { ok: false, code: 'bad_request' };
  let occurredAt = nowIso();
  if (input.occurredLocal) {
    occurredAt = torontoInputToUtcIso(String(input.occurredLocal));
    if (!occurredAt) return { ok: false, code: 'bad_datetime' };
    if (Date.parse(occurredAt) > Date.now() + 5 * 60 * 1000) return { ok: false, code: 'call_future' };
  }
  const summary = clip(input.summary, 2001);
  if (summary.length > 2000) return { ok: false, code: 'call_summary_long' };

  const nextDue = clip(input.nextDue, 10);
  const nextTitle = clip(input.nextTitle, 300);
  if ((nextDue || nextTitle) && !isValidDateString(nextDue)) return { ok: false, code: 'bad_date' };

  const now = nowIso();
  const callId = newId();
  const taskId = nextDue ? newId() : null;
  const stmts = [];
  if (taskId) {
    stmts.push(
      db
        .prepare("INSERT INTO tasks (id, contact_id, opportunity_id, type, title, due_on, priority, status, source, created_at, created_by, updated_at) VALUES (?, ?, ?, 'call', ?, ?, 'normal', 'open', 'call_log', ?, ?, ?)")
        .bind(taskId, contact.id, opp ? opp.id : null, nextTitle || 'Call back', nextDue, now, actor, now)
    );
  }
  stmts.push(
    db
      .prepare('INSERT INTO call_logs (id, contact_id, opportunity_id, occurred_at, direction, outcome, summary, task_id, source, logged_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(callId, contact.id, opp ? opp.id : null, occurredAt, direction, outcome, orNull(summary), taskId, 'manual', actor, now)
  );
  if (opp) {
    stmts.push(
      db
        .prepare(
          `UPDATE opportunities SET first_contact_at = CASE WHEN first_contact_at IS NULL OR first_contact_at > ? THEN ? ELSE first_contact_at END,
             last_contact_at = CASE WHEN last_contact_at IS NULL OR last_contact_at < ? THEN ? ELSE last_contact_at END, updated_at = ? WHERE id = ?`
        )
        .bind(occurredAt, occurredAt, occurredAt, occurredAt, now, opp.id)
    );
  }
  await db.batch(stmts);

  if (opp && input.moveStage === true && !opp.archived_at) {
    const target = outcome === 'connected' ? 'in_conversation' : 'contact_attempted';
    const idx = STAGE_ORDER.indexOf(opp.stage);
    if (opp.stage && idx >= 0 && idx < STAGE_ORDER.indexOf(target) && !CLOSED_STAGES.includes(opp.stage) && opp.stage !== 'on_hold') {
      await setStage(db, opp.id, { stage: target, note: null }, actor);
    }
  }
  return { ok: true, code: 'call_logged' };
}

export async function callsFor(db, { opportunityId, contactId }) {
  const col = opportunityId ? 'opportunity_id' : 'contact_id';
  return ((await db.prepare(`SELECT * FROM call_logs WHERE ${col} = ? ORDER BY occurred_at DESC`).bind(opportunityId || contactId).all()).results) || [];
}

// ---------------------------------------------------------------- appointments

const mirrorAssessmentStmt = (db, oppId) =>
  db
    .prepare("UPDATE leads SET assessment_at = (SELECT MAX(starts_at) FROM appointments WHERE opportunity_id = ? AND status = 'scheduled'), updated_at = ? WHERE opportunity_id = ?")
    .bind(oppId, nowIso(), oppId);

export async function addAppointment(db, oppId, input, actor) {
  const opp = await getOpportunity(db, oppId);
  if (!opp) return { ok: false, code: 'not_found' };
  const kind = clip(input.kind, 30);
  if (!keys(APPOINTMENT_KINDS).includes(kind)) return { ok: false, code: 'bad_request' };
  const startsAt = torontoInputToUtcIso(String(input.startsLocal || ''));
  if (!startsAt) return { ok: false, code: 'bad_datetime' };
  const notes = clip(input.notes, 501);
  if (notes.length > 500) return { ok: false, code: 'appointment_notes_long' };
  const now = nowIso();
  const id = newId();
  await db.batch([
    db
      .prepare("INSERT INTO appointments (id, opportunity_id, contact_id, kind, starts_at, status, source, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'scheduled', 'manual', ?, ?, ?, ?)")
      .bind(id, opp.id, opp.contact_id, kind, startsAt, orNull(notes), actor, now, now),
    mirrorAssessmentStmt(db, opp.id),
    eventStmt(db, {
      contactId: opp.contact_id,
      opportunityId: opp.id,
      kind: 'appointment_scheduled',
      summary: `${APPOINTMENT_KIND_LABEL[kind]} recorded for ${formatDateTime(startsAt)} (Toronto time)`,
      detail: { appointment_id: id, kind, starts_at: startsAt },
      actor,
    }),
    db.prepare('UPDATE opportunities SET updated_at = ? WHERE id = ?').bind(now, opp.id),
  ]);
  // A booked person is no longer an unbooked lead: the automatic follow-up emails for THIS project end.
  await stopEnrollmentsForOpportunity(db, opp.id, 'booked', actor);
  if (input.moveStage === true && !opp.archived_at && opp.stage && opp.stage !== 'on_hold' && !CLOSED_STAGES.includes(opp.stage) && STAGE_ORDER.indexOf(opp.stage) < STAGE_ORDER.indexOf('consultation_booked')) {
    await setStage(db, opp.id, { stage: 'consultation_booked', note: null }, actor);
  }
  return { ok: true, code: 'appointment_saved', id };
}

export async function getAppointment(db, id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return db.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
}

export async function setAppointmentStatus(db, apptId, status, actor) {
  const a = await getAppointment(db, apptId);
  if (!a) return { ok: false, code: 'not_found' };
  if (!['completed', 'cancelled', 'no_show'].includes(status)) return { ok: false, code: 'bad_request' };
  if (a.status !== 'scheduled') return { ok: true, code: 'no_change' };
  const now = nowIso();
  const label = { completed: 'completed', cancelled: 'cancelled', no_show: 'marked as a no-show' }[status];
  const res = await db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(status, now, a.id).run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  await db.batch([
    mirrorAssessmentStmt(db, a.opportunity_id),
    eventStmt(db, {
      contactId: a.contact_id,
      opportunityId: a.opportunity_id,
      kind: `appointment_${status}`,
      summary: `${APPOINTMENT_KIND_LABEL[a.kind]} on ${formatDateTime(a.starts_at)} ${label}.${status === 'cancelled' ? ' Follow-up emails are not restarted automatically.' : ''}`,
      detail: { appointment_id: a.id },
      actor,
    }),
  ]);
  return { ok: true, code: `appointment_${status}` };
}

export async function rescheduleAppointment(db, apptId, startsLocal, actor) {
  const a = await getAppointment(db, apptId);
  if (!a) return { ok: false, code: 'not_found' };
  if (a.status !== 'scheduled') return { ok: false, code: 'appointment_not_scheduled' };
  const startsAt = torontoInputToUtcIso(String(startsLocal || ''));
  if (!startsAt) return { ok: false, code: 'bad_datetime' };
  if (startsAt === a.starts_at) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare("UPDATE appointments SET starts_at = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(startsAt, nowIso(), a.id),
    mirrorAssessmentStmt(db, a.opportunity_id),
    eventStmt(db, {
      contactId: a.contact_id,
      opportunityId: a.opportunity_id,
      kind: 'appointment_rescheduled',
      summary: `${APPOINTMENT_KIND_LABEL[a.kind]} rescheduled from ${formatDateTime(a.starts_at)} to ${formatDateTime(startsAt)} (Toronto time)`,
      detail: { appointment_id: a.id, from: a.starts_at, to: startsAt },
      actor,
    }),
  ]);
  return { ok: true, code: 'appointment_rescheduled' };
}

export async function appointmentsFor(db, opportunityId) {
  return ((await db.prepare('SELECT * FROM appointments WHERE opportunity_id = ? ORDER BY starts_at DESC').bind(opportunityId).all()).results) || [];
}
