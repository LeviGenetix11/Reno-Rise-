// Runs the voice Worker in the REAL Cloudflare Workers runtime (`wrangler dev`, workerd)
// against a throwaway local D1, and sends genuinely signed requests over HTTP. This proves
// what the Node tests cannot: the signature check (Web Crypto HMAC-SHA1), TwiML responses,
// waitUntil and D1 behave the same in the actual runtime.
//
// Uses a made-up auth token and 555-01xx phone numbers. Touches no Twilio account and no
// real data.
//
//   cd renorise-voice && node test/runtime-check.mjs

import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = '.wrangler/runtime-state';
const WRANGLER = existsSync('node_modules/wrangler/bin/wrangler.js') ? 'node_modules/wrangler/bin/wrangler.js' : '../renorise-forms/node_modules/wrangler/bin/wrangler.js';
const TOKEN = 'runtime-check-token-not-real';
const SID = `AC${'f'.repeat(32)}`;

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (existsSync(STATE)) rmSync(STATE, { recursive: true, force: true });
execFileSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'renorise-leads', '--local', '--persist-to', STATE], { stdio: 'ignore' });
writeFileSync('.dev.vars', `TWILIO_AUTH_TOKEN=${TOKEN}\nTWILIO_ACCOUNT_SID=${SID}\nFORWARD_TO_NUMBER=+14165550199\n`);
const dev = spawn(process.execPath, [WRANGLER, 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', `${process.cwd().replace(/\\/g, '/')}/${STATE}`], { stdio: 'ignore' });
function cleanup(code) {
  try { execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  try { rmSync('.dev.vars', { force: true }); } catch { /* ignore */ }
  process.exit(code);
}
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/voice/incoming`, { method: 'POST', body: '' }); if (r.status === 403) break; } catch { /* starting */ } await sleep(1000); }

const sign = (url, params) => { let s = url; for (const k of Object.keys(params).sort()) s += k + params[k]; return createHmac('sha1', TOKEN).update(s).digest('base64'); };
async function hit(path, params, { signature } = {}) {
  const url = `${BASE}${path}`; const all = { AccountSid: SID, ...params };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature ?? sign(url, all) }, body: new URLSearchParams(all).toString() });
  return { status: res.status, text: await res.text() };
}
const dir = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
const readDb = () => new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')}`, { readOnly: true });

const P = `CA${'9'.repeat(32)}`; const L = `CB${'9'.repeat(32)}`; const CUSTOMER = '+14165550100';
console.log('Voice Worker in the real Workers runtime');
await test('an unsigned or wrongly signed request is refused (403)', async () => {
  eq((await hit('/voice/incoming', { CallSid: P, From: CUSTOMER, To: '+12895128112' }, { signature: 'nope' })).status, 403);
  const r = await fetch(`${BASE}/voice/incoming`, { method: 'POST', body: 'CallSid=x' }); eq(r.status, 403);
});
await test('a correctly signed call gets forwarding TwiML: business number as caller ID, ringing until connected, no recording of the conversation', async () => {
  const r = await hit('/voice/incoming', { CallSid: P, From: CUSTOMER, To: '+12895128112', CallStatus: 'ringing' }); eq(r.status, 200);
  ok(r.text.includes('callerId="+12895128112"') && r.text.includes('answerOnBridge="true"') && r.text.includes('+14165550199') && !/<Record/.test(r.text), r.text);
});
await test('press 1: the phone leg is connected, the call is recorded as explicitly accepted, and the call ends without voicemail', async () => {
  await hit('/voice/leg-status', { CallSid: L, ParentCallSid: P, CallStatus: 'in-progress' });
  const screen = await hit('/voice/screen', { CallSid: L, ParentCallSid: P }); ok(screen.text.includes('RenoRise business call. Press 1 to accept.'), 'prompt');
  const pressed = await hit('/voice/screen-result', { CallSid: L, ParentCallSid: P, Digits: '1' }); ok(!/Hangup/.test(pressed.text), 'connects');
  const done = await hit('/voice/dial-complete', { CallSid: P, DialCallStatus: 'completed', DialCallDuration: '75' }); ok(/<Hangup\/>/.test(done.text) && !/Record/.test(done.text), 'no voicemail after a conversation');
  await hit('/voice/status', { CallSid: P, CallStatus: 'completed', CallDuration: '80', From: CUSTOMER, To: '+12895128112' }); await sleep(600);
  const db = readDb(); const c = db.prepare('SELECT outcome, accepted_at, from_number, duration_seconds FROM calls WHERE call_sid = ?').get(P); db.close();
  eq([c.outcome, Boolean(c.accepted_at), c.from_number, c.duration_seconds], ['accepted', true, CUSTOMER, 80]);
});
await test('no answer: the caller hears the exact business greeting and can record up to two minutes; the voicemail is recorded and confirmed', async () => {
  const P2 = `CA${'8'.repeat(32)}`; const L2 = `CB${'8'.repeat(32)}`; await hit('/voice/incoming', { CallSid: P2, From: CUSTOMER, To: '+12895128112' }); await hit('/voice/leg-status', { CallSid: L2, ParentCallSid: P2, CallStatus: 'no-answer' });
  const vm = await hit('/voice/dial-complete', { CallSid: P2, DialCallStatus: 'no-answer', DialCallDuration: '0' }); ok(vm.text.includes('Thanks for calling RenoRise. We’re unable to answer right now.') && vm.text.includes('maxLength="120"') && !/transcri/i.test(vm.text), vm.text);
  await hit('/voice/record-done', { CallSid: P2, RecordingSid: `RE${'8'.repeat(32)}`, RecordingDuration: '33' }); await hit('/voice/recording-status', { CallSid: P2, RecordingSid: `RE${'8'.repeat(32)}`, RecordingStatus: 'completed', RecordingDuration: '33' });
  await hit('/voice/status', { CallSid: P2, CallStatus: 'completed', CallDuration: '50', From: CUSTOMER, To: '+12895128112' }); await sleep(600);
  const db = readDb(); const c = db.prepare('SELECT outcome, recording_status, recording_duration_seconds, accepted_at FROM calls WHERE call_sid = ?').get(P2); db.close(); eq([c.outcome, c.recording_status, c.recording_duration_seconds, c.accepted_at], ['voicemail', 'completed', 33, null]);
});
await test('a repeated callback changes nothing (one call row, one leg row)', async () => {
  for (let i = 0; i < 3; i++) { await hit('/voice/leg-status', { CallSid: L, ParentCallSid: P, CallStatus: 'in-progress' }); await hit('/voice/status', { CallSid: P, CallStatus: 'completed', CallDuration: '80', From: CUSTOMER, To: '+12895128112' }); }
  await sleep(400); const db = readDb(); const n = db.prepare('SELECT COUNT(*) n FROM calls WHERE call_sid = ?').get(P).n; const legs = db.prepare('SELECT COUNT(*) n FROM call_legs WHERE leg_sid = ?').get(L).n; db.close(); eq([n, legs], [1, 1]);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
cleanup(failed.length ? 1 : 0);
