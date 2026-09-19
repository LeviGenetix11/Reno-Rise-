// CRM page renderers. Every dynamic value is escaped by the html`` tag (html.js), so
// customer-submitted text can never become markup. Forms work without JavaScript
// (the Content-Security-Policy allows none): stage moves are plain selects, and the
// pipeline board never depends on drag and drop.

import { html, raw, icon } from './html.js';
import { csrfField, qs, pager, emailBadgeShort, splitDateTime, telHref, emailJobItem } from './views.js';
import { formatDate, formatDateTime, utcIsoToTorontoInput } from './time.js';
import { PROVENANCE_LABEL } from './crm-query.js';
import { formatPhoneDisplay, formatDuration, OUTCOME_LABEL as CALL_OUTCOME_TEXT } from '../../renorise-shared/calls.js';
import {
  STAGES,
  STAGE_KEYS,
  STAGE_LABEL,
  NEEDS_REVIEW_LABEL,
  LOST_REASONS,
  HOLD_REASONS,
  NOT_FIT_REASONS,
  reasonLabel,
  QUALIFICATION,
  QUALIFICATION_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  DELIVERY_STATUSES,
  DELIVERY_LABEL,
  CONTACT_METHODS,
  METHOD_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  CALL_OUTCOMES,
  CALL_DIRECTIONS,
  APPOINTMENT_KINDS,
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  INTAKE_CHANNELS,
  SOURCES,
  SOURCE_LABEL,
  MARKETING_SOURCES,
  MARKETING_SOURCE_LABEL,
  PERMISSION_CHANNELS,
  PERMISSION_CHANNEL_LABEL,
  PERMISSION_METHODS,
  PERMISSION_METHOD_LABEL,
  CRM_SETTING_META,
  stageLabel,
} from './crm-constants.js';
import { STOP_LABELS } from '../../renorise-shared/eligibility.js';

const options = (list, current) => list.map(([k, v]) => html`<option value="${k}" ${String(current ?? '') === k ? raw('selected') : ''}>${v}</option>`);
const val = (v) => (v === null || v === undefined ? '' : v);
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

// ------------------------------------------------------------------ small building blocks

export const stageBadge = (o) =>
  o.stage_needs_review
    ? html`<span class="badge st-review"><i class="dot dot-needs_review"></i>Needs a stage</span>`
    : html`<span class="badge st-${STAGE_KEYS.includes(o.stage) ? o.stage : 'other'}"><i class="dot dot-${STAGE_KEYS.includes(o.stage) ? o.stage : 'all'}"></i>${stageLabel(o.stage)}</span>`;

function chips(o) {
  return html`${o.priority === 'high' ? html`<span class="badge pri-high">High priority</span>` : ''}${o.priority === 'low' ? html`<span class="badge pri-low">Low priority</span>` : ''}${o.qualification === 'qualified' ? html`<span class="badge q-qualified">Qualified</span>` : ''}${o.qualification === 'not_a_fit' ? html`<span class="badge q-not_a_fit">Not a fit</span>` : ''}${o.is_test ? html`<span class="badge badge-test">Test record</span>` : ''}${o.archived_at ? html`<span class="badge">Archived</span>` : ''}`;
}

const stripWeekday = (d) => formatDate(d).replace(/^[A-Za-z]+, /, '');

function nextStep(o, today) {
  if (o.next_appointment && o.next_appointment >= new Date(Date.now() - 3600e3).toISOString()) return html`<span class="hint nowrap">Booked: ${formatDateTime(o.next_appointment)}</span>`;
  if (o.next_task_due) return html`<span class="hint">${o.next_task_due < today ? html`<span class="late">Overdue · </span>` : ''}${o.next_task_title ? `${o.next_task_title} · ` : ''}${stripWeekday(o.next_task_due)}</span>`;
  return '';
}

const provenanceBadge = (p) => html`<span class="pv pv-${['manual', 'system', 'provider'].includes(p) ? p : 'system'}">${PROVENANCE_LABEL[p] || PROVENANCE_LABEL.system}</span>`;

/** The unified timeline used on both project and contact pages. */
export function timelineList(items, { showProject = false } = {}) {
  if (!items.length) return html`<p class="empty">Nothing recorded yet.</p>`;
  return html`<p class="legend"><span>${provenanceBadge('manual')} typed in by a person</span><span>${provenanceBadge('system')} recorded by RenoRise</span><span>${provenanceBadge('provider')} reported by the email provider</span></p>
<ul class="timeline">${items.map((i) => html`<li class="tl-item tl-${['manual', 'provider'].includes(i.provenance) ? i.provenance : 'system'}">
  <div class="tl-head"><strong>${i.title}</strong> ${provenanceBadge(i.provenance)}</div>
  ${i.body ? html`<div class="tl-body pre">${i.body}</div>` : ''}
  <div class="hint">${formatDateTime(i.at)}${i.actor && i.provenance === 'manual' ? ` · ${i.actor}` : ''}${i.note && !i.href ? ` · ${i.note}` : ''}${i.href ? html` · <a href="${i.href}">${i.note || 'Open'}</a>` : ''}${showProject && i.opportunityId ? html` · <a href="/leads/${i.opportunityId}">project</a>` : ''}</div>
</li>`)}</ul>`;
}

// ------------------------------------------------------------------ overview

export function overviewPage({ counts, recent, appointments, today }) {
  const tile = (href, n, label, alert, ic, tone) => html`<a class="stat ${alert && n > 0 ? 'alert' : ''}" href="${href}"><span class="stat-ico tone-${tone}">${icon(ic)}</span><div class="n">${n}</div><div class="l">${label}</div></a>`;
  return html`
<h1>Overview</h1>
<div class="grid stats">
  ${tile('/leads?status=new_inquiry', counts.new_inquiries, 'New inquiries', false, 'users', 'blue')}
  ${tile('/follow-ups', counts.overdue, 'Overdue follow-ups', true, 'alert', 'red')}
  ${tile('/follow-ups', counts.due_today, 'Follow-ups due today', false, 'clock', 'gold')}
  ${tile('/today', counts.appointments_upcoming, 'Upcoming appointments', false, 'calendar', 'teal')}
  ${tile('/emails?status=failed', counts.email_failed, 'Email failures', true, 'mail', 'red')}
</div>
<p class="hint">Leads received in the last 7 days: ${counts.leads_7d}. Emails currently retrying: ${counts.email_retrying}. Test records are left out of these counts. <a href="/today">Open Today</a> to see what needs attention.</p>
<div class="grid cols">
  <section class="card" aria-labelledby="recent-h">
    <h2 id="recent-h">Latest leads</h2>
    ${recent.length ? html`<ul class="plain">${recent.map((o) => html`<li><a href="/leads/${o.id}">${o.contact_name}</a> ${stageBadge(o)}<br><span class="hint">${o.title} · ${dash(o.property_city)} · ${formatDateTime(o.created_at)}</span></li>`)}</ul>` : html`<p class="empty">No leads yet.</p>`}
    <p><a href="/leads">All leads</a></p>
  </section>
  <section class="card" aria-labelledby="asmt-h">
    <h2 id="asmt-h">Upcoming appointments</h2>
    ${appointments.length ? html`<ul class="plain">${appointments.map((a) => html`<li><a href="/leads/${a.opportunity_id}">${a.contact_name}</a><br><span class="hint">${APPOINTMENT_KIND_LABEL[a.kind] || a.kind} · ${formatDateTime(a.starts_at)}</span></li>`)}</ul>` : html`<p class="empty">No upcoming appointments recorded.</p>`}
  </section>
</div>`;
}

// ------------------------------------------------------------------ Today

