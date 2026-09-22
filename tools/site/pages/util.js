// Small helpers for the page generators.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function write(rel, html) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = html.split('\r\n').join('\n');
  // OneDrive (this repo lives in an OneDrive-synced folder) sometimes holds a file locked
  // for a moment while it syncs; retry a few times before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      fs.writeFileSync(file, body);
      break;
    } catch (err) {
      if (attempt >= 5 || err.code !== 'UNKNOWN') throw err;
      const until = Date.now() + 200 * attempt;
      while (Date.now() < until) { /* brief busy-wait: no async in these sync build scripts */ }
    }
  }
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

/** Table of contents for a long-form guide (1500+ words). Matches the pattern already used on the basement-flooring service page. */
function toc(items) {
  const li = items.map(([id, label]) => `        <li><a href="#${id}">${label}</a></li>`).join('\n');
  return `<nav class="toc" aria-label="On this page">
      <div class="toc-title">On This Page</div>
      <ol>
${li}
      </ol>
    </nav>`;
}
module.exports.toc = toc;

/** Back-to-top control for a long-form guide. Visibility/behaviour is wired sitewide in js/script.js. */
const backToTop = () => `<a href="#main-content" class="back-to-top" aria-label="Back to top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></a>`;
module.exports.backToTop = backToTop;

/** Stock photo placed above an H2, credited and labelled illustrative like every other stock image on the site. */
function sectionImage(depth, { file, alt, credit }) {
  return `<figure class="post-hero post-section-img">
      <img src="${L.up(depth)}images/stock/${file}.webp" width="1200" height="800" loading="lazy" alt="${alt}">
      <figcaption>${credit}. Stock photo, illustrative only. It is not a Reno Rise project.</figcaption>
    </figure>`;
}
module.exports.sectionImage = sectionImage;
