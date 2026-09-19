// Pages for the follow-up email sequence (three follow-ups over 7 days).
// All dynamic text is escaped by html.js; nothing here can inject markup.

import { html, raw } from './html.js';
import { formatDate, formatDateTime, torontoDateOf } from './time.js';
import { STOP_LABELS } from '../../renorise-shared/eligibility.js';
import { renderFollowup, TEMPLATE_KEYS } from '../../renorise-shared/templates.js';
import { VERSIONS, CURRENT_VERSION, TEST_RECIPIENTS, SOURCE_KINDS, maxEmailsPerLead } from '../../renorise-shared/sequence.js';
import { CONSENT_METHODS } from './seq-db.js';

const csrfField = (t) => html`<input type="hidden" name="csrf" value="${t}">`;
// Labels come from the schedule itself, so a schedule change can never leave a stale label behind.
const STEPS = VERSIONS[CURRENT_VERSION].steps;
const TEMPLATE_TITLES = Object.fromEntries(STEPS.map((s) => [s.template, `Email ${s.no} (Day ${s.day})`]));
const LAST_DAY = STEPS[STEPS.length - 1].day;
const DAYS_TEXT = STEPS.map((s) => `Day ${s.day}`).join(', ').replace(/, ([^,]*)$/, ' and $1');