export function todayPage({ data, csrf, staleForm }) {
  const { today } = data;
  const doneForm = (t) => html`<form method="post" action="/tasks/${t.id}/complete">${csrfField(csrf)}<input type="hidden" name="back" value="today"><button class="secondary" type="submit" aria-label="Mark done: ${t.title}">Mark done</button></form>`;
  const who = (r) => html`<a href="/leads/${r.id}">${r.contact_name}</a> <span class="hint">${r.title}</span>`;
  const taskRow = (t, late) => html`<div class="item-row"><div class="item-main">${t.opportunity_id ? html`<a href="/leads/${t.opportunity_id}">${t.contact_name || t.title}</a>` : t.contractor_id ? html`<a href="/contractors/${t.contractor_id}">${t.contractor_name}</a>` : html`<a href="/contacts/${t.contact_id}">${t.contact_name}</a>`}
    <div><span class="badge">${TASK_TYPE_LABEL[t.type] || t.type}</span> ${t.priority === 'high' ? html`<span class="badge pri-high">High</span>` : ''} ${t.title}</div>
    <div class="hint">${late ? html`<span class="late">Due ${formatDate(t.due_on)}</span>` : `Due ${formatDate(t.due_on)}`}${t.due_at ? ` · ${splitDateTime(t.due_at)[1]}` : ''}</div></div>${doneForm(t)}</div>`;
  const card = (id, title, rows, render, empty) => html`<section class="card" aria-labelledby="${id}"><h2 id="${id}">${title} (${rows.length})</h2>${rows.length ? rows.map(render) : html`<p class="empty">${empty}</p>`}</section>`;

  const hasAttention = data.callsToReturn.length + data.needsStage.length + data.newInquiries.length + data.overdueTasks.length + data.consultations.length + data.holdReviews.length + data.failedEmails.length + data.noNextAction.length + data.quotesNeedFollowUp.length + data.quiet.length + data.tasksToday.length;
  return html`
<h1>Today</h1>
<p class="hint">${formatDate(today)} (Toronto time). Everything here comes from real records. ${data.testRecordsHidden ? html`${data.testRecordsHidden} test record${data.testRecordsHidden === 1 ? ' is' : 's are'} left out. <a href="/leads?test=only">Show them</a>.` : ''}</p>
${hasAttention === 0 ? html`<div class="card"><p class="empty">Nothing needs attention right now.</p></div>` : ''}
<div class="today-grid">
  ${data.needsStage.length ? card('t-review', 'Existing records that need a stage', data.needsStage, (r) => html`<div class="item-row"><div class="item-main">${who(r)}<div class="hint">Older status “${r.legacy_status || ''}” could mean more than one thing. Open it and choose a stage.</div></div></div>`, '') : ''}
  ${data.newInquiries.length ? card('t-new', 'New inquiries with no recorded contact', data.newInquiries, (r) => html`<div class="item-row"><div class="item-main">${who(r)}<div class="hint">${r.past_threshold ? html`<span class="late">Waiting since ${formatDateTime(r.created_at)}</span>` : `Received ${formatDateTime(r.created_at)}`}${r.contact_phone ? html` · <a href="${telHref(r.contact_phone)}">${r.contact_phone}</a>` : ''}</div></div></div>`, '') : ''}
  ${data.callsToReturn.length ? card('t-calls', 'Phone calls to return', data.callsToReturn, (c) => html`<div class="item-row"><div class="item-main"><a href="/calls/${c.id}">${c.caller_withheld || !c.from_number ? 'Withheld number' : formatPhoneDisplay(c.from_number)}</a>${c.contact_name ? html` <span class="hint">${c.contact_name}</span>` : ''}<div class="hint">${CALL_OUTCOME_TEXT[c.outcome] || c.outcome}${c.outcome === 'voicemail' && c.recording_duration_seconds ? ` (${formatDuration(c.recording_duration_seconds)})` : ''} · ${formatDateTime(c.started_at)}</div></div></div>`, '') : ''}
  ${card('t-over', 'Overdue tasks', data.overdueTasks, (t) => taskRow(t, true), 'No overdue tasks.')}
  ${card('t-today', 'Tasks due today', data.tasksToday, (t) => taskRow(t, false), 'No tasks due today.')}
  ${card('t-appt', 'Consultations and assessments today', data.consultations, (a) => html`<div class="item-row"><div class="item-main"><a href="/leads/${a.opp_id}">${a.contact_name}</a> <span class="hint">${a.title}</span><div>${APPOINTMENT_KIND_LABEL[a.kind] || a.kind} · <strong>${splitDateTime(a.starts_at)[1]}</strong></div></div></div>`, 'Nothing booked for today.')}
  ${data.noNextAction.length ? card('t-none', 'Open leads with no next action', data.noNextAction, (r) => html`<div class="item-row"><div class="item-main">${who(r)} ${stageBadge(r)}<div class="hint">No open task and no booked appointment. Add one so it does not stall.</div></div></div>`, '') : ''}
  ${data.holdReviews.length ? card('t-hold', 'On hold: review date reached', data.holdReviews, (r) => html`<div class="item-row"><div class="item-main">${who(r)}<div class="hint">Review date ${formatDate(r.hold_review_on)}${r.stage_reason ? ` · ${reasonLabel(HOLD_REASONS, r.stage_reason) || ''}` : ''}</div></div></div>`, '') : ''}
  ${data.quotesNeedFollowUp.length ? card('t-quote', 'Quotes that may need a follow-up', data.quotesNeedFollowUp, (r) => html`<div class="item-row"><div class="item-main">${who(r)}<div class="hint">Stage changed to Quote sent ${formatDateTime(r.updated_at)}; nothing recorded since (threshold ${data.settings.quote_followup_days} days).</div></div></div>`, '') : ''}
  ${data.quiet.length ? card('t-quiet', 'Quiet leads', data.quiet, (r) => html`<div class="item-row"><div class="item-main">${who(r)} ${stageBadge(r)}<div class="hint">Nothing recorded since ${formatDateTime(r.updated_at)} (threshold ${data.settings.stale_days} days).</div></div></div>`, '') : ''}
  ${data.failedEmails.length ? card('t-mail', 'Emails that failed', data.failedEmails, (f) => html`<div class="item-row"><div class="item-main">${f.opportunity_id ? html`<a href="/leads/${f.opportunity_id}">${f.lead_name || 'Lead'}</a>` : html`${f.lead_name || 'Lead'}`} <span class="hint">${f.kind} email failed ${formatDateTime(f.updated_at)}</span></div><a class="btn secondary" href="${f.kind === 'follow-up' ? '/sequence' : '/emails?status=failed'}">Review</a></div>`, '') : ''}
</div>
<section class="card" aria-labelledby="t-set">
  <h2 id="t-set">Reminder thresholds</h2>
  <p class="hint">These only decide what shows up here. They are internal reminders for you, not promises to customers.</p>
  <form method="post" action="/settings/crm">${csrfField(csrf)}
    <div class="row">${Object.entries(CRM_SETTING_META).map(([k, m]) => html`<div class="field"><label for="s-${k}">${m.label}</label><input id="s-${k}" name="${k}" type="number" inputmode="numeric" min="${m.min}" max="${m.max}" value="${staleForm[k]}" required></div>`)}</div>
    <button type="submit">Save thresholds</button>
  </form>
</section>`;
}

// ------------------------------------------------------------------ leads: table and pipeline

const DEFAULT_FILTERS = { test: 'hide', view: 'table', archived: 'no' };
/** Filter values as an object for the pager, leaving out defaults so links stay short. */
function pagerParams(p) {
  const out = { ...p, view: '' };
  for (const [k, v] of Object.entries(DEFAULT_FILTERS)) if (out[k] === v) out[k] = '';
  return out;
}
function filterQs(params) {
  const p = { ...params };
  for (const [k, v] of Object.entries(DEFAULT_FILTERS)) if (p[k] === v) p[k] = '';
  return qs(p);
}

