// Generates the homepage: /index.html
//
// Section order (kept on purpose):
//   1 Hero  2 How Reno Rise Works  3 Basement Services  4 Legal Secondary Suite Planning  5 Toronto Basement Guides
//   6 Why Homeowners Use Reno Rise  7 Frequently Asked Questions  8 Final project-enquiry form
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
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  choice: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  scale: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
};

const card = ({ icon, title, text, href, primary = false, cta = 'Learn more' }) => `      <article class="topic-card${primary ? ' primary' : ''}">
        ${ico(ICONS[icon])}
        <h3><a href="${h(href)}">${title}</a></h3>
        <p>${text}</p>
        <a href="${h(href)}" class="more" aria-label="${cta}: ${title}">${cta} ${L.ICON.arrow}</a>
      </article>`;

const plainCard = ({ icon, title, text }) => `      <article class="topic-card plain">
        ${ico(ICONS[icon])}
        <h3>${title}</h3>
        <p>${text}</p>
      </article>`;

// ---------------------------------------------------------------- 1. hero
const hero = `<!-- ========== HERO ========== -->
<section class="hero hero-basement hero-has-video">
  <video class="hero-video" data-hero-video data-src="${h('videos/hero-interior.mp4')}" poster="${h('videos/hero-poster.jpg')}" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>
  <button type="button" class="hero-video-toggle" data-hero-video-toggle hidden>Pause background video</button>
  <div class="container hero-split">
    <div class="hero-copy">
      <span class="eyebrow on-dark">Toronto basement renovations &amp; secondary suites</span>
      <h1>Basement Renovations &amp; Legal Secondary Suites in Toronto</h1>
      <p>Whether you&rsquo;re finishing your basement, creating more living space or exploring a legal secondary suite, Reno Rise helps you understand the project and connect with independent local renovation professionals.</p>
      <div class="hero-actions">
        <a href="#assessment-form" class="btn btn-primary">Tell Us About Your Project ${L.ICON.arrow}</a>
        <a href="${h('services/legal-basement-apartment-toronto/')}" class="btn btn-outline">Explore Legal Suite Requirements</a>
      </div>
    </div>
    ${L.diagramCard({ id: 'dgh', caption: false })}
  </div>
</section>
`;

// ---------------------------------------------------------------- 6. why homeowners use Reno Rise (supportable benefits only)
const WHY = [
  { icon: 'book', title: 'Plan before you commit', text: 'Guides on permits, costs, underpinning and legal secondary suites explain what a project involves before you speak to anyone.' },
  { icon: 'send', title: 'Describe your project once', text: 'Share your goals, basement and timeline in one enquiry. Reno Rise matches your project with the contractor best suited to the work.' },
  { icon: 'choice', title: 'We do the choosing', text: 'Reno Rise reviews your project and selects the contractor best suited to it, so you do not have to search on your own.' },
  { icon: 'scale', title: 'A clear line of responsibility', text: 'Reno Rise is not a contractor. Estimates, contracts, warranties and permit responsibilities belong to the contractor doing the work, so confirm them before you sign.' },
  { icon: 'pin', title: 'Focused on Toronto basements', text: 'The guides and requirements are written for Toronto homes and basement projects, and enquiries from across the Greater Toronto Area are welcome.' },
  { icon: 'info', title: 'Honest about limits', text: 'Reno Rise cannot say whether a specific basement is legal or eligible for a permit. It points you to Toronto Building and the professionals responsible for the work.' },
];

// ---------------------------------------------------------------- 7. FAQ
const FAQ = [
  ['Is Reno Rise a contractor?', 'No. Reno Rise is an independent project-enquiry and contractor-matching service. It does not perform construction, inspections or permit applications. Estimates, contracts, warranties and the work itself come from the independent contractor Reno Rise matches you with.'],
  ['How does Reno Rise choose the contractor?', 'Reno Rise reviews the details you send about your project, then matches it with the contractor best suited to the work. That contractor provides the estimate, the contract and the warranty for the job. Reno Rise itself does not perform construction, inspections or permit applications.'],
  ['What is the difference between a finished basement and a legal secondary suite?', 'A finished basement is extra living space for your own household. A legal secondary suite is a separate, self-contained home that must meet zoning, Building Code and Fire Code requirements and is created with a building permit. The <a href="' + h('blog/finished-basement-vs-legal-secondary-suite.html') + '">comparison guide</a> explains the differences.'],
  ['Do I need a permit for basement work in Toronto?', 'It depends on the work. Structural, plumbing, heating or layout changes usually involve a permit, while some cosmetic work does not. Confirm with Toronto Building and the professional doing the work. The <a href="' + h('blog/basement-renovation-permits-toronto.html') + '">permit guide</a> covers the basics.'],
  ['Can Reno Rise tell me whether my basement can be a legal suite?', 'No. Whether a particular basement qualifies depends on the property, zoning and current rules. Reno Rise can help you understand what is usually checked, but the decision rests with Toronto Building and the professionals responsible for your project.'],
  ['Which areas do you cover, and what about other projects?', 'Reno Rise focuses on Toronto homes, and enquiries from elsewhere in the Greater Toronto Area are welcome. See the <a href="' + h('locations/') + '">service areas</a>. Reno Rise concentrates on basements, but information pages on <a href="' + h('services/#other-home-improvement-services') + '">other home improvement services</a> are available.'],
];

