// Email alerts for missed calls and finished voicemails.
//
// Runs from the existing 15-minute job (src/index.js scheduled()), through the existing
// Resend setup, using the same durable-row / Idempotency-Key / bounded-retry design as the
// confirmation emails and the shared daily / monthly email budget.
//
// One alert per call, guaranteed by UNIQUE(call_id): however many times Twilio repeats a
// callback, and whatever order callbacks arrive in, a call can only ever have one alert.
//
// An alert is only created once the call has SETTLED, so a voicemail whose completion
// callback is a little late is reported as a voicemail, not as a missed call:
//   * a voicemail: when Twilio confirms the recording, or 10 minutes after the call ended;
//   * a missed call (or hang-up with no message): 2 minutes after the call ended.
//
// The alert links to the private CRM call record. It never contains the audio, and the
// audio is never reachable without the dashboard sign-in.

import { sendViaResend } from '../email.js';
import { escapeHtml } from '../utils.js';
import { loadSettings, budgetFor } from '../../../renorise-shared/followup-db.js';
import { formatPhoneDisplay, formatDuration, OUTCOME_LABEL, HANGUP_STAGE_LABEL } from '../../../renorise-shared/calls.js';
import { formatDateTime } from '../../../renorise-shared/time.js';

const STALE_SENDING_MS = 10 * 60 * 1000;
const MISSED_SETTLE_MS = 2 * 60 * 1000;
const VOICEMAIL_SETTLE_MS = 10 * 60 * 1000;
const LOOKBACK_MS = 7 * 24 * 3600 * 1000; // after a long outage, still tell you about the last week, not everything
const MAX_PER_RUN = 10;
const DEFAULT_DASHBOARD = 'https://renorise-dashboard.levi-gene-ous.workers.dev';

const newId = () => crypto.randomUUID();

/** Builds the alert email. Every dynamic value is escaped. */
export function callAlertEmail(call, contactName, env) {
  const who = call.caller_withheld || !call.from_number ? 'a withheld number' : formatPhoneDisplay(call.from_number);
  const isVoicemail = call.outcome === 'voicemail';
  const length = isVoicemail && call.recording_duration_seconds ? formatDuration(call.recording_duration_seconds) : null;
  const base = String(env.DASHBOARD_BASE_URL || DEFAULT_DASHBOARD).replace(/\/+$/, '');
  const link = `${base}/calls/${call.id}`;
  const subject = isVoicemail ? `New RenoRise voicemail${length ? ` (${length})` : ''} from ${who}` : `Missed RenoRise call from ${who}`;
  const outcomeText = OUTCOME_LABEL[call.outcome] || call.outcome;
  const detail = call.outcome === 'no_message' ? HANGUP_STAGE_LABEL.voicemail : call.outcome === 'missed' ? HANGUP_STAGE_LABEL[call.hangup_stage] || '' : '';
  const unconfirmed = isVoicemail && call.recording_status !== 'completed' ? 'Twilio has not confirmed the recording yet, so it may not be playable. Check the call record.' : '';
  const rows = [
    ['Caller', who],
    ['When (Toronto)', formatDateTime(call.started_at)],
    ['Result', outcomeText],
    ...(length ? [['Voicemail length', length]] : []),
    ...(contactName ? [['Matched contact', contactName]] : [['Matched contact', 'None yet: link it or create a lead in the CRM']]),
  ];
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#14171d;">
      <h1 style="font-size:18px;">${isVoicemail ? 'New voicemail' : 'Missed call'} on the RenoRise business line</h1>
      <table cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(v)}</td></tr>`).join('')}</table>
      ${detail ? `<p style="font-size:14px;">${escapeHtml(detail)}.</p>` : ''}
      ${unconfirmed ? `<p style="font-size:14px;">${escapeHtml(unconfirmed)}</p>` : ''}
      <p style="margin-top:18px;"><a href="${escapeHtml(link)}" style="background:#b94a09;color:#ffffff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">Open the call record</a></p>
      <p style="color:#6b7280;font-size:12px;">You need to be signed in to the private dashboard to listen. The audio is never attached to this email.</p>
    </div>`.trim();
  const text = [
    `${isVoicemail ? 'New voicemail' : 'Missed call'} on the RenoRise business line`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(detail ? [detail + '.'] : []),
    ...(unconfirmed ? [unconfirmed] : []),
    `Open the call record: ${link}`,
    'You need to be signed in to the private dashboard to listen. The audio is never attached to this email.',
  ].join('\n');
  return { from: env.CUSTOMER_FROM_EMAIL, to: env.INTERNAL_NOTIFY_EMAIL, replyTo: env.REPLY_TO_EMAIL, subject, html, text };
}

/**
 * One pass: create alerts for calls that have settled, then send / retry any that are due.
 * Returns { created, sent, failed, waiting } for logs and tests.
 */
