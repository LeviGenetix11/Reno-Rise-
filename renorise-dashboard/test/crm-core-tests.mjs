// CRM data-layer tests (Stage A).
//
// Runs the REAL CRM modules against an in-memory D1-compatible database with every
// migration applied (foreign keys ON, atomic batches, like D1). No network, no
// email, no Cloudflare. Test people use example.test addresses only.
//
//   cd renorise-dashboard && node test/crm-core-tests.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { freshDb } from '../../renorise-forms/test/d1-shim.mjs';
import * as crm from '../src/crm-db.js';
import * as work from '../src/crm-work.js';
import * as q from '../src/crm-query.js';
import { createEnrollment } from '../src/seq-db.js';
import { torontoToday, torontoInputToUtcIso, formatDateTime } from '../src/time.js';
import { normalizeEmail, normalizePhone, splitLocation } from '../../renorise-shared/normalize.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };
const A = 'admin@example.test';
const form = (o) => ({ get: (k) => (o[k] === undefined ? null : o[k]) });
const NOW = () => new Date().toISOString();

const SUBMISSION_COLS = ['name', 'email', 'phone', 'city', 'renovation_type', 'project_timing', 'target_deadline', 'project_details', 'source', 'created_at', 'idempotency_key'];

function seedLead(db, id, o = {}) {
  db.run(
    `INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, target_deadline, project_details, source, status, customer_email_status, internal_email_status, contractor_id, archived_at, assessment_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, `k-${id}`, o.created_at || NOW(), o.name || `Person ${id}`, o.email ?? `${id.toLowerCase()}@example.test`, o.phone ?? '(416) 555-0100', o.city ?? 'Toronto',
    o.type ?? 'Kitchen', o.timing ?? 'Just exploring', o.deadline ?? null, o.details ?? 'Original words <b>kept</b>', o.source || 'assessment', o.status || 'new', o.ce || 'sent', o.ie || 'sent',
    o.contractor ?? null, o.archived ?? null, o.assessment ?? null, o.updated ?? null
  );
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", `j-${id}-c`, id, 'customer', `${id}:customer`, 'sent', 1, NOW(), NOW());
}
async function fresh() { const db = freshDb(); return db; }
const enrollInput = () => ({ sourceKind: 'website', confirmed: true, method: 'phone_verbal', givenOn: torontoToday(), evidence: 'Said yes on the phone today' });
const openEnr = (db, oppId) => db.rows("SELECT e.* FROM enrollments e JOIN leads l ON l.id = e.lead_id WHERE l.opportunity_id = ? AND e.status IN ('active','paused')", oppId);
const opp = (db, id) => db.one('SELECT * FROM opportunities WHERE id = ?', id);

console.log('CRM data layer');

// ------------------------------------------------------------------------------------------------
console.log('\n[existing records migrate without losing anything]');
await test('migration 0004 applies on top of 0001-0003 and is purely additive (no DROP / DELETE / RENAME / column rewrite)', async () => {
  const sql = readFileSync(new URL('../../renorise-forms/migrations/0004_crm_core.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  ok(!/\bDROP\b|\bDELETE\b|\bRENAME\b|\bUPDATE\b|\bINSERT\b/i.test(sql), 'migration must only CREATE / ALTER ADD COLUMN');
  const alters = sql.match(/ALTER TABLE \w+ ADD COLUMN \w+ [^;]*/gi) || [];
  eq(alters.length, 2, 'two ALTERs'); ok(alters.every((a) => /^ALTER TABLE leads ADD COLUMN (contact_id|opportunity_id) TEXT REFERENCES/.test(a)), 'only nullable link columns on leads');
  const db = await fresh();
  for (const t of ['contacts', 'contact_identifiers', 'opportunities', 'tasks', 'call_logs', 'appointments', 'crm_events', 'contact_permissions', 'crm_settings']) ok(db.one("SELECT 1 x FROM sqlite_master WHERE name = ?", t), `table ${t}`);
  ok(readdirSync(new URL('../../renorise-forms/migrations/', import.meta.url)).includes('0004_crm_core.sql'), 'file present');
});

await test('every existing lead gets ONE contact and ONE project; original submission columns are byte-for-byte unchanged; ids stay linked', async () => {
  const db = await fresh();
  seedLead(db, 'L1'); seedLead(db, 'L2', { status: 'won' }); seedLead(db, 'L3', { status: 'lost', archived: NOW() });
  db.run("INSERT INTO lead_notes (id, lead_id, body, author_email, created_at) VALUES ('n1','L1','old note',?,?)", A, NOW());
  db.run("INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES ('a1','L1','stage_changed','Old dashboard change',?,?)", A, NOW());
  const before = db.rows(`SELECT id, ${SUBMISSION_COLS.join(', ')} FROM leads ORDER BY id`);
  await crm.ensureCrmRecords(db);
  eq(db.one('SELECT COUNT(*) n FROM contacts').n, 3, 'contacts'); eq(db.one('SELECT COUNT(*) n FROM opportunities').n, 3, 'projects');
  eq(db.rows(`SELECT id, ${SUBMISSION_COLS.join(', ')} FROM leads ORDER BY id`), before, 'submissions untouched');
  ok(db.rows('SELECT * FROM leads').every((l) => l.contact_id && l.opportunity_id), 'linked');
  eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, 3, 'email jobs kept'); eq(db.one("SELECT lead_id FROM email_jobs WHERE id='j-L1-c'").lead_id, 'L1', 'job still on the lead');
  eq(db.one('SELECT COUNT(*) n FROM lead_notes').n, 1, 'notes kept'); eq(db.one('SELECT COUNT(*) n FROM lead_activity').n, 1, 'activity kept');
});

await test('running it twice, or twice at once, never duplicates anything', async () => {
  const db = await fresh(); for (const id of ['L1', 'L2', 'L3']) seedLead(db, id);
  await Promise.all([crm.ensureCrmRecords(db), crm.ensureCrmRecords(db), crm.ensureCrmRecords(db)]); await crm.ensureCrmRecords(db);
  eq([db.one('SELECT COUNT(*) n FROM contacts').n, db.one('SELECT COUNT(*) n FROM opportunities').n, db.one('SELECT COUNT(*) n FROM contact_identifiers').n], [3, 3, 6], 'counts');
  eq(db.one("SELECT COUNT(*) n FROM crm_events WHERE kind = 'project_created'").n, 3, 'one creation event each');
});

await test('old stages map only where the meaning is unambiguous; "Contacted" and "Assessment booked" are left for a person to decide', async () => {
  const db = await fresh();
  for (const [id, st] of [['S1', 'new'], ['S2', 'quote_sent'], ['S3', 'won'], ['S4', 'lost'], ['S5', 'contacted'], ['S6', 'assessment_booked']]) seedLead(db, id, { status: st });
  await crm.ensureCrmRecords(db);
  const stage = (id) => db.one('SELECT stage, stage_needs_review r, legacy_status l FROM opportunities WHERE id = ?', `op-${id}`);
  eq(stage('S1'), { stage: 'new_inquiry', r: 0, l: 'new' }); eq(stage('S2'), { stage: 'quote_sent', r: 0, l: 'quote_sent' });
  eq(stage('S3').stage, 'won'); eq(stage('S4').stage, 'lost');
  eq(stage('S5'), { stage: null, r: 1, l: 'contacted' }, 'contacted needs a decision'); eq(stage('S6'), { stage: null, r: 1, l: 'assessment_booked' }, 'assessment booked needs a decision');
  eq(db.one("SELECT stage_reason r FROM opportunities WHERE id='op-S4'").r, null, 'no lost reason invented');
  const s = await q.stageCounts(db, q.parseLeadFilters(new URL('https://x.test/leads?test=all'))); eq(s.by.needs_review, 2, 'two records are waiting for a stage');
});

await test('assessment dates become on-site appointments, follow-ups become tasks with the SAME ids, contractor and archive carry over', async () => {
  const db = await fresh();
  db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay Builders',?,?)", NOW(), NOW());
  seedLead(db, 'L1', { assessment: '2026-12-01T15:00:00.000Z', contractor: 'K1' }); seedLead(db, 'L2', { archived: '2026-09-01T00:00:00.000Z' });
  db.run("INSERT INTO follow_ups (id, lead_id, due_on, note, created_at) VALUES ('F1','L1','2026-10-01','Call Sam',?)", NOW());
  db.run("INSERT INTO follow_ups (id, lead_id, due_on, note, created_at, completed_at) VALUES ('F2','L1','2026-09-01',NULL,?,?)", NOW(), '2026-09-02T12:00:00.000Z');
  await crm.ensureCrmRecords(db); await crm.ensureCrmRecords(db);
  eq(db.one("SELECT kind, status, source, starts_at FROM appointments WHERE opportunity_id='op-L1'"), { kind: 'onsite_assessment', status: 'scheduled', source: 'legacy_assessment', starts_at: '2026-12-01T15:00:00.000Z' });
  eq(db.rows("SELECT id, type, title, status, source FROM tasks ORDER BY id"), [{ id: 'F1', type: 'general', title: 'Call Sam', status: 'open', source: 'legacy_follow_up' }, { id: 'F2', type: 'general', title: 'Follow up', status: 'done', source: 'legacy_follow_up' }]);
  eq(db.one("SELECT contractor_id c FROM opportunities WHERE id='op-L1'").c, 'K1'); ok(opp(db, 'op-L2').archived_at, 'archived carried');
  eq(db.one('SELECT COUNT(*) n FROM follow_ups').n, 2, 'follow_ups table itself untouched');
});

await test('a postal code is split out but nothing is invented: no street address, and a partial code stays as city text', async () => {
  eq(splitLocation('Toronto M5V 3A3'), { city: 'Toronto', postal: 'M5V 3A3' }); eq(splitLocation('m5v3a3'), { city: null, postal: 'M5V 3A3' });
  eq(splitLocation('M5V'), { city: 'M5V', postal: null }); eq(splitLocation('Mississauga'), { city: 'Mississauga', postal: null });
  const db = await fresh(); seedLead(db, 'L1', { city: 'Toronto M5V 3A3' }); await crm.ensureCrmRecords(db);
  const o = opp(db, 'op-L1'); eq([o.property_city, o.property_postal_code, o.property_address], ['Toronto', 'M5V 3A3', null]);
});

// ------------------------------------------------------------------------------------------------
console.log('\n[contacts, duplicates, one customer with several projects]');
await test('people are NEVER merged automatically: a shared email or phone only produces a suggestion (formats normalised, display values kept)', async () => {
  const db = await fresh();
  seedLead(db, 'L1', { name: 'Sam Roe', email: 'Sam@Example.test', phone: '(416) 555-0100' });
  seedLead(db, 'L2', { name: 'Samantha Roe', email: 'sam@example.test', phone: '+1 416.555.0100', type: 'Bathroom' });
  seedLead(db, 'L3', { name: 'Other Person', email: 'other@example.test', phone: '416-555-9999' });
  await crm.ensureCrmRecords(db);
  eq(db.one('SELECT COUNT(*) n FROM contacts').n, 3, 'still three separate people');
  const dups = await crm.possibleDuplicates(db, 'ct-L1'); eq(dups.map((d) => d.id), ['ct-L2'], 'L2 suggested for L1'); eq(dups[0].matched_on.split(',').sort(), ['email', 'phone']);
  eq((await crm.possibleDuplicates(db, 'ct-L3')), [], 'no false suggestion');
  eq(db.one("SELECT email FROM contacts WHERE id='ct-L1'").email, 'Sam@Example.test', 'display value keeps the original capitals');
  eq([normalizeEmail(' A@B.CO '), normalizePhone('1 (416) 555-0100'), normalizePhone('555-0100'), normalizePhone('+44 20 7946 0958')], ['a@b.co', '4165550100', null, '+442079460958']);
});

await test('editing a contact changes the contact only; the submission keeps what the customer typed; before/after go to the audit trail; old and new email both stay matchable', async () => {
  const db = await fresh(); seedLead(db, 'L1', { name: 'Sam Roe', email: 'sam@example.test' }); await crm.ensureCrmRecords(db);
  const r = crm.readContactForm(form({ display_name: 'Samuel Roe', email: 'samuel@example.test', phone: '(416) 555-0100', preferred_contact_method: 'phone', preferred_contact_time: 'weekday evenings', notes: 'Prefers calls', tags: 'vip, repeat, VIP' }));
  ok(r.ok, 'valid'); eq((await crm.updateContact(db, 'ct-L1', r.value, A)).code, 'contact_saved');
  const c = db.one("SELECT * FROM contacts WHERE id='ct-L1'"); eq([c.display_name, c.email, c.preferred_contact_method, c.tags], ['Samuel Roe', 'samuel@example.test', 'phone', 'vip, repeat']);
  eq(db.one("SELECT name, email FROM leads WHERE id='L1'"), { name: 'Sam Roe', email: 'sam@example.test' }, 'submission untouched');
  const ev = db.one("SELECT detail, provenance, actor FROM crm_events WHERE kind='contact_updated'"); const d = JSON.parse(ev.detail).changes;
  eq(d.display_name, ['Sam Roe', 'Samuel Roe']); eq(d.email, ['sam@example.test', 'samuel@example.test']); eq([ev.provenance, ev.actor], ['manual', A]);
  eq(db.rows("SELECT norm FROM contact_identifiers WHERE contact_id='ct-L1' AND kind='email' ORDER BY norm").map((x) => x.norm), ['sam@example.test', 'samuel@example.test']);
  eq((await crm.updateContact(db, 'ct-L1', r.value, A)).code, 'no_change', 'saving the same values changes nothing');
});

await test('a contact needs a name and at least one way to reach them; a phone-only caller is fine, and no email is ever made up', async () => {
  eq(crm.readContactForm(form({ display_name: '', email: 'a@b.co' })).code, 'contact_name'); eq(crm.readContactForm(form({ display_name: 'X' })).code, 'contact_needs_email_or_phone');
  eq(crm.readContactForm(form({ display_name: 'X', email: 'not-an-email' })).code, 'contact_email'); eq(crm.readContactForm(form({ display_name: 'X', phone: '123' })).code, 'contact_phone');
  const r = crm.readContactForm(form({ display_name: 'Pat Caller', phone: '(647) 555-0142' })); ok(r.ok, 'phone only'); eq(r.value.email, null);
});

await test('manual entry (phone / referral / social): creates the original submission, contact and project; phone-only has NO email; NOTHING is sent (no email jobs)', async () => {
  const db = await fresh(); await crm.ensureCrmRecords(db);
  const c = crm.readContactForm(form({ display_name: 'Pat Caller', phone: '(647) 555-0142' })).value;
  const p = crm.readOpportunityForm(form({ title: '', renovation_type: 'Basement', property_city: 'Toronto', description: 'Wants a basement suite' })).value;
  const res = await crm.createManualProject(db, { contactValue: c, projectValue: p, channel: 'phone' }, A); ok(res.ok, res.code);
  const lead = db.one('SELECT * FROM leads WHERE opportunity_id = ?', res.opportunityId);
  eq([lead.source, lead.email, lead.phone, lead.customer_email_status, lead.internal_email_status, lead.status], ['phone', '', '(647) 555-0142', 'not_applicable', 'not_applicable', 'new']);
  eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, 0, 'no email jobs were created'); eq(db.one('SELECT email FROM contacts WHERE id = ?', res.contactId).email, null);
  eq(opp(db, res.opportunityId).stage, 'new_inquiry'); eq(opp(db, res.opportunityId).title, 'Basement', 'title falls back to the renovation type');
  eq((await createEnrollment(db, lead.id, enrollInput(), A)).code, 'bad_email', 'a phone-only caller cannot be enrolled in emails');
  eq((await crm.createManualProject(db, { contactValue: c, projectValue: p, channel: 'facebook' }, A)).code, 'bad_channel');
  eq((await crm.createManualProject(db, { contactValue: c, projectValue: p, channel: 'phone', receivedLocal: '2999-01-01T09:00' }, A)).code, 'received_future');
});

await test('ONE contact can have several independent projects; closing / booking one never touches the other, and a person gets one email sequence at a time', async () => {
  const db = await fresh(); seedLead(db, 'L1', { email: 'sam@example.test', type: 'Kitchen' }); await crm.ensureCrmRecords(db);
  const p = crm.readOpportunityForm(form({ title: 'Bathroom', renovation_type: 'Bathroom' })).value;
  const second = await crm.createManualProject(db, { contactId: 'ct-L1', projectValue: p, channel: 'phone' }, A); ok(second.ok, 'second project');
  eq(db.one('SELECT COUNT(*) n FROM opportunities WHERE contact_id = ?', 'ct-L1').n, 2, 'two projects, one contact');
  const bLead = db.one('SELECT id FROM leads WHERE opportunity_id = ?', second.opportunityId).id;
  db.run("UPDATE leads SET email = 'sam@example.test' WHERE id = ?", bLead); // the customer gave the same email for the second project
  const a = await createEnrollment(db, 'L1', enrollInput(), A); ok(a.ok, 'A enrolled');
  eq((await createEnrollment(db, bLead, enrollInput(), A)).code, 'person_has_open_sequence', 'no overlapping sequences for one person');
  await crm.setStage(db, 'op-L1', { stage: 'lost', reason: 'price' }, A); eq(openEnr(db, 'op-L1').length, 0, 'A stopped');
  ok((await createEnrollment(db, bLead, enrollInput(), A)).ok, 'B can be enrolled once A no longer has one');
  await crm.setStage(db, 'op-L1', { stage: 'qualified' }, A); // reopen A: does NOT restart anything
  eq(openEnr(db, 'op-L1').length, 0, 'reopening does not restart A');
  await work.addAppointment(db, 'op-L1', { kind: 'phone_consultation', startsLocal: '2999-01-01T10:00' }, A);
  eq(openEnr(db, second.opportunityId).length, 1, 'booking A did not stop B'); eq(db.one("SELECT stage FROM opportunities WHERE id = ?", second.opportunityId).stage, 'new_inquiry', 'B stage untouched');
  await crm.setStage(db, second.opportunityId, { stage: 'won' }, A); ok(opp(db, 'op-L1').stage !== 'won', 'closing B did not close A');
});

await test('project details: validation, no address is inferred, budget can be "not yet discussed", edits are audited', async () => {
  const bad = (o) => crm.readOpportunityForm(form({ title: 'X', ...o })).code;
  eq(bad({ property_postal_code: 'nope' }), 'bad_postal'); eq(bad({ desired_start_date: '2026-13-40' }), 'bad_date'); eq(bad({ desired_start_date: '2026-10-10', target_completion_date: '2026-09-01' }), 'dates_order');
  eq(bad({ budget_status: 'stated' }), 'budget_needed'); eq(bad({ budget_status: 'stated', budget_min: '9', budget_max: '3' }), 'bad_budget'); eq(bad({ budget_currency: 'EUR' }), 'bad_currency'); eq(bad({ priority: 'urgent!!' }), 'bad_request');
  const v = crm.readOpportunityForm(form({ title: 'X', budget_status: 'stated', budget_min: '$25,000', budget_max: '40000', property_postal_code: 'm5v3a3' })).value;
  eq([v.budget_min, v.budget_max, v.property_postal_code, v.budget_currency], [25000, 40000, 'M5V 3A3', 'CAD']);
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db);
  eq(opp(db, 'op-L1').budget_status, 'not_discussed', 'default is not yet discussed'); eq(opp(db, 'op-L1').property_address, null);
  eq((await crm.updateOpportunity(db, 'op-L1', { ...crm.readOpportunityForm(form({ title: 'Kitchen', renovation_type: 'Kitchen', budget_status: 'stated', budget_max: '40000', priority: 'high', marketing_source: 'facebook' })).value }, A)).code, 'project_saved');
  const ev = JSON.parse(db.one("SELECT detail FROM crm_events WHERE kind='project_updated'").detail).changes; eq(ev.priority, ['normal', 'high']); eq(ev.budget_status, ['not_discussed', 'stated']);
  eq(db.one("SELECT project_details d FROM leads WHERE id='L1'").d, 'Original words <b>kept</b>', 'original text untouched');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[pipeline stages, qualification, reasons]');
await test('stage changes persist with an audit event and keep the older status in step; unknown stages are refused', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db);
  eq((await crm.setStage(db, 'op-L1', { stage: 'in_conversation' }, A)).code, 'stage_saved'); eq(opp(db, 'op-L1').stage, 'in_conversation'); eq(db.one("SELECT status s FROM leads WHERE id='L1'").s, 'contacted', 'legacy mirror');
  eq((await crm.setStage(db, 'op-L1', { stage: 'in_conversation' }, A)).code, 'no_change'); eq((await crm.setStage(db, 'op-L1', { stage: 'bogus' }, A)).code, 'bad_stage');
  const ev = db.one("SELECT summary, detail FROM crm_events WHERE kind='stage_changed'"); ok(/New inquiry to In conversation/.test(ev.summary), ev.summary); eq(JSON.parse(ev.detail).from, 'new_inquiry');
  await crm.setStage(db, 'op-L1', { stage: 'consultation_booked' }, A); eq(db.one("SELECT status s FROM leads WHERE id='L1'").s, 'assessment_booked');
});

await test('Lost needs a reason; On hold needs a reason AND a review date; "other" needs a note; Not-a-fit needs a reason', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db); const t = torontoToday();
  eq((await crm.setStage(db, 'op-L1', { stage: 'lost' }, A)).code, 'reason_required'); eq((await crm.setStage(db, 'op-L1', { stage: 'lost', reason: 'other' }, A)).code, 'note_required');
  eq((await crm.setStage(db, 'op-L1', { stage: 'on_hold', reason: 'seasonal' }, A)).code, 'hold_review_required'); eq((await crm.setStage(db, 'op-L1', { stage: 'on_hold', reason: 'seasonal', reviewOn: '2001-01-01' }, A)).code, 'hold_review_past');
  eq(opp(db, 'op-L1').stage, 'new_inquiry', 'nothing changed by the refusals');
  eq((await crm.setQualification(db, 'op-L1', { value: 'not_a_fit' }, A)).code, 'reason_required'); eq((await crm.setQualification(db, 'op-L1', { value: 'not_a_fit', reason: 'other' }, A)).code, 'note_required');
  ok((await crm.setStage(db, 'op-L1', { stage: 'on_hold', reason: 'seasonal', reviewOn: t }, A)).ok, 'valid hold'); const o = opp(db, 'op-L1'); eq([o.stage, o.stage_reason, o.hold_review_on, o.hold_from_stage], ['on_hold', 'seasonal', t, 'new_inquiry']);
  ok((await crm.setStage(db, 'op-L1', { stage: 'lost', reason: 'price', note: 'Went with a cheaper quote' }, A)).ok, 'valid lost'); const l = opp(db, 'op-L1'); eq([l.stage, l.stage_reason, l.hold_review_on], ['lost', 'price', null]);
});

await test('qualification is separate from the sales stage; Not a fit stops the follow-up emails but leaves the stage alone', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db); ok((await createEnrollment(db, 'L1', enrollInput(), A)).ok, 'enrolled');
  eq((await crm.setQualification(db, 'op-L1', { value: 'qualified' }, A)).code, 'qualification_saved'); eq([opp(db, 'op-L1').qualification, opp(db, 'op-L1').stage], ['qualified', 'new_inquiry']); eq(openEnr(db, 'op-L1').length, 1, 'qualified does not stop emails');
  ok((await crm.setQualification(db, 'op-L1', { value: 'not_a_fit', reason: 'outside_area' }, A)).ok, 'not a fit'); eq([opp(db, 'op-L1').qualification, opp(db, 'op-L1').qualification_reason, opp(db, 'op-L1').stage], ['not_a_fit', 'outside_area', 'new_inquiry']);
  eq(openEnr(db, 'op-L1').length, 0, 'emails stopped'); eq(db.one("SELECT stop_reason r FROM enrollments").r, 'not_a_fit');
  eq((await createEnrollment(db, 'L1', enrollInput(), A)).code, 'not_eligible_not_a_fit', 'cannot be re-enrolled');
});

await test('On hold PAUSES the emails; Resume returns to the previous stage and does NOT resume the emails; won / lost / booked / moved-on STOP them; nothing restarts on reopening or unarchiving', async () => {
  const db = await fresh(); for (const id of ['L1', 'L2', 'L3', 'L4']) seedLead(db, id, { email: `${id.toLowerCase()}@example.test` }); await crm.ensureCrmRecords(db);
  await createEnrollment(db, 'L1', enrollInput(), A);
  await crm.setStage(db, 'op-L1', { stage: 'in_conversation' }, A); await crm.setStage(db, 'op-L1', { stage: 'on_hold', reason: 'customer_asked', reviewOn: torontoToday() }, A);
  eq(openEnr(db, 'op-L1')[0].status, 'paused', 'paused'); eq((await createEnrollment(db, 'L1', enrollInput(), A)).code, 'already_enrolled');
  await crm.resumeFromHold(db, 'op-L1', A); eq(opp(db, 'op-L1').stage, 'in_conversation', 'back to where it was'); eq(openEnr(db, 'op-L1')[0].status, 'paused', 'the email sequence stays paused until a person resumes it');
  for (const [i, [id, stage, why]] of [['L2', 'won', 'won'], ['L3', 'consultation_booked', 'booked'], ['L4', 'referred', 'progressed']].entries()) {
    await createEnrollment(db, id, enrollInput(), A); await crm.setStage(db, `op-${id}`, { stage }, A);
    eq(db.one('SELECT status, stop_reason FROM enrollments WHERE lead_id = ?', id), { status: 'stopped', stop_reason: why }, `${stage} stops`); eq(db.one("SELECT COUNT(*) n FROM enrollment_steps s JOIN enrollments e ON e.id = s.enrollment_id WHERE e.lead_id = ? AND s.status IN ('planned','approved','queued')", id).n, 0, 'no pending steps');
  }
  await crm.setArchived(db, 'op-L1', true, A); eq(openEnr(db, 'op-L1').length, 0, 'archive stops'); await crm.setArchived(db, 'op-L1', false, A); eq(openEnr(db, 'op-L1').length, 0, 'restoring does not restart');
  eq(db.one("SELECT archived_at a FROM leads WHERE id='L1'").a, null, 'archive state kept in step on the submission');
});

await test('sales outcome and delivery status are separate: Won does not mean the work is done', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db);
  eq((await crm.setDeliveryStatus(db, 'op-L1', 'in_progress', A)).code, 'delivery_needs_won'); await crm.setStage(db, 'op-L1', { stage: 'won' }, A);
  eq(opp(db, 'op-L1').delivery_status, 'not_started', 'won does not imply started or completed'); eq((await crm.setDeliveryStatus(db, 'op-L1', 'completed', A)).code, 'delivery_saved'); eq(opp(db, 'op-L1').stage, 'won');
});

await test('assigning a contractor is an internal record: it sends nothing and creates no email job; the earlier assignment is kept in the history', async () => {
  const db = await fresh(); seedLead(db, 'L1'); db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay',?,?),('K2','Lee',?,?)", NOW(), NOW(), NOW(), NOW()); await crm.ensureCrmRecords(db);
  const jobs = db.one('SELECT COUNT(*) n FROM email_jobs').n; const sends = db.one('SELECT COUNT(*) n FROM followup_sends').n;
  eq((await crm.assignContractor(db, 'op-L1', 'K1', A)).code, 'contractor_saved'); await crm.assignContractor(db, 'op-L1', 'K2', A);
  eq(db.one('SELECT COUNT(*) n FROM email_jobs').n, jobs, 'no email job'); eq(db.one('SELECT COUNT(*) n FROM followup_sends').n, sends, 'no send'); eq(db.one("SELECT contractor_id c FROM leads WHERE id='L1'").c, 'K2', 'kept in step');
  const hist = db.rows("SELECT summary FROM crm_events WHERE kind='contractor_assigned' ORDER BY occurred_at, id"); eq(hist.length, 2); ok(/nothing was sent/.test(hist[0].summary) && /was Kay/.test(hist[1].summary), 'history names the previous contractor');
  eq((await crm.assignContractor(db, 'op-L1', 'nope; DROP TABLE leads', A)).code, 'bad_contractor');
});

await test('the test flag hides a record from lists and counts by default without deleting anything; it can be shown or unmarked', async () => {
  const db = await fresh(); seedLead(db, 'L1'); seedLead(db, 'L2'); await crm.ensureCrmRecords(db);
  await crm.setTestFlag(db, 'op-L2', true, A); eq(db.one("SELECT is_test t FROM contacts WHERE id='ct-L2'").t, 1, 'contact flagged too');
  const list = (qs) => q.listOpportunities(db, q.parseLeadFilters(new URL(`https://x.test/leads${qs}`)));
  eq((await list('')).total, 1); eq((await list('?test=all')).total, 2); eq((await list('?test=only')).total, 1); eq(db.one('SELECT COUNT(*) n FROM leads').n, 2, 'nothing deleted');
  eq((await q.summaryCounts(db)).total, 1, 'summary excludes test'); eq((await q.hiddenTestCount(db)), 1);
  await crm.setTestFlag(db, 'op-L2', false, A); eq((await list('')).total, 2);
});

