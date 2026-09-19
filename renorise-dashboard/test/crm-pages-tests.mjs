// CRM page and form tests (Stage A).
//
// Runs the REAL dashboard Worker (src/index.js) in Node against an in-memory
// D1-compatible database with every migration applied, using genuinely signed
// Access-style tokens (mock key endpoint). Authentication, authorization, CSRF and
// every CRM form are exercised through real requests. No network beyond localhost;
// test people use example.test addresses; nothing is ever emailed.
//
//   cd renorise-dashboard && node test/crm-pages-tests.mjs

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
const JWKS_PORT = 8851;
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

console.log('CRM pages and forms');

console.log('\n[authorization and CSRF]');
const GET_ROUTES = ['/today', '/leads', '/leads?view=pipeline', '/leads/new', '/leads/op-L1', '/leads/L1', '/contacts', '/contacts/ct-L1', '/contacts/ct-L1/projects/new', '/follow-ups', '/leads/export.csv'];
const POST_ROUTES = ['/leads', '/settings/crm', '/leads/op-L1/stage', '/leads/op-L1/qualification', '/leads/op-L1/details', '/leads/op-L1/notes', '/leads/op-L1/calls', '/leads/op-L1/tasks', '/leads/op-L1/appointments', '/leads/op-L1/archive', '/leads/op-L1/test', '/contacts/ct-L1', '/contacts/ct-L1/permissions', '/contacts/ct-L1/projects', '/contacts/ct-L1/tasks', '/tasks/x/complete', '/appointments/x/status'];
await test('every CRM page refuses an unauthenticated caller (401) and a non-admin (403) and reveals no customer data', async () => {
  const { env } = await fresh();
  for (const p of GET_ROUTES) {
    const r = await get(env, p, null); eq(r.status, 401, p); const t = await r.text(); ok(!t.includes('Sam Tester') && !t.includes('sam@example.test'), `leak on ${p}`);
    eq((await get(env, p, jwtFor('stranger@example.test'))).status, 403, `${p} non-admin`);
  }
});
await test('every CRM write refuses an unauthenticated caller (401) and changes nothing', async () => {
  const { db, env } = await fresh(); const before = db.one('SELECT COUNT(*) n FROM crm_events').n;
  for (const p of POST_ROUTES) eq((await req(env, 'POST', p, { jwt: null, form: { csrf: 'a'.repeat(64) } })).status, 401, p);
  eq(db.one('SELECT COUNT(*) n FROM crm_events').n, before, 'nothing written');
});
await test('CSRF: a post without a valid token, with a wrong token, or from another origin is rejected (403) and nothing changes', async () => {
  const { db, env } = await fresh(); await get(env, '/today'); const good = await token(env);
  const snapshot = () => JSON.stringify([db.rows('SELECT stage, priority, qualification FROM opportunities ORDER BY id'), db.one('SELECT COUNT(*) n FROM crm_events').n, db.one('SELECT COUNT(*) n FROM tasks').n, db.one('SELECT COUNT(*) n FROM contacts').n, db.one('SELECT COUNT(*) n FROM leads').n]);
  const before = snapshot();
  const attempts = [
    ['/leads/op-L1/stage', { stage: 'lost', lost_reason: 'price' }], ['/leads/op-L1/qualification', { value: 'not_a_fit', reason: 'timing' }], ['/leads/op-L1/tasks', { type: 'call', due_on: torontoToday() }],
    ['/leads/op-L1/calls', { outcome: 'connected' }], ['/contacts/ct-L1', { display_name: 'Hacked', email: 'h@example.test' }], ['/leads', { display_name: 'X', email: 'x@example.test', channel: 'phone' }],
    ['/contacts/ct-L1/permissions', { channel: 'email', status: 'withdrawn', method: 'other', given_on: torontoToday(), evidence: 'forged request' }], ['/leads/op-L1/archive', {}], ['/settings/crm', { new_inquiry_hours: '99', stale_days: '9', quote_followup_days: '9' }],
  ];
  for (const [p, f] of attempts) {
    eq((await req(env, 'POST', p, { form: f })).status, 403, `${p} no token`); eq((await req(env, 'POST', p, { form: { csrf: 'f'.repeat(64), ...f } })).status, 403, `${p} wrong token`);
    eq((await req(env, 'POST', p, { form: { csrf: good, ...f }, headers: { Origin: 'https://evil.example' } })).status, 403, `${p} wrong origin`);
    eq((await req(env, 'POST', p, { form: { csrf: good, ...f }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, `${p} cross-site`);
  }
  eq(snapshot(), before, 'no forged request changed anything');
});
await test('the CSRF token belongs to the signed-in person: another admin\'s token is refused', async () => {
  const { env } = await fresh(); env.ADMIN_EMAILS = 'admin@example.test,second@example.test'; const mine = await token(env);
  const r = await req(env, 'POST', '/leads/op-L1/notes', { jwt: jwtFor('second@example.test'), form: { csrf: mine, body: 'x' } }); eq(r.status, 403);
});
await test('until the database update is applied, the dashboard says so (503) and touches nothing instead of failing oddly', async () => {
  const db = new ShimDb(); for (const f of readdirSync(new URL('../../renorise-forms/migrations/', import.meta.url)).filter((x) => /^000[123]/.test(x)).sort()) db.exec(readFileSync(new URL(`../../renorise-forms/migrations/${f}`, import.meta.url), 'utf8'));
  seed(db); const r = await get(makeEnv(db), '/leads'); eq(r.status, 503); const t = await r.text(); ok(/migration 0004/.test(t), 'tells the operator what to do'); eq(db.one('SELECT COUNT(*) n FROM leads').n, 4, 'nothing lost');
});

console.log('\n[pages]');
await test('existing records appear as contacts and projects; an old lead link still opens its project; unknown ids give 404', async () => {
  const { env } = await fresh();
  const t = await text(env, '/leads'); ok(/Sam Tester/.test(t) && /Casey Contacted/.test(t), 'leads listed');
  ok(/Kitchen/.test(await text(env, '/leads/op-L1')) && /Kitchen/.test(await text(env, '/leads/L1')), 'both the project id and the old submission id open it');
  eq((await get(env, '/leads/op-NOPE')).status, 404); eq((await get(env, '/contacts/nope')).status, 404); eq((await get(env, '/leads/x%3Cscript%3E')).status, 404);
  ok(/Sam Tester/.test(await text(env, '/contacts')), 'contacts listed');
});
await test('hostile submissions are escaped on every page (list, board, project, contact, Today, CSV untouched as text)', async () => {
  const { env } = await fresh();
  for (const p of ['/leads', '/leads?view=pipeline', '/leads/op-L2', '/contacts', '/contacts/ct-L2', '/today', '/leads?q=evil']) {
    const t = await text(env, p); ok(!t.includes('<script>alert') && !t.includes('<img src=x'), `unescaped markup on ${p}`);
  }
  ok((await text(env, '/leads/op-L2')).includes('&lt;script&gt;alert'), 'shown as text');
});
await test('the project page: original submission kept, timeline, stage / qualification / task / call / appointment forms, and the 12-stage list', async () => {
  const { env } = await fresh(); const t = await text(env, '/leads/op-L1');
  for (const s of ['Original submission', 'Timeline', 'Log a call or add a note', 'Qualification', 'Consultations and assessments', 'Follow-up tasks', 'Contractor', 'Follow-up emails', 'Edit project details']) ok(t.includes(s), s);
  for (const s of ['New inquiry', 'Contact attempted', 'In conversation', 'Qualified', 'Consultation booked', 'Contractor matching', 'Referred to contractor', 'Quote pending', 'Quote sent', 'Won', 'Lost', 'On hold']) ok(t.includes(`>${s}</option>`), `stage option ${s}`);
  ok(/Possible duplicate/.test(t) && /Sam Again/.test(t), 'the shared email is flagged as a possible duplicate, not merged'); ok(/Recorded by staff|Automatic \(RenoRise\)/.test(t), 'provenance legend');
  ok(/Accepted by Resend/.test(t) && !/delivery confirmed/i.test(t), 'no delivery claim without a provider report');
});
await test('existing "Contacted" record shows "Needs a stage" (not silently converted) on the list, the project page and Today', async () => {
  const { env } = await fresh();
  ok(/Needs a stage/.test(await text(env, '/leads')), 'list'); ok(/needs a stage/i.test(await text(env, '/leads/op-L3')), 'project'); ok(/Existing records that need a stage/.test(await text(env, '/today')), 'Today');
  ok(/Needs a stage/.test(await text(env, '/leads?status=needs_review')), 'filter tab');
});
await test('pipeline board: one lane per stage, every card has a labelled "Move to" control (no drag and drop needed), the scroller is keyboard-reachable', async () => {
  const { env } = await fresh(); const t = await text(env, '/leads?view=pipeline');
  ok(/class="board" role="region" aria-label="[^"]+" tabindex="0"/.test(t), 'scroll region is focusable and named');
  for (const s of ['New inquiry', 'On hold', 'Won', 'Lost']) ok(t.includes(`>${s}</span>`) || t.includes(s), s);
  ok(/<label class="sr-only" for="mv-op-L1">Move Sam Tester/.test(t), 'labelled move control'); ok(!/draggable|ondrag|<script/i.test(t), 'no drag-and-drop and no scripts');
  eq((t.match(/<section class="lane"/g) || []).length, 13, '12 stages plus the "needs a stage" lane');
});
await test('the table view is still searchable (name, email, phone with punctuation, city, project) and filterable; the test filter defaults to hiding test records', async () => {
  const { env, db } = await fresh(); await get(env, '/today');
  const names = async (qs) => { const t = await text(env, `/leads${qs}`); return ['Sam Tester', 'Casey Contacted', 'Sam Again'].filter((n) => t.includes(`>${n}</a>`)); };
  eq(await names('?q=casey@example'), ['Casey Contacted']); eq(await names('?q=416555'), ['Sam Tester', 'Casey Contacted', 'Sam Again']); eq(await names('?q=Bathroom'), ['Sam Again']); eq(await names('?q=%25'), [], 'a percent sign is literal');
  eq(await names('?status=needs_review'), ['Casey Contacted']); eq(await names('?priority=high'), []);
  db.run("UPDATE opportunities SET is_test = 1 WHERE id = 'op-L4'"); ok(!(await names('')).includes('Sam Again'), 'test record hidden by default'); ok((await names('?test=all')).includes('Sam Again'), 'shown on request'); eq(await names('?test=only'), ['Sam Again']);
});
await test('pagination keeps working (25 per page) and keeps the filters', async () => {
  const { db, env } = await fresh(); for (let i = 0; i < 30; i++) db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", `P${i}`, `kp${i}`, new Date(Date.now() - i * 1000).toISOString(), `Paged ${i}`, `p${i}@example.test`, '(905) 555-01' + String(i).padStart(2, '0'), 'Toronto', 'Deck', 'Just exploring', 'homepage', 'new', 'sent', 'sent');
  const p1 = await text(env, '/leads?q=Paged'); ok(/Showing 1–25 of 30/.test(p1), 'first page'); ok(/href="\/leads\?q=Paged&amp;page=2"/.test(p1), 'next link keeps the filter'); ok(/Showing 26–30 of 30/.test(await text(env, '/leads?q=Paged&page=2')), 'second page');
});
await test('Today, contacts, follow-ups, the manual-entry form and a contractor page all render', async () => {
  const { db, env } = await fresh(); db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay Builders',?,?)", NOW(), NOW());
  for (const [p, needle] of [['/today', 'Reminder thresholds'], ['/contacts/ct-L1', 'Communication permission'], ['/follow-ups', 'Overdue'], ['/leads/new', 'Nothing is emailed when you save this'], ['/contacts/ct-L1/projects/new', 'Add another project'], ['/contractors/K1', 'Tasks for Kay Builders'], ['/', 'Latest leads']]) ok((await text(env, p)).includes(needle), `${p} → ${needle}`);
  const nav = await text(env, '/today'); ok(/>Today<\/a>/.test(nav) && /Contacts<\/a>/.test(nav) && /Follow-ups<\/a>/.test(nav), 'navigation keeps the existing sections and adds Today and Contacts');
});

console.log('\n[working through the forms]');
await test('stage forms: a valid move persists; Lost/On hold without a reason are refused and change nothing; the board sends a reason-needing move to the stage form', async () => {
  const { db, env } = await fresh();
  let r = await post(env, '/leads/op-L1/stage', { stage: 'in_conversation' }); eq(notice(r), 'stage_saved'); eq(opp(db, 'op-L1').stage, 'in_conversation');
  r = await post(env, '/leads/op-L1/stage', { stage: 'lost' }); eq(notice(r), 'reason_required'); eq(opp(db, 'op-L1').stage, 'in_conversation', 'unchanged');
  r = await post(env, '/leads/op-L1/stage', { stage: 'lost', lost_reason: 'price', note: 'Went cheaper' }); eq(notice(r), 'stage_saved'); eq(opp(db, 'op-L1').stage_reason, 'price');
  r = await post(env, '/leads/op-L4/stage', { stage: 'lost', back: 'board' }); ok(loc(r).startsWith('/leads/op-L4?') && loc(r).endsWith('#stage'), `board move needing a reason lands on the stage form: ${loc(r)}`); eq(opp(db, 'op-L4').stage, 'new_inquiry');
  r = await post(env, '/leads/op-L4/stage', { stage: 'qualified', back: 'board' }); ok(loc(r).startsWith('/leads?view=pipeline'), 'a quick move returns to the board'); eq(opp(db, 'op-L4').stage, 'qualified');
  r = await post(env, '/leads/op-L4/stage', { stage: 'on_hold', hold_reason: 'seasonal', review_on: torontoToday() }); eq(notice(r), 'stage_saved'); ok(/Review on/.test(await text(env, '/leads/op-L4')), 'hold review date shown'); ok(/Resume \(back to Qualified\)/.test(await text(env, '/leads/op-L4')));
  r = await post(env, '/leads/op-L3/stage', { stage: 'in_conversation' }); eq(notice(r), 'stage_saved'); eq(opp(db, 'op-L3').stage_needs_review, 0, 'a person chose the stage for the ambiguous record');
  eq((await post(env, '/leads/op-L1/stage', { stage: 'nonsense' })).headers.get('location').includes('bad_stage'), true);
});
await test('editing a contact through the form updates the contact only and is audited; the submission stays as typed', async () => {
  const { db, env } = await fresh(); const r = await post(env, '/contacts/ct-L1', { display_name: 'Samuel Tester', email: 'samuel@example.test', phone: '(416) 555-0100', preferred_contact_method: 'phone', preferred_contact_time: 'evenings', tags: 'vip', notes: 'Calls only' });
  eq(notice(r), 'contact_saved'); eq(db.one("SELECT display_name n FROM contacts WHERE id='ct-L1'").n, 'Samuel Tester'); eq(db.one("SELECT name, email FROM leads WHERE id='L1'"), { name: 'Sam Tester', email: 'sam@example.test' });
  ok(/Samuel Tester/.test(await text(env, '/contacts/ct-L1')) && /Sam Tester/.test(await text(env, '/leads/op-L1')), 'contact updated; submission shown as originally typed');
  eq(notice(await post(env, '/contacts/ct-L1', { display_name: 'X' })), 'contact_needs_email_or_phone'); eq(notice(await post(env, '/contacts/ct-L1', { display_name: 'X', email: 'nope' })), 'contact_email');
});
await test('manual entry: a phone-only caller is saved with no email, no confirmation is queued, and it appears in the list and timeline as a manual entry', async () => {
  const { db, env } = await fresh(); const jobs = db.one('SELECT COUNT(*) n FROM email_jobs').n;
  const r = await post(env, '/leads', { channel: 'phone', display_name: 'Pat Caller', phone: '(647) 555-0142', renovation_type: 'Basement', description: 'Wants a suite', received_at: '' }); eq(notice(r), 'project_created'); const id = loc(r).split('?')[0].split('/').pop();
  eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, jobs, 'no email job created'); eq(db.one("SELECT email FROM contacts WHERE display_name='Pat Caller'").email, null);
  const page = await text(env, `/leads/${id}`); ok(/Inquiry entered manually/.test(page) && /Phone call/.test(page), 'manual provenance'); ok(/Pat Caller/.test(await text(env, '/leads')), 'listed'); ok(/no email address on file/.test(page), 'cannot be enrolled without an email');
  eq(notice(await post(env, '/leads', { channel: 'phone', display_name: 'No Contact' })), 'contact_needs_email_or_phone'); eq(notice(await post(env, '/leads', { channel: 'fax', display_name: 'X', phone: '(647) 555-0142' })), 'bad_channel');
});
await test('adding a second project for the same contact keeps the two projects independent', async () => {
  const { db, env } = await fresh(); const r = await post(env, '/contacts/ct-L3/projects', { channel: 'referral', renovation_type: 'Deck', title: 'Back deck' }); eq(notice(r), 'project_created');
  eq(db.one("SELECT COUNT(*) n FROM opportunities WHERE contact_id='ct-L3'").n, 2); ok(/Back deck/.test(await text(env, '/contacts/ct-L3')) && /Kitchen/.test(await text(env, '/contacts/ct-L3')), 'both listed on the contact');
  await post(env, `/leads/${loc(r).split('?')[0].split('/').pop()}/stage`, { stage: 'lost', lost_reason: 'cancelled' }); eq(opp(db, 'op-L3').stage_needs_review, 1, 'the other project was untouched');
});
await test('tasks (the extended Follow-ups): add on a project, a contact and a contractor; complete with a note; the old follow-up form path and existing follow-ups still work', async () => {
  const { db, env } = await fresh(); db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay',?,?)", NOW(), NOW()); const t = torontoToday();
  eq(notice(await post(env, '/leads/op-L1/tasks', { type: 'quote_check', title: 'Ask about the quote', due_on: t, priority: 'high' })), 'task_saved'); eq(notice(await post(env, '/contacts/ct-L1/tasks', { type: 'email', due_on: t })), 'task_saved'); eq(notice(await post(env, '/contractors/K1/tasks', { type: 'contractor_check', due_on: t })), 'task_saved');
  const fu = await text(env, '/follow-ups'); ok(/Ask about the quote/.test(fu) && /Quote check/.test(fu) && /Kay/.test(fu), 'all three on the Follow-ups page');
  eq(notice(await post(env, '/leads/L1/follow-ups', { due_on: t, note: 'Old style form' })), 'task_saved', 'the earlier form path still works'); eq(db.one("SELECT type FROM tasks WHERE title='Old style form'").type, 'general');
  const id = db.one("SELECT id FROM tasks WHERE title='Ask about the quote'").id; const r = await post(env, `/tasks/${id}/complete`, { note: 'Spoke to them', back: 'followups' }); eq(notice(r), 'task_done'); eq(loc(r).split('?')[0], '/follow-ups');
  eq(notice(await post(env, `/tasks/${id}/complete`, {})), 'no_change', 'double click completes once'); ok(/Spoke to them/.test(await text(env, '/leads/op-L1')), 'completion note on the project');
  eq(notice(await post(env, '/leads/op-L1/tasks', { type: 'call', due_on: 'soon' })), 'bad_date');
});
await test('logging a call and recording an appointment through the forms; a booking stops the follow-up emails for that project only', async () => {
  const { db, env } = await fresh(); const t = torontoToday();
  eq(notice(await post(env, '/leads/op-L1/calls', { outcome: 'voicemail', direction: 'outbound', summary: 'Left a message', next_title: 'Try again', next_due: t, move_stage: 'yes' })), 'call_logged'); eq(opp(db, 'op-L1').stage, 'contact_attempted'); ok(opp(db, 'op-L1').first_contact_at, 'first contact recorded');
  const page = await text(env, '/leads/op-L1'); ok(/Outgoing call: Left a voicemail/.test(page) && /Try again/.test(page), 'timeline and task');
  eq(notice(await post(env, '/leads/op-L1/calls', { outcome: 'nope' })), 'bad_request');
  // enrol two projects on different people, then book one
  const enroll = (id) => post(env, `/leads/${id}/sequence/enroll`, { kind: 'website', confirmed: 'yes', method: 'phone_verbal', given_on: t, evidence: 'Said yes on the phone today' });
  eq(notice(await enroll('L1')), 'enrolled'); eq(notice(await enroll('L3')), 'enrolled');
  const r = await post(env, '/leads/op-L1/appointments', { kind: 'phone_consultation', starts_at: '2999-05-05T10:30', notes: 'Intro call', move_stage: 'yes' }); eq(notice(r), 'appointment_saved');
  eq(db.one("SELECT status, stop_reason FROM enrollments WHERE lead_id='L1'"), { status: 'stopped', stop_reason: 'booked' }); eq(db.one("SELECT status FROM enrollments WHERE lead_id='L3'").status, 'active', 'the other project keeps its emails'); eq(opp(db, 'op-L1').stage, 'consultation_booked');
  const ap = db.one('SELECT id FROM appointments').id; eq(notice(await post(env, `/appointments/${ap}/reschedule`, { starts_at: '2999-05-06T11:00' })), 'appointment_rescheduled'); eq(notice(await post(env, `/appointments/${ap}/status`, { status: 'cancelled' })), 'appointment_cancelled');
  eq(db.one("SELECT status FROM enrollments WHERE lead_id='L1'").status, 'stopped', 'cancelling does not restart the emails'); ok(/rescheduled from/.test(await text(env, '/leads/op-L1')) && /cancelled/.test(await text(env, '/leads/op-L1')), 'history');
  eq(notice(await post(env, '/leads/op-L1/appointments', { kind: 'phone_consultation', starts_at: 'garbage' })), 'bad_datetime');
});
await test('the enrollment page and a second enrollment for the same person: one sequence at a time, with a clear message', async () => {
  const { db, env } = await fresh(); const t = torontoToday(); const enroll = (id) => post(env, `/leads/${id}/sequence/enroll`, { kind: 'website', confirmed: 'yes', method: 'phone_verbal', given_on: t, evidence: 'Said yes on the phone today' });
  eq(notice(await enroll('L1')), 'enrolled'); const r = await enroll('L4'); eq(notice(r), 'person_has_open_sequence'); ok(/one sequence at a time/.test(await text(env, loc(r))), 'message shown'); eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 1);
});
await test('qualification, delivery status, archive, test flag and contractor assignment through the forms; assigning a contractor emails nobody', async () => {
  const { db, env } = await fresh(); db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay',?,?)", NOW(), NOW()); const jobs = db.one('SELECT COUNT(*) n FROM email_jobs').n;
  eq(notice(await post(env, '/leads/op-L1/qualification', { value: 'not_a_fit' })), 'reason_required'); eq(notice(await post(env, '/leads/op-L1/qualification', { value: 'not_a_fit', reason: 'outside_area' })), 'qualification_saved'); eq(opp(db, 'op-L1').qualification, 'not_a_fit');
  eq(notice(await post(env, '/leads/op-L1/delivery', { delivery_status: 'completed' })), 'delivery_needs_won');
  eq(notice(await post(env, '/leads/op-L1/contractor', { contractor_id: 'K1' })), 'contractor_saved'); eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, jobs, 'no email queued'); eq(db.one('SELECT COUNT(*) n FROM followup_sends').n, 0);
  eq(notice(await post(env, '/leads/op-L1/test', { flag: '1' })), 'test_marked'); ok(!/>Sam Tester</.test(await text(env, '/leads')), 'hidden from the default list'); eq(db.one('SELECT COUNT(*) n FROM leads').n, 4, 'nothing deleted');
  eq(notice(await post(env, '/leads/op-L4/archive', {})), 'archived'); ok(!/>Sam Again</.test(await text(env, '/leads')), 'archived hidden'); eq(notice(await post(env, '/leads/op-L4/unarchive', {})), 'unarchived');
  eq(notice(await post(env, '/leads/op-L1/details', { title: 'Kitchen', renovation_type: 'Kitchen', property_postal_code: 'nope' })), 'bad_postal'); eq(notice(await post(env, '/leads/op-L1/details', { title: 'Kitchen reno', renovation_type: 'Kitchen', budget_status: 'stated', budget_min: '20000', budget_max: '35000', priority: 'high' })), 'project_saved');
  ok(/\$20,000 to \$35,000 CAD/.test(await text(env, '/leads/op-L1')), 'budget shown'); ok(/Not yet discussed/.test(await text(env, '/leads/op-L4')), 'default budget wording');
});
await test('communication permission: recorded per person; withdrawing email permission stops the person\'s follow-up emails; the ledger only grows', async () => {
  const { db, env } = await fresh(); const t = torontoToday();
  await post(env, '/leads/L1/sequence/enroll', { kind: 'website', confirmed: 'yes', method: 'phone_verbal', given_on: t, evidence: 'Said yes on the phone today' });
  eq(notice(await post(env, '/contacts/ct-L1/permissions', { channel: 'email', status: 'granted', method: 'phone_verbal', given_on: t, evidence: 'Agreed to emails on the call' })), 'permission_saved'); eq(db.one("SELECT status FROM enrollments WHERE lead_id='L1'").status, 'active');
  eq(notice(await post(env, '/contacts/ct-L1/permissions', { channel: 'email', status: 'withdrawn', method: 'written_reply', given_on: t, evidence: 'Replied asking us to stop' })), 'permission_saved'); eq(db.one("SELECT status, stop_reason FROM enrollments WHERE lead_id='L1'"), { status: 'stopped', stop_reason: 'withdrawn' });
  eq(db.one('SELECT COUNT(*) n FROM contact_permissions').n, 2); ok(/Withdrawn/.test(await text(env, '/contacts/ct-L1')), 'shown on the profile');
  eq(notice(await post(env, '/contacts/ct-L1/permissions', { channel: 'email', status: 'granted', method: 'other', given_on: '2999-01-01', evidence: 'future' })), 'consent_date');
});
await test('Today thresholds can be changed; nonsense is refused', async () => {
  const { db, env } = await fresh(); eq(notice(await post(env, '/settings/crm', { new_inquiry_hours: '48', stale_days: '10', quote_followup_days: '3' })), 'settings_saved'); eq(db.one("SELECT value v FROM crm_settings WHERE key='stale_days'").v, '10'); ok(/value="48"/.test(await text(env, '/today')), 'shown');
  eq(notice(await post(env, '/settings/crm', { new_inquiry_hours: 'many', stale_days: '10', quote_followup_days: '3' })), 'bad_setting');
});
await test('archiving a contact needs all of its projects archived first', async () => {
  const { db, env } = await fresh(); eq(notice(await post(env, '/contacts/ct-L1/archive', {})), 'contact_has_open_projects'); await post(env, '/leads/op-L1/archive', {}); eq(notice(await post(env, '/contacts/ct-L1/archive', {})), 'contact_archived'); ok(db.one("SELECT archived_at a FROM contacts WHERE id='ct-L1'").a, 'archived'); eq(db.one('SELECT COUNT(*) n FROM contacts').n, 4, 'nothing deleted');
});

