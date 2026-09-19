// Generates the cornerstone page: /services/legal-basement-apartment-toronto/
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');

const depth = 2;
const path = 'services/legal-basement-apartment-toronto/';
const h = (t) => L.href(depth, t);

const SRC = {
  permit: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/when-do-i-need-a-building-permit/',
  units: 'https://www.toronto.ca/services-payments/building-construction/building-permit/adding-new-units-to-residential-properties/',
  ontario: 'https://www.ontario.ca/page/add-second-unit-your-house',
  guide: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-permit-application-guides/additional-dwelling-unit-guides/secondary-suites/',
  zoning: 'https://www.toronto.ca/city-government/planning-development/planning-studies-initiatives/secondary-suites/overview-secondary-suites/',
  fire: 'https://www.toronto.ca/community-people/public-safety-alerts/safety-tips-prevention/home-high-rise-school-workplace-safety/low-rise-small-multi-unit-residential-fire-safety/two-dwelling-unit-houses-basement-apartments/',
  contact: 'https://www.toronto.ca/services-payments/building-construction/building-permit/forms-documents-additional-resources/toronto-building-contact-us/',
};

const TOC = [
  ['what-makes-legal', 'What makes a basement apartment legal?'],
  ['finished-vs-suite', 'Finished basement vs. legal secondary suite'],
  ['feasibility', 'Start with a feasibility assessment'],
  ['zoning-permits', 'Zoning and building permits'],
  ['ceiling-height', 'Ceiling height'],
  ['fire-separation', 'Fire separation'],
  ['alarms', 'Smoke and carbon monoxide alarms'],
  ['exits', 'Exits and escape'],
  ['windows', 'Windows and natural light'],
  ['systems', 'Plumbing, electrical, heating and ventilation'],
  ['entrances', 'Separate entrances'],
  ['moisture', 'Waterproofing and moisture'],
  ['stages', 'Project stages'],
  ['costs', 'Cost factors'],
  ['timeline', 'Timeline factors'],
  ['questions', 'Questions to ask contractors'],
  ['assessment-form', 'Request a basement assessment'],
  ['faq', 'FAQ'],
  ['sources', 'Official sources'],
];

const FAQ = [
  ['Is my basement apartment legal?', 'This page cannot tell you that. Whether a specific unit is legal depends on the property, its zoning, the permits and inspections on record, and current Building Code and Fire Code requirements. Toronto Building is the authority to ask, and a qualified designer or contractor can help you prepare.'],
  ['Do I need a building permit to add a basement apartment in Toronto?', 'Toronto Building states that a permit is required for adding a second dwelling unit, and for work such as underpinning, constructing a basement entrance, structural or material changes, new windows or doors, and heating or plumbing work. Finishing work that involves none of those may not need one. Confirm with Toronto Building for your project.'],
  ['What is the difference between a finished basement and a legal secondary suite?', 'A finished basement is extra living space for the household. A secondary suite is a separate, self-contained home with its own kitchen and bathroom that must satisfy zoning, Building Code and Fire Code requirements for a second unit. Finishing a basement does not by itself make it a legal suite.'],
  ['What ceiling height does a basement apartment need?', 'Ontario’s second-unit guide describes a minimum basement ceiling height of about 1.95 metres (roughly 6 ft 5 in). Requirements can depend on the specific space and on current rules, so have a designer confirm the height that applies to your project.'],
  ['Does a basement apartment need a separate entrance?', 'Not always as a matter of principle, but exits matter a great deal. Ontario’s guide describes a separate exit as preferred and explains that shared exits may be possible with added fire separation. Zoning can also affect entrances. Ask a designer and Toronto Building what applies to your house.'],
  ['Can Reno Rise tell me whether my basement is eligible?', 'No. Reno Rise is an independent project-enquiry and contractor-matching service. It does not determine legal eligibility, issue approvals or perform the work. A qualified designer, the contractor you choose, and Toronto Building are the right sources for eligibility.'],
  ['How much does a legal basement apartment cost in Toronto?', 'It depends on scope: ceiling height work, waterproofing, layout, plumbing, electrical, fire separation, windows, entrances, finishes, drawings and permit fees can all move the total. Get itemized quotes from more than one professional, and treat any single number quoted without a site visit with caution.'],
  ['How long does the process take?', 'Timelines depend on design, permit review, structural or waterproofing work and the contractor’s schedule. Ontario’s guide refers to a 10-business-day decision timeframe for complete house permit applications, but real project timelines are usually much longer once design and construction are included.'],
];

