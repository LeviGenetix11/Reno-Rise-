// Dashboard stylesheet. Design tokens deliberately mirror the public website
// (css/style.css): deep slate #14171d, warm cream, brand orange, Plus Jakarta
// Sans, generous rounded corners, pill buttons. Orange BUTTONS use a darker shade
// (--orange-btn) so white text passes WCAG AA; the bright brand orange is used
// for icons and accents only. No inline styles anywhere (the CSP forbids them).

export const CSS = `
:root{
  --dark:#14171d;--dark-2:#1b1f27;--dark-soft:#2a2f3a;
  --orange:#f0782a;--orange-btn:#b94a09;--orange-btn-hover:#9a3c05;--orange-light:#fdecdf;--orange-a11y:#a8420d;
  --teal:#0f766e;--teal-light:#dff4f1;
  --cream:#f7f5f1;--cream-2:#f1efe9;--cream-3:#faf8f4;
  --border:#e8e5df;--edge:#8b8f98;
  --text:#14171d;--muted:#5a6270;--link:#0b4fb3;
  --ok:#1a6b3a;--ok-bg:#e6f4ea;--err:#a11d1d;--err-bg:#fdeaea;--info:#1d4f91;--info-bg:#e8f0fb;--warn:#7a5200;--warn-bg:#fff4dc;
  --radius-lg:20px;--radius:14px;--radius-sm:10px;--pill:999px;
  --shadow-sm:0 1px 2px rgba(20,23,29,.06),0 8px 20px -12px rgba(20,23,29,.22);
  --shadow:0 2px 4px rgba(20,23,29,.05),0 18px 40px -18px rgba(20,23,29,.30);
  --focus:#1a56db;--sidebar:240px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;color:var(--text);font:16px/1.55 'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;background-color:var(--cream);background-image:linear-gradient(180deg,#fdf1e4 0,rgba(247,245,241,0) 340px);background-repeat:no-repeat}
a{color:var(--link);text-underline-offset:3px}
h1,h2,h3{font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--dark);margin:0}
h1{font-size:clamp(24px,2.6vw,30px);margin:4px 0 18px}
h2{font-size:17px;margin:0 0 12px}
h3{font-size:15px;margin:14px 0 8px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:6px}
.skip{position:absolute;left:-999px;top:0;background:#fff;color:#000;padding:10px 14px;z-index:50;border-radius:0 0 10px 0;font-weight:700}
.skip:focus{left:0}
.ico{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* ---------- shell: sidebar (desktop) / top bar (mobile) ---------- */
.shell{display:grid;grid-template-columns:var(--sidebar) minmax(0,1fr);min-height:100vh}
.sidebar{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:22px;padding:22px 14px 16px;background:linear-gradient(180deg,var(--dark) 0,var(--dark-2) 100%);color:#e6e8ec;overflow-y:auto}
.sidebar :focus-visible{outline-color:#ffd2b0}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;padding:2px 8px;border-radius:12px}
.brand-mark{width:42px;height:42px;border-radius:10px;object-fit:cover;flex:none;background:#fff}
.brand b{display:block;font-size:19px;font-weight:800;letter-spacing:-.01em;color:#fff;line-height:1.1}
.brand small{display:block;margin-top:3px;font-size:11.5px;font-weight:700;color:var(--orange);letter-spacing:.16em;text-transform:uppercase}
nav.main{display:flex;flex-direction:column;gap:4px}
nav.main a{display:flex;align-items:center;gap:12px;min-height:46px;padding:10px 14px;border-radius:12px;color:#d5d9e0;font-weight:600;font-size:15px;text-decoration:none;transition:background .18s,color .18s,transform .18s}
nav.main a .ico{color:#aab1bd;transition:color .18s,transform .18s}
nav.main a:hover{background:rgba(255,255,255,.08);color:#fff;transform:translateX(2px)}
nav.main a:hover .ico{color:var(--orange)}
nav.main a[aria-current="page"]{background:rgba(240,120,42,.16);color:#fff;box-shadow:inset 3px 0 0 var(--orange)}
nav.main a[aria-current="page"] .ico{color:var(--orange)}
.who{margin:auto 0 0;padding:14px 10px 0;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:#b4bac6;overflow-wrap:anywhere}
main{max-width:1180px;margin:0 auto;padding:28px 26px 72px}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
main>*{animation:rise .38s ease both}
main>*:nth-child(2){animation-delay:.04s}main>*:nth-child(3){animation-delay:.08s}main>*:nth-child(4){animation-delay:.12s}main>*:nth-child(n+5){animation-delay:.16s}

/* ---------- summary panel ---------- */
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 22px}
.sum{display:flex;align-items:center;gap:14px;padding:14px 18px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-sm);color:inherit;text-decoration:none;transition:transform .18s,box-shadow .18s,border-color .18s}
.sum:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:#f0c9a8}
.sum-ico{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;flex:none}
.tone-orange{background:var(--orange-light);color:var(--orange-a11y)}
.tone-gold{background:var(--warn-bg);color:var(--warn)}
.tone-teal{background:var(--teal-light);color:var(--teal)}
.tone-red{background:var(--err-bg);color:var(--err)}
.tone-blue{background:var(--info-bg);color:var(--info)}
.tone-green{background:var(--ok-bg);color:var(--ok)}
.sum-n{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.sum-l{display:block;font-size:13.5px;font-weight:600;color:var(--muted)}
.sum-sub{display:inline-block;margin-left:6px;font-size:12.5px;font-weight:800;color:var(--err)}

/* ---------- cards, tiles, layout grids ---------- */
.card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:18px;box-shadow:var(--shadow-sm)}
.grid{display:grid;gap:14px}
.stats{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:8px}
.stat{display:block;padding:16px 18px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-sm);color:inherit;text-decoration:none;transition:transform .18s,box-shadow .18s,border-color .18s}
a.stat:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:#f0c9a8}
.stat-ico{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;margin-bottom:10px}
.stat .n{font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.stat .l{margin-top:2px;font-size:14px;font-weight:600;color:var(--muted)}
.stat.alert{border-color:#efb3b3;background:linear-gradient(180deg,#fff,#fff4f4)}
.cols{grid-template-columns:1fr}.two{grid-template-columns:1fr}
@media(min-width:900px){.cols{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}

/* ---------- tables ---------- */
.tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm)}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:14.5px}
caption{text-align:left;padding:0 0 8px;color:var(--muted);font-size:13.5px}
th{background:var(--cream-2);color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;text-align:left;padding:11px 12px;white-space:nowrap;border-bottom:1px solid var(--border)}
td{padding:12px 12px;vertical-align:top;border-bottom:1px solid var(--border);overflow-wrap:anywhere}
/* Free-text columns are capped so one long value wraps instead of stretching the whole table. */
td[data-label="Name"],td[data-label="Project"]{max-width:190px}
td[data-label="Contact"]{max-width:220px}
.nowrap{white-space:nowrap}
.mail-pair{display:flex;align-items:center;gap:6px;margin:0 0 4px;white-space:nowrap}
.mail-pair:last-child{margin:0}
.mini-l{min-width:58px;font-size:12px;font-weight:700;color:var(--muted)}
tbody tr{transition:background .15s}
tbody tr:nth-child(even){background:var(--cream-3)}
tbody tr:hover{background:var(--orange-light)}
tbody tr:last-child td{border-bottom:0}
td a{font-weight:700}
@media(max-width:900px){
  .tablewrap{border:0;overflow:visible}
  table.stack thead{position:absolute;left:-9999px}
  table.stack,table.stack tbody{display:block}
  table.stack tr{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;background:#fff;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;padding:14px;box-shadow:var(--shadow-sm)}
  table.stack tbody tr:nth-child(even){background:var(--cream-3)}
  table.stack tbody tr:hover{background:var(--orange-light)}
  table.stack td{display:block;min-width:0;padding:0;border:0}
  table.stack td::before{display:block;content:attr(data-label);margin-bottom:2px;font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  table.stack td[data-label="Name"],table.stack td[data-label="Lead"],table.stack td[data-label="Contact"],table.stack td[data-label="Action"],table.stack td[data-label="Note"],table.stack td[data-label="Last error"]{grid-column:1/-1}
  table.stack td[data-label="Name"]::before,table.stack td[data-label="Lead"]::before{display:none}
  table.stack td[data-label="Name"],table.stack td[data-label="Lead"]{font-size:17px}
}

/* ---------- badges, dots, chips, tabs ---------- */
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:var(--pill);font-size:12.5px;font-weight:700;border:1px solid var(--border);background:var(--cream-2);color:#2b3340;white-space:nowrap}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
.st-new{background:#e8f0fb;color:#1d4f91;border-color:#c5d8f3}
.st-contacted{background:#fff4dc;color:#7a5200;border-color:#f0d99a}
.st-assessment_booked{background:#efe8fb;color:#4b2a91;border-color:#d8c8f3}
.st-quote_sent{background:#dff4f1;color:#0b5a53;border-color:#a8dcd6}
.st-won{background:#e6f4ea;color:#1a6b3a;border-color:#a9d9b8}
.st-lost{background:#eceef1;color:#454c58;border-color:#d0d4db}
.b-ok{background:var(--ok-bg);color:var(--ok);border-color:#a9d9b8}
.b-err{background:var(--err-bg);color:var(--err);border-color:#eeb3b3}
.b-warn{background:var(--warn-bg);color:var(--warn);border-color:#f0d99a}
.stage-tabs,.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.tab,.tabs a{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:8px 16px;border-radius:var(--pill);background:#fff;border:1.5px solid var(--border);color:var(--text);font-weight:700;font-size:14.5px;text-decoration:none;transition:transform .15s,background .15s,border-color .15s,box-shadow .15s}
.tab:hover,.tabs a:hover{background:var(--cream-2);border-color:var(--edge);transform:translateY(-1px)}
.tab[aria-current="true"],.tabs a[aria-current="true"]{background:var(--dark);border-color:var(--dark);color:#fff;box-shadow:var(--shadow-sm)}
.count{display:inline-block;min-width:24px;padding:1px 8px;border-radius:var(--pill);background:var(--cream-2);color:var(--muted);font-size:12.5px;font-weight:800;text-align:center}
[aria-current="true"] .count{background:rgba(255,255,255,.2);color:#fff}
.dot-new{color:#3b82f6}.dot-contacted{color:#f59e0b}.dot-assessment_booked{color:#8b5cf6}.dot-quote_sent{color:#14b8a6}.dot-won{color:#22c55e}.dot-lost{color:#6b7280}.dot-all{color:var(--orange)}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 16px}
.chips-label{font-size:13.5px;font-weight:800;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 10px 4px 14px;border-radius:var(--pill);background:var(--orange-light);color:var(--orange-a11y);border:1px solid #f6c9a6;font-size:13.5px;font-weight:700;text-decoration:none;transition:background .15s,transform .15s}
.chip:hover{background:#fbdcc4;transform:translateY(-1px)}
.chip .ico{width:15px;height:15px}

/* ---------- notices ---------- */
.notice{padding:13px 16px;border-radius:12px;margin-bottom:16px;border:1px solid;border-left-width:5px;font-weight:500}
.notice.ok{background:var(--ok-bg);color:#124d29;border-color:#a9d9b8}
.notice.error{background:var(--err-bg);color:#7d1515;border-color:#eeb3b3}
.notice.info{background:var(--info-bg);color:#163d70;border-color:#b9cff0}

/* ---------- forms and buttons ---------- */
label{display:block;margin:0 0 5px;font-size:14px;font-weight:700}
input,select,textarea{width:100%;min-height:46px;padding:10px 13px;font:inherit;color:var(--text);background:#fff;border:1.5px solid var(--edge);border-radius:12px;transition:border-color .15s,box-shadow .15s,background .15s}
textarea{min-height:96px;resize:vertical}
input:hover,select:hover,textarea:hover{border-color:#5a6270}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--orange-btn);box-shadow:0 0 0 3px rgba(240,120,42,.28)}
input[type="checkbox"]{width:20px;height:20px;min-height:0;accent-color:var(--orange-btn);vertical-align:middle;margin-right:8px}
.is-active{border-color:var(--orange-btn);background:#fffaf5}
.field{margin-bottom:14px}
.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
.row>.field{flex:1 1 180px;margin-bottom:0}
.search{position:relative}
.search .ico{position:absolute;left:13px;top:13px;color:var(--muted);pointer-events:none}
.search input{padding-left:42px}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:16px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:11px 24px;font:inherit;font-size:15px;font-weight:800;color:#fff;background:var(--orange-btn);border:1.5px solid var(--orange-btn);border-radius:var(--pill);cursor:pointer;text-decoration:none;box-shadow:0 12px 22px -14px rgba(185,74,9,.8);transition:transform .15s,box-shadow .15s,background .15s,border-color .15s}
button:hover,.btn:hover{background:var(--orange-btn-hover);border-color:var(--orange-btn-hover);transform:translateY(-1px);box-shadow:0 16px 26px -14px rgba(154,60,5,.85)}
button:active,.btn:active{transform:translateY(0)}
button.secondary,.btn.secondary{color:var(--dark);background:#fff;border-color:var(--edge);box-shadow:none}
button.secondary:hover,.btn.secondary:hover{background:var(--cream-2);border-color:#5a6270;box-shadow:none}
.btn-dark{background:var(--dark);border-color:var(--dark);box-shadow:0 12px 22px -14px rgba(20,23,29,.7)}
.btn-dark:hover{background:var(--dark-soft);border-color:var(--dark-soft)}
button.danger{color:var(--err);background:#fff;border-color:var(--err);box-shadow:none}
button.danger:hover{background:var(--err-bg);border-color:var(--err)}
button:disabled{opacity:.55;cursor:not-allowed;transform:none}
.btn .ico,button .ico{width:18px;height:18px}
.link-clear{font-weight:700}

/* ---------- content bits ---------- */
.hint{color:var(--muted);font-size:14px}
.empty{color:var(--muted);padding:10px 0}
.overdue{color:var(--err);font-weight:800}
.pre{white-space:pre-wrap;overflow-wrap:anywhere}
.mono{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.55 ui-monospace,Consolas,monospace;background:var(--cream-3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px}
dl.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 20px;margin:0}
dl.kv dt{color:var(--muted);font-size:14px;font-weight:600}
dl.kv dd{margin:0;overflow-wrap:anywhere}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:10px 0;border-bottom:1px solid var(--border)}
ul.plain li:last-child{border-bottom:0}
.pager{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;color:var(--muted);font-weight:600}
.pager .btn{min-height:40px;padding:8px 18px}

/* ---------- responsive: sidebar becomes a compact top bar ---------- */
@media(max-width:1000px){
  .shell{display:block}
  .sidebar{height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;z-index:30;overflow:visible;box-shadow:0 8px 24px -14px rgba(20,23,29,.6)}
  .who{display:none}
  nav.main{flex:1 0 100%;flex-direction:row;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
  nav.main a{flex:none;white-space:nowrap;padding:9px 15px;border-radius:var(--pill);min-height:44px}
  nav.main a[aria-current="page"]{box-shadow:none;background:rgba(240,120,42,.26)}
  nav.main a:hover{transform:none}
  main{padding:20px 16px 56px}
}
@media(max-width:640px){
  .summary{gap:8px}
  .sum{flex-direction:column;align-items:flex-start;gap:6px;padding:12px}
  .sum-ico{width:34px;height:34px}
  .sum-ico .ico{width:18px;height:18px}
  .sum-n{font-size:22px}
  .sum-l{font-size:12.5px}
  .card{padding:16px}
  .actions .btn,.actions button{flex:1 1 auto}
  dl.kv{grid-template-columns:1fr;gap:2px}
  dl.kv dd{margin-bottom:10px}
}
@media(max-width:330px){.summary{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
`;
