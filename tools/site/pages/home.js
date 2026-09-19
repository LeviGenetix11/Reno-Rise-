// Generates the homepage: /index.html
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');

const depth = 0;
const h = (t) => L.href(depth, t);
const ico = (d) => `<span class="icon-circle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  suite: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/>',
  foundation: '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>',
  plan: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
};

const card = ({ icon, title, text, href, primary = false, cta = 'Learn more' }) => `      <article class="topic-card${primary ? ' primary' : ''}">
        ${ico(ICONS[icon])}
        <h3><a href="${h(href)}">${title}</a></h3>
        <p>${text}</p>
        <a href="${h(href)}" class="more" aria-label="${cta}: ${title}">${cta} ${L.ICON.arrow}</a>
      </article>`;

const hero = `<!-- ========== HERO ========== -->
<section class="hero hero-basement">
  <div class="container hero-split">
    <div class="hero-copy">
      <span class="eyebrow on-dark">Toronto basement renovations &amp; secondary suites</span>
      <h1>Basement Renovations &amp; Legal Secondary Suites in Toronto</h1>
      <p>Plan a finished basement, family living space, or code-compliant secondary suite&mdash;and connect with qualified Toronto professionals for your project.</p>
      <div class="hero-actions">
        <a href="${h('assessment/')}" class="btn btn-primary">Request a Basement Assessment ${L.ICON.arrow}</a>
        <a href="${h('services/legal-basement-apartment-toronto/')}" class="btn btn-outline">Explore Legal Suite Requirements</a>
      </div>
      <p class="hero-note">Reno Rise is an independent enquiry and matching service, not a contractor. You choose who to hire.</p>
    </div>
    ${L.diagramCard({ id: 'dgh' })}
  </div>
</section>
`;

const main = `
<!-- ========== HOW IT WORKS / TRUST STATEMENT ========== -->
<section class="section-tight section-cream">
  <div class="container">
    ${L.howItWorks({ heading: 'How Reno Rise Works', intro: L.POSITIONING })}
  </div>
</section>

<!-- ========== BASEMENT FOCUS ========== -->
<section class="section" id="basement-projects">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Basement projects</span>
      <h2>What Would You Like to Do With Your Basement?</h2>
      <p class="lede">Start with the goal. Each guide explains what the project involves, what to ask, and what to confirm before you hire.</p>
    </div>
    <div class="topic-grid">
${card({ icon: 'home', title: 'Basement Renovations', text: 'A family room, guest room, office or gym. Plan the scope, the order of work and the questions to ask.', href: 'services/basement-renovation/', primary: true, cta: 'Plan a renovation' })}
${card({ icon: 'suite', title: 'Legal Secondary Suites', text: 'What makes a basement apartment legal, how it differs from a finished basement, and what to confirm with Toronto Building.', href: 'services/legal-basement-apartment-toronto/', primary: true, cta: 'Read the suite guide' })}
${card({ icon: 'foundation', title: 'Basement Underpinning', text: 'Lowering a floor to gain ceiling height is structural work. Learn when it comes up and how it is approached.', href: 'services/underpinning/' })}
${card({ icon: 'water', title: 'Waterproofing &amp; Moisture Control', text: 'Diagnose the cause of damp or leaks before finishing. Interior, exterior and drainage options explained.', href: 'services/interior-waterproofing/' })}
${card({ icon: 'window', title: 'Egress Windows &amp; Separate Entrances', text: 'Safe exits, natural light and a private entrance are central to a suite. See what is involved.', href: 'services/egress-windows/' })}
${card({ icon: 'plan', title: 'Permit &amp; Design Planning', text: 'Which basement work needs a permit in Toronto, and how drawings, engineers and inspections fit in.', href: 'blog/basement-renovation-permits-toronto.html' })}
    </div>
  </div>
</section>

<!-- ========== FINISHED BASEMENT vs SUITE ========== -->
<section class="section-tight section-cream">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Know the difference</span>
      <h2>Finished Basement or Legal Secondary Suite?</h2>
      <p class="lede">They can look alike, but they are different projects with different rules. Deciding which one you want shapes the budget, the drawings and the permit path.</p>
    </div>
    <div class="two-col">
      <div class="panel">
        <h3>Finished basement</h3>
        <p>Extra living space for your own household. Permit needs depend on the work involved: structural, plumbing or heating changes usually call for one.</p>
        <a class="more" style="color:var(--orange-a11y);font-weight:700" href="${h('services/basement-finishing/')}">About basement finishing</a>
      </div>
      <div class="panel accent">
        <h3>Legal secondary suite</h3>
        <p>A separate, self-contained home with its own kitchen and bathroom that must meet zoning, Building Code and Fire Code requirements, and is created with a building permit.</p>
        <a class="more" style="color:var(--orange-a11y);font-weight:700" href="${h('blog/finished-basement-vs-legal-secondary-suite.html')}">Compare the two</a>
      </div>
    </div>
    ${U.notice('<p>Rules depend on the property and change over time. Confirm requirements with Toronto Building and a qualified designer or contractor. Reno Rise cannot say whether a specific basement is legal or eligible.</p>')}
  </div>
</section>

