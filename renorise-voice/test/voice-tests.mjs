// Voice Worker tests. Twilio is simulated: requests are signed with an INDEPENDENT
// implementation of Twilio's documented signature algorithm (node:crypto, not the Worker's
// code), and every call scenario is replayed as the sequence of webhooks Twilio sends.
//
// The REAL Worker (src/index.js) and the REAL shared modules run against an in-memory
// D1-compatible database with every migration applied (foreign keys ON). No network,
// no Twilio account, no real phone numbers (555-01xx numbers only), no email.
//
//   cd renorise-voice && node test/voice-tests.mjs
//
// What this CANNOT prove: how Twilio itself behaves on a real phone call. Those items are
// listed in README.md ("Needs a real phone call to verify").

import { createHmac } from 'node:crypto';
import worker from '../src/index.js';
import { twilioSignature } from '../src/twilio.js';
import { freshDb } from '../../renorise-forms/test/d1-shim.mjs';
import { deriveOutcome, decideAfterDial, callerIdentity, formatPhoneDisplay, SCREEN_PROMPT, VOICEMAIL_GREETING } from '../../renorise-shared/calls.js';
import { finalizeStaleCalls, matchContact } from '../../renorise-shared/calls-db.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };

const TOKEN = 'test-auth-token-not-real-0123456789';
const SID = `AC${'a'.repeat(32)}`;
const BUSINESS = '+12895128112';
const CELL = '+14165550199'; // a fictional 555-01xx number: the "cellphone"
const CUSTOMER = '+14165550100';
const ENV = () => ({ TWILIO_AUTH_TOKEN: TOKEN, TWILIO_ACCOUNT_SID: SID, FORWARD_TO_NUMBER: CELL, BUSINESS_NUMBER: BUSINESS, RING_SECONDS: '25' });

// independent signature implementation (documented Twilio algorithm)
function sign(url, params, token = TOKEN) {
  let s = url;
  for (const k of Object.keys(params).sort()) s += k + params[k];
  return createHmac('sha1', token).update(s).digest('base64');
}

