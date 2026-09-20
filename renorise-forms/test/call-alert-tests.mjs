// Missed-call / voicemail alert tests (forms Worker + shared budget + the voice Worker's data).
//
// Real modules, in-memory D1 with every migration, a mock Resend server (remembers
// Idempotency-Keys like the real API), and a simulated clock. No network, no real email.
//
//   cd renorise-forms && node test/call-alert-tests.mjs

import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { freshDb } from './d1-shim.mjs';
import { runCallAlerts, callAlertEmail } from '../src/calls/alerts.js';
import forms from '../src/index.js';
import voice from '../../renorise-voice/src/index.js';
import { finalizeStaleCalls } from '../../renorise-shared/calls-db.js';
import { saveSetting, usage } from '../../renorise-shared/followup-db.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };
const at = (iso) => new Date(iso);

const PORT = 8861;
let mode = 'ok';
let mail = [];
const seen = new Map();
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const key = req.headers['idempotency-key'];
    if (mode === '500') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'outage' })); }
    if (mode === '422') { res.writeHead(422, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'invalid recipient' })); }
    if (key && seen.has(key)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: seen.get(key) })); }
    const id = `msg-${mail.length + 1}`;
    if (key) seen.set(key, id);
    mail.push({ key, payload: JSON.parse(body || '{}') });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id }));
  });
});
await new Promise((r) => mock.listen(PORT, '127.0.0.1', r));
const reset = () => { mail = []; seen.clear(); mode = 'ok'; };

