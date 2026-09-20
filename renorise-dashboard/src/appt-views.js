// Appointments screens. All dynamic text is escaped by the html`` tag (html.js), so a booker's name or project note is inert.
// Times are shown in Toronto time and labelled as such. "Booked / cancelled / moved" come from Cal.com (verified webhook);
// "completed / no-show" are recorded by staff; the two are labelled separately.

import { html, raw } from './html.js';
import { csrfField, pager, splitDateTime } from './views.js';
import { formatDateTime, torontoToday } from './time.js';
import { APPT_FILTERS, manageUrlFor } from './appt-db.js';
import { APPOINTMENT_KIND_LABEL, APPOINTMENT_STATUS_LABEL } from './crm-constants.js';
import { formatPhoneDisplay } from '../../renorise-shared/calls.js';

const TORONTO = 'America/Toronto';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEBHOOK_URL = 'https://renorise-forms.levi-gene-ous.workers.dev/webhooks/calcom';

const statusClass = (s) => (s === 'scheduled' ? 'b-ok' : s === 'cancelled' ? 'b-err' : s === 'no_show' ? 'b-warn' : '');

/** Where the status came from, in words a person can act on. */
function sourceNote(a) {
  if (a.source === 'calcom') {
    if (a.status_source === 'staff') return 'Outcome recorded by staff';
    if (a.status === 'scheduled') return a.rescheduled_from_uid ? 'Booked through Cal.com (moved to a new time)' : 'Booked through Cal.com';
    return `${APPOINTMENT_STATUS_LABEL[a.status] || a.status} in Cal.com`;
  }
  if (a.source === 'legacy_assessment') return 'Carried over from the earlier assessment date';
  return 'Entered by hand';
}

function statusCell(a) {
  return html`<span class="badge ${statusClass(a.status)}">${APPOINTMENT_STATUS_LABEL[a.status] || a.status}</span><br><span class="hint">${sourceNote(a)}</span>${a.provider_no_show && a.status === 'scheduled' ? html`<br><span class="hint late">Cal.com says the caller did not show. Record the outcome.</span>` : ''}`;
}

function tzNote(a) {
  return a.attendee_timezone && a.attendee_timezone !== TORONTO ? html`<br><span class="hint">Booker's time zone: ${a.attendee_timezone}</span>` : '';
}

const manageLink = (a) => {
  const u = a.source === 'calcom' ? manageUrlFor(a.booking_uid) : null;
  return u ? html`<a href="${u}" target="_blank" rel="noopener noreferrer">Open in Cal.com</a>` : '';
};

function outcomeForm(a, csrf) {
  if (a.status !== 'scheduled') return '';
  // Cancelling or moving a Cal.com booking is done in Cal.com so the calendar slot is freed and the caller is told.
  const cancelOpt = a.source === 'calcom' ? '' : html`<option value="cancelled">Cancelled</option>`;
  return html`<form method="post" action="/appointments/${a.id}/status" class="row">${csrfField(csrf)}<input type="hidden" name="opp" value="${a.opportunity_id}"><input type="hidden" name="back" value="appointments">
    <div class="field"><label for="st-${a.id}">Record the outcome</label><select id="st-${a.id}" name="status"><option value="completed">Completed</option><option value="no_show">No-show</option>${cancelOpt}</select></div><button class="secondary" type="submit">Save</button></form>`;
}

// ------------------------------------------------------------------ health + settings cards

const HEALTH_LABEL = {
  ok: ['b-ok', 'Working'],
  waiting: ['', 'Waiting for the first booking'],
  review: ['b-warn', 'Needs a look'],
  attention: ['b-err', 'Needs attention'],
};

export function healthCard(h) {
  const [cls, label] = HEALTH_LABEL[h.state] || ['', h.state];
  return html`<section class="card" aria-labelledby="hl-h">
  <h2 id="hl-h">Booking connection <span class="badge ${cls}">${label}</span></h2>
  ${h.notes.length ? html`<ul class="plain">${h.notes.map((n) => html`<li>${n}</li>`)}</ul>` : html`<p class="hint">Cal.com booking notices are arriving and being read normally.</p>`}
  <dl class="kv">
    <dt>Last notice received</dt><dd>${h.lastEventAt ? formatDateTime(h.lastEventAt) : 'None yet'}</dd>
    <dt>Last processed normally</dt><dd>${h.lastOkAt ? formatDateTime(h.lastOkAt) : 'None yet'}</dd>
    <dt>Problems, last 7 days</dt><dd>${h.failures} failed · ${h.rejected} rejected (bad signature)</dd>
    <dt>Webhook address</dt><dd class="pre">${WEBHOOK_URL}</dd>
  </dl>
  <p class="sec-note">The signing secret is stored only as a Worker secret and is never shown here. Cal.com shows a delivery log next to the webhook if you need to resend a notice.</p>
</section>`;
}

