// Calls screens. All dynamic text is escaped by the html`` tag (html.js).

import { html, raw, icon } from './html.js';
import { csrfField, pager, splitDateTime } from './views.js';
import { formatDateTime } from './time.js';
import { CALL_FILTERS } from './calls-db.js';
import { formatPhoneDisplay, formatDuration, OUTCOME_LABEL, HANGUP_STAGE_LABEL, MATCH_LABEL, acceptanceText, needsCallback } from '../../renorise-shared/calls.js';
import { PRIORITIES } from './crm-constants.js';

const val = (v) => (v === null || v === undefined ? '' : v);
const who = (c) => (c.caller_withheld || !c.from_number ? 'Withheld number' : formatPhoneDisplay(c.from_number));

const outcomeBadge = (c) => {
  const cls = { accepted: 'b-ok', voicemail: 'b-warn', no_message: 'b-warn', missed: 'b-err', in_progress: '' }[c.outcome] || '';
  return html`<span class="badge ${cls}">${OUTCOME_LABEL[c.outcome] || c.outcome}</span>`;
};

// ------------------------------------------------------------------ list

export function callsPage({ result, counts, filters }) {
  const { rows, total, pageSize } = result;
  const countKey = { all: 'all', callbacks: 'callbacks', missed: 'missed', voicemail: 'voicemail', answered: 'answered', unassigned: 'unassigned', spam: 'spam' };
  const pagerParams = { f: filters.f === 'all' ? '' : filters.f, q: filters.q };
  return html`<h1>Calls</h1>
<p class="hint">Calls to the business number. The customer's call and the forwarded call to your cellphone are shown as one call. “Answered” means you pressed 1 to accept, not just that a phone picked up. Times are Toronto time.</p>
<p class="hint"><a href="/calls/playback-check">Check voicemail playback setup</a></p>
<nav class="stage-tabs" aria-label="Filter calls">
  ${CALL_FILTERS.map(([key, label]) => html`<a class="tab" href="/calls${key === 'all' ? '' : `?f=${key}`}" ${filters.f === key ? raw('aria-current="true"') : ''}>${label} <span class="count">${counts[countKey[key]]}</span></a>`)}
</nav>
<form class="card filters" method="get" action="/calls" role="search" aria-label="Search calls">
  <input type="hidden" name="f" value="${filters.f}">
  <div class="row"><div class="field"><label for="cq">Search</label><div class="search">${icon('search')}<input id="cq" name="q" type="search" value="${filters.q}" maxlength="60" placeholder="Phone number, contact name or note"></div></div></div>
  <div class="actions"><button type="submit">${icon('filter')}Apply</button>${filters.q ? html`<a class="link-clear" href="/calls${filters.f === 'all' ? '' : `?f=${filters.f}`}">Clear search</a>` : ''}</div>
</form>
<div class="card">
${rows.length
    ? html`<div class="tablewrap"><table class="stack"><caption class="sr-only">Phone calls, newest first</caption>
<thead><tr><th scope="col">When (Toronto)</th><th scope="col">Caller</th><th scope="col">Result</th><th scope="col">Voicemail</th><th scope="col">Follow-up</th></tr></thead>
<tbody>${rows.map((c) => html`<tr>
  <td data-label="When"><span class="nowrap">${splitDateTime(c.started_at)[0]}</span><br><span class="hint">${splitDateTime(c.started_at)[1]}</span></td>
  <td data-label="Name"><a href="/calls/${c.id}">${who(c)}</a>${c.contact_name ? html`<br><span class="hint">${c.contact_name}</span>` : html`<br><span class="hint">Not linked to a contact</span>`}</td>
  <td data-label="Result">${outcomeBadge(c)}${c.duration_seconds ? html`<br><span class="hint">${formatDuration(c.duration_seconds)}</span>` : ''}</td>
  <td data-label="Voicemail">${c.outcome === 'voicemail' ? html`${formatDuration(c.recording_duration_seconds)}${c.recording_status === 'completed' ? '' : html`<br><span class="hint">not confirmed yet</span>`}` : '—'}</td>
  <td data-label="Follow-up">${c.disposition !== 'open' ? html`<span class="badge">${c.disposition === 'spam' ? 'Spam' : 'Irrelevant'}</span>` : needsCallback(c) ? html`<span class="badge b-err">Callback needed</span>` : c.callback_done_at ? html`<span class="badge b-ok">${c.callback_result === 'not_needed' ? 'No callback needed' : 'Called back'}</span>` : '—'}</td>
</tr>`)}</tbody></table></div>`
    : html`<p class="empty">No calls here yet.</p>`}
${pager('/calls', pagerParams, filters.page, total, pageSize)}
</div>`;
}