// ------------------------------------------------------------------------------------------------
console.log('\n[tasks, calls, appointments]');
await test('tasks: types, priority, optional time, dedupe on double submit, complete once with a note, cancel, reschedule; contractor-only tasks work; assignee must be a staff email', async () => {
  const db = await fresh(); seedLead(db, 'L1'); db.run("INSERT INTO contractors (id, name, created_at, updated_at) VALUES ('K1','Kay',?,?)", NOW(), NOW()); await crm.ensureCrmRecords(db); const t = torontoToday();
  const v = work.readTaskForm(form({ type: 'quote_check', title: 'Ask about the quote', due_on: t, due_time: '14:30', priority: 'high', assigned_to: A }), [A]).value; eq([v.type, v.priority, v.assigned_to], ['quote_check', 'high', A]);
  eq(v.due_at, torontoInputToUtcIso(`${t}T14:30`), 'time stored as a UTC instant');
  eq(work.readTaskForm(form({ type: 'call', due_on: t, assigned_to: 'stranger@example.test' }), [A]).code, 'bad_assignee'); eq(work.readTaskForm(form({ type: 'nap', due_on: t }), [A]).code, 'bad_request'); eq(work.readTaskForm(form({ type: 'call', due_on: 'tomorrow' }), [A]).code, 'bad_date');
  eq(work.readTaskForm(form({ type: 'call', due_on: t }), [A]).value.title, 'Call', 'title defaults to the type');
  const first = await work.createTask(db, { opportunityId: 'op-L1' }, v, A); eq(first.code, 'task_saved'); eq((await work.createTask(db, { opportunityId: 'op-L1' }, v, A)).code, 'no_change', 'double submit');
  eq(db.one('SELECT COUNT(*) n FROM tasks').n, 1); eq(db.one('SELECT contact_id c FROM tasks').c, 'ct-L1', 'contact derived from the project');
  ok((await work.createTask(db, { contractorId: 'K1' }, work.readTaskForm(form({ type: 'contractor_check', due_on: t }), [A]).value, A)).ok, 'contractor-only task');
  eq((await work.createTask(db, {}, v, A)).code, 'bad_request', 'a task must link to something');
  eq((await work.completeTask(db, first.id, 'Spoke to them', A)).code, 'task_done'); eq((await work.completeTask(db, first.id, 'again', A)).code, 'no_change', 'completes once');
  eq(db.one('SELECT status, completion_note n, completed_by b FROM tasks WHERE id = ?', first.id), { status: 'done', n: 'Spoke to them', b: A });
  const other = (await work.createTask(db, { contactId: 'ct-L1' }, work.readTaskForm(form({ type: 'email', title: 'x', due_on: t }), [A]).value, A)).id;
  eq((await work.rescheduleTask(db, other, '2999-01-01', A)).code, 'task_rescheduled'); eq((await work.cancelTask(db, other, A)).code, 'task_cancelled'); eq((await work.rescheduleTask(db, other, '2999-02-02', A)).code, 'task_not_open');
});

