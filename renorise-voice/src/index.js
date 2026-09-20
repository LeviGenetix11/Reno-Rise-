// RenoRise voice Worker: the public Twilio webhook endpoint for business calls.
//
// What it does, in order, for every call to the business number:
//   1. Forwards the call to your cellphone with the BUSINESS number as caller ID.
//      The customer keeps hearing ringing until the call is actually connected.
//   2. When the phone answers, it says (to you only) "RenoRise business call. Press 1
//      to accept." Only a pressed 1 connects the call and counts as "accepted".
//   3. If you do not accept, for ANY reason (no answer, busy, decline, wrong key, or
//      your personal voicemail picked up), the CALLER hears the business voicemail
//      greeting and can leave up to two minutes. Only the voicemail is recorded.
//   4. If you accepted and the conversation ends, the call simply ends (no voicemail).
//
// Everything Twilio reports is recorded against ONE customer call in D1 (the inbound
// call and the forwarded phone leg together). Nothing here sends an email, texts anyone,
// transcribes, or enrolls anyone in a follow-up sequence: a phone call is not consent
// and an answered call is not an appointment.
//
// Security: every request must carry a valid Twilio signature computed over the exact
// URL and parameters with the account's auth token, and must name the expected Twilio
// account. Secrets are Worker secrets. No phone numbers or tokens are written to logs.
//
// Fail-safe behaviour: if this Worker is misconfigured or down, Twilio's "primary handler
// fails" fallback URL (your existing TwiML Bin) keeps forwarding calls. Once a call is in
// progress, a database problem never leaves a caller with silence: each step falls back
// to the caller-friendly choice (see decideAfterDial in renorise-shared/calls.js).

import { verifyTwilioSignature, twiml, isE164 } from './twilio.js';
import { SCREEN_PROMPT, VOICEMAIL_GREETING, VOICEMAIL_MAX_SECONDS, decideAfterDial } from '../../renorise-shared/calls.js';
import {
  firstTimeEvent,
  ensureCall,
  applyParentStatus,
  applyLegStatus,
  applyScreen,
  applyDialComplete,
  markVoicemailOffered,
  applyRecording,
  refreshCall,
} from '../../renorise-shared/calls-db.js';

const MAX_BODY_BYTES = 20_000;
const ROUTES = new Set(['/voice/incoming', '/voice/status', '/voice/leg-status', '/voice/screen', '/voice/screen-result', '/voice/dial-complete', '/voice/record-done', '/voice/recording-status']);

const xmlResponse = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
const empty = (status = 204) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const plain = (text, status) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Log the kind of problem only. Never phone numbers, sids of people, tokens or request bodies. */
const logProblem = (where, err) => console.log(`voice: ${where} failed: ${String(err && err.message ? err.message : err).slice(0, 160)}`);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!ROUTES.has(url.pathname)) return plain('Not found', 404);
    if (request.method !== 'POST') return plain('Method not allowed', 405);
    if (Number(request.headers.get('Content-Length') || '0') > MAX_BODY_BYTES) return plain('Payload too large', 413);

    // Not configured: answer 503 so Twilio uses the fallback (your TwiML Bin) instead of failing the caller.
    if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_ACCOUNT_SID || !env.DB) return plain('Not configured', 503);

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return plain('Payload too large', 413);
    const params = new URLSearchParams(body);

    // The signature covers the exact URL Twilio requested plus every submitted parameter.
    const signed = await verifyTwilioSignature({ authToken: env.TWILIO_AUTH_TOKEN, url: request.url, params, signature: request.headers.get('X-Twilio-Signature') });
    if (!signed) return plain('Forbidden', 403);
    // ...and it must come from OUR Twilio account, not just any account that could sign a request.
    if (params.get('AccountSid') !== env.TWILIO_ACCOUNT_SID) return plain('Forbidden', 403);

    const origin = url.origin;
    const now = new Date();
    try {
      switch (url.pathname) {
        case '/voice/incoming':
          return incoming({ env, ctx, params, origin, now });
        case '/voice/screen':
          return xmlResponse(twiml.screen({ origin, prompt: SCREEN_PROMPT }));
        case '/voice/screen-result':
          return await screenResult({ env, ctx, params, url, now });
        case '/voice/dial-complete':
          return await dialComplete({ env, ctx, params, origin, now });
        case '/voice/record-done':
          return await recordDone({ env, ctx, params, now });
        case '/voice/status':
          return await parentStatus({ env, params, now });
        case '/voice/leg-status':
          return await legStatus({ env, params, now });
        case '/voice/recording-status':
          return await recordingStatus({ env, params, now });
        default:
          return plain('Not found', 404);
      }
    } catch (err) {
      logProblem(url.pathname, err);
      // A TwiML-returning step must never leave a caller in silence.
      if (url.pathname === '/voice/incoming') return plain('Error', 500); // Twilio then uses the fallback URL
      if (url.pathname === '/voice/screen-result') return xmlResponse(params.get('Digits') === '1' ? twiml.empty() : twiml.hangup());
      if (url.pathname === '/voice/dial-complete') return xmlResponse(twiml.voicemail({ origin, greeting: VOICEMAIL_GREETING, maxSeconds: VOICEMAIL_MAX_SECONDS }));
      if (url.pathname === '/voice/record-done') return xmlResponse(twiml.hangup());
      return plain('Error', 500); // status callbacks: let Twilio retry
    }
  },
};

