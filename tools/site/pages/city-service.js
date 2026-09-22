// Generates city+service landing pages for GTA municipalities outside Toronto (plus Etobicoke and North
// York, which are Toronto districts with their own /locations/ page and their own geography note).
// Deliberately built like the homepage (same section order, same shared components: L.howItWorks, the
// service cards, the guide cards, the WHY cards, the customer quotes) so the page is recognizably "Reno
// Rise", not a one-off template. What is NOT copied from the homepage is the content in each section: the
// hero, the local-requirements section and two of the FAQ questions are unique per page, built from real
// facts sourced from that municipality's own published page (see locations-facts.js; the same source used
// for the /locations/ pages). Pages without a verified source (Ajax) stay general and do not cite a by-law
// or process that was never confirmed.
//
// Source list: LANDING-PAGE-PRIORITY-LIST.csv, rows with page_type "new service+city page", basement-only
// (see the owner's scoping decision 2026-09-22). Six rows in that list are already built elsewhere
// (basement-renovation-ajax/oakville/pickering/richmond-hill/toronto/vaughan, in cities.js) and are not
// touched here.
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const { REVIEWED, MUNICIPAL, TORONTO, TORONTO_GEO } = require('./locations-facts');

const depth = 2;
const h = (t) => L.href(depth, t);
const ico = (d) => `<span class="icon-circle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
const X = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

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

const SERVICE_CARDS = `${card({ icon: 'home', title: 'Basement Renovations', text: 'A family room, guest room, office or gym. Plan the scope, the order of work and the questions to ask.', href: 'services/basement-renovation/', cta: 'Plan a renovation' })}
${card({ icon: 'suite', title: 'Legal Secondary Suites', text: 'What makes a basement apartment legal, how it differs from a finished basement, and what to confirm with your municipality.', href: 'services/legal-basement-apartment-toronto/', cta: 'Read the suite guide' })}
${card({ icon: 'foundation', title: 'Basement Underpinning', text: 'Lowering a floor to gain ceiling height is structural work. Learn when it comes up and how it is approached.', href: 'services/underpinning/', cta: 'Explore underpinning' })}
${card({ icon: 'water', title: 'Waterproofing &amp; Moisture Control', text: 'Diagnose the cause of damp or leaks before finishing. Interior, exterior and drainage options explained.', href: 'services/interior-waterproofing/', cta: 'Explore waterproofing' })}
${card({ icon: 'window', title: 'Egress Windows &amp; Separate Entrances', text: 'Safe exits, natural light and a private entrance are central to a suite. See what is involved.', href: 'services/egress-windows/', cta: 'Explore egress windows' })}
${card({ icon: 'plan', title: 'Permit &amp; Design Planning', text: 'Which basement work needs a permit, and how drawings, engineers and inspections fit in.', href: 'blog/basement-renovation-permits-toronto.html', cta: 'Explore permits &amp; design' })}`;

const GUIDE_CARDS = `${card({ icon: 'plan', title: 'Basement Renovation Permits in Toronto', text: 'What Toronto Building says needs a permit, and what usually does not. The general principles carry over to other GTA municipalities, though the rules themselves are set locally.', href: 'blog/basement-renovation-permits-toronto.html', cta: 'Read the guide' })}
${card({ icon: 'home', title: 'Basement Renovation Cost in Toronto', text: 'What moves the price, how to compare quotes, and what to ask before you sign.', href: 'blog/basement-renovation-cost-toronto.html', cta: 'Read the guide' })}
${card({ icon: 'foundation', title: 'Underpinning: When It Is Needed', text: 'Ceiling height, structure and cost drivers explained in plain language.', href: 'blog/basement-underpinning-cost-and-when-needed.html', cta: 'Read the guide' })}`;

const FAQ_BASE_1 = ['Is Reno Rise a contractor?', 'No. Reno Rise is an independent project-enquiry and contractor-matching service. It does not perform construction, inspections or permit applications. Estimates, contracts, warranties and the work itself come from the independent contractor Reno Rise matches you with.'];
const FAQ_BASE_2 = ['How does Reno Rise choose the contractor?', 'Reno Rise reviews the details you send about your project, then matches it with the contractor best suited to the work. That contractor provides the estimate, the contract and the warranty for the job.'];

/** page: { slug, city, region, service: 'renovation'|'waterproofing', keyword, h1, eyebrow, sub, secondaryHref,
 *   secondaryLabel, localHeading, localIntro, localFacts (array or null), localSource ({name,url}) or null,
 *   localClose, extraFaq [[q,a],[q,a]], metaTitle, description, formType, formSource } */
function buildPage(p) {
  const hero = L.splitHero(depth, {
    crumbs: [['Home', ''], ['Services', 'services/'], [p.crumb, '']],
    eyebrow: p.eyebrow,
    h1: p.h1,
    sub: p.sub,
    primary: ['Tell Us About Your Project', '#assessment-form'],
    secondary: [p.secondaryLabel, h(p.secondaryHref)],
    visual: L.diagramCard({ id: 'dg-' + p.slug, caption: false }),
    video: true,
  });

  const WHY = [
    { icon: 'book', title: 'Plan before you commit', text: 'Guides on permits, costs, underpinning and legal secondary suites explain what a project involves before you speak to anyone.' },
    { icon: 'send', title: 'Describe your project once', text: 'Share your goals, basement and timeline in one enquiry. Reno Rise matches your project with the contractor best suited to the work.' },
    { icon: 'choice', title: 'We do the choosing', text: 'Reno Rise reviews your project and selects the contractor best suited to it, so you do not have to search on your own.' },
    { icon: 'scale', title: 'A clear line of responsibility', text: 'Reno Rise is not a contractor. Estimates, contracts, warranties and permit responsibilities belong to the contractor doing the work, so confirm them before you sign.' },
    { icon: 'pin', title: `Serving ${p.city} and the GTA`, text: `Reno Rise is based in Toronto and welcomes enquiries from ${p.city} and across the Greater Toronto Area. Requirements are set locally, so confirm them with ${p.region === 'Toronto' ? 'Toronto Building' : `${p.city}&rsquo;s building department`}.` },
    { icon: 'info', title: 'Honest about limits', text: `Reno Rise cannot say whether a specific basement in ${p.city} is legal or eligible for a permit. It points you to the professionals and the municipal department responsible for that decision.` },
  ];

  const faq = [FAQ_BASE_1, FAQ_BASE_2, ...p.extraFaq, ['What is the difference between a finished basement and a legal secondary suite?', 'A finished basement is extra living space for your own household. A legal secondary suite is a separate, self-contained home that must meet zoning, Building Code and Fire Code requirements and is created with a building permit. The <a href="' + h('blog/finished-basement-vs-legal-secondary-suite.html') + '">comparison guide</a> explains the differences.']];

  const localFactsBlock = p.localFacts
    ? `${U.checkList(p.localFacts)}\n    ${p.localSource ? `<p style="font-size:13.5px;color:var(--muted);">Source: ${X(p.localSource.url, p.localSource.name)}, reviewed ${REVIEWED}. Requirements change, so confirm current terms before you apply.</p>` : ''}`
    : '';

  const main = `
