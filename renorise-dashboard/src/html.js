// Minimal HTML templating that is SAFE BY DEFAULT: every interpolated value is
// HTML-escaped unless it was produced by html`` itself (or explicitly marked
// with raw()). Customer-submitted text can therefore never become markup.

import { SEQ_NOTICES } from './seq-notices.js';
import { CSS } from './styles.js';
import { LOGO_DATA_URI } from './assets.js';
import { iconSvg } from './icons.js';

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const toString = (r) => (r instanceof Raw ? r.s : esc(r));

// Fixed, server-side messages. The page only ever shows text from this table,
// selected by a short code — request input is never echoed into the page.
export const NOTICES = {
  stage_saved: ['ok', 'Stage updated.'],
  note_saved: ['ok', 'Note added.'],
  contractor_saved: ['ok', 'Contractor assignment updated. Nothing was sent to the contractor.'],
  followup_saved: ['ok', 'Follow-up added.'],
  followup_done: ['ok', 'Follow-up marked complete.'],
  assessment_saved: ['ok', 'Assessment date updated.'],
  archived: ['ok', 'Lead archived. It is hidden from the default list and can be restored.'],
  unarchived: ['ok', 'Lead restored from the archive.'],
  contractor_created: ['ok', 'Contractor added.'],
  contractor_updated: ['ok', 'Contractor updated.'],
  contractor_archived: ['ok', 'Contractor archived. Existing lead assignments are kept.'],
  contractor_unarchived: ['ok', 'Contractor restored.'],
  retry_queued: ['ok', 'Email re-queued. The automatic retry check that runs every 15 minutes will send it once; nothing is sent from this page.'],
  no_change: ['info', 'Nothing to change — that was already the current value.'],
  retry_already_queued: ['info', 'That email is already queued for retry.'],
  retry_not_eligible: ['error', 'Only emails that failed can be retried.'],
  bad_stage: ['error', 'Choose one of the listed stages.'],
  note_empty: ['error', 'Write something before saving a note.'],
  note_long: ['error', 'Notes can be up to 5,000 characters.'],
  bad_contractor: ['error', 'Choose a contractor from the list.'],
  bad_date: ['error', 'Enter a valid follow-up date.'],
  followup_note_long: ['error', 'Follow-up notes can be up to 500 characters.'],
  bad_datetime: ['error', 'Enter a valid assessment date and time (that local time may not exist because of a clock change).'],
  contractor_name: ['error', 'A contractor name is required.'],
  contractor_email: ['error', 'That contractor email address does not look valid.'],
  not_found: ['error', 'That record was not found.'],
  csrf: ['error', 'Your session check failed. Reload the page and try again.'],
  bad_request: ['error', 'That request could not be processed.'],
};

Object.assign(NOTICES, SEQ_NOTICES);

const NAV = [
  ['/', 'Overview', 'overview', 'grid'],
  ['/leads', 'Leads', 'leads', 'users'],
  ['/follow-ups', 'Follow-ups', 'follow-ups', 'calendar'],
  ['/contractors', 'Contractors', 'contractors', 'tool'],
  ['/sequence', 'Follow-up emails', 'sequence', 'send'],
  ['/emails', 'Email activity', 'emails', 'inbox'],
];

export const icon = (name, cls) => raw(iconSvg(name, cls));

/** Compact panel at the top of every page: total leads, contacted leads, pending follow-ups. */
function summaryPanel(s) {
  if (!s) return '';
  return html`<section class="summary" aria-label="Summary">
  <a class="sum" href="/leads"><span class="sum-ico tone-orange">${icon('users')}</span><span><span class="sum-n">${s.total}</span><span class="sum-l">Total leads</span></span></a>
  <a class="sum" href="/leads?status=contacted"><span class="sum-ico tone-gold">${icon('phone')}</span><span><span class="sum-n">${s.contacted}</span><span class="sum-l">Contacted</span></span></a>
  <a class="sum" href="/follow-ups"><span class="sum-ico tone-teal">${icon('clock')}</span><span><span class="sum-n">${s.pending_followups}</span><span class="sum-l">Pending follow-ups${s.overdue ? html`<span class="sum-sub">${s.overdue} overdue</span>` : ''}</span></span></a>
</section>`;
}

export function layout({ title, active, email, nonce, notice, body, summary }) {
  const n = notice && NOTICES[notice] ? NOTICES[notice] : null;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<title>${title} — RenoRise Dashboard</title>
<link rel="icon" href="${LOGO_DATA_URI}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap">
<style nonce="${nonce}">${raw(CSS)}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<div class="shell">
  <aside class="sidebar">
    <a class="brand" href="/"><img class="brand-mark" src="${LOGO_DATA_URI}" alt="" width="42" height="42"><span><b>RenoRise</b><small>Dashboard</small></span></a>
    <nav class="main" aria-label="Main">
      ${NAV.map(([href, label, key, ic]) => html`<a href="${href}" ${key === active ? raw('aria-current="page"') : ''}>${icon(ic)}${label}</a>`)}
    </nav>
    <p class="who">Signed in as ${email}</p>
  </aside>
  <div class="content">
    <main id="content">
${summaryPanel(summary)}
${n ? html`<div class="notice ${n[0]}" role="${n[0] === 'error' ? 'alert' : 'status'}">${n[1]}</div>` : ''}
${body}
    </main>
  </div>
</div>
</body>
</html>`;
}

export function errorPage(title, message, nonce) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><link rel="icon" href="${LOGO_DATA_URI}"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&amp;display=swap"><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f7f5f1;color:#14171d;font:16px/1.6 'Plus Jakarta Sans',system-ui,sans-serif}main{max-width:520px;background:#fff;border:1px solid #e8e5df;border-radius:20px;padding:32px;box-shadow:0 18px 40px -18px rgba(20,23,29,.3)}h1{margin:12px 0 8px;font-size:26px;font-weight:800;letter-spacing:-.02em}p{margin:0;color:#5a6270}img{width:44px;height:44px;border-radius:10px}</style></head><body><main><img src="${LOGO_DATA_URI}" alt=""><h1>${title}</h1><p>${message}</p></main></body></html>`;
}
