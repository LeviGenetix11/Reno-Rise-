// Public unsubscribe endpoint for the follow-up emails.
//
//   GET  /u/:token  shows a confirmation page. It NEVER changes anything (mail
//                   scanners and link prefetchers issue GETs).
//   POST /u/:token  performs the unsubscribe. This is also what mail apps call
//                   for RFC 8058 "one-click" (List-Unsubscribe-Post), so it must
//                   need nothing except the unguessable token in the URL.
//
// The page reveals nothing about the recipient (no name or address).

import { applyUnsubscribe } from '../../../renorise-shared/followup-db.js';

function page(title, body, status = 200) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<style nonce="${nonce}">body{font:16px/1.6 system-ui,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 16px;color:#14171d}button{font:inherit;font-weight:600;padding:12px 20px;border-radius:8px;border:1px solid #14171d;background:#14171d;color:#fff;cursor:pointer;min-height:44px}p.small{color:#5b6472;font-size:14px}</style></head>` +
      `<body><main><h1>${title}</h1>${body}</main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      },
    }
  );
}

export async function handleUnsubscribe(request, env, token) {
  const db = env.DB;
  const known = /^[A-Za-z0-9_-]{20,80}$/.test(token) ? await db.prepare('SELECT token FROM unsubscribe_tokens WHERE token = ?').bind(token).first() : null;
  const invalid = () => page('This link isn’t valid', '<p>The unsubscribe link may be incomplete. Please email <a href="mailto:hello@renosrise.com">hello@renosrise.com</a> and we will remove you.</p>', 404);

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!known) return invalid();
    return page(
      'Unsubscribe from RenoRise follow-up emails',
      `<p>Confirm below and you will not receive any more follow-up emails from RenoRise about your inquiry.</p><form method="post"><button type="submit">Unsubscribe me</button></form><p class="small">This does not affect any message you asked us to send you directly.</p>`
    );
  }

  if (request.method === 'POST') {
    if (!known) return invalid();
    const res = await applyUnsubscribe(db, token);
    if (!res.ok) return invalid();
    return page('You’re unsubscribed', '<p>You will not receive any more follow-up emails from RenoRise. If this was a mistake, email <a href="mailto:hello@renosrise.com">hello@renosrise.com</a>.</p>');
  }

  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
}
