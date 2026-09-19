// Dashboard operations for the follow-up sequence. The dashboard never sends
// email and holds no Resend key: it records consent, enrolls, approves, pauses,
// stops, and queues test emails. The public forms Worker's cron does the sending.
//
// Every function returns { ok: true, ... } or { ok: false, code } where `code`
// maps to a fixed message in seq-views.js (never reflected user input).

import {
  CURRENT_VERSION,
  TEST_RECIPIENTS,
  DEFAULT_SETTINGS,
  planEnrollment,
  nextOpenStep,
  STEP_TERMINAL,
  getVersion,
} from '../../renorise-shared/sequence.js';
import { stopReasonFor } from '../../renorise-shared/eligibility.js';
import { TEMPLATE_KEYS } from '../../renorise-shared/templates.js';
import {
  loadSettings,
  saveSetting,
  businessDetailsOk,
  getSuppression,
  addSuppression,
  stopEnrollment,
  withdrawConsentsForEmail,
  reprojectEnrollment,
  completeIfDone,
  usage,
} from '../../renorise-shared/followup-db.js';
import { torontoDateOf, torontoToday, isValidDateString, torontoDateHourToUtcIso } from './time.js';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CONSENT_METHODS = {
  phone_verbal: 'Customer agreed by phone',
  written_reply: 'Customer agreed in writing (email or text)',
  in_person: 'Customer agreed in person',
  website_form: 'Customer ticked a consent box on a form',
  other: 'Other (explain in the note)',
};

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const activity = (db, leadId, type, summary, actor) =>
  db
    .prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), leadId, type, summary, actor, nowIso());

// ------------------------------------------------------------------ reading

export async function getLeadForSequence(db, leadId) {
  if (!ID_RE.test(leadId)) return null;
  return db.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
}

/** The lead's most recent enrollment (open first), with steps, sends, and consent. */
export async function enrollmentForLead(db, leadId) {
  const enr = await db
    .prepare("SELECT * FROM enrollments WHERE lead_id = ? ORDER BY (status IN ('active','paused')) DESC, created_at DESC LIMIT 1")
    .bind(leadId)
    .first();
  if (!enr) return null;
  const [steps, consent, sends] = await Promise.all([
    db.prepare('SELECT * FROM enrollment_steps WHERE enrollment_id = ? ORDER BY step_no').bind(enr.id).all(),
    db.prepare('SELECT * FROM consents WHERE id = ?').bind(enr.consent_id).first(),
    db
      .prepare('SELECT * FROM followup_sends WHERE enrollment_step_id IN (SELECT id FROM enrollment_steps WHERE enrollment_id = ?) ORDER BY created_at')
      .bind(enr.id)
      .all(),
  ]);
  return { enrollment: enr, steps: steps.results || [], consent, sends: sends.results || [] };
}

/** Steps due for a human decision right now (approval queue). */
export async function approvalQueue(db, now = new Date()) {
  const rows = await db
    .prepare(
      `SELECT s.*, e.lead_id, e.source_kind, l.name AS lead_name, l.email AS lead_email
       FROM enrollment_steps s
       JOIN enrollments e ON e.id = s.enrollment_id
       JOIN leads l ON l.id = e.lead_id
       WHERE e.status = 'active' AND s.status = 'planned' AND s.planned_for <= ?
         AND NOT EXISTS (SELECT 1 FROM enrollment_steps p WHERE p.enrollment_id = s.enrollment_id AND p.step_no < s.step_no AND p.status IN ('planned','approved','queued'))
       ORDER BY s.planned_for ASC`
    )
    .bind(now.toISOString())
    .all();
  return rows.results || [];
}

export async function sequenceOverview(db, now = new Date()) {
  const settings = await loadSettings(db);
  const [counts, waiting, failed, u] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS n FROM enrollments GROUP BY status").all(),
    approvalQueue(db, now),
    db.prepare("SELECT COUNT(*) AS n FROM followup_sends WHERE status = 'failed'").first(),
    usage(db, now),
  ]);
  return {
    settings,
    counts: Object.fromEntries((counts.results || []).map((r) => [r.status, r.n])),
    awaiting: waiting.length,
    failed_sends: failed.n,
    usage: u,
    ready: businessDetailsOk(settings),
  };
}

