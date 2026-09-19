// All database access for the dashboard. Every query uses prepared statements
// with bound parameters. Multi-statement writes go through db.batch(), which
// D1 runs as a single atomic transaction, so a change and its activity-log
// entry are never half-applied.

import { STAGE_KEYS, STAGE_LABEL, PAGE_SIZE, EXPORT_LIMIT } from './constants.js';
import { torontoToday, isValidDateString, torontoInputToUtcIso, formatDateTime, formatDate } from './time.js';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- filters

const SOURCE_KEYS = ['homepage', 'contact', 'assessment'];
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function parseLeadFilters(url) {
  const p = url.searchParams;
  const pageNum = parseInt(p.get('page') || '1', 10);
  const contractor = p.get('contractor') || '';
  return {
    q: (p.get('q') || '').trim().slice(0, 100),
    status: STAGE_KEYS.includes(p.get('status')) ? p.get('status') : '',
    source: SOURCE_KEYS.includes(p.get('source')) ? p.get('source') : '',
    contractor: contractor === 'none' || ID_RE.test(contractor) ? contractor : '',
    archived: ['only', 'all'].includes(p.get('archived')) ? p.get('archived') : 'no',
    page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10000) : 1,
  };
}

function buildLeadWhere(f) {
  const where = [];
  const binds = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const parts = [
      "l.name LIKE ? ESCAPE '\\'",
      "l.email LIKE ? ESCAPE '\\'",
      "l.phone LIKE ? ESCAPE '\\'",
      "l.city LIKE ? ESCAPE '\\'",
      "l.renovation_type LIKE ? ESCAPE '\\'",
    ];
    binds.push(like, like, like, like, like);
    const digits = f.q.replace(/\D/g, '');
    if (digits.length >= 4) {
      // Match a phone typed without punctuation against "(416) 555-0100" etc.
      parts.push(
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(l.phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','') LIKE ?"
      );
      binds.push(`%${digits}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (f.status) {
    where.push('l.status = ?');
    binds.push(f.status);
  }
  if (f.source) {
    where.push('l.source = ?');
    binds.push(f.source);
  }
  if (f.contractor === 'none') where.push('l.contractor_id IS NULL');
  else if (f.contractor) {
    where.push('l.contractor_id = ?');
    binds.push(f.contractor);
  }
  if (f.archived === 'no') where.push('l.archived_at IS NULL');
  else if (f.archived === 'only') where.push('l.archived_at IS NOT NULL');
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

const LEAD_SELECT = `
  SELECT l.*, c.name AS contractor_name,
    (SELECT MIN(f.due_on) FROM follow_ups f WHERE f.lead_id = l.id AND f.completed_at IS NULL) AS next_follow_up
  FROM leads l LEFT JOIN contractors c ON c.id = l.contractor_id`;

export async function listLeads(db, filters) {
  const { sql, binds } = buildLeadWhere(filters);
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM leads l ${sql}`).bind(...binds).first()).n;
  const rows = await db
    .prepare(`${LEAD_SELECT} ${sql} ORDER BY l.created_at DESC, l.id LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE)
    .all();
  return { rows: rows.results || [], total, pageSize: PAGE_SIZE };
}

export async function exportLeads(db, filters) {
  const { sql, binds } = buildLeadWhere(filters);
  const rows = await db
    .prepare(`${LEAD_SELECT} ${sql} ORDER BY l.created_at DESC, l.id LIMIT ?`)
    .bind(...binds, EXPORT_LIMIT)
    .all();
  return rows.results || [];
}

// ---------------------------------------------------------------- overview

export async function overview(db) {
  const today = torontoToday();
  const now = nowIso();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const counts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM leads WHERE archived_at IS NULL AND status = 'new') AS new_leads,
        (SELECT COUNT(*) FROM leads WHERE archived_at IS NULL AND created_at >= ?) AS leads_7d,
        (SELECT COUNT(*) FROM follow_ups f JOIN leads l ON l.id = f.lead_id
           WHERE f.completed_at IS NULL AND f.due_on < ? AND l.archived_at IS NULL) AS overdue,
        (SELECT COUNT(*) FROM follow_ups f JOIN leads l ON l.id = f.lead_id
           WHERE f.completed_at IS NULL AND f.due_on = ? AND l.archived_at IS NULL) AS due_today,
        (SELECT COUNT(*) FROM leads WHERE archived_at IS NULL AND status = 'assessment_booked') AS booked,
        (SELECT COUNT(*) FROM leads WHERE archived_at IS NULL AND assessment_at >= ?) AS upcoming_assessments,
        (SELECT COUNT(*) FROM email_jobs WHERE status = 'failed') AS email_failed,
        (SELECT COUNT(*) FROM email_jobs WHERE status = 'pending' AND attempts > 0) AS email_retrying`
    )
    .bind(weekAgo, today, today, now)
    .first();
  const recent = await db.prepare(`${LEAD_SELECT} WHERE l.archived_at IS NULL ORDER BY l.created_at DESC LIMIT 5`).all();
  const assessments = await db
    .prepare(`${LEAD_SELECT} WHERE l.archived_at IS NULL AND l.assessment_at >= ? ORDER BY l.assessment_at ASC LIMIT 5`)
    .bind(now)
    .all();
  return { counts, recent: recent.results || [], assessments: assessments.results || [], today };
}

// ---------------------------------------------------------------- lead detail

export async function getLead(db, id) {
  if (!ID_RE.test(id)) return null;
  return db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).bind(id).first();
}