await test('logging a call: outcome, direction and summary are recorded as a MANUAL entry; the first recorded contact time is kept; a next action becomes a task; the stage moves only if asked', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db);
  eq((await work.logCall(db, { opportunityId: 'op-L1' }, { outcome: 'busy-signal' }, A)).code, 'bad_request'); eq((await work.logCall(db, { opportunityId: 'op-L1' }, { outcome: 'connected', occurredLocal: '2999-01-01T10:00' }, A)).code, 'call_future');
  const r = await work.logCall(db, { opportunityId: 'op-L1' }, { outcome: 'no_answer', summary: 'Rang out', nextDue: '2999-01-02', nextTitle: 'Try again', moveStage: false }, A); eq(r.code, 'call_logged');
  eq(db.one("SELECT outcome, source, logged_by FROM call_logs").outcome, 'no_answer'); eq(db.one('SELECT source, type, title, due_on FROM tasks'), { source: 'call_log', type: 'call', title: 'Try again', due_on: '2999-01-02' });
  const o = opp(db, 'op-L1'); ok(o.first_contact_at && o.first_contact_at === o.last_contact_at, 'first = last after one call'); eq(o.stage, 'new_inquiry', 'stage unchanged when not asked');
  const first = o.first_contact_at; await new Promise((r2) => setTimeout(r2, 5));
  await work.logCall(db, { opportunityId: 'op-L1' }, { outcome: 'connected', summary: 'Talked', moveStage: true }, A);
  const o2 = opp(db, 'op-L1'); eq(o2.first_contact_at, first, 'first contact time is kept'); ok(o2.last_contact_at > first, 'last contact moves'); eq(o2.stage, 'in_conversation', 'moved because asked');
  const tl = await q.buildTimeline(db, { opportunityId: 'op-L1' }); const call = tl.find((i) => i.kind === 'call'); ok(call && call.provenance === 'manual' && /not treated as a call|Logged by staff/.test(call.note), 'shown as a staff entry');
});