function setup() {
  reset();
  const db = freshDb();
  const env = { DB: db, RESEND_API_KEY: 're_test_not_real', RESEND_API_URL: `http://127.0.0.1:${PORT}/emails`, INTERNAL_NOTIFY_EMAIL: 'hello@renosrise.com', CUSTOMER_FROM_EMAIL: 'RenoRise <hello@notify.renosrise.com>', REPLY_TO_EMAIL: 'hello@renosrise.com', DASHBOARD_BASE_URL: 'https://dash.example.test', ALLOWED_ORIGINS: 'https://www.renosrise.com' };
  return { db, env };
}
let seq = 0;
function addCall(db, o = {}) {
  seq++;
  const id = o.id || `call-${seq}`;
  db.run(
    `INSERT INTO calls (id, call_sid, from_number, from_norm, caller_withheld, to_number, started_at, ended_at, duration_seconds, parent_status, outcome, hangup_stage, recording_sid, recording_status, recording_duration_seconds, recording_confirmed_at, contact_id, disposition, match_status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, `CA${String(seq).padStart(32, '0')}`, o.withheld ? null : '+14165550100', o.withheld ? null : '4165550100', o.withheld ? 1 : 0, '+12895128112', o.started || '2026-10-14T14:00:00.000Z', o.ended === undefined ? '2026-10-14T14:01:00.000Z' : o.ended, 60, 'completed',
    o.outcome || 'missed', o.stage || 'ringing', o.rec ? `RE${String(seq).padStart(32, '0')}` : null, o.recStatus || null, o.recSeconds ?? null, o.recStatus === 'completed' ? '2026-10-14T14:02:00.000Z' : null, o.contact || null, o.disposition || 'open', o.contact ? 'matched' : 'unmatched', '2026-10-14T14:00:00.000Z', '2026-10-14T14:01:00.000Z'
  );
  return id;
}
const alerts = (db) => db.rows('SELECT * FROM call_alerts ORDER BY created_at');
const T = (m) => at(new Date(Date.parse('2026-10-14T14:01:00.000Z') + m * 60000).toISOString()); // minutes after the call ended

console.log('Call alerts');

console.log('\n[when an alert is sent]');
await test('a missed call produces ONE alert to the business inbox, with a link to the private call record and no audio', async () => {
  const { db, env } = setup(); const id = addCall(db); const r = await runCallAlerts(env, db, { now: T(3) });
  eq([r.created, r.sent], [1, 1]); eq(mail.length, 1); const m = mail[0].payload;
  eq(m.to, ['hello@renosrise.com']); eq(m.subject, 'Missed RenoRise call from (416) 555-0100'); ok(m.html.includes(`https://dash.example.test/calls/${id}`) && m.text.includes(`https://dash.example.test/calls/${id}`), 'links to the private call record');
  ok(!/<audio|\.mp3|\.wav|RecordingUrl/i.test(m.html + m.text), 'no audio or recording link'); ok(/signed in/i.test(m.text), 'says sign-in is needed'); eq(mail[0].key, `call-alert:${id}`, 'stable idempotency key');
  eq(db.one('SELECT status FROM call_alerts').status, 'sent'); ok(db.rows('SELECT kind FROM call_events WHERE call_id = ?', id).some((e) => e.kind === 'alert_sent'), 'recorded on the call');
});
await test('a finished voicemail produces ONE alert saying voicemail with its length (not also a "missed" alert)', async () => {
  const { db, env } = setup(); addCall(db, { outcome: 'voicemail', stage: null, rec: true, recStatus: 'completed', recSeconds: 42 }); await runCallAlerts(env, db, { now: T(1) }); await runCallAlerts(env, db, { now: T(30) });
  eq(mail.length, 1); eq(mail[0].payload.subject, 'New RenoRise voicemail (0:42) from (416) 555-0100'); eq(alerts(db)[0].kind, 'voicemail');
});
await test('a call is given time to settle, so a late recording report is reported as a voicemail, not as a missed call', async () => {
  const { db, env } = setup(); const id = addCall(db, { outcome: 'missed' });
  eq((await runCallAlerts(env, db, { now: T(1) })).created, 0, 'a missed call waits 2 minutes');
  db.run("UPDATE calls SET outcome='voicemail', hangup_stage=NULL, recording_sid='RE1', recording_status='completed', recording_duration_seconds=30, recording_confirmed_at='2026-10-14T14:02:00.000Z' WHERE id=?", id); // the late callback arrives
  await runCallAlerts(env, db, { now: T(3) }); eq(mail.length, 1); ok(/voicemail/i.test(mail[0].payload.subject), mail[0].payload.subject);
  const v = setup(); addCall(v.db, { outcome: 'voicemail', stage: null, rec: true, recStatus: 'in-progress', recSeconds: 0 });
  eq((await runCallAlerts(v.env, v.db, { now: T(5) })).created, 0, 'an unconfirmed voicemail waits'); eq((await runCallAlerts(v.env, v.db, { now: T(11) })).sent, 1, 'after 10 minutes it is reported, flagged as unconfirmed'); ok(/not confirmed/i.test(mail[0].payload.text), 'says so');
});
await test('answered (accepted) calls, spam, irrelevant and unfinished calls get no alert', async () => {
  const { db, env } = setup();
  addCall(db, { outcome: 'accepted', stage: null }); addCall(db, { disposition: 'spam' }); addCall(db, { disposition: 'irrelevant' }); addCall(db, { outcome: 'in_progress', ended: null });
  const r = await runCallAlerts(env, db, { now: T(30) }); eq([r.created, r.sent, mail.length], [0, 0, 0]);
});
await test('a call marked spam AFTER its alert was queued but before it was sent is cancelled, not emailed', async () => {
  const { db, env } = setup(); mode = '500'; const id = addCall(db); await runCallAlerts(env, db, { now: T(3) }); eq(alerts(db)[0].status, 'pending'); mode = 'ok';
  db.run("UPDATE calls SET disposition='spam' WHERE id=?", id); await runCallAlerts(env, db, { now: T(20) }); eq(mail.length, 0); eq(alerts(db)[0].status, 'cancelled');
});
await test('withheld callers and unusual names are handled, and every dynamic value is escaped', async () => {
  const { db, env } = setup(); db.run("INSERT INTO contacts (id, display_name, created_at, created_by, updated_at) VALUES ('ct-x','<script>alert(1)</script> Sam','2026-09-01','t','2026-09-01')"); addCall(db, { withheld: true }); addCall(db, { contact: 'ct-x' });
  await runCallAlerts(env, db, { now: T(3) }); eq(mail.length, 2); ok(mail.some((m) => m.payload.subject === 'Missed RenoRise call from a withheld number')); const named = mail.find((m) => m.payload.html.includes('Sam'));
  ok(named.payload.html.includes('&lt;script&gt;') && !named.payload.html.includes('<script>'), 'escaped'); ok(callAlertEmail({ id: 'x', outcome: 'missed', from_number: '+14165550100', started_at: '2026-10-14T14:00:00.000Z' }, null, env).text.includes('None yet'), 'no contact yet');
});

