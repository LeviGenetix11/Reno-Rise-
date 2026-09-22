// Follow-up sequence tests (three follow-ups over 7 days: Day 1, Day 3, Day 7).
//
// Runs the REAL production modules (renorise-shared/*, src/followups/*, and the
// dashboard's seq-db.js) against an in-memory D1-compatible SQLite that has ALL
// migrations applied, with a SIMULATED CLOCK (every function takes `now`) and a
// mock Resend server. No network, no real email, no real data.
//
//   cd renorise-forms && node test/followup-tests.mjs

import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { freshDb } from './d1-shim.mjs';
import { runFollowups } from '../src/followups/processor.js';
import worker from '../src/index.js';
import { planEnrollment, reproject, VERSIONS, CURRENT_VERSION, maxEmailsPerLead, DEFAULT_SETTINGS } from '../../renorise-shared/sequence.js';
import { renderFollowup, firstNameOf, greetingFor, bodySentences, TEMPLATE_KEYS } from '../../renorise-shared/templates.js';
import { saveSetting, businessDetailsOk } from '../../renorise-shared/followup-db.js';
import { createEnrollment, approveStep, skipStep, setPaused, stopByStaff, queueTestSend, retryFailedSend, planFor, setGlobalSwitch, saveSettings } from '../../renorise-dashboard/src/seq-db.js';
import { ensureCrmRecords, setStage as crmSetStage, setArchived as crmSetArchived, setQualification } from '../../renorise-dashboard/src/crm-db.js';
import { addAppointment } from '../../renorise-dashboard/src/crm-work.js';
// The dashboard now works on projects (opportunities) that wrap each submission; these helpers apply the same real actions to lead L1's project.
const setStage = async (db, _lead, stage) => { await ensureCrmRecords(db); return crmSetStage(db, 'op-L1', { stage, reason: stage === 'lost' ? 'price' : undefined }, 'a'); };
const setArchived = async (db, _lead, on) => { await ensureCrmRecords(db); return crmSetArchived(db, 'op-L1', on, 'a'); };
const setAssessment = async (db, _lead, when, kind = 'onsite_assessment') => { await ensureCrmRecords(db); return addAppointment(db, 'op-L1', { kind, startsLocal: when }, 'a'); };
import { verifySvix } from '../src/followups/webhook.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };
const at = (iso) => new Date(iso);

// ---- mock Resend (remembers idempotency keys like the real API) ----------------
const PORT = 8831;
let mode = 'ok'; // ok | 500 | 422 | drop
let mail = [];
const seenKeys = new Map();
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const key = req.headers['idempotency-key'];
    const payload = JSON.parse(body || '{}');
    if (mode === 'drop') { req.socket.destroy(); return; }
    if (mode === '500') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'outage' })); }
    if (mode === '422') { res.writeHead(422, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'invalid recipient' })); }
    if (key && seenKeys.has(key)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: seenKeys.get(key) })); }
    const id = `msg-${mail.length + 1}`;
    if (key) seenKeys.set(key, id);
    mail.push({ key, payload, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id }));
  });
});
await new Promise((r) => mock.listen(PORT, '127.0.0.1', r));
const resetMail = () => { mail = []; seenKeys.clear(); mode = 'ok'; };

const WHSEC_BYTES = Buffer.from('renorise-test-webhook-secret-bytes-0123456789');
const WHSEC = `whsec_${WHSEC_BYTES.toString('base64')}`;

// ---- scenario helpers ------------------------------------------------------------------
function makeEnv(db, extra = {}) {
  return { DB: db, RESEND_API_KEY: 're_test_not_real', RESEND_API_URL: `http://127.0.0.1:${PORT}/emails`, RESEND_WEBHOOK_SECRET: WHSEC, INTERNAL_NOTIFY_EMAIL: 'hello@renosrise.com', ALLOWED_ORIGINS: 'https://renosrise.com', ...extra };
}
async function setup({ enable = true, name = 'Sam Tester', email = 'sam@example.test', leadId = 'L1', created = '2026-09-19T15:00:00.000Z', settings = {} } = {}) {
  resetMail();
  const db = freshDb();
  db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", leadId, `ik-${leadId}`, created, name, email, '(416) 555-0100', 'Toronto', 'Kitchen', 'Just exploring', 'homepage', 'new', 'sent', 'sent');
  // the immediate confirmation + internal notification, exactly as the forms Worker records them
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", `${leadId}-c`, leadId, 'customer', `${leadId}:customer`, 'sent', 1, created, created);
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", `${leadId}-i`, leadId, 'internal', `${leadId}:internal`, 'sent', 1, created, created);
  await saveSetting(db, 'business_legal_name', 'Test Renovations Inc.', 'test');
  await saveSetting(db, 'business_mailing_address', '100 Example Street, Toronto, ON M5V 0A0', 'test');
  for (const [k, v] of Object.entries(settings)) await saveSetting(db, k, v, 'test');
  if (enable) await saveSetting(db, 'global_send_enabled', '1', 'test');
  return { db, env: makeEnv(db) };
}
const CONSENT = { sourceKind: 'website', confirmed: true, method: 'phone_verbal', givenOn: '2026-09-19', evidence: 'Customer said yes on the phone' };
async function enroll(db, leadId = 'L1', now = '2026-09-19T16:00:00.000Z', extra = {}) {
  const r = await createEnrollment(db, leadId, { ...CONSENT, ...extra }, 'admin@test', at(now));
  ok(r.ok, `enroll failed: ${r.code}`);
  return r.enrollmentId;
}
const steps = (db, eid) => db.rows('SELECT * FROM enrollment_steps WHERE enrollment_id = ? ORDER BY step_no', eid);
const stepId = (db, eid, n) => steps(db, eid)[n - 1].id;
const approve = (db, eid, n, now) => approveStep(db, stepId(db, eid, n), { inboxChecked: true }, 'admin@test', at(now));
const run = (env, db, now) => runFollowups(env, db, { now: at(now) });
const sentCount = (db) => db.one("SELECT COUNT(*) n FROM followup_sends WHERE kind = 'followup' AND status = 'sent'").n;

console.log('Follow-up sequence: 3 follow-ups over 7 days — Days 1, 3, 7');