export function leadsPage({ result, board, filters, contractors, stages, testHidden, csrf, today }) {
  const { page, ...rest } = filters;
  const isBoard = filters.view === 'pipeline';
  const contractorLabel = filters.contractor === 'none' ? 'Unassigned' : (contractors.find((c) => c.id === filters.contractor) || {}).name || 'Selected contractor';
  const tabs = [['', 'All', stages.all], ...(stages.by.needs_review ? [['needs_review', NEEDS_REVIEW_LABEL.replace(' (existing record)', ''), stages.by.needs_review]] : []), ...STAGES.map(([k, label]) => [k, label, stages.by[k] || 0])];

  const chipList = [];
  if (filters.q) chipList.push(['Search', `“${filters.q}”`, { ...rest, q: '' }]);
  if (filters.status) chipList.push(['Stage', filters.status === 'needs_review' ? 'Needs a stage' : stageLabel(filters.status), { ...rest, status: '' }]);
  if (filters.qualification) chipList.push(['Qualification', QUALIFICATION_LABEL[filters.qualification], { ...rest, qualification: '' }]);
  if (filters.priority) chipList.push(['Priority', PRIORITY_LABEL[filters.priority], { ...rest, priority: '' }]);
  if (filters.source) chipList.push(['Submission source', SOURCE_LABEL[filters.source] || filters.source, { ...rest, source: '' }]);
  if (filters.contractor) chipList.push(['Contractor', contractorLabel, { ...rest, contractor: '' }]);
  if (filters.archived !== 'no') chipList.push(['Archive', filters.archived === 'only' ? 'Archived only' : 'Active + archived', { ...rest, archived: 'no' }]);
  if (filters.test !== 'hide') chipList.push(['Test records', filters.test === 'only' ? 'Only test records' : 'Shown with the rest', { ...rest, test: 'hide' }]);
  const on = (cond) => (cond ? 'is-active' : '');
  const total = isBoard ? board.rows.length : result.total;

  return html`
<h1>Leads</h1>
<div class="view-switch" role="group" aria-label="Choose a view">
  <nav class="tabs" aria-label="View"><a href="/leads${filterQs({ ...rest, view: 'table' })}" ${!isBoard ? raw('aria-current="true"') : ''}>Table</a><a href="/leads${filterQs({ ...rest, view: 'pipeline' })}" ${isBoard ? raw('aria-current="true"') : ''}>${icon('board')}Pipeline</a></nav>
  <a class="btn" href="/leads/new">${icon('plus')}Add an inquiry</a>
</div>
${isBoard ? '' : html`<nav class="stage-tabs" aria-label="Filter by stage">
  ${tabs.map(([key, label, n]) => html`<a class="tab" href="/leads${filterQs({ ...rest, status: key })}" ${filters.status === key ? raw('aria-current="true"') : ''}><i class="dot dot-${key || 'all'}"></i>${label} <span class="count">${n}</span></a>`)}
</nav>`}
<form class="card filters" method="get" action="/leads" role="search" aria-label="Search and filter leads">
  <input type="hidden" name="status" value="${isBoard ? '' : filters.status}"><input type="hidden" name="view" value="${filters.view}">
  <div class="row">
    <div class="field"><label for="q">Search</label><div class="search">${icon('search')}<input id="q" name="q" type="search" class="${on(filters.q)}" value="${filters.q}" placeholder="Name, email, phone, city, project, tag" maxlength="100"></div></div>
    <div class="field"><label for="source">Submission source</label><select id="source" name="source" class="${on(filters.source)}"><option value="">All sources</option>${options(SOURCES, filters.source)}</select></div>
    <div class="field"><label for="qualification">Qualification</label><select id="qualification" name="qualification" class="${on(filters.qualification)}"><option value="">Any</option>${options(QUALIFICATION, filters.qualification)}</select></div>
    <div class="field"><label for="priority">Priority</label><select id="priority" name="priority" class="${on(filters.priority)}"><option value="">Any</option>${options(PRIORITIES, filters.priority)}</select></div>
    <div class="field"><label for="contractor">Contractor</label><select id="contractor" name="contractor" class="${on(filters.contractor)}"><option value="">Any</option><option value="none" ${filters.contractor === 'none' ? raw('selected') : ''}>Unassigned</option>${contractors.map((c) => html`<option value="${c.id}" ${filters.contractor === c.id ? raw('selected') : ''}>${c.name}</option>`)}</select></div>
    <div class="field"><label for="archived">Archive</label><select id="archived" name="archived" class="${on(filters.archived !== 'no')}"><option value="no" ${filters.archived === 'no' ? raw('selected') : ''}>Active only</option><option value="all" ${filters.archived === 'all' ? raw('selected') : ''}>Active + archived</option><option value="only" ${filters.archived === 'only' ? raw('selected') : ''}>Archived only</option></select></div>
    <div class="field"><label for="test">Test records</label><select id="test" name="test" class="${on(filters.test !== 'hide')}"><option value="hide" ${filters.test === 'hide' ? raw('selected') : ''}>Hide test records</option><option value="all" ${filters.test === 'all' ? raw('selected') : ''}>Show them too</option><option value="only" ${filters.test === 'only' ? raw('selected') : ''}>Only test records</option></select></div>
  </div>
  <div class="actions">
    <button type="submit">${icon('filter')}Apply</button>
    <a class="btn btn-dark" href="/leads/export.csv${filterQs({ ...rest, view: '' })}">${icon('download')}Export CSV (${total} lead${total === 1 ? '' : 's'})</a>
    ${chipList.length ? html`<a class="link-clear" href="/leads${isBoard ? '?view=pipeline' : ''}">Clear all filters</a>` : ''}
  </div>
</form>
${chipList.length ? html`<div class="chips" role="group" aria-label="Active filters"><span class="chips-label">Active filters:</span>${chipList.map(([label, value, params]) => html`<a class="chip" href="/leads${filterQs(params)}" aria-label="Remove filter ${label}: ${value}">${label}: ${value}${icon('x')}</a>`)}</div>` : ''}
${filters.test === 'hide' && testHidden ? html`<p class="hint">${testHidden} test record${testHidden === 1 ? ' is' : 's are'} hidden. They are still saved and are never counted in business numbers.</p>` : ''}
${isBoard ? pipelineBoard({ board, csrf, today, rest }) : leadsTable({ result, filters, rest, today })}`;
}

function leadsTable({ result, filters, rest, today }) {
  const { rows, total, pageSize } = result;
  return html`<div class="card">
  ${rows.length
    ? html`<div class="tablewrap"><table class="stack"><caption class="sr-only">Leads, newest first</caption>
    <thead><tr><th scope="col">Received (Toronto)</th><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Stage and next step</th><th scope="col">Emails</th></tr></thead>
    <tbody>${rows.map((o) => html`<tr>
      <td data-label="Received"><span class="nowrap">${splitDateTime(o.created_at)[0]}</span><br><span class="hint">${splitDateTime(o.created_at)[1]}</span></td>
      <td data-label="Name"><a href="/leads/${o.id}">${o.contact_name}</a><br><span class="hint">${o.title}${o.property_city ? ` · ${o.property_city}` : ''}</span>${o.submission_count > 1 ? html`<br><span class="hint">${o.submission_count} submissions</span>` : ''}${o.contractor_name ? html`<br><span class="hint">Contractor: ${o.contractor_name}</span>` : ''}</td>
      <td data-label="Contact">${o.contact_email ? o.contact_email : ''}${o.contact_email && o.contact_phone ? html`<br>` : ''}${o.contact_phone || (o.contact_email ? '' : '—')}</td>
      <td data-label="Stage">${stageBadge(o)} ${chips(o)}${nextStep(o, today) ? html`<br>${nextStep(o, today)}` : ''}</td>
      <td data-label="Emails">${o.customer_email_status === 'not_applicable' ? html`<span class="hint">None (entered manually)</span>` : html`<div class="mail-pair"><span class="mini-l">Customer</span>${emailBadgeShort(o.customer_email_status)}</div><div class="mail-pair"><span class="mini-l">Internal</span>${emailBadgeShort(o.internal_email_status)}</div>`}</td>
    </tr>`)}</tbody></table></div>`
    : html`<p class="empty">No leads match these filters.</p>`}
  ${pager('/leads', pagerParams(rest), filters.page, total, pageSize)}
</div>`;
}

const LANE_CARD_CAP = 30;


function pipelineBoard({ board, csrf, today, rest }) {
  const byStage = new Map();
  for (const o of board.rows) {
    const key = o.stage_needs_review ? 'needs_review' : o.stage;
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key).push(o);
  }
  const lanes = [...(byStage.has('needs_review') ? [['needs_review', 'Needs a stage']] : []), ...STAGES];
  return html`<p class="hint">Each card has a “Move to” control, so a stage can be changed with the keyboard or a phone. Scroll sideways to see every stage. Moving a card to Lost or On hold asks for a reason first.${board.capped ? ` Showing the newest ${board.cap} matching leads; narrow the filters to see others.` : ''}</p>
<div class="board" role="region" aria-label="Pipeline board, scrolls sideways" tabindex="0">
${lanes.map(([key, label]) => {
    const cards = byStage.get(key) || [];
    return html`<section class="lane" aria-labelledby="lane-${key}">
    <h2 id="lane-${key}"><span class="name"><i class="dot dot-${key}"></i>${label}</span> <span class="count">${cards.length}</span></h2>
    ${cards.length ? cards.slice(0, LANE_CARD_CAP).map((o) => html`<article class="pcard">
      <a class="pc-title" href="/leads/${o.id}">${o.contact_name}</a>
      <p class="pc-sub">${o.title}${o.property_city ? ` · ${o.property_city}` : ''}</p>
      <div class="pc-chips">${chips(o)}</div>
      ${nextStep(o, today) ? html`<div>${nextStep(o, today)}</div>` : ''}
      <form class="mover" method="post" action="/leads/${o.id}/stage">${csrfField(csrf)}<input type="hidden" name="back" value="board">
        <label class="sr-only" for="mv-${o.id}">Move ${o.contact_name}, ${o.title}, to stage</label>
        <select id="mv-${o.id}" name="stage">${STAGES.map(([k, v]) => html`<option value="${k}" ${o.stage === k ? raw('selected') : ''}>${v}</option>`)}${o.stage_needs_review ? html`<option value="" selected disabled>Choose a stage…</option>` : ''}</select>
        <button class="secondary" type="submit" aria-label="Move ${o.contact_name}">Move</button>
      </form>
    </article>`) : html`<p class="lane-empty">Nothing here.</p>`}
    ${cards.length > LANE_CARD_CAP ? html`<p class="lane-more"><a href="/leads${filterQs({ ...rest, view: 'table', status: key })}">${cards.length - LANE_CARD_CAP} more in the table view</a></p>` : ''}
  </section>`;
  })}
</div>`;
}

// ------------------------------------------------------------------ project page

