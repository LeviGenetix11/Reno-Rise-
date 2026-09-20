// Page renderers. Each returns an html`` value; all dynamic text is escaped by
// default (see html.js), so customer-submitted content is always inert.

import { html, raw, icon } from './html.js';
import { EMAIL_TYPE_LABEL, emailJobLabel, emailStatusLabel } from './constants.js';
import { formatDateTime } from './time.js';

const csrfField = (t) => html`<input type="hidden" name="csrf" value="${t}">`;


function emailBadge(status) {
  const cls = status === 'sent' ? 'b-ok' : status === 'failed' ? 'b-err' : 'b-warn';
  return html`<span class="badge ${cls}">${emailStatusLabel(status)}</span>`;
}

// Table helpers: keep the leads table narrow enough to fit without sideways scrolling.
const splitDateTime = (iso) => {
  const t = formatDateTime(iso);
  const i = t.lastIndexOf(', ');
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 2)];
};
const SHORT_EMAIL = { sent: 'Accepted', pending: 'Queued', failed: 'Failed' };
const emailPair = (l) => html`<div class="mail-pair"><span class="mini-l">Customer</span>${emailBadgeShort(l.customer_email_status)}</div><div class="mail-pair"><span class="mini-l">Internal</span>${emailBadgeShort(l.internal_email_status)}</div>`;
function emailBadgeShort(status) {
  const cls = status === 'sent' ? 'b-ok' : status === 'failed' ? 'b-err' : 'b-warn';
  return html`<span class="badge ${cls}" title="${emailStatusLabel(status)}${status === 'sent' ? ' (inbox delivery not verified)' : ''}">${SHORT_EMAIL[status] || status}</span>`;
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

// ------------------------------------------------------------------ email jobs (immediate confirmation / notification emails)

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

// ------------------------------------------------------------------ contractors

export function contractorsPage({ rows, csrf }) {
  return html`<h1>Contractors</h1>
<p><a class="btn" href="/contractors/new">${icon('plus')}Add contractor</a></p>
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

// Shared with crm-views.js so the CRM pages reuse the same small building blocks.
export { csrfField, qs, pager, emailBadgeShort, splitDateTime, telHref, emailJobItem, retryForm };
