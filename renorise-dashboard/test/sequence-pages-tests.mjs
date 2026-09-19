// Dashboard tests for the follow-up sequence pages and forms.
//
// Runs the REAL dashboard Worker (src/index.js) in Node against an in-memory
// D1-compatible database with all migrations applied, using genuinely signed
// Access-style tokens (mock key endpoint), so authentication, authorization,
// CSRF, and every form are exercised for real. No network beyond localhost.
//
//   cd renorise-dashboard && node test/sequence-pages-tests.mjs

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import worker from '../src/index.js';
import { freshDb } from '../../renorise-forms/test/d1-shim.mjs';
import { saveSetting } from '../../renorise-shared/followup-db.js';

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
const JWKS_PORT = 8841;
const jwks = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => jwks.listen(JWKS_PORT, '127.0.0.1', r));
const b64 = (x) => Buffer.from(x).toString('base64url');
function jwtFor(email = 'admin@example.test') {
  const now = Math.floor(Date.now() / 1000);
  const si = `${b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64(JSON.stringify({ aud: ['aud'], iss: 'https://t.cloudflareaccess.com', exp: now + 3600, nbf: now - 5, email }))}`;
  return `${si}.${createSign('RSA-SHA256').update(si).sign(privateKey).toString('base64url')}`;
}
const JWT = jwtFor();

const ORIGIN = 'https://dash.test';
function makeEnv(db) {
  return { DB: db, ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'admin@example.test', ACCESS_CERTS_URL: `http://127.0.0.1:${JWKS_PORT}/certs`, CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789abcdef' };
}
async function fresh() {
  const db = freshDb();
  const mk = (id, name, email, created = '2026-09-19T15:00:00.000Z') => db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", id, `k-${id}`, created, name, email, '(416) 555-0100', 'Toronto', 'Kitchen', 'Just exploring', 'homepage', 'new', 'sent', 'sent');
  // inquiries received right now, so all three steps are in the future (deterministic at any time of day)
  mk('L1', 'Sam Tester', 'sam@example.test', new Date().toISOString());
  mk('L2', '<script>alert("x")</script> Evil', 'evil@example.test', new Date().toISOString());
  return { db, env: makeEnv(db) };
}
const req = (env, method, path, { jwt = JWT, form, headers = {} } = {}) => {
  const body = form ? new URLSearchParams(form).toString() : undefined;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN } : {}), ...headers }, body }), env);
};
const get = (env, path, jwt) => req(env, 'GET', path, { jwt });
async function token(env, path = '/sequence') { const t = await (await get(env, path)).text(); const m = /name="csrf" value="([0-9a-f]{64})"/.exec(t); ok(m, `no csrf token on ${path}`); return m[1]; }
async function post(env, path, fields = {}) { return req(env, 'POST', path, { form: { csrf: await token(env), ...fields } }); }
const notice = (r) => (/[?&]notice=([a-z_]+)/.exec(r.headers.get('location') || '') || [])[1];
const CONSENT = { kind: 'website', confirmed: 'yes', method: 'phone_verbal', given_on: new Date().toISOString().slice(0, 10), evidence: 'Customer said yes on the phone today' };

console.log('Dashboard: follow-up email pages');

console.log('\n[authorization]');
await test('every follow-up page and form refuses an unauthenticated caller (401) and a non-admin (403); nothing is revealed', async () => {
  const { env } = await fresh();
  for (const p of ['/sequence', '/sequence/queue', '/sequence/preview', '/sequence/settings', '/leads/L1/sequence']) {
    const r = await get(env, p, null); eq(r.status, 401, p); ok(!(await r.text()).includes('Sam Tester'), 'leak');
    eq((await get(env, p, jwtFor('stranger@example.test'))).status, 403, `${p} non-admin`);
  }
  for (const p of ['/sequence/switch', '/sequence/settings', '/sequence/test-send', '/leads/L1/sequence/enroll', '/sequence/steps/x/approve', '/sequence/enrollments/x/stop', '/sequence/sends/x/retry']) eq((await req(env, 'POST', p, { jwt: null, form: { csrf: 'a'.repeat(64) } })).status, 401, `${p} unauth POST`);
});
await test('CSRF still protects the new forms: a post without a valid token or from another origin changes nothing', async () => {
  const { db, env } = await fresh();
  const noToken = await req(env, 'POST', '/sequence/switch', { form: { on: '1', confirm: 'ENABLE FOLLOW-UPS' } }); eq(noToken.status, 403, 'no token');
  const evil = await req(env, 'POST', '/sequence/settings', { form: { csrf: await token(env), business_legal_name: 'X' }, headers: { Origin: 'https://evil.example' } }); eq(evil.status, 403, 'wrong origin');
  eq(db.one("SELECT value v FROM sequence_settings WHERE key='global_send_enabled'").v, '0', 'switch untouched'); eq(db.one("SELECT COUNT(*) n FROM sequence_settings WHERE key='business_legal_name'").n, 0, 'settings untouched');
});