const reasonText = (o) => {
  if (o.stage === 'lost') return reasonLabel(LOST_REASONS, o.stage_reason) || 'Reason not recorded (existing record)';
  if (o.stage === 'on_hold') return reasonLabel(HOLD_REASONS, o.stage_reason) || 'Reason not recorded';
  return null;
};

function locationText(o) {
  return [o.property_address, o.property_city, o.property_postal_code].filter(Boolean).join(', ');
}

function budgetText(o) {
  if (o.budget_status !== 'stated') return 'Not yet discussed';
  const f = (n) => `$${Number(n).toLocaleString('en-CA')}`;
  const range = o.budget_min != null && o.budget_max != null ? `${f(o.budget_min)} to ${f(o.budget_max)}` : o.budget_min != null ? `From ${f(o.budget_min)}` : `Up to ${f(o.budget_max)}`;
  return `${range} ${o.budget_currency}`;
}

export function projectPage(d) {
  const { opp: o, contact, submissions, timeline, tasks, appointments, calls, contractors, csrf, today, sequenceHtml, seqLead, jobs, duplicates, assignees } = d;
  const post = (path) => `/leads/${o.id}${path}`;
  const first = submissions[0];
  const openTasks = tasks.filter((t) => t.status === 'open');
  const doneTasks = tasks.filter((t) => t.status !== 'open');
  const detailText = reasonText(o);
  const stageNote = o.stage_note ? html` — “${o.stage_note}”` : '';

  return html`
<p><a href="/leads">← All leads</a></p>
<h1>${o.title} ${stageBadge(o)}</h1>
<p class="hint"><strong><a href="/contacts/${contact.id}">${contact.display_name}</a></strong>${contact.phone ? html` · <a href="${telHref(contact.phone)}">${contact.phone}</a>` : ''}${contact.email ? html` · <a href="mailto:${contact.email}">${contact.email}</a>` : ''} <span class="pc-chips">${chips(o)}</span></p>
${duplicates.length ? html`<div class="banner" role="note"><strong>Possible duplicate.</strong> Someone else on file shares this contact’s email or phone: ${duplicates.map((c, i) => html`${i ? ', ' : ''}<a href="/contacts/${c.id}">${c.display_name}</a>`)}. Nothing was merged. A repeat submission for a different project is normal; review only if it is the same project twice.</div>` : ''}
${o.stage_needs_review ? html`<div class="banner"><strong>This is an existing record and it needs a stage.</strong> Its earlier status was “${o.legacy_status}”, which could mean more than one thing now, so it was not converted automatically. Choose the stage below.</div>` : ''}
<nav class="jump" aria-label="Jump to a section"><span class="chips-label">Jump to:</span><a class="chip" href="#stage">Stage</a><a class="chip" href="#log">Log a call</a><a class="chip" href="#tasks">Tasks</a><a class="chip" href="#appointments">Appointments</a><a class="chip" href="#timeline">Timeline</a></nav>
<div class="grid cols">
<div>
  <section class="card" aria-labelledby="proj-h">
    <h2 id="proj-h">Project</h2>
    <dl class="kv">
      <dt>Renovation type</dt><dd>${dash(o.renovation_type)}</dd>
      <dt>Property</dt><dd>${dash(locationText(o))}</dd>
      <dt>Scope</dt><dd class="pre">${dash(o.scope)}</dd>
      <dt>Description</dt><dd class="pre">${dash(o.description)}</dd>
      <dt>Desired start</dt><dd>${o.desired_start_date ? formatDate(o.desired_start_date) : ''}${o.desired_start_date && o.desired_start_note ? ' · ' : ''}${o.desired_start_note || (o.desired_start_date ? '' : '—')}</dd>
      <dt>Target completion</dt><dd>${o.target_completion_date ? formatDate(o.target_completion_date) : ''}${o.target_completion_date && o.target_completion_note ? ' · ' : ''}${o.target_completion_note || (o.target_completion_date ? '' : '—')}</dd>
      <dt>Budget</dt><dd>${budgetText(o)}</dd>
      <dt>Homeowner</dt><dd>${{ yes: 'Yes', no: 'No', unknown: 'Not known' }[o.is_homeowner] || 'Not known'}${o.decision_maker ? html` · Decision-maker: ${o.decision_maker}` : ''}</dd>
      <dt>Marketing source</dt><dd>${MARKETING_SOURCE_LABEL[o.marketing_source] || o.marketing_source}${o.customer_reported_source ? html` · Customer said: “${o.customer_reported_source}”` : ''}</dd>
      <dt>Submitted through</dt><dd>${first ? SOURCE_LABEL[first.source] || first.source : '—'}</dd>
    </dl>
    <details class="edit"><summary>Edit project details</summary><div class="body">${projectForm({ o, action: post('/details'), csrf, submit: 'Save project details' })}</div></details>
  </section>

  <section class="card" id="log" aria-labelledby="log-h">
    <h2 id="log-h">Log a call or add a note</h2>
    ${callForm({ action: post('/calls'), csrf, showMove: o.stage === 'new_inquiry' || o.stage === 'contact_attempted', phone: contact.phone })}
    <form method="post" action="${post('/notes')}">${csrfField(csrf)}
      <div class="field"><label for="note">Add a note</label><textarea id="note" name="body" maxlength="5000" required></textarea></div>
      <button type="submit">Save note</button>
    </form>
  </section>

  <section class="card" id="timeline" aria-labelledby="tl-h">
    <h2 id="tl-h">Timeline</h2>
    ${timelineList(timeline)}
  </section>

  <section class="card" aria-labelledby="sub-h">
    <h2 id="sub-h">Original submission${submissions.length === 1 ? '' : 's'} <span class="hint">(kept exactly as received)</span></h2>
    ${submissions.map((s, i) => html`${submissions.length > 1 ? html`<h3>Submission ${i + 1} of ${submissions.length}</h3>` : ''}<dl class="kv">
      <dt>Received</dt><dd>${formatDateTime(s.created_at)} (Toronto time)</dd>
      <dt>Came in through</dt><dd>${SOURCE_LABEL[s.source] || s.source}</dd>
      <dt>Name as given</dt><dd>${s.name}</dd>
      <dt>Email</dt><dd>${s.email ? html`<a href="mailto:${s.email}">${s.email}</a>` : 'None given'}</dd>
      <dt>Phone</dt><dd>${s.phone ? html`<a href="${telHref(s.phone)}">${s.phone}</a>` : 'None given'}</dd>
      <dt>City / postal code</dt><dd>${dash(s.city)}</dd>
      <dt>Renovation type</dt><dd>${dash(s.renovation_type)}</dd>
      <dt>Preferred start</dt><dd>${dash(s.project_timing)}</dd>
      <dt>Target deadline</dt><dd>${dash(s.target_deadline)}</dd>
      <dt>Project details</dt><dd class="pre">${dash(s.project_details)}</dd>
    </dl>`)}
  </section>
</div>

<div>
  <section class="card" id="stage" aria-labelledby="stage-h">
    <h2 id="stage-h">Stage</h2>
    <p>${stageBadge(o)} ${detailText ? html`<span class="hint">${detailText}${stageNote}</span>` : ''}</p>
    ${o.stage === 'on_hold' ? html`<p class="hint">Review on ${o.hold_review_on ? formatDate(o.hold_review_on) : 'no date set'}. Follow-up emails were paused and are not resumed automatically.</p>
      <form method="post" action="${post('/resume')}">${csrfField(csrf)}<button class="secondary" type="submit">Resume (back to ${stageLabel(o.hold_from_stage) === NEEDS_REVIEW_LABEL ? 'New inquiry' : stageLabel(o.hold_from_stage)})</button></form>` : ''}
    <form method="post" action="${post('/stage')}">${csrfField(csrf)}
      <div class="field"><label for="stage-select">Move to stage</label><select id="stage-select" name="stage">${o.stage_needs_review ? html`<option value="" selected disabled>Choose a stage…</option>` : ''}${options(STAGES, o.stage)}</select></div>
      <fieldset class="reasons"><legend>Only needed for Lost or On hold</legend>
        <div class="field"><label for="lost-reason">If Lost: why?</label><select id="lost-reason" name="lost_reason"><option value="">Choose a reason…</option>${options(LOST_REASONS, o.stage === 'lost' ? o.stage_reason : '')}</select></div>
        <div class="field"><label for="hold-reason">If On hold: why?</label><select id="hold-reason" name="hold_reason"><option value="">Choose a reason…</option>${options(HOLD_REASONS, o.stage === 'on_hold' ? o.stage_reason : '')}</select></div>
        <div class="field"><label for="hold-review">If On hold: review on</label><input id="hold-review" name="review_on" type="date" value="${val(o.hold_review_on)}"></div>
        <div class="field"><label for="stage-note">Note (required if the reason is “Other”)</label><input id="stage-note" name="note" maxlength="1000" value="${val(o.stage_note)}"></div>
      </fieldset>
      <button type="submit">Update stage</button>
      <p class="sec-note">Moving to Consultation booked, Referred, Quote pending, Quote sent, Won or Lost stops this project’s automatic follow-up emails. On hold pauses them. Nothing ever restarts them automatically.</p>
    </form>
    ${o.stage === 'won' ? html`<form method="post" action="${post('/delivery')}">${csrfField(csrf)}
      <div class="field"><label for="delivery">Work status (separate from the sales outcome)</label><select id="delivery" name="delivery_status">${options(DELIVERY_STATUSES, o.delivery_status)}</select></div>
      <button class="secondary" type="submit">Save work status</button></form>` : ''}
  </section>

  <section class="card" aria-labelledby="qual-h">
    <h2 id="qual-h">Qualification</h2>
    <p class="hint">Separate from the stage. ${o.qualification === 'not_a_fit' ? html`Reason: ${reasonLabel(NOT_FIT_REASONS, o.qualification_reason) || '—'}${o.qualification_note ? ` — “${o.qualification_note}”` : ''}` : ''}</p>
    <form method="post" action="${post('/qualification')}">${csrfField(csrf)}
      <div class="field"><label for="qual">Qualification</label><select id="qual" name="value">${options(QUALIFICATION, o.qualification)}</select></div>
      <fieldset class="reasons"><legend>Only needed for Not a fit</legend>
        <div class="field"><label for="nf-reason">Why is it not a fit?</label><select id="nf-reason" name="reason"><option value="">Choose a reason…</option>${options(NOT_FIT_REASONS, o.qualification_reason)}</select></div>
        <div class="field"><label for="nf-note">Note (required if the reason is “Other”)</label><input id="nf-note" name="note" maxlength="1000" value="${val(o.qualification_note)}"></div>
      </fieldset>
      <button type="submit">Save qualification</button>
      <p class="sec-note">Not a fit also stops this project’s automatic follow-up emails.</p>
    </form>
  </section>

  <section class="card" id="appointments" aria-labelledby="appt-h">
    <h2 id="appt-h">Consultations and assessments</h2>
    ${appointments.length ? html`<ul class="plain">${appointments.map((a) => html`<li><strong>${APPOINTMENT_KIND_LABEL[a.kind] || a.kind}</strong> · ${formatDateTime(a.starts_at)} · <span class="badge ${a.status === 'scheduled' ? 'b-ok' : ''}">${APPOINTMENT_STATUS_LABEL[a.status] || a.status}</span>${a.source === 'legacy_assessment' ? html`<br><span class="hint">Carried over from the earlier “assessment date”. It was recorded as an on-site assessment.</span>` : ''}${a.notes ? html`<br><span class="hint">${a.notes}</span>` : ''}
      ${a.status === 'scheduled' ? html`<form method="post" action="/appointments/${a.id}/reschedule" class="row">${csrfField(csrf)}<input type="hidden" name="opp" value="${o.id}"><div class="field"><label for="rs-${a.id}">Reschedule to (Toronto time)</label><input id="rs-${a.id}" name="starts_at" type="datetime-local" value="${utcIsoToTorontoInput(a.starts_at)}" required></div><button class="secondary" type="submit">Reschedule</button></form>
      <form method="post" action="/appointments/${a.id}/status" class="row">${csrfField(csrf)}<input type="hidden" name="opp" value="${o.id}"><div class="field"><label for="st-${a.id}">Mark as</label><select id="st-${a.id}" name="status"><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option></select></div><button class="secondary" type="submit">Save</button></form>` : ''}</li>`)}</ul>` : html`<p class="empty">Nothing recorded.</p>`}
    <form method="post" action="${post('/appointments')}">${csrfField(csrf)}
      <div class="field"><label for="ap-kind">Kind</label><select id="ap-kind" name="kind">${options(APPOINTMENT_KINDS, 'phone_consultation')}</select></div>
      <div class="field"><label for="ap-when">Date and time (Toronto time)</label><input id="ap-when" name="starts_at" type="datetime-local" required></div>
      <div class="field"><label for="ap-notes">Notes (optional)</label><input id="ap-notes" name="notes" maxlength="500"></div>
      <label class="checkline"><input type="checkbox" name="move_stage" value="yes" checked> Also move the stage to Consultation booked (only if it is still earlier than that)</label>
      <button type="submit">Record appointment</button>
      <p class="sec-note">Recording a booking stops the automatic follow-up emails for this project. Nothing is sent to the customer, and cancelling later does not restart them.</p>
    </form>
  </section>

  <section class="card" id="tasks" aria-labelledby="fu-h">
    <h2 id="fu-h">Follow-up tasks</h2>
    ${taskForm({ action: post('/tasks'), csrf, today, assignees, id: 'pt' })}
    ${openTasks.length ? html`<h3>Open</h3><ul class="plain">${openTasks.map((t) => taskItem(t, csrf, today, 'lead'))}</ul>` : html`<p class="empty">No open tasks. ${o.archived_at || ['won', 'lost'].includes(o.stage) ? '' : 'Add one so this project has a next action.'}</p>`}
    ${doneTasks.length ? html`<h3>Finished</h3><ul class="plain">${doneTasks.map((t) => html`<li>${TASK_TYPE_LABEL[t.type] || t.type}: ${t.title}<br><span class="hint">${t.status === 'done' ? 'Completed' : 'Cancelled'} ${formatDateTime(t.completed_at)}${t.completion_note ? ` · ${t.completion_note}` : ''}</span></li>`)}</ul>` : ''}
  </section>

  <section class="card" aria-labelledby="ctr-h">
    <h2 id="ctr-h">Contractor</h2>
    <form method="post" action="${post('/contractor')}">${csrfField(csrf)}
      <div class="field"><label for="contractor_id">Assigned contractor</label><select id="contractor_id" name="contractor_id"><option value="">Unassigned</option>${contractors.map((c) => html`<option value="${c.id}" ${o.contractor_id === c.id ? raw('selected') : ''}>${c.name}${c.company ? ` — ${c.company}` : ''}</option>`)}</select></div>
      <button type="submit">Save</button>
      <p class="sec-note">Internal record only. Assigning a contractor does not send them any customer details.</p>
    </form>
  </section>

  ${sequenceHtml || ''}
  ${seqLead && seqLead.email && contact.email && seqLead.email.trim().toLowerCase() !== contact.email.trim().toLowerCase() ? html`<p class="banner info">Follow-up emails go to the address on the original submission (${seqLead.email}), not to the contact’s current email. Recorded permission belongs to that address.</p>` : ''}

  <section class="card" aria-labelledby="em-h">
    <h2 id="em-h">Emails for this lead</h2>
    ${jobs.length ? html`<ul class="plain">${jobs.map((j) => emailJobItem(j, csrf))}</ul>` : html`<p class="empty">No email records. Entries made by hand send no email.</p>`}
  </section>

  <section class="card" aria-labelledby="mg-h">
    <h2 id="mg-h">Manage</h2>
    <form method="post" action="${post(o.archived_at ? '/unarchive' : '/archive')}">${csrfField(csrf)}
      <button type="submit" class="${o.archived_at ? 'secondary' : 'danger'}">${o.archived_at ? 'Restore from archive' : 'Archive this project'}</button>
      <p class="sec-note">${o.archived_at ? 'Restoring does not restart any follow-up emails.' : 'Archiving hides it from the default lists and stops its follow-up emails. Nothing is deleted.'}</p>
    </form>
    <form method="post" action="${post('/test')}">${csrfField(csrf)}<input type="hidden" name="flag" value="${o.is_test ? '0' : '1'}">
      <button type="submit" class="secondary">${o.is_test ? 'Remove the test-record mark' : 'Mark as a test record'}</button>
      <p class="sec-note">Test records are saved but left out of business counts, Today and reports by default.</p>
    </form>
  </section>
</div>
</div>`;
}

