// Server-side verification of a Cloudflare Turnstile token. The secret
// key never leaves the Worker — only the public site key is used in
// browser code.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, secret, remoteIp) {
  if (!secret) {
    // Fails closed: if the secret isn't configured yet, treat every
    // submission as unverified rather than silently skipping the check.
    return { success: false, reason: 'not-configured' };
  }
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const data = await res.json();
    return { success: !!data.success, reason: data['error-codes']?.join(',') || null };
  } catch (err) {
    return { success: false, reason: 'network-error' };
  }
}