console.log('\n[pages render]');
await test('overview, queue, preview, settings render; the switch shows OFF; nav includes Follow-up emails', async () => {
  const { env } = await fresh();
  const o = await (await get(env, '/sequence')).text();
  ok(/Sending is OFF/.test(o) && /Nothing is sent to customers/.test(o), 'OFF banner'); ok(/Follow-up emails<\/a>/.test(o), 'nav');
  ok(/Day 1 after the inquiry/.test(o) && /Day 4 after/.test(o) && /Day 14 after/.test(o), 'three steps listed'); ok(!/Day 21|Day 28|Email 4/.test(o.replace('Nothing is sent at Day 21 or Day 28', '')), 'no fourth/day-21/day-28 email');
  ok(/at most 5 emails/.test(o) && /1 confirmation, 1 internal notification, 3 follow-ups/.test(o), 'usage estimate');
  ok(/of 100 emails used/.test(o) && /of 3000/.test(o), 'free-plan budget shown');
  ok(/cannot detect replies automatically/.test(o), 'inbox reminder');
  for (const p of ['/sequence/queue', '/sequence/preview', '/sequence/preview?name=Jamie%20Lee', '/sequence/settings']) eq((await get(env, p)).status, 200, p);
});
await test('preview shows all three emails in both versions with the approved subjects, the fallback greeting, and a clear placeholder footer until business details exist', async () => {
  const { env } = await fresh();
  const t = await (await get(env, '/sequence/preview')).text();
  for (const s of ['Did you get the help you needed?', 'Any questions about your home project?', 'Our last check-in—for now']) ok(t.includes(s), s);
  ok(t.includes('Hi there,'), 'fallback greeting'); ok(t.includes('required before sending'), 'placeholder'); ok(/Thanks for sending your renovation inquiry/.test(t) && /Thanks for calling RenoRise/.test(t), 'both variants');
  ok(/The RenoRise Team\s*hello@renosrise\.com/.test(t.replace(/\n/g, ' ')), 'signature'); ok(!/calendly|https?:\/\/[^\s"<]*book/i.test(t), 'no actual booking link in any email');
  ok((await (await get(env, '/sequence/preview?name=Jamie%20Lee')).text()).includes('Hi Jamie,'), 'named greeting');
});
await test('preview greeting name is escaped (no markup injection)', async () => {
  const { env } = await fresh(); const t = await (await get(env, '/sequence/preview?name=%3Cscript%3Ealert(1)%3C/script%3E')).text();
  ok(!t.includes('<script>alert(1)'), 'escaped'); ok(t.includes('Hi there,'), 'unsafe name falls back');
});

console.log('\n[enrolling: permission is required, dates are shown first]');
await test('the enroll page shows the planned Day 1 / Day 4 / Day 14 dates BEFORE anything is saved, and requires a recorded call date for callers', async () => {
  const { db, env } = await fresh();
  const t = await (await get(env, '/leads/L1/sequence')).text();
  ok(/Planned dates/.test(t) && /Day 1/.test(t) && /Day 4/.test(t) && /Day 14/.test(t), 'dates shown'); ok(/explicit agreed|explicitly agreed/.test(t), 'consent box'); eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 0, 'nothing saved by viewing');
  ok(/Enter the recorded call date/.test(await (await get(env, '/leads/L1/sequence?kind=call')).text()), 'call needs a date');
  const c = await (await get(env, '/leads/L1/sequence?kind=call&call_date=2026-09-01')).text(); ok(/Skipped — that date has already passed/.test(c), 'late enrollment shows elapsed steps');
});
await test('enrolling WITHOUT the permission checkbox / method / note is refused and saves nothing', async () => {
  const { db, env } = await fresh();
  for (const [patch, code] of [[{ confirmed: '' }, 'consent_unconfirmed'], [{ method: '' }, 'consent_method'], [{ evidence: '' }, 'consent_evidence'], [{ given_on: '' }, 'consent_date']]) {
    const r = await post(env, '/leads/L1/sequence/enroll', { ...CONSENT, ...patch }); eq(r.status, 303); eq(notice(r), code, JSON.stringify(patch));
  }
  eq(db.one('SELECT COUNT(*) n FROM enrollments').n + db.one('SELECT COUNT(*) n FROM consents').n, 0, 'nothing saved');
});
await test('enrolling with recorded permission works once; the lead page then shows status, permission, and steps; a second enroll is refused', async () => {
  const { db, env } = await fresh();
  const r = await post(env, '/leads/L1/sequence/enroll', CONSENT); eq(notice(r), 'enrolled'); eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 1);
  const t = await (await get(env, '/leads/L1')).text();
  ok(/Follow-up emails/.test(t) && /Active/.test(t) && /Permission: Customer agreed by phone/.test(t) && /Customer said yes on the phone today/.test(t), 'card');
  ok((t.match(/Email \d \(Day \d+\)/g) || []).length === 3, 'exactly three steps shown');
  eq(notice(await post(env, '/leads/L1/sequence/enroll', CONSENT)), 'already_enrolled');
});
await test('leads that are not eligible (unsubscribed address, Won) cannot be enrolled through the form either', async () => {
  const { db, env } = await fresh(); db.run("INSERT INTO suppressions (email, reason, created_at) VALUES ('sam@example.test','unsubscribe','2026-09-01T00:00:00Z')");
  eq(notice(await post(env, '/leads/L1/sequence/enroll', CONSENT)), 'not_eligible_unsubscribed');
  db.run("UPDATE leads SET status='won' WHERE id='L2'"); eq(notice(await post(env, '/leads/L2/sequence/enroll', CONSENT)), 'not_eligible_won');
});
await test('customer-supplied text (name, permission note) is escaped everywhere it appears', async () => {
  const { db, env } = await fresh();
  await post(env, '/leads/L2/sequence/enroll', { ...CONSENT, evidence: '<img src=x onerror=alert(1)> said yes' });
  db.run("UPDATE enrollment_steps SET planned_for = '2020-01-01T13:00:00.000Z', original_planned_for = '2020-01-01T13:00:00.000Z'");
  for (const p of ['/leads/L2', '/sequence/queue', '/sequence']) { const t = await (await get(env, p)).text(); ok(!/<script>alert|<img src=x/.test(t), `${p}: raw markup`); }
  ok((await (await get(env, '/leads/L2')).text()).includes('&lt;img src=x onerror=alert(1)&gt; said yes'), 'escaped note');
});