export function settingsCard({ settings, csrf }) {
  const live = settings.url && settings.tested;
  return html`<section class="card" id="booking-settings" aria-labelledby="bs-h">
  <h2 id="bs-h">Booking page in follow-up emails</h2>
  <p class="hint">${live ? html`<span class="badge b-ok">On</span> Follow-up emails include a “Book Your Free Consultation” button.` : html`<span class="badge">Off</span> Follow-up emails do not mention booking yet. It turns on only when an address is saved <strong>and</strong> marked as tested.`}</p>
  <form method="post" action="/appointments/settings">${csrfField(csrf)}<input type="hidden" name="tested_present" value="1">
    <div class="field"><label for="bk-url">Booking page address</label><input id="bk-url" name="booking_url" type="url" maxlength="300" value="${settings.url}" placeholder="https://www.renosrise.com/book/"><p class="sec-note">Must start with https://. Changing it switches the button off until you mark it tested again.</p></div>
    <div class="field"><label><input type="checkbox" name="tested" value="yes" ${settings.tested ? raw('checked') : ''}> I opened this page, made a real test booking, and saw it appear on this Appointments screen</label></div>
    <button type="submit">Save</button>
  </form>
  <p class="sec-note">Preview any follow-up email, with the button, on <a href="/sequence/preview">Email previews</a>.</p>
</section>`;
}

// ------------------------------------------------------------------ bookings that need matching

export function reviewCard(bookings) {
  if (!bookings.length) return '';
  return html`<section class="card" id="needs-matching" aria-labelledby="nm-h">
  <h2 id="nm-h">Bookings to match <span class="badge b-warn">${bookings.length}</span></h2>
  <p class="hint">These bookings could not be tied to exactly one inquiry, so nothing was linked and no follow-up was changed. Open one to choose the inquiry it belongs to, or dismiss it.</p>
  <ul class="plain">${bookings.map((b) => html`<li><a href="/appointments/bookings/${b.id}"><strong>${b.attendee_name || 'Name not given'}</strong></a> · ${b.starts_at ? formatDateTime(b.starts_at) : 'time not given'} <span class="badge ${b.match_status === 'ambiguous' ? 'b-warn' : ''}">${b.match_status === 'ambiguous' ? 'Could be more than one inquiry' : 'No matching inquiry'}</span>${b.status === 'pending' ? html` <span class="badge">Awaiting confirmation in Cal.com</span>` : ''}</li>`)}</ul>
</section>`;
}

// ------------------------------------------------------------------ main page

const qstr = (o) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

export function appointmentsPage({ filters, counts, result, cal, health, review, settings, csrf }) {
  const listView = filters.view === 'list';
  return html`<h1>Appointments</h1>
<p class="hint">Free phone consultations booked through Cal.com, plus anything you record by hand. A phone consultation is a short first call, not an on-site visit. Times are Toronto time. Open times come from Google Calendar through Cal.com; nothing is stored here about availability.</p>
${healthCard(health)}
${reviewCard(review)}
<nav class="stage-tabs" aria-label="Appointment view">
  <a class="tab" href="/appointments" ${listView ? raw('aria-current="true"') : ''}>List</a>
  <a class="tab" href="/appointments?view=calendar" ${!listView ? raw('aria-current="true"') : ''}>Calendar</a>
</nav>
${listView ? listSection({ filters, counts, result, csrf }) : calendarSection({ cal })}
${settingsCard({ settings, csrf })}`;
}

function listSection({ filters, counts, result, csrf }) {
  const { rows, total, pageSize } = result;
  return html`<nav class="stage-tabs" aria-label="Filter appointments">
  ${APPT_FILTERS.map(([key, label]) => html`<a class="tab" href="/appointments${key === 'upcoming' ? '' : `?f=${key}`}" ${filters.f === key ? raw('aria-current="true"') : ''}>${label} <span class="count">${counts[key]}</span></a>`)}
</nav>
<div class="card">
${rows.length
    ? html`<div class="tablewrap"><table class="stack"><caption class="sr-only">Appointments (Toronto time)</caption>
<thead><tr><th scope="col">When (Toronto)</th><th scope="col">Who</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
<tbody>${rows.map((a) => html`<tr>
  <td data-label="When"><span class="nowrap">${splitDateTime(a.starts_at)[0]}</span><br><span class="hint">${splitDateTime(a.starts_at)[1]}${a.ends_at ? ` – ${splitDateTime(a.ends_at)[1]}` : ''} ET</span>${tzNote(a)}</td>
  <td data-label="Who">${a.opportunity_id ? html`<a href="/leads/${a.opportunity_id}">${a.contact_name || 'Unnamed'}</a>` : (a.contact_name || 'Unnamed')}${a.project_title ? html`<br><span class="hint">${a.project_title}</span>` : ''}</td>
  <td data-label="Type">${APPOINTMENT_KIND_LABEL[a.kind] || a.kind}</td>
  <td data-label="Status">${statusCell(a)}</td>
  <td data-label="Actions">${manageLink(a)}${outcomeForm(a, csrf)}</td>
</tr>`)}</tbody></table></div>`
    : html`<p class="empty">${filters.f === 'upcoming' ? 'No upcoming appointments.' : 'Nothing here.'}</p>`}
${pager('/appointments', { f: filters.f === 'upcoming' ? '' : filters.f }, filters.page, total, pageSize)}
</div>`;
}

