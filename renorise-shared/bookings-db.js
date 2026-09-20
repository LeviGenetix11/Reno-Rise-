// Cal.com booking persistence and its effects on leads, appointments and follow-ups.
// Used by the public forms Worker (webhook receiver, cron linking) and by the private dashboard
// (reconciliation, health, settings). All statements are prepared with bound parameters. Nothing here sends a message.
//
// What a verified booking event does:
//   * `bookings` mirrors the provider's view (one row per provider booking uid, matched or not).
//   * If the booking is reliably matched to an inquiry it becomes / updates a CRM `appointments` row
//     (kind phone_consultation, source calcom) and leads.consultation_at, which the follow-up sender checks before
//     every send; the project's open follow-up enrollments are stopped and the actions are written to the activity history.
//   * A cancellation never restarts follow-ups. It cancels the appointment and creates a staff task instead.
//   * Rescheduling moves the existing appointment to the new booking uid, so a late event about the OLD uid cannot
//     touch the replacement.
//   * Events are idempotent (exact-body key) and ordered (older-than-applied events are ignored).
//   * A booking alone is NOT marketing consent: nothing here creates a consent or enrols anyone.

import { normalizeEmail, normalizePhone } from './normalize.js';
import { verifyCalSignature, sha256Hex, parseCalWebhook, statusForEvent, TERMINAL } from './bookings.js';
import { stopEnrollmentsForOpportunity, stopEnrollmentsForLead } from './followup-db.js';
import { formatDateTime, torontoToday } from './time.js';

const newId = () => crypto.randomUUID();
const nowIsoOf = (now) => (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
const MAX_BODY = 200_000;
const ACTOR = 'cal.com';

// ------------------------------------------------------------------ lead references

/** 24 URL-safe characters (144 bits): opaque, unguessable, carries no lead data. */
export function newBookingRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The lead's booking reference, creating one on first use. */
export async function ensureBookingRef(db, leadId) {
  const cur = await db.prepare('SELECT booking_ref FROM leads WHERE id = ?').bind(leadId).first();
  if (!cur) return null;
  if (cur.booking_ref) return cur.booking_ref;
  for (let i = 0; i < 3; i++) {
    const ref = newBookingRef();
    try {
      await db.prepare('UPDATE leads SET booking_ref = ? WHERE id = ? AND booking_ref IS NULL').bind(ref, leadId).run();
    } catch {
      continue; // unique collision (astronomically unlikely): try another
    }
    const after = await db.prepare('SELECT booking_ref FROM leads WHERE id = ?').bind(leadId).first();
    if (after && after.booking_ref) return after.booking_ref;
  }
  return null;
}

// ------------------------------------------------------------------ matching

async function leadRow(db, where, ...params) {
  return db.prepare(`SELECT id, name, email, phone, contact_id, opportunity_id, archived_at, created_at FROM leads WHERE ${where}`).bind(...params).first();
}

/**
 * Decides which inquiry (if any) a booking belongs to. Conservative on purpose:
 *   ref + same email        -> matched (ref+email)
 *   ref + same phone        -> matched (ref+phone)
 *   ref but neither agrees  -> ambiguous (a reference alone is a hint, not proof of identity)
 *   no ref: exactly one open project has this exact normalised email -> matched (email)
 *   no ref: several projects share it -> ambiguous (staff decide)
 *   nothing found (a direct booking) -> unmatched
 */
export async function matchBooking(db, b) {
  if (b.lead_ref) {
    const lead = await leadRow(db, 'booking_ref = ?', b.lead_ref);
    if (lead) {
      const emailOk = b.attendee_email_norm && normalizeEmail(lead.email) === b.attendee_email_norm;
      const phoneOk = b.attendee_phone_norm && normalizePhone(lead.phone) === b.attendee_phone_norm;
      if (emailOk) return { status: 'matched', method: 'ref+email', lead };
      if (phoneOk) return { status: 'matched', method: 'ref+phone', lead };
      return { status: 'ambiguous', method: null, note: 'The booking link reference points to an inquiry, but the email and phone on the booking do not match it.', candidates: [lead.id] };
    }
  }
  if (!b.attendee_email_norm) return { status: 'unmatched', method: null, note: 'No usable email on the booking.' };
  const rows =
    (
      await db
        .prepare('SELECT id, name, email, phone, contact_id, opportunity_id, archived_at, created_at FROM leads WHERE lower(email) = ? AND archived_at IS NULL ORDER BY created_at DESC')
        .bind(b.attendee_email_norm)
        .all()
    ).results || [];
  if (!rows.length) return { status: 'unmatched', method: null, note: 'No inquiry uses this email address.' };
  const groups = new Map();
  for (const l of rows) {
    const key = l.opportunity_id || `lead:${l.id}`;
    if (!groups.has(key)) groups.set(key, l); // newest submission for that project
  }
  if (groups.size === 1) return { status: 'matched', method: 'email', lead: [...groups.values()][0] };
  return { status: 'ambiguous', method: null, note: `${groups.size} open inquiries use this email address.`, candidates: [...groups.values()].map((l) => l.id) };
}

// ------------------------------------------------------------------ helpers

const getBooking = (db, uid) => db.prepare("SELECT * FROM bookings WHERE provider = 'calcom' AND provider_uid = ?").bind(uid).first();

function crmEventStmt(db, { contactId, opportunityId, kind, summary, detail, at }) {
  const now = at || new Date().toISOString();
  return db
    .prepare('INSERT INTO crm_events (id, contact_id, opportunity_id, kind, summary, detail, provenance, actor, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId(), contactId, opportunityId || null, kind, summary, detail ? JSON.stringify(detail) : null, 'system', ACTOR, now, now);
}

const activityStmt = (db, leadId, type, summary, at) =>
  db.prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), leadId, type, summary, ACTOR, at || new Date().toISOString());