console.log('\n[approval queue]');
await test('a due step appears in the queue; approving REQUIRES the inbox check; then it is approved once (double click safe)', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  db.run("UPDATE enrollment_steps SET planned_for = '2020-01-01T13:00:00.000Z', original_planned_for = '2020-01-01T13:00:00.000Z' WHERE step_no = 1");
  const q = await (await get(env, '/sequence/queue')).text(); ok(/Sam Tester/.test(q) && /Email 1 \(Day 1\)/.test(q) && /checked the hello@renosrise\.com inbox/.test(q), 'queued with the inbox checkbox');
  const stepId = db.one('SELECT id FROM enrollment_steps WHERE step_no = 1').id;
  eq(notice(await post(env, `/sequence/steps/${stepId}/approve`, { back: 'queue' })), 'inbox_not_checked', 'no checkbox');
  eq(db.one('SELECT status FROM enrollment_steps WHERE step_no = 1').status, 'planned', 'still planned');
  eq(notice(await post(env, `/sequence/steps/${stepId}/approve`, { back: 'queue', inbox_checked: 'yes' })), 'step_approved');
  eq(notice(await post(env, `/sequence/steps/${stepId}/approve`, { back: 'queue', inbox_checked: 'yes' })), 'step_not_pending', 'second click is refused, not duplicated');
  const s = db.one('SELECT status, approved_by, inbox_checked FROM enrollment_steps WHERE step_no = 1'); eq([s.status, s.approved_by, s.inbox_checked], ['approved', 'admin@example.test', 1], 'recorded');
});
await test('a step that is not yet due cannot be approved, and later steps cannot jump the queue', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  const ids = db.rows('SELECT id FROM enrollment_steps ORDER BY step_no').map((r) => r.id);
  eq(notice(await post(env, `/sequence/steps/${ids[2]}/approve`, { inbox_checked: 'yes' })), 'not_next_step');
  db.run("UPDATE enrollment_steps SET planned_for = '2099-01-01T13:00:00.000Z' WHERE step_no = 1"); eq(notice(await post(env, `/sequence/steps/${ids[0]}/approve`, { inbox_checked: 'yes' })), 'not_due_yet');
});
await test('approval re-checks eligibility: a lead that became Won since enrollment is stopped instead of approved', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  db.run("UPDATE enrollment_steps SET planned_for = '2020-01-01T13:00:00.000Z' WHERE step_no = 1"); db.run("UPDATE leads SET status='won' WHERE id='L1'");
  const id = db.one('SELECT id FROM enrollment_steps WHERE step_no = 1').id; eq(notice(await post(env, `/sequence/steps/${id}/approve`, { inbox_checked: 'yes' })), 'stopped_on_approve');
  eq(db.one('SELECT stop_reason r FROM enrollments').r, 'won');
});

