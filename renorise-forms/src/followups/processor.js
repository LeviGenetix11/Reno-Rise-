// The follow-up sequence processor. There is exactly ONE, and it runs from the
// existing 15-minute cron in src/index.js (after the confirmation-retry sweep,
// so confirmations and internal notifications are always handled first).
//
// Guarantees, mirroring the confirmation system:
//   - Atomic claims: a step goes approved -> queued with a conditional UPDATE,
//     and a send goes pending -> sending the same way, so concurrent runs cannot
//     send the same follow-up twice.
//   - Stable idempotency key per enrollment step ("fu:<enrollment>:<step>"), sent
//     to Resend as the Idempotency-Key, so an ambiguous outcome (timeout, crash
//     after Resend accepted it) is safe to retry.
//   - Bounded retries; a step whose send fails stays 'queued' and BLOCKS later
//     steps until staff retry or skip it.
//   - Eligibility is re-verified before every send and again right after the
//     send is claimed.
//   - No catch-up bursts: only the lowest open step of an enrollment can ever
//     be sent, and each send re-projects the remaining dates.

import { sendViaResend } from '../email.js';
import { renderFollowup, FROM, REPLY_TO } from '../../../renorise-shared/templates.js';
import { bookingLinkFor, bookingPreviewUrl } from '../../../renorise-shared/bookings-db.js';
import { TEST_RECIPIENTS, inSendWindow } from '../../../renorise-shared/sequence.js';
import { stopReasonFor, deferReasonFor } from '../../../renorise-shared/eligibility.js';
import {
  loadSettings,
  businessDetailsOk,
  getSuppression,
  stopEnrollment,
  reprojectEnrollment,
  completeIfDone,
  budgetFor,
} from '../../../renorise-shared/followup-db.js';

const STALE_SENDING_MS = 10 * 60 * 1000; // a send stuck in 'sending' this long is recovered (same idempotency key)
const MAX_PER_RUN = 10; // per cron run; also keeps well under Resend's 10 requests/second

const newId = () => crypto.randomUUID();
const nowIso = (now) => now.toISOString();

/**
 * One cron pass.
 * @param {Date} [opts.now]   injectable clock (tests use a simulated clock)
 */
export async function runFollowups(env, db, { now = new Date() } = {}) {
  const summary = { tests: 0, sent: 0, stopped: 0, deferred: {}, skipped: null };
  const settings = await loadSettings(db);

  // Dashboard test emails (only ever to the two allow-listed addresses) are
  // independent of the global switch, so staff can review real rendering while
  // customer follow-ups remain OFF.
  summary.tests = await processTests(env, db, settings, now);

  if (settings.global_send_enabled !== '1') {
    summary.skipped = 'global_switch_off';
    return summary;
  }

  // Only the lowest open step of each enrollment is a candidate.
  const rows = await db
    .prepare(
      `SELECT s.* FROM enrollment_steps s
       JOIN enrollments e ON e.id = s.enrollment_id
       WHERE e.status IN ('active', 'paused')
         AND s.status IN ('approved', 'queued')
         AND NOT EXISTS (
           SELECT 1 FROM enrollment_steps p
           WHERE p.enrollment_id = s.enrollment_id AND p.step_no < s.step_no AND p.status IN ('planned', 'approved', 'queued')
         )
       ORDER BY s.planned_for ASC, s.id ASC
       LIMIT ?`
    )
    .bind(MAX_PER_RUN)
    .all();

  for (const step of rows.results || []) {
    const outcome = await processStep(env, db, settings, step, now);
    if (outcome === 'sent') summary.sent++;
    else if (outcome === 'stopped') summary.stopped++;
    else if (outcome.startsWith('deferred:')) {
      const why = outcome.slice(9);
      summary.deferred[why] = (summary.deferred[why] || 0) + 1;
      if (why.startsWith('budget_')) break; // capacity is exhausted: stop trying this run
    }
  }
  return summary;
}

async function loadContext(db, step) {
  const enrollment = await db.prepare('SELECT * FROM enrollments WHERE id = ?').bind(step.enrollment_id).first();
  const lead = enrollment ? await db.prepare('SELECT * FROM leads WHERE id = ?').bind(enrollment.lead_id).first() : null;
  const consent = enrollment ? await db.prepare('SELECT * FROM consents WHERE id = ?').bind(enrollment.consent_id).first() : null;
  const suppression = lead ? await getSuppression(db, lead.email) : null;
  return { enrollment, lead, consent, suppression };
}

