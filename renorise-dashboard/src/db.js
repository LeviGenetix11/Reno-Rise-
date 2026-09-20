// Database access for the parts of the dashboard that predate the CRM: the
// contractor directory and the immediate-email (confirmation / notification)
// activity. Contacts, projects, stages, tasks, calls, appointments, the
// timeline and Today live in crm-db.js, crm-work.js and crm-query.js.
//
// Every query uses prepared statements with bound parameters. Multi-statement
// writes go through db.batch(), which D1 runs as a single atomic transaction.

import { PAGE_SIZE } from './constants.js';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function activityStmt(db, leadId, type, summary, actor) {
  return db
    .prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), leadId, type, summary, actor, nowIso());
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
      `SELECT c.*, (SELECT COUNT(*) FROM opportunities o WHERE o.contractor_id = c.id AND o.archived_at IS NULL) AS active_leads
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