async function hit(env, path, params = {}, { sig, token, method = 'POST', account = SID, dbEnv } = {}) {
  const url = `https://voice.test${path}`;
  const all = { AccountSid: account, ...params };
  const pending = [];
  const req = new Request(url, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(sig === null ? {} : { 'X-Twilio-Signature': sig ?? sign(url, all, token) }) },
    body: method === 'POST' ? new URLSearchParams(all).toString() : undefined,
  });
  const res = await worker.fetch(req, dbEnv || env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

let n = 0;
const sids = () => { n++; const h = String(n).padStart(32, '0'); return { parent: `CA${h}`, leg: `CB${h}`, rec: `RE${h}` }; };
const row = (db, sid) => db.one('SELECT * FROM calls WHERE call_sid = ?', sid);
const events = (db, callId) => db.rows('SELECT kind FROM call_events WHERE call_id = ? ORDER BY created_at, rowid', callId).map((e) => e.kind);

function fresh() { const db = freshDb(); return { db, env: { ...ENV(), DB: db } }; }

// --- the webhooks Twilio sends, as small helpers ---
const incoming = (env, s, from = CUSTOMER) => hit(env, '/voice/incoming', { CallSid: s.parent, From: from, To: BUSINESS, CallStatus: 'ringing', Direction: 'inbound' });
const legStatus = (env, s, status, extra = {}) => hit(env, '/voice/leg-status', { CallSid: s.leg, ParentCallSid: s.parent, CallStatus: status, ...extra });
const screen = (env, s) => hit(env, '/voice/screen', { CallSid: s.leg, ParentCallSid: s.parent });
const press = (env, s, digits) => hit(env, '/voice/screen-result', { CallSid: s.leg, ParentCallSid: s.parent, Digits: digits });
const noPress = (env, s) => hit(env, '/voice/screen-result?no_input=1', { CallSid: s.leg, ParentCallSid: s.parent });
const dialDone = (env, s, status, seconds, extra = {}) => hit(env, '/voice/dial-complete', { CallSid: s.parent, DialCallSid: s.leg, DialCallStatus: status, DialCallDuration: String(seconds), ...extra });
const recordDone = (env, s, seconds) => hit(env, '/voice/record-done', { CallSid: s.parent, RecordingSid: s.rec, RecordingDuration: String(seconds), RecordingUrl: `https://api.twilio.com/2010-04-01/Accounts/${SID}/Recordings/${s.rec}` });
const recStatus = (env, s, status, seconds) => hit(env, '/voice/recording-status', { CallSid: s.parent, RecordingSid: s.rec, RecordingStatus: status, RecordingDuration: String(seconds) });
const parentDone = (env, s, seconds, status = 'completed') => hit(env, '/voice/status', { CallSid: s.parent, CallStatus: status, CallDuration: String(seconds), From: CUSTOMER, To: BUSINESS, SequenceNumber: '2' });

console.log('Voice Worker');

// ------------------------------------------------------------------------------------------------
console.log('\n[Twilio request verification]');
await test('signature algorithm: the Worker matches an independent implementation and Twilio\'s published example', async () => {
  const params = new URLSearchParams({ CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' });
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  const mine = await twilioSignature('12345', url, params);
  eq(mine, sign(url, Object.fromEntries(params), '12345'), 'matches the independent implementation');
  eq(mine, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=', 'matches the example in Twilio\'s documentation');
});
await test('a correctly signed request is accepted', async () => { const { env } = fresh(); eq((await incoming(env, sids())).status, 200); });
await test('bad signatures are refused (403) and record NOTHING: wrong token, missing header, altered parameter, different URL, garbage', async () => {
  const { db, env } = fresh(); const s = sids(); const p = { CallSid: s.parent, From: CUSTOMER, To: BUSINESS };
  eq((await hit(env, '/voice/incoming', p, { token: 'someone-elses-token' })).status, 403, 'wrong token');
  eq((await hit(env, '/voice/incoming', p, { sig: null })).status, 403, 'no signature');
  eq((await hit(env, '/voice/incoming', p, { sig: sign('https://voice.test/voice/incoming', { AccountSid: SID, ...p, From: '+14165550111' }) })).status, 403, 'signed for other parameters');
  eq((await hit(env, '/voice/incoming', p, { sig: sign('https://voice.test/voice/status', { AccountSid: SID, ...p }) })).status, 403, 'signed for another URL');
  eq((await hit(env, '/voice/incoming', p, { sig: 'AAAA' })).status, 403, 'garbage');
  eq(db.one('SELECT COUNT(*) n FROM calls').n, 0, 'nothing was recorded');
});
await test('a request validly signed but for a DIFFERENT Twilio account is refused', async () => {
  const { db, env } = fresh(); const r = await hit(env, '/voice/incoming', { CallSid: sids().parent, From: CUSTOMER, To: BUSINESS }, { account: `AC${'b'.repeat(32)}` }); eq(r.status, 403); eq(db.one('SELECT COUNT(*) n FROM calls').n, 0);
});
await test('only POST; unknown paths 404; oversized bodies 413; missing secrets 503 (so Twilio uses its fallback)', async () => {
  const { env } = fresh();
  eq((await hit(env, '/voice/incoming', {}, { method: 'GET' })).status, 405); eq((await hit(env, '/voice/nope', {})).status, 404);
  const big = await worker.fetch(new Request('https://voice.test/voice/incoming', { method: 'POST', headers: { 'Content-Length': '999999', 'X-Twilio-Signature': 'x' }, body: 'a=b' }), env, { waitUntil() {} }); eq(big.status, 413);
  const bare = await hit({ ...env, TWILIO_AUTH_TOKEN: undefined }, '/voice/incoming', { CallSid: sids().parent, To: BUSINESS }, { sig: 'x' }); eq(bare.status, 503, 'no auth token');
  eq((await incoming({ ...env, FORWARD_TO_NUMBER: undefined }, sids())).status, 503, 'no forwarding number: Twilio falls back to the TwiML Bin');
  eq((await incoming({ ...env, FORWARD_TO_NUMBER: 'not-a-number' }, sids())).status, 503, 'invalid forwarding number');
});
await test('a call to some OTHER number that reaches this Worker is rejected, not forwarded', async () => {
  const { env } = fresh(); const r = await hit(env, '/voice/incoming', { CallSid: sids().parent, From: CUSTOMER, To: '+14165550123' }); ok(/<Reject/.test(r.text) && !/<Dial/.test(r.text), r.text);
});

// ------------------------------------------------------------------------------------------------
console.log('\n[what callers and you hear]');
await test('forwarding: the business number is the caller ID on your phone, the caller keeps hearing ringing, the prompt runs before connecting, and the conversation is NOT recorded', async () => {
  const { env } = fresh(); const r = await incoming(env, sids());
  ok(r.headers.get('content-type').includes('text/xml'), 'TwiML');
  ok(r.text.includes(`callerId="${BUSINESS}"`), 'business number as caller ID'); ok(r.text.includes('answerOnBridge="true"'), 'caller hears ringing until connected');
  ok(r.text.includes('url="https://voice.test/voice/screen"'), 'the prompt runs on your phone first'); ok(r.text.includes(`>${CELL}</Number>`), 'rings the configured phone'); ok(r.text.includes('timeout="25"'), 'ring time');
  ok(r.text.includes('action="https://voice.test/voice/dial-complete"'), 'decides what happens next'); ok(!/<Record/i.test(r.text) && !/record=/i.test(r.text), 'no conversation recording');
});
await test('your phone hears exactly: "RenoRise business call. Press 1 to accept." and waits for one key', async () => {
  const { env } = fresh(); const r = await screen(env, sids()); ok(r.text.includes(`<Say>${SCREEN_PROMPT}</Say>`), r.text); ok(r.text.includes('numDigits="1"') && r.text.includes('<Gather'), 'one key'); ok(r.text.includes('screen-result?no_input=1'), 'no input is also recorded');
  eq(SCREEN_PROMPT, 'RenoRise business call. Press 1 to accept.');
});
await test('the caller hears the exact business greeting, then a beep, up to two minutes, voicemail only, no transcription', async () => {
  const { env } = fresh(); const s = sids(); await incoming(env, s); await noPress(env, s); const r = await dialDone(env, s, 'completed', 10);
  ok(r.text.includes(VOICEMAIL_GREETING), 'greeting'); eq(VOICEMAIL_GREETING, 'Thanks for calling RenoRise. We’re unable to answer right now. After the beep, please leave your name, phone number, and a brief description of your project. We’ll get back to you as soon as we can.');
  ok(r.text.includes('maxLength="120"') && r.text.includes('playBeep="true"'), 'beep and two minutes'); ok(r.text.includes('recordingStatusCallback="https://voice.test/voice/recording-status"') && r.text.includes('completed'), 'completion callback');
  ok(!/transcri/i.test(r.text), 'no transcription'); ok(!/<Sms|<Message/i.test(r.text), 'no SMS');
});

await test('a second (test) number can be listed: the number that was CALLED is the caller ID on your phone; unlisted numbers are still rejected', async () => {
  const { env } = fresh(); const TEST_NUMBER = '+14165550142'; const two = { ...env, BUSINESS_NUMBER: `${BUSINESS}, ${TEST_NUMBER}` };
  const viaTest = await hit(two, '/voice/incoming', { CallSid: sids().parent, From: CUSTOMER, To: TEST_NUMBER }); ok(viaTest.text.includes(`callerId="${TEST_NUMBER}"`), 'test number shown'); const viaReal = await hit(two, '/voice/incoming', { CallSid: sids().parent, From: CUSTOMER, To: BUSINESS }); ok(viaReal.text.includes(`callerId="${BUSINESS}"`));
  ok(/<Reject/.test((await hit(two, '/voice/incoming', { CallSid: sids().parent, From: CUSTOMER, To: '+14165550999' })).text), 'unlisted rejected'); eq((await incoming({ ...env, BUSINESS_NUMBER: `${BUSINESS}, oops` }, sids())).status, 503, 'a bad list is a configuration error (falls back to the TwiML Bin)');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[call scenarios]');
await test('press 1 connects: explicit acceptance recorded; the call ends after the conversation with NO voicemail', async () => {
  const { db, env } = fresh(); const s = sids();
  await incoming(env, s); await legStatus(env, s, 'initiated'); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'in-progress'); await screen(env, s);
  const k = await press(env, s, '1'); ok(/<Response><\/Response>$/.test(k.text.trim()) && !/<Hangup/.test(k.text), `pressing 1 returns empty TwiML so Twilio connects: ${k.text}`);
  const end = await dialDone(env, s, 'completed', 120); ok(/<Hangup\/>/.test(end.text) && !/<Record/.test(end.text) && !/<Say/.test(end.text), 'ends without voicemail');
  await legStatus(env, s, 'completed', { CallDuration: '120' }); await parentDone(env, s, 130);
  const c = row(db, s.parent); ok(c.accepted_at, 'accepted_at'); eq([c.screen_outcome, c.outcome, c.dial_status, c.duration_seconds], ['accepted', 'accepted', 'completed', 130]); eq([c.voicemail_offered_at, c.recording_sid], [null, null]);
  eq(db.one('SELECT COUNT(*) n FROM call_legs').n, 1, 'the phone leg is part of the same call'); eq(db.one('SELECT COUNT(*) n FROM calls').n, 1, 'one customer call'); eq(events(db, c.id).filter((e) => e === 'accepted').length, 1);
});
await test('the phone ANSWERS but 1 is not pressed (for example personal voicemail): not accepted, the caller gets business voicemail', async () => {
  const { db, env } = fresh(); const s = sids();
  await incoming(env, s); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'in-progress'); await screen(env, s);
  const k = await noPress(env, s); ok(/<Hangup/.test(k.text), 'the phone leg is dropped, not connected');
  await legStatus(env, s, 'completed', { CallDuration: '11' });
  const d = await dialDone(env, s, 'completed', 11); ok(d.text.includes(VOICEMAIL_GREETING), 'business voicemail offered');
  const c = row(db, s.parent); eq([c.accepted_at, c.screen_outcome], [null, 'no_input']); ok(c.forward_answered_at, 'Twilio says the phone answered'); ok(c.voicemail_offered_at, 'voicemail offered');
  ok(deriveOutcome(c) !== 'accepted', '"answered" and "completed" never count as accepted');
});
await test('a wrong key (2) is not acceptance; the caller goes to voicemail', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'in-progress'); await screen(env, s);
  ok(/<Hangup/.test((await press(env, s, '2')).text), 'not connected'); ok((await dialDone(env, s, 'completed', 9)).text.includes(VOICEMAIL_GREETING)); const c = row(db, s.parent); eq([c.accepted_at, c.screen_outcome], [null, 'rejected']);
});
await test('no answer, busy, failed and declined calls all go to voicemail', async () => {
  for (const status of ['no-answer', 'busy', 'failed', 'canceled']) {
    const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'ringing'); await legStatus(env, s, status);
    const d = await dialDone(env, s, status, 0); ok(d.text.includes(VOICEMAIL_GREETING), `${status}: voicemail offered`); const c = row(db, s.parent); eq(c.accepted_at, null, status); eq(c.forward_answered_at, null, `${status}: phone never answered`); eq(c.dial_status, status);
  }
});
await test('the caller hangs up while your phone is RINGING: recorded as missed, not accepted, no voicemail offered', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'canceled'); await parentDone(env, s, 0);
  const c = row(db, s.parent); eq([c.outcome, c.hangup_stage, c.accepted_at, c.voicemail_offered_at], ['missed', 'ringing', null, null]); ok(c.ended_at, 'ended');
});
await test('the caller hangs up during the "Press 1" prompt: missed at the screening stage', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'in-progress'); await screen(env, s); await legStatus(env, s, 'completed', { CallDuration: '6' }); await parentDone(env, s, 7);
  const c = row(db, s.parent); eq([c.outcome, c.hangup_stage, c.accepted_at], ['missed', 'screening', null]);
});
await test('a voicemail is left: recorded, confirmed by Twilio\'s completion callback, duration kept, not accepted, callback needed', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'no-answer'); await dialDone(env, s, 'no-answer', 0);
  await recordDone(env, s, 42); let c = row(db, s.parent); eq(c.recording_confirmed_at, null, 'not confirmed by the action alone'); eq(c.recording_sid, s.rec);
  await recStatus(env, s, 'completed', 42); await parentDone(env, s, 60); c = row(db, s.parent);
  eq([c.outcome, c.recording_status, c.recording_duration_seconds, c.accepted_at], ['voicemail', 'completed', 42, null]); ok(c.recording_confirmed_at, 'confirmed'); ok(events(db, c.id).includes('voicemail_confirmed'));
});
await test('hanging up during voicemail WITHOUT a message is "no message", not a voicemail', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'no-answer'); await dialDone(env, s, 'no-answer', 0);
  await recordDone(env, s, 0); await recStatus(env, s, 'absent', 0); await parentDone(env, s, 24); const c = row(db, s.parent);
  eq([c.outcome, c.hangup_stage], ['no_message', 'voicemail']); ok(!c.recording_confirmed_at, 'nothing to play');
});
await test('the caller hangs up and Twilio never sends a recording report: the voicemail is still kept as "left, not yet confirmed"', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await dialDone(env, s, 'no-answer', 0); await recStatus(env, s, 'in-progress', 0); await recordDone(env, s, 30); await parentDone(env, s, 40);
  const c = row(db, s.parent); eq(c.outcome, 'voicemail'); eq(c.recording_confirmed_at, null, 'flagged as not confirmed rather than lost');
});
await test('Twilio saying "completed" is NOT acceptance: a long completed call with no recorded key press still records accepted = false, and is not sent to voicemail after a real conversation', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await legStatus(env, s, 'in-progress'); await legStatus(env, s, 'completed', { CallDuration: '120' });
  const d = await dialDone(env, s, 'completed', 120); ok(/<Hangup/.test(d.text) && !d.text.includes(VOICEMAIL_GREETING), 'a long connected leg ends the call'); eq(row(db, s.parent).accepted_at, null, 'but it is still not recorded as accepted');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[duplicate and out-of-order callbacks]');
await test('every callback delivered TWICE (and three times) changes nothing: one call, one leg, one of each event, same answers', async () => {
  const { db, env } = fresh(); const s = sids();
  for (let round = 0; round < 3; round++) {
    await incoming(env, s); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'in-progress'); await screen(env, s); await press(env, s, '1');
    const d = await dialDone(env, s, 'completed', 90); ok(/<Hangup/.test(d.text) && !/<Say/.test(d.text), `round ${round}: still no voicemail`); await legStatus(env, s, 'completed', { CallDuration: '90' }); await parentDone(env, s, 100);
  }
  eq([db.one('SELECT COUNT(*) n FROM calls').n, db.one('SELECT COUNT(*) n FROM call_legs').n], [1, 1]); const c = row(db, s.parent); eq([c.outcome, c.duration_seconds], ['accepted', 100]);
  const ev = events(db, c.id); eq(ev.filter((e) => e === 'accepted').length, 1, 'accepted once'); eq(ev.filter((e) => e === 'call_received').length, 1, 'received once'); eq(ev.filter((e) => e === 'outcome').length, 1, 'outcome recorded once');
});
await test('out of order: finish reports before start reports, the phone leg before the call, a recording confirmation before the recording action, a late "ringing" after "completed"', async () => {
  const { db, env } = fresh(); const s = sids();
  await legStatus(env, s, 'completed', { CallDuration: '8' }); await legStatus(env, s, 'ringing'); await legStatus(env, s, 'in-progress'); // leg reports arrive before the call itself, backwards
  await parentDone(env, s, 50); await incoming(env, s); await hit(env, '/voice/status', { CallSid: s.parent, CallStatus: 'ringing', From: CUSTOMER, To: BUSINESS, SequenceNumber: '1' });
  await recStatus(env, s, 'completed', 30); await recordDone(env, s, 0); await recStatus(env, s, 'in-progress', 0); await recStatus(env, s, 'absent', 0);
  await dialDone(env, s, 'completed', 8);
  const c = row(db, s.parent); eq(c.parent_status, 'completed', 'never moved backwards'); eq(c.duration_seconds, 50, 'duration never shrinks'); eq(c.from_number, CUSTOMER, 'caller filled in once the call report arrived');
  eq([c.recording_status, c.recording_duration_seconds, c.outcome], ['completed', 30, 'voicemail'], 'a confirmed recording is never downgraded by a late in-progress / absent report'); eq(db.one('SELECT COUNT(*) n FROM calls').n, 1);
});
await test('acceptance can never be undone by a late or repeated "not accepted" report', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); await press(env, s, '1'); await noPress(env, s); await press(env, s, '2'); const c = row(db, s.parent); ok(c.accepted_at, 'still accepted'); eq(c.screen_outcome, 'accepted');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[database problems never silence a caller]');
const broken = () => ({ prepare() { throw new Error('D1 unavailable'); }, batch() { throw new Error('D1 unavailable'); } });
await test('database down when the call comes in: the caller is still forwarded (200 TwiML)', async () => {
  const { env } = fresh(); const r = await incoming({ ...env, DB: broken() }, sids()); eq(r.status, 200); ok(r.text.includes('<Dial') && r.text.includes(CELL), 'forwarded');
});
await test('a brief database error at call start is retried and the call is still recorded', async () => {
  const { db, env } = fresh(); let failures = 1; const flaky = { prepare(sql) { if (failures-- > 0) throw new Error('blip'); return db.prepare(sql); }, batch: (s) => db.batch(s) };
  const s = sids(); const r = await incoming({ ...env, DB: flaky }, s); eq(r.status, 200); ok(row(db, s.parent), 'recorded on the retry');
});
await test('database down at the prompt: pressing 1 still connects the call; any other key still drops the phone leg', async () => {
  const { env } = fresh(); const s = sids(); const e2 = { ...env, DB: broken() };
  ok(!/<Hangup/.test((await press(e2, s, '1')).text), 'connects'); ok(/<Hangup/.test((await press(e2, s, '2')).text)); ok(/<Hangup/.test((await noPress(e2, s)).text));
});
await test('database down when forwarding ends: a leg that ran long ends the call; a short, busy or unanswered one still gets business voicemail (never silence)', async () => {
  const { env } = fresh(); const e2 = { ...env, DB: broken() }; const s = sids();
  ok(/<Hangup/.test((await dialDone(e2, s, 'completed', 120)).text) && !(await dialDone(e2, s, 'completed', 120)).text.includes('<Say'), 'long conversation ends');
  for (const [st, secs] of [['completed', 12], ['busy', 0], ['no-answer', 0], ['failed', 0]]) ok((await dialDone(e2, s, st, secs)).text.includes(VOICEMAIL_GREETING), `${st} ${secs}s -> voicemail`);
});
await test('database down for status and recording reports: Twilio is told to retry (500), nothing crashes; the recording action still hangs up cleanly', async () => {
  const { env } = fresh(); const e2 = { ...env, DB: broken() }; const s = sids();
  eq((await parentDone(e2, s, 10)).status, 500); eq((await legStatus(e2, s, 'completed')).status, 500); eq((await recStatus(e2, s, 'completed', 30)).status, 500); ok(/<Hangup/.test((await recordDone(e2, s, 30)).text));
});

