// CRM read side: the lead / project list and pipeline, the contacts list and
// profile, the unified timeline, the Today view, and the summary counts.
//
// Read-only. Every query is a prepared statement; searched text is escaped for LIKE.
// A timeline row always says WHO or WHAT recorded it:
//   manual   - a person on the team typed it in
//   system   - RenoRise recorded it automatically (a form arrived, a job ran)
//   provider - an outside service (Resend) reported it; delivery is only ever
//              called "confirmed" when such a report exists. "Accepted by Resend"
//              means Resend took the message, NOT that it reached an inbox.

import { PAGE_SIZE, EXPORT_LIMIT } from './constants.js';
import { torontoToday, torontoDateHourToUtcIso, addDays } from './time.js';
import {
  STAGE_KEYS,
  SOURCE_KEYS,
  SOURCE_LABEL,
  QUALIFICATION,
  PRIORITIES,
  CALL_OUTCOME_LABEL,
  TASK_TYPE_LABEL,
} from './crm-constants.js';
import { ID_RE, loadCrmSettings } from './crm-db.js';

const keys = (list) => list.map(([k]) => k);
const likeOf = (s) => `%${String(s).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
const PHONE_STRIP = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(%s,' ',''),'-',''),'(',''),')',''),'.',''),'+','')";

// ---------------------------------------------------------------- summary panel

export async function summaryCounts(db, today = torontoToday()) {
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM opportunities WHERE archived_at IS NULL AND is_test = 0) AS total,
        (SELECT COUNT(*) FROM opportunities WHERE archived_at IS NULL AND is_test = 0
           AND (stage_needs_review = 1 OR stage IN ('contact_attempted','in_conversation','qualified','consultation_booked','contractor_matching','referred','quote_pending','quote_sent'))) AS in_progress,
        (SELECT COUNT(*) FROM tasks t LEFT JOIN opportunities o ON o.id = t.opportunity_id
           WHERE t.status = 'open' AND (o.id IS NULL OR (o.archived_at IS NULL AND o.is_test = 0))) AS pending_tasks,
        (SELECT COUNT(*) FROM tasks t LEFT JOIN opportunities o ON o.id = t.opportunity_id
           WHERE t.status = 'open' AND t.due_on < ? AND (o.id IS NULL OR (o.archived_at IS NULL AND o.is_test = 0))) AS overdue`
    )
    .bind(today)
    .first();
}

// ---------------------------------------------------------------- leads (projects): list, pipeline, export

export function parseLeadFilters(url) {
  const p = url.searchParams;
  const pageNum = parseInt(p.get('page') || '1', 10);
  const contractor = p.get('contractor') || '';
  const stage = p.get('status') || '';
  return {
    q: (p.get('q') || '').trim().slice(0, 100),
    status: STAGE_KEYS.includes(stage) || stage === 'needs_review' ? stage : '',
    qualification: keys(QUALIFICATION).includes(p.get('qualification')) ? p.get('qualification') : '',
    priority: keys(PRIORITIES).includes(p.get('priority')) ? p.get('priority') : '',
    source: SOURCE_KEYS.includes(p.get('source')) ? p.get('source') : '',
    contractor: contractor === 'none' || ID_RE.test(contractor) ? contractor : '',
    archived: ['only', 'all'].includes(p.get('archived')) ? p.get('archived') : 'no',
    test: ['only', 'all'].includes(p.get('test')) ? p.get('test') : 'hide',
    view: p.get('view') === 'pipeline' ? 'pipeline' : 'table',
    page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10000) : 1,
  };
}

