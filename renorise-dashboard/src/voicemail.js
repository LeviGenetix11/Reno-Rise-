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