/** Run a database step that must not delay or break what the caller hears. A failure is logged and retried once. */
function bestEffort(ctx, label, fn) {
  const run = async () => {
    try {
      await fn();
    } catch (err) {
      logProblem(label, err);
      try {
        await fn();
      } catch (err2) {
        logProblem(`${label} (retry)`, err2);
      }
    }
  };
  ctx.waitUntil(run());
}

// ------------------------------------------------------------------ the call comes in

function incoming({ env, ctx, params, origin, now }) {
  // BUSINESS_NUMBER is one number, or a comma-separated list (for example your real number plus a test number).
  const numbers = String(env.BUSINESS_NUMBER || '').split(',').map((n) => n.trim()).filter(Boolean);
  if (!isE164(env.FORWARD_TO_NUMBER) || !numbers.length || !numbers.every(isE164)) return plain('Not configured', 503); // Twilio falls back to the TwiML Bin
  const called = params.get('To');
  if (!numbers.includes(called)) return xmlResponse(twiml.reject()); // some other number reached this Worker
  const callSid = params.get('CallSid');
  if (!callSid) return plain('Bad request', 400);

  // Record the call, but never make the caller wait for (or fail because of) the database.
  bestEffort(ctx, 'record incoming call', async () => {
    const call = await ensureCall(env.DB, { callSid, from: params.get('From'), to: params.get('To'), hasIdentity: true, now });
    await applyParentStatus(env.DB, { callSid, status: 'ringing', now });
    await refreshCall(env.DB, call.id, now);
  });
  const ring = Math.min(Math.max(parseInt(env.RING_SECONDS || '25', 10) || 25, 10), 55);
  return xmlResponse(twiml.dial({ origin, businessNumber: called, forwardTo: env.FORWARD_TO_NUMBER, ringSeconds: ring }));
}

// ------------------------------------------------------------------ "Press 1 to accept"

async function screenResult({ env, ctx, params, url, now }) {
  const digits = (params.get('Digits') || '').trim();
  const noInput = url.searchParams.get('no_input') === '1';
  const accepted = digits === '1' && !noInput;
  const parentSid = params.get('ParentCallSid');
  if (parentSid) {
    const record = async () => {
      const call = await applyScreen(env.DB, { parentSid, digits: noInput ? '' : digits, noInput, now });
      await refreshCall(env.DB, call.id, now);
      await firstTimeEvent(env.DB, `screen:${parentSid}:${params.get('CallSid') || ''}`, now);
    };
    try {
      await record();
    } catch (err) {
      logProblem('record key press', err);
      bestEffort(ctx, 'record key press (retry)', record); // the call is connected regardless
    }
  }
  return xmlResponse(accepted ? twiml.empty() : twiml.hangup()); // empty = connect; anything else = not accepted
}