function calendarSection({ cal }) {
  const [y, m] = cal.month.split('-').map(Number);
  const today = torontoToday();
  const cells = [];
  for (let i = 0; i < cal.firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= cal.daysInMonth; d++) cells.push(`${cal.month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const timeOf = (iso) => splitDateTime(iso)[1];
  const dayLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return html`<div class="card">
  <div class="cal-head">
    <a class="btn secondary" href="/appointments${qstr({ view: 'calendar', month: cal.prev })}" aria-label="Previous month">← ${MONTHS[(m + 10) % 12]}</a>
    <h2 class="cal-title">${MONTHS[m - 1]} ${y}</h2>
    <a class="btn secondary" href="/appointments${qstr({ view: 'calendar', month: cal.next })}" aria-label="Next month">${MONTHS[m % 12]} →</a>
  </div>
  <p class="hint">${cal.count} appointment${cal.count === 1 ? '' : 's'} this month. Toronto time.</p>
  <div class="cal" role="table" aria-label="${MONTHS[m - 1]} ${y}">
    <div class="cal-row cal-dow" role="row">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => html`<div role="columnheader">${d}</div>`)}</div>
    ${Array.from({ length: cells.length / 7 }, (_, w) => html`<div class="cal-row" role="row">${cells.slice(w * 7, w * 7 + 7).map((date) => date
      ? html`<div role="cell" class="cal-day ${date === today ? 'cal-today' : ''} ${(cal.byDay[date] || []).length ? 'has' : 'empty-day'}"><span class="cal-n" aria-hidden="true">${Number(date.slice(8))}</span><span class="cal-full">${dayLabel(date)}</span>${(cal.byDay[date] || []).map((a) => html`<a class="cal-appt st-${a.status}" href="${a.opportunity_id ? `/leads/${a.opportunity_id}` : '/appointments'}"><span class="cal-t">${timeOf(a.starts_at)}</span> ${a.contact_name || 'Unnamed'}<span class="sr-only"> (${APPOINTMENT_STATUS_LABEL[a.status] || a.status}, ${APPOINTMENT_KIND_LABEL[a.kind] || a.kind})</span>${a.status !== 'scheduled' ? html` <span class="cal-s">${APPOINTMENT_STATUS_LABEL[a.status]}</span>` : ''}</a>`)}</div>`
      : html`<div role="cell" class="cal-pad" aria-hidden="true"></div>`)}</div>`)}
  </div>
</div>`;
}

export const migrationNeeded = () => html`<h1>Appointments</h1><div class="banner" role="alert"><strong>Database update needed.</strong> Booking needs migration 0006 applied to the database. Apply it (see docs/cal-booking.md), then reload. Nothing has been lost.</div>`;

// ------------------------------------------------------------------ one booking (matching)

const leadLine = (l) => html`<strong>${l.name}</strong> <span class="hint">${l.email || 'no email'} · ${l.phone || 'no phone'} · sent ${formatDateTime(l.created_at)}${l.project_title ? ` · ${l.project_title}` : ''}</span>`;

export function bookingPage({ booking: b, candidates, results, q, events, csrf }) {
  const already = ['matched', 'manual'].includes(b.match_status);
  const manage = manageUrlFor(b.provider_uid);
  const assign = (l, label = 'Attach this booking to this inquiry') => html`<form method="post" action="/appointments/bookings/${b.id}/assign" class="inline-form">${csrfField(csrf)}<input type="hidden" name="lead_id" value="${l.id}"><button class="secondary" type="submit">${label}</button></form>`;
  return html`<p><a href="/appointments">← All appointments</a></p>