await test('appointments: a recorded booking STOPS the unbooked-lead emails; cancelling or rescheduling never restarts them; the two kinds stay distinct; rescheduling is in the history', async () => {
  const db = await fresh(); seedLead(db, 'L1'); seedLead(db, 'L2'); await crm.ensureCrmRecords(db); await createEnrollment(db, 'L1', enrollInput(), A); await createEnrollment(db, 'L2', enrollInput(), A);
  eq((await work.addAppointment(db, 'op-L1', { kind: 'skype', startsLocal: '2999-01-01T10:00' }, A)).code, 'bad_request'); eq((await work.addAppointment(db, 'op-L1', { kind: 'phone_consultation', startsLocal: 'garbage' }, A)).code, 'bad_datetime');
  const a = await work.addAppointment(db, 'op-L1', { kind: 'phone_consultation', startsLocal: '2999-01-01T10:00', moveStage: true }, A); ok(a.ok, 'booked');
  eq(db.one('SELECT status, stop_reason FROM enrollments WHERE lead_id = ?', 'L1'), { status: 'stopped', stop_reason: 'booked' }); eq(openEnr(db, 'op-L2').length, 1, 'another project untouched'); eq(opp(db, 'op-L1').stage, 'consultation_booked');
  ok(db.one("SELECT assessment_at a FROM leads WHERE id='L1'").a, 'legacy booked marker kept in step for the email sender');
  eq((await work.rescheduleAppointment(db, a.id, '2999-01-05T11:00', A)).code, 'appointment_rescheduled'); ok(db.one("SELECT summary FROM crm_events WHERE kind='appointment_rescheduled'").summary.includes('rescheduled from'), 'history');
  eq((await work.setAppointmentStatus(db, a.id, 'cancelled', A)).code, 'appointment_cancelled'); eq(db.one("SELECT assessment_at a FROM leads WHERE id='L1'").a, null, 'marker cleared'); eq(openEnr(db, 'op-L1').length, 0, 'NOT restarted');
  eq((await work.setAppointmentStatus(db, a.id, 'completed', A)).code, 'no_change', 'a cancelled appointment cannot be completed'); eq((await work.rescheduleAppointment(db, a.id, '2999-02-01T10:00', A)).code, 'appointment_not_scheduled');
  await work.addAppointment(db, 'op-L2', { kind: 'onsite_assessment', startsLocal: '2999-03-01T09:00' }, A); eq(db.rows("SELECT kind FROM appointments ORDER BY kind").map((x) => x.kind), ['onsite_assessment', 'phone_consultation'], 'distinct kinds');
});