const main = `
<section class="section">
  <div class="container guide-layout">
  <article class="article-wrap">
    ${U.notice('<p><strong>Planning information, not legal or engineering advice.</strong> Rules for secondary suites change and depend on the property. Always confirm requirements with <a href="' + SRC.contact + '" rel="noopener">Toronto Building</a> and with a qualified designer or contractor before you plan, buy materials or start work. Reno Rise cannot say whether any specific basement is legal or eligible.</p>', true)}
    <p class="updated-line">Last reviewed September 2026 against the official pages listed under <a href="#sources">Official sources</a>. Regulations and fees are updated by the City and the Province, so treat this page as a starting point.</p>

    <p>A basement apartment can add rental income, house extended family or give a growing household more room. It is also one of the more heavily regulated home projects, because people will be living and sleeping below grade. Nobody has ever regretted reading the rules before building. Plenty have regretted reading them after. This guide summarizes, in plain language, what Toronto homeowners typically need to think about when planning a <strong>legal secondary suite</strong>, and how a basement conversion differs from an ordinary finished basement.</p>

    <nav class="toc" aria-label="On this page">
      <div class="toc-title">On this page</div>
      <ol>
${TOC.map(([id, label], i) => `        <li><a href="#${id}"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span> ${label}</a></li>`).join('\n')}
      </ol>
    </nav>

    <h2 id="what-makes-legal">What makes a basement apartment legal?</h2>
    <p>In everyday use, a &ldquo;legal&rdquo; basement apartment is a second home within the house that was created with the approvals the law requires, and that meets the applicable rules for a separate dwelling. In practice that generally means three things working together:</p>
    ${U.checkList([
      '<strong>Zoning permits it.</strong> Toronto&rsquo;s residential zoning generally allows a secondary suite in a detached house, semi-detached house or townhouse, subject to performance standards in the zoning by-law. The details depend on the property.',
      '<strong>A building permit was obtained and the work was inspected.</strong> Toronto Building requires a permit to add a second dwelling unit within an existing house.',
      '<strong>The space meets Building Code and Fire Code requirements</strong> for things like ceiling height, fire separation, exits, alarms, windows, ventilation and services.',
    ])}
    <p>Leaving out any of these is what typically makes a basement rental &ldquo;unauthorized&rdquo; or &ldquo;illegal&rdquo;. Toronto Fire Services has noted that many secondary-suite renovations are done without the required City review, which is why they take it seriously.</p>

    <h2 id="finished-vs-suite">Finished basement vs. legal secondary suite</h2>
    <p>The two projects can look similar on day one, but they are different in purpose and in what has to be true when the work is done. For a broader overview of a regular basement project, see our guide to <a href="${h('services/basement-renovation/')}">basement renovation planning</a>.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Comparison table">
    <table class="compare-table">
      <thead><tr><th scope="col">&nbsp;</th><th scope="col">Finished basement</th><th scope="col">Legal secondary suite</th></tr></thead>
      <tbody>
        <tr><th scope="row">Purpose</th><td>More living space for your own household: rec room, office, guest room.</td><td>A separate, self-contained home with its own kitchen and bathroom, for tenants or family.</td></tr>
        <tr><th scope="row">Permit</th><td>Depends on the work. Cosmetic finishing may not need one; structural, plumbing or heating work usually does.</td><td>Toronto Building requires a building permit to add a second dwelling unit.</td></tr>
        <tr><th scope="row">Code focus</th><td>Safe, dry, well-built living space.</td><td>All of the above plus requirements for separate units: fire separation, exits, alarms and more.</td></tr>
        <tr><th scope="row">Kitchen &amp; bathroom</th><td>Optional.</td><td>Both are part of the definition of a self-contained suite.</td></tr>
        <tr><th scope="row">Design help</th><td>Often a contractor alone.</td><td>Usually drawings from a qualified designer or engineer.</td></tr>
      </tbody>
    </table>
    </div>
    <p>We cover the comparison in more depth in <a href="${h('blog/finished-basement-vs-legal-secondary-suite.html')}">Finished Basement vs. Legal Secondary Suite</a>.</p>

    <h2 id="feasibility">Start with a feasibility assessment</h2>
    <p>Before spending on drawings or demolition, find out whether the project is realistic for your house. A feasibility review typically looks at:</p>
    ${U.checkList([
      'Ceiling height and any beams, ducts or pipes that lower the usable height.',
      'How the basement can be exited, and whether a separate entrance or an egress window is workable.',
      'Moisture, drainage and foundation condition.',
      'What the zoning by-law and Building Code mean for your specific lot and house type.',
      'The condition of your electrical service, heating system and plumbing.',
      'Whether underpinning or lowering the floor might be needed to reach a workable height.',
    ])}
    <p>Homeowners often start by submitting their project details and asking to be connected with an independent professional who does this kind of assessment. That is what the form below is for.</p>

    <div class="diagram-card-wrap" style="max-width:520px; margin:8px 0 28px;">
      ${L.diagramCard({ id: 'dgs' })}
    </div>

    <h2 id="zoning-permits">Zoning and building permits</h2>
    <p>Two separate approvals are involved, and both matter.</p>
    <p><strong>Zoning.</strong> The City of Toronto&rsquo;s zoning by-law generally permits one secondary suite within a detached house, semi-detached house or townhouse in residential zones, subject to performance standards. Whether your property meets them is a question for the City or a qualified professional.</p>
    <p><strong>Building permit.</strong> Toronto Building says a permit is needed to add a second dwelling unit. Its guide for secondary suites describes scaled, signed drawings, plans that show fixtures and smoke and carbon monoxide alarms, cross-sections of the construction, and specifications, prepared by a qualified designer or engineer where required. Plumbing and heating permits may also apply. Toronto also asks applicants to complete a rental renovation licence screening form. As the property owner, you remain responsible for compliance, and Toronto Building warns that missing permits can lead to delays, legal action and removal of completed work.</p>
    <p>Ontario&rsquo;s guide to adding a second unit adds that you should speak with your municipal planning and building departments first, that hiring a qualified professional is recommended, and that inspections happen at stages of construction. Its published information is dated (January 2023) and carries its own note that parts may not reflect recent legislative changes, so check what is current.</p>
    <p>For a plain-language permit primer, read <a href="${h('blog/basement-renovation-permits-toronto.html')}">Basement Renovation Permits in Toronto</a>.</p>

    <h2 id="ceiling-height">Ceiling height</h2>
    <p>Height is often the first make-or-break question. Ontario&rsquo;s second-unit guide describes a minimum basement ceiling height of about <strong>1.95 metres (roughly 6 ft 5 in)</strong>. Measure your basement from the finished floor level to the underside of the ceiling finish, then remember that new flooring, insulation, and a fire-rated ceiling all reduce the number. Heights under beams and ducts are usually treated differently, so ask a designer to confirm which measurements apply.</p>
    <p>When a basement is too low, some owners look at lowering the floor. That is structural work, typically requiring engineering, a permit and careful sequencing. Read about <a href="${h('services/underpinning/')}">underpinning</a> and <a href="${h('blog/basement-underpinning-cost-and-when-needed.html')}">when it is needed</a>.</p>

    <h2 id="fire-separation">Fire separation</h2>
    <p>A secondary suite must be separated from the rest of the house by fire-resistant construction so that a fire in one unit is slowed from spreading to the other. Ontario&rsquo;s guide describes a 30-minute fire separation between units, with a possible reduction to 15 minutes when interconnected smoke alarms are provided. The exact assembly (drywall type, ceiling and wall construction, sealed penetrations, fire-rated doors where required) is defined by the Building Code and the drawings. Sound-control measures often overlap with this work, so it is worth planning <a href="${h('services/basement-soundproofing/')}">soundproofing</a> at the same time.</p>

    <h2 id="alarms">Smoke and carbon monoxide alarms</h2>
    <p>Alarms are a core life-safety requirement for two-unit houses. Ontario&rsquo;s guide describes smoke alarms in bedrooms, in common areas and near the furnace, along with carbon monoxide alarms where required. Toronto Fire Services points out that missing interconnected alarms are a common problem in two-unit houses. The building permit drawings show where alarms go, and the final system is inspected.</p>

    <h2 id="exits">Exits and escape</h2>
    <p>Every occupant needs a safe way out. Toronto Fire Services highlights problem exits, such as a suite whose only way out leads through another unit or does not lead directly outside at ground level. Ontario&rsquo;s guide describes separate exits as preferred, shared exits as sometimes possible with fire separation, and emergency escape windows as required in certain layouts. Which arrangement works depends on your floor plan, so it should be resolved at the drawing stage.</p>

    <h2 id="windows">Windows and natural light</h2>
    <p>Habitable rooms need windows of adequate size, and bedrooms need an escape route. Ontario&rsquo;s guide gives glazing targets by room type (about 5% of the floor area for living and dining rooms and about 2.5% for bedrooms). Older basements often have small or high windows, so enlarging or adding one usually means cutting the foundation wall, adding a window well and often a permit. See <a href="${h('services/egress-windows/')}">egress windows</a> and <a href="${h('blog/egress-windows-toronto-basements.html')}">egress windows for Toronto basements</a>.</p>

    <h2 id="systems">Plumbing, electrical, heating and ventilation</h2>
    ${U.checkList([
      `<strong>Plumbing.</strong> A kitchen and bathroom need drainage, and below-grade drains may require breaking the slab. A <a href="${h('services/backwater-valve-installation/')}">backwater valve</a> is often part of the conversation. Toronto Building notes that plumbing work can call for a permit.`,
      '<strong>Electrical.</strong> Separate circuits, an adequate panel and safe wiring are needed, and older wiring may be a concern. Electrical work is typically inspected separately.',
      '<strong>Heating.</strong> Ontario&rsquo;s guide notes a single furnace can serve both units when it meets the Code&rsquo;s smoke-detection conditions, while separate systems are often recommended.',
      '<strong>Ventilation.</strong> Bathrooms and kitchens need exhaust ventilation and the living space needs fresh air.',
    ])}

    <h2 id="entrances">Separate entrances</h2>
    <p>A separate entrance can be a side door, a rear walkout or a below-grade stairwell. Toronto Building lists &ldquo;constructing a basement entrance&rdquo; among the work that requires a permit, and zoning rules can affect where an entrance can go, how much of the yard it takes and how it relates to the property line. Lot width, grade and drainage all matter. Explore <a href="${h('services/walkout-construction/')}">walkout and separate entrance construction</a> for an overview.</p>

    <h2 id="moisture">Waterproofing and moisture</h2>
    <p>A suite is only as good as the shell around it. Any active leak, damp wall or musty smell needs to be diagnosed before finishing, because finishes hide problems rather than fix them. Depending on the cause, solutions include drainage improvements, sump systems, crack repair, interior or exterior waterproofing. Read our overview of <a href="${h('services/interior-waterproofing/')}">interior waterproofing</a>, <a href="${h('services/wet-basement-repair/')}">wet basement repair</a> and <a href="${h('blog/basement-waterproofing-before-renovation.html')}">why to waterproof before you renovate</a>. Toronto Building notes that installing a sump pump does not by itself require a permit, but other water-control work might.</p>

    <h2 id="stages">Project stages</h2>
    <ol class="stage-list">
      <li><strong>Feasibility review</strong><span>Confirm height, exits, moisture and zoning questions before committing.</span></li>
      <li><strong>Design and drawings</strong><span>A qualified designer or engineer prepares permit drawings that show layout, fire separation, alarms and services.</span></li>
      <li><strong>Permit application</strong><span>Drawings and forms go to Toronto Building. Corrections and comments are common, so plan for back-and-forth.</span></li>
      <li><strong>Structural and moisture work</strong><span>Underpinning, waterproofing, new openings and entrances typically come first.</span></li>
      <li><strong>Rough-in and inspections</strong><span>Framing, plumbing, electrical and fire-separation work are inspected before they are covered up.</span></li>
      <li><strong>Finishes and final inspection</strong><span>Flooring, kitchen, bathroom, paint and final approvals close the project.</span></li>
    </ol>

    <h2 id="costs">Cost factors</h2>
    <p>Reno Rise does not publish suite pricing because costs move quickly and vary a lot between houses. What we can say is what tends to move the total:</p>
    ${U.checkList([
      'Whether the floor needs to be lowered (underpinning) or the ceiling height already works.',
      'Waterproofing and drainage work needed before finishing.',
      'Kitchen and bathroom layout, and how far new drains and supply lines must run.',
      'Electrical panel capacity and any wiring replacement.',
      'Fire-separation assemblies, doors and sound control.',
      'New windows, window wells and a separate entrance or walkout.',
      'Heating, ventilation and hot-water arrangements.',
      'Design fees, engineering, permit fees and inspections.',
      'Finish level: flooring, cabinetry, fixtures and appliances.',
    ])}
    <p>Read <a href="${h('blog/basement-renovation-cost-toronto.html')}">Basement Renovation Cost in Toronto</a> for guidance on comparing quotes. Always compare itemized quotes and ask what is and is not included.</p>

    <h2 id="timeline">Timeline factors</h2>
    <p>A basement suite is a multi-stage project. What stretches or shortens the schedule:</p>
    ${U.checkList([
      'Time to prepare drawings, and any engineering that is needed.',
      'Permit review and the number of comments to resolve. Ontario&rsquo;s guide refers to a 10-business-day decision timeframe for complete house permit applications, but do not treat that as a project schedule.',
      'Structural work such as underpinning and any waterproofing that must be done before finishing.',
      'Availability of the contractor and the trades, and material lead times for windows and doors.',
      'Scheduling of inspections at each stage.',
      'Weather, if exterior excavation or a new entrance is involved.',
    ])}

    <h2 id="questions">Questions to ask contractors</h2>
    <p>Reno Rise introduces homeowners to independent professionals but does not vet their credentials on your behalf. Ask directly:</p>
    ${U.checkList([
      'Have you completed secondary-suite projects in Toronto, and can I speak to recent clients?',
      'Who prepares the drawings, and who applies for and is responsible for the building permit?',
      'Can you show current proof of business licensing where required, WSIB status and liability insurance?',
      'Which items are in your quote, which are excluded, and how are changes handled in writing?',
      'How will you handle inspections, and who is on site day to day?',
      'What is the payment schedule, and what warranty do you provide on your work, in writing?',
      'If we find moisture, structural issues or old wiring, how will that be priced and scheduled?',
    ])}

    <section class="assess-band guide-form-wrap" id="assessment-form" aria-labelledby="assess-title">
      <h2 id="assess-title">Request a Basement Assessment</h2>
      <p>Share a few details about your basement and your plans. Reno Rise reviews what you send and, where there is a suitable fit, may connect you with an independent professional. This does not confirm eligibility, an appointment, a quote or a match.</p>
      <div data-assessment-form-mount data-source="assessment" data-project-type="Legal secondary suite / basement apartment" data-thank-you-href="${h('assessment/thank-you.html')}"></div>
    </section>

    ${U.stockGallery(depth, [
      ['finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels'],
      ['basement-room-with-windows', 'Basement room with windows and natural light', 'Photo: Peter Vang on Pexels'],
      ['basement-staircase-brick-wall', 'Staircase down to a basement beside an exposed brick wall', 'Photo: Curtis Adams on Pexels'],
    ], { heading: 'Photos for Reference' })}

    <h2 id="faq">Frequently asked questions</h2>
${U.faqItems(FAQ)}

    <h2 id="sources">Official sources</h2>
    <p>This page summarizes the following official sources in our own words. Check them directly, since they are updated separately from this guide.</p>
    <ul class="source-list">
      <li><a href="${SRC.permit}" rel="noopener">City of Toronto: When Do I Need a Building Permit?</a><small>Which basement work needs a permit. Page shows an update date of July 2026.</small></li>
      <li><a href="${SRC.units}" rel="noopener">City of Toronto: Adding New Units to Residential Properties</a><small>Starting point for secondary suites and other additional dwelling units.</small></li>
      <li><a href="${SRC.guide}" rel="noopener">City of Toronto: Secondary Suites building permit application guide</a><small>Drawings, documents and forms. Page shows an update date of August 2026.</small></li>
      <li><a href="${SRC.zoning}" rel="noopener">City of Toronto: Overview of Secondary Suites</a><small>Zoning context and performance standards.</small></li>
      <li><a href="${SRC.ontario}" rel="noopener">Province of Ontario: Add a Second Unit in Your House</a><small>Provincial guide, updated January 2023, with a note that parts may not reflect recent legislation.</small></li>
      <li><a href="${SRC.fire}" rel="noopener">Toronto Fire Services: Two-Dwelling Unit Houses (Basement Apartments)</a><small>Fire-safety concerns for two-unit houses. Page shows an update date of November 2019.</small></li>
    </ul>
    ${U.notice('<p><strong>Confirm before you build or rent.</strong> Contact <a href="' + SRC.contact + '" rel="noopener">Toronto Building</a> and a qualified designer or contractor about your specific property. Reno Rise is an independent project-enquiry and contractor-matching service and does not provide legal, engineering or code advice.</p>')}
    ${U.internalLinks(depth, [
      ['Basement Renovation', 'services/basement-renovation/'],
      ['Basement Finishing', 'services/basement-finishing/'],
      ['Underpinning', 'services/underpinning/'],
      ['Egress Windows', 'services/egress-windows/'],
      ['Waterproofing', 'services/interior-waterproofing/'],
      ['Basement Soundproofing', 'services/basement-soundproofing/'],
      ['Basement Renovation in Toronto', 'services/basement-renovation-toronto/'],
      ['Planning Centre', 'blog/'],
    ])}
  </article>

  <aside class="guide-aside" aria-label="Quick links">
    <div class="aside-card">
      <h3>Planning a suite?</h3>
      <p>Send your basement details and Reno Rise will review them.</p>
      <a href="#assessment-form" class="btn btn-primary">Request a Basement Assessment</a>
    </div>
    <div class="aside-card">
      <h3>Related guides</h3>
      <ul>
        <li><a href="${h('blog/finished-basement-vs-legal-secondary-suite.html')}">Finished basement vs. legal secondary suite</a></li>
        <li><a href="${h('blog/basement-renovation-permits-toronto.html')}">Basement renovation permits in Toronto</a></li>
        <li><a href="${h('blog/basement-renovation-cost-toronto.html')}">Basement renovation cost in Toronto</a></li>
        <li><a href="${h('blog/basement-underpinning-cost-and-when-needed.html')}">Underpinning: when it is needed</a></li>
      </ul>
    </div>
  </aside>
  </div>
</section>
`;