// ------------------------------------------------------------------ shared form pieces

export function projectForm({ o = {}, action, csrf, submit }) {
  return html`<form method="post" action="${action}">${csrfField(csrf)}${projectFields(o)}<button type="submit">${submit}</button></form>`;
}

export function projectFields(o = {}) {
  return html`<div class="form-grid">
    <div class="field"><label for="f-title">Project title</label><input id="f-title" name="title" maxlength="200" value="${val(o.title)}"></div>
    <div class="field"><label for="f-type">Renovation type</label><input id="f-type" name="renovation_type" maxlength="300" value="${val(o.renovation_type)}"></div>
    <div class="field"><label for="f-addr">Street address (only if given)</label><input id="f-addr" name="property_address" maxlength="300" value="${val(o.property_address)}" autocomplete="off"></div>
    <div class="field"><label for="f-city">City</label><input id="f-city" name="property_city" maxlength="200" value="${val(o.property_city)}"></div>
    <div class="field"><label for="f-postal">Postal code (only if given)</label><input id="f-postal" name="property_postal_code" maxlength="12" value="${val(o.property_postal_code)}" placeholder="M5V 3A3"></div>
    <div class="field"><label for="f-priority">Priority</label><select id="f-priority" name="priority">${options(PRIORITIES, o.priority || 'normal')}</select></div>
  </div>
  <div class="field"><label for="f-scope">Scope</label><textarea id="f-scope" name="scope" maxlength="5000">${val(o.scope)}</textarea></div>
  <div class="field"><label for="f-desc">Project description</label><textarea id="f-desc" name="description" maxlength="5000">${val(o.description)}</textarea></div>
  <div class="form-grid">
    <div class="field"><label for="f-sdate">Desired start date</label><input id="f-sdate" name="desired_start_date" type="date" value="${val(o.desired_start_date)}"></div>
    <div class="field"><label for="f-snote">Desired start (in their words)</label><input id="f-snote" name="desired_start_note" maxlength="300" value="${val(o.desired_start_note)}"></div>
    <div class="field"><label for="f-cdate">Target completion date</label><input id="f-cdate" name="target_completion_date" type="date" value="${val(o.target_completion_date)}"></div>
    <div class="field"><label for="f-cnote">Target completion (in their words)</label><input id="f-cnote" name="target_completion_note" maxlength="300" value="${val(o.target_completion_note)}"></div>
  </div>
  <fieldset class="reasons"><legend>Budget</legend>
    <div class="form-grid">
      <div class="field"><label for="f-bstatus">Budget</label><select id="f-bstatus" name="budget_status"><option value="not_discussed" ${o.budget_status !== 'stated' ? raw('selected') : ''}>Not yet discussed</option><option value="stated" ${o.budget_status === 'stated' ? raw('selected') : ''}>Discussed (fill in below)</option></select></div>
      <div class="field"><label for="f-bmin">Minimum (whole dollars)</label><input id="f-bmin" name="budget_min" inputmode="numeric" value="${val(o.budget_min)}"></div>
      <div class="field"><label for="f-bmax">Maximum (whole dollars)</label><input id="f-bmax" name="budget_max" inputmode="numeric" value="${val(o.budget_max)}"></div>
      <div class="field"><label for="f-bcur">Currency</label><select id="f-bcur" name="budget_currency"><option value="CAD" ${o.budget_currency !== 'USD' ? raw('selected') : ''}>Canadian dollars</option><option value="USD" ${o.budget_currency === 'USD' ? raw('selected') : ''}>US dollars</option></select></div>
    </div>
  </fieldset>
  <div class="form-grid">
    <div class="field"><label for="f-home">Is the customer the homeowner?</label><select id="f-home" name="is_homeowner"><option value="unknown" ${!['yes', 'no'].includes(o.is_homeowner) ? raw('selected') : ''}>Not known</option><option value="yes" ${o.is_homeowner === 'yes' ? raw('selected') : ''}>Yes</option><option value="no" ${o.is_homeowner === 'no' ? raw('selected') : ''}>No</option></select></div>
    <div class="field"><label for="f-dm">Decision-maker (only if supplied)</label><input id="f-dm" name="decision_maker" maxlength="300" value="${val(o.decision_maker)}"></div>
    <div class="field"><label for="f-ms">Marketing source (your judgement)</label><select id="f-ms" name="marketing_source">${options(MARKETING_SOURCES, o.marketing_source || 'unknown')}</select></div>
    <div class="field"><label for="f-crs">Customer says they found us through</label><input id="f-crs" name="customer_reported_source" maxlength="200" value="${val(o.customer_reported_source)}"></div>
  </div>`;
}