const main = `
<!-- ========== 2. HOW RENO RISE WORKS ========== -->
<section class="section-tight section-cream" id="how-it-works">
  <div class="container">
    ${L.howItWorks({ heading: 'How Reno Rise Works', intro: L.POSITIONING })}
  </div>
</section>

<!-- ========== 3. BASEMENT SERVICES ========== -->
<section class="section" id="basement-projects">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Basement services</span>
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
    <p class="section-more"><a href="${h('services/#basement-renovations-secondary-suites')}" class="btn btn-dark">View all basement services ${L.ICON.arrow}</a></p>
    <div class="other-resources" id="other-resources">
      <h3>Other home improvement resources</h3>
      <p>Reno Rise is focused on basements, but these general guides are still available. They are information pages, and this work is carried out by independent professionals.</p>
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
    <div class="inspiration">
    ${U.stockGallery(depth, [
      ['finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows'],
      ['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa'],
      ['basement-family-room-fireplace', 'Basement family room with wood paneling and a fireplace'],
    ], { tag: '' })}
    </div>
  </div>
</section>

<!-- ========== 4. LEGAL SECONDARY SUITE PLANNING ========== -->
<section class="section-tight section-cream" id="suite-planning">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Legal secondary suite planning</span>
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
    ${U.notice('<p>Rules depend on the property and change over time. Confirm requirements with Toronto Building and the professionals responsible for your project. Reno Rise cannot say whether a specific basement is legal or eligible.</p>')}
  </div>
</section>

<!-- ========== 5. TORONTO BASEMENT GUIDES ========== -->
<section class="section" id="guides">
  <div class="container">
    <div class="section-head">
      <div>
        <span class="eyebrow">Toronto basement guides</span>
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

<!-- ========== 6. WHY HOMEOWNERS USE RENO RISE ========== -->
<section class="section-tight section-cream" id="why-reno-rise">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Why Reno Rise</span>
      <h2>Why Homeowners Use Reno Rise</h2>
      <p class="lede">Planning a basement project involves a lot of unknowns. Reno Rise helps you understand the project first, then matches you with the right contractor.</p>
    </div>
    <div class="topic-grid">
${WHY.map(plainCard).join('\n')}
    </div>
    <div class="why-areas">
      <h3>Toronto first, across the GTA</h3>
      <p>Reno Rise is focused on Toronto homes. Enquiries from elsewhere in the Greater Toronto Area are welcome too.</p>
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
  </div>
</section>

${L.customerQuotes(['kaylyn', 'reliance', 'marco', 'priya'], { cream: false })}
<!-- ========== 7. FREQUENTLY ASKED QUESTIONS ========== -->
<section class="section section-cream" id="faq">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack">
      <span class="eyebrow">Questions</span>
      <h2>Frequently Asked Questions</h2>
    </div>
${U.faqItems(FAQ)}
  </div>
</section>

<!-- ========== 8. FINAL PROJECT-ENQUIRY FORM ========== -->
<section class="section" id="assessment-form">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack" style="margin-bottom:28px;">
      <span class="eyebrow">Project enquiry</span>
      <h2>Tell Us About Your Project</h2>
      <p class="lede">Tell us about your basement and your goals. Reno Rise reviews the details and matches your project with the contractor best suited to the work.</p>
    </div>
    <div class="lead-form-wrap">
      <div data-assessment-form-mount data-source="homepage" data-thank-you-href="${h('assessment/thank-you.html')}"></div>
    </div>
  </div>
</section>
`;

const title = 'Basement Renovations & Legal Secondary Suites in Toronto | Reno Rise';
const description = 'Plan a finished basement or legal secondary suite in Toronto. Reno Rise helps homeowners understand requirements and connect with independent local renovation professionals.';

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
  ldGraph: [PG.faqNode(FAQ.map(([q, a]) => [q, U.strip(a)]))],
  noCta: true,
  script: `<script src="js/assessment-form.js"></script>\n`,
});

U.write('index.html', html);