/** leads.consultation_at = earliest still-scheduled phone consultation, from bookings and CRM appointments. */
export async function recomputeConsultationAt(db, leadId, now = new Date()) {
  await db
    .prepare(
      `UPDATE leads SET consultation_at = (
         SELECT MIN(x) FROM (
           SELECT MIN(b.starts_at) AS x FROM bookings b
             WHERE b.kind = 'phone_consultation' AND b.status = 'confirmed' AND b.match_status IN ('matched', 'manual')
               AND (b.lead_id = leads.id OR (leads.opportunity_id IS NOT NULL AND b.opportunity_id = leads.opportunity_id))
           UNION ALL
           SELECT MIN(a.starts_at) FROM appointments a
             WHERE leads.opportunity_id IS NOT NULL AND a.opportunity_id = leads.opportunity_id AND a.kind = 'phone_consultation' AND a.status = 'scheduled'
         )), updated_at = ?
       WHERE id = ? OR (opportunity_id IS NOT NULL AND opportunity_id = (SELECT opportunity_id FROM leads WHERE id = ?))`
    )
    .bind(nowIsoOf(now), leadId, leadId)
    .run();
}

/** Sets a booking's match and copies the lead's CRM ids (which may still be null until the dashboard creates them). */
async function saveMatch(db, bookingId, m, now) {
  const at = nowIsoOf(now);
  if (m.lead) {
    await db
      .prepare('UPDATE bookings SET match_status = ?, match_method = ?, match_note = NULL, lead_id = ?, contact_id = ?, opportunity_id = ?, updated_at = ? WHERE id = ?')
      .bind(m.manual ? 'manual' : 'matched', m.method, m.lead.id, m.lead.contact_id || null, m.lead.opportunity_id || null, at, bookingId)
      .run();
  } else {
    const note = m.candidates ? `${m.note} (candidates: ${m.candidates.join(', ')})` : m.note || null;
    await db.prepare('UPDATE bookings SET match_status = ?, match_method = NULL, match_note = ?, updated_at = ? WHERE id = ?').bind(m.status, note, at, bookingId).run();
  }
}

