// Page renderers. Each returns an html`` value; all dynamic text is escaped by
// default (see html.js), so customer-submitted content is always inert.

import { html, raw } from './html.js';
import { STAGES, SOURCES, stageLabel, SOURCE_LABEL, EMAIL_TYPE_LABEL, emailJobLabel, emailStatusLabel } from './constants.js';
import { formatDate, formatDateTime, utcIsoToTorontoInput } from './time.js';

const csrfField = (t) => html`<input type="hidden" name="csrf" value="${t}">`;

const stageBadge = (s) => html`<span class="badge st-${STAGES.some(([k]) => k === s) ? s : 'other'}">${stageLabel(s)}</span>`;

function emailBadge(status) {
  const cls = status === 'sent' ? 'b-ok' : status === 'failed' ? 'b-err' : 'b-warn';
  return html`<span class="badge ${cls}">${emailStatusLabel(status)}</span>`;
}

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined && v !== null && v !== 'no' && !(k === 'page' && v === 1)) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

function pager(path, params, page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return html`<nav class="pager" aria-label="Pagination">
    <span>${total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}</span>
    <span>
      ${page > 1 ? html`<a class="btn secondary" href="${path}${qs({ ...params, page: page - 1 })}">Previous</a>` : ''}
      ${page < pages ? html`<a class="btn secondary" href="${path}${qs({ ...params, page: page + 1 })}">Next</a>` : ''}
    </span>
  </nav>`;
}

// ------------------------------------------------------------------ overview

export function overviewPage({ counts, recent, assessments }) {
  const tile = (href, n, label, alert) => html`<a class="stat ${alert && n > 0 ? 'alert' : ''}" href="${href}"><div class="n">${n}</div><div class="l">${label}</div></a>`;
  return html`
<h1>Overview</h1>
<div class="grid stats">
  ${tile('/leads?status=new', counts.new_leads, 'New leads', false)}
  ${tile('/follow-ups', counts.overdue, 'Overdue follow-ups', true)}
  ${tile('/follow-ups', counts.due_today, 'Follow-ups due today', false)}
  ${tile('/leads?status=assessment_booked', counts.booked, 'Assessments booked', false)}
  ${tile('/emails?status=failed', counts.email_failed, 'Email failures', true)}
</div>
<p class="hint">Leads received in the last 7 days: ${counts.leads_7d}. Upcoming recorded assessments: ${counts.upcoming_assessments}. Emails currently retrying: ${counts.email_retrying}.</p>
<div class="grid cols">
  <section class="card" aria-labelledby="recent-h">
    <h2 id="recent-h">Latest leads</h2>
    ${recent.length ? html`<ul class="plain">${recent.map((l) => html`<li><a href="/leads/${l.id}">${l.name}</a> ${stageBadge(l.status)}<br><span class="hint">${l.renovation_type} · ${l.city} · ${formatDateTime(l.created_at)}</span></li>`)}</ul>` : html`<p class="empty">No leads yet.</p>`}
    <p><a href="/leads">All leads</a></p>
  </section>
  <section class="card" aria-labelledby="asmt-h">
    <h2 id="asmt-h">Upcoming assessments</h2>
    ${assessments.length ? html`<ul class="plain">${assessments.map((l) => html`<li><a href="/leads/${l.id}">${l.name}</a><br><span class="hint">${formatDateTime(l.assessment_at)}</span></li>`)}</ul>` : html`<p class="empty">No upcoming assessment dates recorded.</p>`}
  </section>
</div>`;
}

// ------------------------------------------------------------------ leads list

