// Reno Rise lead-capture Worker.
//
// POST /api/leads   — validate, spam-check, rate-limit, save a lead,
//                      then send the two emails (customer ack + internal
//                      notification) best-effort in the background.
// scheduled()        — cron sweep (every 15 min, see wrangler.toml) that
//                      retries any email_jobs row still pending/failed,
//                      bounded by max_attempts. This is what makes email
//                      delivery durable instead of a fire-and-forget
//                      promise: the row survives even if the Worker
//                      instance that first tried is long gone.
//
// The database is never exposed for reading — this file has no GET
// route that returns lead data.

import { newId, nowIso, resolveOrigin, corsHeaders, jsonResponse, hashIp } from './utils.js';
import { validateLead } from './validate.js';
import { verifyTurnstile } from './turnstile.js';
import { isRateLimited, recordRequest, pruneOldEvents } from './ratelimit.js';
import { sendViaResend, customerAckEmail, internalNotificationEmail } from './email.js';
import { runFollowups } from './followups/processor.js';
import { handleUnsubscribe } from './followups/unsubscribe.js';
import { handleResendWebhook } from './followups/webhook.js';

const MAX_BODY_BYTES = 20_000; // generous for this form; blocks absurd payloads
// A job left in 'sending' longer than this means the invocation that
// claimed it died mid-send; it becomes eligible again (Resend's
// Idempotency-Key makes the re-send safe).
const STALE_SENDING_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowedOrigin = resolveOrigin(request, env);

    // Follow-up sequence endpoints (public, but each is protected by its own
    // secret: an unguessable token, or a verified Resend signature). They do not
    // touch the /api/leads form path below.
    const unsub = /^\/u\/([A-Za-z0-9_-]{1,80})$/.exec(url.pathname);
    if (unsub) return handleUnsubscribe(request, env, unsub[1]);
    if (url.pathname === '/webhooks/resend') return handleResendWebhook(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (url.pathname !== '/api/leads') {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, corsHeaders(allowedOrigin));
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders(allowedOrigin));
    }

    // Origin allowlist: reject cross-origin browser calls from anywhere
    // not explicitly configured. (A non-browser client can still spoof
    // Origin, which is why Turnstile + rate limiting exist below — this
    // is one layer, not the spam defense.)
    if (request.headers.get('Origin') && !allowedOrigin) {
      return jsonResponse({ ok: false, error: 'origin_not_allowed' }, 403, corsHeaders(null));
    }

    const headers = corsHeaders(allowedOrigin);
    const db = env.DB;

    try {
      const contentLength = Number(request.headers.get('Content-Length') || '0');
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: 'payload_too_large' }, 413, headers);
      }

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipHash = await hashIp(ip);

      if (await isRateLimited(db, ipHash)) {
        return jsonResponse({ ok: false, error: 'rate_limited' }, 429, headers);
      }
      await recordRequest(db, ipHash);

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400, headers);
      }

      const validation = validateLead(body);
      if (!validation.ok) {
        return jsonResponse({ ok: false, error: 'validation_failed', fields: validation.fields }, 400, headers);
      }
      const data = validation.data;

      const turnstileResult = await verifyTurnstile(data.turnstile_token, env.TURNSTILE_SECRET_KEY, ip);
      if (!turnstileResult.success) {
        // Deliberately vague to the client — no need to teach a bot which
        // check it failed. Reason is only in the Worker's own logs.
        console.log('Turnstile failed:', turnstileResult.reason);
        return jsonResponse({ ok: false, error: 'spam_check_failed' }, 403, headers);
      }

      const lead = await saveLead(db, data);

      // Attempt delivery now, but the durable email_jobs rows created
      // inside saveLead() mean a failure here is never the end of the
      // story — the cron sweep in `scheduled()` will keep retrying.
      ctx.waitUntil(sendPendingEmailsForLead(env, db, lead.id).catch((err) => {
        console.log('Background email send threw:', err.message);
      }));

      return jsonResponse({ ok: true, leadId: lead.id }, 201, headers);
    } catch (err) {
      console.log('Unhandled error in POST /api/leads:', err.message);
      return jsonResponse({ ok: false, error: 'server_error' }, 500, headers);
    }
  },

  async scheduled(event, env, ctx) {
    const db = env.DB;
    ctx.waitUntil((async () => {
      await pruneOldEvents(db);
      await retryPendingEmailJobs(env, db);
      // Follow-ups run AFTER confirmations/notifications, and can never break them.
      try {
        await runFollowups(env, db);
      } catch (err) {
        console.log('Follow-up processor error:', err.message);
      }
    })());
  },
};

/**
 * Inserts the lead and its two email_jobs rows. Uses ON CONFLICT DO
 * NOTHING on each idempotency key so a retried client request (same
 * idempotency_key) never creates a second lead or a second pair of
 * email jobs — it always resolves to the original row.
 */
