// Appointments screen: data access for consultations and assessments, Cal.com bookings that still need matching,
// the integration-health card and the booking-page settings.
//
// Availability is NOT stored here. Google Calendar (through Cal.com) is the only source of open times; this database only
// records what was booked. Provider facts (booked / cancelled / rescheduled, from a verified webhook) and staff outcomes
// (completed / no-show, entered by hand) are kept in separate fields and labelled differently on screen.
//
// Nothing here sends a message.

import { torontoToday, torontoDateOf, torontoDateHourToUtcIso, addDays } from './time.js';
import { saveSetting, loadSettings } from '../../renorise-shared/followup-db.js';

export const APPT_FILTERS = [
  ['upcoming', 'Upcoming'],
  ['to_record', 'Past: record the outcome'],
  ['done', 'Completed / no-show'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];
const FILTER_KEYS = APPT_FILTERS.map(([k]) => k);
export const PAGE_SIZE = 50;

export function parseApptFilters(url) {
  const f = url.searchParams.get('f');
  const view = url.searchParams.get('view') === 'calendar' ? 'calendar' : 'list';
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(url.searchParams.get('month') || '');
  const page = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  return { f: FILTER_KEYS.includes(f) ? f : 'upcoming', view, month: m ? `${m[1]}-${m[2]}` : torontoToday().slice(0, 7), page };
}

const SELECT = `SELECT a.*, c.display_name AS contact_name, o.title AS project_title, o.stage AS project_stage,
                       b.provider_uid AS booking_uid, b.status AS booking_status, b.provider_no_show AS provider_no_show, b.attendee_timezone AS attendee_timezone, b.rescheduled_from_uid AS rescheduled_from_uid
                FROM appointments a
                LEFT JOIN contacts c ON c.id = a.contact_id
                LEFT JOIN opportunities o ON o.id = a.opportunity_id
                LEFT JOIN bookings b ON b.id = a.booking_id`;

const WHERE = {
  upcoming: "a.status = 'scheduled' AND a.starts_at >= ?",
  to_record: "a.status = 'scheduled' AND a.starts_at < ?",
  done: "a.status IN ('completed', 'no_show') AND ? IS NOT NULL",
  cancelled: "a.status = 'cancelled' AND ? IS NOT NULL",
  all: '? IS NOT NULL',
};

export async function appointmentCounts(db, now = new Date()) {
  const iso = now.toISOString();
  const out = {};
  for (const key of FILTER_KEYS) {
    out[key] = (await db.prepare(`SELECT COUNT(*) AS n FROM appointments a WHERE ${WHERE[key]}`).bind(iso).first()).n;
  }
  return out;
}

export async function listAppointments(db, filters, now = new Date()) {
  const iso = now.toISOString();
  const order = filters.f === 'upcoming' ? 'a.starts_at ASC' : 'a.starts_at DESC';
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM appointments a WHERE ${WHERE[filters.f]}`).bind(iso).first()).n;
  const rows = ((await db.prepare(`${SELECT} WHERE ${WHERE[filters.f]} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(iso, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE).all()).results) || [];
  return { rows, total, pageSize: PAGE_SIZE };
}

/** A month of appointments grouped by Toronto calendar day, with the grid's leading and trailing days. */
export async function monthOfAppointments(db, month) {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const from = torontoDateHourToUtcIso(first, 0);
  const to = torontoDateHourToUtcIso(next, 0);
  const rows = ((await db.prepare(`${SELECT} WHERE a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at ASC LIMIT 500`).bind(from, to).all()).results) || [];
  const byDay = {};
  for (const r of rows) (byDay[torontoDateOf(r.starts_at)] ||= []).push(r);
  const daysInMonth = Number(addDays(next, -1).slice(8));
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  return { month, prev, next: next.slice(0, 7), daysInMonth, firstWeekday, byDay, count: rows.length };
}

// ------------------------------------------------------------------ bookings that need a person

