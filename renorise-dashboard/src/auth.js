// Server-side authentication. The dashboard sits behind Cloudflare Access,
// which puts a signed JWT (RS256) in the Cf-Access-Jwt-Assertion header of
// every request it lets through. This module does NOT trust the header just
// because it is present: it verifies the signature against the team's public
// keys, the issuer, the audience (this specific Access application), the
// expiry, and that the signed-in email is on the ADMIN_EMAILS allowlist.
//
// Fails CLOSED: if the Access settings are not configured, every request is
// refused. Reaching this Worker's URL, or knowing it, grants nothing.

import { csrfSecretOk } from './security.js';

const KEY_CACHE_MS = 10 * 60 * 1000;
let cache = { url: null, fetchedAt: 0, keys: new Map() };

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

function normalizeTeamDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfigured(env) {
  return Boolean(
    normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN) &&
      String(env.ACCESS_AUD || '').trim() &&
      adminEmails(env).length &&
      csrfSecretOk(env.CSRF_SECRET)
  );
}

async function loadKeys(certsUrl, force) {
  const fresh = cache.url === certsUrl && Date.now() - cache.fetchedAt < KEY_CACHE_MS;
  if (fresh && !force) return cache.keys;
  const res = await fetch(certsUrl);
  if (!res.ok) throw new Error(`certs fetch failed: ${res.status}`);
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    map.set(
      jwk.kid,
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    );
  }
  cache = { url: certsUrl, fetchedAt: Date.now(), keys: map };
  return map;
}

/**
 * @returns {Promise<{ok:true,email:string,jwt:string}|{ok:false,status:number,reason:string}>}
 */
export async function authenticate(request, env) {
  if (!isConfigured(env)) return { ok: false, status: 503, reason: 'not_configured' };

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return { ok: false, status: 401, reason: 'no_token' };

  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'malformed' };

  let header, payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return { ok: false, status: 401, reason: 'malformed' };
  }
  // Only RS256 is accepted — never "none", never an HMAC algorithm.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, status: 401, reason: 'bad_alg' };

  const team = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const certsUrl = env.ACCESS_CERTS_URL || `https://${team}/cdn-cgi/access/certs`;

  let verified = false;
  try {
    let keys = await loadKeys(certsUrl, false);
    if (!keys.has(header.kid)) keys = await loadKeys(certsUrl, true); // key rotation
    const key = keys.get(header.kid);
    if (key) {
      verified = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        b64urlToBytes(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
      );
    }
  } catch (err) {
    console.log('Access key verification error:', err.message);
    return { ok: false, status: 401, reason: 'verify_error' };
  }
  if (!verified) return { ok: false, status: 401, reason: 'bad_signature' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== `https://${team}`) return { ok: false, status: 401, reason: 'bad_issuer' };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(String(env.ACCESS_AUD).trim())) return { ok: false, status: 401, reason: 'bad_audience' };
  if (typeof payload.exp !== 'number' || payload.exp + 30 < now) return { ok: false, status: 401, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf - 30 > now) return { ok: false, status: 401, reason: 'not_yet_valid' };

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) return { ok: false, status: 403, reason: 'no_email' }; // e.g. a service token
  if (!adminEmails(env).includes(email)) return { ok: false, status: 403, reason: 'not_admin' };

  return { ok: true, email, jwt };
}