await test('communication permissions are an append-only ledger per person; withdrawing EMAIL permission stops open sequences and withdraws recorded follow-up consent', async () => {
  const db = await fresh(); seedLead(db, 'L1'); await crm.ensureCrmRecords(db); await createEnrollment(db, 'L1', enrollInput(), A);
  const rec = (o) => crm.recordPermission(db, 'ct-L1', { channel: 'email', status: 'granted', method: 'phone_verbal', givenOn: torontoToday(), evidence: 'Said yes on the call', ...o }, A);
  eq((await rec({ givenOn: '2999-01-01' })).code, 'consent_date'); eq((await rec({ evidence: 'no' })).code, 'consent_evidence'); eq((await rec({ channel: 'fax' })).code, 'bad_request');
  ok((await rec({})).ok, 'granted'); eq(openEnr(db, 'op-L1').length, 1, 'granting changes nothing'); ok((await rec({ status: 'withdrawn', evidence: 'Asked us to stop by phone' })).ok, 'withdrawn');
  eq(openEnr(db, 'op-L1').length, 0, 'sequence stopped'); eq(db.one('SELECT stop_reason r FROM enrollments').r, 'withdrawn'); ok(db.one('SELECT withdrawn_at w FROM consents').w, 'consent marked withdrawn');
  eq(db.one('SELECT COUNT(*) n FROM contact_permissions').n, 2, 'both records kept'); const b = await q.contactBundle(db, 'ct-L1'); eq(b.currentPermissions.email.status, 'withdrawn', 'newest wins');
});