<h1>Booking from ${b.attendee_name || 'a caller'} <span class="badge ${b.status === 'confirmed' ? 'b-ok' : b.status === 'cancelled' || b.status === 'rejected' ? 'b-err' : ''}">${b.status === 'confirmed' ? 'Booked' : b.status === 'pending' ? 'Awaiting confirmation' : b.status === 'rescheduled' ? 'Moved to a new time' : b.status === 'rejected' ? 'Declined' : 'Cancelled'}</span></h1>
<p class="hint">This is what Cal.com told us. Nothing here has been checked against your inquiries unless it says matched.</p>
<div class="grid cols">
<div>
  <section class="card" aria-labelledby="bd-h"><h2 id="bd-h">Details</h2>
    <dl class="kv">
      <dt>Call time</dt><dd>${b.starts_at ? formatDateTime(b.starts_at) : '—'} (Toronto time)${b.attendee_timezone && b.attendee_timezone !== TORONTO ? html`<br><span class="hint">Booker's time zone: ${b.attendee_timezone}</span>` : ''}</dd>
      <dt>Name</dt><dd>${b.attendee_name || '—'}</dd>
      <dt>Email</dt><dd>${b.attendee_email || '—'}</dd>
      <dt>Phone to call</dt><dd>${b.attendee_phone ? formatPhoneDisplay(b.attendee_phone) : '—'}</dd>
      <dt>Their note</dt><dd>${b.project_note || '—'}</dd>
      <dt>Match</dt><dd>${already ? html`Matched (${b.match_method}). ${b.lead_id ? html`<a href="/leads/${b.opportunity_id || ''}">Open the project</a>` : ''}` : b.match_status === 'dismissed' ? 'Dismissed by staff' : b.match_status === 'ambiguous' ? 'Could be more than one inquiry' : 'No matching inquiry found'}${b.match_note ? html`<br><span class="hint">${b.match_note.replace(/\(candidates:[^)]*\)/, '').trim()}</span>` : ''}</dd>
      ${b.cancellation_reason ? html`<dt>Cancellation reason</dt><dd>${b.cancellation_reason}</dd>` : ''}
    </dl>
    ${manage ? html`<p><a href="${manage}" target="_blank" rel="noopener noreferrer">Open in Cal.com</a> <span class="hint">to view, move or cancel it. That page is the caller's own booking page, so do not forward the link.</span></p>` : ''}
  </section>
  <section class="card" aria-labelledby="ev-h"><h2 id="ev-h">Notices from Cal.com</h2>
    ${events.length ? html`<ul class="plain">${events.map((e) => html`<li>${e.trigger_event.replace(/_/g, ' ').toLowerCase()} · <span class="badge ${e.outcome === 'applied' ? 'b-ok' : e.outcome === 'failed' || e.outcome === 'rejected' ? 'b-err' : ''}">${e.outcome}</span><br><span class="hint">received ${formatDateTime(e.received_at)}</span></li>`)}</ul>` : html`<p class="empty">None recorded.</p>`}
  </section>
</div>
<div>
  ${already ? html`<section class="card"><h2>Already matched</h2><p class="hint">This booking is tied to an inquiry and is not changed from here.</p></section>` : html`
  <section class="card" aria-labelledby="mt-h"><h2 id="mt-h">Which inquiry is this?</h2>
    <p class="sec-note">Attaching a booking records the appointment on that project and ends that inquiry's automatic follow-up emails. It does not give permission to send marketing email.</p>
    ${candidates.length ? html`<h3>Inquiries with the same email or phone</h3><ul class="plain">${candidates.map((l) => html`<li>${leadLine(l)}${assign(l)}</li>`)}</ul>` : html`<p class="empty">No inquiry shares this email or phone.</p>`}
    <form method="get" action="/appointments/bookings/${b.id}" role="search"><div class="field"><label for="lq">Search inquiries</label><input id="lq" name="q" type="search" value="${q}" maxlength="60" placeholder="Name, email or phone"></div><button class="secondary" type="submit">Search</button></form>
    ${q ? (results.length ? html`<ul class="plain">${results.map((l) => html`<li>${leadLine(l)}${assign(l)}</li>`)}</ul>` : html`<p class="empty">No inquiry found for “${q}”.</p>`) : ''}
  </section>
  ${b.match_status !== 'dismissed' ? html`<section class="card" aria-labelledby="dm-h"><h2 id="dm-h">Not one of your inquiries?</h2>
    <p class="sec-note">A direct booking with no inquiry is fine: it stays here and nothing is created or emailed. Dismiss it to take it off the to-do list; nothing is deleted.</p>
    <form method="post" action="/appointments/bookings/${b.id}/dismiss">${csrfField(csrf)}<button class="secondary" type="submit">Dismiss</button></form></section>` : ''}`}
</div>
</div>`;
}