export function leadsPage({ result, filters, contractors }) {
  const { rows, total, pageSize } = result;
  const { page, ...rest } = filters;
  return html`
<h1>Leads</h1>
<form class="card" method="get" action="/leads" role="search" aria-label="Search and filter leads">
  <div class="row">
    <div class="field"><label for="q">Search</label><input id="q" name="q" type="search" value="${filters.q}" placeholder="Name, email, phone, city, project" maxlength="100"></div>
    <div class="field"><label for="status">Stage</label>
      <select id="status" name="status"><option value="">All stages</option>${STAGES.map(([k, v]) => html`<option value="${k}" ${filters.status === k ? raw('selected') : ''}>${v}</option>`)}</select></div>
    <div class="field"><label for="source">Source page</label>
      <select id="source" name="source"><option value="">All sources</option>${SOURCES.map(([k, v]) => html`<option value="${k}" ${filters.source === k ? raw('selected') : ''}>${v}</option>`)}</select></div>
    <div class="field"><label for="contractor">Contractor</label>
      <select id="contractor" name="contractor"><option value="">Any</option><option value="none" ${filters.contractor === 'none' ? raw('selected') : ''}>Unassigned</option>${contractors.map((c) => html`<option value="${c.id}" ${filters.contractor === c.id ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
    <div class="field"><label for="archived">Archive</label>
      <select id="archived" name="archived"><option value="no" ${filters.archived === 'no' ? raw('selected') : ''}>Active only</option><option value="all" ${filters.archived === 'all' ? raw('selected') : ''}>Active + archived</option><option value="only" ${filters.archived === 'only' ? raw('selected') : ''}>Archived only</option></select></div>
    <div><button type="submit">Apply</button></div>
  </div>
  <p class="hint"><a href="/leads">Clear filters</a> · <a href="/leads/export.csv${qs(rest)}">Export these ${total} lead${total === 1 ? '' : 's'} as CSV</a></p>
</form>
<div class="card">
  ${rows.length
    ? html`<div class="tablewrap"><table class="stack"><caption class="hint">Leads, newest first</caption>
    <thead><tr><th scope="col">Received (Toronto)</th><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Project</th><th scope="col">Stage</th><th scope="col">Contractor</th><th scope="col">Next follow-up</th><th scope="col">Emails</th></tr></thead>
    <tbody>${rows.map((l) => html`<tr>
      <td data-label="Received">${formatDateTime(l.created_at)}</td>
      <td data-label="Name"><a href="/leads/${l.id}">${l.name}</a>${l.archived_at ? html` <span class="badge">Archived</span>` : ''}</td>
      <td data-label="Contact">${l.email}<br>${l.phone}</td>
      <td data-label="Project">${l.renovation_type}<br><span class="hint">${l.city}</span></td>
      <td data-label="Stage">${stageBadge(l.status)}</td>
      <td data-label="Contractor">${l.contractor_name || '—'}</td>
      <td data-label="Follow-up">${l.next_follow_up ? formatDate(l.next_follow_up) : '—'}</td>
      <td data-label="Emails">${emailBadge(l.customer_email_status)} ${emailBadge(l.internal_email_status)}</td>
    </tr>`)}</tbody></table></div>`
    : html`<p class="empty">No leads match these filters.</p>`}
  ${pager('/leads', rest, filters.page, total, pageSize)}
</div>`;
}

// ------------------------------------------------------------------ lead detail

export function leadPage({ detail, contractors, csrf, today }) {
  const { lead, notes, activity, followUps, jobs } = detail;
  const open = followUps.filter((f) => !f.completed_at);
  const done = followUps.filter((f) => f.completed_at);
  const post = (path) => `/leads/${lead.id}${path}`;
  // Activity always starts with the original submission (older leads have no stored history for that).
  const timeline = [...activity, { created_at: lead.created_at, summary: `Lead submitted via the ${SOURCE_LABEL[lead.source] || lead.source}`, actor_email: 'website' }];
  return html`
<p><a href="/leads">← All leads</a></p>
<h1>${lead.name} ${stageBadge(lead.status)} ${lead.archived_at ? html`<span class="badge">Archived</span>` : ''}</h1>
<div class="grid cols">
<div>
  <section class="card" aria-labelledby="sub-h">
    <h2 id="sub-h">Submitted information</h2>
    <dl class="kv">
      <dt>Received</dt><dd>${formatDateTime(lead.created_at)} (Toronto time)</dd>
      <dt>Source page</dt><dd>${SOURCE_LABEL[lead.source] || lead.source}</dd>
      <dt>Email</dt><dd><a href="mailto:${lead.email}">${lead.email}</a></dd>
      <dt>Phone</dt><dd><a href="${telHref(lead.phone)}">${lead.phone}</a></dd>
      <dt>City / postal code</dt><dd>${lead.city}</dd>
      <dt>Renovation type</dt><dd>${lead.renovation_type}</dd>
      <dt>Preferred start</dt><dd>${lead.project_timing}</dd>
      <dt>Target deadline</dt><dd>${lead.target_deadline || '—'}</dd>
      <dt>Project details</dt><dd class="pre">${lead.project_details || '—'}</dd>
    </dl>
  </section>

  <section class="card" aria-labelledby="notes-h">
    <h2 id="notes-h">Notes</h2>
    <form method="post" action="${post('/notes')}">
      ${csrfField(csrf)}
      <div class="field"><label for="note">Add a note</label><textarea id="note" name="body" maxlength="5000" required></textarea></div>
      <button type="submit">Save note</button>
    </form>
    ${notes.length ? html`<ul class="plain">${notes.map((n) => html`<li><div class="pre">${n.body}</div><span class="hint">${n.author_email} · ${formatDateTime(n.created_at)}</span></li>`)}</ul>` : html`<p class="empty">No notes yet.</p>`}
  </section>

  <section class="card" aria-labelledby="act-h">
    <h2 id="act-h">Activity history</h2>
    <ul class="plain">${timeline.map((a) => html`<li>${a.summary}<br><span class="hint">${formatDateTime(a.created_at)} · ${a.actor_email}</span></li>`)}</ul>
  </section>
</div>

<div>
  <section class="card" aria-labelledby="manage-h">
    <h2 id="manage-h">Manage lead</h2>
    <form method="post" action="${post('/stage')}" class="field">
      ${csrfField(csrf)}
      <label for="stage">Stage</label>
      <div class="row"><div class="field"><select id="stage" name="stage">${STAGES.map(([k, v]) => html`<option value="${k}" ${lead.status === k ? raw('selected') : ''}>${v}</option>`)}${STAGES.some(([k]) => k === lead.status) ? '' : html`<option value="${lead.status}" selected>${stageLabel(lead.status)}</option>`}</select></div><button type="submit">Update</button></div>
    </form>

    <form method="post" action="${post('/contractor')}" class="field">
      ${csrfField(csrf)}
      <label for="contractor_id">Assigned contractor</label>
      <div class="row"><div class="field"><select id="contractor_id" name="contractor_id"><option value="">Unassigned</option>${contractors.map((c) => html`<option value="${c.id}" ${lead.contractor_id === c.id ? raw('selected') : ''}>${c.name}${c.company ? ` — ${c.company}` : ''}</option>`)}</select></div><button type="submit">Save</button></div>
      <p class="hint">Internal record only. Assigning a contractor does not send them any customer details.</p>
    </form>

    <form method="post" action="${post('/assessment')}" class="field">
      ${csrfField(csrf)}
      <label for="assessment_at">Assessment date and time (Toronto time)</label>
      <div class="row"><div class="field"><input id="assessment_at" name="assessment_at" type="datetime-local" value="${lead.assessment_at ? utcIsoToTorontoInput(lead.assessment_at) : ''}"></div><button type="submit">Save</button></div>
      <p class="hint">Leave blank and save to clear. Recording a date does not change the stage or notify the customer.</p>
    </form>

    <form method="post" action="${post(lead.archived_at ? '/unarchive' : '/archive')}">
      ${csrfField(csrf)}
      <button type="submit" class="${lead.archived_at ? 'secondary' : 'danger'}">${lead.archived_at ? 'Restore from archive' : 'Archive lead'}</button>
      <p class="hint">${lead.archived_at ? 'Archived leads are hidden from the default list.' : 'Archiving hides the lead from the default list. Nothing is deleted.'}</p>
    </form>
  </section>

  <section class="card" aria-labelledby="fu-h">
    <h2 id="fu-h">Follow-ups</h2>
    <form method="post" action="${post('/follow-ups')}">
      ${csrfField(csrf)}
      <div class="field"><label for="due_on">Due date</label><input id="due_on" name="due_on" type="date" value="${today}" required></div>
      <div class="field"><label for="fu_note">Note (optional)</label><input id="fu_note" name="note" maxlength="500"></div>
      <button type="submit">Add follow-up</button>
    </form>
    ${open.length ? html`<h3>Open</h3><ul class="plain">${open.map((f) => html`<li>${f.due_on < today ? html`<span class="overdue">Overdue · </span>` : ''}${formatDate(f.due_on)}${f.note ? html` — ${f.note}` : ''}
      <form method="post" action="${post(`/follow-ups/${f.id}/complete`)}">${csrfField(csrf)}<input type="hidden" name="back" value="lead"><button class="secondary" type="submit">Mark complete</button></form></li>`)}</ul>` : html`<p class="empty">No open follow-ups.</p>`}
    ${done.length ? html`<h3>Completed</h3><ul class="plain">${done.map((f) => html`<li>${formatDate(f.due_on)}${f.note ? html` — ${f.note}` : ''}<br><span class="hint">Completed ${formatDateTime(f.completed_at)}</span></li>`)}</ul>` : ''}
  </section>

  <section class="card" aria-labelledby="em-h">
    <h2 id="em-h">Emails for this lead</h2>
    ${jobs.length ? html`<ul class="plain">${jobs.map((j) => emailJobItem(j, csrf))}</ul>` : html`<p class="empty">No email records.</p>`}
  </section>
</div>
</div>`;
}

function emailJobItem(j, csrf) {
  const cls = j.status === 'sent' ? 'b-ok' : j.status === 'failed' ? 'b-err' : 'b-warn';
  return html`<li><strong>${EMAIL_TYPE_LABEL[j.email_type] || j.email_type}</strong><br>
    <span class="badge ${cls}">${emailJobLabel(j)}</span>
    ${j.last_error && j.status !== 'sent' ? html`<br><span class="hint">Last error: ${String(j.last_error).slice(0, 200)}</span>` : ''}
    ${j.status === 'failed' ? retryForm(j, csrf) : ''}</li>`;
}

function retryForm(job, csrf, back = 'lead') {
  return html`<form method="post" action="/emails/${job.id}/retry">${csrfField(csrf)}<input type="hidden" name="back" value="${back}"><button class="secondary" type="submit">Retry this email</button></form>`;
}

// ------------------------------------------------------------------ follow-ups

export function followUpsPage({ data, csrf }) {
  const section = (id, title, rows, kind) => html`<section class="card" aria-labelledby="${id}">
    <h2 id="${id}">${title} (${rows.length})</h2>
    ${rows.length
      ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">${kind === 'done' ? 'Was due' : 'Due'}</th><th scope="col">Lead</th><th scope="col">Note</th><th scope="col">${kind === 'done' ? 'Completed' : 'Action'}</th></tr></thead>
      <tbody>${rows.map((f) => html`<tr>
        <td data-label="Due">${kind === 'overdue' ? html`<span class="overdue">${formatDate(f.due_on)}</span>` : formatDate(f.due_on)}</td>
        <td data-label="Lead"><a href="/leads/${f.lead_id}">${f.lead_name}</a> ${stageBadge(f.lead_status)}</td>
        <td data-label="Note">${f.note || '—'}</td>
        <td data-label="${kind === 'done' ? 'Completed' : 'Action'}">${kind === 'done' ? formatDateTime(f.completed_at) : html`<form method="post" action="/leads/${f.lead_id}/follow-ups/${f.id}/complete">${csrfField(csrf)}<input type="hidden" name="back" value="followups"><button class="secondary" type="submit">Mark complete</button></form>`}</td>
      </tr>`)}</tbody></table></div>`
      : html`<p class="empty">Nothing here.</p>`}
  </section>`;
  return html`<h1>Follow-ups</h1>
<p class="hint">Dates are calendar dates in Toronto time. Today is ${formatDate(data.today)}. Archived leads are not listed.</p>
${section('fu-over', 'Overdue', data.overdue, 'overdue')}
${section('fu-today', 'Due today', data.dueToday, 'today')}
${section('fu-up', 'Upcoming', data.upcoming, 'upcoming')}
${section('fu-done', 'Recently completed', data.completed, 'done')}`;
}

// ------------------------------------------------------------------ contractors

export function contractorsPage({ rows, csrf }) {
  return html`<h1>Contractors</h1>
<p><a class="btn" href="/contractors/new">Add contractor</a></p>
<p class="hint">A simple internal directory. Assigning a contractor to a lead does not email or share anything with them.</p>
<div class="card">
${rows.length ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Name</th><th scope="col">Company</th><th scope="col">Services</th><th scope="col">Area</th><th scope="col">Contact</th><th scope="col">Active leads</th></tr></thead>
<tbody>${rows.map((c) => html`<tr>
  <td data-label="Name"><a href="/contractors/${c.id}">${c.name}</a>${c.archived_at ? html` <span class="badge">Archived</span>` : ''}</td>
  <td data-label="Company">${c.company || '—'}</td>
  <td data-label="Services">${c.service_types || '—'}</td>
  <td data-label="Area">${c.service_area || '—'}</td>
  <td data-label="Contact">${c.email || '—'}${c.phone ? html`<br>${c.phone}` : ''}</td>
  <td data-label="Active leads">${c.active_leads}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No contractors yet.</p>`}
</div>`;
}

export function contractorFormPage({ contractor, csrf }) {
  const c = contractor || {};
  const editing = Boolean(contractor);
  const field = (id, label, value, extra = '') => html`<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" value="${value || ''}" ${raw(extra)}></div>`;
  return html`<p><a href="/contractors">← Contractors</a></p>
<h1>${editing ? 'Edit contractor' : 'Add contractor'} ${c.archived_at ? html`<span class="badge">Archived</span>` : ''}</h1>
<form class="card" method="post" action="${editing ? `/contractors/${c.id}` : '/contractors'}">
  ${csrfField(csrf)}
  ${field('name', 'Name (required)', c.name, 'required maxlength="200"')}
  ${field('company', 'Company', c.company, 'maxlength="200"')}
  ${field('service_types', 'Service types (e.g. kitchens, basements, flooring)', c.service_types, 'maxlength="500"')}
  ${field('service_area', 'Service area', c.service_area, 'maxlength="500"')}
  ${field('email', 'Email', c.email, 'type="email" maxlength="254"')}
  ${field('phone', 'Phone', c.phone, 'type="tel" maxlength="40"')}
  <div class="field"><label for="notes">Notes</label><textarea id="notes" name="notes" maxlength="5000">${c.notes || ''}</textarea></div>
  <button type="submit">${editing ? 'Save changes' : 'Add contractor'}</button>
</form>
${editing ? html`<form class="card" method="post" action="/contractors/${c.id}/${c.archived_at ? 'unarchive' : 'archive'}">${csrfField(csrf)}<button type="submit" class="${c.archived_at ? 'secondary' : 'danger'}">${c.archived_at ? 'Restore contractor' : 'Archive contractor'}</button><p class="hint">Archiving removes them from assignment lists; leads already assigned keep their record.</p></form>` : ''}`;
}

// ------------------------------------------------------------------ email activity

export function emailsPage({ result, filters, csrf }) {
  const { rows, total, pageSize, summary } = result;
  const tab = (status, label) => html`<a href="/emails${qs({ status })}" ${filters.status === status ? raw('aria-current="true"') : ''}>${label}${status ? ` (${summary[status] || 0})` : ''}</a>`;
  return html`<h1>Email activity</h1>
<div class="card">
  <p><strong>How to read these statuses.</strong> "Accepted by Resend" means Resend's API accepted the message for sending. This dashboard does not receive delivery or bounce reports, so it cannot confirm the email reached an inbox.</p>
  <p class="hint">"Retry" re-queues one failed email for the automatic check that runs every 15 minutes (the same retry logic used for every submission, with the original duplicate-protection key). Nothing is sent directly from this page.</p>
</div>
<nav class="tabs" aria-label="Filter by status">${tab('', 'All')}${tab('failed', 'Failed')}${tab('pending', 'Queued / retrying')}${tab('sending', 'Sending')}${tab('sent', 'Accepted')}</nav>
<div class="card">
${rows.length ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Lead</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Last error</th><th scope="col">Updated (Toronto)</th><th scope="col">Action</th></tr></thead>
<tbody>${rows.map((j) => html`<tr>
  <td data-label="Lead"><a href="/leads/${j.lead_id}">${j.lead_name}</a></td>
  <td data-label="Email">${EMAIL_TYPE_LABEL[j.email_type] || j.email_type}</td>
  <td data-label="Status">${emailJobLabel(j)}</td>
  <td data-label="Attempts">${j.attempts} / ${j.max_attempts}</td>
  <td data-label="Last error">${j.last_error && j.status !== 'sent' ? String(j.last_error).slice(0, 200) : '—'}</td>
  <td data-label="Updated">${formatDateTime(j.updated_at)}</td>
  <td data-label="Action">${j.status === 'failed' ? retryForm(j, csrf, 'emails') : '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No email records match.</p>`}
${pager('/emails', { status: filters.status }, filters.page, total, pageSize)}
</div>`;
}