await test('a suppression (unsubscribe / bounce) survives; a contact edit never lifts it', async () => {
  const db = await fresh(); seedLead(db, 'L1', { email: 'gone@example.test' }); await crm.ensureCrmRecords(db);
  db.run("INSERT INTO suppressions (email, reason, source, created_at) VALUES ('gone@example.test','unsubscribe','test',?)", NOW());
  await crm.updateContact(db, 'ct-L1', crm.readContactForm(form({ display_name: 'Renamed', email: 'gone@example.test', phone: '(416) 555-0100' })).value, A);
  eq((await createEnrollment(db, 'L1', enrollInput(), A)).code, 'not_eligible_unsubscribed'); eq((await q.contactBundle(db, 'ct-L1')).suppressions.length, 1, 'shown on the profile');
});

// ------------------------------------------------------------------------------------------------
console.log('\n[timeline, Today, dates]');
await test('the timeline tells staff entries, automatic entries and provider reports apart; "accepted by Resend" is never worded as delivered', async () => {
  const db = await fresh(); seedLead(db, 'L1', { source: 'assessment' }); await crm.ensureCrmRecords(db);
  db.run("INSERT INTO lead_notes (id, lead_id, body, author_email, created_at) VALUES ('n1','L1','Legacy note <i>x</i>',?,?)", A, NOW());
  db.run("INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES ('a1','L1','followup_stopped','Follow-up sequence stopped: Customer replied','customer',?),('a2','L1','followup_stopped','Stopped by resend','resend',?)", NOW(), NOW());
  await crm.addNote(db, 'op-L1', 'Called; will decide next week', A);
  await createEnrollment(db, 'L1', enrollInput(), A); db.run("INSERT INTO enrollment_steps SELECT 'sx', id, 9, 1, 'checkin', ?, ?, 'sent', ?, ?, 1, NULL, ?, NULL, ? FROM enrollments", NOW(), NOW(), NOW(), A, NOW(), NOW());
  const en = db.one('SELECT id FROM enrollments').id;
  db.run("INSERT INTO followup_sends (id, kind, enrollment_step_id, lead_id, to_email, idempotency_key, status, attempts, created_at, updated_at, delivered_at) VALUES ('fs1','followup','sx','L1','l1@example.test','k1','sent',1,?,?,?)", NOW(), NOW(), NOW());
  const tl = await q.buildTimeline(db, { opportunityId: 'op-L1' }); const by = (re) => tl.find((i) => re.test(`${i.title} ${i.body}`));
  eq(by(/Inquiry received/).provenance, 'system'); eq(by(/Called; will decide/).provenance, 'manual'); eq(by(/Legacy note/).provenance, 'manual');
  eq(by(/Stopped by resend/).provenance, 'provider'); eq(by(/Customer replied/).provenance, 'system');
  const conf = tl.find((i) => /Confirmation email accepted by Resend/.test(i.title)); ok(conf && /not verified/.test(conf.body) && conf.provenance === 'system', 'confirmation wording'); ok(!tl.some((i) => /Confirmation email.*delivered/.test(i.title)), 'no delivered claim without a report');
  const delivered = tl.find((i) => /delivery confirmed by Resend/.test(i.title)); ok(delivered && delivered.provenance === 'provider', 'delivery only from a provider report');
  ok(tl.every((v, i) => i === 0 || tl[i - 1].at >= v.at), 'newest first'); ok(!tl.some((i) => i.kind === 'note_added'), 'legacy duplicate of a note is not shown twice');
  const contactTl = await q.buildTimeline(db, { contactId: 'ct-L1' }); ok(contactTl.length >= tl.length - 1, 'contact page shows the same history'); void en;
});

