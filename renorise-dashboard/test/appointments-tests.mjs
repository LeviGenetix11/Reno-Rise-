// Appointments screen tests (Cal.com consultation booking).
//
// Runs the REAL dashboard Worker (src/index.js) in Node against an in-memory
// D1-compatible database with every migration applied, using genuinely signed
// Access-style tokens (mock key endpoint). Authentication, authorization, CSRF and
// every CRM form are exercised through real requests. No network beyond localhost;
// test people use example.test addresses; nothing is ever emailed.
//
//   cd renorise-dashboard && node test/appointments-tests.mjs

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../src/index.js';
import { freshDb, ShimDb } from '../../renorise-forms/test/d1-shim.mjs';
import { torontoToday } from '../src/time.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };

// ---- signed test token + mock Access key endpoint ----
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const JWKS_PORT = 8853;
const jwks = createServer((rq, rs) => { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
const b64 = (x) => Buffer.from(x).toString('base64url');
function jwtFor(email = 'admin@example.test') {
  const now = Math.floor(Date.now() / 1000);
  const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64(JSON.stringify({ aud: ['aud'], iss: 'https://t.cloudflareaccess.com', exp: now + 3600, nbf: now - 5, email }))}`;
  return `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;
}
const JWT = jwtFor();
const ORIGIN = 'https://dash.test';
const makeEnv = (db) => ({ DB: db, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'admin@example.test', ACCESS_CERTS_URL: `http://127.0.0.1:${JWKS_PORT}/certs`, CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789abcdef' });
const NOW = () => new Date().toISOString();

function seed(db) {
  const mk = (id, name, email, o = {}) => db.run(
    `INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, project_details, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, `k-${id}`, o.created || NOW(), name, email, o.phone || '(416) 555-0100', o.city || 'Toronto M5V 3A3', o.type || 'Kitchen', 'Just exploring', o.details || 'Wants a new kitchen', o.source || 'assessment', o.status || 'new', 'sent', 'sent');
  mk('L1', 'Sam Tester', 'sam@example.test');
  mk('L2', '<script>alert("x")</script> Evil', 'evil@example.test', { type: '<img src=x onerror=alert(1)>', details: '=HYPERLINK("http://evil","x")' });
  mk('L3', 'Casey Contacted', 'casey@example.test', { status: 'contacted' });
  mk('L4', 'Sam Again', 'sam@example.test', { type: 'Bathroom' }); // same email as L1: a possible duplicate, not a merge
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('j1','L1','customer','L1:customer','sent',1,?,?)", NOW(), NOW());
}
async function fresh() { const db = freshDb(); seed(db); return { db, env: makeEnv(db) }; }

const req = (env, method, path, { jwt = JWT, form, headers = {} } = {}) => {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN } : {}), ...headers }, body }), env);
};
const get = (env, path, jwt) => req(env, 'GET', path, { jwt });
const text = async (env, path) => { const r = await get(env, path); eq(r.status, 200, `GET ${path}`); return r.text(); };
async function token(env) { const t = await (await get(env, '/today')).text(); const m = /name="csrf" value="([0-9a-f]{64})"/.exec(t); ok(m, 'no csrf token'); return m[1]; }
async function post(env, path, fields = {}) { return req(env, 'POST', path, { form: { csrf: await token(env), ...fields } }); }
const notice = (r) => (/[?&]notice=([a-z_]+)/.exec(r.headers.get('location') || '') || [])[1];
const loc = (r) => r.headers.get('location') || '';
const opp = (db, id) => db.one('SELECT * FROM opportunities WHERE id = ?', id);
const oid = (id) => `op-${id}`;
import { createHmac } from 'node:crypto';
import { receiveCalWebhook } from '../../renorise-shared/bookings-db.js';

const SECRET = 'appt-test-secret-not-real';
const sign = (b) => createHmac('sha256', SECRET).update(b).digest('hex');
const FUTURE = '2030-01-15T15:00:00.000Z'; // 10:00 a.m. Toronto (EST)
const FUTURE_END = '2030-01-15T15:15:00.000Z';
let n = 0;
function body({ trigger = 'BOOKING_CREATED', createdAt = '2026-09-21T15:00:00.000Z', uid = 'bk1', start = FUTURE, end = FUTURE_END, email = 'casey@example.test', name = 'Casey Contacted', phone = '+14165550100', note = 'Finish my basement', tz = 'America/Toronto' } = {}) {
  n++;
  return JSON.stringify({ triggerEvent: trigger, createdAt, payload: { type: 'consultation', title: 'Free Renovation Consultation', startTime: start, endTime: end, uid, bookingId: 500 + n, status: 'ACCEPTED',
    organizer: { name: 'RenoRise', email: 'hello@renosrise.com', timeZone: 'America/Toronto' }, attendees: [{ name, email, timeZone: tz }],
    responses: { name: { value: name }, email: { value: email }, attendeePhoneNumber: { value: phone }, notes: { value: note } }, metadata: {} } });
}
const deliver = (db, b, sig) => receiveCalWebhook({ db, secret: SECRET, rawBody: b, signature: sig === undefined ? sign(b) : sig, now: new Date('2026-09-21T15:00:05.000Z') });
const apptOf = (db, uid) => db.one("SELECT * FROM appointments WHERE source = 'calcom' AND external_ref = ?", uid);
async function booted() { const c = await fresh(); await get(c.env, '/today'); return c; } // creates the contact/project for every lead

console.log('Appointments screen (Cal.com bookings)');

console.log('\n[authorization and CSRF]');
const A_GET = ['/appointments', '/appointments?view=calendar', '/appointments/bookings/abcdefgh-1234'];
const A_POST = ['/appointments/settings', '/appointments/bookings/abcdefgh-1234/assign', '/appointments/bookings/abcdefgh-1234/dismiss'];
await test('appointment pages refuse unauthenticated (401) and non-admin (403) callers and reveal nothing', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  for (const p of A_GET) {
    const r = await get(env, p, null); eq(r.status, 401, `${p} unauthenticated`); ok(!/Casey Contacted|sam@example/.test(await r.text()), `${p} leaked`);
    const r2 = await get(env, p, jwtFor('stranger@example.test')); eq(r2.status, 403, `${p} non-admin`); ok(!/Casey Contacted|sam@example/.test(await r2.text()), `${p} leaked to non-admin`);
  }
  for (const p of A_POST) eq((await req(env, 'POST', p, { jwt: null, form: { csrf: 'x' } })).status, 401, `${p} unauthenticated POST`);
});
await test('every appointment write needs the CSRF token and a same-origin request', async () => {
  const { db, env } = await booted();
  await deliver(db, body({ email: 'nobody@example.test', phone: '+16475550000' }));
  const b = db.one('SELECT id FROM bookings');
  for (const p of ['/appointments/settings', `/appointments/bookings/${b.id}/assign`, `/appointments/bookings/${b.id}/dismiss`]) {
    eq((await req(env, 'POST', p, { form: { csrf: 'nope', booking_url: 'https://www.example.test/book/', lead_id: 'L1' } })).status, 403, `${p} bad token`);
    eq((await req(env, 'POST', p, { form: { csrf: await token(env) }, headers: { Origin: 'https://evil.example' } })).status, 403, `${p} cross-origin`);
  }
  eq(db.one('SELECT match_status s FROM bookings').s, 'unmatched', 'nothing changed');
});

console.log('\n[screen]');
await test('empty state: explains itself, shows the connection as waiting, and never claims availability', async () => {
  const { env } = await booted();
  const t = await text(env, '/appointments');
  ok(/Appointments/.test(t) && /Waiting for the first booking/.test(t), 'health waiting');
  ok(/No upcoming appointments/.test(t), 'empty list');
  ok(/nothing is stored here about availability/.test(t), 'availability note');
  ok(/href="\/appointments"/.test(t), 'nav entry');
  ok(t.includes('https://renorise-forms.levi-gene-ous.workers.dev/webhooks/calcom'), 'webhook address shown');
  ok(!t.includes(SECRET), 'no secret');
});
await test('a matched booking is listed in Toronto time, labelled as coming from Cal.com, with a Cal.com link; no move or cancel controls', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  const t = await text(env, '/appointments');
  ok(t.includes('Casey Contacted') && /10:00/.test(t), 'name + Toronto time');
  ok(/Booked through Cal\.com/.test(t), 'source label');
  ok(t.includes('href="https://app.cal.com/booking/bk1"'), 'manage link');
  ok(/Phone consultation/.test(t), 'kind');
  ok(/Working/.test(t), 'health ok');
  const sel = /<select id="st-[^"]+" name="status">(.*?)<\/select>/s.exec(t)[1];
  ok(/completed/.test(sel) && /no_show/.test(sel) && !/cancelled/.test(sel), 'a Cal.com booking cannot be cancelled by hand');
  const p = await text(env, '/leads/op-L3');
  ok(/Booked through Cal\.com/.test(p), 'project page label');
  ok(!/Reschedule to \(Toronto time\)/.test(p), 'no reschedule form on the project page');
  ok(!/<option value="cancelled">/.test(/id="appointments"[\s\S]*?<\/section>/.exec(p)[0]), 'no cancel option on the project page');
});
await test('the booker\'s time zone is shown when it differs from Toronto', async () => {
  const { db, env } = await booted();
  await deliver(db, body({ tz: 'America/Vancouver' }));
  ok(/Booker's time zone: America\/Vancouver/.test(await text(env, '/appointments')));
});
await test('calendar view: shows the appointment on its Toronto day, month navigation works, bad months fall back safely', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  const t = await text(env, '/appointments?view=calendar&month=2030-01');
  ok(/January 2030/.test(t) && /class="cal-appt st-scheduled"/.test(t) && /Casey Contacted/.test(t), 'appointment on the grid');
  ok(t.includes('month=2029-12') && t.includes('month=2030-02'), 'prev/next links');
  const other = await text(env, '/appointments?view=calendar&month=2030-02');
  ok(!/Casey Contacted/.test(other) && /0 appointments this month/.test(other), 'other month is empty');
  const bad = await text(env, '/appointments?view=calendar&month=%27%3E%3Cscript%3E');
  ok(!/<script>/.test(bad), 'bad month ignored');
  // a booking at 10:30 p.m. on 31 December Toronto time belongs to that day, not the next UTC day
  await deliver(db, body({ uid: 'bk2', createdAt: '2026-09-21T15:10:00.000Z', start: '2030-01-01T03:30:00.000Z', end: '2030-01-01T03:45:00.000Z', email: 'evil@example.test', name: 'Late Caller' }));
  const dec = await text(env, '/appointments?view=calendar&month=2029-12');
  ok(/Evil/.test(dec), '10:30 p.m. Dec 31 Toronto is in December');
});
await test('filters: upcoming / past-needs-outcome / cancelled; an unknown filter falls back to upcoming', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  await deliver(db, body({ uid: 'bk2', createdAt: '2026-09-21T15:10:00.000Z', start: '2020-01-15T15:00:00.000Z', end: '2020-01-15T15:15:00.000Z', email: 'evil@example.test', name: 'Second Caller' }));
  ok(!/Evil/.test(await text(env, '/appointments')), 'past hidden from upcoming');
  ok(/Evil/.test(await text(env, '/appointments?f=to_record')), 'past scheduled needs an outcome');
  await deliver(db, body({ trigger: 'BOOKING_CANCELLED', createdAt: '2026-09-21T16:00:00.000Z' }));
  const c = await text(env, '/appointments?f=cancelled');
  ok(/Casey Contacted/.test(c) && /Cancelled in Cal\.com/.test(c), 'cancelled tab + provider label');
  ok(!/Evil/.test(await text(env, '/appointments?f=%27nonsense')), 'unknown filter = upcoming');
});
await test('booker-supplied text (name, project note) is escaped everywhere it appears', async () => {
  const { db, env } = await booted();
  await deliver(db, body({ email: 'x@example.test', name: '<script>alert(1)</script> Eve', note: '<img src=x onerror=alert(1)>' }));
  const id = db.one('SELECT id FROM bookings').id;
  for (const p of ['/appointments', `/appointments/bookings/${id}`]) {
    const t = await text(env, p);
    ok(!/<script>alert|<img src=x/.test(t), `${p} unescaped`);
  }
  ok(/&lt;script&gt;/.test(await text(env, `/appointments/bookings/${id}`)));
});

console.log('\n[matching and outcomes]');
await test('an unmatched booking is listed for review with candidates; attaching it records the appointment, ends follow-ups, and cannot be redone', async () => {
  const { db, env } = await booted();
  await deliver(db, body({ email: 'different@example.test', phone: '+14165550100' })); // phone equals L1's; no email match
  const b = db.one('SELECT * FROM bookings');
  ok(['unmatched', 'ambiguous'].includes(b.match_status), `needs review, got ${b.match_status}`);
  ok(/Bookings to match/.test(await text(env, '/appointments')), 'review card');
  const t = await text(env, `/appointments/bookings/${b.id}`);
  ok(/Which inquiry is this\?/.test(t) && /Casey Contacted/.test(t), 'candidate by phone');
  ok(/does not give permission to send marketing email/.test(t), 'consent note');
  const q = await text(env, `/appointments/bookings/${b.id}?q=casey`);
  ok(/Casey Contacted/.test(q), 'search finds another inquiry');
  const r = await post(env, `/appointments/bookings/${b.id}/assign`, { lead_id: 'L1' });
  eq([r.status, notice(r), loc(r).startsWith('/appointments')], [303, 'booking_matched', true]);
  eq(db.one('SELECT match_method m FROM bookings').m, 'staff');
  ok(apptOf(db, 'bk1'), 'appointment created');
  ok(!/Bookings to match/.test(await text(env, '/appointments')), 'review card gone');
  eq(notice(await post(env, `/appointments/bookings/${b.id}/assign`, { lead_id: 'L3' })), 'booking_already_matched');
  eq(db.one('SELECT lead_id l FROM bookings').l, 'L1', 'not re-linked');
  eq(db.one("SELECT COUNT(*) n FROM lead_activity WHERE lead_id = 'L1' AND type = 'booking_matched'").n, 1, 'activity recorded');
  eq(db.one('SELECT COUNT(*) n FROM contact_permissions').n, 0, 'no permission created by attaching');
});
await test('dismissing keeps the booking and clears the to-do; an unknown lead id changes nothing', async () => {
  const { db, env } = await booted();
  await deliver(db, body({ email: 'spam@example.test', phone: '+16475559999' }));
  const id = db.one('SELECT id FROM bookings').id;
  eq(notice(await post(env, `/appointments/bookings/${id}/assign`, { lead_id: 'no-such-lead' })), 'not_found');
  eq(db.one('SELECT match_status s FROM bookings').s, 'unmatched');
  eq(notice(await post(env, `/appointments/bookings/${id}/dismiss`)), 'booking_dismissed');
  eq(db.one('SELECT match_status s FROM bookings').s, 'dismissed');
  ok(!/Bookings to match/.test(await text(env, '/appointments')));
  eq(db.one('SELECT COUNT(*) n FROM bookings').n, 1, 'not deleted');
});
await test('a staff outcome is recorded as staff and returns to the appointments screen; Cal.com bookings cannot be cancelled or moved by hand', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  const a = apptOf(db, 'bk1');
  eq(notice(await post(env, `/appointments/${a.id}/status`, { status: 'cancelled', back: 'appointments' })), 'appointment_cancel_in_calcom');
  eq(apptOf(db, 'bk1').status, 'scheduled');
  eq(notice(await post(env, `/appointments/${a.id}/reschedule`, { starts_at: '2030-02-01T10:00' })), 'appointment_move_in_calcom');
  eq(apptOf(db, 'bk1').starts_at, FUTURE);
  const r = await post(env, `/appointments/${a.id}/status`, { status: 'completed', back: 'appointments' });
  eq([notice(r), loc(r).startsWith('/appointments?')], ['appointment_completed', true]);
  const after = apptOf(db, 'bk1');
  eq([after.status, after.status_source], ['completed', 'staff']);
  ok(/Outcome recorded by staff/.test(await text(env, '/appointments?f=done')), 'labelled as staff');
  await deliver(db, body({ trigger: 'BOOKING_CANCELLED', createdAt: '2026-09-21T17:00:00.000Z' }));
  eq(apptOf(db, 'bk1').status, 'completed', 'a later provider event does not overwrite the staff outcome');
});
await test('a provider no-show flag is shown as a prompt but the appointment stays scheduled until staff decide', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  await deliver(db, JSON.stringify({ triggerEvent: 'BOOKING_NO_SHOW_UPDATED', createdAt: '2026-09-21T16:00:00.000Z', payload: { bookingUid: 'bk1', attendees: [{ email: 'casey@example.test', noShow: true }] } }));
  ok(/Cal\.com says the caller did not show/.test(await text(env, '/appointments')));
  eq(apptOf(db, 'bk1').status, 'scheduled');
});
await test('a manual appointment still works as before (reschedule and cancel available) and keeps consultation_at in step', async () => {
  const { db, env } = await booted();
  const r = await post(env, '/leads/op-L3/appointments', { kind: 'phone_consultation', starts_at: '2030-03-01T11:00' });
  eq(notice(r), 'appointment_saved');
  const a = db.one("SELECT * FROM appointments WHERE opportunity_id = 'op-L3'");
  eq([a.source, a.status_source], ['manual', 'staff']);
  ok(db.one("SELECT consultation_at c FROM leads WHERE id = 'L3'").c, 'consultation_at set from a manual phone consultation');
  const p = await text(env, '/leads/op-L3');
  ok(/Reschedule to \(Toronto time\)/.test(p) && /<option value="cancelled">/.test(p), 'manual controls intact');
  eq(notice(await post(env, `/appointments/${a.id}/reschedule`, { starts_at: '2030-03-02T11:00' })), 'appointment_rescheduled');
  eq(notice(await post(env, `/appointments/${a.id}/status`, { status: 'cancelled' })), 'appointment_cancelled');
  eq(db.one("SELECT consultation_at c FROM leads WHERE id = 'L3'").c, null, 'cleared on cancellation');
});
await test('a Cal.com phone consultation never sets the on-site assessment date, even when staff act on it', async () => {
  const { db, env } = await booted();
  await deliver(db, body());
  eq(db.one("SELECT assessment_at a FROM leads WHERE id = 'L1'").a, null, 'after booking');
  await post(env, `/appointments/${apptOf(db, 'bk1').id}/status`, { status: 'no_show' }); // runs the assessment mirror
  eq(db.one("SELECT assessment_at a FROM leads WHERE id = 'L1'").a, null, 'after a staff outcome');
});

console.log('\n[booking link setting]');
await test('the booking address must be https and plain; changing it clears "tested"; the button turns on only when both are set', async () => {
  const { db, env } = await booted();
  const S = () => Object.fromEntries(db.rows("SELECT key, value FROM sequence_settings WHERE key LIKE 'booking%'").map((r) => [r.key, r.value]));
  for (const bad of ['http://www.example.test/book/', 'ftp://x/y', 'not a url', 'https://user:pw@www.example.test/book/', 'https://www.example.test/book/?a=b', 'https://www.example.test/book/#x']) {
    eq(notice(await post(env, '/appointments/settings', { booking_url: bad, tested_present: '1' })), 'bad_booking_url', bad);
  }
  eq(S(), { booking_url: '', booking_link_tested: '0' }, 'nothing saved');
  eq(notice(await post(env, '/appointments/settings', { booking_url: '', tested: 'yes', tested_present: '1' })), 'booking_url_first');
  eq(notice(await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/book/', tested_present: '1' })), 'booking_settings_saved');
  eq(S(), { booking_url: 'https://www.example.test/book/', booking_link_tested: '0' }, 'saved but untested');
  eq(notice(await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/book/', tested: 'yes', tested_present: '1' })), 'booking_settings_live');
  eq(S().booking_link_tested, '1');
  eq(notice(await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/book2/', tested_present: '1' })), 'booking_settings_saved');
  eq(S(), { booking_url: 'https://www.example.test/book2/', booking_link_tested: '0' }, 'a new address must be tested again');
  ok(/<span class="badge">Off<\/span>/.test(await text(env, '/appointments')), 'shown as off');
  eq(db.one("SELECT updated_by u FROM sequence_settings WHERE key = 'booking_url'").u, 'admin@example.test', 'who changed it is recorded');
});
await test('email previews show the booking button only when an address is saved, and say when it is preview-only', async () => {
  const { env } = await booted();
  ok(/There is no booking link yet/.test(await text(env, '/sequence/preview')));
  await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/book/', tested_present: '1' });
  let t = await text(env, '/sequence/preview');
  ok(t.includes('Or book a time that suits you: https://www.example.test/book/') && /preview only/.test(t), 'untested = preview only');
  await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/book/', tested: 'yes', tested_present: '1' });
  t = await text(env, '/sequence/preview');
  ok(/included in real emails/.test(t) && !/preview only/.test(t), 'tested = included');
});

console.log('\n[connection health]');
await test('a rejected (bad-signature) delivery turns the connection card red and no payload is kept', async () => {
  const { db, env } = await booted();
  await deliver(db, body(), 'f'.repeat(64));
  const t = await text(env, '/appointments');
  ok(/Needs attention/.test(t) && /rejected for a bad signature/.test(t), 'bad signature reported');
  eq(db.one('SELECT COUNT(*) n FROM bookings').n, 0);
  ok(!/Casey Contacted|sam@example/.test(JSON.stringify(db.rows('SELECT * FROM booking_events'))), 'no payload or contact details stored with the event');
});
await test('without migration 0006 the screen says so (503) instead of failing oddly', async () => {
  const { db, env } = await booted();
  db.run('DROP TABLE bookings');
  const r = await get(env, '/appointments');
  eq(r.status, 503);
  ok(/Database update needed/.test(await r.text()));
});
await test('no booking details are written to the Worker logs', async () => {
  const { db, env } = await booted(); const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try { await deliver(db, body({ email: 'probe@example.test', name: 'Log Probe', phone: '+16475557777' })); const id = db.one('SELECT id FROM bookings').id; await get(env, '/appointments'); await get(env, `/appointments/bookings/${id}`); await post(env, '/appointments/settings', { booking_url: 'https://www.example.test/secret-path/', tested_present: '1' }); } finally { console.log = orig; }
  ok(!logs.join('\n').match(/probe@example|7777|Log Probe|secret-path|bk1/), `booking data in logs: ${logs.join(' | ').slice(0, 200)}`);
});

jwks.close();
console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
