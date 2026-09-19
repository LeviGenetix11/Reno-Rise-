// Small helpers for the page generators.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function write(rel, html) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html.split('\r\n').join('\n'));
  console.log('wrote', rel);
}

const notice = (html, strong = false) =>
  `<div class="notice${strong ? ' notice-strong' : ''}" role="note">${L.ICON.info}<div>${html}</div></div>`;

const checkList = (items) =>
  `<ul class="check-list">\n${items.map((t) => `      <li>${L.ICON.check} ${t}</li>`).join('\n')}\n    </ul>`;

const faqItems = (qas) => qas.map(([q, a]) => `    <div class="faq-item">\n      <h3>${q}</h3>\n      <p>${a}</p>\n    </div>`).join('\n');

const internalLinks = (depth, links) =>
  `<div class="internal-links">\n${links.map(([label, target]) => `      <a href="${L.href(depth, target)}">${label}</a>`).join('\n')}\n    </div>`;

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/\s+/g, ' ').trim();

module.exports = { ROOT, write, notice, checkList, faqItems, internalLinks, strip };

/** Sticky sidebar used by long-form guide pages. */
function guideAside(depth, { cta = 'Send your basement details and Reno Rise will review them.', links = [], heading = 'Planning a basement project?' } = {}) {
  const li = links.map(([label, t]) => `        <li><a href="${L.href(depth, t)}">${label}</a></li>`).join('\n');
  return `<aside class="guide-aside" aria-label="Quick links">
    <div class="aside-card">
      <h3>${heading}</h3>
      <p>${cta}</p>
      <a href="#assessment-form" class="btn btn-primary">Request a Basement Assessment</a>
    </div>
    ${links.length ? `<div class="aside-card">
      <h3>Related guides</h3>
      <ul>
${li}
      </ul>
    </div>` : ''}
  </aside>`;
}

const formBand = (depth, { type, title = 'Request a Basement Assessment', text }) => `<section class="assess-band guide-form-wrap" id="assessment-form" aria-labelledby="assess-title">
      <h2 id="assess-title">${title}</h2>
      <p>${text || 'Share a few details about your basement and your plans. Reno Rise reviews what you send and, where there is a suitable fit, may connect you with an independent professional. This does not confirm an appointment, a quote, an approval or a match.'}</p>
      <div data-assessment-form-mount data-source="assessment" data-project-type="${type}" data-thank-you-href="${L.href(depth, 'assessment/thank-you.html')}"></div>
    </section>`;

module.exports.guideAside = guideAside;
module.exports.formBand = formBand;