// ------------------------------------------------------------------------------------------------
console.log('\n[who called: matching and withheld numbers]');
function seedContact(db, id, phone, extra = '') { db.run(`INSERT INTO contacts (id, display_name, email, email_norm, phone, phone_norm, created_at, created_by, updated_at${extra ? ', merged_into_id' : ''}) VALUES (?,?,?,?,?,?,?,?,?${extra ? ',?' : ''})`, ...[id, `Person ${id}`, null, null, phone, phone.replace(/\D/g, '').slice(-10), '2026-09-01', 'test', '2026-09-01', ...(extra ? [extra] : [])]); }
await test('exactly one contact with that number (any punctuation): matched, no contact needed an email, nothing created', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', '+1 (416) 555-0100'); seedContact(db, 'ct-b', '(905) 555-0199'); const before = db.one('SELECT COUNT(*) n FROM contacts').n; const s = sids(); await incoming(env, s);
  const c = row(db, s.parent); eq([c.match_status, c.contact_id, c.from_number], ['matched', 'ct-a', CUSTOMER]); eq(db.one('SELECT COUNT(*) n FROM contacts').n, before, 'no duplicate contact created'); eq(db.one('SELECT COUNT(*) n FROM leads').n, 0, 'no lead created');
});
await test('two contacts share the number: ambiguous, left unassigned (candidates kept for you to choose), never guessed', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', '(416) 555-0100'); seedContact(db, 'ct-b', '416-555-0100'); const s = sids(); await incoming(env, s); const c = row(db, s.parent); eq([c.match_status, c.contact_id], ['ambiguous', null]);
  eq((await matchContact(db, '4165550100')).candidates.sort(), ['ct-a', 'ct-b']);
});
await test('a merged-away contact does not count; an unknown number is "unmatched"; nothing is fabricated', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', '(416) 555-0100'); seedContact(db, 'ct-old', '(416) 555-0100', 'ct-a'); const s = sids(); await incoming(env, s); eq(row(db, s.parent).match_status, 'matched'); eq(row(db, s.parent).contact_id, 'ct-a');
  const u = sids(); await incoming(env, u, '+14165550177'); const c = row(db, u.parent); eq([c.match_status, c.contact_id], ['unmatched', null]);
});
await test('withheld caller ID (anonymous, blank, Twilio\'s placeholder numbers): recorded as withheld with no number, no crash, no contact', async () => {
  const { db, env } = fresh();
  for (const from of ['anonymous', '', '+266696687', 'Restricted', '+86282452253']) { const s = sids(); const r = await incoming(env, s, from); eq(r.status, 200, `from "${from}"`); const c = row(db, s.parent); eq([c.caller_withheld, c.from_number, c.match_status, c.contact_id], [1, null, 'withheld', null], from); }
  eq(callerIdentity('+14165550100').norm, '4165550100'); eq(formatPhoneDisplay('+14165550100'), '(416) 555-0100');
});
await test('a missed call or voicemail from a KNOWN contact gets ONE callback task (however many callbacks arrive); an unknown caller does not', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', '(416) 555-0100'); const s = sids(); await incoming(env, s); await dialDone(env, s, 'no-answer', 0); await recordDone(env, s, 30);
  for (let i = 0; i < 3; i++) { await recStatus(env, s, 'completed', 30); await parentDone(env, s, 45); }
  const t = db.rows("SELECT * FROM tasks WHERE source = 'call_callback'"); eq(t.length, 1, 'one task'); eq([t[0].contact_id, t[0].type, t[0].status, t[0].title], ['ct-a', 'call', 'open', 'Call back about the voicemail']); eq(row(db, s.parent).task_id, t[0].id);
  const u = sids(); await incoming(env, u, '+14165550177'); await parentDone(env, u, 0); eq(db.rows("SELECT * FROM tasks WHERE source = 'call_callback'").length, 1, 'no task for an unknown caller');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[a phone call changes nothing else]');
await test('calls never enroll anyone in email or SMS, never create appointments, permissions, consents or leads, never touch suppressions, and send nothing', async () => {
  const { db, env } = fresh(); seedContact(db, 'ct-a', '(416) 555-0100');
  db.run("INSERT INTO suppressions (email, reason, source, created_at) VALUES ('gone@example.test','unsubscribe','test','2026-09-01')");
  const counts = () => ['enrollments', 'enrollment_steps', 'consents', 'followup_sends', 'email_jobs', 'appointments', 'contact_permissions', 'leads', 'suppressions', 'call_alerts'].map((t) => db.one(`SELECT COUNT(*) n FROM ${t}`).n);
  const before = counts();
  for (const scenario of ['press', 'voicemail', 'hangup']) {
    const s = sids(); await incoming(env, s); await legStatus(env, s, 'in-progress'); await screen(env, s);
    if (scenario === 'press') { await press(env, s, '1'); await dialDone(env, s, 'completed', 60); } else if (scenario === 'voicemail') { await noPress(env, s); await dialDone(env, s, 'completed', 10); await recordDone(env, s, 20); await recStatus(env, s, 'completed', 20); }
    await parentDone(env, s, 30);
  }
  eq(counts(), before, 'no sequence, consent, appointment, lead, suppression or email changes'); eq(db.one('SELECT COUNT(*) n FROM calls').n, 3);
});
await test('logs contain no phone numbers, tokens or account ids (even when errors happen)', async () => {
  const { env } = fresh(); const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try { const s = sids(); await incoming({ ...env, DB: broken() }, s); await press({ ...env, DB: broken() }, s, '1'); await parentDone({ ...env, DB: broken() }, s, 5); await hit(env, '/voice/incoming', { CallSid: s.parent, From: CUSTOMER, To: BUSINESS }, { sig: 'bad' }); } finally { console.log = orig; }
  const all = logs.join('\n'); ok(logs.length > 0, 'errors were logged'); ok(!all.includes('4165550100') && !all.includes('4165550199') && !all.includes(TOKEN) && !all.includes(SID) && !/CA0{20}/.test(all), `sensitive value in logs: ${all.slice(0, 200)}`);
});

// ------------------------------------------------------------------------------------------------
console.log('\n[rules in isolation]');
await test('decideAfterDial: an explicit press wins; a recorded non-press means voicemail; with no record only a long completed leg counts as a conversation', async () => {
  eq(decideAfterDial({ accepted_at: 'x' }, { DialCallStatus: 'no-answer' }), 'hangup'); eq(decideAfterDial({ screen_outcome: 'no_input' }, { DialCallStatus: 'completed', DialCallDuration: '600' }), 'voicemail');
  eq(decideAfterDial(null, { DialCallStatus: 'completed', DialCallDuration: '44' }), 'voicemail'); eq(decideAfterDial(null, { DialCallStatus: 'completed', DialCallDuration: '45' }), 'hangup'); eq(decideAfterDial(null, { DialBridged: 'true' }), 'hangup'); eq(decideAfterDial(null, {}), 'voicemail');
});
await test('a call that never gets its final report from Twilio is closed after 45 minutes instead of staying "in progress" forever', async () => {
  const { db, env } = fresh(); const s = sids(); await incoming(env, s); eq(row(db, s.parent).outcome, 'in_progress');
  const later = new Date(Date.now() + 50 * 60 * 1000); eq(await finalizeStaleCalls(db, later), 1); const c = row(db, s.parent); eq(c.outcome, 'missed'); ok(c.ended_at, 'closed'); ok(events(db, c.id).includes('closed_without_report'));
  eq(await finalizeStaleCalls(db, later), 0, 'once only');
});

console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
