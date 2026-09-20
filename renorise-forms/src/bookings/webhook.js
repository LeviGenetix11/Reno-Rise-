// Cal.com webhook receiver (POST /webhooks/calcom).
//
// Public, but only a request signed with the shared secret does anything: Cal.com signs the raw body with HMAC-SHA256
// and sends it in the X-Cal-Signature-256 header. Fails closed: without CAL_WEBHOOK_SECRET every request is refused
// (503); an unverifiable request is refused (401) before anything is parsed. All processing (idempotency, ordering,
// matching, appointment and follow-up effects) is in renorise-shared/bookings-db.js.
//
// The secret is set with `wrangler secret put CAL_WEBHOOK_SECRET` and is never logged or stored in the database.
// Nothing sensitive is written to the logs: no payload, no attendee details, no booking links.

import { receiveCalWebhook } from '../../../renorise-shared/bookings-db.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handleCalWebhook(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const rawBody = await request.text();
  try {
    const { status, body } = await receiveCalWebhook({
      db: env.DB,
      secret: env.CAL_WEBHOOK_SECRET,
      rawBody,
      signature: request.headers.get('x-cal-signature-256'),
    });
    return json(body, status);
  } catch (err) {
    console.log('Cal.com webhook error:', err && err.message ? err.message.slice(0, 200) : 'unknown');
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
