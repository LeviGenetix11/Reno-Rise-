// Cal.com booking webhooks: signature check and payload normalisation. Pure functions, no database.
//
// Verified against Cal.com's documentation (September 2026):
//   * Signature: header "X-Cal-Signature-256", HMAC-SHA256 of the RAW request body using the webhook secret, hex encoded.
//     The signature carries no timestamp, so replay protection is by exact-body idempotency (bookings-db.js).
//   * Envelope: { triggerEvent, createdAt, payload: { ... } }. MEETING_STARTED / MEETING_ENDED are flat and ignored.
//   * Booking payload fields used: uid, bookingId, startTime, endTime, status, attendees[], organizer, responses,
//     metadata, cancellationReason, rescheduleUid (rescheduling creates a NEW uid and names the previous one).
//   * BOOKING_NO_SHOW_UPDATED carries payload.bookingUid and payload.attendees[].noShow.
// NOT documented, so handled defensively and to be confirmed with one real test booking: exactly where the phone number
// arrives (several candidate locations are checked) and whether webhooks are available on the free plan.

import { normalizeEmail, normalizePhone } from './normalize.js';

export const CAL_TRIGGERS = ['BOOKING_CREATED', 'BOOKING_REQUESTED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED', 'BOOKING_REJECTED', 'BOOKING_NO_SHOW_UPDATED'];
export const REF_RE = /^[A-Za-z0-9_-]{20,64}$/;
/** The booking-embed metadata key that carries the opaque lead reference. */
export const REF_METADATA_KEY = 'renorise_ref';

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** @returns {Promise<boolean>} */
export async function verifyCalSignature({ body, signature, secret }) {
  if (!secret || !signature) return false;
  const provided = String(signature).trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return safeEqual(provided, toHex(mac));
}

/** sha-256 hex of a string (used as the idempotency key for a delivery). */
export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const str = (v, max = 500) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const isoOrNull = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Cal.com "responses" values arrive either as plain values or as { label, value }. */
const responseValue = (r) => (r && typeof r === 'object' && !Array.isArray(r) && 'value' in r ? r.value : r);

/**
 * The booker's phone number, or null. Where Cal.com puts it depends on the event's location type, and that is not
 * documented precisely, so several places are checked in order of reliability.
 */
export function extractPhone(payload) {
  const candidates = [];
  const responses = payload.responses && typeof payload.responses === 'object' ? payload.responses : {};
  for (const [key, raw] of Object.entries(responses)) {
    const v = responseValue(raw);
    if (/phone/i.test(key)) candidates.push(v);
    if (key === 'location' && v && typeof v === 'object') candidates.push(v.optionValue, v.value);
    if (key === 'location' && typeof v === 'string') candidates.push(v);
  }
  const att = Array.isArray(payload.attendees) ? payload.attendees[0] : null;
  if (att) candidates.push(att.phoneNumber, att.phone);
  if (typeof payload.location === 'string') candidates.push(payload.location);
  if (payload.attendeePhoneNumber) candidates.push(payload.attendeePhoneNumber);
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const norm = normalizePhone(c);
    if (norm) return { raw: c.trim().slice(0, 30), norm };
  }
  return null;
}

/** The booker's short project description, if the booking form collected one. */
export function extractNote(payload) {
  const responses = payload.responses && typeof payload.responses === 'object' ? payload.responses : {};
  for (const key of ['notes', 'project_description', 'description', 'additionalNotes']) {
    const v = responseValue(responses[key]);
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 1000);
  }
  return str(payload.additionalNotes, 1000) || str(payload.description, 1000);
}

/**
 * Normalises one delivery. Returns { ok: true, event } or { ok: false, reason }.
 * event = { trigger, eventAt, uid, booking|null, noShow|null }
 */
export function parseCalWebhook(rawBody) {
  let root;
  try {
    root = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!root || typeof root !== 'object') return { ok: false, reason: 'invalid_shape' };
  const trigger = str(root.triggerEvent, 60);
  const eventAt = isoOrNull(root.createdAt);
  if (!trigger) return { ok: false, reason: 'missing_trigger' };
  if (!CAL_TRIGGERS.includes(trigger)) return { ok: true, event: { trigger, eventAt, uid: null, booking: null, noShow: null, ignored: true } };
  const p = root.payload && typeof root.payload === 'object' ? root.payload : null;
  if (!p) return { ok: false, reason: 'missing_payload' };
  if (!eventAt) return { ok: false, reason: 'missing_created_at' };

  if (trigger === 'BOOKING_NO_SHOW_UPDATED') {
    const uid = str(p.bookingUid, 100);
    if (!uid) return { ok: false, reason: 'missing_uid' };
    const anyNoShow = Array.isArray(p.attendees) && p.attendees.some((a) => a && a.noShow === true);
    return { ok: true, event: { trigger, eventAt, uid, booking: null, noShow: anyNoShow } };
  }

  const uid = str(p.uid, 100);
  if (!uid) return { ok: false, reason: 'missing_uid' };
  const attendee = Array.isArray(p.attendees) && p.attendees[0] ? p.attendees[0] : {};
  const responses = p.responses && typeof p.responses === 'object' ? p.responses : {};
  const emailRaw = str(attendee.email, 254) || str(responseValue(responses.email), 254);
  const nameRaw = str(attendee.name, 200) || str(responseValue(responses.name), 200);
  const phone = extractPhone(p);
  const metadata = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  const refRaw = str(metadata[REF_METADATA_KEY], 80);
  const provStatus = String(p.status || '').toUpperCase();

  const booking = {
    uid,
    startsAt: isoOrNull(p.startTime),
    endsAt: isoOrNull(p.endTime),
    attendeeTimezone: str(attendee.timeZone, 60),
    organizerTimezone: str(p.organizer && p.organizer.timeZone, 60),
    name: nameRaw,
    email: emailRaw,
    emailNorm: normalizeEmail(emailRaw),
    phone: phone ? phone.raw : null,
    phoneNorm: phone ? phone.norm : null,
    note: extractNote(p),
    ref: refRaw && REF_RE.test(refRaw) ? refRaw : null,
    eventTypeSlug: str(p.type, 100),
    providerStatus: provStatus,
    cancellationReason: str(p.cancellationReason, 500),
    rescheduleUid: str(p.rescheduleUid, 100),
  };
  return { ok: true, event: { trigger, eventAt, uid, booking, noShow: null } };
}

/** The status a booking event asks for. `undefined` = no status change (informational event). */
export function statusForEvent(event) {
  switch (event.trigger) {
    case 'BOOKING_CREATED':
      return event.booking && ['PENDING', 'AWAITING_HOST'].includes(event.booking.providerStatus) ? 'pending' : 'confirmed';
    case 'BOOKING_REQUESTED':
      return 'pending';
    case 'BOOKING_RESCHEDULED':
      return 'confirmed';
    case 'BOOKING_CANCELLED':
      return 'cancelled';
    case 'BOOKING_REJECTED':
      return 'rejected';
    default:
      return undefined;
  }
}

export const TERMINAL = ['cancelled', 'rejected', 'rescheduled'];
