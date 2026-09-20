// Consultation booking (Cal.com) tests: signature check, idempotency, ordering, matching, appointments,
// follow-up stopping, rescheduling, cancellation, multiple appointments, email link rules, health.
// Real modules, in-memory D1 with every migration, no network.
//
//   cd renorise-forms && node test/booking-tests.mjs

import { createHmac } from 'node:crypto';
import { freshDb } from './d1-shim.mjs';
import { verifyCalSignature, parseCalWebhook } from '../../renorise-shared/bookings.js';
import { receiveCalWebhook, applyCalEvent, ensureBookingRef, bookingLinkFor, bookingPreviewUrl, assignBookingToLead, dismissBooking, bookingHealth, linkPendingBookings, recomputeConsultationAt } from '../../renorise-shared/bookings-db.js';
import { stopReasonFor } from '../../renorise-shared/eligibility.js';
import { renderFollowup } from '../../renorise-shared/templates.js';
import { saveSetting, loadSettings } from '../../renorise-shared/followup-db.js';
import { createEnrollment } from '../../renorise-dashboard/src/seq-db.js';
import { ensureCrmRecords } from '../../renorise-dashboard/src/crm-db.js';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, pass: false, err }); console.log(`  FAIL  ${name}\n        ${err.stack?.split('\n').slice(0, 3).join('\n        ') || err.message}`); }
}
const eq = (a, b, l = 'value') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, l) => { if (!c) throw new Error(l); };