export async function bookingsNeedingReview(db) {
  return ((await db
    .prepare(
      `SELECT * FROM bookings WHERE match_status IN ('unmatched', 'ambiguous') AND status IN ('confirmed', 'pending')
       ORDER BY (starts_at IS NULL), starts_at ASC LIMIT 100`
    )
    .all()).results) || [];
}

export async function getBooking(db, id) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(id || ''))) return null;
  return db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
}

const LEAD_COLS = 'l.id, l.name, l.email, l.phone, l.created_at, l.renovation_type, l.opportunity_id, o.title AS project_title, o.stage AS project_stage';
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Inquiries that share the booker's email or phone. Suggestions only: a person still chooses. */
export async function candidateLeads(db, booking) {
  const email = booking.attendee_email_norm || '';
  const phone = booking.attendee_phone_norm || '';
  if (!email && !phone) return [];
  return ((await db
    .prepare(
      `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN opportunities o ON o.id = l.opportunity_id
       WHERE (? <> '' AND lower(l.email) = ?)
          OR l.contact_id IN (SELECT contact_id FROM contact_identifiers WHERE (? <> '' AND kind = 'email' AND norm = ?) OR (? <> '' AND kind = 'phone' AND norm = ?))
       ORDER BY l.created_at DESC LIMIT 20`
    )
    .bind(email, email, email, email, phone, phone)
    .all()).results) || [];
}

export async function searchLeads(db, q) {
  const term = String(q || '').trim().slice(0, 60);
  if (term.length < 2) return [];
  const p = like(term);
  return ((await db
    .prepare(
      `SELECT ${LEAD_COLS} FROM leads l LEFT JOIN opportunities o ON o.id = l.opportunity_id
       WHERE l.name LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\' OR l.phone LIKE ? ESCAPE '\\'
       ORDER BY l.created_at DESC LIMIT 20`
    )
    .bind(p, p, p)
    .all()).results) || [];
}

export async function bookingEvents(db, uid) {
  if (!uid) return [];
  return ((await db.prepare('SELECT trigger_event, outcome, received_at, provider_event_at FROM booking_events WHERE provider_uid = ? ORDER BY received_at DESC LIMIT 20').bind(uid).all()).results) || [];
}

// ------------------------------------------------------------------ booking-page settings

/**
 * The public booking page address. It goes into follow-up emails only after it is marked as tested. Changing the address
 * clears the "tested" mark, so an untested address can never be emailed.
 */
export async function saveBookingSettings(db, form, actor) {
  const current = await loadSettings(db);
  const raw = form.get('booking_url');
  let url = current.booking_url || '';
  if (raw !== null) {
    url = String(raw).trim();
    if (url) {
      let u;
      try {
        u = new URL(url);
      } catch {
        return { ok: false, code: 'bad_booking_url' };
      }
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || url.length > 300) return { ok: false, code: 'bad_booking_url' };
      url = u.toString();
    }
  }
  const changed = url !== (current.booking_url || '');
  let tested = changed ? '0' : current.booking_link_tested === '1' ? '1' : '0';
  if (form.get('tested') === 'yes') {
    if (!url) return { ok: false, code: 'booking_url_first' };
    tested = '1';
  } else if (form.has('tested_present') && form.get('tested') !== 'yes') {
    tested = '0';
  }
  if (changed) await saveSetting(db, 'booking_url', url, actor);
  if (tested !== current.booking_link_tested || changed) await saveSetting(db, 'booking_link_tested', tested, actor);
  return { ok: true, code: url && tested === '1' ? 'booking_settings_live' : 'booking_settings_saved' };
}

export const bookingSettingsOf = async (db) => {
  const s = await loadSettings(db);
  return { url: s.booking_url || '', tested: s.booking_link_tested === '1' };
};

/** Cal.com's own page for a booking (view / reschedule / cancel). Built on demand, never stored, only shown behind sign-in. */
export const manageUrlFor = (uid) => (/^[A-Za-z0-9_-]{3,64}$/.test(String(uid || '')) ? `https://app.cal.com/booking/${uid}` : null);
