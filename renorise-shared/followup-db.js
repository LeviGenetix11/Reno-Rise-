// Database operations for the follow-up sequence. Used by BOTH the public forms
// Worker (sending, unsubscribe link, Resend webhook) and the private dashboard
// (enrolling, approving, stopping), so stop/unsubscribe/budget rules exist in
// exactly one place. All queries are prepared statements with bound parameters.

import { DEFAULT_SETTINGS, STEP_TERMINAL, reproject } from './sequence.js';
import { STOP_LABELS } from './eligibility.js';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const lc = (e) => String(e || '').trim().toLowerCase();

// ------------------------------------------------------------------ settings

export async function loadSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM sequence_settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows.results || []) out[r.key] = r.value;
  return out;
}

export async function saveSetting(db, key, value, actor) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) throw new Error(`Unknown setting: ${key}`);
  await db
    .prepare('INSERT INTO sequence_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .bind(key, String(value), nowIso(), actor)
    .run();
}

/**
 * A mailing address the CRTC accepts is a street (civic) address, a PO box, a
 * rural route, or general delivery. This is a sanity check, not a postal
 * validator: it refuses text such as "Reno Rise M5V 3A3 Toronto Ontario" (a
 * postal code alone does not say where mail is delivered).
 */
export function addressLooksComplete(address) {
  const a = String(address || '').trim();
  if (a.length < 10) return false;
  const street = /^\d+[A-Za-z]?[\s,-]+\S+/; // "100 Example Street", "12A Main St"
  const streetWithUnit = /\b\d+[A-Za-z]?\s+[A-Za-z][\w'.-]*\s+(St|Street|Ave|Avenue|Rd|Road|Cres|Crescent|Dr|Drive|Blvd|Boulevard|Ct|Court|Lane|Ln|Way|Pl|Place|Terr|Terrace|Pkwy|Parkway|Sq|Square|Trail)\b/i;
  const poBox = /\bP\.?\s?O\.?\s*Box\s*#?\s*\d+|\bBox\s+#?\d+|\bCP\s+\d+/i;
  const ruralRoute = /\bR\.?R\.?\s*#?\s*\d+/i;
  const generalDelivery = /\bGeneral Delivery\b|\bPoste Restante\b/i;
  return street.test(a) || streetWithUnit.test(a) || poBox.test(a) || ruralRoute.test(a) || generalDelivery.test(a);
}

export const businessDetailsOk = (s) =>
  String(s.business_legal_name || '').trim().length >= 2 && addressLooksComplete(s.business_mailing_address);

// ------------------------------------------------------------------ suppression

export async function getSuppression(db, email) {
  return db.prepare('SELECT * FROM suppressions WHERE email = ?').bind(lc(email)).first();
}

export async function addSuppression(db, email, reason, detail, source) {
  await db
    .prepare('INSERT OR IGNORE INTO suppressions (email, reason, detail, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(lc(email), reason, detail || null, source || null, nowIso())
    .run();
}

// ------------------------------------------------------------------ stopping

function activityStmt(db, leadId, type, summary, actor) {
  return db
    .prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), leadId, type, summary, actor, nowIso());
}

/**
 * Ends an open enrollment for good: cancels every unsent step and every
 * not-yet-sent queued send. Safe to call twice (the first UPDATE is the guard).
 * Returns true only for the call that actually stopped it.
 */
export async function stopEnrollment(db, enrollmentId, reason, actor = 'system') {
  const now = nowIso();
  const res = await db
    .prepare("UPDATE enrollments SET status = 'stopped', stop_reason = ?, stopped_at = ?, updated_at = ? WHERE id = ? AND status IN ('active', 'paused')")
    .bind(reason, now, now, enrollmentId)
    .run();
  if (!res.meta || res.meta.changes === 0) return false;
  const enr = await db.prepare('SELECT lead_id FROM enrollments WHERE id = ?').bind(enrollmentId).first();
  await db.batch([
    db
      .prepare("UPDATE followup_sends SET status = 'cancelled', updated_at = ? WHERE kind = 'followup' AND status IN ('pending', 'failed') AND enrollment_step_id IN (SELECT id FROM enrollment_steps WHERE enrollment_id = ?)")
      .bind(now, enrollmentId),
    db
      .prepare("UPDATE enrollment_steps SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE enrollment_id = ? AND status IN ('planned', 'approved', 'queued')")
      .bind(reason, now, enrollmentId),
    activityStmt(db, enr.lead_id, 'followup_stopped', `Follow-up sequence stopped: ${STOP_LABELS[reason] || reason}`, actor),
  ]);
  return true;
}

export async function stopEnrollmentsForLead(db, leadId, reason, actor = 'system') {
  const open = await db.prepare("SELECT id FROM enrollments WHERE lead_id = ? AND status IN ('active', 'paused')").bind(leadId).all();
  let n = 0;
  for (const e of open.results || []) if (await stopEnrollment(db, e.id, reason, actor)) n++;
  return n;
}

/** Every open enrollment for any lead that uses this email address. */
export async function stopEnrollmentsForEmail(db, email, reason, actor = 'system') {
  const open = await db
    .prepare("SELECT e.id FROM enrollments e JOIN leads l ON l.id = e.lead_id WHERE lower(l.email) = ? AND e.status IN ('active', 'paused')")
    .bind(lc(email))
    .all();
  let n = 0;
  for (const e of open.results || []) if (await stopEnrollment(db, e.id, reason, actor)) n++;
  return n;
}