function buildWhere(f, { skipStage = false } = {}) {
  const where = [];
  const binds = [];
  if (f.q) {
    const like = likeOf(f.q);
    const parts = [
      "c.display_name LIKE ? ESCAPE '\\'",
      "c.email LIKE ? ESCAPE '\\'",
      "c.phone LIKE ? ESCAPE '\\'",
      "c.tags LIKE ? ESCAPE '\\'",
      "o.title LIKE ? ESCAPE '\\'",
      "o.renovation_type LIKE ? ESCAPE '\\'",
      "o.property_city LIKE ? ESCAPE '\\'",
      "o.property_postal_code LIKE ? ESCAPE '\\'",
      "EXISTS (SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = c.id AND ci.value LIKE ? ESCAPE '\\')",
    ];
    binds.push(like, like, like, like, like, like, like, like, like);
    const digits = f.q.replace(/\D/g, '');
    if (digits.length >= 4) {
      parts.push(`${PHONE_STRIP.replace('%s', 'c.phone')} LIKE ?`);
      binds.push(`%${digits}%`);
      parts.push(`EXISTS (SELECT 1 FROM contact_identifiers ci WHERE ci.contact_id = c.id AND ci.kind = 'phone' AND ci.norm LIKE ?)`);
      binds.push(`%${digits}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (!skipStage && f.status) {
    if (f.status === 'needs_review') where.push('o.stage_needs_review = 1');
    else {
      where.push('o.stage = ?');
      binds.push(f.status);
    }
  }
  if (f.qualification) { where.push('o.qualification = ?'); binds.push(f.qualification); }
  if (f.priority) { where.push('o.priority = ?'); binds.push(f.priority); }
  if (f.source) { where.push('EXISTS (SELECT 1 FROM leads l WHERE l.opportunity_id = o.id AND l.source = ?)'); binds.push(f.source); }
  if (f.contractor === 'none') where.push('o.contractor_id IS NULL');
  else if (f.contractor) { where.push('o.contractor_id = ?'); binds.push(f.contractor); }
  if (f.archived === 'no') where.push('o.archived_at IS NULL');
  else if (f.archived === 'only') where.push('o.archived_at IS NOT NULL');
  if (f.test === 'hide') where.push('o.is_test = 0');
  else if (f.test === 'only') where.push('o.is_test = 1');
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

const OPP_LIST_SELECT = `
  SELECT o.*, c.display_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone, c.tags AS contact_tags,
         ct.name AS contractor_name,
         (SELECT t.due_on FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open' ORDER BY t.due_on, COALESCE(t.due_at, '') LIMIT 1) AS next_task_due,
         (SELECT t.title FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open' ORDER BY t.due_on, COALESCE(t.due_at, '') LIMIT 1) AS next_task_title,
         (SELECT MIN(a.starts_at) FROM appointments a WHERE a.opportunity_id = o.id AND a.status = 'scheduled') AS next_appointment,
         (SELECT l.source FROM leads l WHERE l.opportunity_id = o.id ORDER BY l.created_at, l.id LIMIT 1) AS first_source,
         (SELECT l.customer_email_status FROM leads l WHERE l.opportunity_id = o.id ORDER BY l.created_at, l.id LIMIT 1) AS customer_email_status,
         (SELECT l.internal_email_status FROM leads l WHERE l.opportunity_id = o.id ORDER BY l.created_at, l.id LIMIT 1) AS internal_email_status,
         (SELECT COUNT(*) FROM leads l WHERE l.opportunity_id = o.id) AS submission_count
  FROM opportunities o
  JOIN contacts c ON c.id = o.contact_id
  LEFT JOIN contractors ct ON ct.id = o.contractor_id`;

export async function listOpportunities(db, filters) {
  const { sql, binds } = buildWhere(filters);
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM opportunities o JOIN contacts c ON c.id = o.contact_id ${sql}`).bind(...binds).first()).n;
  const rows = await db
    .prepare(`${OPP_LIST_SELECT} ${sql} ORDER BY o.created_at DESC, o.id LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE)
    .all();
  return { rows: rows.results || [], total, pageSize: PAGE_SIZE };
}

export async function exportOpportunities(db, filters) {
  const { sql, binds } = buildWhere(filters);
  return ((await db.prepare(`${OPP_LIST_SELECT} ${sql} ORDER BY o.created_at DESC, o.id LIMIT ?`).bind(...binds, EXPORT_LIMIT).all()).results) || [];
}

/** Every matching project for the board (no paging), capped so the page stays light. */
export async function pipelineOpportunities(db, filters, cap = 400) {
  const { sql, binds } = buildWhere({ ...filters, status: '' });
  const rows = (await db.prepare(`${OPP_LIST_SELECT} ${sql} ORDER BY o.updated_at DESC, o.id LIMIT ?`).bind(...binds, cap + 1).all()).results || [];
  return { rows: rows.slice(0, cap), capped: rows.length > cap, cap };
}

/** Counts per stage for the stage tabs. Honours every filter EXCEPT the stage itself. */
export async function stageCounts(db, filters) {
  const { sql, binds } = buildWhere(filters, { skipStage: true });
  const rows = await db
    .prepare(`SELECT CASE WHEN o.stage_needs_review = 1 THEN 'needs_review' ELSE o.stage END AS stage, COUNT(*) AS n FROM opportunities o JOIN contacts c ON c.id = o.contact_id ${sql} GROUP BY 1`)
    .bind(...binds)
    .all();
  const by = Object.fromEntries((rows.results || []).map((r) => [r.stage, r.n]));
  return { by, all: Object.values(by).reduce((a, b) => a + b, 0) };
}

export async function hiddenTestCount(db) {
  return (await db.prepare('SELECT COUNT(*) AS n FROM opportunities WHERE is_test = 1').first()).n;
}

// ---------------------------------------------------------------- contacts

export function parseContactFilters(url) {
  const p = url.searchParams;
  const pageNum = parseInt(p.get('page') || '1', 10);
  return {
    q: (p.get('q') || '').trim().slice(0, 100),
    archived: ['only', 'all'].includes(p.get('archived')) ? p.get('archived') : 'no',
    test: ['only', 'all'].includes(p.get('test')) ? p.get('test') : 'hide',
    page: Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10000) : 1,
  };
}

export async function listContacts(db, f) {
  const where = ['c.merged_into_id IS NULL'];
  const binds = [];
  if (f.q) {
    const like = likeOf(f.q);
    const parts = ["c.display_name LIKE ? ESCAPE '\\'", "c.email LIKE ? ESCAPE '\\'", "c.phone LIKE ? ESCAPE '\\'", "c.tags LIKE ? ESCAPE '\\'"];
    binds.push(like, like, like, like);
    const digits = f.q.replace(/\D/g, '');
    if (digits.length >= 4) {
      parts.push(`${PHONE_STRIP.replace('%s', 'c.phone')} LIKE ?`);
      binds.push(`%${digits}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (f.archived === 'no') where.push('c.archived_at IS NULL');
  else if (f.archived === 'only') where.push('c.archived_at IS NOT NULL');
  if (f.test === 'hide') where.push('c.is_test = 0');
  else if (f.test === 'only') where.push('c.is_test = 1');
  const sql = `WHERE ${where.join(' AND ')}`;
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM contacts c ${sql}`).bind(...binds).first()).n;
  const rows = await db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM opportunities o WHERE o.contact_id = c.id AND o.archived_at IS NULL) AS open_projects,
         (SELECT COUNT(*) FROM opportunities o WHERE o.contact_id = c.id) AS all_projects,
         (SELECT COUNT(DISTINCT i2.contact_id) FROM contact_identifiers i1
            JOIN contact_identifiers i2 ON i2.kind = i1.kind AND i2.norm = i1.norm AND i2.contact_id != i1.contact_id
            WHERE i1.contact_id = c.id) AS duplicate_count
       FROM contacts c ${sql} ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?`
    )
    .bind(...binds, PAGE_SIZE, (f.page - 1) * PAGE_SIZE)
    .all();
  return { rows: rows.results || [], total, pageSize: PAGE_SIZE };
}

/** Everything the contact profile shows besides the timeline. */
export async function contactBundle(db, contactId) {
  const [projects, permissions, consents, suppressions] = await Promise.all([
    db
      .prepare(
        `SELECT o.*, ct.name AS contractor_name,
           (SELECT t.due_on FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open' ORDER BY t.due_on LIMIT 1) AS next_task_due,
           (SELECT COUNT(*) FROM leads l WHERE l.opportunity_id = o.id) AS submission_count
         FROM opportunities o LEFT JOIN contractors ct ON ct.id = o.contractor_id WHERE o.contact_id = ? ORDER BY o.created_at DESC`
      )
      .bind(contactId)
      .all(),
    db.prepare('SELECT * FROM contact_permissions WHERE contact_id = ? ORDER BY created_at DESC, rowid DESC').bind(contactId).all(),
    db
      .prepare(
        `SELECT cs.*, l.opportunity_id FROM consents cs JOIN leads l ON l.id = cs.lead_id WHERE l.contact_id = ? ORDER BY cs.created_at DESC`
      )
      .bind(contactId)
      .all(),
    db
      .prepare(
        `SELECT s.* FROM suppressions s WHERE s.email IN (SELECT norm FROM contact_identifiers WHERE contact_id = ? AND kind = 'email') ORDER BY s.created_at DESC`
      )
      .bind(contactId)
      .all(),
  ]);
  const permRows = permissions.results || [];
  const current = {};
  for (const r of permRows) if (!current[r.channel]) current[r.channel] = r; // newest first
  return { projects: projects.results || [], permissions: permRows, currentPermissions: current, consents: consents.results || [], suppressions: suppressions.results || [] };
}

// ---------------------------------------------------------------- timeline

const STAFF_ACTOR = /@/;
/** Legacy activity rows record who acted; automatic actors are not staff. */
function provenanceOfActor(actor) {
  if (actor === 'resend') return 'provider';
  if (STAFF_ACTOR.test(String(actor || ''))) return 'manual';
  return 'system';
}

export const PROVENANCE_LABEL = {
  manual: 'Recorded by staff',
  system: 'Automatic (RenoRise)',
  provider: 'Confirmed by the email provider',
};

const EVENT_KIND_TITLE = {
  note: 'Note',
  stage_changed: 'Stage change',
  project_reopened: 'Reopened',
  qualification_changed: 'Qualification',
  contact_updated: 'Contact details',
  project_updated: 'Project details',
  project_created: 'Project created',
  contractor_assigned: 'Contractor',
  contractor_unassigned: 'Contractor',
  project_archived: 'Archived',
  project_unarchived: 'Restored',
  contact_archived: 'Archived',
  contact_unarchived: 'Restored',
  test_flag: 'Test record',
  permission_recorded: 'Permission',
  delivery_status: 'Work status',
  appointment_scheduled: 'Appointment',
  appointment_cancelled: 'Appointment',
  appointment_completed: 'Appointment',
  appointment_no_show: 'Appointment',
  appointment_rescheduled: 'Appointment',
};

/**
 * One chronological list for a project (opportunityId) or for a whole contact (contactId):
 * original inquiries, notes, calls, appointments, stage changes, tasks completed, emails
 * and their delivery reports, and follow-up sequence events. Newest first.
 */
export async function buildTimeline(db, { opportunityId, contactId }, limit = 300) {
  const items = [];
  const byOpp = Boolean(opportunityId);
  const leadScope = byOpp ? 'l.opportunity_id = ?' : 'l.contact_id = ?';
  const scopeVal = byOpp ? opportunityId : contactId;
  const leadIn = `(SELECT id FROM leads l WHERE ${leadScope})`;

  const [leads, notes, activity, events, calls, tasks, jobs, sends] = await Promise.all([
    db.prepare(`SELECT * FROM leads l WHERE ${leadScope} ORDER BY l.created_at`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM lead_notes WHERE lead_id IN ${leadIn}`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM lead_activity WHERE lead_id IN ${leadIn} AND type NOT IN ('note_added', 'follow_up_completed')`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM crm_events WHERE ${byOpp ? 'opportunity_id' : 'contact_id'} = ? ORDER BY occurred_at DESC LIMIT 300`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM call_logs WHERE ${byOpp ? 'opportunity_id' : 'contact_id'} = ?`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM tasks WHERE ${byOpp ? 'opportunity_id' : 'contact_id'} = ? AND status IN ('done', 'cancelled') AND source != 'legacy_follow_up'`).bind(scopeVal).all(),
    db.prepare(`SELECT * FROM email_jobs WHERE lead_id IN ${leadIn}`).bind(scopeVal).all(),
    db
      .prepare(
        `SELECT fs.*, s.step_no, s.sent_at AS step_sent_at FROM followup_sends fs LEFT JOIN enrollment_steps s ON s.id = fs.enrollment_step_id
         WHERE fs.kind = 'followup' AND fs.lead_id IN ${leadIn}`
      )
      .bind(scopeVal)
      .all(),
  ]);

  for (const l of leads.results || []) {
    const manual = !['homepage', 'contact', 'assessment'].includes(l.source);
    items.push({
      at: l.created_at,
      kind: 'inquiry',
      title: manual ? 'Inquiry entered manually' : 'Inquiry received',
      body: `${SOURCE_LABEL[l.source] || l.source}. The original submission is kept unchanged.`,
      provenance: manual ? 'manual' : 'system',
      leadId: l.id,
    });
  }
  for (const n of notes.results || []) items.push({ at: n.created_at, kind: 'note', title: 'Note', body: n.body, provenance: 'manual', actor: n.author_email });
  for (const a of activity.results || []) items.push({ at: a.created_at, kind: a.type, title: 'Activity', body: a.summary, provenance: provenanceOfActor(a.actor_email), actor: a.actor_email });
  for (const e of events.results || []) {
    // Project pages show project events; a contact page also shows events that belong to no project.
    items.push({ at: e.occurred_at, kind: e.kind, title: EVENT_KIND_TITLE[e.kind] || 'Update', body: e.summary, provenance: e.provenance, actor: e.actor, opportunityId: e.opportunity_id });
  }
  for (const c of calls.results || []) {
    items.push({
      at: c.occurred_at,
      kind: 'call',
      title: `${c.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call: ${CALL_OUTCOME_LABEL[c.outcome] || c.outcome}`,
      body: c.summary || '',
      provenance: 'manual',
      actor: c.logged_by,
      note: 'Logged by staff. A tapped phone link is not treated as a call.',
    });
  }
  for (const t of tasks.results || []) {
    items.push({
      at: t.completed_at,
      kind: 'task',
      title: t.status === 'done' ? `Task completed: ${TASK_TYPE_LABEL[t.type] || t.type}` : 'Task cancelled',
      body: `${t.title}${t.completion_note ? `. Note: ${t.completion_note}` : ''}`,
      provenance: 'manual',
      actor: t.completed_by,
    });
  }
  for (const j of jobs.results || []) {
    const what = j.email_type === 'customer' ? 'Confirmation email' : 'Internal notification';
    if (j.status === 'sent') items.push({ at: j.updated_at, kind: 'email', title: `${what} accepted by Resend`, body: 'Accepted for sending. Delivery to the inbox is not verified.', provenance: 'system' });
    else if (j.status === 'failed') items.push({ at: j.updated_at, kind: 'email_failed', title: `${what} failed`, body: `After ${j.attempts} attempt${j.attempts === 1 ? '' : 's'}. ${String(j.last_error || '').slice(0, 160)}`, provenance: 'system' });
    else items.push({ at: j.updated_at, kind: 'email_pending', title: `${what} ${j.status === 'sending' ? 'sending now' : 'queued'}`, body: j.attempts ? `${j.attempts} attempt(s) so far.` : '', provenance: 'system' });
  }
  for (const s of sends.results || []) {
    const label = `Follow-up email ${s.step_no || ''}`.trim();
    if (s.status === 'sent') items.push({ at: s.step_sent_at || s.updated_at, kind: 'email', title: `${label} accepted by Resend`, body: 'Accepted for sending. Delivery is only confirmed by a separate report from Resend.', provenance: 'system' });
    else if (s.status === 'failed') items.push({ at: s.updated_at, kind: 'email_failed', title: `${label} failed`, body: String(s.last_error || '').slice(0, 160), provenance: 'system' });
    if (s.delivered_at) items.push({ at: s.delivered_at, kind: 'email_delivered', title: `${label}: delivery confirmed by Resend`, body: '', provenance: 'provider' });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items.slice(0, limit);
}

// ---------------------------------------------------------------- Today

/**
 * What needs a person today. Every section is computed from real records; a
 * section with nothing to show is simply empty. Test records and archived
 * projects are left out (the count of hidden test records is returned).
 * Thresholds come from crm_settings and are internal reminders only.
 */
export async function todayData(db, now = new Date()) {
  const settings = await loadCrmSettings(db);
  const today = torontoToday(now);
  const dayStart = torontoDateHourToUtcIso(today, 0);
  const dayEnd = torontoDateHourToUtcIso(addDays(today, 1), 0);
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const newCutoff = hoursAgo(Number(settings.new_inquiry_hours));
  const staleCutoff = hoursAgo(Number(settings.stale_days) * 24);
  const quoteCutoff = hoursAgo(Number(settings.quote_followup_days) * 24);

  const OPP = `SELECT o.id, o.title, o.stage, o.priority, o.created_at, o.updated_at, o.first_contact_at, o.hold_review_on, o.hold_from_stage, o.stage_reason, o.legacy_status,
                      c.display_name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
               FROM opportunities o JOIN contacts c ON c.id = o.contact_id`;
  const ACTIVE = 'o.archived_at IS NULL AND o.is_test = 0';
  const OPEN_STAGE = "o.stage_needs_review = 0 AND o.stage NOT IN ('won', 'lost', 'on_hold')";
  const noTask = "NOT EXISTS (SELECT 1 FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open')";
  const noAppt = "NOT EXISTS (SELECT 1 FROM appointments a WHERE a.opportunity_id = o.id AND a.status = 'scheduled' AND a.starts_at >= ?)";
  const TASKS = `SELECT t.*, c.display_name AS contact_name, o.title AS project_title, k.name AS contractor_name
                 FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN opportunities o ON o.id = t.opportunity_id LEFT JOIN contractors k ON k.id = t.contractor_id
                 WHERE t.status = 'open' AND (o.id IS NULL OR (o.archived_at IS NULL AND o.is_test = 0))`;

  const [needsStage, newInquiries, overdue, dueToday, consultations, noNext, holds, quiet, quotes, failedJobs, failedSends, testHidden] = await Promise.all([
    db.prepare(`${OPP} WHERE ${ACTIVE} AND o.stage_needs_review = 1 ORDER BY o.created_at`).all(),
    db.prepare(`${OPP} WHERE ${ACTIVE} AND o.stage = 'new_inquiry' AND o.first_contact_at IS NULL ORDER BY o.created_at`).all(),
    db.prepare(`${TASKS} AND t.due_on < ? ORDER BY t.due_on, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END LIMIT 100`).bind(today).all(),
    db.prepare(`${TASKS} AND t.due_on = ? ORDER BY COALESCE(t.due_at, ''), CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END LIMIT 100`).bind(today).all(),
    db
      .prepare(
        `SELECT a.*, o.title, o.id AS opp_id, c.display_name AS contact_name FROM appointments a JOIN opportunities o ON o.id = a.opportunity_id JOIN contacts c ON c.id = a.contact_id
         WHERE a.status = 'scheduled' AND a.starts_at >= ? AND a.starts_at < ? AND ${ACTIVE} ORDER BY a.starts_at`
      )
      .bind(dayStart, dayEnd)
      .all(),
    db
      .prepare(`${OPP} WHERE ${ACTIVE} AND ${OPEN_STAGE} AND NOT (o.stage = 'new_inquiry' AND o.first_contact_at IS NULL) AND ${noTask} AND ${noAppt} ORDER BY o.updated_at LIMIT 100`)
      .bind(now.toISOString())
      .all(),
    db.prepare(`${OPP} WHERE ${ACTIVE} AND o.stage = 'on_hold' AND o.hold_review_on IS NOT NULL AND o.hold_review_on <= ? ORDER BY o.hold_review_on`).bind(today).all(),
    db
      .prepare(`${OPP} WHERE ${ACTIVE} AND ${OPEN_STAGE} AND o.stage NOT IN ('new_inquiry', 'quote_sent') AND o.updated_at < ? ORDER BY o.updated_at LIMIT 100`)
      .bind(staleCutoff)
      .all(),
    db.prepare(`${OPP} WHERE ${ACTIVE} AND o.stage = 'quote_sent' AND o.updated_at < ? ORDER BY o.updated_at LIMIT 100`).bind(quoteCutoff).all(),
    db.prepare("SELECT j.id, j.email_type, j.attempts, j.updated_at, l.name AS lead_name, l.opportunity_id FROM email_jobs j JOIN leads l ON l.id = j.lead_id WHERE j.status = 'failed' ORDER BY j.updated_at DESC LIMIT 20").all(),
    db.prepare("SELECT f.id, f.updated_at, l.name AS lead_name, l.opportunity_id FROM followup_sends f LEFT JOIN leads l ON l.id = f.lead_id WHERE f.status = 'failed' AND f.kind = 'followup' ORDER BY f.updated_at DESC LIMIT 20").all(),
    db.prepare('SELECT COUNT(*) AS n FROM opportunities WHERE is_test = 1 AND archived_at IS NULL').first(),
  ]);

  const newRows = (newInquiries.results || []).map((r) => ({ ...r, past_threshold: r.created_at <= newCutoff }));
  return {
    today,
    settings,
    needsStage: needsStage.results || [],
    newInquiries: newRows,
    overdueTasks: overdue.results || [],
    tasksToday: dueToday.results || [],
    consultations: consultations.results || [],
    noNextAction: noNext.results || [],
    holdReviews: holds.results || [],
    quiet: quiet.results || [],
    quotesNeedFollowUp: quotes.results || [],
    failedEmails: [...(failedJobs.results || []).map((j) => ({ ...j, kind: 'confirmation' })), ...(failedSends.results || []).map((s) => ({ ...s, kind: 'follow-up' }))],
    testRecordsHidden: testHidden.n,
  };
}

// ---------------------------------------------------------------- overview and per-project lookups

export async function overview(db, now = new Date()) {
  const today = torontoToday(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const nowIso = now.toISOString();
  const REAL = 'o.archived_at IS NULL AND o.is_test = 0';
  const counts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM opportunities o WHERE ${REAL} AND o.stage = 'new_inquiry') AS new_inquiries,
        (SELECT COUNT(*) FROM opportunities o WHERE ${REAL} AND o.created_at >= ?) AS leads_7d,
        (SELECT COUNT(*) FROM tasks t LEFT JOIN opportunities o ON o.id = t.opportunity_id WHERE t.status = 'open' AND t.due_on < ? AND (o.id IS NULL OR (${REAL}))) AS overdue,
        (SELECT COUNT(*) FROM tasks t LEFT JOIN opportunities o ON o.id = t.opportunity_id WHERE t.status = 'open' AND t.due_on = ? AND (o.id IS NULL OR (${REAL}))) AS due_today,
        (SELECT COUNT(*) FROM appointments a JOIN opportunities o ON o.id = a.opportunity_id WHERE a.status = 'scheduled' AND a.starts_at >= ? AND ${REAL}) AS appointments_upcoming,
        (SELECT COUNT(*) FROM email_jobs WHERE status = 'failed') AS email_failed,
        (SELECT COUNT(*) FROM email_jobs WHERE status = 'pending' AND attempts > 0) AS email_retrying`
    )
    .bind(weekAgo, today, today, nowIso)
    .first();
  const recent = await db
    .prepare(`SELECT o.*, c.display_name AS contact_name FROM opportunities o JOIN contacts c ON c.id = o.contact_id WHERE ${REAL} ORDER BY o.created_at DESC LIMIT 5`)
    .all();
  const appointments = await db
    .prepare(
      `SELECT a.*, c.display_name AS contact_name FROM appointments a JOIN opportunities o ON o.id = a.opportunity_id JOIN contacts c ON c.id = a.contact_id
       WHERE a.status = 'scheduled' AND a.starts_at >= ? AND ${REAL} ORDER BY a.starts_at LIMIT 5`
    )
    .bind(nowIso)
    .all();
  return { counts, recent: recent.results || [], appointments: appointments.results || [], today };
}

/**
 * The submission that follow-up emails hang off for this project: one that already has an
 * open sequence, else the earliest with an email address, else the earliest.
 */
export async function sequenceLeadFor(db, oppId) {
  return db
    .prepare(
      `SELECT l.* FROM leads l WHERE l.opportunity_id = ?
       ORDER BY EXISTS (SELECT 1 FROM enrollments e WHERE e.lead_id = l.id AND e.status IN ('active', 'paused')) DESC, (l.email != '') DESC, l.created_at, l.id LIMIT 1`
    )
    .bind(oppId)
    .first();
}

export async function emailJobsFor(db, oppId) {
  return ((await db.prepare('SELECT j.* FROM email_jobs j WHERE j.lead_id IN (SELECT id FROM leads WHERE opportunity_id = ?) ORDER BY j.created_at, j.email_type').bind(oppId).all()).results) || [];
}