<!-- ========== HOW RENO RISE WORKS ========== -->
<section class="section-tight section-cream" id="how-it-works">
  <div class="container">
    ${L.howItWorks({ heading: 'How Reno Rise Works', intro: L.POSITIONING })}
  </div>
</section>

<!-- ========== SERVICES ========== -->
<section class="section" id="basement-projects">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Basement services in ${p.city}</span>
      <h2>What Would You Like to Do With Your Basement?</h2>
      <p class="lede">Start with the goal. Each guide explains what the project involves, what to ask, and what to confirm before you hire.</p>
    </div>
    <div class="topic-grid">
${SERVICE_CARDS}
    </div>
    <p class="section-more"><a href="${h('services/#basement-renovations-secondary-suites')}" class="btn btn-dark">View all basement services ${L.ICON.arrow}</a></p>
  </div>
</section>

<!-- ========== LOCAL REQUIREMENTS ========== -->
<section class="section-tight section-cream" id="local-requirements">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">${p.city}, ${p.region}</span>
      <h2>${p.localHeading}</h2>
      <p class="lede">${p.localIntro}</p>
    </div>
    ${localFactsBlock}
    ${U.notice(`<p>${p.localClose}</p>`)}
  </div>
</section>

<!-- ========== GUIDES ========== -->
<section class="section" id="guides">
  <div class="container">
    <div class="section-head">
      <div>
        <span class="eyebrow">Planning guides</span>
        <h2>Cost, Permit &amp; Planning Guides</h2>
      </div>
      <a href="${h('blog/')}" class="btn btn-dark">All planning guides ${L.ICON.arrow}</a>
    </div>
    <div class="topic-grid">