export async function recentSends(db, limit = 20) {
  const rows = await db.prepare('SELECT * FROM followup_sends ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return rows.results || [];
}

// ------------------------------------------------------------------ enrolling

/**
 * Validates and plans an enrollment WITHOUT saving it (used for the "planned
 * dates" preview and by createEnrollment itself).
 * anchor: website -> the lead's inquiry time; call -> the recorded call date.
 */
export async function planFor(db, lead, { sourceKind, callDate }, now = new Date()) {
  const settings = await loadSettings(db);
  if (!['website', 'call'].includes(sourceKind)) return { ok: false, code: 'bad_source' };
  let anchorIso;
  if (sourceKind === 'website') {
    anchorIso = lead.created_at;
  } else {
    if (!isValidDateString(callDate || '')) return { ok: false, code: 'call_date_required' };
    if (callDate > torontoToday(now)) return { ok: false, code: 'call_date_future' };
    anchorIso = torontoDateHourToUtcIso(callDate, 12);
  }
  const steps = planEnrollment({ anchorIso, now, settings, versionId: CURRENT_VERSION });
  return { ok: true, anchorIso, steps, settings, remaining: steps.filter((s) => s.status === 'planned').length };
}

export async function createEnrollment(db, leadId, input, actor, now = new Date()) {
  const lead = await getLeadForSequence(db, leadId);
  if (!lead) return { ok: false, code: 'not_found' };

  // Recorded, explicit permission is mandatory and is never inferred.
  if (input.confirmed !== true) return { ok: false, code: 'consent_unconfirmed' };
  if (!Object.prototype.hasOwnProperty.call(CONSENT_METHODS, input.method)) return { ok: false, code: 'consent_method' };
  if (!isValidDateString(input.givenOn || '') || input.givenOn > torontoToday(now)) return { ok: false, code: 'consent_date' };
  const evidence = String(input.evidence || '').trim();
  if (evidence.length < 5) return { ok: false, code: 'consent_evidence' };
  if (evidence.length > 500) return { ok: false, code: 'consent_evidence_long' };

  // Lead must currently be eligible.
  if (!EMAIL_RE.test(lead.email)) return { ok: false, code: 'bad_email' };
  const stop = stopReasonFor({ lead, consent: { withdrawn_at: null }, suppression: await getSuppression(db, lead.email) });
  if (stop) return { ok: false, code: `not_eligible_${stop}` };
  const open = await db.prepare("SELECT id FROM enrollments WHERE lead_id = ? AND status IN ('active','paused')").bind(leadId).first();
  if (open) return { ok: false, code: 'already_enrolled' };

  const plan = await planFor(db, lead, input, now);
  if (!plan.ok) return plan;
  if (plan.remaining === 0) return { ok: false, code: 'all_steps_elapsed' };

  const consentId = newId();
  const enrollmentId = newId();
  const created = now.toISOString();
  const stmts = [
    db
      .prepare('INSERT INTO consents (id, lead_id, scope, method, given_on, evidence, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(consentId, leadId, 'followup_sequence', input.method, input.givenOn, evidence, actor, created),
    db
      .prepare('INSERT INTO enrollments (id, lead_id, sequence_version, source_kind, anchor_at, consent_id, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(enrollmentId, leadId, CURRENT_VERSION, input.sourceKind, plan.anchorIso, consentId, 'active', actor, created, created),
  ];
  for (const s of plan.steps) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO enrollment_steps (id, enrollment_id, step_no, day_offset, template, original_planned_for, planned_for, status, cancel_reason, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(newId(), enrollmentId, s.no, s.day, s.template, s.original_planned_for, s.planned_for, s.status, s.status === 'skipped_elapsed' ? 'date already passed at enrollment' : null, created)
    );
  }
  stmts.push(
    db.prepare('INSERT INTO unsubscribe_tokens (token, lead_id, enrollment_id, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(token(), leadId, enrollmentId, lead.email.toLowerCase(), created),
    activity(db, leadId, 'followup_enrolled', `Enrolled in the follow-up sequence (${input.sourceKind === 'call' ? 'phone call' : 'website inquiry'}); permission recorded: ${CONSENT_METHODS[input.method]}`, actor)
  );
  try {
    await db.batch(stmts);
  } catch (err) {
    // The unique index allows only one open enrollment per lead; a concurrent
    // double submit lands here and rolls back atomically (nothing half-saved).
    if (/UNIQUE|constraint/i.test(String(err.message))) return { ok: false, code: 'already_enrolled' };
    throw err;
  }
  return { ok: true, enrollmentId };
}

// ------------------------------------------------------------------ approving / stepping

/** Manual approval before EACH follow-up (replies land in the Hostinger inbox, which this system cannot read). */
export async function approveStep(db, stepId, { inboxChecked }, actor, now = new Date()) {
  if (!ID_RE.test(stepId)) return { ok: false, code: 'not_found' };
  const step = await db.prepare('SELECT * FROM enrollment_steps WHERE id = ?').bind(stepId).first();
  if (!step) return { ok: false, code: 'not_found' };
  const enr = await db.prepare('SELECT * FROM enrollments WHERE id = ?').bind(step.enrollment_id).first();
  if (enr.status !== 'active') return { ok: false, code: 'not_active' };
  if (step.status !== 'planned') return { ok: false, code: 'step_not_pending' };
  if (inboxChecked !== true) return { ok: false, code: 'inbox_not_checked' };
  const all = (await db.prepare('SELECT * FROM enrollment_steps WHERE enrollment_id = ?').bind(enr.id).all()).results || [];
  if (nextOpenStep(all)?.id !== step.id) return { ok: false, code: 'not_next_step' };
  if (Date.parse(step.planned_for) > now.getTime()) return { ok: false, code: 'not_due_yet' };

  // Last look before approving: is this person still eligible?
  const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(enr.lead_id).first();
  const consent = await db.prepare('SELECT * FROM consents WHERE id = ?').bind(enr.consent_id).first();
  const stop = stopReasonFor({ lead, consent, suppression: lead ? await getSuppression(db, lead.email) : null });
  if (stop) {
    await stopEnrollment(db, enr.id, stop, actor);
    return { ok: false, code: 'stopped' };
  }
  const res = await db
    .prepare("UPDATE enrollment_steps SET status = 'approved', approved_at = ?, approved_by = ?, inbox_checked = 1, updated_at = ? WHERE id = ? AND status = 'planned'")
    .bind(now.toISOString(), actor, now.toISOString(), stepId)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' }; // double click
  await db.batch([activity(db, enr.lead_id, 'followup_approved', `Follow-up email ${step.step_no} approved (inbox checked); it will send at the next check within the daytime window, if the global switch is on`, actor)]);
  return { ok: true, code: 'step_approved' };
}

export async function skipStep(db, stepId, actor) {
  if (!ID_RE.test(stepId)) return { ok: false, code: 'not_found' };
  const step = await db.prepare('SELECT * FROM enrollment_steps WHERE id = ?').bind(stepId).first();
  if (!step) return { ok: false, code: 'not_found' };
  const enr = await db.prepare('SELECT * FROM enrollments WHERE id = ?').bind(step.enrollment_id).first();
  if (!['active', 'paused'].includes(enr.status)) return { ok: false, code: 'not_active' };
  const now = nowIso();
  const res = await db
    .prepare("UPDATE enrollment_steps SET status = 'skipped_staff', cancel_reason = 'skipped by staff', updated_at = ? WHERE id = ? AND status IN ('planned','approved','queued')")
    .bind(now, stepId)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: false, code: 'step_not_pending' };
  await db.batch([
    db.prepare("UPDATE followup_sends SET status = 'cancelled', updated_at = ? WHERE enrollment_step_id = ? AND status IN ('pending','failed')").bind(now, stepId),
    activity(db, enr.lead_id, 'followup_skipped', `Follow-up email ${step.step_no} skipped by staff`, actor),
  ]);
  const settings = await loadSettings(db);
  await reprojectEnrollment(db, enr.id, settings);
  await completeIfDone(db, enr.id);
  return { ok: true, code: 'step_skipped' };
}

// ------------------------------------------------------------------ pause / stop

export async function setPaused(db, enrollmentId, paused, actor) {
  if (!ID_RE.test(enrollmentId)) return { ok: false, code: 'not_found' };
  const now = nowIso();
  const res = await db
    .prepare('UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
    .bind(paused ? 'paused' : 'active', now, enrollmentId, paused ? 'active' : 'paused')
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: true, code: 'no_change' };
  const enr = await db.prepare('SELECT lead_id FROM enrollments WHERE id = ?').bind(enrollmentId).first();
  await db.batch([activity(db, enr.lead_id, paused ? 'followup_paused' : 'followup_resumed', paused ? 'Follow-up sequence paused' : 'Follow-up sequence resumed', actor)]);
  if (!paused) await reprojectEnrollment(db, enrollmentId, await loadSettings(db));
  return { ok: true, code: paused ? 'paused' : 'resumed' };
}

const STAFF_STOP_REASONS = ['staff', 'reply', 'declined', 'withdrawn', 'unsubscribed'];

/**
 * Staff-recorded outcomes that end the sequence: the customer replied, said no,
 * asked to stop (by reply/phone), withdrew permission, or staff simply stopped it.
 */
export async function stopByStaff(db, enrollmentId, reason, actor) {
  if (!ID_RE.test(enrollmentId) || !STAFF_STOP_REASONS.includes(reason)) return { ok: false, code: 'bad_request' };
  const enr = await db.prepare('SELECT * FROM enrollments WHERE id = ?').bind(enrollmentId).first();
  if (!enr) return { ok: false, code: 'not_found' };
  const lead = await db.prepare('SELECT email FROM leads WHERE id = ?').bind(enr.lead_id).first();
  if (['declined', 'unsubscribed'].includes(reason)) {
    // A declined / unsubscribe-by-reply request also blocks future enrollment of this address.
    await addSuppression(db, lead.email, 'unsubscribe', reason === 'declined' ? 'Customer declined (recorded by staff)' : 'Unsubscribe request recorded by staff', 'staff');
  }
  if (['declined', 'withdrawn', 'unsubscribed'].includes(reason)) await withdrawConsentsForEmail(db, lead.email, `Recorded by staff: ${reason}`);
  const changed = await stopEnrollment(db, enrollmentId, reason, actor);
  return { ok: true, code: changed ? 'stopped' : 'no_change' };
}

// ------------------------------------------------------------------ tests + retry

export async function queueTestSend(db, { to, template, variant, name }, actor) {
  const addr = String(to || '').trim().toLowerCase();
  if (!TEST_RECIPIENTS.includes(addr)) return { ok: false, code: 'test_recipient' };
  if (!TEMPLATE_KEYS.includes(template)) return { ok: false, code: 'bad_request' };
  if (!['call', 'website'].includes(variant)) return { ok: false, code: 'bad_request' };
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO followup_sends (id, kind, to_email, idempotency_key, template, variant, test_name, status, attempts, created_at, updated_at)
       VALUES (?, 'test', ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
    )
    .bind(id, addr, `test:${id}`, template, variant, String(name || '').trim().slice(0, 60) || null, now, now)
    .run();
  return { ok: true, code: 'test_queued' };
}

/** Re-queues ONE failed follow-up/test send for the existing cron: one more bounded attempt, same idempotency key. */
export async function retryFailedSend(db, sendId, actor) {
  if (!ID_RE.test(sendId)) return { ok: false, code: 'not_found' };
  const res = await db
    .prepare("UPDATE followup_sends SET status = 'pending', max_attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'failed'")
    .bind(nowIso(), sendId)
    .run();
  if (!res.meta || res.meta.changes === 0) return { ok: false, code: 'retry_not_eligible' };
  return { ok: true, code: 'retry_queued' };
}

// ------------------------------------------------------------------ settings

const INT_SETTINGS = {
  followup_daily_cap: [1, 1000],
  account_daily_cap: [1, 100000],
  account_monthly_cap: [1, 10000000],
  confirmation_reserve: [0, 1000],
  monthly_reserve: [0, 100000],
  window_start_hour: [0, 23],
  window_end_hour: [1, 24],
};

export async function saveSettings(db, form, actor) {
  const updates = {};
  for (const [k, [lo, hi]] of Object.entries(INT_SETTINGS)) {
    const raw = form.get(k);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < lo || n > hi) return { ok: false, code: 'bad_setting' };
    updates[k] = String(n);
  }
  const start = Number(updates.window_start_hour ?? (await loadSettings(db)).window_start_hour);
  const end = Number(updates.window_end_hour ?? (await loadSettings(db)).window_end_hour);
  if (start >= end) return { ok: false, code: 'bad_window' };
  for (const k of ['business_legal_name', 'business_mailing_address']) {
    const raw = form.get(k);
    if (raw !== null) updates[k] = String(raw).trim().slice(0, 300);
  }
  const base = form.get('unsubscribe_base_url');
  if (base !== null) {
    const v = String(base).trim().replace(/\/+$/, '');
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(v)) return { ok: false, code: 'bad_base_url' };
    updates.unsubscribe_base_url = v;
  }
  for (const [k, v] of Object.entries(updates)) await saveSetting(db, k, v, actor);
  return { ok: true, code: 'settings_saved' };
}

/**
 * Turning follow-ups ON needs: recorded business details, an HTTPS unsubscribe
 * address, an explicit typed confirmation. Turning them OFF is always allowed.
 * (The forms Worker additionally refuses to send until its Resend webhook secret exists.)
 */
export async function setGlobalSwitch(db, on, confirmText, actor) {
  if (!on) {
    await saveSetting(db, 'global_send_enabled', '0', actor);
    return { ok: true, code: 'switch_off' };
  }
  const s = await loadSettings(db);
  if (!businessDetailsOk(s)) return { ok: false, code: 'business_details_missing' };
  if (!/^https:\/\//.test(s.unsubscribe_base_url)) return { ok: false, code: 'bad_base_url' };
  if (String(confirmText || '').trim() !== 'ENABLE FOLLOW-UPS') return { ok: false, code: 'switch_confirm' };
  await saveSetting(db, 'global_send_enabled', '1', actor);
  return { ok: true, code: 'switch_on' };
}

export { getVersion, DEFAULT_SETTINGS, STEP_TERMINAL };