// ------------------------------------------------------------------ appointments

async function summarize(b) {
  return `${formatDateTime(b.starts_at)} (Toronto time)`;
}

/**
 * Brings the CRM appointment in line with a matched booking. Idempotent.
 * Returns { changed: boolean, kind: 'created'|'moved'|'cancelled'|null }.
 */
export async function syncBookingToCrm(db, booking, now = new Date()) {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(booking.id).first();
  if (!b || !['matched', 'manual'].includes(b.match_status) || !b.lead_id) return { changed: false, kind: null };
  const lead = await db.prepare('SELECT id, contact_id, opportunity_id FROM leads WHERE id = ?').bind(b.lead_id).first();
  const contactId = b.contact_id || (lead && lead.contact_id);
  const oppId = b.opportunity_id || (lead && lead.opportunity_id);
  if (contactId !== b.contact_id || oppId !== b.opportunity_id) {
    await db.prepare('UPDATE bookings SET contact_id = ?, opportunity_id = ? WHERE id = ?').bind(contactId || null, oppId || null, b.id).run();
  }
  if (!contactId || !oppId) return { changed: false, kind: null }; // no CRM project yet; linkPendingBookings retries

  const at = nowIsoOf(now);
  const apptByUid = await db.prepare("SELECT * FROM appointments WHERE source = 'calcom' AND external_ref = ?").bind(b.provider_uid).first();

  // ---- cancelled / rejected: cancel the appointment that points at THIS uid (a moved appointment points elsewhere)
  if (b.status === 'cancelled' || b.status === 'rejected') {
    if (apptByUid && apptByUid.status === 'scheduled') {
      await db.batch([
        db.prepare("UPDATE appointments SET status = 'cancelled', status_source = 'provider', updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(at, apptByUid.id),
        crmEventStmt(db, {
          contactId, opportunityId: oppId, kind: 'appointment_cancelled', at,
          summary: `Phone consultation on ${formatDateTime(apptByUid.starts_at)} was ${b.status === 'rejected' ? 'declined' : 'cancelled'} in Cal.com. Follow-up emails are not restarted automatically.`,
          detail: { appointment_id: apptByUid.id, source: 'calcom' },
        }),
        activityStmt(db, b.lead_id, 'consultation_cancelled', `Phone consultation on ${formatDateTime(apptByUid.starts_at)} ${b.status === 'rejected' ? 'declined' : 'cancelled'} (Cal.com). Follow-ups were not restarted.`, at),
      ]);
      const open = await db.prepare("SELECT 1 AS x FROM tasks WHERE opportunity_id = ? AND source = 'calcom' AND status = 'open' LIMIT 1").bind(oppId).first();
      if (!open) {
        await db
          .prepare("INSERT INTO tasks (id, contact_id, opportunity_id, type, title, due_on, priority, status, source, created_at, created_by, updated_at) VALUES (?, ?, ?, 'call', ?, ?, 'normal', 'open', 'calcom', ?, ?, ?)")
          .bind(newId(), contactId, oppId, 'Consultation cancelled: decide whether to follow up', torontoToday(new Date(at)), at, ACTOR, at)
          .run();
      }
      return { changed: true, kind: 'cancelled' };
    }
    return { changed: false, kind: null };
  }

  if (b.status !== 'confirmed') return { changed: false, kind: null }; // pending / rescheduled: no appointment change

  // ---- confirmed. First choice: the appointment already pointing at this uid.
  if (apptByUid) {
    if (apptByUid.status !== 'scheduled') return { changed: false, kind: null }; // staff already recorded an outcome; do not revive
    if (apptByUid.starts_at === b.starts_at && apptByUid.ends_at === b.ends_at) {
      if (b.appointment_id !== apptByUid.id) await db.prepare('UPDATE bookings SET appointment_id = ? WHERE id = ?').bind(apptByUid.id, b.id).run();
      return { changed: false, kind: null };
    }
    await db.batch([
      db.prepare("UPDATE appointments SET starts_at = ?, ends_at = ?, timezone = ?, booking_id = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(b.starts_at, b.ends_at, b.attendee_timezone, b.id, at, apptByUid.id),
      db.prepare('UPDATE bookings SET appointment_id = ? WHERE id = ?').bind(apptByUid.id, b.id),
    ]);
    return { changed: true, kind: 'moved' };
  }
  // Second choice: a rescheduled booking takes over the appointment of the booking it replaced.
  if (b.rescheduled_from_uid) {
    const old = await db.prepare("SELECT * FROM appointments WHERE source = 'calcom' AND external_ref = ?").bind(b.rescheduled_from_uid).first();
    if (old && old.status === 'scheduled') {
      await db.batch([
        db.prepare("UPDATE appointments SET external_ref = ?, starts_at = ?, ends_at = ?, timezone = ?, booking_id = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(b.provider_uid, b.starts_at, b.ends_at, b.attendee_timezone, b.id, at, old.id),
        db.prepare('UPDATE bookings SET appointment_id = ? WHERE id = ?').bind(old.id, b.id),
        crmEventStmt(db, {
          contactId, opportunityId: oppId, kind: 'appointment_rescheduled', at,
          summary: `Phone consultation rescheduled from ${formatDateTime(old.starts_at)} to ${formatDateTime(b.starts_at)} (Toronto time) in Cal.com`,
          detail: { appointment_id: old.id, from: old.starts_at, to: b.starts_at, source: 'calcom' },
        }),
        activityStmt(db, b.lead_id, 'consultation_rescheduled', `Phone consultation rescheduled to ${formatDateTime(b.starts_at)} (Toronto time) via Cal.com.`, at),
      ]);
      return { changed: true, kind: 'moved' };
    }
  }
  // Otherwise a new appointment.
  const apptId = newId();
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO appointments (id, opportunity_id, contact_id, kind, starts_at, ends_at, timezone, status, source, external_ref, booking_id, status_source, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, 'phone_consultation', ?, ?, ?, 'scheduled', 'calcom', ?, ?, 'provider', NULL, ?, ?, ?)"
      )
      .bind(apptId, oppId, contactId, b.starts_at, b.ends_at, b.attendee_timezone, b.provider_uid, b.id, ACTOR, at, at),
    crmEventStmt(db, {
      contactId, opportunityId: oppId, kind: 'appointment_scheduled', at,
      summary: `Phone consultation booked in Cal.com for ${await summarize(b)}`,
      detail: { kind: 'phone_consultation', starts_at: b.starts_at, source: 'calcom' },
    }),
    activityStmt(db, b.lead_id, 'consultation_booked', `Phone consultation booked for ${formatDateTime(b.starts_at)} (Toronto time) via Cal.com.`, at),
  ]);
  const created = await db.prepare("SELECT id FROM appointments WHERE source = 'calcom' AND external_ref = ?").bind(b.provider_uid).first();
  if (created) await db.prepare('UPDATE bookings SET appointment_id = ? WHERE id = ?').bind(created.id, b.id).run();
  return { changed: true, kind: 'created' };
}