console.log('\n[no duplicate alerts]');
await test('running the job again and again, or two runs at once, still sends exactly one email per call', async () => {
  const { db, env } = setup(); addCall(db); addCall(db, { withheld: true });
  await Promise.all([runCallAlerts(env, db, { now: T(3) }), runCallAlerts(env, db, { now: T(3) })]); for (let i = 0; i < 4; i++) await runCallAlerts(env, db, { now: T(10 + i) });
  eq(mail.length, 2, 'two calls, two emails'); eq(alerts(db).length, 2); eq(db.one("SELECT COUNT(*) n FROM call_events WHERE kind='alert_sent'").n, 2);
});
await test('a database-level guarantee: the same call cannot get a second alert row at all', async () => {
  const { db } = setup(); const id = addCall(db); db.run("INSERT INTO call_alerts (id, call_id, kind, idempotency_key, created_at, updated_at) VALUES ('a1', ?, 'missed', 'k1', 'x', 'x')", id);
  let refused = false; try { db.run("INSERT INTO call_alerts (id, call_id, kind, idempotency_key, created_at, updated_at) VALUES ('a2', ?, 'voicemail', 'k2', 'x', 'x')", id); } catch { refused = true; } ok(refused, 'UNIQUE(call_id)');
});
await test('END TO END: every Twilio callback for a missed call delivered three times still yields exactly one alert', async () => {
  const { db, env } = setup(); const token = 'tok-not-real'; const sid = `AC${'a'.repeat(32)}`; const venv = { ...env, TWILIO_AUTH_TOKEN: token, TWILIO_ACCOUNT_SID: sid, FORWARD_TO_NUMBER: '+14165550199', BUSINESS_NUMBER: '+12895128112' };
  const hit = async (path, params) => { const url = `https://voice.test${path}`; const all = { AccountSid: sid, ...params }; let s = url; for (const k of Object.keys(all).sort()) s += k + all[k]; const pend = []; const res = await voice.fetch(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': createHmac('sha1', token).update(s).digest('base64') }, body: new URLSearchParams(all).toString() }), venv, { waitUntil: (p) => pend.push(p) }); await Promise.all(pend); return res; };
  const P = 'CA' + 'e'.repeat(32); const L = 'CB' + 'e'.repeat(32);
  for (let i = 0; i < 3; i++) {
    await hit('/voice/incoming', { CallSid: P, From: '+14165550100', To: '+12895128112' }); await hit('/voice/leg-status', { CallSid: L, ParentCallSid: P, CallStatus: 'ringing' }); await hit('/voice/leg-status', { CallSid: L, ParentCallSid: P, CallStatus: 'no-answer' });
    await hit('/voice/dial-complete', { CallSid: P, DialCallStatus: 'no-answer', DialCallDuration: '0' }); await hit('/voice/status', { CallSid: P, CallStatus: 'completed', CallDuration: '30', From: '+14165550100', To: '+12895128112' });
  }
  const call = db.one('SELECT * FROM calls'); eq(call.outcome, 'no_message'); const now = new Date(Date.parse(call.ended_at) + 3 * 60000);
  for (let i = 0; i < 3; i++) await runCallAlerts(env, db, { now }); eq(mail.length, 1, 'one email'); eq(db.one('SELECT COUNT(*) n FROM calls').n, 1);
});

console.log('\n[email limits, retries and failures]');
await test('the shared email budget is respected: alerts count toward the daily total and wait when the limit is reached', async () => {
  const { db, env } = setup(); addCall(db); await saveSetting(db, 'account_daily_cap', '1', 't'); db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) SELECT 'j1', 'L', 'customer', 'x', 'sent', 1, '2026-10-14T14:00:00.000Z', '2026-10-14T14:00:30.000Z' WHERE 0");
  db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L','k','2026-10-14','n','n@example.test','1','c','r','t','homepage','new','sent','sent')");
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('j1','L','customer','x','sent',1,'2026-10-14T14:00:00.000Z','2026-10-14T14:02:00.000Z')");
  const r = await runCallAlerts(env, db, { now: T(3) }); eq([r.sent, r.waiting, mail.length], [0, 1, 0]); eq(alerts(db)[0].status, 'pending', 'kept for later');
  await saveSetting(db, 'account_daily_cap', '100', 't'); eq((await runCallAlerts(env, db, { now: T(20) })).sent, 1);
  const u = await usage(db, T(20)); ok(u.day_all >= 2, 'alerts are counted in the shared total');
});
await test('a Resend outage is retried by the next run with the SAME idempotency key, and the email goes out once', async () => {
  const { db, env } = setup(); const id = addCall(db); mode = '500'; let r = await runCallAlerts(env, db, { now: T(3) }); eq([r.sent, r.failed], [0, 1]); let a = alerts(db)[0]; eq([a.status, a.attempts], ['pending', 1]); mode = 'ok';
  r = await runCallAlerts(env, db, { now: T(18) }); eq(r.sent, 1); eq(mail.length, 1); eq(mail[0].key, `call-alert:${id}`); eq(alerts(db)[0].status, 'sent');
});
await test('a permanent rejection stops retrying (failed), and attempts are bounded', async () => {
  const { db, env } = setup(); addCall(db); mode = '422'; await runCallAlerts(env, db, { now: T(3) }); eq(alerts(db)[0].status, 'failed'); mode = 'ok'; await runCallAlerts(env, db, { now: T(30) }); eq(mail.length, 0, 'not retried');
  const b = setup(); addCall(b.db); mode = '500'; for (let i = 0; i < 9; i++) await runCallAlerts(b.env, b.db, { now: T(3 + i * 15) }); const a = alerts(b.db)[0]; ok(a.attempts <= a.max_attempts, `attempts ${a.attempts}`); eq(a.status, 'failed');
});
await test('an alert failure can never break the confirmation emails: the scheduled job still sends a pending customer confirmation', async () => {
  const { db, env } = setup(); addCall(db); mode = '500';
  db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L1','k1','2026-10-14T13:00:00.000Z','Sam','sam@example.test','(416) 555-0100','Toronto','Kitchen','Just exploring','homepage','new','pending','pending')");
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('j1','L1','customer','L1:customer','pending',0,'2026-10-14T13:00:00.000Z','2026-10-14T13:00:00.000Z')");
  const pend = []; await forms.scheduled({}, env, { waitUntil: (p) => pend.push(p) }); await Promise.all(pend); mode = 'ok';
  const pend2 = []; await forms.scheduled({}, env, { waitUntil: (p) => pend2.push(p) }); await Promise.all(pend2); ok(mail.some((m) => m.key === 'L1:customer'), 'the confirmation email still went out'); eq(db.one("SELECT status FROM email_jobs WHERE id='j1'").status, 'sent');
});
await test('a broken alert job (for example the calls table missing) is logged and does not stop the rest of the scheduled job', async () => {
  const { db, env } = setup(); db.exec('DROP TABLE call_alerts'); const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L1','k1','2026-10-14T13:00:00.000Z','Sam','sam@example.test','(416) 555-0100','Toronto','Kitchen','Just exploring','homepage','new','pending','pending')");
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('j1','L1','customer','L1:customer','pending',0,'2026-10-14T13:00:00.000Z','2026-10-14T13:00:00.000Z')");
  try { const pend = []; await forms.scheduled({}, env, { waitUntil: (p) => pend.push(p) }); await Promise.all(pend); } finally { console.log = orig; }
  ok(logs.some((l) => /Call alert job error/.test(l)), 'logged'); ok(!logs.join(' ').includes('4165550100') && !logs.join(' ').includes('sam@example'), 'no customer details in logs'); ok(mail.some((m) => m.key === 'L1:customer'), 'confirmation still sent');
});
await test('a call that never got its final report from Twilio is closed and alerted as missed by the scheduled job', async () => {
  const { db, env } = setup(); const id = addCall(db, { outcome: 'in_progress', ended: null, stage: null }); db.run("UPDATE calls SET parent_status = NULL WHERE id=?", id);
  const later = new Date(Date.parse('2026-10-14T14:01:00.000Z') + 60 * 60000); eq(await finalizeStaleCalls(db, later), 1); const r = await runCallAlerts(env, db, { now: new Date(later.getTime() + 3 * 60000) }); eq(r.sent, 1); ok(/Missed RenoRise call/.test(mail[0].payload.subject));
});

mock.close();
console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
