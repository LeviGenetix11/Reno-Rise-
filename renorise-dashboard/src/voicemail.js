// Private voicemail playback.
//
// The audio lives at Twilio. It is NEVER given a public link: this route (behind the
// dashboard's Cloudflare Access sign-in like every other route) looks the recording up
// by the CALL RECORD's id, fetches it from Twilio SERVER-SIDE with authenticated access,
// and streams it back. The browser only ever sees /calls/<id>/voicemail on this
// dashboard. No URL, recording id or credential is taken from, or sent to, the browser.
//
// Credentials are Worker secrets (a restricted Twilio API key, not the account token):
//   TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET
// If any is missing, playback is simply unavailable (fails closed).

const RECORDING_SID = /^RE[0-9a-fA-F]{32}$/;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const RANGE = /^bytes=\d*-\d*$/;

export const voicemailConfigured = (env) => Boolean(ACCOUNT_SID.test(String(env.TWILIO_ACCOUNT_SID || '')) && env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET);

/**
 * @returns a Response (audio, 206 for a range, or a short plain-text error). Never throws.
 */
export async function streamVoicemail(request, env, call, extraHeaders = {}) {
  const fail = (status, text) => new Response(text, { status, headers: { ...extraHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!call || !RECORDING_SID.test(String(call.recording_sid || ''))) return fail(404, 'No voicemail for this call.');
  if (call.recording_status !== 'completed') return fail(404, 'The voicemail is not confirmed yet.');
  if (!voicemailConfigured(env)) return fail(503, 'Voicemail playback is not set up yet.');

  const base = String(env.TWILIO_API_BASE || 'https://api.twilio.com').replace(/\/+$/, ''); // TWILIO_API_BASE exists only so tests can use a local mock
  const url = `${base}/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Recordings/${call.recording_sid}.mp3`;
  const headers = { Authorization: `Basic ${btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`)}`, Accept: 'audio/mpeg' };
  const range = request.headers.get('Range');
  if (range && RANGE.test(range)) headers.Range = range; // lets the player seek

  let upstream;
  try {
    upstream = await fetch(url, { headers });
  } catch (err) {
    console.log(`voicemail: could not reach Twilio (${String(err.message).slice(0, 80)})`);
    return fail(502, 'The voicemail could not be fetched right now.');
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    console.log(`voicemail: Twilio answered ${upstream.status}`); // status only: no ids, numbers or credentials
    return fail(502, 'The voicemail could not be fetched right now.');
  }
  // The voicemail-specific headers come LAST so the generic page headers can never loosen them.
  const out = {
    ...extraHeaders,
    'Content-Type': 'audio/mpeg',
    'Content-Disposition': 'inline; filename="voicemail.mp3"',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  for (const h of ['Content-Length', 'Content-Range']) if (upstream.headers.get(h)) out[h] = upstream.headers.get(h);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

// ------------------------------------------------------------------ setup self-check

/**
 * A read-only check of the voicemail playback setup, shown to the signed-in admin at /calls/playback-check.
 * It answers "can this dashboard fetch recordings from Twilio securely?" without needing a call:
 *   1. the three secrets are present (names only; values are never read out);
 *   2. Twilio accepts the API key and the account id;
 *   3. the key can list recordings;
 *   4. if a recording exists: Twilio REFUSES an unauthenticated request for it (so "Enforce HTTP Basic Auth on
 *      media access" really is on), and ACCEPTS one made with our key.
 * It fetches at most one byte of one recording and returns only pass / fail text: no ids, no credentials, no audio.
 */
export async function checkPlayback(env) {
  const steps = [];
  const add = (label, status, detail) => steps.push({ label, status, detail });

  const haveSid = ACCOUNT_SID.test(String(env.TWILIO_ACCOUNT_SID || ''));
  add('Account SID is set', haveSid ? 'ok' : 'fail', haveSid ? 'Present and in the right format.' : 'Missing or not in the form ACxxxxxxxx… Add it with: npx wrangler secret put TWILIO_ACCOUNT_SID (in renorise-dashboard).');
  add('API key SID is set', env.TWILIO_API_KEY_SID ? 'ok' : 'fail', env.TWILIO_API_KEY_SID ? 'Present.' : 'Missing. Add it with: npx wrangler secret put TWILIO_API_KEY_SID (in renorise-dashboard).');
  add('API key secret is set', env.TWILIO_API_KEY_SECRET ? 'ok' : 'fail', env.TWILIO_API_KEY_SECRET ? 'Present.' : 'Missing. Add it with: npx wrangler secret put TWILIO_API_KEY_SECRET (in renorise-dashboard).');
  if (!voicemailConfigured(env)) {
    add('Twilio checks', 'skip', 'Not run until the three values above are set.');
    return steps;
  }

  const base = String(env.TWILIO_API_BASE || 'https://api.twilio.com').replace(/\/+$/, '');
  const root = `${base}/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}`;
  const auth = { Authorization: `Basic ${btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`)}` };
  const get = async (url, headers = {}, redirect = 'follow') => {
    try {
      const res = await fetch(url, { headers, redirect, signal: AbortSignal.timeout(8000) });
      if (res.body) res.body.cancel().catch(() => {}); // never read audio into memory
      return res;
    } catch {
      return null;
    }
  };

  const account = await get(`${root}.json`, auth);
  if (!account) {
    add('Twilio accepts the API key', 'fail', 'Twilio could not be reached from the dashboard just now. Try again in a minute.');
    return steps;
  }
  if (account.status !== 200) {
    add('Twilio accepts the API key', 'fail', account.status === 401 ? 'Twilio rejected the key. The API key SID, its secret, or the Account SID is wrong, or the key was deleted.' : `Twilio answered with an unexpected status (${account.status}).`);
    return steps;
  }
  add('Twilio accepts the API key', 'ok', 'The API key and Account SID are valid together.');

  let recordingSid = null;
  try {
    const listRes = await fetch(`${root}/Recordings.json?PageSize=1`, { headers: auth, signal: AbortSignal.timeout(8000) });
    if (listRes.status !== 200) {
      add('The key can read recordings', 'fail', listRes.status === 403 ? 'Twilio says this key is not allowed to read recordings. Create a Standard API key.' : `Twilio answered with an unexpected status (${listRes.status}).`);
      return steps;
    }
    const data = await listRes.json();
    const sid = data && data.recordings && data.recordings[0] && data.recordings[0].sid;
    if (RECORDING_SID.test(String(sid || ''))) recordingSid = sid;
    add('The key can read recordings', 'ok', recordingSid ? 'At least one recording exists in the account.' : 'The key works, but the account has no recordings yet.');
  } catch {
    add('The key can read recordings', 'fail', 'Twilio\'s answer could not be read. Try again in a minute.');
    return steps;
  }
  if (!recordingSid) {
    add('Recordings need a password to open', 'skip', 'Cannot be checked until a first voicemail exists. Run this check again after your first test voicemail.');
    add('The dashboard can retrieve a recording', 'skip', 'Same: needs a first voicemail.');
    return steps;
  }

  const media = `${root}/Recordings/${recordingSid}.mp3`;
  const open = await get(media, { Range: 'bytes=0-0' }, 'manual');
  if (!open) add('Recordings need a password to open', 'fail', 'Could not run this check just now. Try again in a minute.');
  else if (open.status === 401 || open.status === 403) add('Recordings need a password to open', 'ok', 'Twilio refuses a request that has no credentials. "Enforce HTTP Basic Auth on media access" is on.');
  else add('Recordings need a password to open', 'fail', 'Twilio served a recording with NO credentials, so recordings are reachable by anyone who has the address. In the Twilio Console turn on Voice > Settings > General > "Enforce HTTP Basic Auth on media access", then run this check again.');

  const ours = await get(media, { ...auth, Range: 'bytes=0-0' });
  if (ours && (ours.status === 200 || ours.status === 206)) add('The dashboard can retrieve a recording', 'ok', 'Fetched one byte of a recording with the API key. Playback from a call page will work.');
  else add('The dashboard can retrieve a recording', 'fail', ours ? `Twilio refused the dashboard's key for a recording (status ${ours.status}).` : 'Could not run this check just now. Try again in a minute.');
  return steps;
}
