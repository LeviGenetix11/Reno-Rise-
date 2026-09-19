// Resend webhook receiver (POST /webhooks/resend).
//
// Resend signs webhooks with the Svix scheme: headers svix-id, svix-timestamp,
// svix-signature; the signed string is "<id>.<timestamp>.<raw body>"; the key is
// the base64 part of the "whsec_..." secret; the signature is base64(HMAC-SHA256)
// and the header may hold several space-separated "v1,<sig>" values.
//
// Fails closed: with no RESEND_WEBHOOK_SECRET configured every request is
// refused (503), and an unverifiable request is refused (401) before any
// processing. What it does:
//   email.bounced (Permanent) / email.complained / email.suppressed
//        -> suppress that recipient for follow-ups and stop their sequences
//   email.delivered
//        -> record delivered_at on the matching follow-up send
// Everything else is acknowledged and ignored. Handling is idempotent, so a
// redelivered event is harmless.

import { TEST_RECIPIENTS } from '../../../renorise-shared/sequence.js';
import { addSuppression, stopEnrollmentsForEmail } from '../../../renorise-shared/followup-db.js';

const TOLERANCE_SECONDS = 5 * 60;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** @returns {Promise<boolean>} */
export async function verifySvix({ id, timestamp, signature, body, secret, nowMs = Date.now() }) {
  if (!id || !timestamp || !signature || !secret || !secret.startsWith('whsec_')) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;
  let key;
  try {
    key = await crypto.subtle.importKey('raw', b64ToBytes(secret.slice(6)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return false;
  }
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && typeof sig === 'string' && safeEqual(sig, expected);
  });
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/** Recipients we must never suppress: our own inbox and the allow-listed test addresses. */
const isProtected = (email, env) => TEST_RECIPIENTS.includes(email) || email === String(env.INTERNAL_NOTIFY_EMAIL || '').toLowerCase();

async function suppressRecipients(env, db, recipients, reason, detail) {
  for (const raw of recipients) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email || isProtected(email, env)) continue;
    await addSuppression(db, email, reason, detail, 'resend_webhook');
    await stopEnrollmentsForEmail(db, email, reason === 'complaint' ? 'suppressed_complaint' : 'suppressed_bounce', 'resend');
  }
}

export async function handleResendWebhook(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!env.RESEND_WEBHOOK_SECRET) return json({ ok: false, error: 'not_configured' }, 503);

  const body = await request.text();
  if (body.length > 200_000) return json({ ok: false, error: 'too_large' }, 413);
  const valid = await verifySvix({
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
    body,
    secret: env.RESEND_WEBHOOK_SECRET,
  });
  if (!valid) return json({ ok: false, error: 'invalid_signature' }, 401);

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const db = env.DB;
  const type = String(event.type || '');
  const data = event.data || {};
  const to = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];

  if (type === 'email.bounced') {
    if (String(data.bounce?.type || '').toLowerCase() === 'permanent') {
      await suppressRecipients(env, db, to, 'bounce', `Permanent bounce (${data.bounce?.subType || 'unspecified'})`);
    }
  } else if (type === 'email.complained') {
    await suppressRecipients(env, db, to, 'complaint', 'Recipient marked the email as spam');
  } else if (type === 'email.suppressed') {
    await suppressRecipients(env, db, to, 'bounce', 'Resend suppressed this address');
  } else if (type === 'email.delivered' && data.email_id) {
    await db
      .prepare('UPDATE followup_sends SET delivered_at = COALESCE(delivered_at, ?) WHERE resend_message_id = ?')
      .bind(new Date().toISOString(), String(data.email_id))
      .run();
  }

  // Audit / duplicate record (processing above is idempotent, so a redelivery is harmless).
  await db
    .prepare('INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)')
    .bind(request.headers.get('svix-id'), type, new Date().toISOString())
    .run();
  return json({ ok: true });
}