// =============================== schedule =========================================
console.log('\n[schedule]');
const S = { ...DEFAULT_SETTINGS };
await test('exactly THREE follow-ups, on Day 1, Day 3 and Day 7 (delays 1, 2, 4 days); nothing after Day 7', async () => {
  const v = VERSIONS[CURRENT_VERSION];
  eq(v.steps.map((s) => s.day), [1, 3, 7], 'days'); eq(v.steps.length, 3, 'count');
  ok(!v.steps.some((s) => s.day > 7), 'no step after day 7');
  eq(maxEmailsPerLead(), 5, 'max per website lead: 1 confirmation + 1 internal + 3 follow-ups');
});
await test('planned dates for a Sep 19 inquiry: Sep 20, Sep 22, Sep 26 at 8:00 Toronto (12:00 UTC in summer)', async () => {
  const p = planEnrollment({ anchorIso: '2026-09-19T15:00:00.000Z', now: at('2026-09-19T16:00:00.000Z'), settings: S });
  eq(p.map((s) => s.planned_date), ['2026-09-20', '2026-09-22', '2026-09-26'], 'dates');
  eq(p.map((s) => s.planned_for), ['2026-09-20T12:00:00.000Z', '2026-09-22T12:00:00.000Z', '2026-09-26T12:00:00.000Z'], 'UTC storage');
  eq(p.map((s) => s.status), ['planned', 'planned', 'planned'], 'status');
});
await test('the schedule follows Toronto local time across the daylight-saving change (8:00 is 13:00 UTC in winter)', async () => {
  const p = planEnrollment({ anchorIso: '2026-10-30T15:00:00.000Z', now: at('2026-10-30T16:00:00.000Z'), settings: S });
  eq(p.map((s) => s.planned_date), ['2026-10-31', '2026-11-02', '2026-11-06'], 'dates');
  eq(p[0].planned_for, '2026-10-31T12:00:00.000Z', 'EDT'); eq(p[1].planned_for, '2026-11-02T13:00:00.000Z', 'EST'); eq(p[2].planned_for, '2026-11-06T13:00:00.000Z', 'EST');
});
await test('the anchor day is the TORONTO date: an inquiry at 11 p.m. Toronto (03:00 UTC next day) counts as that Toronto day', async () => {
  const p = planEnrollment({ anchorIso: '2026-09-20T03:00:00.000Z', now: at('2026-09-20T04:00:00.000Z'), settings: S });
  eq(p[0].planned_date, '2026-09-20', 'day 1 is the day after Sep 19 (Toronto)');
});
await test('late enrollment: elapsed steps are shown as skipped, never sent as a batch', async () => {
  const day5 = planEnrollment({ anchorIso: '2026-09-19T15:00:00.000Z', now: at('2026-09-24T15:00:00.000Z'), settings: S });
  eq(day5.map((s) => s.status), ['skipped_elapsed', 'skipped_elapsed', 'planned'], 'enrolled on day 5');
  const sameDay = planEnrollment({ anchorIso: '2026-09-19T15:00:00.000Z', now: at('2026-09-22T15:00:00.000Z'), settings: S });
  eq(sameDay.map((s) => s.status), ['skipped_elapsed', 'planned', 'planned'], 'a step dated TODAY is still on while the window is open');
  const afterWindow = planEnrollment({ anchorIso: '2026-09-19T15:00:00.000Z', now: at('2026-09-23T01:00:00.000Z'), settings: S }); // 9 pm Toronto, Sep 22
  eq(afterWindow.map((s) => s.status), ['skipped_elapsed', 'skipped_elapsed', 'planned'], 'today\'s window already over');
});
await test('planned dates are shown BEFORE enrolling (preview) and enrolling with nothing left is refused', async () => {
  const { db } = await setup();
  const lead = db.one("SELECT * FROM leads WHERE id = 'L1'");
  const preview = await planFor(db, lead, { sourceKind: 'website' }, at('2026-09-19T16:00:00.000Z'));
  eq(preview.steps.map((s) => s.planned_date), ['2026-09-20', '2026-09-22', '2026-09-26'], 'preview dates');
  const r = await createEnrollment(db, 'L1', CONSENT, 'admin@test', at('2026-10-10T15:00:00.000Z'));
  eq(r, { ok: false, code: 'all_steps_elapsed' }, 'all elapsed');
  eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 0, 'nothing saved');
});
await test('re-projection after a late send: later steps move out to keep the ORIGINAL gaps (no catch-up)', async () => {
  const base = planEnrollment({ anchorIso: '2026-09-19T15:00:00.000Z', now: at('2026-09-19T16:00:00.000Z'), settings: S }).map((s) => ({ ...s, status: 'planned' }));
  const late = base.map((s, i) => (i === 0 ? { ...s, status: 'sent', sent_at: '2026-09-22T14:00:00.000Z' } : s));
  const r = reproject(late, S);
  eq(r[1].planned_for, '2026-09-24T12:00:00.000Z', 'step 2: sent Sep 22 + 2 days'); eq(r[2].planned_for, '2026-09-28T12:00:00.000Z', 'step 3: Sep 24 + 4 days');
  const onTime = reproject(base.map((s, i) => (i === 0 ? { ...s, status: 'sent', sent_at: '2026-09-20T13:15:00.000Z' } : s)), S);
  eq([onTime[1].planned_for, onTime[2].planned_for], [base[1].planned_for, base[2].planned_for], 'on-time send changes nothing');
});

