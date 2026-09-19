// CSRF protection + response hardening.
//
// Access authenticates with a cookie, and browsers attach cookies to
// cross-site requests, so every state-changing request needs its own proof of
// origin. Two independent checks (both must pass):
//
//   1. Origin: the Origin header must EXACTLY equal this dashboard's own origin.
//      "null", a missing header, or any other site is refused. If the browser
//      also sends Sec-Fetch-Site, it must say "same-origin".
//   2. A CSRF token in the form body: HMAC-SHA256 of the signed-in email with a
//      server-side secret (CSRF_SECRET), rotated daily. Another site can
//      neither read nor guess it. It does not depend on Access's token
//      internals, so an Access token refresh cannot invalidate an open form.
//
// IMPORTANT (browser behaviour): with `Referrer-Policy: no-referrer` browsers
// send `Origin: null` on same-origin form posts, which the strict Origin check
// (correctly) refuses. So the policy is `same-origin`: the real Origin is sent
// to this site, and nothing at all is sent to other sites.

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

const dayBucket = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export const csrfSecretOk = (secret) => typeof secret === 'string' && secret.trim().length >= 32;

/** Token for the signed-in admin, valid for today (UTC) and the following day. */
export function csrfToken(secret, email) {
  return hmacHex(secret, `renorise-dashboard-csrf:v2:${email}:${dayBucket(0)}`);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns null when the request's Origin is acceptable, otherwise a short
 * reason code (for the log). Never broadened: only an exact same-origin match.
 */
export function originProblem(request) {
  const origin = request.headers.get('Origin');
  if (origin === null) return 'origin_missing';
  if (origin === 'null') return 'origin_null';
  if (origin !== new URL(request.url).origin) return 'origin_mismatch';
  const site = request.headers.get('Sec-Fetch-Site');
  if (site !== null && site !== 'same-origin') return 'fetch_site_not_same_origin';
  return null;
}

/** Accepts today's token, or yesterday's (a page opened shortly before UTC midnight). */
export async function tokenOk(formData, secret, email) {
  const given = String(formData.get('csrf') || '');
  const today = await csrfToken(secret, email);
  const yesterday = await hmacHex(secret, `renorise-dashboard-csrf:v2:${email}:${dayBucket(1)}`);
  // Evaluate both (no early exit) so timing does not reveal which matched.
  const a = safeEqual(given, today);
  const b = safeEqual(given, yesterday);
  return a || b;
}

export function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function securityHeaders(nonce) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
  };
}