<!-- ========== PLANNING CENTRE ========== -->
<section class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <span class="eyebrow">Basement Planning Centre</span>
        <h2>Cost, Permit &amp; Planning Guides</h2>
      </div>
      <a href="${h('blog/')}" class="btn btn-dark">All planning guides ${L.ICON.arrow}</a>
    </div>
    <div class="topic-grid">
${card({ icon: 'plan', title: 'Basement Renovation Permits in Toronto', text: 'What Toronto Building says needs a permit, and what usually does not.', href: 'blog/basement-renovation-permits-toronto.html', cta: 'Read the guide' })}
${card({ icon: 'home', title: 'Basement Renovation Cost in Toronto', text: 'What moves the price, how to compare quotes, and what to ask before you sign.', href: 'blog/basement-renovation-cost-toronto.html', cta: 'Read the guide' })}
${card({ icon: 'foundation', title: 'Underpinning: When It Is Needed', text: 'Ceiling height, structure and cost drivers explained in plain language.', href: 'blog/basement-underpinning-cost-and-when-needed.html', cta: 'Read the guide' })}
    </div>
  </div>
</section>

<!-- ========== INSPIRATION (STOCK) ========== -->
<section class="section-tight">
  <div class="container">
    ${U.stockGallery(depth, [
      ['finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels'],
      ['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels'],
      ['basement-family-room-fireplace', 'Basement family room with wood paneling and a fireplace', 'Photo: Peter Vang on Pexels'],
    ])}
  </div>
</section>

<!-- ========== FORM ========== -->
<section class="section section-cream" id="assessment-form">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack" style="margin-bottom:28px;">
      <span class="eyebrow">Basement assessment</span>
      <h2>Request a Basement Assessment</h2>
      <p class="lede">Tell us about your basement and your goals. Reno Rise reviews the details and, where there is a suitable fit, may connect you with an independent professional.</p>
    </div>
    <div class="lead-form-wrap">
      <div data-assessment-form-mount data-source="homepage" data-thank-you-href="${h('assessment/thank-you.html')}"></div>
    </div>
  </div>
</section>

<!-- ========== AREAS ========== -->
<section class="section-tight">
  <div class="container">
    <div class="section-head left-stack" style="margin-bottom:24px;">
      <span class="eyebrow">Where</span>
      <h2>Toronto First, Across the GTA</h2>
      <p class="lede">Reno Rise is focused on Toronto homes. Enquiries from elsewhere in the Greater Toronto Area are welcome too.</p>
    </div>
    <div class="chip-row">
      <a class="city-chip main" href="${h('locations/toronto.html')}">Toronto</a>
      <a class="city-chip" href="${h('locations/scarborough.html')}">Scarborough</a>
      <a class="city-chip" href="${h('locations/etobicoke.html')}">Etobicoke</a>
      <a class="city-chip" href="${h('locations/north-york.html')}">North York</a>
      <a class="city-chip" href="${h('locations/east-york.html')}">East York</a>
      <a class="city-chip" href="${h('locations/downtown-toronto.html')}">Downtown Toronto</a>
      <a class="city-chip" href="${h('locations/midtown-toronto.html')}">Midtown Toronto</a>
      <a class="city-chip" href="${h('locations/')}">All areas served</a>
    </div>
  </div>
</section>

<!-- ========== OTHER HOME IMPROVEMENT RESOURCES ========== -->
<section class="section-tight section-cream" id="other-resources">
  <div class="container">
    <div class="section-head left-stack" style="margin-bottom:24px;">
      <span class="eyebrow">Also helpful</span>
      <h2>Other Home Improvement Resources</h2>
      <p class="lede">Reno Rise is focused on basements, but these general guides are still available. They are information pages, and this work is carried out by independent professionals.</p>
    </div>
    <div class="chip-row">
      <a class="city-chip" href="${h('services/kitchen-remodeling/')}">Kitchens</a>
      <a class="city-chip" href="${h('services/bathroom-renovation/')}">Bathrooms</a>
      <a class="city-chip" href="${h('services/flooring/')}">Flooring</a>
      <a class="city-chip" href="${h('services/roofing-siding/')}">Siding &amp; Roofing</a>
      <a class="city-chip" href="${h('services/door-installation/')}">Doors</a>
      <a class="city-chip" href="${h('services/window-installation/')}">Windows</a>
      <a class="city-chip" href="${h('services/deck-builder/')}">Decks &amp; Outdoor</a>
      <a class="city-chip" href="${h('services/home-additions/')}">Home Additions</a>
      <a class="city-chip main" href="${h('services/#other-home-improvement-services')}">All other services</a>
    </div>
  </div>
</section>
`;

const title = 'Basement Renovations & Legal Secondary Suites in Toronto | Reno Rise';
const description = 'Plan a finished basement or legal secondary suite in Toronto. Reno Rise helps homeowners understand requirements and connect with qualified local professionals.';

const html = PG.renderPage({
  depth,
  path: '',
  title,
  description,
  ogImage: `${L.SITE}/images/og/reno-rise-default.png`,
  active: 'home',
  solid: false,
  hero,
  main,
  ctaOpts: { heading: 'Planning a Basement Renovation or Legal Secondary Suite?' },
  script: `<script src="js/assessment-form.js"></script>\n`,
});

U.write('index.html', html);