// =============================== copy ==============================================
console.log('\n[email copy]');
const biz = { legalName: 'Test Renovations Inc.', mailingAddress: '100 Example Street, Toronto, ON', unsubscribeUrl: 'https://example.test/u/abc' };
await test('subjects and required sentences match the approved copy (call variant)', async () => {
  const c1 = renderFollowup({ templateKey: 'checkin', variant: 'call', name: 'Jamie Lee', ...biz });
  eq(c1.subject, 'Did you get the help you needed?', 'subject 1');
  ok(c1.text.startsWith('Hi Jamie,\n\nThanks for calling RenoRise recently.\nWere you able to get your home issue taken care of, or are you still looking for help?'), 'email 1 body');
  eq(renderFollowup({ templateKey: 'questions', variant: 'call', name: 'A', ...biz }).subject, 'Any questions about your home project?', 'subject 2');
  eq(renderFollowup({ templateKey: 'last', variant: 'call', name: 'A', ...biz }).subject, 'Our last check-in—for now', 'subject 3');
});
await test('every email: under eight sentences; the free-consultation invitation is the LAST body sentence, before the signature and footer', async () => {
  for (const k of TEMPLATE_KEYS) for (const v of ['call', 'website']) {
    const e = renderFollowup({ templateKey: k, variant: v, name: 'Sam', ...biz });
    ok(e.sentenceCount < 8, `${k}/${v} has ${e.sentenceCount} sentences`);
    ok(/free consultation/.test(e.bodySentences.at(-1)) && e.bodySentences.slice(0, -1).every((s) => !/free consultation/.test(s)), `${k}/${v}: the consultation invitation must be the LAST body sentence, and appear only there`);
    const iSig = e.text.indexOf('The RenoRise Team'); const iCta = e.text.indexOf(e.bodySentences.at(-1)); const iFoot = e.text.indexOf('Test Renovations Inc.');
    ok(iCta < iSig && iSig < iFoot, `${k}/${v} order must be: invitation, signature, footer`);
  }
});
await test('signature is "The RenoRise Team / hello@renosrise.com"; footer has business name, mailing address, reason, and a working unsubscribe link', async () => {
  const e = renderFollowup({ templateKey: 'checkin', variant: 'website', name: 'Sam', ...biz });
  ok(e.text.includes('The RenoRise Team\nhello@renosrise.com'), 'signature');
  for (const s of ['Test Renovations Inc.', '100 Example Street, Toronto, ON', 'agreed to hear from RenoRise', 'https://example.test/u/abc', 'STOP']) ok(e.text.includes(s) && e.html.includes(s.replace(/&/g, '&amp;')), `footer missing: ${s}`);
  eq(e.headers, { 'List-Unsubscribe': '<https://example.test/u/abc>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, 'RFC 8058 headers');
});
await test('website variants never claim the person called or spoke to us; call variants say so only for callers', async () => {
  for (const k of TEMPLATE_KEYS) {
    const w = bodySentences(k, 'website').join(' ');
    ok(!/\bcall(ed|ing|s)?\b|spoke|phone/i.test(w), `website copy for ${k} mentions a call: ${w}`);
  }
  ok(bodySentences('checkin', 'website')[0].includes('sending your renovation inquiry'), 'website email 1 wording');
  ok(bodySentences('checkin', 'call')[0].includes('calling RenoRise'), 'call email 1 wording');
});
await test('no invented claims: no discounts, urgency, testimonials, pricing, guarantees, response-time promises, or booking links', async () => {
  for (const k of TEMPLATE_KEYS) for (const v of ['call', 'website']) {
    const body = bodySentences(k, v).join(' ');
    ok(!/discount|% off|limited[- ]time|hurry|act now|urgent|testimonial|review|price|pricing|\$|guarantee|within \d|same[- ]day|24 ?hours|book(ing)? (online|link)|calendly|https?:/i.test(body), `${k}/${v}: ${body}`);
  }
});
await test('greeting fallbacks: safe first name, otherwise "Hi there,"', async () => {
  const cases = [['Sam Tester', 'Hi Sam,'], ['mary-jane o’neil', 'Hi Mary-jane,'], ['JOHN SMITH', 'Hi John,'], ['  ', 'Hi there,'], ['', 'Hi there,'], [null, 'Hi there,'], ['1234', 'Hi there,'], ['a@b.com', 'Hi there,'], ['<script>alert(1)</script>', 'Hi there,'], ['X', 'Hi X,'], ['Renée Côté', 'Hi Renée,'], ['A'.repeat(50), 'Hi there,']];
  for (const [name, expected] of cases) eq(greetingFor(name), expected, JSON.stringify(name));
});
await test('customer text is HTML-escaped in the email; missing business details block a real send but not a preview', async () => {
  const e = renderFollowup({ templateKey: 'checkin', variant: 'website', name: 'Sam', ...biz, legalName: 'A & B <Co>' });
  ok(e.html.includes('A &amp; B &lt;Co&gt;') && !e.html.includes('<Co>'), 'escaped');
  let threw = null; try { renderFollowup({ templateKey: 'checkin', variant: 'website', name: 'Sam', unsubscribeUrl: 'https://x.test/u/a' }); } catch (err) { threw = err.message; }
  eq(threw, 'missing_business_details', 'real send needs business details');
  ok(renderFollowup({ templateKey: 'checkin', variant: 'website', name: 'Sam', preview: true }).text.includes('required before sending'), 'preview shows a clear placeholder');
});

// =============================== permission ===========================================
console.log('\n[permission: no enrollment without recorded consent]');
await test('no enrollment without explicit, recorded permission (each missing/invalid part is refused; nothing is saved)', async () => {
  const { db } = await setup();
  const bad = [
    [{ confirmed: false }, 'consent_unconfirmed'], [{ confirmed: undefined }, 'consent_unconfirmed'], [{ method: 'inferred_from_form' }, 'consent_method'],
    [{ method: '' }, 'consent_method'], [{ givenOn: '' }, 'consent_date'], [{ givenOn: '2099-01-01' }, 'consent_date'], [{ evidence: '' }, 'consent_evidence'], [{ evidence: 'no' }, 'consent_evidence'],
  ];
  for (const [patch, code] of bad) eq((await createEnrollment(db, 'L1', { ...CONSENT, ...patch }, 'a', at('2026-09-19T16:00:00.000Z'))).code, code, JSON.stringify(patch));
  eq(db.one('SELECT COUNT(*) n FROM enrollments').n + db.one('SELECT COUNT(*) n FROM consents').n, 0, 'no rows');
});
await test('a form submission or call alone is never treated as permission; enrolling records consent, source, and an unsubscribe token', async () => {
  const { db } = await setup();
  eq(db.one('SELECT COUNT(*) n FROM consents').n, 0, 'lead exists but no consent');
  const eid = await enroll(db);
  const c = db.one('SELECT * FROM consents'); eq([c.method, c.given_on, c.recorded_by], ['phone_verbal', '2026-09-19', 'admin@test'], 'consent recorded');
  ok(db.one('SELECT token FROM unsubscribe_tokens WHERE enrollment_id = ?', eid).token.length >= 40, 'token');
  eq(db.one('SELECT sequence_version v FROM enrollments').v, 'v2', 'version recorded');
});
await test('refused for ineligible leads (Won, Lost, Archived, booked, suppressed address); only one open enrollment per lead', async () => {
  for (const [patch, code] of [["status='won'", 'not_eligible_won'], ["status='lost'", 'not_eligible_lost'], ["archived_at='2026-09-01T00:00:00Z'", 'not_eligible_archived'], ["status='assessment_booked'", 'not_eligible_booked'], ["assessment_at='2026-10-01T15:00:00Z'", 'not_eligible_booked']]) {
    const { db } = await setup(); db.run(`UPDATE leads SET ${patch} WHERE id='L1'`);
    eq((await createEnrollment(db, 'L1', CONSENT, 'a', at('2026-09-19T16:00:00.000Z'))).code, code, patch);
  }
  const { db } = await setup();
  db.run("INSERT INTO suppressions (email, reason, created_at) VALUES ('sam@example.test','unsubscribe','2026-09-01T00:00:00Z')");
  eq((await createEnrollment(db, 'L1', CONSENT, 'a', at('2026-09-19T16:00:00.000Z'))).code, 'not_eligible_unsubscribed', 'suppressed');
  const s2 = await setup(); await enroll(s2.db);
  eq((await createEnrollment(s2.db, 'L1', CONSENT, 'a', at('2026-09-19T16:00:00.000Z'))).code, 'already_enrolled', 'second enrollment');
});
await test('two simultaneous enroll requests create exactly one enrollment', async () => {
  const { db } = await setup();
  const rs = await Promise.all([1, 2, 3].map(() => createEnrollment(db, 'L1', CONSENT, 'a', at('2026-09-19T16:00:00.000Z'))));
  eq(rs.filter((r) => r.ok).length, 1, 'one succeeded'); eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 1, 'one row'); eq(db.one('SELECT COUNT(*) n FROM enrollment_steps').n, 3, 'three steps');
});

// =============================== sending journey ============================================
console.log('\n[sending: approval, switches, window, journey]');
await test('FULL JOURNEY on a simulated clock: emails go out on Day 1, 3 and 7 only; then the sequence is complete; 5 emails total per website lead', async () => {
  const { db, env } = await setup();
  const eid = await enroll(db);
  for (const [n, day, now] of [[1, 'Sep 20', '2026-09-20T13:15:00.000Z'], [2, 'Sep 22', '2026-09-22T13:15:00.000Z'], [3, 'Sep 26', '2026-09-26T13:15:00.000Z']]) {
    eq(mail.length, n - 1, `nothing extra before ${day}`);
    eq((await approve(db, eid, n, now)).code, 'step_approved', `approve ${n}`);
    const sum = await run(env, db, now);
    eq(sum.sent, 1, `sent on ${day}`); eq(mail.length, n, `emails after ${day}`);
    eq(mail.at(-1).key, `fu:${eid}:${n}`, 'stable idempotency key');
  }
  eq(db.one('SELECT status FROM enrollments').status, 'completed', 'completed after email 3');
  eq(db.rows('SELECT status FROM enrollment_steps ORDER BY step_no').map((r) => r.status), ['sent', 'sent', 'sent'], 'steps');
  eq(db.one('SELECT COUNT(*) n FROM enrollment_steps').n, 3, 'exactly three steps exist');
  eq(db.one('SELECT COUNT(*) n FROM enrollment_steps WHERE day_offset > 7').n, 0, 'no steps after Day 7');
  await run(env, db, '2026-10-20T13:15:00.000Z'); await run(env, db, '2026-11-20T13:15:00.000Z');
  eq(mail.length, 3, 'nothing after completion');
  eq(db.one("SELECT COUNT(*) n FROM email_jobs").n + db.one("SELECT COUNT(*) n FROM followup_sends WHERE status='sent'").n, 5, '2 confirmations + 3 follow-ups');
});
await test('email content on the wire: sender, reply-to, unsubscribe headers, real footer, source-appropriate copy', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  await approve(db, eid, 1, '2026-09-20T13:15:00.000Z'); await run(env, db, '2026-09-20T13:15:00.000Z');
  const m = mail[0].payload;
  eq(m.from, 'RenoRise <hello@notify.renosrise.com>', 'from'); eq(m.reply_to, 'hello@renosrise.com', 'reply-to'); eq(m.to, ['sam@example.test'], 'to');
  eq(m.subject, 'Did you get the help you needed?', 'subject'); ok(m.text.startsWith('Hi Sam,'), 'greeting');
  ok(/^<https:\/\/renorise-forms\.levi-gene-ous\.workers\.dev\/u\/[A-Za-z0-9_-]{40,}>$/.test(m.headers['List-Unsubscribe']), 'List-Unsubscribe'); eq(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click', 'one-click');
  ok(m.text.includes('Test Renovations Inc.') && m.text.includes('100 Example Street'), 'footer'); ok(!/called|calling/i.test(m.text), 'website lead is never told they called');
});
await test('a caller enrolled with a recorded call date gets the caller copy, anchored to the CALL date', async () => {
  const { db, env } = await setup(); const eid = await enroll(db, 'L1', '2026-09-19T16:00:00.000Z', { sourceKind: 'call', callDate: '2026-09-18' });
  eq(steps(db, eid).map((s) => s.planned_for.slice(0, 10)), ['2026-09-19', '2026-09-21', '2026-09-25'], 'call-date anchored');
  eq((await createEnrollment((await setup()).db, 'L1', { ...CONSENT, sourceKind: 'call' }, 'a', at('2026-09-19T16:00:00.000Z'))).code, 'call_date_required', 'call needs a recorded date');
  await approve(db, eid, 1, '2026-09-19T13:15:00.000Z'); await run(env, db, '2026-09-19T13:15:00.000Z');
  ok(mail[0].payload.text.includes('Thanks for calling RenoRise recently.'), 'call variant');
});
await test('nothing sends without MANUAL approval, even when due and the switch is on', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  const s = await run(env, db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'no email'); eq(s.sent, 0);
  eq((await approveStep(db, stepId(db, eid, 1), { inboxChecked: false }, 'a', at('2026-09-20T13:15:00.000Z'))).code, 'inbox_not_checked', 'approval requires the inbox check');
  eq((await approve(db, eid, 1, '2026-09-19T20:00:00.000Z')).code, 'not_due_yet', 'cannot approve before its date');
  eq((await approve(db, eid, 2, '2026-09-23T13:15:00.000Z')).code, 'not_next_step', 'cannot approve out of order');
});
await test('global sending switch OFF: approved follow-ups are held, and turning it on requires business details + typed confirmation', async () => {
  const { db, env } = await setup({ enable: false }); const eid = await enroll(db);
  await approve(db, eid, 1, '2026-09-20T13:15:00.000Z');
  eq((await run(env, db, '2026-09-20T13:15:00.000Z')).skipped, 'global_switch_off'); eq(mail.length, 0, 'held');
  const bare = freshDb(); bare.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('X','k','2026-09-19T15:00:00Z','A','a@b.co','1','T','K','J','homepage','new','sent','sent')");
  eq((await setGlobalSwitch(bare, true, 'ENABLE FOLLOW-UPS', 'a')).code, 'business_details_missing', 'needs legal name + address');
  eq((await setGlobalSwitch(db, true, 'yes', 'a')).code, 'switch_confirm', 'needs the typed phrase'); eq((await setGlobalSwitch(db, true, 'ENABLE FOLLOW-UPS', 'a')).code, 'switch_on');
  eq((await run(env, db, '2026-09-20T13:20:00.000Z')).sent, 1, 'sends once on');
  eq((await setGlobalSwitch(db, false, '', 'a')).code, 'switch_off');
});
await test('a mailing address must be a street, PO box, rural route, or general delivery: a postal code and city alone is refused (sending cannot be enabled)', async () => {
  const good = ['100 Example Street, Toronto, ON M5V 0A0', 'PO Box 123, Station A, Toronto, ON M5W 1A1', 'P.O. Box 55, Toronto, Ontario', 'General Delivery, Toronto, ON', 'RR 2, Stouffville, ON', 'Suite 200, 34 Main St, Toronto, ON'];
  const bad = ['Reno Rise M5V 3A3 Toronto Ontario', 'Toronto, Ontario M5V 3A3', 'M5V 3A3', 'Toronto', '', '   '];
  for (const a of good) ok(businessDetailsOk({ business_legal_name: 'Reno Rise', business_mailing_address: a }), `should accept: ${a}`);
  for (const a of bad) ok(!businessDetailsOk({ business_legal_name: 'Reno Rise', business_mailing_address: a }), `should refuse: ${a}`);
  const s = await setup({ enable: false }); await saveSetting(s.db, 'business_mailing_address', 'Reno Rise M5V 3A3 Toronto Ontario', 'test');
  eq((await setGlobalSwitch(s.db, true, 'ENABLE FOLLOW-UPS', 'a')).code, 'business_details_missing', 'cannot turn sending on');
  await saveSetting(s.db, 'global_send_enabled', '1', 'test'); const eid = await enroll(s.db); await approve(s.db, eid, 1, '2026-09-20T13:15:00.000Z');
  eq((await run(s.env, s.db, '2026-09-20T13:15:00.000Z')).deferred, { business_details_missing: 1 }, 'the sender also refuses'); eq(mail.length, 0, 'nothing sent');
});
await test('migration default: the global switch is OFF in a brand-new database', async () => {
  eq(freshDb().one("SELECT value FROM sequence_settings WHERE key='global_send_enabled'").value, '0');
});
await test('daytime window: approved at 8:30 p.m. Toronto waits for morning; sends 8:00-20:00 only', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  await approve(db, eid, 1, '2026-09-21T00:30:00.000Z'); // 8:30 pm Toronto, Sep 20 (after the 8 pm close)
  eq((await run(env, db, '2026-09-21T00:30:00.000Z')).deferred, { outside_send_window: 1 }, 'evening');
  eq((await run(env, db, '2026-09-21T11:00:00.000Z')).deferred, { outside_send_window: 1 }, '7 am Toronto');
  eq(mail.length, 0, 'nothing sent out of hours');
  eq((await run(env, db, '2026-09-21T21:30:00.000Z')).sent, 1, '5:30 pm Toronto is inside the extended window'); eq(mail.length, 1);
});
await test('pausing holds sending; resuming sends exactly one email', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  await approve(db, eid, 1, '2026-09-20T13:15:00.000Z'); await setPaused(db, eid, true, 'a');
  await run(env, db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'paused');
  await setPaused(db, eid, false, 'a'); await run(env, db, '2026-09-20T13:30:00.000Z'); await run(env, db, '2026-09-20T13:45:00.000Z'); eq(mail.length, 1, 'once after resume');
});
await test('long pause: only ONE email goes out when it resumes, then dates are revised (no catch-up burst)', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  await setPaused(db, eid, true, 'a');
  // paused from Sep 20 until Oct 4: step 1 (Sep 20), and by then even step 2 and 3 dates have passed
  await setPaused(db, eid, false, 'a');
  await approve(db, eid, 1, '2026-10-04T13:15:00.000Z');
  for (let i = 0; i < 4; i++) await run(env, db, `2026-10-04T13:${15 + i * 15}:00.000Z`.replace('13:60', '14:00'));
  eq(mail.length, 1, 'one email only');
  const st = steps(db, eid);
  eq(st[0].status, 'sent', 'step 1 sent'); eq(st[1].planned_for, '2026-10-06T12:00:00.000Z', 'step 2 revised: Oct 4 + 2'); eq(st[2].planned_for, '2026-10-10T12:00:00.000Z', 'step 3 revised: Oct 6 + 4');
  eq((await approve(db, eid, 2, '2026-10-04T13:20:00.000Z')).code, 'not_due_yet', 'the next email is not due the same day');
});

