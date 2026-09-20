// Transform for the secondary (non-basement) service pages: removes in-article testimonials, converts
// first-person "we do the work" copy, and adds a visible scope note.
'use strict';
const L = require('./lib');
const { SERVICE_SENTENCE_OVERRIDES, SERVICE_BULLETS, SERVICE_FIRST_PERSON } = require('./claims');

/** Removes the <div> that starts at the first match of startRe (balanced div counting). */
function removeElement(h, startRe) {
  const m = startRe.exec(h);
  if (!m) return h;
  const i = m.index;
  let depth = 0;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = i;
  let t;
  while ((t = tag.exec(h))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return h.slice(0, i).replace(/\s+$/, '\n') + h.slice(tag.lastIndex);
  }
  return h;
}

function scopeNote(root, hasFigures) {
  const figures = hasFigures
    ? ' Dollar figures and timelines on this page are illustrative planning ranges from general industry information; they are not quotes, may be out of date, and have not been independently verified by Reno Rise.'
    : '';
  return `<div class="notice" role="note" data-scope-note>${L.ICON.info}<div><p><strong>General information.</strong> Reno Rise focuses on <a href="${root}services/basement-renovation/">basement renovations</a> and <a href="${root}services/legal-basement-apartment-toronto/">legal secondary suites</a>. This page describes work that independent professionals carry out; Reno Rise does not perform it.${figures}</p></div></div>`;
}

// Pages where an owner-supplied customer comment is topical. Elsewhere the old (generic) testimonial stays removed.
const TOPICAL_QUOTES = { 'services/kitchen-remodeling/': 'priya' };

// The four general flooring pages stay under "Other home improvement services". Each gets one contextual pointer to the single
// basement-flooring page, worded differently, so basement-specific intent lands on the right page and the two do not compete.
function basementFlooringNote(root, urlPath) {
  const svc = root + 'services/basement-flooring/';
  const notes = {
    'services/flooring/': `Flooring a basement? Floors over a concrete slab have their own moisture and subfloor considerations. See <a href="${svc}">basement flooring options for Toronto homes</a>.`,
    'services/flooring-installation/': `Installing over a concrete basement slab is a different job from a main-floor install. <a href="${svc}">Subfloor and moisture planning for basements</a> is covered on its own page.`,
    'services/flooring-contractor/': `Hiring for a basement floor? Some of the questions change. See <a href="${svc}">what to ask a flooring professional about a basement</a>.`,
    'services/hardwood-floor-installation/': `Thinking about hardwood below grade? Solid and engineered wood are treated differently: read <a href="${root}blog/hardwood-flooring-in-basement.html">Can You Install Hardwood Flooring in a Basement?</a> and the <a href="${svc}">basement flooring page</a>.`,
  };
  return notes[urlPath] ? `<p data-basement-flooring-link>${notes[urlPath]}</p>` : '';
}

function transformSecondaryService(h, depth, urlPath) {
  h = removeElement(h, /<div class="testimonial-grid"[^>]*>/);
  if (TOPICAL_QUOTES[urlPath] && !h.includes('data-customer-comments-inline')) {
    const fig = L.quoteFigure(TOPICAL_QUOTES[urlPath]);
    h = h.replace(/(<h2 id="faq">)/, (m) => `<div class="quote-grid single" data-customer-comments-inline style="margin:8px 0 32px;">${fig}</div>\n    ${m}`);
  }
  const start = h.indexOf('<main');
  const end = h.indexOf('<!-- ========== CTA BAND');
  if (start < 0 || end < 0) return h;
  let region = h.slice(start, end);
  const hasFigures = /class="(?:cost-table|tier-grid)"|\$\d{1,3},?\d{3}/.test(region);
  for (const [re, rep] of SERVICE_SENTENCE_OVERRIDES) region = region.replace(re, rep);
  for (const [re, rep] of SERVICE_BULLETS) region = region.replace(re, rep);
  for (const [re, rep] of SERVICE_FIRST_PERSON) region = region.replace(re, rep);
  if (!region.includes('data-scope-note')) {
    const note = scopeNote(L.up(depth), hasFigures);
    region = region.replace(/(<(?:div|article) class="(?:container )?article-wrap">)/, (m) => m + '\n    ' + note);
  }
  const bf = basementFlooringNote(L.up(depth), urlPath);
  if (bf && !region.includes('data-basement-flooring-link')) region = region.replace('<div class="internal-links"', () => bf + '\n    <div class="internal-links"');
  return h.slice(0, start) + region + h.slice(end);
}

module.exports = { transformSecondaryService, removeElement };