export async function runCallAlerts(env, db, { now = new Date() } = {}) {
  const out = { created: 0, sent: 0, failed: 0, waiting: 0 };
  const iso = (ms) => new Date(ms).toISOString();

  // 1. Calls that have settled and do not have an alert yet. INSERT ... DO NOTHING makes a second alert impossible.
  const candidates = (
    await db
      .prepare(
        `SELECT c.id, c.outcome FROM calls c
         WHERE c.disposition = 'open' AND c.ended_at IS NOT NULL AND c.ended_at > ?
           AND c.outcome IN ('missed', 'no_message', 'voicemail')
           AND NOT EXISTS (SELECT 1 FROM call_alerts a WHERE a.call_id = c.id)
           AND ( (c.outcome = 'voicemail' AND (c.recording_status = 'completed' OR c.ended_at <= ?))
              OR (c.outcome IN ('missed', 'no_message') AND c.ended_at <= ?) )
         ORDER BY c.ended_at LIMIT ?`
      )
      .bind(iso(now.getTime() - LOOKBACK_MS), iso(now.getTime() - VOICEMAIL_SETTLE_MS), iso(now.getTime() - MISSED_SETTLE_MS), MAX_PER_RUN)
      .all()
  ).results || [];
  for (const c of candidates) {
    const res = await db
      .prepare("INSERT INTO call_alerts (id, call_id, kind, idempotency_key, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?) ON CONFLICT(call_id) DO NOTHING")
      .bind(newId(), c.id, c.outcome === 'voicemail' ? 'voicemail' : 'missed', `call-alert:${c.id}`, now.toISOString(), now.toISOString())
      .run();
    if (res.meta && res.meta.changes) out.created++;
  }

  // 2. Send (or retry) whatever is due, within the shared email budget.
  const settings = await loadSettings(db);
  const due = (
    await db
      .prepare(
        `SELECT * FROM call_alerts WHERE attempts < max_attempts AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < ?)) ORDER BY created_at LIMIT ?`
      )
      .bind(iso(now.getTime() - STALE_SENDING_MS), MAX_PER_RUN)
      .all()
  ).results || [];
  for (const alert of due) {
    if (!(await budgetFor(db, settings, 'test', now)).ok) { out.waiting++; break; } // shared daily / monthly limit: try again later
    const claim = await db
      .prepare("UPDATE call_alerts SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND attempts < max_attempts AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < ?))")
      .bind(now.toISOString(), alert.id, iso(now.getTime() - STALE_SENDING_MS))
      .run();
    if (!claim.meta || claim.meta.changes === 0) continue; // another run has it
    const call = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(alert.call_id).first();
    if (!call || call.disposition !== 'open') {
      // Marked spam / irrelevant since the alert was queued: nothing to report.
      await db.prepare("UPDATE call_alerts SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now.toISOString(), alert.id).run();
      continue;
    }
    let accepted = false;
    try {
      const contact = call.contact_id ? await db.prepare('SELECT display_name FROM contacts WHERE id = ?').bind(call.contact_id).first() : null;
      const email = callAlertEmail(call, contact && contact.display_name, env);
      const messageId = await sendViaResend(env, email, alert.idempotency_key);
      accepted = true;
      await db.prepare("UPDATE call_alerts SET status = 'sent', resend_message_id = ?, updated_at = ? WHERE id = ?").bind(messageId, now.toISOString(), alert.id).run();
      await db.prepare("INSERT INTO call_events (id, call_id, kind, summary, actor, created_at) VALUES (?, ?, 'alert_sent', ?, 'system', ?)").bind(newId(), call.id, `Email alert accepted by Resend for ${env.INTERNAL_NOTIFY_EMAIL || 'the business inbox'}`, now.toISOString()).run();
      out.sent++;
    } catch (err) {
      if (accepted) {
        // Resend HAS it; only our bookkeeping failed. Leave it 'sending': the stale-claim recovery re-runs it with the
        // same Idempotency-Key (Resend returns the original id), so the alert is never sent twice.
        console.log(`Call alert ${alert.id}: accepted by the provider but recording failed (${String(err.message).slice(0, 100)})`);
        continue;
      }
      const exhausted = err.permanent === true || alert.attempts + 1 >= alert.max_attempts;
      await db
        .prepare('UPDATE call_alerts SET status = ?, last_error = ?, attempts = MAX(attempts, ?), updated_at = ? WHERE id = ?')
        .bind(exhausted ? 'failed' : 'pending', String(err.message).slice(0, 300), exhausted ? alert.max_attempts : 0, now.toISOString(), alert.id)
        .run();
      out.failed++;
      console.log(`Call alert ${alert.id} failed: ${String(err.message).slice(0, 120)}`);
    }
  }
  return out;
}