await test('Today: new inquiries, overdue tasks, today\'s consultations, no-next-action, hold reviews, quiet leads, quotes, failed emails; thresholds are settings; test and archived records are left out', async () => {
  const db = await fresh(); const now = new Date('2026-10-14T15:00:00.000Z'); const hrs = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
  seedLead(db, 'N1', { created_at: hrs(30) }); seedLead(db, 'N2', { created_at: hrs(2) }); seedLead(db, 'Q1', { created_at: hrs(500), status: 'quote_sent' }); seedLead(db, 'C1', { created_at: hrs(500), status: 'contacted' });
  seedLead(db, 'T1', { created_at: hrs(30) }); seedLead(db, 'AR1', { created_at: hrs(30), archived: hrs(1) }); seedLead(db, 'H1', { created_at: hrs(400) }); seedLead(db, 'W1', { created_at: hrs(400) }); await crm.ensureCrmRecords(db);
  await crm.setTestFlag(db, 'op-T1', true, A);
  db.run("UPDATE opportunities SET stage = 'in_conversation', stage_needs_review = 0, updated_at = ? WHERE id = 'op-C1'", hrs(24 * 10)); db.run("UPDATE opportunities SET updated_at = ? WHERE id = 'op-Q1'", hrs(24 * 6));
  db.run("UPDATE opportunities SET stage = 'on_hold', hold_review_on = '2026-10-14', hold_from_stage = 'new_inquiry' WHERE id = 'op-H1'"); db.run("UPDATE opportunities SET stage = 'in_conversation', updated_at = ? WHERE id = 'op-W1'", hrs(1));
  db.run("INSERT INTO tasks (id, opportunity_id, contact_id, type, title, due_on, status, created_at, created_by, updated_at) VALUES ('t1','op-W1','ct-W1','call','Old call','2026-10-10','open',?, 'a', ?),('t2','op-W1','ct-W1','email','Today mail','2026-10-14','open',?, 'a', ?),('t3','op-T1','ct-T1','call','Test task','2026-10-01','open',?, 'a', ?)", NOW(), NOW(), NOW(), NOW(), NOW(), NOW());
  db.run("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, created_at, updated_at, last_error) VALUES ('jf','N2','internal','N2:internal','failed',5,?,?,'boom')", NOW(), NOW());
  const ap = torontoInputToUtcIso('2026-10-14T11:00'); db.run("INSERT INTO appointments (id, opportunity_id, contact_id, kind, starts_at, status, created_by, created_at, updated_at) VALUES ('ap1','op-W1','ct-W1','phone_consultation',?,'scheduled','a',?,?)", ap, NOW(), NOW());
  const d = await q.todayData(db, now); const ids = (rows) => rows.map((r) => r.id || r.opp_id).sort();
  eq(d.newInquiries.map((r) => [r.id, r.past_threshold]).sort(), [['op-N1', true], ['op-N2', false]], 'new inquiries, older than the threshold flagged'); ok(!ids(d.newInquiries).includes('op-T1') && !ids(d.newInquiries).includes('op-AR1'), 'test + archived left out');
  eq(d.testRecordsHidden, 1); eq(ids(d.overdueTasks), ['t1'], 'overdue task (the test project\'s is hidden)'); eq(ids(d.tasksToday), ['t2']); eq(d.consultations.map((c) => c.opp_id), ['op-W1'], 'consultation today (Toronto date)');
  eq(ids(d.needsStage), [], 'C1 was given a stage above'); eq(ids(d.holdReviews), ['op-H1']); eq(ids(d.quotesNeedFollowUp), ['op-Q1'], 'quote sent 6 days ago, threshold 5'); eq(ids(d.quiet), ['op-C1'], 'quiet for 10 days, threshold 7');
  ok(ids(d.noNextAction).includes('op-C1') && ids(d.noNextAction).includes('op-Q1') && !ids(d.noNextAction).includes('op-W1'), 'no-next-action list'); eq(d.failedEmails.map((f) => f.kind), ['confirmation'], 'failed email surfaced');
  const s = new URLSearchParams({ new_inquiry_hours: '1', stale_days: '30', quote_followup_days: '10' }); eq((await crm.saveCrmSettings(db, s, A)).code, 'settings_saved');
  const d2 = await q.todayData(db, now); eq(d2.newInquiries.map((r) => r.past_threshold), [true, true], 'threshold is a setting'); eq(ids(d2.quiet), [], 'stale threshold raised'); eq(ids(d2.quotesNeedFollowUp), []);
  eq((await crm.saveCrmSettings(db, new URLSearchParams({ new_inquiry_hours: '0', stale_days: '7', quote_followup_days: '5' }), A)).code, 'bad_setting');
});