${GUIDE_CARDS}
    </div>
  </div>
</section>

<!-- ========== WHY RENO RISE ========== -->
<section class="section-tight section-cream" id="why-reno-rise">
  <div class="container">
    <div class="section-head left-stack">
      <span class="eyebrow">Why Reno Rise</span>
      <h2>Why ${p.city} Homeowners Use Reno Rise</h2>
      <p class="lede">Planning a basement project involves a lot of unknowns. Reno Rise helps you understand the project first, then matches you with the right contractor.</p>
    </div>
    <div class="topic-grid">
${WHY.map(plainCard).join('\n')}
    </div>
  </div>
</section>

${L.customerQuotes(['kaylyn', 'reliance', 'marco', 'priya'], { cream: false })}

<!-- ========== FAQ ========== -->
<section class="section section-cream" id="faq">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack">
      <span class="eyebrow">Questions</span>
      <h2>Frequently Asked Questions</h2>
    </div>
${U.faqItems(faq)}
  </div>
</section>

<!-- ========== FORM ========== -->
<section class="section" id="assessment-form">
  <div class="container" style="max-width:860px;">
    <div class="section-head left-stack" style="margin-bottom:28px;">
      <span class="eyebrow">Project enquiry</span>
      <h2>Tell Us About Your ${p.city} Basement Project</h2>
      <p class="lede">Tell us about your basement and your goals. Reno Rise reviews the details and matches your project with the contractor best suited to the work.</p>
    </div>
    <div class="lead-form-wrap">
      <div data-assessment-form-mount data-source="${p.formSource}" data-project-type="${p.formType}" data-thank-you-href="${h('assessment/thank-you.html')}"></div>
    </div>
  </div>