export function callForm({ action, csrf, showMove, phone }) {
  return html`<form method="post" action="${action}">${csrfField(csrf)}
  <p class="sec-note">Only calls you record here count. Tapping a phone link does not.${phone ? html` <a href="${telHref(phone)}">Call ${phone}</a>` : ''}</p>
  <div class="form-grid">
    <div class="field"><label for="c-out">Outcome</label><select id="c-out" name="outcome">${options(CALL_OUTCOMES, 'connected')}</select></div>
    <div class="field"><label for="c-dir">Direction</label><select id="c-dir" name="direction">${options(CALL_DIRECTIONS, 'outbound')}</select></div>
    <div class="field"><label for="c-when">When (Toronto time; blank = now)</label><input id="c-when" name="occurred_at" type="datetime-local"></div>
  </div>
  <div class="field"><label for="c-sum">Short summary</label><textarea id="c-sum" name="summary" maxlength="2000"></textarea></div>
  <div class="form-grid">
    <div class="field"><label for="c-next">Next action (optional)</label><input id="c-next" name="next_title" maxlength="300" placeholder="e.g. Send the kitchen ideas"></div>
    <div class="field"><label for="c-due">Next action due</label><input id="c-due" name="next_due" type="date"></div>
  </div>
  ${showMove ? html`<label class="checkline"><input type="checkbox" name="move_stage" value="yes" checked> Also move the stage forward (Contact attempted, or In conversation if you spoke)</label>` : ''}
  <button type="submit">Record call</button>
</form>`;
}

export function taskForm({ action, csrf, today, assignees, id }) {
  return html`<form method="post" action="${action}">${csrfField(csrf)}
  <div class="form-grid">
    <div class="field"><label for="${id}-type">Type</label><select id="${id}-type" name="type">${options(TASK_TYPES, 'call')}</select></div>
    <div class="field"><label for="${id}-title">What needs doing</label><input id="${id}-title" name="title" maxlength="300"></div>
    <div class="field"><label for="${id}-due">Due date</label><input id="${id}-due" name="due_on" type="date" value="${today}" required></div>
    <div class="field"><label for="${id}-time">Time (optional)</label><input id="${id}-time" name="due_time" type="time"></div>
    <div class="field"><label for="${id}-pri">Priority</label><select id="${id}-pri" name="priority">${options(PRIORITIES, 'normal')}</select></div>
    ${assignees.length > 1 ? html`<div class="field"><label for="${id}-who">Assigned to</label><select id="${id}-who" name="assigned_to"><option value="">Unassigned</option>${assignees.map((e) => html`<option value="${e}">${e}</option>`)}</select></div>` : ''}
  </div>
  <button type="submit">Add task</button>
</form>`;
}

export function taskItem(t, csrf, today, back) {
  return html`<li><span class="badge">${TASK_TYPE_LABEL[t.type] || t.type}</span> ${t.priority === 'high' ? html`<span class="badge pri-high">High</span>` : ''} <strong>${t.title}</strong><br>
    <span class="hint">${t.due_on < today ? html`<span class="late">Overdue · </span>` : ''}Due ${formatDate(t.due_on)}${t.due_at ? ` · ${splitDateTime(t.due_at)[1]}` : ''}${t.assigned_to ? ` · ${t.assigned_to}` : ''}</span>
    <form method="post" action="/tasks/${t.id}/complete" class="row">${csrfField(csrf)}<input type="hidden" name="back" value="${back}"><div class="field"><label class="sr-only" for="cn-${t.id}">Completion note (optional)</label><input id="cn-${t.id}" name="note" maxlength="500" placeholder="Completion note (optional)"></div><button class="secondary" type="submit">Mark done</button></form>
    <form class="inline-form" method="post" action="/tasks/${t.id}/cancel">${csrfField(csrf)}<input type="hidden" name="back" value="${back}"><button class="secondary" type="submit">Cancel task</button></form></li>`;
}

// ------------------------------------------------------------------ manual entry

export function newProjectPage({ contact, csrf, values = {} }) {
  const action = contact ? `/contacts/${contact.id}/projects` : '/leads';
  return html`<p><a href="${contact ? `/contacts/${contact.id}` : '/leads'}">← ${contact ? contact.display_name : 'All leads'}</a></p>
<h1>${contact ? `Add another project for ${contact.display_name}` : 'Add an inquiry'}</h1>
<p class="hint">For inquiries that did not come through a website form: a phone call, a referral, social media. <strong>Nothing is emailed when you save this.</strong> Only what you type is recorded; nothing is filled in for you.</p>
<form class="card" method="post" action="${action}">${csrfField(csrf)}
  <h2>How did it arrive?</h2>
  <div class="form-grid">
    <div class="field"><label for="n-chan">Channel</label><select id="n-chan" name="channel">${options(INTAKE_CHANNELS, values.channel || 'phone')}</select></div>
    <div class="field"><label for="n-when">When it arrived (Toronto time; blank = now)</label><input id="n-when" name="received_at" type="datetime-local"></div>
  </div>
  ${contact
    ? html`<p class="hint">The new project is attached to ${contact.display_name}. Their current contact details are copied onto the new submission as the record of this inquiry.</p>`
    : html`<h2>Who is it?</h2>
  <p class="hint">A name and at least one way to reach them. A phone-only caller does not need an email address.</p>
  <div class="form-grid">
    <div class="field"><label for="n-name">Name (required)</label><input id="n-name" name="display_name" maxlength="200" value="${val(values.display_name)}" required></div>
    <div class="field"><label for="n-email">Email</label><input id="n-email" name="email" type="email" maxlength="254" value="${val(values.email)}"></div>
    <div class="field"><label for="n-phone">Phone</label><input id="n-phone" name="phone" type="tel" maxlength="40" value="${val(values.phone)}"></div>
    <div class="field"><label for="n-method">Preferred way to be contacted</label><select id="n-method" name="preferred_contact_method">${options(CONTACT_METHODS, values.preferred_contact_method || '')}</select></div>
    <div class="field"><label for="n-time">Best time to reach them</label><input id="n-time" name="preferred_contact_time" maxlength="200" value="${val(values.preferred_contact_time)}"></div>
  </div>`}
  <h2>What do they want done?</h2>
  ${projectFields(values)}
  <div class="actions"><button type="submit">Save inquiry</button></div>
</form>`;
}