// ------------------------------------------------------------------ one call

export function callPage({ detail, csrf, playback, results, q, today }) {
  const { call: c, legs, events, task, candidates, projects } = detail;
  const post = (p) => `/calls/${c.id}${p}`;
  const stage = c.hangup_stage ? HANGUP_STAGE_LABEL[c.hangup_stage] : null;
  const linked = Boolean(c.contact_id);
  const openProjects = projects.filter((p) => !p.archived_at);

  return html`
<p><a href="/calls">← All calls</a></p>
<h1>Call from ${who(c)} ${outcomeBadge(c)} ${c.disposition !== 'open' ? html`<span class="badge">${c.disposition === 'spam' ? 'Spam' : 'Irrelevant'}</span>` : ''}</h1>
<p class="hint">${formatDateTime(c.started_at)} (Toronto time)${c.duration_seconds ? ` · ${formatDuration(c.duration_seconds)}` : ''}</p>
<div class="grid cols">
<div>
  <section class="card" aria-labelledby="what-h">
    <h2 id="what-h">What happened</h2>
    <dl class="kv">
      <dt>Result</dt><dd>${OUTCOME_LABEL[c.outcome] || c.outcome}${stage ? html`<br><span class="hint">${stage}.</span>` : ''}</dd>
      <dt>You accepted it</dt><dd>${acceptanceText(c)}</dd>
      <dt>Caller's number</dt><dd>${c.caller_withheld || !c.from_number ? 'Withheld. Nothing has been guessed.' : c.from_number}</dd>
      <dt>Number called</dt><dd>${val(c.to_number) || '—'}</dd>
      <dt>Started</dt><dd>${formatDateTime(c.started_at)}</dd>
      <dt>Ended</dt><dd>${c.ended_at ? formatDateTime(c.ended_at) : 'Not reported yet'}</dd>
      <dt>Length</dt><dd>${c.duration_seconds != null ? formatDuration(c.duration_seconds) : '—'}</dd>
      <dt>Twilio says</dt><dd>Customer call: ${val(c.parent_status) || 'no report yet'}. Your phone: ${val(c.forward_status) || 'no report'}${c.forward_answered_at ? ' (a phone answered, which can be personal voicemail; that is why acceptance is tracked separately)' : ''}.</dd>
      <dt>Twilio call IDs</dt><dd class="pre">${c.call_sid}${legs.map((l) => `\n${l.leg_sid}  (forwarded to your phone: ${l.status || 'no status'})`).join('')}</dd>
    </dl>
  </section>

  ${c.outcome === 'voicemail' || c.recording_sid
      ? html`<section class="card" aria-labelledby="vm-h"><h2 id="vm-h">Voicemail</h2>
    ${c.recording_status === 'completed' && playback
        ? html`<audio controls preload="none" src="/calls/${c.id}/voicemail">Your browser cannot play audio here.</audio><p class="hint">${formatDuration(c.recording_duration_seconds)} · confirmed by Twilio ${formatDateTime(c.recording_confirmed_at)}. Only you can play this, after signing in; there is no public link.</p>`
        : c.recording_status === 'completed'
          ? html`<p class="banner">Voicemail playback is not set up yet, so it cannot be played here. See the setup steps in the voice Worker README.</p>`
          : html`<p class="banner">A voicemail was started but Twilio has not confirmed the recording yet, so it may not be playable. It will appear here when Twilio confirms it.</p>`}
  </section>`
      : ''}

  <section class="card" aria-labelledby="notes-h">
    <h2 id="notes-h">Notes</h2>
    <form method="post" action="${post('/notes')}">${csrfField(csrf)}
      <div class="field"><label for="notes">Notes about this call</label><textarea id="notes" name="notes" maxlength="5000">${val(c.notes)}</textarea></div>
      <button type="submit">Save notes</button>
    </form>
  </section>

  <section class="card" aria-labelledby="act-h">
    <h2 id="act-h">Activity</h2>
    ${events.length ? html`<ul class="plain">${events.map((e) => html`<li>${e.summary}<br><span class="hint">${formatDateTime(e.created_at)} · ${e.actor === 'twilio' ? 'Reported by Twilio' : e.actor === 'system' ? 'Automatic' : e.actor}</span></li>`)}</ul>` : html`<p class="empty">Nothing recorded.</p>`}
  </section>
</div>

<div>
  <section class="card" aria-labelledby="who-h">
    <h2 id="who-h">Who called</h2>
    <p class="hint">${MATCH_LABEL[c.match_status] || 'Not matched yet'}.</p>
    ${linked
      ? html`<p><a href="/contacts/${c.contact_id}"><strong>${c.contact_name}</strong></a>${c.project_title ? html`<br>Project: <a href="/leads/${c.opportunity_id}">${c.project_title}</a>` : ''}</p>
      ${openProjects.length ? html`<form method="post" action="${post('/project')}">${csrfField(csrf)}<div class="field"><label for="proj">This call is about</label><select id="proj" name="opportunity_id"><option value="">No particular project</option>${openProjects.map((p) => html`<option value="${p.id}" ${c.opportunity_id === p.id ? raw('selected') : ''}>${p.title}</option>`)}</select></div><button class="secondary" type="submit">Save</button></form>` : ''}
      <form method="post" action="${post('/unlink')}">${csrfField(csrf)}<button class="secondary" type="submit">Unlink from ${c.contact_name}</button></form>`
      : html`
      ${candidates.length ? html`<h3>These contacts share this number</h3><ul class="plain">${candidates.map((p) => html`<li><a href="/contacts/${p.id}">${p.display_name}</a>${p.email ? html` <span class="hint">${p.email}</span>` : ''}<form method="post" action="${post('/link')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="contact_id" value="${p.id}"><button class="secondary" type="submit">Link this call to ${p.display_name}</button></form></li>`)}</ul>` : ''}
      <form method="get" action="/calls/${c.id}" role="search"><div class="field"><label for="lq">Find an existing contact</label><input id="lq" name="q" type="search" value="${q}" maxlength="60" placeholder="Name, email or phone"></div><button class="secondary" type="submit">Search contacts</button></form>
      ${q ? (results.length ? html`<ul class="plain">${results.map((p) => html`<li><a href="/contacts/${p.id}">${p.display_name}</a> <span class="hint">${p.email || p.phone || ''}</span><form method="post" action="${post('/link')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="contact_id" value="${p.id}"><button class="secondary" type="submit">Link this call</button></form></li>`)}</ul>` : html`<p class="empty">No contact found for “${q}”.</p>`) : ''}
      <details class="edit"><summary>Turn this call into a new lead</summary><div class="body">
        <p class="sec-note">Uses only the caller's number from Twilio and what you type. No email is invented and nothing is emailed.</p>
        <form method="post" action="${post('/new-lead')}">${csrfField(csrf)}
          <div class="field"><label for="nl-name">Name (required)</label><input id="nl-name" name="display_name" maxlength="200" required placeholder="As they gave it, for example from the voicemail"></div>
          <div class="field"><label for="nl-phone">Phone</label><input id="nl-phone" name="phone" type="tel" maxlength="40" value="${c.caller_withheld || !c.from_number ? '' : formatPhoneDisplay(c.from_number)}">${c.caller_withheld || !c.from_number ? html`<p class="sec-note">The number was withheld. Enter a phone number or an email if you learned one.</p>` : ''}</div>
          <div class="field"><label for="nl-email">Email (only if known)</label><input id="nl-email" name="email" type="email" maxlength="254"></div>
          <div class="field"><label for="nl-type">Renovation type (only if known)</label><input id="nl-type" name="renovation_type" maxlength="300"></div>
          <div class="field"><label for="nl-desc">What they asked for</label><textarea id="nl-desc" name="description" maxlength="5000"></textarea></div>
          <div class="field"><label for="nl-pri">Priority</label><select id="nl-pri" name="priority">${PRIORITIES.map(([k, v]) => html`<option value="${k}" ${k === 'normal' ? raw('selected') : ''}>${v}</option>`)}</select></div>
          <button type="submit">Create lead</button>
        </form></div></details>`}
  </section>

  <section class="card" aria-labelledby="cb-h">
    <h2 id="cb-h">Callback</h2>
    ${c.callback_done_at
      ? html`<p><span class="badge b-ok">${c.callback_result === 'not_needed' ? 'No callback needed' : 'Called back'}</span> <span class="hint">${formatDateTime(c.callback_done_at)} · ${c.callback_done_by}</span></p>
      <form method="post" action="${post('/callback')}">${csrfField(csrf)}<input type="hidden" name="action" value="reopen"><button class="secondary" type="submit">Reopen</button></form>`
      : needsCallback(c)
        ? html`<p><span class="badge b-err">Callback needed</span></p>
      <form method="post" action="${post('/callback')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="action" value="done"><button type="submit">Mark called back</button></form>
      <form method="post" action="${post('/callback')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="action" value="not_needed"><button class="secondary" type="submit">No callback needed</button></form>`
        : html`<p class="empty">${c.outcome === 'accepted' ? 'You spoke with them, so no callback is due.' : c.disposition !== 'open' ? 'Marked as not a real call.' : 'Nothing to call back yet.'}</p>`}
    ${task ? html`<p class="hint">Task: <a href="/follow-ups">${task.title}</a> (${task.status === 'open' ? `due ${task.due_on}` : task.status})</p>` : ''}
    ${linked && (!task || task.status !== 'open') && needsCallback(c) ? html`<form method="post" action="${post('/task')}">${csrfField(csrf)}<button class="secondary" type="submit">Create a callback task</button></form>` : ''}
    ${!linked && needsCallback(c) ? html`<p class="sec-note">Link this call to a contact to get a callback task on their record.</p>` : ''}
  </section>

  <section class="card" aria-labelledby="sp-h">
    <h2 id="sp-h">Not a real call?</h2>
    ${c.disposition === 'open'
      ? html`<form method="post" action="${post('/mark')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="value" value="spam"><button class="danger" type="submit">Mark as spam</button></form>
      <form method="post" action="${post('/mark')}" class="inline-form">${csrfField(csrf)}<input type="hidden" name="value" value="irrelevant"><button class="secondary" type="submit">Mark as irrelevant</button></form>
      <p class="sec-note">Spam and irrelevant calls do not get callback tasks or email alerts. Nothing is deleted.</p>`
      : html`<form method="post" action="${post('/mark')}">${csrfField(csrf)}<input type="hidden" name="value" value="open"><button class="secondary" type="submit">This is a real call after all</button></form>`}
  </section>
</div>
</div>`;
}

// ------------------------------------------------------------------ voicemail playback setup check

export function playbackCheckPage({ steps }) {
  const problems = steps.filter((s) => s.status === 'fail').length;
  const skipped = steps.filter((s) => s.status === 'skip').length;
  const badge = (s) => (s.status === 'ok' ? html`<span class="badge b-ok">OK</span>` : s.status === 'fail' ? html`<span class="badge b-err">Problem</span>` : html`<span class="badge">Not checked yet</span>`);
  return html`<p><a href="/calls">← All calls</a></p>
<h1>Voicemail playback check</h1>
<p class="hint">A read-only check that this dashboard can fetch voicemail recordings from Twilio securely. It uses the saved credentials on the server, fetches at most one byte of one recording, and shows only pass or fail: no credentials, recording ids or audio.</p>
<div class="banner ${problems ? '' : 'info'}" role="status">${problems ? html`<strong>${problems} problem${problems === 1 ? '' : 's'} found.</strong> Fix the first one below, then reload this page.` : skipped ? html`<strong>No problems so far.</strong> ${skipped} check${skipped === 1 ? '' : 's'} can only run after a first voicemail exists.` : html`<strong>Everything checks out.</strong> Voicemails can be played securely from each call page.`}</div>
<section class="card" aria-labelledby="pc-h"><h2 id="pc-h">Checks</h2>
<ul class="plain">${steps.map((s) => html`<li>${badge(s)} <strong>${s.label}</strong><br><span class="hint">${s.detail}</span></li>`)}</ul></section>`;
}