console.log('\n[stop, pause, skip from the lead page]');
await test('recording a reply stops the sequence, cancels every unsent step, and the page says so', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  const eid = db.one('SELECT id FROM enrollments').id;
  eq(notice(await post(env, `/sequence/enrollments/${eid}/stop`, { reason: 'reply', back: 'lead' })), 'stopped');
  eq(db.one('SELECT status, stop_reason FROM enrollments').stop_reason, 'reply'); ok(db.rows('SELECT status FROM enrollment_steps WHERE status != \'skipped_elapsed\'').every((r) => r.status === 'cancelled'), 'steps cancelled');
  ok(/Stopped — Customer replied/.test(await (await get(env, '/leads/L1')).text()), 'shown on the lead');
  eq(notice(await post(env, '/sequence/enrollments/' + eid + '/stop', { reason: 'not-a-reason' })), 'bad_request', 'bogus reason refused');
});
await test('declining or unsubscribing by reply blocks future enrollment of that address', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT); const eid = db.one('SELECT id FROM enrollments').id;
  await post(env, `/sequence/enrollments/${eid}/stop`, { reason: 'declined' }); eq(db.one("SELECT reason r FROM suppressions WHERE email='sam@example.test'").r, 'unsubscribe');
  eq(notice(await post(env, '/leads/L1/sequence/enroll', CONSENT)), 'not_eligible_unsubscribed');
});
await test('pause / resume work and are logged; skipping a step is allowed and revises dates', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT); const eid = db.one('SELECT id FROM enrollments').id;
  eq(notice(await post(env, `/sequence/enrollments/${eid}/pause`, { back: 'lead' })), 'paused'); eq(db.one('SELECT status FROM enrollments').status, 'paused'); ok(/Paused/.test(await (await get(env, '/leads/L1')).text()));
  eq(notice(await post(env, `/sequence/enrollments/${eid}/resume`, { back: 'lead' })), 'resumed'); eq(db.one('SELECT status FROM enrollments').status, 'active');
  const s2 = db.one("SELECT id FROM enrollment_steps WHERE step_no = 2").id; eq(notice(await post(env, `/sequence/steps/${s2}/skip`, { back: 'lead' })), 'step_skipped'); eq(db.one("SELECT status FROM enrollment_steps WHERE step_no = 2").status, 'skipped_staff');
  ok(db.rows("SELECT type FROM lead_activity WHERE lead_id='L1'").map((r) => r.type).includes('followup_paused'), 'activity logged');
});
await test('the lead page stage change to Booked/Won ends the sequence (the same dashboard forms staff already use)', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  await post(env, '/leads/L1/stage', { stage: 'assessment_booked' }); eq(db.one('SELECT stop_reason r FROM enrollments').r, 'booked');
});

