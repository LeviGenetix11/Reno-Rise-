// CSRF protection + response hardening.
//
// Access authenticates with a cookie, and browsers attach cookies to
// cross-site requests, so every state-changing request needs its own proof of
// origin. Two independent checks (both must pass):
//   1. Origin header must equal this dashboard's own origin.
//   2. A per-session token in the form body: SHA-256 of the signature segment
//      of the caller's Access JWT. Another site can neither read nor guess it.

export async function csrfToken(jwt) {
  const sig = jwt.split('.')[2] || '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`renorise-dashboard-csrf:${sig}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function originOk(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false; // browsers always send Origin on form POSTs
  return origin === new URL(request.url).origin;
}

export async function tokenOk(formData, jwt) {
  return safeEqual(String(formData.get('csrf') || ''), await csrfToken(jwt));
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
    'Referrer-Policy': 'no-referrer',
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