// =============================== stop rules ================================================
console.log('\n[stop rules: every one cancels queued follow-ups and prevents sending]');
async function ready() { const s = await setup(); const eid = await enroll(s.db); await approve(s.db, eid, 1, '2026-09-20T13:15:00.000Z'); return { ...s, eid }; }
const stopCase = (name, trigger, expectedReason) => test(`stops when: ${name}`, async () => {
  const s = await ready(); await trigger(s);
  await run(s.env, s.db, '2026-09-20T13:15:00.000Z');
  eq(mail.length, 0, 'no email sent'); const e = s.db.one('SELECT status, stop_reason FROM enrollments WHERE id = ?', s.eid);
  eq([e.status, e.stop_reason], ['stopped', expectedReason], 'enrollment');
  ok(s.db.rows('SELECT status FROM enrollment_steps WHERE enrollment_id = ?', s.eid).every((r) => r.status === 'cancelled'), 'all steps cancelled');
});
await stopCase('a customer reply is recorded', (s) => stopByStaff(s.db, s.eid, 'reply', 'a'), 'reply');
await stopCase('the customer declines', (s) => stopByStaff(s.db, s.eid, 'declined', 'a'), 'declined');
await stopCase('staff stops the sequence', (s) => stopByStaff(s.db, s.eid, 'staff', 'a'), 'staff');
await stopCase('permission is withdrawn', (s) => stopByStaff(s.db, s.eid, 'withdrawn', 'a'), 'withdrawn');
await stopCase('an assessment is booked (stage change in the dashboard)', (s) => setStage(s.db, 'L1', 'consultation_booked'), 'booked');
await stopCase('an on-site assessment is recorded', (s) => setAssessment(s.db, 'L1', '2026-10-01T10:00'), 'booked');
await stopCase('a phone consultation is recorded', (s) => setAssessment(s.db, 'L1', '2026-10-01T10:00', 'phone_consultation'), 'booked');
await stopCase('the project is referred to a contractor', (s) => setStage(s.db, 'L1', 'referred'), 'progressed');
await stopCase('the project is marked Not a fit', async (s) => { await ensureCrmRecords(s.db); return setQualification(s.db, 'op-L1', { value: 'not_a_fit', reason: 'outside_area' }, 'a'); }, 'not_a_fit');
await stopCase('the lead is marked Won', (s) => setStage(s.db, 'L1', 'won'), 'won');
await stopCase('the lead is marked Lost', (s) => setStage(s.db, 'L1', 'lost'), 'lost');
await stopCase('the lead is archived', (s) => setArchived(s.db, 'L1', true), 'archived');
await test('sender ALSO re-checks: a direct database change to Won/Archived/booked/withdrawn stops it before sending (defence in depth)', async () => {
  for (const [patch, reason] of [["UPDATE leads SET status='won'", 'won'], ["UPDATE leads SET archived_at='2026-09-20T00:00:00Z'", 'archived'], ["UPDATE leads SET assessment_at='2026-10-01T15:00:00Z'", 'booked'], ["UPDATE consents SET withdrawn_at='2026-09-20T00:00:00Z'", 'withdrawn'], ["INSERT INTO suppressions (email, reason, created_at) VALUES ('sam@example.test','complaint','2026-09-20T00:00:00Z')", 'suppressed_complaint']]) {
    const s = await ready(); s.db.run(patch);
    await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, patch);
    eq(s.db.one('SELECT stop_reason r FROM enrollments').r, reason, patch);
  }
});
await test('a stop that lands while a send is queued cancels the send row too (nothing left that could go out)', async () => {
  const s = await ready(); mode = '500'; await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); mode = 'ok';
  eq(s.db.one("SELECT status FROM followup_sends").status, 'pending', 'queued for retry');
  await stopByStaff(s.db, s.eid, 'reply', 'a'); eq(s.db.one('SELECT status FROM followup_sends').status, 'cancelled', 'send cancelled');
  await run(s.env, s.db, '2026-09-20T14:15:00.000Z'); eq(mail.length, 0, 'nothing sent');
});
await test('skip step (staff): skipped, later dates revised, sequence can still complete', async () => {
  const { db, env } = await setup(); const eid = await enroll(db);
  eq((await skipStep(db, stepId(db, eid, 1), 'a')).code, 'step_skipped');
  await approve(db, eid, 2, '2026-09-23T13:15:00.000Z'); await run(env, db, '2026-09-23T13:15:00.000Z'); eq(mail.length, 1);
  await skipStep(db, stepId(db, eid, 3), 'a'); eq(db.one('SELECT status FROM enrollments').status, 'completed', 'completes when nothing is left');
});