export async function leadDetail(db, id) {
  const lead = await getLead(db, id);
  if (!lead) return null;
  const [notes, activity, followUps, jobs] = await Promise.all([
    db.prepare('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM lead_activity WHERE lead_id = ? ORDER BY created_at DESC, id').bind(id).all(),
    db.prepare('SELECT * FROM follow_ups WHERE lead_id = ? ORDER BY completed_at IS NOT NULL, due_on ASC').bind(id).all(),
    db.prepare('SELECT * FROM email_jobs WHERE lead_id = ? ORDER BY email_type').bind(id).all(),
  ]);
  return {
    lead,
    notes: notes.results || [],
    activity: activity.results || [],
    followUps: followUps.results || [],
    jobs: jobs.results || [],
  };
}

// ---------------------------------------------------------------- lead actions
// Each returns { ok: true } or { ok: false, code } where `code` maps to a fixed
// message in views.js (never reflected user input).

function activityStmt(db, leadId, type, summary, actor) {
  return db
    .prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), leadId, type, summary, actor, nowIso());
}
const touchStmt = (db, leadId) => db.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').bind(nowIso(), leadId);

export async function setStage(db, leadId, stage, actor) {
  if (!STAGE_KEYS.includes(stage)) return { ok: false, code: 'bad_stage' };
  const lead = await getLead(db, leadId);
  if (!lead) return { ok: false, code: 'not_found' };
  if (lead.status === stage) return { ok: true, code: 'no_change' };
  const from = STAGE_LABEL[lead.status] || lead.status;
  await db.batch([
    db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').bind(stage, nowIso(), leadId),
    activityStmt(db, leadId, 'stage_changed', `Stage changed from ${from} to ${STAGE_LABEL[stage]}`, actor),
  ]);
  return { ok: true, code: 'stage_saved' };
}

export async function addNote(db, leadId, body, actor) {
  const text = String(body || '').trim();
  if (!text) return { ok: false, code: 'note_empty' };
  if (text.length > 5000) return { ok: false, code: 'note_long' };
  if (!(await getLead(db, leadId))) return { ok: false, code: 'not_found' };
  await db.batch([
    db.prepare('INSERT INTO lead_notes (id, lead_id, body, author_email, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), leadId, text, actor, nowIso()),
    activityStmt(db, leadId, 'note_added', 'Note added', actor),
    touchStmt(db, leadId),
  ]);
  return { ok: true, code: 'note_saved' };
}

export async function assignContractor(db, leadId, contractorId, actor) {
  const lead = await getLead(db, leadId);
  if (!lead) return { ok: false, code: 'not_found' };
  const target = String(contractorId || '');
  if (!target) {
    if (!lead.contractor_id) return { ok: true, code: 'no_change' };
    await db.batch([
      db.prepare('UPDATE leads SET contractor_id = NULL, updated_at = ? WHERE id = ?').bind(nowIso(), leadId),
      activityStmt(db, leadId, 'contractor_unassigned', `Contractor unassigned (was ${lead.contractor_name || 'unknown'})`, actor),
    ]);
    return { ok: true, code: 'contractor_saved' };
  }
  if (!ID_RE.test(target)) return { ok: false, code: 'bad_contractor' };
  const contractor = await db.prepare('SELECT id, name FROM contractors WHERE id = ? AND archived_at IS NULL').bind(target).first();
  if (!contractor) return { ok: false, code: 'bad_contractor' };
  if (lead.contractor_id === contractor.id) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare('UPDATE leads SET contractor_id = ?, updated_at = ? WHERE id = ?').bind(contractor.id, nowIso(), leadId),
    activityStmt(db, leadId, 'contractor_assigned', `Contractor assigned: ${contractor.name} (internal only — nothing was sent to them)`, actor),
  ]);
  return { ok: true, code: 'contractor_saved' };
}