// ------------------------------------------------------------------ the forwarded leg finished

async function dialComplete({ env, ctx, params, origin, now }) {
  const callSid = params.get('CallSid');
  let call = null;
  try {
    call = await applyDialComplete(env.DB, { callSid, dialStatus: params.get('DialCallStatus'), dialDuration: params.get('DialCallDuration'), now });
  } catch (err) {
    logProblem('record dial result', err); // fall back to what Twilio just told us (see decideAfterDial)
  }
  const decision = decideAfterDial(call, { DialCallStatus: params.get('DialCallStatus'), DialCallDuration: params.get('DialCallDuration'), DialBridged: params.get('DialBridged') });
  if (decision === 'hangup') {
    if (call) bestEffort(ctx, 'refresh after conversation', () => refreshCall(env.DB, call.id, now));
    return xmlResponse(twiml.hangup()); // an accepted conversation ends here: no voicemail
  }
  bestEffort(ctx, 'record voicemail offered', async () => {
    await markVoicemailOffered(env.DB, callSid, now);
    const row = await ensureCall(env.DB, { callSid, now });
    await refreshCall(env.DB, row.id, now);
  });
  return xmlResponse(twiml.voicemail({ origin, greeting: VOICEMAIL_GREETING, maxSeconds: VOICEMAIL_MAX_SECONDS }));
}

// ------------------------------------------------------------------ voicemail progress

/** The <Record> action: the caller finished (or hung up). Sets the recording id; Twilio's completion callback confirms it. */
async function recordDone({ env, ctx, params, now }) {
  const callSid = params.get('CallSid');
  if (callSid) {
    bestEffort(ctx, 'record voicemail end', async () => {
      const call = await applyRecording(env.DB, { callSid, recordingSid: params.get('RecordingSid'), status: null, duration: params.get('RecordingDuration'), now });
      await refreshCall(env.DB, call.id, now);
    });
  }
  return xmlResponse(twiml.hangup());
}

async function recordingStatus({ env, params, now }) {
  const callSid = params.get('CallSid');
  const status = (params.get('RecordingStatus') || '').toLowerCase();
  if (!callSid || !['in-progress', 'completed', 'absent', 'failed'].includes(status)) return empty();
  const key = `rec:${params.get('RecordingSid') || callSid}:${status}`;
  const call = await applyRecording(env.DB, { callSid, recordingSid: params.get('RecordingSid'), status, duration: params.get('RecordingDuration'), now });
  await refreshCall(env.DB, call.id, now);
  await firstTimeEvent(env.DB, key, now);
  return empty();
}

// ------------------------------------------------------------------ Twilio's own status reports

async function parentStatus({ env, params, now }) {
  const callSid = params.get('CallSid');
  const status = (params.get('CallStatus') || '').toLowerCase();
  if (!callSid || !status) return empty();
  const call = await ensureCall(env.DB, { callSid, from: params.get('From'), to: params.get('To'), hasIdentity: Boolean(params.get('To')), now });
  await applyParentStatus(env.DB, { callSid, status, duration: params.get('CallDuration'), now });
  await refreshCall(env.DB, call.id, now);
  await firstTimeEvent(env.DB, `status:${callSid}:${status}:${params.get('SequenceNumber') || ''}`, now);
  return empty();
}

async function legStatus({ env, params, now }) {
  const parentSid = params.get('ParentCallSid');
  const legSid = params.get('CallSid');
  const status = (params.get('CallStatus') || '').toLowerCase();
  if (!parentSid || !legSid || !status) return empty();
  const call = await applyLegStatus(env.DB, { parentSid, legSid, status, duration: params.get('CallDuration'), now });
  await refreshCall(env.DB, call.id, now);
  await firstTimeEvent(env.DB, `leg:${legSid}:${status}:${params.get('SequenceNumber') || ''}`, now);
  return empty();
}