export async function withdrawConsentsForEmail(db, email, reason) {
  await db
    .prepare("UPDATE consents SET withdrawn_at = ?, withdrawn_reason = ? WHERE withdrawn_at IS NULL AND lead_id IN (SELECT id FROM leads WHERE lower(email) = ?)")
    .bind(nowIso(), reason, lc(email))
    .run();
}

/**
 * Unsubscribe via the emailed link. Idempotent. Adds the address to the
 * suppression list, withdraws recorded permission, stops every open
 * enrollment for that address, and cancels queued follow-ups.
 * Returns { ok, alreadyDone }.
 */
export async function applyUnsubscribe(db, token) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token || ''))) return { ok: false };
  const row = await db.prepare('SELECT * FROM unsubscribe_tokens WHERE token = ?').bind(token).first();
  if (!row) return { ok: false };
  const already = Boolean(row.used_at);
  await addSuppression(db, row.email, 'unsubscribe', 'Used the unsubscribe link', 'unsubscribe_link');
  await withdrawConsentsForEmail(db, row.email, 'Customer unsubscribed');
  await stopEnrollmentsForEmail(db, row.email, 'unsubscribed', 'customer');
  await db.prepare('UPDATE unsubscribe_tokens SET used_at = COALESCE(used_at, ?) WHERE token = ?').bind(nowIso(), token).run();
  return { ok: true, alreadyDone: already };
}

// ------------------------------------------------------------------ schedule persistence

/** Recomputes planned_for for steps that are not finished (after a send/skip/resume). */
export async function reprojectEnrollment(db, enrollmentId, settings) {
  const rows = await db.prepare('SELECT * FROM enrollment_steps WHERE enrollment_id = ? ORDER BY step_no').bind(enrollmentId).all();
  const steps = rows.results || [];
  const next = reproject(steps, settings);
  const stmts = [];
  for (let i = 0; i < steps.length; i++) {
    if (STEP_TERMINAL.includes(steps[i].status)) continue;
    if (next[i].planned_for !== steps[i].planned_for) {
      stmts.push(db.prepare('UPDATE enrollment_steps SET planned_for = ?, updated_at = ? WHERE id = ?').bind(next[i].planned_for, nowIso(), steps[i].id));
    }
  }
  if (stmts.length) await db.batch(stmts);
}

/** Marks the enrollment complete once no step can still be sent. */
export async function completeIfDone(db, enrollmentId) {
  const open = await db
    .prepare("SELECT COUNT(*) AS n FROM enrollment_steps WHERE enrollment_id = ? AND status IN ('planned', 'approved', 'queued')")
    .bind(enrollmentId)
    .first();
  if (open.n > 0) return false;
  const now = nowIso();
  const res = await db
    .prepare("UPDATE enrollments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'active'")
    .bind(now, now, enrollmentId)
    .run();
  return Boolean(res.meta && res.meta.changes);
}

// ------------------------------------------------------------------ shared budget

/**
 * Counts what the account has already used, across EVERYTHING sent through
 * Resend: confirmations, internal notifications (email_jobs), follow-ups and
 * test emails (followup_sends). Resend's daily quota resets at UTC midnight,
 * so days are UTC days. 'sending' counts as used (it may have been accepted).
 */
export async function usage(db, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM email_jobs WHERE status IN ('sent','sending') AND substr(updated_at,1,10) = ?)
        + (SELECT COUNT(*) FROM followup_sends WHERE status IN ('sent','sending') AND substr(updated_at,1,10) = ?) AS day_all,
        (SELECT COUNT(*) FROM email_jobs WHERE status IN ('sent','sending') AND substr(updated_at,1,7) = ?)
        + (SELECT COUNT(*) FROM followup_sends WHERE status IN ('sent','sending') AND substr(updated_at,1,7) = ?) AS month_all,
        (SELECT COUNT(*) FROM followup_sends WHERE kind = 'followup' AND status IN ('sent','sending') AND substr(updated_at,1,10) = ?) AS day_followups`
    )
    .bind(day, day, month, month, day)
    .first();
  return { day, month, day_all: row.day_all, month_all: row.month_all, day_followups: row.day_followups };
}

/**
 * May one more email of this kind go out right now?
 *   followup: must leave the confirmation reserve untouched and stay under the follow-up cap
 *   test:     may use any remaining capacity (still counts toward the shared budget)
 */
export async function budgetFor(db, settings, kind, now = new Date()) {
  const u = await usage(db, now);
  const dayCap = Number(settings.account_daily_cap);
  const monthCap = Number(settings.account_monthly_cap);
  const dayReserve = kind === 'followup' ? Number(settings.confirmation_reserve) : 0;
  const monthReserve = kind === 'followup' ? Number(settings.monthly_reserve) : 0;
  const followCap = Number(settings.followup_daily_cap);
  let reason = null;
  if (u.day_all + 1 > dayCap - dayReserve) reason = 'daily_capacity';
  else if (u.month_all + 1 > monthCap - monthReserve) reason = 'monthly_capacity';
  else if (kind === 'followup' && u.day_followups + 1 > followCap) reason = 'followup_cap';
  return { ok: reason === null, reason, ...u, day_cap: dayCap, month_cap: monthCap };
}