export async function addFollowUp(db, leadId, dueOn, note, actor) {
  if (!isValidDateString(dueOn)) return { ok: false, code: 'bad_date' };
  const text = String(note || '').trim();
  if (text.length > 500) return { ok: false, code: 'followup_note_long' };
  if (!(await getLead(db, leadId))) return { ok: false, code: 'not_found' };
  await db.batch([
    db.prepare('INSERT INTO follow_ups (id, lead_id, due_on, note, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), leadId, dueOn, text || null, nowIso()),
    activityStmt(db, leadId, 'follow_up_set', `Follow-up set for ${formatDate(dueOn)}`, actor),
    touchStmt(db, leadId),
  ]);
  return { ok: true, code: 'followup_saved' };
}

export async function completeFollowUp(db, leadId, followUpId, actor) {
  if (!ID_RE.test(followUpId)) return { ok: false, code: 'not_found' };
  const fu = await db.prepare('SELECT * FROM follow_ups WHERE id = ? AND lead_id = ?').bind(followUpId, leadId).first();
  if (!fu) return { ok: false, code: 'not_found' };
  // Conditional update: a double click (or a second tab) completes it once only.
  const res = await db.prepare('UPDATE follow_ups SET completed_at = ? WHERE id = ? AND completed_at IS NULL').bind(nowIso(), followUpId).run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  await db.batch([
    activityStmt(db, leadId, 'follow_up_completed', `Follow-up completed (was due ${formatDate(fu.due_on)})`, actor),
    touchStmt(db, leadId),
  ]);
  return { ok: true, code: 'followup_done' };
}

export async function setAssessment(db, leadId, localValue, actor) {
  const lead = await getLead(db, leadId);
  if (!lead) return { ok: false, code: 'not_found' };
  const value = String(localValue || '').trim();
  if (!value) {
    if (!lead.assessment_at) return { ok: true, code: 'no_change' };
    await db.batch([
      db.prepare('UPDATE leads SET assessment_at = NULL, updated_at = ? WHERE id = ?').bind(nowIso(), leadId),
      activityStmt(db, leadId, 'assessment_cleared', 'Assessment date cleared', actor),
    ]);
    return { ok: true, code: 'assessment_saved' };
  }
  const iso = torontoInputToUtcIso(value);
  if (!iso) return { ok: false, code: 'bad_datetime' };
  if (iso === lead.assessment_at) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare('UPDATE leads SET assessment_at = ?, updated_at = ? WHERE id = ?').bind(iso, nowIso(), leadId),
    activityStmt(db, leadId, 'assessment_set', `Assessment recorded for ${formatDateTime(iso)} (Toronto time)`, actor),
  ]);
  return { ok: true, code: 'assessment_saved' };
}

export async function setArchived(db, leadId, archive, actor) {
  const lead = await getLead(db, leadId);
  if (!lead) return { ok: false, code: 'not_found' };
  if (archive === Boolean(lead.archived_at)) return { ok: true, code: 'no_change' };
  await db.batch([
    db.prepare('UPDATE leads SET archived_at = ?, updated_at = ? WHERE id = ?').bind(archive ? nowIso() : null, nowIso(), leadId),
    activityStmt(db, leadId, archive ? 'archived' : 'unarchived', archive ? 'Lead archived' : 'Lead restored from archive', actor),
  ]);
  return { ok: true, code: archive ? 'archived' : 'unarchived' };
}

// ---------------------------------------------------------------- follow-ups list

export async function listFollowUps(db) {
  const today = torontoToday();
  const base = `SELECT f.*, l.name AS lead_name, l.status AS lead_status, l.archived_at AS lead_archived_at
                FROM follow_ups f JOIN leads l ON l.id = f.lead_id`;
  const [overdue, dueToday, upcoming, completed] = await Promise.all([
    db.prepare(`${base} WHERE f.completed_at IS NULL AND f.due_on < ? AND l.archived_at IS NULL ORDER BY f.due_on ASC`).bind(today).all(),
    db.prepare(`${base} WHERE f.completed_at IS NULL AND f.due_on = ? AND l.archived_at IS NULL ORDER BY f.created_at ASC`).bind(today).all(),
    db.prepare(`${base} WHERE f.completed_at IS NULL AND f.due_on > ? AND l.archived_at IS NULL ORDER BY f.due_on ASC LIMIT 200`).bind(today).all(),
    db.prepare(`${base} WHERE f.completed_at IS NOT NULL ORDER BY f.completed_at DESC LIMIT 50`).all(),
  ]);
  return {
    today,
    overdue: overdue.results || [],
    dueToday: dueToday.results || [],
    upcoming: upcoming.results || [],
    completed: completed.results || [],
  };
}

// ---------------------------------------------------------------- contractors

const clip = (v, max) => String(v ?? '').trim().slice(0, max);

export function readContractorForm(form) {
  const c = {
    name: clip(form.get('name'), 200),
    company: clip(form.get('company'), 200),
    service_types: clip(form.get('service_types'), 500),
    service_area: clip(form.get('service_area'), 500),
    email: clip(form.get('email'), 254),
    phone: clip(form.get('phone'), 40),
    notes: clip(form.get('notes'), 5000),
  };
  if (!c.name) return { ok: false, code: 'contractor_name' };
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return { ok: false, code: 'contractor_email' };
  return { ok: true, value: c };
}