console.log('\n[exports and dates]');
await test('CSV export: correct headers, includes contact and project columns, neutralises formula cells, honours filters, excludes test and archived by default', async () => {
  const { db, env } = await fresh(); await get(env, '/today'); const r = await get(env, '/leads/export.csv'); eq(r.status, 200); ok(/text\/csv/.test(r.headers.get('content-type')) && /attachment; filename="renorise-leads-\d{4}-\d{2}-\d{2}\.csv"/.test(r.headers.get('content-disposition')), 'headers'); const raw = Buffer.from(await r.arrayBuffer()); const csv = raw.toString('utf8');
  ok(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, 'UTF-8 BOM so Excel reads accents'); ok(csv.replace(/^﻿/, '').startsWith('Lead ID,Contact ID,Received (Toronto)'), 'header row'); ok(/Stage,Qualification,Priority,Budget/.test(csv), 'stage/qualification columns'); ok(csv.includes(`'=HYPERLINK`), 'formula cell neutralised'); ok(!/(^|,)=HYPERLINK/m.test(csv), 'no cell starts with =');
  db.run("UPDATE opportunities SET is_test = 1 WHERE id = 'op-L4'"); db.run("UPDATE opportunities SET archived_at = ? WHERE id = 'op-L3'", NOW());
  const t2 = await (await get(env, '/leads/export.csv')).text(); ok(!t2.includes('Sam Again') && !t2.includes('Casey Contacted'), 'test and archived excluded'); ok((await (await get(env, '/leads/export.csv?test=all&archived=all')).text()).includes('Sam Again'), 'included when asked');
  eq((await (await get(env, '/leads/export.csv?q=Evil')).text()).split('\r\n').filter(Boolean).length, 2, 'search filter honoured');
});
await test('dates and times show in Toronto time: an appointment entered as 12:00 shows as 12:00 in both EST and EDT; a skipped local hour is refused', async () => {
  const { db, env } = await fresh();
  for (const [when, label] of [['2999-01-15T12:00', 'Jan'], ['2999-07-15T12:00', 'Jul']]) { eq(notice(await post(env, '/leads/op-L1/appointments', { kind: 'onsite_assessment', starts_at: when })), 'appointment_saved', label); }
  const t = await text(env, '/leads/op-L1'); ok((t.match(/12:00 p\.m\./g) || []).length >= 2, 'both display as noon Toronto time'); eq(db.rows('SELECT starts_at s FROM appointments ORDER BY starts_at').map((r) => r.s), ['2999-01-15T17:00:00.000Z', '2999-07-15T16:00:00.000Z'], 'stored as UTC');
  eq(notice(await post(env, '/leads/op-L1/appointments', { kind: 'onsite_assessment', starts_at: '2026-03-08T02:30' })), 'bad_datetime', 'the skipped hour');
});
await test('the earlier assessment-date form path is retired (404); the CRM never deletes leads, contacts or projects', async () => {
  const { env } = await fresh(); eq((await post(env, '/leads/op-L1/assessment', { assessment_at: '2999-01-01T10:00' })).status, 404);
  const src = readdirSync(new URL('../src/', import.meta.url)).map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n'); ok(!/DELETE FROM\s+(leads|contacts|opportunities|contact_identifiers|consents|enrollments)\b/i.test(src), 'no delete statements for customer data');
});
await test('no customer details are written to the Worker logs', async () => {
  const { env } = await fresh(); const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try { await post(env, '/contacts/ct-L1', { display_name: 'Log Probe', email: 'probe@example.test', phone: '(416) 555-7777' }); await get(env, '/leads/op-L1'); await req(env, 'POST', '/leads/op-L1/stage', { form: { stage: 'lost' } }); } finally { console.log = orig; }
  ok(!logs.join('\n').match(/probe@example|555-7777|Log Probe|sam@example/), `customer data in logs: ${logs.join(' | ').slice(0, 200)}`);
});

jwks.close();
console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