const hero = PG.pageHero({
  depth,
  h1: 'Legal Basement Apartments &amp; Secondary Suites in Toronto',
  sub: 'Plan a code-compliant secondary suite: what it involves, what to confirm with the City, and how to connect with qualified Toronto professionals.',
  crumbs: [['Home', ''], ['Services', 'services/'], ['Legal Secondary Suites', '']],
  variant: 'hero-dark',
});
// The hero variant has no image; add action buttons under the subhead.
const heroWithActions = hero.replace(
  '<div class="breadcrumb"',
  `<div class="hero-actions"><a href="#assessment-form" class="btn btn-primary">Request a Basement Assessment ${L.ICON.arrow}</a><a href="#what-makes-legal" class="btn btn-outline">Explore Legal Suite Requirements</a></div>
    <div class="breadcrumb"`
);

const title = 'Legal Basement Apartment Toronto | Secondary Suite Guide & Quotes';
const description = 'What makes a Toronto basement apartment legal? Plan a secondary suite: permits, ceiling height, fire separation and egress. Request a basement assessment.';

const html = PG.renderPage({
  depth,
  path,
  title,
  description,
  ogImage: `${L.SITE}/images/og/legal-secondary-suite-toronto.png`,
  ldGraph: [PG.faqNode(FAQ.map(([q, a]) => [q, U.strip(a)]))],
  active: 'suite',
  hero: heroWithActions,
  script: `<script src="${L.up(depth)}js/assessment-form.js"></script>
`,
  main,
  ctaOpts: { heading: 'Considering a Legal Secondary Suite?', text: 'Share your basement details. Reno Rise reviews your project and, where there is a suitable fit, may connect you with an independent professional.' },
});

U.write(path + 'index.html', html);
