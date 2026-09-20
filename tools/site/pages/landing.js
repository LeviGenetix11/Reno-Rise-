// Homepage-style keyword landing pages, one per row of reno-rise-service-keyword-map.xlsx (Page Map).
// Data lives in landing-data.js. Layout mirrors the homepage: split hero, "How Reno Rise Works", topic cards,
// customer comments, reference photos, FAQ, assessment form, related links.
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const { LANDINGS } = require('./landing-data');

const depth = 2;
const h = (t) => L.href(depth, t);
const ico = (d) => `<span class="icon-circle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  suite: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/>',
  foundation: '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>',
  plan: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
  check: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
};

const card = ([icon, title, text]) => `      <article class="topic-card">
        ${ico(ICONS[icon] || ICONS.check)}
        <h3>${title}</h3>
        <p>${text}</p>
      </article>`;

const list = (items) => `<ul class="check-list">\n${items.map((t) => `      <li>${L.ICON.check} <span>${t}</span></li>`).join('\n')}\n    </ul>`;

function build(d) {
  const path = `services/${d.slug}/`;
  const visual = d.photo
    ? L.photoCard({ file: d.photo[0], alt: d.photo[1], credit: d.photo[2] })
    : L.diagramCard({ id: 'dgl' });
  const hero = L.splitHero(depth, {
    crumbs: [['Home', ''], ['Services', 'services/'], [d.crumb, '']],
    eyebrow: d.eyebrow,
    h1: d.h1,
    sub: d.sub,
    primary: ['Request a Basement Assessment', '#assessment-form'],
    secondary: d.secondary ? [d.secondary[0], h(d.secondary[1])] : ['Explore Legal Suite Requirements', h('services/legal-basement-apartment-toronto/')],
    visual,
  });

  const sections = (d.sections || []).map((s) => `<section class="section-tight${s.cream ? ' section-cream' : ''}">
  <div class="container" style="max-width:860px;">
    <h2 style="font-size:32px; margin-bottom:16px;">${s.h2}</h2>
    ${s.html}
  </div>
</section>`).join('\n\n');

  const areas = d.areas && d.areas.length
    ? `<section class="section-tight">
  <div class="container">
    <div class="section-head left-stack" style="margin-bottom:24px;">
      <span class="eyebrow">Where</span>
      <h2>${d.areasHeading || 'Toronto First, Across the GTA'}</h2>
      <p class="lede">${d.areasText || 'Reno Rise is focused on Toronto homes. Enquiries from elsewhere in the Greater Toronto Area are welcome too.'}</p>
    </div>
    <div class="chip-row">
${d.areas.map(([label, target], i) => `      <a class="city-chip${i === 0 ? ' main' : ''}" href="${h(target)}">${label}</a>`).join('\n')}
    </div>
  </div>
</section>` : '';

  const main = `
<!-- ========== HOW IT WORKS ========== -->
<section class="section-tight section-cream">
  <div class="container">
    ${L.howItWorks({ heading: 'How Reno Rise Works', intro: L.POSITIONING })}
  </div>
</section>

<!-- ========== WHAT IT INVOLVES ========== -->
<section class="section" id="overview">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">${d.involvesEyebrow || 'What to expect'}</span>
      <h2>${d.involvesHeading}</h2>
      <p class="lede">${d.involvesLede}</p>
    </div>
    <div class="topic-grid">
${d.cards.map(card).join('\n')}
    </div>
  </div>
</section>

${sections}

<!-- ========== PERMITS + QUESTIONS ========== -->
<section class="section-tight section-cream">
  <div class="container">
    <div class="two-col">
      <div class="panel accent">
        <h3>${d.permitHeading || 'Permits and approvals'}</h3>
        <p>${d.permit}</p>
      </div>
      <div class="panel">
        <h3>Questions to ask a professional</h3>
        ${list(d.ask)}
      </div>
    </div>
    <p style="margin-top:22px; color:var(--muted); max-width:860px;">${d.notFit}</p>
  </div>
</section>

${areas}

${d.quotes && d.quotes.length ? L.customerQuotes(d.quotes, { cream: false }) : ''}

<!-- ========== PHOTOS FOR REFERENCE ========== -->
${d.photos && d.photos.length ? `<section class="section-tight${d.quotes && d.quotes.length ? ' section-cream' : ''}">
  <div class="container">
    ${U.stockGallery(depth, d.photos, { heading: 'Photos for Reference', note: d.photoNote })}
  </div>
</section>` : ''}

<!-- ========== FAQ ========== -->
<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <h2 id="faq" style="font-size:32px; margin-bottom:18px;">Frequently asked questions</h2>
${U.faqItems(d.faq)}
    <p class="updated-line" style="margin-top:24px;">Last reviewed September 2026. General planning information; confirm requirements for your property with Toronto Building and qualified professionals.</p>
  </div>
</section>

<!-- ========== FORM ========== -->
<section class="section section-cream" id="assessment-form">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack" style="margin-bottom:28px;">
      <span class="eyebrow">Basement assessment</span>
      <h2>Request a Basement Assessment</h2>
      <p class="lede">${d.formLede || 'Tell us about your basement and your goals. Reno Rise reviews the details and, where there is a suitable fit, may connect you with an independent professional.'}</p>
    </div>
    <div class="lead-form-wrap">
      <div data-assessment-form-mount data-source="assessment" data-project-type="${d.formType}" data-thank-you-href="${h('assessment/thank-you.html')}"></div>
    </div>
  </div>
</section>

<!-- ========== RELATED ========== -->
<section class="section-tight">
  <div class="container">
    <div class="section-head left-stack" style="margin-bottom:20px;">
      <span class="eyebrow">Related</span>
      <h2>Related Basement Resources</h2>
    </div>
    ${U.internalLinks(depth, d.related)}
  </div>
</section>
`;

  const ld = [PG.faqNode(d.faq.map(([q, a]) => [q, U.strip(a)]))];
  const html = PG.renderPage({
    depth,
    path,
    title: `${d.metaTitle} | Reno Rise`,
    description: d.description,
    ogImage: `${L.SITE}/images/og/reno-rise-default.png`,
    ldGraph: ld,
    solid: false,
    active: '',
    hero,
    main,
    ctaOpts: { heading: d.ctaHeading },
    script: `<script src="${L.up(depth)}js/assessment-form.js"></script>\n`,
  });
  U.write(path + 'index.html', html);
  return { slug: d.slug, title: `${d.metaTitle} | Reno Rise`, desc: d.description.length };
}

const report = LANDINGS.map(build);
for (const r of report) {
  const warn = [];
  if (r.title.length < 50 || r.title.length > 62) warn.push(`title ${r.title.length}`);
  if (r.desc < 145 || r.desc > 165) warn.push(`description ${r.desc}`);
  if (warn.length) console.log(`  note: ${r.slug}: ${warn.join(', ')}`);
}
