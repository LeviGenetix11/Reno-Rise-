// Twilio request verification and TwiML building. No database here.

const enc = new TextEncoder();

/**
 * Twilio signs every webhook: base64( HMAC-SHA1( authToken, EXACT_URL + name1 + value1 + name2 + value2 ... ) )
 * with the parameters sorted by name. The URL must be exactly what Twilio requested,
 * including any query string. Returns the expected signature.
 */
export async function twilioSignature(authToken, url, params) {
  const names = [...new Set([...params.keys()])].sort();
  let data = url;
  for (const name of names) for (const value of params.getAll(name).sort()) data += name + value;
  const key = await crypto.subtle.importKey('raw', enc.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  let bin = '';
  for (const b of new Uint8Array(mac)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Constant-time string comparison, so a wrong signature cannot be probed byte by byte. */
export function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export async function verifyTwilioSignature({ authToken, url, params, signature }) {
  if (!authToken || !signature) return false;
  return safeEqual(await twilioSignature(authToken, url, params), signature);
}

// ------------------------------------------------------------------ TwiML

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const wrap = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const attrs = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${xml(v)}"`).join('');

export const twiml = {
  empty: () => wrap(''),
  hangup: () => wrap('<Hangup/>'),
  reject: () => wrap('<Reject reason="rejected"/>'),

  /**
   * Forward to the cellphone. The caller sees the BUSINESS number as caller ID on your phone;
   * the customer keeps hearing ringing (answerOnBridge) until the call is actually connected;
   * the "Press 1" prompt runs on your phone before any connection (the Number's url).
   * There is no <Record> here, so a conversation is never recorded.
   */
  dial: ({ origin, businessNumber, forwardTo, ringSeconds }) =>
    wrap(
      `<Dial${attrs({ callerId: businessNumber, timeout: ringSeconds, answerOnBridge: 'true', action: `${origin}/voice/dial-complete`, method: 'POST' })}>` +
        `<Number${attrs({ url: `${origin}/voice/screen`, method: 'POST', statusCallback: `${origin}/voice/leg-status`, statusCallbackMethod: 'POST', statusCallbackEvent: 'initiated ringing answered completed' })}>${xml(forwardTo)}</Number>` +
        '</Dial>'
    ),

  /** Played to YOU when the phone answers. No key press, or any key but 1, is "not accepted". */
  screen: ({ origin, prompt }) =>
    wrap(
      `<Gather${attrs({ input: 'dtmf', numDigits: 1, timeout: 8, action: `${origin}/voice/screen-result`, method: 'POST' })}><Say>${xml(prompt)}</Say></Gather>` +
        `<Redirect method="POST">${xml(`${origin}/voice/screen-result?no_input=1`)}</Redirect>`
    ),

  /** Business voicemail: greeting, beep, up to two minutes. Only the voicemail is recorded. No transcription. */
  voicemail: ({ origin, greeting, maxSeconds }) =>
    wrap(
      `<Say>${xml(greeting)}</Say>` +
        `<Record${attrs({
          maxLength: maxSeconds,
          playBeep: 'true',
          timeout: 8,
          finishOnKey: '#',
          trim: 'trim-silence',
          action: `${origin}/voice/record-done`,
          method: 'POST',
          recordingStatusCallback: `${origin}/voice/recording-status`,
          recordingStatusCallbackMethod: 'POST',
          recordingStatusCallbackEvent: 'in-progress completed absent',
        })}/>` +
        '<Hangup/>'
    ),
};

/** E.164 sanity check for the forwarding destination (a Worker secret). */
export const isE164 = (v) => /^\+[1-9]\d{7,14}$/.test(String(v || ''));
