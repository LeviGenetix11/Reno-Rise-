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
  `<ul class="check-list">\n${items.map((t) => `      <li>${L.ICON.check} <span>${t}</span></li>`).join('\n')}\n    </ul>`;

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
      <p>${text || 'Share a few details about your basement and your plans. Reno Rise reviews what you send and matches your project with the contractor best suited to the work. This does not confirm an appointment, a quote or an approval.'}</p>
      <div data-assessment-form-mount data-source="assessment" data-project-type="${type}" data-thank-you-href="${L.href(depth, 'assessment/thank-you.html')}"></div>
    </section>`;

module.exports.guideAside = guideAside;
module.exports.formBand = formBand;

/** Clearly labelled stock-photo gallery. Never presented as Reno Rise project work. */
function stockGallery(depth, items, { heading = 'Basement Inspiration', note, tag = 'Inspiration &middot; Stock photography' } = {}) {
  const figs = items
    .map(([file, alt, credit]) => `      <figure class="stock-figure">
        <img src="${L.up(depth)}images/stock/${file}-700w.webp" width="700" height="467" loading="lazy" alt="${alt}">
${credit ? `        <figcaption>${credit}</figcaption>\n` : ''}      </figure>`)
    .join('\n');
  return `<div class="stock-block">
${tag ? `    <span class="stock-tag">${tag}</span>\n` : ''}    <h2>${heading}</h2>
    <p>${note || 'Ideas for how a finished basement can look and feel. These are stock photos from Pexels, shown for inspiration only. They are not Reno Rise projects, and Reno Rise does not perform renovation work.'}</p>
    <div class="stock-gallery">
${figs}
    </div>
  </div>`;
}
module.exports.stockGallery = stockGallery;