/** After a confirmed matched booking: the person is no longer an "unbooked lead", so their automatic follow-ups end. */
async function stopFollowupsFor(db, b) {
  let n = 0;
  if (b.opportunity_id) n += await stopEnrollmentsForOpportunity(db, b.opportunity_id, 'booked', ACTOR);
  if (b.lead_id) n += await stopEnrollmentsForLead(db, b.lead_id, 'booked', ACTOR);
  return n;
}

/** Retries CRM linking for matched bookings whose lead had no CRM project yet, and re-derives consultation_at. */
export async function linkPendingBookings(db, now = new Date()) {
  const rows =
    (
      await db
        .prepare("SELECT id, lead_id FROM bookings WHERE match_status IN ('matched', 'manual') AND lead_id IS NOT NULL AND status IN ('confirmed', 'cancelled', 'rejected') AND appointment_id IS NULL ORDER BY updated_at LIMIT 50")
        .all()
    ).results || [];
  let linked = 0;
  for (const r of rows) {
    const res = await syncBookingToCrm(db, { id: r.id }, now);
    if (res.changed) linked++;
    await recomputeConsultationAt(db, r.lead_id, now);
  }
  return linked;
}

// ------------------------------------------------------------------ applying one verified event

function fieldsFrom(booking) {
  return {
    starts_at: booking.startsAt,
    ends_at: booking.endsAt,
    attendee_timezone: booking.attendeeTimezone,
    organizer_timezone: booking.organizerTimezone,
    attendee_name: booking.name,
    attendee_email: booking.email,
    attendee_email_norm: booking.emailNorm,
    attendee_phone: booking.phone,
    attendee_phone_norm: booking.phoneNorm,
    project_note: booking.note,
    lead_ref: booking.ref,
    event_type_slug: booking.eventTypeSlug,
  };
}