async function processStep(env, db, settings, step, now) {
  const { enrollment, lead, consent, suppression } = await loadContext(db, step);
  if (!enrollment) return 'deferred:enrollment_missing';

  // 1. Permanent stop conditions.
  const stop = stopReasonFor({ lead, consent, suppression });
  if (stop) {
    await stopEnrollment(db, enrollment.id, stop, 'system');
    return 'stopped';
  }

  // 2. Temporary reasons to wait.
  const budget = await budgetFor(db, settings, 'followup', now);
  const defer = deferReasonFor({
    enrollment,
    step,
    now,
    settings,
    inWindow: inSendWindow(now, settings),
    budget,
    webhookConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
    businessDetailsOk: businessDetailsOk(settings),
  });
  if (defer) return `deferred:${defer}`;

  // 3. Claim the step (approved -> queued) and create its durable send row.
  const key = `fu:${enrollment.id}:${step.step_no}`;
  if (step.status === 'approved') {
    const claim = await db
      .prepare("UPDATE enrollment_steps SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'approved'")
      .bind(nowIso(now), step.id)
      .run();
    if (!claim.meta || claim.meta.changes === 0) return 'deferred:raced';
    await db
      .prepare(
        `INSERT INTO followup_sends (id, kind, enrollment_step_id, lead_id, to_email, idempotency_key, template, variant, status, attempts, created_at, updated_at)
         VALUES (?, 'followup', ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .bind(newId(), step.id, lead.id, lead.email, key, step.template, enrollment.source_kind === 'call' ? 'call' : 'website', nowIso(now), nowIso(now))
      .run();
    await db.prepare('UPDATE enrollment_steps SET send_id = (SELECT id FROM followup_sends WHERE idempotency_key = ?) WHERE id = ?').bind(key, step.id).run();
  }

  const send = await db.prepare('SELECT * FROM followup_sends WHERE idempotency_key = ?').bind(key).first();
  if (!send) return 'deferred:no_send_row';
  return attemptFollowupSend(env, db, settings, { send, step, enrollment, now });
}

async function attemptFollowupSend(env, db, settings, { send, step, enrollment, now }) {
  const staleCutoff = new Date(now.getTime() - STALE_SENDING_MS).toISOString();
  const claim = await db
    .prepare(
      `UPDATE followup_sends SET status = 'sending', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND attempts < max_attempts AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < ?))`
    )
    .bind(nowIso(now), send.id, staleCutoff)
    .run();
  if (!claim.meta || claim.meta.changes === 0) return 'deferred:not_claimed';

  // Re-verify right after the claim: the lead may have changed a moment ago.
  const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(enrollment.lead_id).first();
  const consent = await db.prepare('SELECT * FROM consents WHERE id = ?').bind(enrollment.consent_id).first();
  const fresh = await db.prepare('SELECT status FROM enrollments WHERE id = ?').bind(enrollment.id).first();
  if (fresh && fresh.status === 'paused') {
    // Paused a moment ago: give the claim back untouched (does not count as an attempt).
    await db.prepare("UPDATE followup_sends SET status = 'pending', attempts = attempts - 1, updated_at = ? WHERE id = ? AND status = 'sending'").bind(nowIso(now), send.id).run();
    return 'deferred:enrollment_paused';
  }
  const stop =fresh && ['stopped', 'completed'].includes(fresh.status) ? 'staff' : stopReasonFor({ lead, consent, suppression: lead ? await getSuppression(db, lead.email) : null });
  if (stop) {
    await db.prepare("UPDATE followup_sends SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(now), send.id).run();
    if (!fresh || fresh.status === 'active' || fresh.status === 'paused') await stopEnrollment(db, enrollment.id, stop, 'system');
    return 'stopped';
  }

  let accepted = false; // true once the provider has taken the email
  try {
    const token = await db.prepare('SELECT token FROM unsubscribe_tokens WHERE enrollment_id = ?').bind(enrollment.id).first();
    if (!token) throw Object.assign(new Error('missing_unsubscribe_token'), { permanent: true });
    const base = String(settings.unsubscribe_base_url).replace(/\/+$/, '');
    // The booking link is added only when the owner has set AND tested it; the sender never invents one.
    const bookingUrl = await bookingLinkFor(db, settings, lead);
    const email = renderFollowup({
      bookingUrl,
      templateKey: step.template,
      variant: enrollment.source_kind === 'call' ? 'call' : 'website',
      name: lead.name,
      legalName: settings.business_legal_name,
      mailingAddress: settings.business_mailing_address,
      unsubscribeUrl: `${base}/u/${token.token}`,
    });
    const messageId = await sendViaResend(
      env,
      { from: FROM, to: lead.email, replyTo: REPLY_TO, subject: email.subject, html: email.html, text: email.text, headers: email.headers },
      send.idempotency_key
    );
    accepted = true;
    const done = nowIso(now);
    await db.batch([
      db.prepare("UPDATE followup_sends SET status = 'sent', resend_message_id = ?, updated_at = ? WHERE id = ?").bind(messageId, done, send.id),
      db.prepare("UPDATE enrollment_steps SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").bind(done, done, step.id),
      db
        .prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId(), lead.id, 'followup_sent', `Follow-up email ${step.step_no} sent (accepted by Resend; inbox delivery not verified until Resend reports it)`, 'system', done),
    ]);
  } catch (err) {
    if (accepted) {
      // The provider HAS the email; only our bookkeeping failed. Never turn that into a
      // 'failed'/'pending' send (which could look like an unsent email). Leave it
      // 'sending': the stale-claim recovery re-runs it with the same Idempotency-Key
      // (Resend returns the original message id) and records it then.
      console.log(`Follow-up send ${send.id}: accepted by the provider but recording failed (${err.message}); will reconcile`);
      return 'deferred:recording_failed';
    }
    const exhausted = err.permanent === true || send.attempts + 1 >= send.max_attempts;
    await db
      .prepare('UPDATE followup_sends SET status = ?, last_error = ?, attempts = MAX(attempts, ?), updated_at = ? WHERE id = ?')
      .bind(exhausted ? 'failed' : 'pending', String(err.message).slice(0, 500), exhausted ? send.max_attempts : 0, nowIso(now), send.id)
      .run();
    console.log(`Follow-up send ${send.id} failed: ${err.message}`);
    return `deferred:send_${exhausted ? 'failed' : 'retry'}`;
  }

  // Housekeeping AFTER a confirmed send. An error here must never re-queue an email that already went out.
  try {
    await reprojectEnrollment(db, enrollment.id, settings);
    await completeIfDone(db, enrollment.id);
  } catch (err) {
    console.log(`Follow-up ${send.id}: sent, but schedule update failed (${err.message})`);
  }
  return 'sent';
}

// ------------------------------------------------------------------ test emails

/**
 * Dashboard "send test" emails. Recipients are hard-limited to TEST_RECIPIENTS;
 * they use the same shared budget; and they are marked [TEST] in the subject.
 */
async function processTests(env, db, settings, now) {
  const staleCutoff = new Date(now.getTime() - STALE_SENDING_MS).toISOString();
  const rows = await db
    .prepare(
      `SELECT * FROM followup_sends WHERE kind = 'test' AND attempts < max_attempts
         AND (status = 'pending' OR (status = 'sending' AND updated_at < ?)) ORDER BY created_at LIMIT 5`
    )
    .bind(staleCutoff)
    .all();
  let sent = 0;
  for (const send of rows.results || []) {
    if (!TEST_RECIPIENTS.includes(String(send.to_email).toLowerCase())) {
      await db.prepare("UPDATE followup_sends SET status = 'cancelled', last_error = 'recipient not allowed', updated_at = ? WHERE id = ?").bind(nowIso(now), send.id).run();
      continue;
    }
    if (!(await budgetFor(db, settings, 'test', now)).ok) break;
    const claim = await db
      .prepare("UPDATE followup_sends SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND attempts < max_attempts AND (status = 'pending' OR (status = 'sending' AND updated_at < ?))")
      .bind(nowIso(now), send.id, staleCutoff)
      .run();
    if (!claim.meta || claim.meta.changes === 0) continue;
    try {
      const base = String(settings.unsubscribe_base_url).replace(/\/+$/, '');
      const email = renderFollowup({
        templateKey: send.template,
        variant: send.variant,
        name: send.test_name,
        legalName: settings.business_legal_name,
        mailingAddress: settings.business_mailing_address,
        unsubscribeUrl: `${base}/u/test-preview-link-not-active`,
        bookingUrl: bookingPreviewUrl(settings), // lets the owner click the real link from a test email before marking it tested
        preview: true, // tests may show clearly-marked placeholders for missing business details
        test: true,
      });
      const id = await sendViaResend(env, { from: FROM, to: send.to_email, replyTo: REPLY_TO, subject: email.subject, html: email.html, text: email.text, headers: email.headers }, send.idempotency_key);
      await db.prepare("UPDATE followup_sends SET status = 'sent', resend_message_id = ?, updated_at = ? WHERE id = ?").bind(id, nowIso(now), send.id).run();
      sent++;
    } catch (err) {
      const exhausted = err.permanent === true || send.attempts + 1 >= send.max_attempts;
      await db
        .prepare('UPDATE followup_sends SET status = ?, last_error = ?, attempts = MAX(attempts, ?), updated_at = ? WHERE id = ?')
        .bind(exhausted ? 'failed' : 'pending', String(err.message).slice(0, 500), exhausted ? send.max_attempts : 0, nowIso(now), send.id)
        .run();
    }
  }
  return sent;
}