await test('Toronto time across daylight-saving changes: entered local times round-trip, a time that does not exist is refused, and "today" follows the Toronto date', async () => {
  eq(torontoInputToUtcIso('2026-03-07T12:00'), '2026-03-07T17:00:00.000Z', 'EST (UTC-5)'); eq(torontoInputToUtcIso('2026-03-08T12:00'), '2026-03-08T16:00:00.000Z', 'EDT (UTC-4) after spring forward');
  eq(torontoInputToUtcIso('2026-03-08T02:30'), null, 'skipped hour'); ok(/12:00/.test(formatDateTime('2026-03-08T16:00:00.000Z')) && /12:00/.test(formatDateTime('2026-03-07T17:00:00.000Z')), 'both display as noon');
  eq(torontoInputToUtcIso('2026-11-01T12:00'), '2026-11-01T17:00:00.000Z', 'EST after fall back'); ok(/12:00/.test(formatDateTime('2026-11-01T17:00:00.000Z')));
  const db = await fresh(); seedLead(db, 'W1'); await crm.ensureCrmRecords(db);
  for (const [id, iso] of [['in', '2026-03-09T03:30:00.000Z'], ['out', '2026-03-09T04:00:00.000Z'], ['early', '2026-03-08T04:59:00.000Z']]) db.run("INSERT INTO appointments (id, opportunity_id, contact_id, kind, starts_at, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,'scheduled','a',?,?)", id, 'op-W1', 'ct-W1', 'phone_consultation', iso, NOW(), NOW());
  const d = await q.todayData(db, new Date('2026-03-08T18:00:00.000Z')); eq(d.today, '2026-03-08'); eq(d.consultations.map((c) => c.id).sort(), ['in'], 'the 23-hour day: 05:00Z to 04:00Z the next day');
  const fall = await q.todayData(db, new Date('2026-11-01T18:00:00.000Z')); eq(fall.today, '2026-11-01');
});

await test('the audit trail is append-only by construction: no code path updates or deletes crm_events or contact_permissions', async () => {
  const dir = new URL('../src/', import.meta.url); let seen = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    ok(!/(UPDATE|DELETE FROM)\s+(crm_events|contact_permissions)\b/i.test(src), `${f} must not modify the audit tables`);
    if (/INSERT INTO crm_events/.test(src)) seen++;
  }
  ok(seen >= 1, 'inserts exist');
});

console.log('');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