// ------------------------------------------------------------------ contacts

export function contactsPage({ result, filters, testHidden }) {
  const { rows, total, pageSize } = result;
  const { page, ...rest } = filters;
  return html`<h1>Contacts</h1>
<p class="hint">One record per person, with all of their projects and history. People are never merged automatically: if two records share an email or phone number, they are flagged for you to review.</p>
<form class="card filters" method="get" action="/contacts" role="search" aria-label="Search contacts">
  <div class="row">
    <div class="field"><label for="cq">Search</label><div class="search">${icon('search')}<input id="cq" name="q" type="search" value="${filters.q}" maxlength="100" placeholder="Name, email, phone, tag"></div></div>
    <div class="field"><label for="carch">Archive</label><select id="carch" name="archived"><option value="no" ${filters.archived === 'no' ? raw('selected') : ''}>Active only</option><option value="all" ${filters.archived === 'all' ? raw('selected') : ''}>Active + archived</option><option value="only" ${filters.archived === 'only' ? raw('selected') : ''}>Archived only</option></select></div>
    <div class="field"><label for="ctest">Test records</label><select id="ctest" name="test"><option value="hide" ${filters.test === 'hide' ? raw('selected') : ''}>Hide test records</option><option value="all" ${filters.test === 'all' ? raw('selected') : ''}>Show them too</option><option value="only" ${filters.test === 'only' ? raw('selected') : ''}>Only test records</option></select></div>
  </div>
  <div class="actions"><button type="submit">${icon('filter')}Apply</button></div>
</form>
${filters.test === 'hide' && testHidden ? html`<p class="hint">${testHidden} test record${testHidden === 1 ? ' is' : 's are'} hidden.</p>` : ''}
<div class="card">
${rows.length ? html`<div class="tablewrap"><table class="stack"><caption class="sr-only">Contacts, newest first</caption>
<thead><tr><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Projects</th><th scope="col">Notes</th></tr></thead>
<tbody>${rows.map((c) => html`<tr>
  <td data-label="Name"><a href="/contacts/${c.id}">${c.display_name}</a>${c.archived_at ? html` <span class="badge">Archived</span>` : ''}${c.is_test ? html` <span class="badge badge-test">Test record</span>` : ''}${c.duplicate_count ? html`<br><span class="badge b-warn">Possible duplicate</span>` : ''}</td>
  <td data-label="Contact">${c.email || ''}${c.email && c.phone ? html`<br>` : ''}${c.phone || (c.email ? '' : '—')}</td>
  <td data-label="Projects">${c.open_projects} open${c.all_projects !== c.open_projects ? ` of ${c.all_projects}` : ''}</td>
  <td data-label="Notes">${c.tags ? html`<span class="hint">${c.tags}</span>` : '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No contacts match.</p>`}
${pager('/contacts', { ...rest, test: rest.test === 'hide' ? '' : rest.test }, filters.page, total, pageSize)}
</div>`;
}

export function contactPage(d) {
  const { contact: c, bundle, duplicates, timeline, tasks, calls, csrf, today, assignees } = d;
  const post = (p) => `/contacts/${c.id}${p}`;
  const cur = bundle.currentPermissions;
  const openTasks = tasks.filter((t) => t.status === 'open');
  return html`
<p><a href="/contacts">← All contacts</a></p>
<h1>${c.display_name} ${c.archived_at ? html`<span class="badge">Archived</span>` : ''} ${c.is_test ? html`<span class="badge badge-test">Test record</span>` : ''}</h1>
${duplicates.length ? html`<div class="banner" role="note"><strong>Possible duplicate.</strong> These contacts share an email or phone with this one: ${duplicates.map((x, i) => html`${i ? ', ' : ''}<a href="/contacts/${x.id}">${x.display_name}</a> (${x.matched_on.split(',').join(' and ')}, ${x.project_count} project${x.project_count === 1 ? '' : 's'})`)}. Nothing was merged. A repeat inquiry about a different project is not a duplicate.</div>` : ''}
<div class="grid cols">
<div>
  <section class="card" aria-labelledby="cd-h">
    <h2 id="cd-h">Contact</h2>
    <dl class="kv">
      <dt>Email</dt><dd>${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : 'None on file'}</dd>
      <dt>Phone</dt><dd>${c.phone ? html`<a href="${telHref(c.phone)}">${c.phone}</a>` : 'None on file'}</dd>
      <dt>Prefers</dt><dd>${METHOD_LABEL[c.preferred_contact_method || ''] || 'No preference recorded'}${c.preferred_contact_time ? ` · ${c.preferred_contact_time}` : ''}</dd>
      <dt>Tags</dt><dd>${dash(c.tags)}</dd>
      <dt>Notes</dt><dd class="pre">${dash(c.notes)}</dd>
      <dt>On file since</dt><dd>${formatDateTime(c.created_at)}</dd>
    </dl>
    <details class="edit"><summary>Edit contact details</summary><div class="body">
      <p class="sec-note">Changing these details updates this contact only. The original submissions keep exactly what was typed at the time, and the change is recorded in the history.</p>
      <form method="post" action="${post('')}">${csrfField(csrf)}
        <div class="form-grid">
          <div class="field"><label for="e-name">Name</label><input id="e-name" name="display_name" maxlength="200" value="${c.display_name}" required></div>
          <div class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" maxlength="254" value="${val(c.email)}"></div>
          <div class="field"><label for="e-phone">Phone</label><input id="e-phone" name="phone" type="tel" maxlength="40" value="${val(c.phone)}"></div>
          <div class="field"><label for="e-method">Preferred way to be contacted</label><select id="e-method" name="preferred_contact_method">${options(CONTACT_METHODS, c.preferred_contact_method || '')}</select></div>
          <div class="field"><label for="e-time">Best time to reach them</label><input id="e-time" name="preferred_contact_time" maxlength="200" value="${val(c.preferred_contact_time)}"></div>
          <div class="field"><label for="e-tags">Tags (comma-separated)</label><input id="e-tags" name="tags" maxlength="500" value="${val(c.tags)}"></div>
        </div>
        <div class="field"><label for="e-notes">Notes about the customer</label><textarea id="e-notes" name="notes" maxlength="5000">${val(c.notes)}</textarea></div>
        <button type="submit">Save contact</button>
      </form></div></details>
  </section>

  <section class="card" aria-labelledby="cp-h">
    <h2 id="cp-h">Projects</h2>
    <p><a class="btn" href="/contacts/${c.id}/projects/new">${icon('plus')}Add another project</a></p>
    ${bundle.projects.length ? html`<div class="tablewrap"><table class="stack"><caption class="sr-only">Projects for this contact</caption><thead><tr><th scope="col">Project</th><th scope="col">Stage</th><th scope="col">Next step</th></tr></thead>
    <tbody>${bundle.projects.map((p) => html`<tr>
      <td data-label="Project"><a href="/leads/${p.id}">${p.title}</a><br><span class="hint">Started ${formatDate(p.created_at.slice(0, 10))}${p.submission_count > 1 ? ` · ${p.submission_count} submissions` : ''}</span></td>
      <td data-label="Stage">${stageBadge(p)} ${chips(p)}</td>
      <td data-label="Next step">${p.next_task_due ? html`<span class="hint">${p.next_task_due < today ? html`<span class="late">Overdue · </span>` : ''}${stripWeekday(p.next_task_due)}</span>` : html`<span class="hint">—</span>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No projects.</p>`}
  </section>

  <section class="card" aria-labelledby="cl-h">
    <h2 id="cl-h">Log a call</h2>
    ${callForm({ action: post('/calls'), csrf, showMove: false, phone: c.phone })}
    <p class="sec-note">To record a call about one project, open that project instead, so it appears in its own timeline.</p>
  </section>

  <section class="card" aria-labelledby="ct-h">
    <h2 id="ct-h">History for this customer</h2>
    ${timelineList(timeline, { showProject: true })}
  </section>
</div>

<div>
  <section class="card" aria-labelledby="perm-h">
    <h2 id="perm-h">Communication permission</h2>
    <p class="hint">A record of what this person agreed to and how. It is never assumed from a form or a call.</p>
    <ul class="plain">${PERMISSION_CHANNELS.map(([k, label]) => html`<li><strong>${label}:</strong> ${cur[k] ? html`<span class="badge ${cur[k].status === 'granted' ? 'b-ok' : 'b-err'}">${cur[k].status === 'granted' ? 'Permission recorded' : 'Withdrawn'}</span> <span class="hint">${formatDate(cur[k].given_on)} · ${PERMISSION_METHOD_LABEL[cur[k].method] || cur[k].method}</span>` : html`<span class="hint">Nothing recorded</span>`}</li>`)}</ul>
    ${bundle.consents.length ? html`<h3>Follow-up email permission</h3><ul class="plain">${bundle.consents.map((s) => html`<li>${PERMISSION_METHOD_LABEL[s.method] || s.method}, ${formatDate(s.given_on)} — “${s.evidence}” <span class="hint">(recorded by ${s.recorded_by})</span>${s.withdrawn_at ? html`<br><span class="badge b-err">Withdrawn ${formatDateTime(s.withdrawn_at)}</span>` : ''}</li>`)}</ul>` : ''}
    ${bundle.suppressions.length ? html`<div class="banner"><strong>Follow-up emails are blocked for this address.</strong> ${bundle.suppressions.map((s) => `${STOP_LABELS[s.reason === 'unsubscribe' ? 'unsubscribed' : s.reason === 'bounce' ? 'suppressed_bounce' : s.reason === 'complaint' ? 'suppressed_complaint' : 'suppressed_other'] || s.reason} (${formatDate(s.created_at.slice(0, 10))}).`).join(' ')} Editing the contact does not lift this.</div>` : ''}
    <details class="edit"><summary>Record a permission or a withdrawal</summary><div class="body">
      <form method="post" action="${post('/permissions')}">${csrfField(csrf)}
        <div class="form-grid">
          <div class="field"><label for="p-ch">For</label><select id="p-ch" name="channel">${options(PERMISSION_CHANNELS, 'email')}</select></div>
          <div class="field"><label for="p-st">This record says</label><select id="p-st" name="status"><option value="granted">Permission given</option><option value="withdrawn">Permission withdrawn</option></select></div>
          <div class="field"><label for="p-me">How</label><select id="p-me" name="method">${options(PERMISSION_METHODS, 'phone_verbal')}</select></div>
          <div class="field"><label for="p-on">Date</label><input id="p-on" name="given_on" type="date" value="${today}" required></div>
        </div>
        <div class="field"><label for="p-ev">What was said or done (a few words)</label><input id="p-ev" name="evidence" maxlength="500" required></div>
        <button type="submit">Add record</button>
        <p class="sec-note">Records are added, never edited. Withdrawing email permission stops this person’s automatic follow-up emails.</p>
      </form></div></details>
  </section>

  <section class="card" aria-labelledby="ctk-h">
    <h2 id="ctk-h">Tasks</h2>
    ${taskForm({ action: post('/tasks'), csrf, today, assignees, id: 'ct' })}
    ${openTasks.length ? html`<h3>Open</h3><ul class="plain">${openTasks.map((t) => taskItem(t, csrf, today, 'contact'))}</ul>` : html`<p class="empty">No open tasks for this contact.</p>`}
  </section>

  <section class="card" aria-labelledby="cm-h">
    <h2 id="cm-h">Manage</h2>
    <form method="post" action="${post(c.archived_at ? '/unarchive' : '/archive')}">${csrfField(csrf)}
      <button type="submit" class="${c.archived_at ? 'secondary' : 'danger'}">${c.archived_at ? 'Restore contact' : 'Archive contact'}</button>
      <p class="sec-note">Only possible when all of their projects are archived. Nothing is deleted.</p>
    </form>
  </section>
</div>
</div>`;
}

// ------------------------------------------------------------------ follow-ups (tasks)

export function tasksPage({ data, filters, csrf, assignees }) {
  const { today } = data;
  const link = (t) => (t.opportunity_id ? html`<a href="/leads/${t.opportunity_id}">${t.contact_name || t.project_title}</a>${t.project_title ? html`<br><span class="hint">${t.project_title}</span>` : ''}` : t.contractor_id ? html`<a href="/contractors/${t.contractor_id}">${t.contractor_name}</a><br><span class="hint">Contractor</span>` : html`<a href="/contacts/${t.contact_id}">${t.contact_name}</a>`);
  const section = (id, title, rows, kind) => html`<section class="card" aria-labelledby="${id}">
    <h2 id="${id}">${title} (${rows.length})</h2>
    ${rows.length
      ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">${kind === 'done' ? 'Was due' : 'Due'}</th><th scope="col">Lead</th><th scope="col">Task</th><th scope="col">${kind === 'done' ? 'Finished' : 'Action'}</th></tr></thead>
      <tbody>${rows.map((t) => html`<tr>
        <td data-label="Due">${kind === 'overdue' ? html`<span class="overdue">${formatDate(t.due_on)}</span>` : formatDate(t.due_on)}${t.due_at ? html`<br><span class="hint">${splitDateTime(t.due_at)[1]}</span>` : ''}</td>
        <td data-label="Lead">${link(t)}${t.project_stage ? html`<br>${stageBadge({ stage: t.project_stage })}` : ''}</td>
        <td data-label="Note"><span class="badge">${TASK_TYPE_LABEL[t.type] || t.type}</span> ${t.priority === 'high' ? html`<span class="badge pri-high">High</span>` : ''}${t.priority === 'low' ? html`<span class="badge pri-low">Low</span>` : ''}<br>${t.title}${t.assigned_to ? html`<br><span class="hint">${t.assigned_to}</span>` : ''}${t.completion_note ? html`<br><span class="hint">Note: ${t.completion_note}</span>` : ''}</td>
        <td data-label="${kind === 'done' ? 'Finished' : 'Action'}">${kind === 'done'
          ? html`${t.status === 'done' ? 'Completed' : 'Cancelled'}<br><span class="hint">${formatDateTime(t.completed_at)}</span>`
          : html`<form method="post" action="/tasks/${t.id}/complete">${csrfField(csrf)}<input type="hidden" name="back" value="followups"><button class="secondary" type="submit">Mark complete</button></form>`}</td>
      </tr>`)}</tbody></table></div>`
      : html`<p class="empty">Nothing here.</p>`}
  </section>`;
  return html`<h1>Follow-ups</h1>
<p class="hint">Tasks for leads, contacts and contractors. Dates are calendar dates in Toronto time. Today is ${formatDate(today)}. Archived projects are not listed. Add a task from the lead, contact or contractor it belongs to.</p>
<form class="card filters" method="get" action="/follow-ups" aria-label="Filter tasks">
  <div class="row">
    <div class="field"><label for="tf-type">Type</label><select id="tf-type" name="type"><option value="">All types</option>${options(TASK_TYPES, filters.type)}</select></div>
    <div class="field"><label for="tf-pri">Priority</label><select id="tf-pri" name="priority"><option value="">Any</option>${options(PRIORITIES, filters.priority)}</select></div>
    ${assignees.length > 1 ? html`<div class="field"><label for="tf-who">Assigned to</label><select id="tf-who" name="assigned"><option value="">Anyone</option><option value="unassigned" ${filters.assigned === 'unassigned' ? raw('selected') : ''}>Unassigned</option>${assignees.map((e) => html`<option value="${e}" ${filters.assigned === e ? raw('selected') : ''}>${e}</option>`)}</select></div>` : ''}
  </div>
  <div class="actions"><button type="submit">${icon('filter')}Apply</button>${filters.type || filters.priority || filters.assigned ? html`<a class="link-clear" href="/follow-ups">Clear filters</a>` : ''}</div>
</form>
${section('fu-over', 'Overdue', data.overdue, 'overdue')}
${section('fu-today', 'Due today', data.dueToday, 'today')}
${section('fu-up', 'Upcoming', data.upcoming, 'upcoming')}
${section('fu-done', 'Recently finished', data.done, 'done')}`;
}

// ------------------------------------------------------------------ contractor tasks

/** Tasks about one contractor (for example a "contractor check"). Shown on the contractor's own page. */
export function contractorTasks({ contractor, tasks, csrf, today, assignees }) {
  const open = tasks.filter((t) => t.status === 'open');
  return html`<section class="card" aria-labelledby="ctt-h">
  <h2 id="ctt-h">Tasks for ${contractor.name}</h2>
  ${taskForm({ action: `/contractors/${contractor.id}/tasks`, csrf, today, assignees, id: 'kt' })}
  ${open.length ? html`<h3>Open</h3><ul class="plain">${open.map((t) => taskItem(t, csrf, today, 'followups'))}</ul>` : html`<p class="empty">No open tasks for this contractor.</p>`}
</section>`;
}