console.log('\n[settings, switch, test emails]');
await test('turning sending ON needs the business name + mailing address AND the typed phrase; OFF is always allowed; the switch starts OFF', async () => {
  const { db, env } = await fresh();
  eq(notice(await post(env, '/sequence/switch', { on: '1', confirm: 'ENABLE FOLLOW-UPS' })), 'business_details_missing');
  eq(notice(await post(env, '/sequence/settings', { business_legal_name: 'Test Renovations Inc.', business_mailing_address: '100 Example Street, Toronto, ON M5V 0A0' })), 'settings_saved');
  eq(notice(await post(env, '/sequence/switch', { on: '1', confirm: 'yes please' })), 'switch_confirm'); eq(db.one("SELECT value v FROM sequence_settings WHERE key='global_send_enabled'").v, '0', 'still off');
  eq(notice(await post(env, '/sequence/switch', { on: '1', confirm: 'ENABLE FOLLOW-UPS' })), 'switch_on'); ok(/Sending is ON/.test(await (await get(env, '/sequence')).text()));
  eq(notice(await post(env, '/sequence/switch', { on: '0' })), 'switch_off'); eq(db.one("SELECT value v FROM sequence_settings WHERE key='global_send_enabled'").v, '0');
});
await test('settings validate numbers, window, and the https unsubscribe address', async () => {
  const { env } = await fresh();
  eq(notice(await post(env, '/sequence/settings', { followup_daily_cap: '0' })), 'bad_setting'); eq(notice(await post(env, '/sequence/settings', { followup_daily_cap: 'abc' })), 'bad_setting');
  eq(notice(await post(env, '/sequence/settings', { window_start_hour: '17', window_end_hour: '9' })), 'bad_window'); eq(notice(await post(env, '/sequence/settings', { unsubscribe_base_url: 'http://insecure.test' })), 'bad_base_url');
  eq(notice(await post(env, '/sequence/settings', { followup_daily_cap: '40', account_daily_cap: '100', window_start_hour: '10', window_end_hour: '16' })), 'settings_saved');
});
await test('test emails: only the two allowed addresses can be queued from the page', async () => {
  const { db, env } = await fresh();
  for (const to of ['hello@renosrise.com', 'levi.gene.ous@gmail.com']) eq(notice(await post(env, '/sequence/test-send', { to, template: 'checkin', variant: 'website', name: 'Levi' })), 'test_queued', to);
  eq(notice(await post(env, '/sequence/test-send', { to: 'customer@example.com', template: 'checkin', variant: 'website', name: '' })), 'test_recipient');
  eq(notice(await post(env, '/sequence/test-send', { to: 'hello@renosrise.com', template: 'nope', variant: 'website' })), 'bad_request');
  eq(db.rows("SELECT to_email FROM followup_sends WHERE kind='test' ORDER BY to_email").map((r) => r.to_email), ['hello@renosrise.com', 'levi.gene.ous@gmail.com'], 'only allowed rows');
});
await test('a failed send can be retried once (double click safe); status wording says accepted vs delivered honestly', async () => {
  const { db, env } = await fresh(); await post(env, '/leads/L1/sequence/enroll', CONSENT);
  const step = db.one('SELECT id FROM enrollment_steps WHERE step_no = 2'); db.run("UPDATE enrollment_steps SET status='queued', send_id='S1' WHERE id = ?", step.id);
  db.run("INSERT INTO followup_sends (id, kind, enrollment_step_id, lead_id, to_email, idempotency_key, template, variant, status, attempts, max_attempts, last_error, created_at, updated_at) VALUES ('S1','followup',?,'L1','sam@example.test','k','questions','website','failed',5,5,'Resend rejected the email: outage','2026-09-20T00:00:00Z','2026-09-20T00:00:00Z')", step.id);
  ok(/Send failed: Resend rejected the email: outage/.test(await (await get(env, '/leads/L1')).text()), 'failure visible');
  eq(notice(await post(env, '/sequence/sends/S1/retry', { back: 'lead' })), 'retry_queued'); eq(notice(await post(env, '/sequence/sends/S1/retry', { back: 'lead' })), 'retry_not_eligible');
  eq(db.one("SELECT status s, max_attempts m FROM followup_sends WHERE id='S1'"), { s: 'pending', m: 6 }, 'one more bounded attempt');
  db.run("UPDATE followup_sends SET status='sent', resend_message_id='m1'"); ok(/Accepted by Resend \(delivery not confirmed yet\)/.test(await (await get(env, '/sequence')).text()), 'accepted, not delivered');
  db.run("UPDATE followup_sends SET delivered_at='2026-09-21T00:00:00Z'"); ok(/Delivered \(confirmed by Resend/.test(await (await get(env, '/sequence')).text()), 'delivered only when Resend reports it');
});
await test('there are no old-schedule enrollments: only sequence version v2 exists and nothing is on any other version', async () => {
  const { db } = await fresh(); eq(db.rows('SELECT id FROM sequence_versions').map((r) => r.id), ['v2']); eq(db.one("SELECT COUNT(*) n FROM enrollments WHERE sequence_version != 'v2'").n, 0);
});

jwks.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}: ${f.err.message}`));
process.exit(failed.length ? 1 : 0);