</section>
`;

  const ld = [PG.faqNode(faq.map(([q, a]) => [q, U.strip(a)]))];
  const html = PG.renderPage({
    depth,
    path: `services/${p.slug}/`,
    title: `${p.metaTitle} | Reno Rise`,
    description: p.description,
    ogImage: `${L.SITE}/images/og/reno-rise-default.png`,
    ldGraph: ld,
    solid: false,
    active: '',
    hero,
    main,
    ctaOpts: { heading: `Planning a Basement Project in ${p.city}?` },
    script: `<script src="${L.up(depth)}js/assessment-form.js"></script>\n`,
  });
  U.write(`services/${p.slug}/index.html`, html);
}

const permitPara = (city, region) => `${city} sets its own zoning, registration and permit rules, and they are not the same as Toronto&rsquo;s. Confirm your exact project with ${city}&rsquo;s building department before you start; a designer or contractor experienced in ${region} can also help you read the requirements.`;

const PAGES = [
  // ---------------------------------------------------------------- Basement Renovation: Markham
  {
    slug: 'basement-renovation-markham', city: 'Markham', region: 'York Region', crumb: 'Basement Renovation in Markham',
    eyebrow: 'Markham basement renovations', h1: 'Basement Renovation in Markham',
    sub: 'Planning a basement renovation or a legal secondary suite in Markham? See what Markham&rsquo;s registration by-law requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Markham Basement Apartment Registration', localIntro: 'If your basement project includes a second unit, Markham has its own registration by-law. Here is what the City publishes.',
    localFacts: MUNICIPAL.markham.facts, localSource: { name: MUNICIPAL.markham.name, url: MUNICIPAL.markham.url },
    localClose: permitPara('Markham', 'York Region'),
    extraFaq: [
      ['Do I need to register a basement apartment in Markham?', `Yes. Markham requires two-unit houses to be registered under the City&rsquo;s Occupancy Registration of Two-Unit Residential By-law, and warns that occupying an unregistered unit can lead to court action. See ${X(MUNICIPAL.markham.url, "Markham's registration page")}.`],
      ['Does a Markham basement apartment need a building permit?', 'New second suites need a building permit from Building Standards. Suites created before July 1, 1993 use a declaration form and are assessed under the Fire Code&rsquo;s retrofit provisions for older units.'],
    ],
    metaTitle: 'Basement Renovation in Markham', description: 'Basement renovation in Markham: what the City&rsquo;s two-unit registration by-law requires, and how to connect with qualified local professionals. Request an assessment.',
    formType: 'General basement renovation', formSource: 'basement-renovation-markham',
  },
  // ---------------------------------------------------------------- Basement Renovation: Aurora
  {
    slug: 'basement-renovation-aurora', city: 'Aurora', region: 'York Region', crumb: 'Basement Renovation in Aurora',
    eyebrow: 'Aurora basement renovations', h1: 'Basement Renovation in Aurora',
    sub: 'Planning a basement renovation or a secondary dwelling unit in Aurora? See what the Town&rsquo;s Zoning By-law requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Aurora Secondary Dwelling Units', localIntro: 'Aurora permits second suites in some house types, with a registration and inspection process. Here is what the Town publishes.',
    localFacts: [
      `Aurora&rsquo;s Zoning By-law No. 6000-17 permits second suite dwelling units in detached, semi-detached and link house dwellings, subject to the zoning provisions for the property.`,
      `A Change of Use Permit or a building permit is required, and the unit must be registered with the Building Services Division.`,
      `An inspection with the Electrical Safety Authority is required for every unit. Units that existed before November 16, 1995 are grandfathered under provincial law but still need an inspection with Central York Fire Services.`,
    ],
    localSource: { name: 'Town of Aurora', url: 'https://www.aurora.ca/home-and-property/building-and-renovating/secondary-dwelling-units/' },
    localClose: permitPara('Aurora', 'York Region'),
    extraFaq: [
      ['Does Aurora allow basement apartments?', 'Aurora&rsquo;s Zoning By-law No. 6000-17 permits second suite dwelling units in detached, semi-detached and link house dwellings, subject to the zoning provisions that apply to the specific property.'],
      ['Do I need an electrical inspection for an Aurora basement apartment?', 'Yes. Aurora requires an Electrical Safety Authority inspection for every second suite, in addition to registration with the Building Services Division and, depending on when the unit was created, a fire inspection.'],
    ],
    metaTitle: 'Basement Renovation in Aurora', description: 'Basement renovation in Aurora: what the Town&rsquo;s Zoning By-law requires for a second suite, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-aurora',
  },
  // ---------------------------------------------------------------- Basement Renovation: Newmarket
  {
    slug: 'basement-renovation-newmarket', city: 'Newmarket', region: 'York Region', crumb: 'Basement Renovation in Newmarket',
    eyebrow: 'Newmarket basement renovations', h1: 'Basement Renovation in Newmarket',
    sub: 'Planning a basement renovation or an additional residential unit in Newmarket? See what the Town requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Newmarket Additional Residential Units', localIntro: 'Newmarket has registered additional units since 2013, with its own review step before a building permit. Here is what the Town publishes.',
    localFacts: MUNICIPAL.newmarket.facts, localSource: { name: MUNICIPAL.newmarket.name, url: MUNICIPAL.newmarket.url },
    localClose: permitPara('Newmarket', 'York Region'),
    extraFaq: [
      ['What is a Zoning Preliminary Review in Newmarket?', `Newmarket asks for a Zoning Preliminary Review before the building permit application for an additional residential unit, so zoning questions are worked out before drawings are finalized. See ${X(MUNICIPAL.newmarket.url, "Newmarket's additional residential unit page")}.`],
      ['How does Newmarket identify a registered basement apartment?', 'Registered properties receive an &ldquo;N&rdquo; plate and the additional unit gets a &ldquo;B&rdquo; address designation, which helps emergency responders and waste collection tell the units apart.'],
    ],
    metaTitle: 'Basement Renovation in Newmarket', description: 'Basement renovation in Newmarket: what the Town&rsquo;s additional residential unit process requires, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-newmarket',
  },
  // ---------------------------------------------------------------- Basement Renovation: Oshawa
  {
    slug: 'basement-renovation-oshawa', city: 'Oshawa', region: 'Durham Region', crumb: 'Basement Renovation in Oshawa',
    eyebrow: 'Oshawa basement renovations', h1: 'Basement Renovation in Oshawa',
    sub: 'Planning a basement renovation or a second unit in Oshawa? See what the City&rsquo;s Two Unit House Registration By-law requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Oshawa Two Unit House Registration', localIntro: 'Every two-unit house in Oshawa must be registered, and the process depends on when the second unit was created. Here is what the City publishes.',
    localFacts: MUNICIPAL.oshawa.facts, localSource: { name: MUNICIPAL.oshawa.name, url: MUNICIPAL.oshawa.url },
    localClose: permitPara('Oshawa', 'Durham Region'),
    extraFaq: [
      ['Do I need to register a basement apartment in Oshawa?', `Yes. Oshawa&rsquo;s Two Unit House Registration By-law requires every two-unit house to be registered, and the City says failing to register is an offence under the by-law. See ${X(MUNICIPAL.oshawa.url, "Oshawa's two-unit house page")}.`],
      ['Does the process differ for older basement apartments in Oshawa?', 'Yes. Units created before July 1994 register with an application and a declaration form once they meet property standards, Building Code and Fire Code requirements. Units created after July 1994 need a building permit before the second unit is created.'],
    ],
    metaTitle: 'Basement Renovation in Oshawa', description: 'Basement renovation in Oshawa: what the City&rsquo;s Two Unit House Registration By-law requires, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-oshawa',
  },
  // ---------------------------------------------------------------- Basement Renovation: Brampton
  {
    slug: 'basement-renovation-brampton', city: 'Brampton', region: 'Peel Region', crumb: 'Basement Renovation in Brampton',
    eyebrow: 'Brampton basement renovations', h1: 'Basement Renovation in Brampton',
    sub: 'Planning a basement renovation or an additional unit in Brampton? See what the City allows and requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Brampton Second and Third Units', localIntro: 'Brampton allows more than one additional unit on qualifying properties, with registration and permits required for each. Here is what the City publishes.',
    localFacts: MUNICIPAL.brampton.facts, localSource: { name: MUNICIPAL.brampton.name, url: MUNICIPAL.brampton.url },
    localClose: permitPara('Brampton', 'Peel Region'),
    extraFaq: [
      ['How many additional units does Brampton allow?', `Brampton allows a maximum of three units on a property, for example a principal dwelling with an attached second unit and a garden suite, or an attached second and third unit. Every unit needs registration and a building permit. See ${X(MUNICIPAL.brampton.url, "Brampton's second dwelling page")}.`],
      ['Does my Brampton property need Conservation Authority approval?', 'If the property is on Conservation Authority lands, Brampton has required approval from Credit Valley Conservation or the Toronto and Region Conservation Authority before permits proceed since April 1, 2024.'],
    ],
    metaTitle: 'Basement Renovation in Brampton', description: 'Basement renovation in Brampton: what the City allows for second and third units, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-brampton',
  },
  // ---------------------------------------------------------------- Basement Renovation: Whitby
  {
    slug: 'basement-renovation-whitby', city: 'Whitby', region: 'Durham Region', crumb: 'Basement Renovation in Whitby',
    eyebrow: 'Whitby basement renovations', h1: 'Basement Renovation in Whitby',
    sub: 'Planning a basement renovation or an additional dwelling unit in Whitby? See what the Town requires, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Whitby Additional Dwelling Units', localIntro: 'Whitby registers additional dwelling units and has run a fee-reimbursement incentive with its own deadlines. Here is what the Town publishes.',
    localFacts: MUNICIPAL.whitby.facts, localSource: { name: MUNICIPAL.whitby.name, url: MUNICIPAL.whitby.url },
    localClose: permitPara('Whitby', 'Durham Region'),
    extraFaq: [
      ['Do I need an electrical certificate for a Whitby additional unit?', `Yes. A licensed electrical contractor must provide a Certificate of Acceptance showing compliance with the Ontario Electrical Safety Code, and Enforcement Services then inspects the exterior of the property. See ${X(MUNICIPAL.whitby.url, "Whitby's additional dwelling unit page")}.`],
      ['Is there an incentive for additional dwelling units in Whitby?', 'Whitby has run a fee-reimbursement incentive with dated deadlines. Confirm the Town&rsquo;s current terms and deadlines before relying on it.'],
    ],
    metaTitle: 'Basement Renovation in Whitby', description: 'Basement renovation in Whitby: what the Town&rsquo;s additional dwelling unit registration requires, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-whitby',
  },
  // ---------------------------------------------------------------- Basement Renovation: Etobicoke
  {
    slug: 'basement-renovation-etobicoke', city: 'Etobicoke', region: 'Toronto', crumb: 'Basement Renovation in Etobicoke',
    eyebrow: 'Etobicoke basement renovations', h1: 'Basement Renovation in Etobicoke',
    sub: 'Planning a basement renovation or a legal secondary suite in Etobicoke? See what to check first, then connect with qualified local professionals.',
    secondaryHref: 'services/legal-basement-apartment-toronto/', secondaryLabel: 'Explore Legal Suite Requirements',
    localHeading: 'Etobicoke: What to Check First', localIntro: 'Etobicoke follows Toronto&rsquo;s building permit and secondary-suite rules, with one local geography detail worth knowing.',
    localFacts: [
      TORONTO_GEO.etobicoke,
      'Toronto Building lists structural or material changes, new plumbing or heating, underpinning, a new basement entrance and adding a second dwelling unit among the work that needs a building permit.',
      'A legal secondary suite is a separate, self-contained unit with its own kitchen and bathroom, built to zoning, Building Code and Fire Code requirements.',
    ],
    localSource: null,
    localClose: 'Toronto&rsquo;s rules apply citywide, but confirm whether your specific property is affected by the Ravine and Natural Feature Protection By-law, since that can change what is possible near a valley or watercourse. See the <a href="' + h('locations/etobicoke.html') + '">Etobicoke area page</a> for more.',
    extraFaq: [
      ['Does Etobicoke have different permit rules than the rest of Toronto?', 'No. Etobicoke follows the same Toronto Building permit rules as the rest of the city. The one local detail is that some Etobicoke properties sit near valleys such as the Humber River and Mimico Creek, which can bring the Ravine and Natural Feature Protection By-law into play.'],
      ['Do I need a permit to renovate a basement in Etobicoke?', 'It depends on the work. Toronto Building lists structural or material changes, new plumbing or heating, underpinning, a new entrance and a second unit as needing a permit. Confirm your specific project with Toronto Building.'],
    ],
    metaTitle: 'Basement Renovation in Etobicoke', description: 'Basement renovation in Etobicoke: Toronto&rsquo;s permit rules, the local ravine by-law to check, and how to connect with qualified local professionals.',
    formType: 'General basement renovation', formSource: 'basement-renovation-etobicoke',
  },
  // ---------------------------------------------------------------- Basement Waterproofing: Brampton
  {
    slug: 'basement-waterproofing-brampton', city: 'Brampton', region: 'Peel Region', crumb: 'Basement Waterproofing in Brampton',
    eyebrow: 'Brampton basement waterproofing', h1: 'Basement Waterproofing in Brampton',
    sub: 'Dealing with a wet or damp basement in Brampton? Find out where the water is coming from, then connect with qualified local professionals.',
    secondaryHref: 'services/interior-waterproofing/', secondaryLabel: 'Explore Waterproofing Options',
    localHeading: 'Waterproofing and Permits in Brampton', localIntro: 'Most waterproofing repairs are not a permit trigger on their own, but related work can be, and Brampton has its own approval steps to know about.',
    localFacts: [
      'A single crack repair, downspout extension or grading fix is typically not a permit trigger on its own; excavation, new drains and structural repairs can be different.',
      MUNICIPAL.brampton.facts[2],
      'If your waterproofing project grows into a larger renovation, such as underpinning or a second unit, Brampton&rsquo;s registration and permit requirements for additional units apply. See the section above.',
    ],
    localSource: { name: MUNICIPAL.brampton.name, url: MUNICIPAL.brampton.url },
    localClose: permitPara('Brampton', 'Peel Region'),
    extraFaq: [
      ['Do I need a permit to waterproof my basement in Brampton?', 'It depends on the scope. A sump pump or a targeted crack repair is often not a permit trigger, but excavation, new drains or structural repair can be. Confirm your exact project with Brampton&rsquo;s building department before starting.'],
      ['Does Conservation Authority approval affect waterproofing in Brampton?', 'It can, if the property is on Conservation Authority lands. Since April 1, 2024, Brampton has required approval from Credit Valley Conservation or the Toronto and Region Conservation Authority before permits proceed for those properties.'],
    ],
    metaTitle: 'Basement Waterproofing in Brampton', description: 'Basement waterproofing in Brampton: how to diagnose a wet basement, what may need a permit, and how to connect with qualified local professionals.',
    formType: 'Waterproofing or moisture issue', formSource: 'basement-waterproofing-brampton',
  },
  // ---------------------------------------------------------------- Basement Waterproofing: North York
  {
    slug: 'basement-waterproofing-north-york', city: 'North York', region: 'Toronto', crumb: 'Basement Waterproofing in North York',
    eyebrow: 'North York basement waterproofing', h1: 'Basement Waterproofing in North York',
    sub: 'Dealing with a wet or damp basement in North York? Find out where the water is coming from, then connect with qualified local professionals.',
    secondaryHref: 'services/interior-waterproofing/', secondaryLabel: 'Explore Waterproofing Options',
    localHeading: 'North York: What to Check First', localIntro: 'North York follows Toronto&rsquo;s permit rules, with one local geography detail that matters for drainage and excavation work.',
    localFacts: [
      TORONTO_GEO['north-york'],
      'Toronto Building says installing a sump pump does not require a building permit. Excavation, new drains or structural repairs can be different.',
      `Toronto runs a ${X(TORONTO.subsidyUrl, 'Basement Flooding Protection Subsidy Program')} for eligible owners, covering part of the cost of measures such as a backwater valve and a sump pump.`,
    ],
    localSource: null,
    localClose: 'Confirm whether your specific property is affected by the Ravine and Natural Feature Protection By-law before excavation-based waterproofing, since work near a valley can need additional review. See the <a href="' + h('locations/north-york.html') + '">North York area page</a> for more.',
    extraFaq: [
      ['Does North York have different waterproofing rules than the rest of Toronto?', 'No. North York follows the same Toronto Building rules as the rest of the city. The local detail is that some North York properties sit near the Don River valley and other ravines, which can bring the Ravine and Natural Feature Protection By-law into play.'],
      ['Is there help paying for basement flood protection in North York?', `Toronto runs a Basement Flooding Protection Subsidy Program for eligible owners, covering part of the cost of items such as backwater valves and sump pumps. See ${X(TORONTO.subsidyUrl, "the City's subsidy page")} for current terms.`],
    ],
    metaTitle: 'Basement Waterproofing in North York', description: 'Basement waterproofing in North York: how to diagnose a wet basement, the local ravine by-law to check, and Toronto&rsquo;s flood subsidy program.',
    formType: 'Waterproofing or moisture issue', formSource: 'basement-waterproofing-north-york',
  },
  // ---------------------------------------------------------------- Basement Waterproofing: Markham
  {
    slug: 'basement-waterproofing-markham', city: 'Markham', region: 'York Region', crumb: 'Basement Waterproofing in Markham',
    eyebrow: 'Markham basement waterproofing', h1: 'Basement Waterproofing in Markham',
    sub: 'Dealing with a wet or damp basement in Markham? Find out where the water is coming from, then connect with qualified local professionals.',
    secondaryHref: 'services/interior-waterproofing/', secondaryLabel: 'Explore Waterproofing Options',
    localHeading: 'Waterproofing and Permits in Markham', localIntro: 'Most waterproofing repairs are not a permit trigger on their own, but if a waterproofing project grows into a secondary suite, Markham&rsquo;s registration rules apply.',
    localFacts: [
      'A single crack repair, downspout extension or grading fix is typically not a permit trigger on its own; excavation, new drains and structural repairs can be different.',
      MUNICIPAL.markham.facts[0],
      'Confirm your exact scope, including whether a backwater valve or drain work is involved, with Markham&rsquo;s building department.',
    ],
    localSource: { name: MUNICIPAL.markham.name, url: MUNICIPAL.markham.url },
    localClose: permitPara('Markham', 'York Region'),
    extraFaq: [
      ['Do I need a permit to waterproof my basement in Markham?', 'It depends on the scope. A sump pump or a targeted crack repair is often not a permit trigger, but excavation, new drains or structural repair can be. Confirm your exact project with Markham&rsquo;s building department before starting.'],
      ['Does waterproofing count toward Markham&rsquo;s two-unit registration rules?', `Only if the project is part of creating a second unit. On its own, waterproofing is not a registration trigger, but a basement being prepared as a future suite should be planned with Markham&rsquo;s registration by-law in mind. See ${X(MUNICIPAL.markham.url, "Markham's registration page")}.`],
    ],
    metaTitle: 'Basement Waterproofing in Markham', description: 'Basement waterproofing in Markham: how to diagnose a wet basement, what may need a permit, and how to connect with qualified local professionals.',
    formType: 'Waterproofing or moisture issue', formSource: 'basement-waterproofing-markham',
  },
  // ---------------------------------------------------------------- Basement Waterproofing: Ajax (no verified municipal source; kept general)
  {
    slug: 'basement-waterproofing-ajax', city: 'Ajax', region: 'Durham Region', crumb: 'Basement Waterproofing in Ajax',
    eyebrow: 'Ajax basement waterproofing', h1: 'Basement Waterproofing in Ajax',
    sub: 'Dealing with a wet or damp basement in Ajax? Find out where the water is coming from, then connect with qualified local professionals.',
    secondaryHref: 'services/interior-waterproofing/', secondaryLabel: 'Explore Waterproofing Options',
    localHeading: 'Waterproofing in Ajax: What to Know', localIntro: 'Homes in many Ajax subdivisions date from roughly the 1980s to the 2000s, so basements are often newer builds. That does not rule out a moisture problem, and the right fix still depends on the cause.',
    localFacts: [
      'Newer construction can still have a wet basement: grading that settled over time, a blocked downspout or failed weeping tile are common causes regardless of the home&rsquo;s age.',
      'A single crack repair, downspout extension or grading fix is typically not a permit trigger on its own; excavation, new drains and structural repairs can be different.',
      'Ajax sets its own permit and registration rules, separate from Toronto&rsquo;s, so confirm your exact scope directly with the Town before starting.',
    ],
    localSource: null,
    localClose: permitPara('Ajax', 'Durham Region'),
    extraFaq: [
      ['Do newer Ajax homes still get wet basements?', 'Yes. A newer foundation reduces some risks but does not remove them: grading that has settled, a blocked downspout or a failed section of weeping tile can affect a home of any age. Diagnose the cause before choosing a fix.'],
      ['Do I need a permit to waterproof my basement in Ajax?', 'It depends on the scope. Confirm your exact project, including any excavation or drain work, with the Town of Ajax&rsquo;s building department before starting.'],
    ],
    metaTitle: 'Basement Waterproofing in Ajax', description: 'Basement waterproofing in Ajax: how to diagnose a wet basement and what to confirm before you hire. Request a basement assessment.',
    formType: 'Waterproofing or moisture issue', formSource: 'basement-waterproofing-ajax',
  },
];

for (const p of PAGES) buildPage(p);

module.exports = { PAGES };
