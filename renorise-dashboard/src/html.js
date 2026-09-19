// Minimal HTML templating that is SAFE BY DEFAULT: every interpolated value is
// HTML-escaped unless it was produced by html`` itself (or explicitly marked
// with raw()). Customer-submitted text can therefore never become markup.

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

const CSS = `
:root{--bg:#f4f5f7;--card:#fff;--ink:#14171d;--muted:#5b6472;--line:#d9dde3;--brand:#14171d;--accent:#b84a00;--accent-ink:#fff;--ok:#1a6b3a;--ok-bg:#e6f4ea;--err:#a11d1d;--err-bg:#fdeaea;--info:#1d4f91;--info-bg:#e8f0fb;--warn:#8a5a00;--warn-bg:#fff4dc;--focus:#1a56db}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:#0b4fb3}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.skip{position:absolute;left:-999px;top:0;background:#fff;color:#000;padding:8px 12px;z-index:10}
.skip:focus{left:8px;top:8px}
header.top{background:var(--brand);color:#fff}
.bar{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.brand{font-weight:700;letter-spacing:.2px;color:#fff;text-decoration:none}
nav.main{display:flex;flex-wrap:wrap;gap:4px}
nav.main a{color:#e8eaee;text-decoration:none;padding:8px 12px;border-radius:6px;min-height:44px;display:inline-flex;align-items:center}
nav.main a:hover{background:#2a2f38}
nav.main a[aria-current="page"]{background:#fff;color:#14171d;font-weight:600}
.who{margin-left:auto;color:#c9ced6;font-size:14px}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:24px;margin:8px 0 16px}
h2{font-size:18px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
.grid{display:grid;gap:12px}
.stats{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;text-decoration:none;color:inherit;display:block}
.stat .n{font-size:30px;font-weight:700;line-height:1.1}
.stat .l{color:var(--muted);font-size:14px}
.stat.alert{border-color:var(--err);background:var(--err-bg)}
.cols{grid-template-columns:1fr}
@media(min-width:800px){.cols{grid-template-columns:2fr 1fr}.two{grid-template-columns:1fr 1fr}}
.two{grid-template-columns:1fr}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}
caption{text-align:left;font-weight:600;padding:0 0 8px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:13px;color:var(--muted);font-weight:600;white-space:nowrap}
@media(max-width:700px){
 table.stack thead{position:absolute;left:-9999px}
 table.stack tr{display:block;border:1px solid var(--line);border-radius:8px;margin-bottom:10px;padding:6px}
 table.stack td{display:flex;justify-content:space-between;gap:12px;border:0;padding:4px 6px}
 table.stack td::before{content:attr(data-label);color:var(--muted);font-size:13px;font-weight:600;flex:0 0 40%}
}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:13px;font-weight:600;border:1px solid var(--line);background:#eef0f3;color:#2b3340}
.st-new{background:#e8f0fb;color:#1d4f91;border-color:#b9cff0}
.st-contacted{background:#fff4dc;color:#7a5200;border-color:#f0d99a}
.st-assessment_booked{background:#efe8fb;color:#4b2a91;border-color:#d0bff0}
.st-quote_sent{background:#e0f4f4;color:#0f5a5a;border-color:#a9dcdc}
.st-won{background:#e6f4ea;color:#1a6b3a;border-color:#a9d9b8}
.st-lost{background:#f1f1f1;color:#555;border-color:#d0d0d0}
.b-ok{background:var(--ok-bg);color:var(--ok);border-color:#a9d9b8}
.b-err{background:var(--err-bg);color:var(--err);border-color:#eeb3b3}
.b-warn{background:var(--warn-bg);color:var(--warn);border-color:#f0d99a}
.notice{padding:10px 14px;border-radius:8px;margin-bottom:14px;border:1px solid}
.notice.ok{background:var(--ok-bg);color:#124d29;border-color:#a9d9b8}
.notice.error{background:var(--err-bg);color:#7d1515;border-color:#eeb3b3}
.notice.info{background:var(--info-bg);color:#163d70;border-color:#b9cff0}
label{display:block;font-weight:600;margin:0 0 4px;font-size:14px}
input,select,textarea{width:100%;font:inherit;padding:9px 10px;border:1px solid #8a93a0;border-radius:8px;background:#fff;color:var(--ink);min-height:44px}
textarea{min-height:90px;resize:vertical}
.field{margin-bottom:12px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:end}
.row>.field{flex:1 1 180px;margin-bottom:0}
button,.btn{font:inherit;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer;min-height:44px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button.secondary,.btn.secondary{background:#fff;color:var(--brand)}
button.danger{background:#fff;color:var(--err);border-color:var(--err)}
button:disabled{opacity:.55;cursor:not-allowed}
.hint{color:var(--muted);font-size:14px}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0}
dl.kv dt{color:var(--muted);font-size:14px}
dl.kv dd{margin:0;overflow-wrap:anywhere}
.pre{white-space:pre-wrap;overflow-wrap:anywhere}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:8px 0;border-bottom:1px solid var(--line)}
ul.plain li:last-child{border-bottom:0}
.pager{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.tabs a{padding:8px 14px;border:1px solid var(--line);border-radius:999px;text-decoration:none;background:#fff;color:var(--ink);min-height:44px;display:inline-flex;align-items:center}
.tabs a[aria-current="true"]{background:var(--brand);color:#fff;border-color:var(--brand)}
.empty{color:var(--muted);padding:8px 0}
.overdue{color:var(--err);font-weight:600}
`;

export function layout({ title, active, email, nonce, notice, body }) {
  const nav = [
    ['/', 'Overview', 'overview'],
    ['/leads', 'Leads', 'leads'],
    ['/follow-ups', 'Follow-ups', 'follow-ups'],
    ['/contractors', 'Contractors', 'contractors'],
    ['/emails', 'Email activity', 'emails'],
  ];
  const n = notice && NOTICES[notice] ? NOTICES[notice] : null;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} — RenoRise Dashboard</title>
<style nonce="${nonce}">${raw(CSS)}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <div class="bar">
    <a class="brand" href="/">RenoRise Dashboard</a>
    <nav class="main" aria-label="Main">
      ${nav.map(([href, label, key]) => html`<a href="${href}" ${key === active ? raw('aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    <span class="who">Signed in as ${email}</span>
  </div>
</header>
<main id="content">
${n ? html`<div class="notice ${n[0]}" role="${n[0] === 'error' ? 'alert' : 'status'}">${n[1]}</div>` : ''}
${body}
</main>
</body>
</html>`;
}

export function errorPage(title, message, nonce) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style nonce="${nonce}">body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#14171d}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}
