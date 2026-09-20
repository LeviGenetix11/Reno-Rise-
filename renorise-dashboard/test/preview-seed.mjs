// Sample data for the local preview and the design check: made-up people only (example.test
// addresses), created through the REAL CRM modules so the screens show what the dashboard
// genuinely produces. Never touches production and contains no real customer information.

import { ShimDb } from '../../renorise-forms/test/d1-shim.mjs';
import * as crm from '../src/crm-db.js';
import * as work from '../src/crm-work.js';

/** db: a node:sqlite DatabaseSync on a freshly migrated (empty) local D1 file. */
export async function seedPreviewData(db) {
  const names = ['Priya Sharma', 'Marcus Johnson', 'Elena Rossi', 'David Chen', 'Aisha Khan', 'Tom Baker', 'Sofia Martins', 'James O’Neil', 'Nadia Petrova', 'Luca Bianchi', 'Grace Kim', 'Omar Haddad', '<b>Markup</b> Tester', 'Averyveryveryverylongsinglewordnamewithnobreakstotestwrapping'];
  const types = ['Kitchen remodel', 'Basement finishing', 'Bathroom renovation', 'Flooring', 'Home addition', 'Deck build'];
  const stages = ['new', 'new', 'contacted', 'contacted', 'assessment_booked', 'quote_sent', 'won', 'lost', 'new', 'contacted', 'new', 'quote_sent', 'new', 'new'];
  const cities = ['Toronto', 'Mississauga', 'Vaughan', 'Markham', 'Brampton'];
  const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const dateOffset = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO contractors (id, name, company, service_types, service_area, email, phone, created_at, updated_at) VALUES ('C1','Sam Builder','Sam Builds Inc','kitchens, basements','Peel','sam@example.test','(905) 555-0199','2026-09-01','2026-09-01')").run();
  names.forEach((n, i) => {
    const id = `L${String(i + 1).padStart(2, '0')}`;
    db.prepare("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status, contractor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, `k${i}`, isoDaysAgo(i + 1), n, `client${i + 1}@example.test`, `(416) 555-01${String(10 + i)}`, cities[i % 5], types[i % 6], 'Within 1-3 months', ['homepage', 'contact', 'assessment'][i % 3], stages[i], i === 3 ? 'failed' : 'sent', 'sent', i === 2 || i === 4 ? 'C1' : null);
  });
  db.prepare("INSERT INTO email_jobs (id, lead_id, email_type, idempotency_key, status, attempts, max_attempts, last_error, created_at, updated_at) VALUES ('J1','L04','customer','L04:customer','failed',5,5,'Resend rejected the email: simulated','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z')").run();
  for (const [lid, due, note] of [['L01', dateOffset(-3), 'Call back about the kitchen quote'], ['L03', dateOffset(-1), 'Send photos of the basement'], ['L02', dateOffset(0), 'Confirm measurement visit'], ['L05', dateOffset(2), 'Check permit question'], ['L06', dateOffset(6), 'Follow up on the quote']]) {
    db.prepare('INSERT INTO follow_ups (id, lead_id, due_on, note, created_at) VALUES (?,?,?,?,?)').run(`F-${lid}`, lid, due, note, '2026-09-10T12:00:00Z');
  }
  // CRM data through the real modules (same code the dashboard runs): stages, qualification, calls, appointments, tasks, permissions
  class FileDb extends ShimDb { constructor(handle) { super(); this.sqlite = handle; } }
  {
    const fdb = new FileDb(db); const A = 'admin@example.test';
    await crm.ensureCrmRecords(fdb);
    const form = (o) => ({ get: (k) => (o[k] === undefined ? null : o[k]) });
    const stageOf = { L01: 'contact_attempted', L02: 'in_conversation', L04: 'qualified', L05: 'consultation_booked', L06: 'contractor_matching', L07: 'won', L08: 'quote_sent', L09: 'referred', L10: 'quote_pending' };
    for (const [l, s] of Object.entries(stageOf)) await crm.setStage(fdb, `op-${l}`, { stage: s }, A);
    await crm.setStage(fdb, 'op-L11', { stage: 'on_hold', reason: 'seasonal', reviewOn: dateOffset(0) }, A);
    await crm.setStage(fdb, 'op-L12', { stage: 'lost', reason: 'price', note: 'Went with a cheaper quote' }, A);
    await crm.setQualification(fdb, 'op-L02', { value: 'qualified' }, A); await crm.setQualification(fdb, 'op-L13', { value: 'not_a_fit', reason: 'outside_area' }, A);
    await crm.updateOpportunity(fdb, 'op-L01', crm.readOpportunityForm(form({ title: 'Kitchen remodel', renovation_type: 'Kitchen remodel', property_city: 'Toronto', property_postal_code: 'M5V 3A3', scope: 'New cabinets, counters and lighting', budget_status: 'stated', budget_min: '25000', budget_max: '40000', priority: 'high', marketing_source: 'google_search', customer_reported_source: 'Saw a truck in the neighbourhood' })).value, A);
    await crm.addNote(fdb, 'op-L01', 'Wants to keep the existing layout. Prefers evening calls.', A);
    await work.logCall(fdb, { opportunityId: 'op-L01' }, { outcome: 'voicemail', summary: 'Left a message about the quote', nextTitle: 'Call back about the kitchen quote', nextDue: dateOffset(-2) }, A);
    await work.logCall(fdb, { opportunityId: 'op-L02' }, { outcome: 'connected', summary: 'Talked through scope and timing', nextTitle: 'Send photos', nextDue: dateOffset(0) }, A);
    await work.addAppointment(fdb, 'op-L05', { kind: 'phone_consultation', startsLocal: `${dateOffset(0)}T15:30` }, A);
    await work.addAppointment(fdb, 'op-L06', { kind: 'onsite_assessment', startsLocal: `${dateOffset(3)}T10:00` }, A);
    await work.createTask(fdb, { opportunityId: 'op-L08' }, work.readTaskForm(form({ type: 'quote_check', title: 'Ask whether the quote was received', due_on: dateOffset(-1) }), [A]).value, A);
    await work.createTask(fdb, { contactId: 'ct-L04' }, work.readTaskForm(form({ type: 'email', title: 'Send the checklist', due_on: dateOffset(1), priority: 'high' }), [A]).value, A);
    await work.createTask(fdb, { contractorId: 'C1' }, work.readTaskForm(form({ type: 'contractor_check', title: 'Confirm availability for next month', due_on: dateOffset(4) }), [A]).value, A);
    await crm.recordPermission(fdb, 'ct-L01', { channel: 'email', status: 'granted', method: 'phone_verbal', givenOn: dateOffset(-1), evidence: 'Agreed to emails on the call' }, A);
    await crm.updateContact(fdb, 'ct-L01', crm.readContactForm(form({ display_name: 'Priya Sharma', email: 'client1@example.test', phone: '(416) 555-0110', preferred_contact_method: 'phone', preferred_contact_time: 'weekday evenings', tags: 'repeat customer, referral', notes: 'Owns a semi in the east end.' })).value, A);
    db.prepare("UPDATE leads SET status = 'contacted' WHERE id = 'L03'").run(); db.prepare("UPDATE opportunities SET stage = NULL, stage_needs_review = 1, legacy_status = 'contacted' WHERE id = 'op-L03'").run();
    db.prepare("UPDATE opportunities SET stage_changed_at = ?, updated_at = ? WHERE id = 'op-L08'").run(isoDaysAgo(9), isoDaysAgo(9));
    const manual = await crm.createManualProject(fdb, { contactValue: crm.readContactForm(form({ display_name: 'Pat Caller', phone: '(647) 555-0142' })).value, projectValue: crm.readOpportunityForm(form({ title: '', renovation_type: 'Basement suite' })).value, channel: 'phone' }, A); void manual;
  }


  // Sample phone calls (made-up numbers; the recording id is fake, so playback shows the "not set up" message in the preview).
  const at = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
  const call = (o) => {
    const started = o.started || at(o.ago);
    db.prepare(
      `INSERT INTO calls (id, call_sid, from_number, from_norm, caller_withheld, to_number, started_at, ended_at, duration_seconds, parent_status, forward_status, forward_answered_at, screen_outcome, accepted_at, voicemail_offered_at,
        recording_sid, recording_status, recording_duration_seconds, recording_confirmed_at, outcome, hangup_stage, match_status, contact_id, disposition, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(o.id, 'CA' + o.id.padStart(32, '0'), o.withheld ? null : o.from, o.withheld ? null : o.from.replace(/\D/g, '').slice(-10), o.withheld ? 1 : 0, '+12895128112', started, new Date(Date.parse(started) + (o.secs || 30) * 1000).toISOString(), o.secs || 30, 'completed',
      o.forward || null, o.answered ? started : null, o.screen || null, o.accepted ? started : null, o.vm ? started : null, o.rec || null, o.recStatus || null, o.recSecs ?? null, o.recStatus === 'completed' ? started : null, o.outcome, o.stage || null,
      o.contact ? 'matched' : o.withheld ? 'withheld' : 'unmatched', o.contact || null, o.disposition || 'open', o.notes || null, started, started);
  };
  call({ id: '101', ago: 25, from: '+14165550110', outcome: 'voicemail', vm: true, rec: 'RE' + '1'.repeat(32), recStatus: 'completed', recSecs: 42, contact: 'ct-L01', secs: 70, forward: 'no-answer', notes: 'Asked about the kitchen quote.' });
  call({ id: '102', ago: 190, from: '+14165550188', outcome: 'missed', stage: 'ringing', secs: 14 });
  call({ id: '103', ago: 300, from: '+14165550111', outcome: 'accepted', accepted: true, answered: true, screen: 'accepted', forward: 'completed', contact: 'ct-L02', secs: 412 });
  call({ id: '104', ago: 600, withheld: true, from: '', outcome: 'no_message', stage: 'voicemail', vm: true, recStatus: 'absent', recSecs: 0, secs: 22 });
  call({ id: '105', ago: 1500, from: '+19055550177', outcome: 'missed', stage: 'screening', answered: true, forward: 'completed', secs: 9, disposition: 'spam' });
  db.prepare("INSERT INTO call_events (id, call_id, kind, summary, actor, created_at) VALUES ('e1','101','call_received','Call received','twilio',?),('e2','101','voicemail_confirmed','Voicemail recording confirmed by Twilio (42 seconds)','twilio',?),('e3','101','match','Matched to one existing contact by phone number','system',?)").run(at(25), at(24), at(24));
}