async function saveLead(db, data) {
  const id = newId();
  const createdAt = nowIso();

  await db
    .prepare(
      `INSERT INTO leads (
        id, idempotency_key, created_at, name, email, phone, city,
        renovation_type, project_timing, target_deadline, project_details,
        source, status, customer_email_status, internal_email_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'pending', 'pending')
      ON CONFLICT(idempotency_key) DO NOTHING`
    )
    .bind(
      id,
      data.idempotency_key,
      createdAt,
      data.name,
      data.email,
      data.phone,
      data.city,
      data.renovation_type,
      data.project_timing,
      data.target_deadline,
      data.project_details,
      data.source
    )
    .run();

  // Whether this call just inserted the row or a prior retry already
  // did, this SELECT returns the one canonical row for that key.
  const lead = await db
    .prepare('SELECT * FROM leads WHERE idempotency_key = ?')
    .bind(data.idempotency_key)
    .first();

  await createEmailJobIfMissing(db, lead.id, 'customer');
  await createEmailJobIfMissing(db, lead.id, 'internal');

  return lead;
}

async function createEmailJobIfMissing(db, leadId, type) {
  const idempotencyKey = `${leadId}:${type}`;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`
    )
    .bind(newId(), leadId, type, idempotencyKey, now, now)
    .run();
}

function staleCutoffIso() {
  return new Date(Date.now() - STALE_SENDING_MS).toISOString();
}

/** Attempts to send both of a specific lead's email jobs right now. */
async function sendPendingEmailsForLead(env, db, leadId) {
  const jobs = await db
    .prepare("SELECT * FROM email_jobs WHERE lead_id = ? AND status IN ('pending', 'failed')")
    .bind(leadId)
    .all();
  for (const job of jobs.results || []) {
    await attemptSendJob(env, db, job);
  }
}

/** Cron sweep: retries any due job across all leads, oldest first, in small batches. */
async function retryPendingEmailJobs(env, db) {
  const jobs = await db
    .prepare(
      `SELECT * FROM email_jobs
       WHERE attempts < max_attempts
         AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < ?))
       ORDER BY created_at ASC
       LIMIT 20`
    )
    .bind(staleCutoffIso())
    .all();
  for (const job of jobs.results || []) {
    await attemptSendJob(env, db, job);
  }
}

/**
 * Sends a single email_jobs row. Claims it first with an optimistic
 * UPDATE (status must still be pending/failed) so a job already being
 * handled by another invocation is skipped instead of double-sent.
 */
async function attemptSendJob(env, db, job) {
  const claim = await db
    .prepare(
      `UPDATE email_jobs SET status = 'sending', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND attempts < max_attempts
         AND (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < ?))`
    )
    .bind(nowIso(), job.id, staleCutoffIso())
    .run();
  if (!claim.meta || claim.meta.changes === 0) return; // already claimed elsewhere

  const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(job.lead_id).first();
  if (!lead) {
    await db
      .prepare("UPDATE email_jobs SET status = 'failed', last_error = ?, attempts = max_attempts, updated_at = ? WHERE id = ?")
      .bind('Lead record not found', nowIso(), job.id)
      .run();
    return;
  }

  const template = job.email_type === 'customer' ? customerAckEmail(lead, env) : internalNotificationEmail(lead, env);
  const statusColumn = job.email_type === 'customer' ? 'customer_email_status' : 'internal_email_status';

  try {
    const messageId = await sendViaResend(env, template, job.idempotency_key);
    await db
      .prepare("UPDATE email_jobs SET status = 'sent', resend_message_id = ?, updated_at = ? WHERE id = ?")
      .bind(messageId, nowIso(), job.id)
      .run();
    await db
      .prepare(`UPDATE leads SET ${statusColumn} = 'sent' WHERE id = ?`)
      .bind(lead.id)
      .run();
  } catch (err) {
    const exhausted = err.permanent === true || job.attempts + 1 >= job.max_attempts;
    const nextStatus = exhausted ? 'failed' : 'pending';
    await db
      .prepare('UPDATE email_jobs SET status = ?, last_error = ?, attempts = MAX(attempts, ?), updated_at = ? WHERE id = ?')
      .bind(nextStatus, String(err.message).slice(0, 500), exhausted ? job.max_attempts : 0, nowIso(), job.id)
      .run();
    // Mirror onto the lead only once retries are exhausted — while a
    // retry is still scheduled, the lead's status stays "pending" rather
    // than flashing "failed" for something that hasn't actually given up.
    await db
      .prepare(`UPDATE leads SET ${statusColumn} = ? WHERE id = ?`)
      .bind(nextStatus, lead.id)
      .run();
    console.log(`Email job ${job.id} (${job.email_type}) failed: ${err.message}`);
  }
}