export const STEP_STATUS_LABEL = {
  planned: 'Planned — waiting for its date and your approval',
  approved: 'Approved — sends at the next automatic check inside the daytime window (if the global switch is ON)',
  queued: 'Queued — sending or retrying',
  sent: 'Sent — accepted by Resend',
  skipped_elapsed: 'Skipped — its date had already passed at enrollment',
  skipped_staff: 'Skipped by staff',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const inboxReminder = html`<div class="notice info" role="note"><strong>Check the inbox first.</strong> Customer replies arrive in the hello@renosrise.com mailbox at Hostinger. This system cannot read that mailbox, so it cannot detect replies automatically. Before approving any follow-up, check the inbox for a reply. If there is one, open the lead and use “Stop the sequence because… the customer replied”.</div>`;

// ------------------------------------------------------------------ overview + settings summary

export function sequencePage({ ov, sends, csrf }) {
  const s = ov.settings;
  const on = s.global_send_enabled === '1';
  const dayCap = Number(s.account_daily_cap);
  const monthCap = Number(s.account_monthly_cap);
  const v = VERSIONS[CURRENT_VERSION];
  const stat = (n, label) => html`<div class="stat"><div class="n">${n}</div><div class="l">${label}</div></div>`;
  return html`
<h1>Follow-up emails</h1>
<div class="notice ${on ? 'ok' : 'info'}" role="status"><strong>Sending is ${on ? 'ON' : 'OFF'}.</strong> ${on ? 'Approved follow-ups send inside the daytime window.' : 'Nothing is sent to customers. Test emails to your own addresses still work.'}</div>
${inboxReminder}
<div class="grid stats">
  <a class="stat ${ov.awaiting ? 'alert' : ''}" href="/sequence/queue"><div class="n">${ov.awaiting}</div><div class="l">Awaiting your approval</div></a>
  ${stat(ov.counts.active || 0, 'Active sequences')}${stat(ov.counts.paused || 0, 'Paused')}${stat(ov.counts.completed || 0, 'Completed')}${stat(ov.counts.stopped || 0, 'Stopped')}
  <div class="stat ${ov.failed_sends ? 'alert' : ''}"><div class="n">${ov.failed_sends}</div><div class="l">Failed sends</div></div>
</div>
<div class="grid two">
<section class="card" aria-labelledby="sched-h">
  <h2 id="sched-h">The sequence (${v.label})</h2>
  <ul class="plain">${v.steps.map((st) => html`<li><strong>${TEMPLATE_TITLES[st.template]}</strong> — Day ${st.day} after the inquiry or call date, 9–5 Toronto time</li>`)}</ul>
  <p class="hint">After the third email the sequence is complete; nothing more is sent. Every follow-up needs your approval first. Enrollment is manual, from a lead’s page, and needs recorded permission.</p>
  <p><a class="btn secondary" href="/sequence/preview">Preview the emails</a> <a class="btn secondary" href="/sequence/settings">Settings and on/off switch</a></p>
</section>
<section class="card" aria-labelledby="use-h">
  <h2 id="use-h">Sending budget (Resend Free plan)</h2>
  <p>Today (UTC day ${ov.usage.day}): <strong>${ov.usage.day_all}</strong> of ${dayCap} emails used. This month: <strong>${ov.usage.month_all}</strong> of ${monthCap}. Follow-ups today: ${ov.usage.day_followups} of ${s.followup_daily_cap}.</p>
  <p class="hint">Everything counts toward one shared budget: confirmations, internal notifications, follow-ups, and test emails. Follow-ups keep ${s.confirmation_reserve} emails a day in reserve for confirmations and notifications, and wait when capacity is low. Resend’s daily limit resets at midnight UTC (8 p.m. Toronto time in summer).</p>
  <p class="hint"><strong>Estimate:</strong> a website lead uses at most ${maxEmailsPerLead()} emails in total (1 confirmation, 1 internal notification, ${v.steps.length} follow-ups). Enrolling 20 leads adds at most ${20 * v.steps.length} follow-ups spread over ${LAST_DAY} days.</p>
</section>
</div>
<section class="card" aria-labelledby="test-h">
  <h2 id="test-h">Send a test email to yourself</h2>
  <p class="hint">Test emails go only to hello@renosrise.com or levi.gene.ous@gmail.com, are marked [TEST], and use the shared budget. They are sent by the automatic check (up to 15 minutes).</p>
  ${testForm(csrf)}
</section>
<section class="card" aria-labelledby="recent-h">
  <h2 id="recent-h">Recent follow-up and test sends</h2>
  ${sends.length ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Kind</th><th scope="col">To</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Action</th></tr></thead><tbody>${sends.map((x) => html`<tr>
    <td data-label="Kind">${x.kind}</td><td data-label="To">${x.kind === 'test' ? x.to_email : html`<a href="/leads/${x.lead_id}">${x.to_email}</a>`}</td><td data-label="Email">${TEMPLATE_TITLES[x.template] || x.template}</td>
    <td data-label="Status">${sendLabel(x)}</td><td data-label="Attempts">${x.attempts} / ${x.max_attempts}</td>
    <td data-label="Action">${x.status === 'failed' ? html`<form method="post" action="/sequence/sends/${x.id}/retry">${csrfField(csrf)}<button class="secondary" type="submit">Retry</button></form>` : '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nothing sent yet.</p>`}
</section>`;
}

export function sendLabel(x) {
  if (x.status === 'sent') return x.delivered_at ? `Delivered (confirmed by Resend ${formatDateTime(x.delivered_at)})` : 'Accepted by Resend (delivery not confirmed yet)';
  if (x.status === 'pending') return x.attempts ? `Retry scheduled (${x.attempts} of ${x.max_attempts} attempts used)` : 'Queued';
  if (x.status === 'sending') return 'Sending now';
  if (x.status === 'failed') return `Failed after ${x.attempts} attempts${x.last_error ? `: ${String(x.last_error).slice(0, 120)}` : ''}`;
  return x.status;
}

function testForm(csrf) {
  return html`<form method="post" action="/sequence/test-send"><div class="row">
    <div class="field"><label for="t-to">Send to</label><select id="t-to" name="to">${TEST_RECIPIENTS.map((a) => html`<option value="${a}">${a}</option>`)}</select></div>
    <div class="field"><label for="t-template">Email</label><select id="t-template" name="template">${TEMPLATE_KEYS.map((k) => html`<option value="${k}">${TEMPLATE_TITLES[k]}</option>`)}</select></div>
    <div class="field"><label for="t-variant">Version</label><select id="t-variant" name="variant"><option value="website">Website inquiry</option><option value="call">Phone call</option></select></div>
    <div class="field"><label for="t-name">Greeting name (blank tests the fallback)</label><input id="t-name" name="name" maxlength="60" placeholder="e.g. Jamie Lee"></div>
    <div>${csrfField(csrf)}<button type="submit">Queue test</button></div></div></form>`;
}

// ------------------------------------------------------------------ approval queue

export function queuePage({ items, csrf }) {
  return html`
<h1>Follow-ups awaiting approval</h1>
${inboxReminder}
<p class="hint">Only the next email of each sequence appears here, and only once its planned date has arrived. Approving does not send it immediately: it goes out at the next automatic check (every 15 minutes) inside the 9–5 Toronto window, if the global switch is ON.</p>
<div class="card">
${items.length ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Lead</th><th scope="col">Email</th><th scope="col">Planned</th><th scope="col">Approve or skip</th></tr></thead><tbody>${items.map((i) => html`<tr>
  <td data-label="Lead"><a href="/leads/${i.lead_id}">${i.lead_name}</a><br><span class="hint">${i.lead_email} · ${SOURCE_KINDS[i.source_kind]}</span></td>
  <td data-label="Email">${TEMPLATE_TITLES[i.template]}</td>
  <td data-label="Planned">${formatDateTime(i.planned_for)}${i.planned_for !== i.original_planned_for ? html`<br><span class="hint">revised from ${formatDate(i.original_planned_for.slice(0, 10))}</span>` : ''}</td>
  <td data-label="Action"><form method="post" action="/sequence/steps/${i.id}/approve">${csrfField(csrf)}<input type="hidden" name="back" value="queue">
    <div class="field"><label><input type="checkbox" name="inbox_checked" value="yes" required> I checked the hello@renosrise.com inbox; there is no reply from this customer.</label></div>
    <button type="submit">Approve</button></form>
    <form method="post" action="/sequence/steps/${i.id}/skip">${csrfField(csrf)}<input type="hidden" name="back" value="queue"><button class="secondary" type="submit">Skip this email</button></form></td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nothing is waiting for approval.</p>`}
</div>`;
}

// ------------------------------------------------------------------ preview

export function previewPage({ settings, name, csrf }) {
  const biz = { legalName: settings.business_legal_name, mailingAddress: settings.business_mailing_address, unsubscribeUrl: `${settings.unsubscribe_base_url}/u/<per-customer-token>`, preview: true };
  const missing = !biz.legalName.trim() || !biz.mailingAddress.trim();
  return html`
<h1>Email previews</h1>
<p class="hint">Exactly the copy that will be sent, with the greeting for “${name || '(blank name)'}”. Each email ends with the free-consultation invitation, then the RenoRise Team signature and the required footer. There is no booking link and no promise about response time.</p>
${missing ? html`<div class="notice error" role="alert">The legal business name and/or mailing address are not recorded yet, so the footer below shows a clearly marked placeholder. Real emails will not send until both are entered in Settings.</div>` : ''}
<form class="card" method="get" action="/sequence/preview"><div class="row"><div class="field"><label for="pn">Greeting name</label><input id="pn" name="name" value="${name}" maxlength="60" placeholder="Try: Jamie Lee — or leave blank to see the fallback"></div><div><button type="submit">Update</button></div></div></form>
${TEMPLATE_KEYS.map((k) => html`<section class="card" aria-labelledby="p-${k}"><h2 id="p-${k}">${TEMPLATE_TITLES[k]}</h2><div class="grid two">
  ${['website', 'call'].map((variant) => { const e = renderFollowup({ templateKey: k, variant, name, ...biz }); return html`<div><h3>${SOURCE_KINDS[variant]}</h3><p><strong>Subject:</strong> ${e.subject}</p><div class="mono">${e.text}</div></div>`; })}
</div></section>`)}
<section class="card"><h2>Send a test</h2>${testForm(csrf)}</section>`;
}

// ------------------------------------------------------------------ settings

export function settingsPage({ settings, csrf }) {
  const s = settings;
  const on = s.global_send_enabled === '1';
  const num = (id, label, hint, extra = '') => html`<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="number" value="${s[id]}" ${raw(extra)}>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;
  return html`
<h1>Follow-up settings</h1>
<section class="card" aria-labelledby="sw-h"><h2 id="sw-h">Global sending switch: ${on ? 'ON' : 'OFF'}</h2>
  ${on
    ? html`<form method="post" action="/sequence/switch">${csrfField(csrf)}<input type="hidden" name="on" value="0"><p>Turning it off holds every follow-up immediately (approved ones wait; nothing is lost).</p><button class="danger" type="submit">Turn follow-ups OFF</button></form>`
    : html`<form method="post" action="/sequence/switch">${csrfField(csrf)}<input type="hidden" name="on" value="1">
        <p>Keep this OFF until you have reviewed the previews and test emails. To turn it ON you need the business details below saved, and the Resend webhook set up (otherwise the sender refuses to send).</p>
        <div class="field"><label for="confirm">Type ENABLE FOLLOW-UPS to confirm</label><input id="confirm" name="confirm" autocomplete="off"></div><button type="submit">Turn follow-ups ON</button></form>`}
</section>
<form class="card" method="post" action="/sequence/settings">${csrfField(csrf)}
  <h2>Business details (required in every email)</h2>
  <div class="field"><label for="business_legal_name">Legal business name</label><input id="business_legal_name" name="business_legal_name" value="${s.business_legal_name}" maxlength="300"></div>
  <div class="field"><label for="business_mailing_address">Mailing address</label><textarea id="business_mailing_address" name="business_mailing_address" maxlength="300">${s.business_mailing_address}</textarea><span class="hint">Canadian anti-spam law requires a valid mailing address in each commercial email. The CRTC accepts a street address, a PO box, a rural route, or a general-delivery address, as long as it stays valid for at least 60 days after each message. It does not have to be a place customers visit. Examples: “PO Box 123, Station A, Toronto, ON M5W 1A1” or “General Delivery, Toronto, ON”. A postal code and city alone is not accepted. Do not enter a made-up address.</span></div>
  <div class="field"><label for="unsubscribe_base_url">Unsubscribe link address</label><input id="unsubscribe_base_url" name="unsubscribe_base_url" value="${s.unsubscribe_base_url}"><span class="hint">Must be secure (https). It is the public forms Worker, which also answers the one-click unsubscribe request.</span></div>
  <h2>Sending limits</h2>
  <div class="row">${num('followup_daily_cap', 'Follow-up recipients per day', 'Default 50', 'min="1"')}${num('account_daily_cap', 'Account emails per day', 'Resend Free plan: 100 (UTC day)', 'min="1"')}${num('account_monthly_cap', 'Account emails per month', 'Resend Free plan: 3,000', 'min="1"')}</div>
  <div class="row">${num('confirmation_reserve', 'Daily reserve for confirmations', 'Kept free so confirmations are never squeezed out', 'min="0"')}${num('monthly_reserve', 'Monthly reserve', '', 'min="0"')}</div>
  <div class="row">${num('window_start_hour', 'Send from (Toronto hour)', '9 = 9:00 a.m.', 'min="0" max="23"')}${num('window_end_hour', 'Send until (Toronto hour)', '17 = 5:00 p.m.', 'min="1" max="24"')}</div>
  <p class="hint">Verify these against your Resend plan; Resend can change its limits. Do not enable a paid plan without deciding it separately.</p>
  <button type="submit">Save settings</button>
</form>`;
}

// ------------------------------------------------------------------ enrollment form

export function enrollPage({ lead, plan, form, csrf, today }) {
  const kind = form.sourceKind;
  return html`
<p><a href="/leads/${lead.id}">← ${lead.name}</a></p>
<h1>Set up follow-up emails</h1>
<div class="notice info" role="note">Three follow-ups on ${DAYS_TEXT}. Enrollment needs <strong>recorded, explicit permission</strong> from the customer to receive these emails. A phone call or a website form alone is not permission.</div>
<form class="card" method="get" action="/leads/${lead.id}/sequence"><h2>1. Where did this inquiry come from?</h2>
  <div class="row"><div class="field"><label for="kind">Source</label><select id="kind" name="kind"><option value="website" ${kind === 'website' ? raw('selected') : ''}>Website inquiry (uses the date they sent the form)</option><option value="call" ${kind === 'call' ? raw('selected') : ''}>Phone call (uses the recorded call date)</option></select></div>
  <div class="field"><label for="call_date">Recorded call date (calls only)</label><input id="call_date" name="call_date" type="date" value="${form.callDate || ''}" max="${today}"></div>
  <div><button type="submit">Show planned dates</button></div></div>
  <p class="hint">Never choose “phone call” unless the call is actually recorded. Website leads are never described as callers.</p></form>
<section class="card" aria-labelledby="plan-h"><h2 id="plan-h">Planned dates</h2>
  ${plan.ok
    ? html`<div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Email</th><th scope="col">Day</th><th scope="col">Planned (Toronto time)</th><th scope="col">Status at enrollment</th></tr></thead><tbody>${plan.steps.map((s) => html`<tr><td data-label="Email">${TEMPLATE_TITLES[s.template]}</td><td data-label="Day">Day ${s.day}</td><td data-label="Planned">${formatDate(s.planned_date)}, from 9:00 a.m.</td><td data-label="Status">${s.status === 'skipped_elapsed' ? 'Skipped — that date has already passed (never sent late)' : 'Will be planned; needs your approval'}</td></tr>`)}</tbody></table></div>
      <p class="hint">Anchor: ${SOURCE_KINDS[kind]} on ${formatDate(torontoDateOf(plan.anchorIso))}. ${plan.remaining} of ${plan.steps.length} emails remain. Dates are revised automatically if anything is delayed, so there are never catch-up bursts.</p>`
    : html`<p class="empty">Enter the recorded call date above to see the planned dates.</p>`}
</section>
${plan.ok && plan.remaining > 0
  ? html`<form class="card" method="post" action="/leads/${lead.id}/sequence/enroll">${csrfField(csrf)}<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="call_date" value="${form.callDate || ''}">
  <h2>2. Record the customer’s permission</h2>
  <div class="field"><label for="method">How did they give permission?</label><select id="method" name="method" required><option value="">Choose…</option>${Object.entries(CONSENT_METHODS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
  <div class="field"><label for="given_on">Date they agreed</label><input id="given_on" name="given_on" type="date" max="${today}" value="${today}" required></div>
  <div class="field"><label for="evidence">Note: who, and what they agreed to</label><textarea id="evidence" name="evidence" maxlength="500" required placeholder="e.g. On the call on Sept 18 the customer said yes when asked if we could email a few follow-ups."></textarea></div>
  <div class="field"><label><input type="checkbox" name="confirmed" value="yes" required> The customer explicitly agreed to receive these follow-up emails.</label></div>
  <button type="submit">Enroll</button></form>`
  : ''}`;
}

// ------------------------------------------------------------------ card on the lead page

export function sequenceCard({ lead, seq, csrf, today }) {
  if (!seq) {
    return html`<section class="card" aria-labelledby="seq-h"><h2 id="seq-h">Follow-up emails</h2><p class="empty">Not enrolled.</p><p><a class="btn secondary" href="/leads/${lead.id}/sequence">Set up follow-ups</a></p></section>`;
  }
  const { enrollment: e, steps, consent, sends } = seq;
  const open = ['active', 'paused'].includes(e.status);
  const sendFor = (stepId) => sends.find((x) => x.enrollment_step_id === stepId);
  return html`<section class="card" aria-labelledby="seq-h"><h2 id="seq-h">Follow-up emails</h2>
  <p><span class="badge ${e.status === 'active' ? 'b-ok' : e.status === 'paused' ? 'b-warn' : ''}">${e.status === 'stopped' ? `Stopped — ${STOP_LABELS[e.stop_reason] || e.stop_reason}` : e.status === 'completed' ? 'Completed' : e.status === 'paused' ? 'Paused' : 'Active'}</span> <span class="hint">${SOURCE_KINDS[e.source_kind]} · started from ${formatDate(torontoDateOf(e.anchor_at))} · schedule ${e.sequence_version}</span></p>
  <p class="hint">Permission: ${CONSENT_METHODS[consent.method] || consent.method}, given ${formatDate(consent.given_on)} — “${consent.evidence}” (recorded by ${consent.recorded_by})${consent.withdrawn_at ? ` · withdrawn ${formatDateTime(consent.withdrawn_at)}` : ''}</p>
  <div class="tablewrap"><table class="stack"><thead><tr><th scope="col">Email</th><th scope="col">Planned (Toronto)</th><th scope="col">Status</th></tr></thead><tbody>${steps.map((s) => { const send = sendFor(s.id); return html`<tr>
    <td data-label="Email">${TEMPLATE_TITLES[s.template]}</td>
    <td data-label="Planned">${formatDate(s.planned_for.slice(0, 10))}${s.planned_for !== s.original_planned_for && !['sent', 'cancelled', 'skipped_elapsed', 'skipped_staff'].includes(s.status) ? html`<br><span class="hint">revised from ${formatDate(s.original_planned_for.slice(0, 10))}</span>` : ''}</td>
    <td data-label="Status">${s.status === 'sent' ? (send && send.delivered_at ? `Sent — delivered (confirmed by Resend)` : 'Sent — accepted by Resend (delivery not confirmed)') : STEP_STATUS_LABEL[s.status]}${s.status === 'sent' ? html`<br><span class="hint">${formatDateTime(s.sent_at)}</span>` : ''}${s.status === 'cancelled' && s.cancel_reason ? html`<br><span class="hint">${STOP_LABELS[s.cancel_reason] || s.cancel_reason}</span>` : ''}
      ${send && send.status === 'failed' ? html`<br><span class="hint">Send failed: ${String(send.last_error || '').slice(0, 120)}</span><form method="post" action="/sequence/sends/${send.id}/retry">${csrfField(csrf)}<input type="hidden" name="back" value="lead"><button class="secondary" type="submit">Retry</button></form>` : ''}
      ${open && ['planned', 'approved', 'queued'].includes(s.status) ? html`<form method="post" action="/sequence/steps/${s.id}/skip">${csrfField(csrf)}<input type="hidden" name="back" value="lead"><button class="secondary" type="submit">Skip</button></form>` : ''}</td></tr>`; })}</tbody></table></div>
  ${open ? html`<div class="row">
    <form method="post" action="/sequence/enrollments/${e.id}/${e.status === 'paused' ? 'resume' : 'pause'}">${csrfField(csrf)}<input type="hidden" name="back" value="lead"><button class="secondary" type="submit">${e.status === 'paused' ? 'Resume sequence' : 'Pause sequence'}</button></form>
    <form method="post" action="/sequence/enrollments/${e.id}/stop">${csrfField(csrf)}<input type="hidden" name="back" value="lead">
      <div class="field"><label for="stop-reason">Stop the sequence because…</label><select id="stop-reason" name="reason"><option value="reply">The customer replied</option><option value="declined">The customer declined</option><option value="unsubscribed">The customer asked to stop (unsubscribe)</option><option value="withdrawn">Permission was withdrawn</option><option value="staff">Staff decision</option></select></div>
      <button class="danger" type="submit">Stop sequence</button></form></div>
    <p class="hint">Replies land in the hello@renosrise.com inbox and are not detected automatically. Record a reply here as soon as you see one. The next follow-up approval is on the <a href="/sequence/queue">approval queue</a> once it is due.</p>` : ''}
  </section>`;
}
