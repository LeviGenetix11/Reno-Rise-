// Extra styles for the CRM screens (pipeline board, timeline, Today, forms).
// Same tokens as styles.js; appended after it. No inline styles anywhere (the CSP forbids them).

export const CSS_CRM = `
/* ---------- stage colours (pipeline) ---------- */
.st-new_inquiry{background:#e8f0fb;color:#1d4f91;border-color:#c5d8f3}
.st-contact_attempted{background:#fff4dc;color:#7a5200;border-color:#f0d99a}
.st-in_conversation{background:#fdecdf;color:#8a3a08;border-color:#f6c9a6}
.st-qualified{background:#dff4f1;color:#0b5a53;border-color:#a8dcd6}
.st-consultation_booked{background:#efe8fb;color:#4b2a91;border-color:#d8c8f3}
.st-contractor_matching{background:#e6ebfb;color:#2b3a91;border-color:#c5cef3}
.st-referred{background:#f3e8fb;color:#6b2a91;border-color:#e0c8f3}
.st-quote_pending{background:#e9eef0;color:#34515c;border-color:#cbd6da}
.st-on_hold{background:#f4ece4;color:#6b4a2a;border-color:#e2d0bd}
.st-review{background:#fdeaea;color:#a11d1d;border-color:#eeb3b3}
.dot-new_inquiry{color:#3b82f6}.dot-contact_attempted{color:#f59e0b}.dot-in_conversation{color:#f0782a}.dot-qualified{color:#14b8a6}
.dot-consultation_booked{color:#8b5cf6}.dot-contractor_matching{color:#4f46e5}.dot-referred{color:#a855f7}.dot-quote_pending{color:#64748b}
.dot-on_hold{color:#a16207}.dot-needs_review{color:#dc2626}
.pri-high{background:#fdeaea;color:#a11d1d;border-color:#eeb3b3}
.pri-low{background:#eceef1;color:#454c58;border-color:#d0d4db}
.q-qualified{background:#e6f4ea;color:#1a6b3a;border-color:#a9d9b8}
.q-not_a_fit{background:#eceef1;color:#454c58;border-color:#d0d4db}
.badge-test{background:#fff;color:#5a6270;border:1.5px dashed #8b8f98}

/* ---------- view switch, filters ---------- */
.view-switch{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;align-items:center}
.view-switch .hint{margin-left:auto}

/* ---------- pipeline board (works with the keyboard; drag and drop is not needed) ---------- */
.board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(255px,275px);gap:14px;overflow-x:auto;padding:4px 2px 18px;margin:0 0 8px;border-radius:var(--radius-sm)}
.lane{align-self:start;min-width:0;background:var(--cream-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px}
.lane h2{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px;font-size:14.5px}
.lane h2 span.name{display:inline-flex;align-items:center;gap:8px}
.lane-empty{margin:0;padding:8px 2px;color:var(--muted);font-size:14px}
.pcard{min-width:0;margin:0 0 10px;padding:12px;background:#fff;border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:var(--shadow-sm)}
.pcard:last-child{margin-bottom:0}
.pc-title{display:block;font-weight:800;font-size:15.5px;line-height:1.3;overflow-wrap:anywhere}
.pc-sub{margin:2px 0 8px;color:var(--muted);font-size:13.5px;overflow-wrap:anywhere}
.pc-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.pc-chips .badge{font-size:12px;padding:2px 9px}
.mover{display:flex;gap:6px;align-items:center;margin:8px 0 0}
.mover select{min-height:40px;padding:6px 8px;font-size:13.5px}
.mover button{min-height:40px;padding:6px 14px;font-size:13.5px;flex:none}
.lane-more{margin:8px 0 0;font-size:13.5px;font-weight:700}

/* ---------- timeline ---------- */
ul.timeline{list-style:none;margin:0;padding:0 0 0 12px;border-left:2px solid var(--border)}
.tl-item{position:relative;padding:0 0 18px 18px}
.tl-item:last-child{padding-bottom:2px}
.tl-item::before{content:"";position:absolute;left:-9px;top:5px;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--edge)}
.tl-manual::before{border-color:var(--orange)}
.tl-provider::before{border-color:var(--teal)}
.tl-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 3px}
.tl-head strong{font-size:15px}
.tl-body{margin:0 0 3px}
.pv{display:inline-block;padding:2px 9px;border-radius:var(--pill);font-size:12px;font-weight:800;border:1px solid}
.pv-manual{background:#fff4dc;color:#7a5200;border-color:#f0d99a}
.pv-system{background:#eceef1;color:#454c58;border-color:#d0d4db}
.pv-provider{background:#dff4f1;color:#0b5a53;border-color:#a8dcd6}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:0 0 14px;font-size:13.5px;color:var(--muted)}

/* ---------- forms in cards ---------- */
details.edit{margin:14px 0 0;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--cream-3)}
details.edit>summary{display:flex;align-items:center;min-height:46px;padding:8px 14px;cursor:pointer;font-weight:800;color:var(--dark);list-style-position:inside}
details.edit[open]>summary{border-bottom:1px solid var(--border)}
details.edit>.body{padding:14px}
fieldset.reasons{margin:0 0 14px;padding:12px 14px 4px;border:1px dashed var(--edge);border-radius:12px}
fieldset.reasons legend{padding:0 6px;font-size:13.5px;font-weight:800;color:var(--muted)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0 14px}
.checkline{display:flex;align-items:flex-start;gap:8px;margin:0 0 14px;font-weight:600}
.checkline input{flex:none;margin:3px 0 0}
.inline-form{display:inline-block;margin:0 8px 0 0}
.banner{margin:0 0 16px;padding:12px 16px;border-radius:12px;border:1px solid #f0d99a;background:var(--warn-bg);color:#5c3d00}
.banner.info{border-color:#b9cff0;background:var(--info-bg);color:#163d70}
.banner a{font-weight:800}
.jump{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 16px}
@media(max-width:900px){table.stack td .badge{white-space:normal;text-align:left}}
.sec-note{margin:8px 0 0;color:var(--muted);font-size:13.5px}

/* ---------- Today ---------- */
.today-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;align-items:start}
.today-grid .card{margin:0}
.item-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;padding:10px 0;border-bottom:1px solid var(--border)}
.item-row:last-child{border-bottom:0}
.item-main{min-width:0;flex:1 1 200px;overflow-wrap:anywhere}
.item-main a{font-weight:800}
.item-row form{margin:0}
.item-row button{min-height:40px;padding:6px 16px;font-size:14px}
.late{color:var(--err);font-weight:800}

@media(max-width:640px){
  .board{grid-auto-columns:minmax(240px,86%)}
  .view-switch .hint{margin-left:0;flex-basis:100%}
}
`;