const SECRET = 'test-secret-not-real';
const sign = (body, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
const NOW = new Date('2026-09-21T15:00:00.000Z');

let n = 0;
function payload({ trigger = 'BOOKING_CREATED', createdAt = '2026-09-21T15:00:00.000Z', uid = 'bk1', start = '2026-09-23T14:00:00.000Z', end = '2026-09-23T14:15:00.000Z', email = 'sam@example.test', name = 'Sam Lee', phone = '+14165550100', ref, rescheduleUid, status = 'ACCEPTED', reason, note = 'Finish my basement', tz = 'America/Toronto' } = {}) {
  n++;
  const p = {
    type: 'consultation', title: 'Free Renovation Consultation', startTime: start, endTime: end, uid, bookingId: 1000 + n, status,
    organizer: { name: 'RenoRise', email: 'hello@renosrise.com', timeZone: 'America/Toronto' },
    attendees: [{ name, email, timeZone: tz }],
    responses: { name: { label: 'Name', value: name }, email: { label: 'Email', value: email }, attendeePhoneNumber: { label: 'Phone', value: phone }, notes: { label: 'Project', value: note } },
    metadata: ref ? { renorise_ref: ref } : {},
  };
  if (rescheduleUid) p.rescheduleUid = rescheduleUid;
  if (reason) p.cancellationReason = reason;
  return JSON.stringify({ triggerEvent: trigger, createdAt, payload: p });
}
const noShow = (uid, createdAt, flag = true) => JSON.stringify({ triggerEvent: 'BOOKING_NO_SHOW_UPDATED', createdAt, payload: { message: 'x', attendees: [{ email: 'sam@example.test', noShow: flag }], bookingUid: uid, bookingId: 1 } });

const send = (db, body, opts = {}) => receiveCalWebhook({ db, secret: opts.secret === undefined ? SECRET : opts.secret, rawBody: body, signature: opts.signature === undefined ? sign(body) : opts.signature, now: opts.now || NOW });

async function setup({ leads = [['L1', 'Sam Lee', 'sam@example.test', '(416) 555-0100']], enroll = true } = {}) {
  const db = freshDb();
  for (const [id, name, email, phone] of leads) {
    db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", id, `ik-${id}`, '2026-09-19T15:00:00.000Z', name, email, phone, 'Toronto', 'Basement', 'Just exploring', 'assessment', 'new', 'sent', 'sent');
  }
  await ensureCrmRecords(db);
  await saveSetting(db, 'business_legal_name', 'Test Renovations Inc.', 'test');
  await saveSetting(db, 'business_mailing_address', '100 Example Street, Toronto, ON M5V 0A0', 'test');
  if (enroll) {
    for (const [id] of leads) {
      const r = await createEnrollment(db, id, { sourceKind: 'website', confirmed: true, method: 'phone_verbal', givenOn: '2026-09-19', evidence: 'Customer said yes on the phone' }, 'admin@test', new Date('2026-09-19T16:00:00.000Z'));
      if (!r.ok) throw new Error(`enroll failed: ${r.code}`);
    }
  }
  return db;
}
const lead = (db, id) => db.one('SELECT * FROM leads WHERE id = ?', id);
const bookingRow = (db, uid) => db.one("SELECT * FROM bookings WHERE provider_uid = ?", uid);
const appts = (db) => db.rows("SELECT * FROM appointments WHERE source = 'calcom' ORDER BY created_at");
const openEnrollments = (db) => db.one("SELECT COUNT(*) n FROM enrollments WHERE status IN ('active','paused')").n;

// ---------------------------------------------------------------- signature

await test('signature: a correct HMAC-SHA256 of the raw body is accepted; tampering, wrong secret, missing or malformed headers are refused', async () => {
  const body = payload();
  ok(await verifyCalSignature({ body, signature: sign(body), secret: SECRET }), 'valid');
  ok(await verifyCalSignature({ body, signature: `sha256=${sign(body).toUpperCase()}`, secret: SECRET }), 'prefix + uppercase tolerated');
  ok(!(await verifyCalSignature({ body: body + ' ', signature: sign(body), secret: SECRET })), 'tampered body');
  ok(!(await verifyCalSignature({ body, signature: sign(body, 'other'), secret: SECRET })), 'wrong secret');
  ok(!(await verifyCalSignature({ body, signature: null, secret: SECRET })), 'missing header');
  ok(!(await verifyCalSignature({ body, signature: 'abc', secret: SECRET })), 'malformed header');
  ok(!(await verifyCalSignature({ body, signature: sign(body), secret: '' })), 'no secret configured');
});

await test('receiver: fails closed (503) without a secret, refuses bad signatures (401) and changes nothing', async () => {
  const db = await setup();
  const body = payload({ ref: null });
  eq((await send(db, body, { secret: '' })).status, 503, 'no secret');
  eq((await send(db, body, { signature: 'f'.repeat(64) })).status, 401, 'bad signature');
  eq((await send(db, body, { signature: null })).status, 401, 'missing signature');
  eq(db.one('SELECT COUNT(*) n FROM bookings').n, 0, 'nothing stored');
  ok(db.rows("SELECT outcome FROM booking_events").every((r) => ['rejected', 'not_configured'].includes(r.outcome)), 'attempts recorded for health');
});

await test('receiver: a malformed but correctly signed body is a 400 and is recorded as failed (and can be retried)', async () => {
  const db = await setup();
  const r = await send(db, '{not json');
  eq(r.status, 400);
  eq(db.one("SELECT outcome FROM booking_events").outcome, 'failed');
});

// ---------------------------------------------------------------- matching and effects

await test('a verified booking with a reference and the same email matches the inquiry, creates a phone-consultation appointment, sets consultation_at, and ends the follow-ups', async () => {
  const db = await setup();
  const ref = await ensureBookingRef(db, 'L1');
  eq(openEnrollments(db), 1, 'starts enrolled');
  const r = await send(db, payload({ ref }));
  eq(r.status, 200);
  const b = bookingRow(db, 'bk1');
  eq([b.status, b.match_status, b.match_method, b.lead_id], ['confirmed', 'matched', 'ref+email', 'L1']);
  eq([b.starts_at, b.ends_at, b.attendee_timezone], ['2026-09-23T14:00:00.000Z', '2026-09-23T14:15:00.000Z', 'America/Toronto'], 'UTC times and timezone stored');
  const a = appts(db);
  eq(a.length, 1);
  eq([a[0].kind, a[0].status, a[0].status_source, a[0].external_ref, a[0].starts_at], ['phone_consultation', 'scheduled', 'provider', 'bk1', '2026-09-23T14:00:00.000Z']);
  eq(lead(db, 'L1').consultation_at, '2026-09-23T14:00:00.000Z');
  eq(lead(db, 'L1').assessment_at, null, 'a phone consultation is not an on-site assessment');
  eq(openEnrollments(db), 0, 'follow-ups stopped');
  eq(db.one("SELECT stop_reason r FROM enrollments").r, 'booked');
  const act = db.rows("SELECT type FROM lead_activity WHERE lead_id = 'L1'").map((x) => x.type);
  ok(act.includes('consultation_booked') && act.includes('followup_stopped'), `activity history: ${act}`);
  ok(db.rows("SELECT kind, provenance FROM crm_events WHERE kind = 'appointment_scheduled'").every((e) => e.provenance === 'system'));
  eq(stopReasonFor({ lead: lead(db, 'L1'), consent: { withdrawn_at: null }, suppression: null }), 'booked', 'the sender refuses to send');
  eq(db.one('SELECT COUNT(*) n FROM consents WHERE withdrawn_at IS NULL').n, 1, 'no new consent was created by the booking');
});

await test('email-only matching: exactly one open project = matched; two open projects with the same email = ambiguous (staff decide, nothing changes); no inquiry = unmatched direct booking', async () => {
  const one = await setup();
  await send(one, payload());
  eq(bookingRow(one, 'bk1').match_method, 'email');
  eq(openEnrollments(one), 0);

  const two = await setup({ leads: [['L1', 'Sam Lee', 'sam@example.test', '(416) 555-0100'], ['L2', 'Sam Lee', 'SAM@example.test', '(416) 555-0100']], enroll: false });
  two.run("UPDATE leads SET contact_id = NULL, opportunity_id = NULL WHERE id = 'L2'"); // distinct projects
  await ensureCrmRecords(two);
  await send(two, payload());
  const b = bookingRow(two, 'bk1');
  eq([b.match_status, b.lead_id], ['ambiguous', null]);
  eq(appts(two).length, 0);
  eq(two.one('SELECT COUNT(*) n FROM leads WHERE consultation_at IS NOT NULL').n, 0, 'no lead touched');

  const none = await setup({ enroll: false });
  await send(none, payload({ email: 'stranger@example.test' }));
  eq(bookingRow(none, 'bk1').match_status, 'unmatched');
  eq(appts(none).length, 0);
  eq(none.one('SELECT COUNT(*) n FROM consents').n, 0, 'a direct booking is not consent');
});

await test('a reference is a hint, not proof: a valid reference with a different email AND phone is ambiguous and links nothing', async () => {
  const db = await setup();
  const ref = await ensureBookingRef(db, 'L1');
  await send(db, payload({ ref, email: 'someone.else@example.test', phone: '+16475559999' }));
  const b = bookingRow(db, 'bk1');
  eq([b.match_status, b.lead_id, b.opportunity_id], ['ambiguous', null, null]);
  eq(openEnrollments(db), 1, 'follow-ups untouched');
  eq(lead(db, 'L1').consultation_at, null);
  // same reference, but the phone agrees -> matched by ref+phone
  await send(db, payload({ uid: 'bk2', ref, email: 'other@example.test', phone: '(416) 555-0100' }));
  eq(bookingRow(db, 'bk2').match_method, 'ref+phone');
  // an unknown / malformed reference is ignored, never trusted
  const p = parseCalWebhook(payload({ ref: 'short' }));
  eq(p.event.booking.ref, null);
});

await test('the phone number, project note and timezone are stored from the booking form', async () => {
  const db = await setup({ enroll: false });
  await send(db, payload());
  const b = bookingRow(db, 'bk1');
  eq([b.attendee_phone, b.attendee_phone_norm, b.project_note, b.attendee_name], ['+14165550100', '4165550100', 'Finish my basement', 'Sam Lee']);
});

// ---------------------------------------------------------------- idempotency and ordering

await test('an identical redelivery is recognised as a duplicate and does nothing twice', async () => {
  const db = await setup();
  const body = payload();
  eq((await send(db, body)).body.duplicate, false);
  eq((await send(db, body)).body.duplicate, true);
  eq(db.one('SELECT COUNT(*) n FROM bookings').n, 1);
  eq(appts(db).length, 1);
  eq(db.one("SELECT COUNT(*) n FROM lead_activity WHERE type = 'consultation_booked'").n, 1, 'recorded once');
});

await test('out of order: a cancellation that arrives first, then a delayed (older) creation, leaves the booking cancelled', async () => {
  const db = await setup();
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', uid: 'bk9', createdAt: '2026-09-21T16:00:00.000Z', reason: 'changed my mind' }));
  eq(bookingRow(db, 'bk9').status, 'cancelled');
  const late = await send(db, payload({ trigger: 'BOOKING_CREATED', uid: 'bk9', createdAt: '2026-09-21T15:00:00.000Z' }));
  eq(late.body.outcome, 'stale');
  eq(bookingRow(db, 'bk9').status, 'cancelled', 'not revived');
  eq(appts(db).length, 0, 'no appointment for a cancelled booking');
  eq(openEnrollments(db), 1, 'follow-ups not stopped by a booking that never stood');
});

await test('an event older than the one already applied is ignored', async () => {
  const db = await setup();
  await send(db, payload({ uid: 'bk1', createdAt: '2026-09-21T16:00:00.000Z', start: '2026-09-24T14:00:00.000Z', end: '2026-09-24T14:15:00.000Z' }));
  const r = await send(db, payload({ uid: 'bk1', createdAt: '2026-09-21T15:00:00.000Z', start: '2026-09-23T14:00:00.000Z' }));
  eq(r.body.outcome, 'stale');
  eq(bookingRow(db, 'bk1').starts_at, '2026-09-24T14:00:00.000Z');
});

await test('a pending (awaiting confirmation) booking is recorded but does not stop follow-ups or create an appointment', async () => {
  const db = await setup();
  await send(db, payload({ trigger: 'BOOKING_REQUESTED', status: 'PENDING' }));
  eq(bookingRow(db, 'bk1').status, 'pending');
  eq(appts(db).length, 0);
  eq(openEnrollments(db), 1);
  await send(db, payload({ trigger: 'BOOKING_CREATED', createdAt: '2026-09-21T15:05:00.000Z' }));
  eq(bookingRow(db, 'bk1').status, 'confirmed');
  eq(openEnrollments(db), 0);
});

// ---------------------------------------------------------------- reschedule and cancel

await test('rescheduling moves the SAME appointment to the new booking; a late cancellation of the OLD booking cannot cancel the replacement', async () => {
  const db = await setup();
  await send(db, payload({ uid: 'old1' }));
  const apptId = appts(db)[0].id;
  const r = await send(db, payload({ trigger: 'BOOKING_RESCHEDULED', uid: 'new1', rescheduleUid: 'old1', createdAt: '2026-09-21T16:00:00.000Z', start: '2026-09-25T15:00:00.000Z', end: '2026-09-25T15:15:00.000Z' }));
  eq(r.status, 200);
  eq(bookingRow(db, 'old1').status, 'rescheduled');
  eq(bookingRow(db, 'old1').replaced_by_uid, 'new1');
  eq(bookingRow(db, 'new1').status, 'confirmed');
  const a = appts(db);
  eq(a.length, 1, 'still one appointment');
  eq([a[0].id, a[0].external_ref, a[0].starts_at, a[0].status], [apptId, 'new1', '2026-09-25T15:00:00.000Z', 'scheduled']);
  eq(lead(db, 'L1').consultation_at, '2026-09-25T15:00:00.000Z');
  // the provider also (late) reports the old booking as cancelled
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', uid: 'old1', createdAt: '2026-09-21T16:00:05.000Z', reason: 'rescheduled' }));
  eq(appts(db)[0].status, 'scheduled', 'replacement untouched');
  eq(bookingRow(db, 'old1').status, 'rescheduled', 'old booking stays rescheduled');
  eq(lead(db, 'L1').consultation_at, '2026-09-25T15:00:00.000Z');
  eq(db.one("SELECT COUNT(*) n FROM tasks WHERE source = 'calcom'").n, 0, 'no cancellation task for a reschedule');
});

await test('rescheduling events that arrive before the original booking event still end with one appointment at the new time', async () => {
  const db = await setup();
  await send(db, payload({ trigger: 'BOOKING_RESCHEDULED', uid: 'new2', rescheduleUid: 'old2', createdAt: '2026-09-21T16:00:00.000Z', start: '2026-09-26T15:00:00.000Z', end: '2026-09-26T15:15:00.000Z' }));
  const late = await send(db, payload({ uid: 'old2', createdAt: '2026-09-21T15:00:00.000Z' }));
  eq(late.body.outcome, 'stale');
  eq(bookingRow(db, 'old2').status, 'rescheduled');
  eq(appts(db).length, 1);
  eq(appts(db)[0].external_ref, 'new2');
});

await test('cancellation: cancels the appointment, clears consultation_at, creates a staff task, and NEVER restarts follow-ups', async () => {
  const db = await setup();
  await send(db, payload());
  eq(openEnrollments(db), 0);
  const r = await send(db, payload({ trigger: 'BOOKING_CANCELLED', createdAt: '2026-09-21T17:00:00.000Z', reason: 'no longer needed' }));
  eq(r.status, 200);
  eq(bookingRow(db, 'bk1').status, 'cancelled');
  eq(bookingRow(db, 'bk1').cancellation_reason, 'no longer needed');
  eq([appts(db)[0].status, appts(db)[0].status_source], ['cancelled', 'provider']);
  eq(lead(db, 'L1').consultation_at, null);
  eq(openEnrollments(db), 0, 'still stopped');
  const t = db.rows("SELECT type, status, source, title FROM tasks WHERE source = 'calcom'");
  eq(t.length, 1); eq([t[0].type, t[0].status], ['call', 'open']);
  // a repeat cancellation adds nothing
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', createdAt: '2026-09-21T17:00:00.000Z', reason: 'no longer needed', uid: 'bk1' }));
  eq(db.one("SELECT COUNT(*) n FROM tasks WHERE source = 'calcom'").n, 1);
});

await test('two consultations for one lead: cancelling one does not make the lead look unbooked while the other remains', async () => {
  const db = await setup();
  await send(db, payload({ uid: 'a1', start: '2026-09-23T14:00:00.000Z', end: '2026-09-23T14:15:00.000Z' }));
  await send(db, payload({ uid: 'a2', createdAt: '2026-09-21T15:10:00.000Z', start: '2026-09-28T14:00:00.000Z', end: '2026-09-28T14:15:00.000Z' }));
  eq(appts(db).length, 2);
  eq(lead(db, 'L1').consultation_at, '2026-09-23T14:00:00.000Z');
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', uid: 'a1', createdAt: '2026-09-21T18:00:00.000Z' }));
  eq(lead(db, 'L1').consultation_at, '2026-09-28T14:00:00.000Z', 'still booked');
  eq(stopReasonFor({ lead: lead(db, 'L1'), consent: { withdrawn_at: null }, suppression: null }), 'booked');
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', uid: 'a2', createdAt: '2026-09-21T18:05:00.000Z' }));
  eq(lead(db, 'L1').consultation_at, null, 'now unbooked, but nothing restarts automatically');
  eq(openEnrollments(db), 0);
});

await test('a staff outcome is never overwritten by the provider: a completed appointment stays completed after a later provider event', async () => {
  const db = await setup();
  await send(db, payload());
  db.run("UPDATE appointments SET status = 'completed', status_source = 'staff' WHERE source = 'calcom'");
  await send(db, payload({ trigger: 'BOOKING_CANCELLED', createdAt: '2026-09-21T19:00:00.000Z' }));
  eq(appts(db)[0].status, 'completed');
  await send(db, noShow('bk1', '2026-09-21T20:00:00.000Z'));
  eq(appts(db)[0].status, 'completed', 'a provider no-show flag is informational only');
});

await test('a provider no-show flag is recorded on the booking but never marks the appointment no-show by itself', async () => {
  const db = await setup();
  await send(db, payload());
  await send(db, noShow('bk1', '2026-09-23T14:20:00.000Z'));
  eq(bookingRow(db, 'bk1').provider_no_show, 1);
  eq(appts(db)[0].status, 'scheduled');
});

// ---------------------------------------------------------------- CRM linking

await test('a booking that arrives before the CRM project exists is kept, and linked later without losing the follow-up stop', async () => {
  const db = await setup({ enroll: false });
  db.run("INSERT INTO leads (id, idempotency_key, created_at, name, email, phone, city, renovation_type, project_timing, source, status, customer_email_status, internal_email_status) VALUES ('L9','ik9','2026-09-21T14:00:00.000Z','New Person','new@example.test','(647) 555-0111','Toronto','Basement','Just exploring','assessment','new','sent','sent')");
  // L9 has no contact/opportunity yet (the dashboard creates them lazily)
  await send(db, payload({ uid: 'bk5', email: 'new@example.test', phone: '+16475550111' }));
  eq(bookingRow(db, 'bk5').match_status, 'matched');
  eq(appts(db).length, 0, 'no CRM project yet');
  eq(lead(db, 'L9').consultation_at, '2026-09-23T14:00:00.000Z', 'but the sender-visible flag is already set');
  await ensureCrmRecords(db);
  const linked = await linkPendingBookings(db, NOW);
  eq(linked, 1);
  eq(appts(db).length, 1);
});

await test('staff can attach an ambiguous/unmatched booking to an inquiry (stops its follow-ups) or dismiss it', async () => {
  const db = await setup();
  await send(db, payload({ uid: 'bk7', email: 'different@example.test' }));
  eq(bookingRow(db, 'bk7').match_status, 'unmatched');
  const id = bookingRow(db, 'bk7').id;
  eq((await assignBookingToLead(db, id, 'L1', 'staff@test', NOW)).ok, true);
  const b = bookingRow(db, 'bk7');
  eq([b.match_status, b.match_method, b.lead_id], ['manual', 'staff', 'L1']);
  eq(appts(db).length, 1);
  eq(openEnrollments(db), 0);
  const db2 = await setup({ enroll: false });
  await send(db2, payload({ uid: 'bk8', email: 'spam@example.test' }));
  eq((await dismissBooking(db2, bookingRow(db2, 'bk8').id, 'staff@test', NOW)).ok, true);
  eq(bookingRow(db2, 'bk8').match_status, 'dismissed');
});

// ---------------------------------------------------------------- links in follow-up emails

await test('the booking link appears in follow-up emails only when set AND tested; it carries an opaque reference, never a lead id or contact details', async () => {
  const db = await setup({ enroll: false });
  const lead1 = lead(db, 'L1');
  let s = await loadSettings(db);
  eq(await bookingLinkFor(db, s, lead1), '', 'nothing configured');
  await saveSetting(db, 'booking_url', 'https://www.renosrise.com/book/', 'test');
  s = await loadSettings(db);
  eq(await bookingLinkFor(db, s, lead1), '', 'set but not tested yet');
  eq(bookingPreviewUrl(s), 'https://www.renosrise.com/book/', 'test emails can use the plain link');
  await saveSetting(db, 'booking_link_tested', '1', 'test');
  s = await loadSettings(db);
  const url = await bookingLinkFor(db, s, lead1);
  const u = new URL(url);
  eq(u.origin + u.pathname, 'https://www.renosrise.com/book/');
  const ref = u.searchParams.get('r');
  ok(/^[A-Za-z0-9_-]{20,64}$/.test(ref), 'opaque reference');
  ok(!url.includes('L1') && !url.includes('sam@') && !url.includes('4165550100'), 'no id or contact details in the URL');
  eq(await ensureBookingRef(db, 'L1'), ref, 'stable');
  await saveSetting(db, 'booking_url', 'http://insecure.example/', 'test');
  eq(await bookingLinkFor(db, await loadSettings(db), lead1), '', 'https only');
});

await test('email copy: unchanged without a link; with a link every template gains one link line and keeps the reply option, signature and unsubscribe footer', async () => {
  const base = { variant: 'website', name: 'Sam Lee', legalName: 'Test Renovations Inc.', mailingAddress: '100 Example Street, Toronto, ON M5V 0A0', unsubscribeUrl: 'https://renorise-forms.example.test/u/tok' };
  for (const key of ['checkin', 'questions', 'last']) {
    const plain = renderFollowup({ ...base, templateKey: key });
    const withLink = renderFollowup({ ...base, templateKey: key, bookingUrl: 'https://www.renosrise.com/book/?r=abc' });
    ok(!plain.text.includes('/book/') && !plain.html.includes('/book/'), `${key}: no link by default`);
    ok(withLink.text.includes('Or book a time that suits you: https://www.renosrise.com/book/?r=abc'), `${key}: text link`);
    ok(withLink.html.includes('Book Your Free Consultation'), `${key}: html button`);
    ok(/reply/i.test(withLink.text) && withLink.text.includes('The RenoRise Team') && withLink.text.includes('Unsubscribe from these follow-up emails') && withLink.text.includes('STOP'), `${key}: reply, signature, unsubscribe and STOP kept`);
    eq(withLink.bodySentences, plain.bodySentences, `${key}: approved sentences unchanged`);
    eq(withLink.headers, plain.headers, `${key}: one-click unsubscribe headers unchanged`);
  }
  ok(!renderFollowup({ ...base, templateKey: 'checkin', bookingUrl: 'javascript:alert(1)' }).text.includes('javascript'), 'non-https ignored');
});

// ---------------------------------------------------------------- health

await test('integration health: waiting -> ok -> needs review (unmatched) -> attention (failures, bad signatures, missing secret)', async () => {
  const db = await setup({ enroll: false });
  eq((await bookingHealth(db, NOW)).state, 'waiting');
  await send(db, payload());
  eq((await bookingHealth(db, NOW)).state, 'ok');
  await send(db, payload({ uid: 'u2', email: 'x@example.test' }));
  const h = await bookingHealth(db, NOW);
  eq([h.state, h.unmatched], ['review', 1]);
  await send(db, payload({ uid: 'u3' }), { signature: 'e'.repeat(64) });
  eq((await bookingHealth(db, NOW)).state, 'attention');
  ok((await bookingHealth(db, NOW)).notes.some((x) => /bad signature/.test(x)));
  const db2 = await setup({ enroll: false });
  await send(db2, payload(), { secret: '' });
  ok((await bookingHealth(db2, NOW)).notes.some((x) => /secret is not configured/.test(x)));
});

await test('a processing error is recorded and the same body is processed again on a provider retry (not swallowed as a duplicate)', async () => {
  const db = await setup();
  const body = payload();
  const real = db.prepare.bind(db);
  let boom = true;
  db.prepare = (sql) => { if (boom && /INSERT INTO bookings/.test(sql)) throw new Error('simulated outage'); return real(sql); };
  const first = await send(db, body);
  eq(first.status, 500);
  boom = false;
  const retry = await send(db, body);
  eq(retry.status, 200);
  eq(bookingRow(db, 'bk1').status, 'confirmed');
  ok(db.rows("SELECT outcome FROM booking_events").some((e) => e.outcome === 'failed'), 'failure kept for the health panel');
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