export async function listContractors(db, includeArchived) {
  const rows = await db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM leads l WHERE l.contractor_id = c.id AND l.archived_at IS NULL) AS active_leads
       FROM contractors c ${includeArchived ? '' : 'WHERE c.archived_at IS NULL'} ORDER BY c.archived_at IS NOT NULL, c.name COLLATE NOCASE`
    )
    .all();
  return rows.results || [];
}

export async function getContractor(db, id) {
  if (!ID_RE.test(id)) return null;
  return db.prepare('SELECT * FROM contractors WHERE id = ?').bind(id).first();
}

export async function createContractor(db, c) {
  const id = newId();
  const now = nowIso();
  await db
    .prepare('INSERT INTO contractors (id, name, company, service_types, service_area, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.name, c.company || null, c.service_types || null, c.service_area || null, c.email || null, c.phone || null, c.notes || null, now, now)
    .run();
  return id;
}

export async function updateContractor(db, id, c) {
  const res = await db
    .prepare('UPDATE contractors SET name = ?, company = ?, service_types = ?, service_area = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(c.name, c.company || null, c.service_types || null, c.service_area || null, c.email || null, c.phone || null, c.notes || null, nowIso(), id)
    .run();
  return Boolean(res.meta && res.meta.changes);
}

export async function setContractorArchived(db, id, archive) {
  const res = await db
    .prepare('UPDATE contractors SET archived_at = ?, updated_at = ? WHERE id = ?')
    .bind(archive ? nowIso() : null, nowIso(), id)
    .run();
  return Boolean(res.meta && res.meta.changes);
}

// ---------------------------------------------------------------- email activity

export function parseEmailFilters(url) {
  const p = url.searchParams;
  const status = ['failed', 'pending', 'sending', 'sent'].includes(p.get('status')) ? p.get('status') : '';
  const pageNum = parseInt(p.get('page') || '1', 10);
  return { status, page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10000) : 1 };
}

export async function listEmailJobs(db, filters) {
  const where = filters.status ? 'WHERE j.status = ?' : '';
  const binds = filters.status ? [filters.status] : [];
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM email_jobs j ${where}`).bind(...binds).first()).n;
  const rows = await db
    .prepare(
      `SELECT j.*, l.name AS lead_name FROM email_jobs j JOIN leads l ON l.id = j.lead_id ${where}
       ORDER BY (j.status = 'failed') DESC, j.updated_at DESC, j.id LIMIT ? OFFSET ?`
    )
    .bind(...binds, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE)
    .all();
  const summary = await db.prepare('SELECT status, COUNT(*) AS n FROM email_jobs GROUP BY status').all();
  return { rows: rows.results || [], total, pageSize: PAGE_SIZE, summary: Object.fromEntries((summary.results || []).map((r) => [r.status, r.n])) };
}

/**
 * Re-queues ONE failed email job for the EXISTING retry sweep in renorise-forms
 * (the cron that runs every 15 minutes). This function never sends email and
 * adds no scheduler of its own. It flips the job from 'failed' back to
 * 'pending' and allows exactly one more attempt. The sweep then sends it with
 * the job's original stable Idempotency-Key, and its optimistic claim
 * (status + attempts guard) means it can only ever be picked up once.
 *
 * The UPDATE is conditional on status = 'failed', so double-clicking, a second
 * tab, or a replayed request changes nothing after the first one.
 */
export async function requeueFailedEmailJob(db, jobId, actor) {
  if (!ID_RE.test(jobId)) return { ok: false, code: 'not_found' };
  const job = await db.prepare('SELECT * FROM email_jobs WHERE id = ?').bind(jobId).first();
  if (!job) return { ok: false, code: 'not_found' };
  if (job.status !== 'failed') return { ok: false, code: job.status === 'pending' ? 'retry_already_queued' : 'retry_not_eligible' };

  const column = job.email_type === 'customer' ? 'customer_email_status' : 'internal_email_status';
  const res = await db
    .prepare("UPDATE email_jobs SET status = 'pending', max_attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'failed'")
    .bind(nowIso(), jobId)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: false, code: 'retry_already_queued' };
  // Best-effort bookkeeping; the sweep re-writes these when it finishes.
  await db.batch([
    db.prepare(`UPDATE leads SET ${column} = 'pending' WHERE id = ?`).bind(job.lead_id),
    activityStmt(db, job.lead_id, 'email_retry_queued', `${job.email_type === 'customer' ? 'Customer confirmation' : 'Internal notification'} email re-queued for retry`, actor),
  ]);
  return { ok: true, code: 'retry_queued' };
}