/**
 * Applies one parsed, signature-verified event. Returns { outcome: 'applied'|'stale'|'ignored', ... }.
 * Safe to call again with the same event.
 */
export async function applyCalEvent(db, event, now = new Date()) {
  if (event.ignored) return { outcome: 'ignored' };
  const at = nowIsoOf(now);

  // ---- attendee no-show flag (informational; staff still record the real outcome)
  if (event.trigger === 'BOOKING_NO_SHOW_UPDATED') {
    const cur = await getBooking(db, event.uid);
    if (!cur) return { outcome: 'ignored' };
    if (event.eventAt < cur.last_event_at) return { outcome: 'stale' };
    await db.prepare('UPDATE bookings SET provider_no_show = ?, last_event_at = ?, last_trigger = ?, updated_at = ? WHERE id = ?').bind(event.noShow ? 1 : 0, event.eventAt, event.trigger, at, cur.id).run();
    if (event.noShow && cur.lead_id && cur.contact_id) {
      await db.batch([
        crmEventStmt(db, { contactId: cur.contact_id, opportunityId: cur.opportunity_id, kind: 'appointment_provider_no_show', at, summary: `Cal.com reports the attendee did not show for the ${formatDateTime(cur.starts_at)} consultation. Record the outcome if that is right.`, detail: { booking_id: cur.id } }),
      ]);
    }
    return { outcome: 'applied' };
  }

  const bk = event.booking;
  const wanted = statusForEvent(event);
  const existing = await getBooking(db, event.uid);

  if (existing) {
    if (event.eventAt < existing.last_event_at) return { outcome: 'stale' };
    // A finished booking cannot be revived by a later "created/requested/rescheduled" for the same uid.
    if (TERMINAL.includes(existing.status) && wanted !== existing.status) {
      await db.prepare('UPDATE bookings SET last_event_at = ?, updated_at = ? WHERE id = ? AND last_event_at < ?').bind(event.eventAt, at, existing.id, event.eventAt).run();
      return { outcome: 'stale' };
    }
  }

  const f = fieldsFrom(bk);
  let id;
  if (!existing) {
    id = newId();
    await db
      .prepare(
        `INSERT INTO bookings (id, provider, provider_uid, kind, status, starts_at, ends_at, attendee_timezone, organizer_timezone, attendee_name, attendee_email, attendee_email_norm,
           attendee_phone, attendee_phone_norm, project_note, lead_ref, match_status, rescheduled_from_uid, cancellation_reason, event_type_slug, provider_created_at, last_event_at, last_trigger, created_at, updated_at)
         VALUES (?, 'calcom', ?, 'phone_consultation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, event.uid, wanted, f.starts_at, f.ends_at, f.attendee_timezone, f.organizer_timezone, f.attendee_name, f.attendee_email, f.attendee_email_norm, f.attendee_phone, f.attendee_phone_norm, f.project_note, f.lead_ref,
        bk.rescheduleUid || null, bk.cancellationReason, f.event_type_slug, event.eventAt, event.eventAt, event.trigger, at, at)
      .run();
  } else {
    id = existing.id;
    await db
      .prepare(
        `UPDATE bookings SET status = ?, starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), attendee_timezone = COALESCE(?, attendee_timezone), organizer_timezone = COALESCE(?, organizer_timezone),
           attendee_name = COALESCE(?, attendee_name), attendee_email = COALESCE(?, attendee_email), attendee_email_norm = COALESCE(?, attendee_email_norm), attendee_phone = COALESCE(?, attendee_phone),
           attendee_phone_norm = COALESCE(?, attendee_phone_norm), project_note = COALESCE(?, project_note), lead_ref = COALESCE(lead_ref, ?), rescheduled_from_uid = COALESCE(rescheduled_from_uid, ?),
           cancellation_reason = COALESCE(?, cancellation_reason), event_type_slug = COALESCE(?, event_type_slug), last_event_at = ?, last_trigger = ?, updated_at = ? WHERE id = ?`
      )
      .bind(wanted, f.starts_at, f.ends_at, f.attendee_timezone, f.organizer_timezone, f.attendee_name, f.attendee_email, f.attendee_email_norm, f.attendee_phone, f.attendee_phone_norm, f.project_note, f.lead_ref,
        bk.rescheduleUid || null, bk.cancellationReason, f.event_type_slug, event.eventAt, event.trigger, at, id)
      .run();
  }

  // ---- rescheduling: the old booking is superseded by this one (created as a placeholder if its own events are late)
  let oldRow = null;
  if (event.trigger === 'BOOKING_RESCHEDULED' && bk.rescheduleUid) {
    oldRow = await getBooking(db, bk.rescheduleUid);
    if (!oldRow) {
      const oldId = newId();
      await db
        .prepare(
          "INSERT INTO bookings (id, provider, provider_uid, kind, status, match_status, replaced_by_uid, last_event_at, last_trigger, created_at, updated_at) VALUES (?, 'calcom', ?, 'phone_consultation', 'rescheduled', 'unmatched', ?, ?, ?, ?, ?)"
        )
        .bind(oldId, bk.rescheduleUid, event.uid, event.eventAt, event.trigger, at, at)
        .run();
      oldRow = await getBooking(db, bk.rescheduleUid);
    } else if (oldRow.status !== 'rescheduled') {
      await db.prepare("UPDATE bookings SET status = 'rescheduled', replaced_by_uid = ?, last_event_at = MAX(last_event_at, ?), updated_at = ? WHERE id = ?").bind(event.uid, event.eventAt, at, oldRow.id).run();
    }
  }

  // ---- matching (skipped once a person or staff member has settled it)
  let booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!['matched', 'manual', 'dismissed'].includes(booking.match_status)) {
    let m = await matchBooking(db, booking);
    // A rescheduled booking belongs to whoever owned the booking it replaced.
    if (m.status !== 'matched' && oldRow && oldRow.lead_id && ['matched', 'manual'].includes(oldRow.match_status)) {
      const lead = await leadRow(db, 'id = ?', oldRow.lead_id);
      if (lead) m = { status: 'matched', method: 'reschedule', lead };
    }
    await saveMatch(db, id, m, now);
    booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  }

  // ---- effects
  let crm = { changed: false, kind: null };
  let stopped = 0;
  if (['matched', 'manual'].includes(booking.match_status)) {
    crm = await syncBookingToCrm(db, booking, now);
    if (booking.status === 'confirmed') stopped = await stopFollowupsFor(db, booking);
    await recomputeConsultationAt(db, booking.lead_id, now);
    if (oldRow && oldRow.lead_id && oldRow.lead_id !== booking.lead_id) await recomputeConsultationAt(db, oldRow.lead_id, now);
  }
  return { outcome: 'applied', bookingId: id, status: booking.status, match: booking.match_status, crm: crm.kind, followupsStopped: stopped };
}

// ------------------------------------------------------------------ the public receiver

const minuteKey = (prefix, now) => `${prefix}:${new Date(now).toISOString().slice(0, 16)}`;

async function recordEvent(db, { key, trigger, uid, eventAt, outcome, error, now }) {
  const at = nowIsoOf(now);
  try {
    await db
      .prepare('INSERT INTO booking_events (id, provider, event_key, trigger_event, provider_uid, provider_event_at, received_at, processed_at, outcome, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(newId(), 'calcom', key, trigger || 'unknown', uid || null, eventAt || null, at, at, outcome, error ? String(error).slice(0, 300) : null)
      .run();
    return true;
  } catch {
    return false; // UNIQUE: already recorded
  }
}

/**
 * Handles one delivery of POST /webhooks/calcom. Framework-free so it is easy to test.
 * @returns {Promise<{status: number, body: object}>}
 */
export async function receiveCalWebhook({ db, secret, rawBody, signature, now = new Date() }) {
  if (!secret) {
    await recordEvent(db, { key: minuteKey('notconfigured', now), trigger: 'unknown', outcome: 'not_configured', now });
    return { status: 503, body: { ok: false, error: 'not_configured' } };
  }
  if (rawBody.length > MAX_BODY) return { status: 413, body: { ok: false, error: 'too_large' } };
  const valid = await verifyCalSignature({ body: rawBody, signature, secret });
  if (!valid) {
    await recordEvent(db, { key: minuteKey('badsig', now), trigger: 'unknown', outcome: 'rejected', error: 'invalid_signature', now });
    return { status: 401, body: { ok: false, error: 'invalid_signature' } };
  }
  const key = await sha256Hex(rawBody);
  const seen = await db.prepare('SELECT 1 AS x FROM booking_events WHERE event_key = ?').bind(key).first();
  if (seen) return { status: 200, body: { ok: true, duplicate: true } };

  const parsed = parseCalWebhook(rawBody);
  if (!parsed.ok) {
    await recordEvent(db, { key: `${key}:invalid:${nowIsoOf(now).slice(0, 16)}`, trigger: 'unknown', outcome: 'failed', error: parsed.reason, now });
    return { status: 400, body: { ok: false, error: parsed.reason } };
  }
  const ev = parsed.event;
  let result;
  try {
    result = await applyCalEvent(db, ev, now);
  } catch (err) {
    // Recorded under a DIFFERENT key so a provider retry of the same body is processed again, not treated as a duplicate.
    await recordEvent(db, { key: `${key}:failed:${nowIsoOf(now)}`, trigger: ev.trigger, uid: ev.uid, eventAt: ev.eventAt, outcome: 'failed', error: err && err.message, now });
    return { status: 500, body: { ok: false, error: 'processing_failed' } };
  }
  const recorded = await recordEvent(db, { key, trigger: ev.trigger, uid: ev.uid, eventAt: ev.eventAt, outcome: result.outcome, now });
  return { status: 200, body: { ok: true, duplicate: !recorded, outcome: result.outcome } };
}

// ------------------------------------------------------------------ dashboard helpers (reconciliation and health)

/** Staff attach a booking to an inquiry (the decision of a person, not a guess). */
export async function assignBookingToLead(db, bookingId, leadId, actor, now = new Date()) {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first();
  const lead = await leadRow(db, 'id = ?', leadId);
  if (!b || !lead) return { ok: false, code: 'not_found' };
  await saveMatch(db, bookingId, { lead, method: 'staff', manual: true }, now);
  const updated = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first();
  const at = nowIsoOf(now);
  await db.prepare('INSERT INTO lead_activity (id, lead_id, type, summary, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), lead.id, 'booking_matched', `A Cal.com booking was matched to this inquiry by ${actor}.`, actor, at).run();
  await syncBookingToCrm(db, updated, now);
  if (updated.status === 'confirmed') await stopFollowupsFor(db, updated);
  await recomputeConsultationAt(db, lead.id, now);
  return { ok: true, code: 'booking_matched' };
}

export async function dismissBooking(db, bookingId, actor, now = new Date()) {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first();
  if (!b) return { ok: false, code: 'not_found' };
  await db.prepare("UPDATE bookings SET match_status = 'dismissed', match_note = ?, updated_at = ? WHERE id = ?").bind(`Dismissed by ${actor}`, nowIsoOf(now), bookingId).run();
  if (b.lead_id) await recomputeConsultationAt(db, b.lead_id, now);
  return { ok: true, code: 'booking_dismissed' };
}

/** State of the integration, derived from what the receiver has recorded. */
export async function bookingHealth(db, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const since = new Date(nowMs - 7 * 86400e3).toISOString();
  const [last, lastOk, failures, sigFails, notConfigured, unmatched, ambiguous] = await Promise.all([
    db.prepare('SELECT received_at, outcome, trigger_event FROM booking_events ORDER BY received_at DESC LIMIT 1').first(),
    db.prepare("SELECT received_at FROM booking_events WHERE outcome IN ('applied', 'stale', 'ignored', 'duplicate') ORDER BY received_at DESC LIMIT 1").first(),
    db.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE outcome = 'failed' AND received_at >= ?").bind(since).first(),
    db.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE outcome = 'rejected' AND received_at >= ?").bind(since).first(),
    db.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE outcome = 'not_configured' AND received_at >= ?").bind(since).first(),
    db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE match_status = 'unmatched' AND status = 'confirmed'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE match_status = 'ambiguous' AND status = 'confirmed'").first(),
  ]);
  let state = 'ok';
  const notes = [];
  if (!last) {
    state = 'waiting';
    notes.push('No webhook has been received yet.');
  }
  if (notConfigured.n > 0) {
    state = 'attention';
    notes.push('A webhook arrived but the signing secret is not configured on the forms Worker.');
  }
  if (failures.n > 0) {
    state = 'attention';
    notes.push(`${failures.n} event(s) failed to process in the last 7 days.`);
  }
  if (sigFails.n > 0) {
    state = 'attention';
    notes.push(`${sigFails.n} delivery(ies) were rejected for a bad signature in the last 7 days (wrong secret, or a forged request).`);
  }
  if (unmatched.n + ambiguous.n > 0) {
    if (state === 'ok') state = 'review';
    notes.push(`${unmatched.n + ambiguous.n} booking(s) need matching to an inquiry.`);
  }
  return { state, notes, lastEventAt: last ? last.received_at : null, lastOkAt: lastOk ? lastOk.received_at : null, failures: failures.n, rejected: sigFails.n, unmatched: unmatched.n, ambiguous: ambiguous.n };
}

/** Removes old delivery records (bounded table growth). Keeps 90 days. */
export async function pruneBookingEvents(db, now = new Date()) {
  const cutoff = new Date(new Date(now).getTime() - 90 * 86400e3).toISOString();
  await db.prepare('DELETE FROM booking_events WHERE received_at < ?').bind(cutoff).run();
}

// ------------------------------------------------------------------ links used in follow-up emails

/**
 * The booking link for a follow-up email, or '' when none should be sent. It is included only when the owner has set
 * the booking page URL AND marked it tested. The lead's opaque reference is appended as ?r= so a resulting booking can
 * be linked back to the inquiry (the matcher still requires the booker's email or phone to agree).
 */
export async function bookingLinkFor(db, settings, lead) {
  const base = String((settings && settings.booking_url) || '').trim();
  if (!/^https:\/\//.test(base) || !settings || settings.booking_link_tested !== '1') return '';
  let ref = null;
  try {
    ref = lead && lead.id ? await ensureBookingRef(db, lead.id) : null;
  } catch {
    ref = null;
  }
  if (!ref) return base;
  try {
    const u = new URL(base);
    u.searchParams.set('r', ref);
    return u.toString();
  } catch {
    return '';
  }
}

/** For test emails and dashboard previews: the plain booking URL (no lead reference), once one has been entered. */
export const bookingPreviewUrl = (settings) => (/^https:\/\//.test(String((settings && settings.booking_url) || '').trim()) ? String(settings.booking_url).trim() : '');