// =============================== unsubscribe ================================================
console.log('\n[unsubscribe link]');
const call = (env, method, path, opts = {}) => worker.fetch(new Request(`https://forms.test${path}`, { method, ...opts }), env, { waitUntil() {} });
await test('GET shows a confirmation page and changes NOTHING (link scanners issue GETs)', async () => {
  const s = await ready(); const t = s.db.one('SELECT token FROM unsubscribe_tokens').token;
  const r = await call(s.env, 'GET', `/u/${t}`); eq(r.status, 200); ok((await r.text()).includes('Unsubscribe me'), 'page');
  eq(s.db.one('SELECT COUNT(*) n FROM suppressions').n, 0, 'no suppression'); eq(s.db.one('SELECT status FROM enrollments').status, 'active', 'still active');
});
await test('POST (also the RFC 8058 one-click call) unsubscribes: suppresses, withdraws permission, stops, cancels queued follow-ups; idempotent', async () => {
  const s = await ready(); const t = s.db.one('SELECT token FROM unsubscribe_tokens').token;
  const r = await call(s.env, 'POST', `/u/${t}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  eq(r.status, 200, 'status');
  eq(s.db.one("SELECT reason FROM suppressions WHERE email='sam@example.test'").reason, 'unsubscribe', 'suppressed');
  eq(s.db.one('SELECT stop_reason r FROM enrollments').r, 'unsubscribed', 'stopped'); ok(s.db.one('SELECT withdrawn_at w FROM consents').w, 'permission withdrawn');
  ok(s.db.rows('SELECT status FROM enrollment_steps').every((x) => x.status === 'cancelled'), 'steps cancelled');
  eq((await call(s.env, 'POST', `/u/${t}`)).status, 200, 'second POST is fine');
  await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'nothing sends after unsubscribing');
  eq((await createEnrollment(s.db, 'L1', CONSENT, 'a', at('2026-09-19T16:00:00.000Z'))).code, 'not_eligible_unsubscribed', 'cannot be re-enrolled');
});
await test('unsubscribing also covers the same address on another lead, and leaves the confirmation system untouched', async () => {
  const s = await setup(); s.db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L2','k2','2026-09-19T15:30:00Z','Sam Again','SAM@example.test','(416) 555-0199','Toronto','Deck','Just exploring','contact','new','sent','sent')");
  // The dashboard now allows one open sequence per person, so create the second open enrollment the way older data could have it: enrolled under another address, then the address changed to match.
  const e1 = await enroll(s.db, 'L1'); const l1Email = s.db.one("SELECT email e FROM leads WHERE id='L1'").e; s.db.run("UPDATE leads SET email = 'temp-l2@example.test' WHERE id='L2'"); const e2 = await enroll(s.db, 'L2'); s.db.run('UPDATE leads SET email = ? WHERE id = ?', l1Email, 'L2'); const t = s.db.one('SELECT token FROM unsubscribe_tokens WHERE enrollment_id = ?', e1).token;
  await call(s.env, 'POST', `/u/${t}`);
  eq(s.db.rows('SELECT status FROM enrollments ORDER BY id').map((r) => r.status), ['stopped', 'stopped'], 'both enrollments'); eq(s.db.one("SELECT COUNT(*) n FROM email_jobs WHERE status='sent'").n, 2, 'confirmations untouched');
});
await test('invalid, malformed, or missing tokens get a generic 404 and change nothing', async () => {
  const s = await ready();
  for (const p of ['/u/short', `/u/${'a'.repeat(43)}`, '/u/%3Cscript%3E', `/u/${'A'.repeat(90)}`]) { const r = await call(s.env, 'POST', p); ok([404].includes(r.status), `${p} -> ${r.status}`); }
  eq(s.db.one('SELECT status FROM enrollments').status, 'active');
});

// =============================== bounces & complaints (Resend webhook) =============================
console.log('\n[Resend webhook: signature, bounces, complaints, delivery]');
function sign(id, ts, body, secretBytes = WHSEC_BYTES) { return 'v1,' + createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64'); }
async function hook(env, event, { id = `evt_${Math.random().toString(36).slice(2)}`, ts = Math.floor(Date.now() / 1000), sig, secret } = {}) {
  const body = JSON.stringify(event);
  return call(env, 'POST', '/webhooks/resend', { headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sig ?? sign(id, ts, body, secret) }, body });
}
await test('signature is verified: bad / missing / stale / wrong-secret signatures are refused (401) and change nothing; no secret configured -> 503', async () => {
  const s = await ready(); const ev = { type: 'email.complained', data: { email_id: 'x', to: ['sam@example.test'] } };
  eq((await hook(s.env, ev, { sig: 'v1,AAAA' })).status, 401, 'forged'); eq((await hook(s.env, ev, { sig: '' })).status, 401, 'empty');
  eq((await hook(s.env, ev, { secret: Buffer.from('some other secret') })).status, 401, 'wrong secret');
  eq((await hook(s.env, ev, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401, 'replayed/stale timestamp');
  eq((await call(s.env, 'POST', '/webhooks/resend', { body: JSON.stringify(ev) })).status, 401, 'no headers');
  eq(s.db.one('SELECT COUNT(*) n FROM suppressions').n, 0, 'nothing changed'); eq(s.db.one('SELECT status FROM enrollments').status, 'active');
  eq((await hook({ ...s.env, RESEND_WEBHOOK_SECRET: '' }, ev)).status, 503, 'fails closed');
  eq((await call(s.env, 'GET', '/webhooks/resend')).status, 405, 'GET');
});
await test('verifySvix accepts any one of several space-separated signatures (key rotation)', async () => {
  const body = '{"a":1}'; const ts = Math.floor(Date.now() / 1000);
  ok(await verifySvix({ id: 'i', timestamp: String(ts), signature: `v1,WRONG ${sign('i', ts, body)}`, body, secret: WHSEC }), 'second signature valid');
  ok(!(await verifySvix({ id: 'i', timestamp: String(ts), signature: `v2,${sign('i', ts, body).slice(3)}`, body, secret: WHSEC })), 'wrong version');
});
await test('permanent bounce: address suppressed, sequence stopped, queued follow-up never sent', async () => {
  const s = await ready(); const r = await hook(s.env, { type: 'email.bounced', data: { email_id: 'm', to: ['sam@example.test'], bounce: { type: 'Permanent', subType: 'General' } } });
  eq(r.status, 200); eq(s.db.one('SELECT reason FROM suppressions').reason, 'bounce', 'suppressed'); eq(s.db.one('SELECT stop_reason r FROM enrollments').r, 'suppressed_bounce', 'stopped');
  await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'nothing sent');
});
await test('transient bounce does NOT suppress; spam complaint DOES', async () => {
  const s = await ready(); await hook(s.env, { type: 'email.bounced', data: { to: ['sam@example.test'], bounce: { type: 'Transient', subType: 'MailboxFull' } } });
  eq(s.db.one('SELECT COUNT(*) n FROM suppressions').n, 0, 'transient ignored'); eq(s.db.one('SELECT status FROM enrollments').status, 'active');
  await hook(s.env, { type: 'email.complained', data: { email_id: 'm', to: ['sam@example.test'] } });
  eq(s.db.one('SELECT reason FROM suppressions').reason, 'complaint', 'complaint'); eq(s.db.one('SELECT stop_reason r FROM enrollments').r, 'suppressed_complaint');
});
await test('our own inbox and the test addresses are never suppressed by a webhook', async () => {
  const s = await ready();
  for (const to of ['hello@renosrise.com', 'levi.gene.ous@gmail.com']) await hook(s.env, { type: 'email.bounced', data: { to: [to], bounce: { type: 'Permanent' } } });
  eq(s.db.one('SELECT COUNT(*) n FROM suppressions').n, 0);
});
await test('delivered event records delivered_at on our send; duplicate and unknown events are harmless', async () => {
  const s = await ready(); await run(s.env, s.db, '2026-09-20T13:15:00.000Z');
  const mid = s.db.one('SELECT resend_message_id m FROM followup_sends').m;
  const ev = { type: 'email.delivered', data: { email_id: mid, to: ['sam@example.test'] } };
  eq((await hook(s.env, ev, { id: 'dup1' })).status, 200); const first = s.db.one('SELECT delivered_at d FROM followup_sends').d; ok(first, 'delivered_at set');
  eq((await hook(s.env, ev, { id: 'dup1' })).status, 200, 'duplicate'); eq(s.db.one('SELECT delivered_at d FROM followup_sends').d, first, 'unchanged');
  eq((await hook(s.env, { type: 'email.opened', data: {} })).status, 200, 'unknown type ignored');
});

// =============================== duplicates, retries, concurrency ==============================
console.log('\n[duplicates, retries, ambiguous results]');
await test('five concurrent processor runs still send exactly ONE email for the step', async () => {
  const s = await ready();
  await Promise.all([1, 2, 3, 4, 5].map(() => run(s.env, s.db, '2026-09-20T13:15:00.000Z')));
  eq(mail.length, 1, 'one email'); eq(s.db.one("SELECT COUNT(*) n FROM followup_sends").n, 1, 'one send row'); eq(s.db.one("SELECT attempts a FROM followup_sends").a, 1, 'one attempt');
});
await test('re-running (or a cron overlap) after success never re-sends', async () => {
  const s = await ready(); await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); for (let i = 0; i < 3; i++) await run(s.env, s.db, `2026-09-20T13:${30 + i}:00.000Z`); eq(mail.length, 1);
});
await test('provider outage: bounded retries with the SAME idempotency key; exhausted send blocks later steps until staff retry it', async () => {
  const s = await ready(); mode = '500';
  for (let i = 0; i < 7; i++) await run(s.env, s.db, `2026-09-20T13:${15 + i}:00.000Z`);
  const send = s.db.one('SELECT * FROM followup_sends'); eq([send.status, send.attempts], ['failed', 5], 'bounded at 5 attempts');
  eq(s.db.one('SELECT status FROM enrollment_steps WHERE step_no = 1').status, 'queued', 'step stays queued (visible, not silently skipped)');
  eq((await approve(s.db, s.eid, 2, '2026-09-23T13:15:00.000Z')).code, 'not_next_step', 'step 2 is blocked while step 1 is unresolved');
  mode = 'ok'; eq((await retryFailedSend(s.db, send.id, 'a')).code, 'retry_queued'); eq((await retryFailedSend(s.db, send.id, 'a')).code, 'retry_not_eligible', 'double click');
  await run(s.env, s.db, '2026-09-20T14:30:00.000Z'); eq(mail.length, 1, 'delivered once after recovery'); eq(mail[0].key, `fu:${s.eid}:1`, 'same key throughout');
});
await test('permanent provider rejection (invalid recipient) fails at once and is not retried', async () => {
  const s = await ready(); mode = '422'; await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); mode = 'ok';
  const send = s.db.one('SELECT * FROM followup_sends'); eq(send.status, 'failed'); await run(s.env, s.db, '2026-09-20T13:30:00.000Z'); eq(mail.length, 0);
});
await test('ambiguous result (connection dropped): retried with the same idempotency key; the provider de-duplicates; we record exactly one send', async () => {
  const s = await ready(); mode = 'drop'; await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); mode = 'ok';
  eq(s.db.one('SELECT status FROM followup_sends').status, 'pending', 'retryable'); await run(s.env, s.db, '2026-09-20T13:30:00.000Z');
  eq(mail.length, 1, 'one message'); eq(sentCount(s.db), 1, 'one sent record');
});
await test('a send stuck in "sending" (crashed invocation) is recovered after 10 minutes, not before', async () => {
  const s = await ready(); await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); mail.length = 0; seenKeys.clear();
  s.db.run("UPDATE followup_sends SET status='sending', updated_at='2026-09-20T13:16:00.000Z', resend_message_id=NULL"); s.db.run("UPDATE enrollment_steps SET status='queued', sent_at=NULL");
  await run(s.env, s.db, '2026-09-20T13:20:00.000Z'); eq(mail.length, 0, 'not yet stale');
  await run(s.env, s.db, '2026-09-20T13:31:00.000Z'); eq(mail.length, 1, 'recovered'); eq(sentCount(s.db), 1);
});

// =============================== shared budget ==================================================
console.log('\n[shared sending budget (Free plan: 100/day, 3,000/month)]');
const seedUsage = (db, n, iso, table = 'email_jobs') => { for (let i = 0; i < n; i++) { if (table === 'email_jobs') db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", `u${iso}${i}`, 'L1', 'customer', `usage:${iso}:${i}`, 'sent', 1, iso, iso); } };
await test('defaults reflect the Free plan: 100/day, 3,000/month, 50 follow-ups/day, confirmations reserved', async () => {
  eq([DEFAULT_SETTINGS.account_daily_cap, DEFAULT_SETTINGS.account_monthly_cap, DEFAULT_SETTINGS.followup_daily_cap, DEFAULT_SETTINGS.confirmation_reserve], ['100', '3000', '50', '10']);
});
await test('follow-ups wait when capacity is low, keeping a reserve for confirmations and notifications; confirmations are never blocked by follow-ups', async () => {
  const s = await ready(); seedUsage(s.db, 88, '2026-09-20T12:00:00.000Z'); // 88 + 2 seeded earlier confirmations are on Sep 19, so 88 today
  eq((await run(s.env, s.db, '2026-09-20T13:15:00.000Z')).sent, 1, '89th goes out (leaves a 10 reserve for confirmations)');
  const b = await setup(); const eid = await enroll(b.db); await approve(b.db, eid, 1, '2026-09-20T13:15:00.000Z'); seedUsage(b.db, 90, '2026-09-20T12:00:00.000Z');
  eq((await run(b.env, b.db, '2026-09-20T13:15:00.000Z')).deferred, { budget_daily_capacity: 1 }, 'deferred at 90 used'); eq(mail.length, 0, 'nothing sent once only the reserve is left');
  // a new website lead's confirmation is recorded by the forms Worker WITHOUT any budget check, so it is never blocked
  b.db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('c2','L1','customer','c2','sent',1,'2026-09-20T13:16:00Z','2026-09-20T13:16:00Z')"); ok(true);
});
await test('deferred (not lost): the same follow-up goes out the next UTC day when capacity returns, then the schedule is revised', async () => {
  const s = await ready(); seedUsage(s.db, 95, '2026-09-20T12:00:00.000Z');
  await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'held today');
  eq((await run(s.env, s.db, '2026-09-21T13:15:00.000Z')).sent, 1, 'next day'); eq(mail.length, 1);
  eq(steps(s.db, s.eid)[1].planned_for, '2026-09-23T12:00:00.000Z', 'step 2 moved to Sep 21 + 2');
});
await test('quota delay never causes a catch-up burst: after 3 days of delay only ONE email goes out, and the next is re-dated', async () => {
  const s = await ready();
  for (const d of ['20', '21', '22']) { seedUsage(s.db, 95, `2026-09-${d}T12:00:00.000Z`); await run(s.env, s.db, `2026-09-${d}T13:15:00.000Z`); }
  eq(mail.length, 0, 'held for three days');
  await run(s.env, s.db, '2026-09-23T13:15:00.000Z'); await run(s.env, s.db, '2026-09-23T13:30:00.000Z'); eq(mail.length, 1, 'exactly one on Sep 23');
  eq((await approve(s.db, s.eid, 2, '2026-09-23T14:00:00.000Z')).code, 'not_due_yet', 'email 2 is NOT due the same day it was originally planned');
  eq(steps(s.db, s.eid)[1].planned_for.slice(0, 10), '2026-09-25', 'revised date is shown');
});
await test('follow-up daily cap (default 50, configurable): the cap holds and the remainder waits for the next UTC day', async () => {
  const s = await setup({ settings: { followup_daily_cap: '2' } }); const ids = [];
  for (let i = 1; i <= 3; i++) { s.db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", `M${i}`, `mk${i}`, '2026-09-19T15:00:00Z', `Lead ${i}`, `m${i}@example.test`, '1', 'T', 'K', 'J', 'homepage', 'new', 'sent', 'sent'); const e = await enroll(s.db, `M${i}`); await approve(s.db, e, 1, '2026-09-20T13:15:00.000Z'); ids.push(e); }
  const r = await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(r.sent, 2, 'two sent'); eq(r.deferred, { budget_followup_cap: 1 }, 'third deferred');
  eq((await run(s.env, s.db, '2026-09-21T13:15:00.000Z')).sent, 1, 'next UTC day'); eq(mail.length, 3);
});
await test('monthly capacity is enforced too (3,000/month less the reserve)', async () => {
  const s = await ready(); s.db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) SELECT 'mm' || value, 'L1', 'customer', 'mm' || value, 'sent', 1, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z' FROM (WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM c WHERE value < 2850) SELECT value FROM c)");
  eq((await run(s.env, s.db, '2026-09-20T13:15:00.000Z')).deferred, { budget_monthly_capacity: 1 }, '2,852 used this month'); eq(mail.length, 0);
});
await test('the UTC day is what counts (Resend resets at UTC midnight = 8 p.m. Toronto in summer)', async () => {
  const s = await ready(); seedUsage(s.db, 95, '2026-09-20T23:00:00.000Z'); // 7 pm Toronto Sep 20 = still UTC Sep 20
  await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'same UTC day: held');
  eq((await run(s.env, s.db, '2026-09-21T13:15:00.000Z')).sent, 1, 'new UTC day');
});
await test('setup gates: no send without business details or a configured Resend webhook secret (bounce/complaint suppression must work)', async () => {
  const a = await ready(); a.db.run("DELETE FROM sequence_settings WHERE key = 'business_mailing_address'"); eq((await run(a.env, a.db, '2026-09-20T13:15:00.000Z')).deferred, { business_details_missing: 1 }, 'address'); eq(mail.length, 0);
  const b = await ready(); eq((await run({ ...b.env, RESEND_WEBHOOK_SECRET: undefined }, b.db, '2026-09-20T13:15:00.000Z')).deferred, { webhook_not_configured: 1 }, 'webhook'); eq(mail.length, 0);
});

// =============================== test emails ====================================================
console.log('\n[test emails: only hello@renosrise.com or levi.gene.ous@gmail.com]');
await test('test emails go only to the two allowed addresses, are marked [TEST], count in the shared budget, and work while the switch is OFF', async () => {
  const s = await setup({ enable: false });
  eq((await queueTestSend(s.db, { to: 'customer@example.com', template: 'checkin', variant: 'call', name: 'X' }, 'a')).code, 'test_recipient', 'rejected at queue');
  for (const to of ['hello@renosrise.com', 'levi.gene.ous@gmail.com']) eq((await queueTestSend(s.db, { to, template: 'checkin', variant: 'website', name: 'Levi' }, 'a')).code, 'test_queued', to);
  s.db.run("INSERT INTO followup_sends (id, kind, to_email, idempotency_key, template, variant, status, attempts, created_at, updated_at) VALUES ('evil','test','victim@example.com','test:evil','checkin','call','pending',0,'2026-09-20T00:00:00Z','2026-09-20T00:00:00Z')");
  const r = await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(r.tests, 2, 'two sent'); eq(mail.map((m) => m.payload.to[0]).sort(), ['hello@renosrise.com', 'levi.gene.ous@gmail.com'], 'recipients');
  ok(mail.every((m) => m.payload.subject.startsWith('[TEST] ')), 'marked [TEST]'); eq(s.db.one("SELECT status FROM followup_sends WHERE id='evil'").status, 'cancelled', 'bypass attempt cancelled');
  eq(r.skipped, 'global_switch_off', 'customer follow-ups stayed off'); eq(s.db.one("SELECT COUNT(*) n FROM followup_sends WHERE status='sent'").n, 2, 'counted');
});
await test('test emails cannot enroll or email real customers, and respect the shared budget', async () => {
  const s = await setup({ enable: false }); seedUsage(s.db, 100, '2026-09-20T12:00:00.000Z');
  await queueTestSend(s.db, { to: 'hello@renosrise.com', template: 'last', variant: 'call', name: 'A' }, 'a'); await run(s.env, s.db, '2026-09-20T13:15:00.000Z'); eq(mail.length, 0, 'account cap reached');
  eq(s.db.one('SELECT COUNT(*) n FROM enrollments').n, 0);
});

// =============================== existing systems untouched =======================================
console.log('\n[existing confirmations and history]');
await test('migration 0003 is purely additive: existing tables/columns unchanged, confirmations keep using email_jobs', async () => {
  const db = freshDb();
  eq(db.rows("SELECT name FROM pragma_table_info('email_jobs') ORDER BY cid").map((r) => r.name), ['id', 'lead_id', 'email_type', 'idempotency_key', 'status', 'attempts', 'max_attempts', 'last_error', 'resend_message_id', 'created_at', 'updated_at'], 'email_jobs unchanged');
  ok(db.one("SELECT sql FROM sqlite_master WHERE name='email_jobs'").sql.includes("'customer', 'internal'"), 'email_jobs CHECK unchanged');
  for (const t of ['sequence_versions', 'sequence_settings', 'consents', 'enrollments', 'enrollment_steps', 'followup_sends', 'suppressions', 'unsubscribe_tokens', 'webhook_events']) ok(db.one('SELECT 1 x FROM sqlite_master WHERE name = ?', t), `${t} exists`);
});
await test('no other sequence versions exist, so there are no old-schedule enrollments to migrate (and day-21/28 jobs cannot exist)', async () => {
  const db = freshDb(); eq(db.rows('SELECT id FROM sequence_versions').map((r) => r.id), ['v2'], 'versions'); eq(db.one('SELECT COUNT(*) n FROM enrollments').n, 0, 'enrollments');
});
await test('failure inside the follow-up processor can never break confirmation retries (scheduled() isolates it)', async () => {
  const s = await setup(); s.db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES ('p1','L1','customer','p1','pending',1,'2026-09-19T15:00:00Z','2026-09-19T15:00:00Z')");
  s.db.run('DROP TABLE enrollment_steps'); // break the follow-up side on purpose
  let waited; await worker.scheduled({}, { ...s.env, CUSTOMER_FROM_EMAIL: 'RenoRise <hello@notify.renosrise.com>', REPLY_TO_EMAIL: 'hello@renosrise.com' }, { waitUntil: (p) => { waited = p; } }); await waited;
  eq(s.db.one("SELECT status FROM email_jobs WHERE id='p1'").status, 'sent', 'confirmation retry still completed'); eq(mail.length, 1);
});

mock.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(` - FAILED: ${f.name}: ${f.err.message}`));
process.exit(failed.length ? 1 : 0);
