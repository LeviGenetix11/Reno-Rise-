// Generates the Basement Planning Centre articles (blog/*.html) and exports their metadata for the blog index.
// Written to references/voice.md, humour.md, opinion.md, style.md and stories.md, and to the on-page SEO
// checklist in SEO_brief/on-page-seo.md. Reno Rise is a matching service, so "we fix it" language is turned into
// "here is what a good professional does". The stories are told as familiar, illustrative scenarios, never as
// Reno Rise projects. The one statistic used is from Statistics Canada.
'use strict';
const L = require('../lib');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 1;
const h = (t) => L.href(depth, t);
const A = (t, label) => `<a href="${h(t)}">${label}</a>`;
const X = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
const SUITE = A('services/legal-basement-apartment-toronto/', 'legal secondary suite guide');
const RENO = A('services/basement-renovation/', 'basement renovation planning');
const DATE = '2026-09-19';
const DATE_LONG = 'September 19, 2026';

const SRC = {
  tb: 'https://www.toronto.ca/services-payments/building-construction/building-permit/forms-documents-additional-resources/toronto-building-contact-us/',
  permit: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/when-do-i-need-a-building-permit/',
  guide: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-permit-application-guides/additional-dwelling-unit-guides/secondary-suites/',
  ontario: 'https://www.ontario.ca/page/add-second-unit-your-house',
  fire: 'https://www.toronto.ca/community-people/public-safety-alerts/safety-tips-prevention/home-high-rise-school-workplace-safety/low-rise-small-multi-unit-residential-fire-safety/two-dwelling-unit-houses-basement-apartments/',
  statcan: 'https://www150.statcan.gc.ca/n1/daily-quotidien/250318/dq250318c-eng.htm',
  subsidy: 'https://www.toronto.ca/services-payments/water-environment/managing-rain-melted-snow/basement-flooding/basement-flooding-protection-subsidy-program/',
};

const hero = (file, alt, credit) => `<figure class="post-hero">
      <img src="${L.up(depth)}images/stock/${file}.webp" width="1200" height="800" alt="${alt}" fetchpriority="high">
      <figcaption>${credit}. Stock photo, illustrative only. It is not a Reno Rise project.</figcaption>
    </figure>`;

const TB_NOTE = U.notice(`<p>General information, not legal or engineering advice. Confirm your project with ${X(SRC.tb, 'Toronto Building')} and a qualified designer or contractor. Reno Rise does not issue permits or give code advice.</p>`);

const POSTS = [
  // ------------------------------------------------------------------ 1
  {
    file: 'finished-basement-vs-legal-secondary-suite.html',
    cats: 'suites planning permits',
    tag: 'Legal secondary suites',
    title: 'Finished Basement vs. Legal Secondary Suite: What Is the Difference?',
    metaTitle: 'Finished Basement vs Legal Secondary Suite',
    short: 'Finished Basement vs. Legal Secondary Suite',
    description: 'Finished basement vs legal secondary suite: how they differ on permits, fire safety and exits, and how to choose before you spend a dollar. Read the guide.',
    excerpt: 'They look identical on move-in day. They are not the same project, and the difference is expensive to miss.',
    img: 'finished-basement-dining-living-area',
    alt: 'Finished basement dining and living area with small high windows',
    formType: 'Legal secondary suite / basement apartment',
    body: () => `
    ${hero('finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels')}
    <p>A <strong>finished basement</strong> is extra living space for your own household. A <strong>legal secondary suite</strong> is a separate, self-contained home inside your house, with its own kitchen and bathroom, created with a building permit and built to the rules for a second unit. That is the short answer. The long answer is where your money lives.</p>
    <p>Here is the part that surprises people. The two can look identical the day the drywall goes up. A kettle, a bed and a second-hand fridge do not make a suite. Your fridge does not file paperwork.</p>

    <h2>What is the difference between a finished basement and a legal suite?</h2>
    <p>Toronto&rsquo;s zoning by-law describes a secondary suite as self-contained living accommodation with private food-preparation and sanitary facilities, located within and subordinate to the main dwelling. Finishing a basement does none of that by itself. It just makes the space nicer.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Comparison table"><table class="compare-table">
      <thead><tr><th scope="col">&nbsp;</th><th scope="col">Finished basement</th><th scope="col">Legal secondary suite</th></tr></thead>
      <tbody>
        <tr><th scope="row">Who lives there</th><td>Your household</td><td>Tenants or family in a separate unit</td></tr>
        <tr><th scope="row">Kitchen</th><td>Optional</td><td>Part of the definition of a suite</td></tr>
        <tr><th scope="row">Permit</th><td>Depends on the work. Structural, plumbing or heating changes usually need one.</td><td>Toronto Building requires one to add a second dwelling unit</td></tr>
        <tr><th scope="row">Fire separation and exits</th><td>General safety</td><td>Specific separation, exit and alarm requirements for two units</td></tr>
        <tr><th scope="row">Drawings</th><td>Sometimes</td><td>Usually prepared by a qualified designer or engineer</td></tr>
      </tbody>
    </table></div>

    <h2>Why does the difference matter?</h2>
    <p>Because most renovation problems are not sudden. They are ignored. &ldquo;It&rsquo;s just finishing&rdquo; is the basement version of &ldquo;it&rsquo;s just cosmetic,&rdquo; and cosmetic is the most dangerous word in renovations. It is how a rental plan quietly turns into a legal problem.</p>
    ${U.checkList([
      'A finished basement does not become a legal apartment because someone lives in it. Legality depends on zoning, permits, inspections and code compliance.',
      'Building a basement without a suite in mind can make a later conversion harder, for example if the ceiling assembly, exits or drains were never planned for it.',
      `Toronto Fire Services has flagged concerns with two-unit houses that skipped required City review. See its ${X(SRC.fire, 'basement apartment fire safety page')}.`,
    ])}
    <p>Renting out an unauthorized unit can expose an owner to enforcement and safety risks. Nobody wants to learn that from a tenant, an inspector or an insurance adjuster.</p>

    <h2>Which one should you plan for?</h2>
    <p>Here is the direction. If you want space for your own family, start with ${RENO}. If rental income or a home for extended family is on the table, start with the ${SUITE}. If you are undecided, plan so that a suite stays possible: measure the ceiling height, think about exits and windows, and note where plumbing could go.</p>
    <p>That one afternoon of planning is the difference between a basement that keeps its options open and one that needs to be torn apart later. Future you will appreciate it. Future you is already tired.</p>

    <h2>When you do not need a suite project</h2>
    <p>If the goal is a comfortable family room, a suite project adds cost and paperwork you do not need. A dry, tall-enough basement that needs walls, flooring and light is a finishing job. See <a href="${h('services/basement-finishing/')}">basement finishing</a>, and skip the drama.</p>
    <h2>What to do next</h2>
    <p>Decide which project you actually want, then ask each professional how they would handle permits, drawings and inspections for it. If you would like Reno Rise to review your basement details, use the form below. It asks for the basics and takes a few minutes.</p>
    ${TB_NOTE}
`,
    faq: [
      ['Is a finished basement the same as a legal basement apartment?', 'No. A finished basement is extra living space for your household. A legal basement apartment is a separate, self-contained unit created with a building permit and built to Building Code and Fire Code requirements for a second unit.'],
      ['Can I turn a finished basement into a legal secondary suite later?', 'Often yes, but it is easier if the basement was planned for it. Ceiling height, exits, fire separation and drain locations all matter, and Toronto Building requires a permit to add a second dwelling unit.'],
      ['Does a basement need a kitchen to be a legal suite?', 'A secondary suite is self-contained living accommodation with its own kitchen and bathroom facilities, so yes, a kitchen and a bathroom are part of the definition.'],
      ['Do I need a permit to finish a basement in Toronto?', 'It depends on the work. Toronto Building says permits are needed for structural or material changes, new plumbing or heating work, underpinning, a new basement entrance, and adding a second dwelling unit.'],
    ],
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Renovation', 'services/basement-renovation/'], ['Basement Finishing', 'services/basement-finishing/'], ['Permits in Toronto', 'blog/basement-renovation-permits-toronto.html']],
  },

  // ------------------------------------------------------------------ 2
  {
    file: 'basement-renovation-permits-toronto.html',
    cats: 'permits planning',
    tag: 'Permits & code',
    title: 'Basement Renovation Permits in Toronto: What Usually Needs One',
    metaTitle: 'Basement Renovation Permits in Toronto',
    short: 'Basement Renovation Permits in Toronto',
    description: 'Basement renovation permit Toronto: what Toronto Building says needs a permit, what may not, and how to check before you start. Read the plain-language guide.',
    excerpt: 'What Toronto Building says needs a permit, what usually does not, and who is responsible when something goes wrong.',
    img: 'reviewing-house-floor-plan',
    alt: 'Two people reviewing a house floor plan on a table',
    formType: 'General basement renovation',
    body: () => `
    ${hero('reviewing-house-floor-plan', 'Two people reviewing a house floor plan on a table', 'Photo: Ivan S. on Pexels')}
    <p>Whether a basement renovation needs a <strong>building permit in Toronto</strong> depends on the work, not on how big the project feels. Structural changes, new plumbing or heating, underpinning, a new entrance, or adding a second unit all need one, according to Toronto Building. Paint and flooring on a safe existing layout generally do not.</p>
    <p>Permits are not the fun part of a renovation. Nobody ever hosted a housewarming to show off a permit. But this is the paperwork that keeps the fun part from being torn out.</p>

    <h2>What work needs a permit in Toronto?</h2>
    <p>The City&rsquo;s ${X(SRC.permit, '&ldquo;When Do I Need a Building Permit?&rdquo;')} page (updated July 2026) says basement finishing needs a permit when it includes:</p>
    ${U.checkList([
      'Structural or material changes, such as removing or adding walls, new windows or doors, relocating openings or enclosing existing spaces.',
      'Installing or modifying heating and plumbing systems.',
      'Excavating and constructing foundations, including underpinning.',
      'Constructing a basement entrance.',
      'Adding a second dwelling unit.',
    ])}

    <h2>What work might not need one?</h2>
    <p>The same page says finishing may not need a permit when it involves no structural or material alterations, creates no additional dwelling unit and does not include new plumbing. It also says installing a sump pump does not require a permit. If your plan is paint, flooring and lighting on an existing layout, you are probably in the clear. Probably is not a permit, so confirm.</p>

    <h2>Do secondary suites need a permit?</h2>
    <p>Yes. Adding a second unit is a permit project. Toronto&rsquo;s ${X(SRC.guide, 'secondary suite application guide')} describes scaled drawings, plans showing fixtures and smoke and carbon monoxide alarms, cross-sections, specifications and a rental renovation licence screening form. The ${SUITE} walks through the rest.</p>

    <h2>Who is responsible for the permit?</h2>
    <p>You are. As the property owner, compliance is yours, and Toronto Building warns that missing permits can lead to construction delays, legal action and removal of completed work. A professional can apply on your behalf, but get that in writing.</p>
    <p>Here is the hot take. The cheapest time to sort out a permit is the first time you think about it. Unpermitted work is a problem that introduces itself eventually, usually at a sale or an insurance claim, and never at a convenient time.</p>
    <p>Statistics Canada estimated that residential construction accounted for 32.7% of underground economic activity in 2023, the largest share of any industry (${X(SRC.statcan, 'Statistics Canada, March 2025')}). Translation: &ldquo;we can skip the permit, and pay cash&rdquo; is a sentence with a lot of company. Do not join it.</p>

    <h2>How do you check before you start?</h2>
    ${U.checkList([
      `Describe your exact scope to ${X(SRC.tb, 'Toronto Building')} or a qualified designer before work begins.`,
      'Ask each professional who applies for permits and who books inspections.',
      'Keep permits, inspection records and drawings with your house documents.',
    ])}
    <p>Get this part right and the rest of the project gets calmer. Inspectors become a checkpoint instead of a surprise, and your house has a paper trail that will still make sense in ten years.</p>
    ${TB_NOTE}
`,
    faq: [
      ['Do I need a permit to finish my basement in Toronto?', 'Only if the work includes things like structural or material changes, new plumbing or heating, underpinning, a basement entrance, or a second unit. Finishing with none of those may not need a permit, but confirm with Toronto Building.'],
      ['Do I need a permit to replace basement windows in Toronto?', 'Toronto Building lists new windows and relocated openings among work that needs a permit. A like-for-like swap is different from cutting a new opening, so describe your exact work to the City.'],
      ['Do I need a permit for a sump pump in Toronto?', 'Toronto Building says installing a sump pump does not require a building permit. Related work, such as new drains, can be different.'],
      ['What happens if I renovate my basement without a permit?', 'Toronto Building warns of construction delays, legal action and removal of work already completed. It can also cause problems when you sell or make an insurance claim.'],
      ['Who applies for the permit, the homeowner or the contractor?', 'The homeowner is responsible for compliance, but a professional can apply on your behalf. Agree who does what in writing before work starts.'],
    ],
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Underpinning', 'services/underpinning/'], ['Egress Windows', 'services/egress-windows/'], ['Basement Renovation', 'services/basement-renovation/']],
  },

  // ------------------------------------------------------------------ 3
  {
    file: 'basement-renovation-cost-toronto.html',
    cats: 'costs planning',
    tag: 'Costs',
    title: 'Basement Renovation Cost in Toronto: What Drives the Price',
    metaTitle: 'Basement Renovation Cost Toronto: What Drives It',
    short: 'Basement Renovation Cost in Toronto',
    description: 'Basement renovation cost Toronto: what actually moves the price, how to compare itemized quotes, and the red flags to walk away from. Plain-language guide.',
    excerpt: 'Why one number rarely works, how to compare quotes fairly, and the red flags to walk away from.',
    img: 'couple-reviewing-renovation-plans',
    alt: 'Couple sitting on a floor reviewing renovation plans',
    formType: 'General basement renovation',
    body: () => `
    ${hero('couple-reviewing-renovation-plans', 'Couple sitting on a floor reviewing renovation plans', 'Photo: A. Darmel on Pexels')}
    <p><strong>Basement renovation cost in Toronto</strong> depends on scope, and scope depends on what is behind your walls. Moisture, ceiling height, plumbing, electrical and permits move the total more than finishes do. Reno Rise does not publish a price range, because a number without your house attached would be a guess wearing a suit.</p>
    <p>That may not be what you wanted to hear. Here is what you get instead: the exact list of things that move the price, and a way to compare quotes so nobody sells you a mystery.</p>

    <h2>What drives the cost of a basement renovation?</h2>
    ${U.checkList([
      `<strong>Moisture and drainage.</strong> Fixing water problems before finishing can be a big line item. See ${A('blog/basement-waterproofing-before-renovation.html', 'waterproofing before renovation')}.`,
      `<strong>Ceiling height.</strong> If the floor has to be lowered, structural work changes the budget. See ${A('blog/basement-underpinning-cost-and-when-needed.html', 'underpinning')}.`,
      '<strong>Bathrooms, kitchens and laundry.</strong> Plumbing means drains, supply lines, venting and sometimes breaking the slab.',
      '<strong>Electrical.</strong> Panel capacity, older wiring and the number of circuits.',
      '<strong>Windows and entrances.</strong> Egress windows, window wells and separate entrances mean cutting the foundation and managing drainage.',
      `<strong>Suite requirements.</strong> Fire separation, exits, alarms and drawings add scope. See the ${SUITE}.`,
      `<strong>Design, engineering and permits.</strong> Drawings, permit fees and inspections. Toronto Building publishes ${X(SRC.permit, 'which work needs a permit')}.`,
      `<strong>Finishes.</strong> Flooring, cabinetry, fixtures and appliances vary widely. Below-grade floors have their own moisture and height questions; see ${A('services/basement-flooring/', 'flooring for a below-grade slab')}.`,
    ])}
    <p>Renovation stress comes from uncertainty, not from the work. Once you can name what is driving your number, the stress drops. Funny how that works.</p>

    <h2>How do you compare basement renovation quotes?</h2>
    <p>Ask every professional to itemize the quote, so you compare like with like:</p>
    ${U.checkList([
      'What is included and what is excluded: permits, drawings, waterproofing, disposal, finishes, appliances.',
      'Which items are fixed prices and which are allowances that could change.',
      'How surprises (old wiring, moisture, structural issues) are priced and scheduled, in writing.',
      'The payment schedule, and whether payments follow completed stages.',
      'Warranty terms in writing, and who honours them.',
      'Who applies for permits and arranges inspections.',
    ])}

    <h2>What are the red flags on a quote?</h2>
    <p>A few sentences should make you slow down. &ldquo;I can start tomorrow&rdquo; usually means an empty calendar. &ldquo;Cash is cheaper&rdquo; is a story Statistics Canada has numbers on: residential construction was 32.7% of underground economic activity in 2023 (${X(SRC.statcan, 'Statistics Canada')}). &ldquo;Trust me&rdquo; is not a document.</p>
    ${U.checkList([
      'A single number offered without seeing the basement.',
      'A quote far below the others with no explanation of what is missing.',
      'Pressure to skip permits or to pay a large amount up front.',
      'No references, no portfolio, no proof of insurance.',
    ])}
    <p>Before you hire, confirm credentials, insurance, references and permit responsibilities. A basic checklist: proof of liability insurance, WSIB status, a written contract, written warranty terms, and references you can actually call. Reno Rise does not vet professionals on your behalf.</p>

    <h2>Do you need a full renovation?</h2>
    <p>Sometimes the honest answer is no. A dry, tall-enough basement that needs walls, flooring and lighting is a lighter job. See ${RENO} for how to pick a scope. Fix it now, feel better today, and your future self can keep the budget for something fun.</p>
    ${U.notice('<p>This article intentionally contains no price ranges. Costs vary by property and change over time. Request several itemized quotes for your specific scope.</p>')}
`,
    faq: [
      ['How much does a basement renovation cost in Toronto?', 'There is no single number. Scope drives the price: moisture work, ceiling height, bathrooms, electrical, windows, permits and finishes all change it. Get several itemized quotes for your own basement.'],
      ['Why do basement renovation quotes vary so much?', 'Quotes differ in what they include. One may exclude permits, waterproofing or finishes that another includes, so compare itemized scopes rather than totals.'],
      ['Does a legal basement apartment cost more than a finished basement?', 'Usually, because a suite adds kitchen and bathroom plumbing, fire separation, exits, alarms, drawings and permits. The exact difference depends on your house.'],
      ['Should I pay a deposit up front?', 'Agree the payment schedule in writing and tie payments to completed stages. Be careful with large up-front payments.'],
      ['Is it cheaper to skip the permit?', 'Not in the long run. Toronto Building warns of delays, legal action and removal of completed work, and unpermitted work can cause problems at sale or in an insurance claim.'],
    ],
    related: [['Basement Renovation', 'services/basement-renovation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Permits in Toronto', 'blog/basement-renovation-permits-toronto.html'], ['Underpinning', 'services/underpinning/']],
  },

  // ------------------------------------------------------------------ 4
  {
    file: 'basement-underpinning-cost-and-when-needed.html',
    cats: 'underpinning costs',
    tag: 'Underpinning',
    title: 'Basement Underpinning in Toronto: When It Is Needed and What Drives Cost',
    metaTitle: 'Basement Underpinning Toronto: When You Need It',
    short: 'Underpinning: When It Is Needed and What Drives Cost',
    description: 'Basement underpinning Toronto: when it is needed, the alternatives to consider, what the permit involves and what drives the cost. Measure first, then decide.',
    excerpt: 'Lowering a basement floor is structural work. Here is when it comes up and what to measure first.',
    img: 'unfinished-basement-block-walls-joists',
    alt: 'Unfinished basement with block walls and exposed floor joists',
    formType: 'Underpinning or ceiling-height work',
    body: () => `
    ${hero('unfinished-basement-block-walls-joists', 'Unfinished basement with block walls and exposed floor joists', 'Photo: Curtis Adams on Pexels')}
    <p><strong>Basement underpinning</strong> lowers a basement floor by extending the foundation downward, and it is usually only needed when the ceiling is too low to be a workable living space. Ontario&rsquo;s second-unit guide describes a basement minimum of about 1.95 metres (roughly 6 ft 5 in). Measure first. Then decide. In that order.</p>
    <p>Underpinning is one of the most involved basement projects there is, which is why it deserves a sober look before anyone quotes it. The scary part is the digging. The sensible part is that you often do not need it.</p>

    <h2>When is underpinning needed?</h2>
    <p>Mostly when height is short. Older Toronto basements are more likely to fall below the target, though it varies house by house. If you are planning a secondary suite, height is one of the first things to check. See the ${SUITE}.</p>
    <p>A familiar scenario: a homeowner notices one corner of the basement feels oddly cold and jokes that it is a portal. It is not a portal. It is missing insulation, and the fix is simple. Mystery is usually physics. Fix the physics, fix the mystery. Ceiling height works the same way: measure it before you assume the worst, and before anyone sells you a dig.</p>

    <h2>How do you measure ceiling height?</h2>
    <p>Measure from the finished floor level to the underside of the ceiling finish. Then subtract what will change: a ${A('blog/do-you-need-a-subfloor-in-a-finished-basement.html', 'subfloor and finished flooring')}, insulation and a fire-rated ceiling all cost you height. Beams and ducts can lower usable height in spots. Ask a designer which measurements apply to your project.</p>

    <h2>What are the alternatives to underpinning?</h2>
    ${U.checkList([
      `A ${A('services/bench-footing/', 'bench footing')}, which lowers part of the floor and leaves a ledge along the walls.`,
      'Rerouting or lifting ducts and pipes that reduce usable height.',
      'Accepting a lower ceiling in rooms where a designer confirms it is acceptable for your plan.',
    ])}

    <h2>Does underpinning need a permit?</h2>
    <p>Yes. Toronto Building lists basement underpinning as work that needs a building permit (see the ${X(SRC.permit, 'City permit page')}). Expect engineered drawings, inspections, and sequencing that protects your house and your neighbours&rsquo;.</p>

    <h2>What drives underpinning cost?</h2>
    ${U.checkList([
      'How much of the perimeter is underpinned, and how far the floor is lowered.',
      'Soil and groundwater conditions, and access for equipment and material.',
      'Engineering, drawings and permit fees.',
      'New drainage, waterproofing and a new floor slab.',
      'Related work afterwards: plumbing, electrical and finishes.',
    ])}
    <p>Reno Rise does not publish underpinning price ranges because they depend heavily on the property. Ask for itemized quotes and compare what each includes. Picture the finished result: a tall, dry, bright basement you never have to duck in. That is the point of the whole exercise.</p>
    ${TB_NOTE}
`,
    faq: [
      ['What is basement underpinning?', 'Underpinning extends a house&rsquo;s foundation downward, usually in short sections, so the basement floor can be lowered and ceiling height gained.'],
      ['When do I need to underpin my basement?', 'Usually when the ceiling height is too low for the use you have in mind. Measure first, because some basements already work and cheaper alternatives may exist.'],
      ['Does underpinning need a permit in Toronto?', 'Yes. Toronto Building lists basement underpinning among the work that requires a building permit, and it typically involves engineered drawings and inspections.'],
      ['What is the difference between underpinning and a bench footing?', 'A bench footing lowers part of the floor and leaves a ledge along the walls, which can mean less disruption than full underpinning. Which one fits depends on the house.'],
      ['How much ceiling height does a basement apartment need?', 'Ontario&rsquo;s second-unit guide describes about 1.95 metres (roughly 6 ft 5 in) for basements. A designer should confirm what applies to your project.'],
    ],
    related: [['Underpinning', 'services/underpinning/'], ['Bench Footing', 'services/bench-footing/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Cost factors', 'blog/basement-renovation-cost-toronto.html']],
  },

  // ------------------------------------------------------------------ 5
  {
    file: 'egress-windows-toronto-basements.html',
    cats: 'permits suites planning',
    tag: 'Permits & code',
    title: 'Egress Windows for Toronto Basements: What to Know',
    metaTitle: 'Basement Egress Window Requirements Toronto',
    short: 'Egress Windows for Toronto Basements',
    description: 'Basement egress window Toronto: why bedrooms and suites need a safe way out, what installing a window and well involves, and what to ask before you hire.',
    excerpt: 'Safe exits and daylight for basement bedrooms and suites, and what a window well really involves.',
    img: 'basement-room-with-windows',
    alt: 'Basement room with windows and natural light',
    formType: 'Separate entrance or egress window',
    body: () => `
    ${hero('basement-room-with-windows', 'Basement room with windows and natural light', 'Photo: Peter Vang on Pexels')}
    <p>A <strong>basement egress window</strong> is a window large enough, and reachable enough, to be used as an emergency way out. If you plan a basement bedroom or a secondary suite, how people get out in an emergency becomes a design question, and an egress window is one common answer. Here is the direction: plan the exit first, then everything else.</p>
    <p>Small, high basement windows are wonderful for one thing, which is making a room feel like a cellar. Daylight and a safe exit are what turn it into a home.</p>

    <h2>Why do basement bedrooms need an egress window?</h2>
    <p>Ontario&rsquo;s guide to second units explains that emergency escape windows can be required where exits pass through other units, and it gives glazing targets for habitable rooms. Toronto Fire Services also highlights problem exits in two-unit houses. The Building Code sets the details, so a designer should confirm what your layout needs. See the ${SUITE} for how exits fit the whole project.</p>

    <h2>What does installing an egress window involve?</h2>
    ${U.checkList([
      'Checking what is in the wall: structure, lintels, pipes and wiring.',
      'Cutting the foundation opening and installing the window with proper flashing.',
      'Building a window well with drainage, so it does not collect water against your foundation.',
      'Finishing and insulating the interior around the opening.',
      `A permit and inspection where applicable. Toronto Building lists new windows among work that needs a permit (${X(SRC.permit, 'City permit page')}).`,
    ])}
    <p>Homeowners love saying the window was &ldquo;fine as it is.&rdquo; Sure. So was the fire drill nobody read. Windows are the one place where fine is not a plan.</p>

    <h2>What should you ask before hiring?</h2>
    ${U.checkList([
      'Will this window and well meet the Code for this room in this house?',
      'How will the well drain, and what happens in heavy rain?',
      'Who applies for the permit and arranges inspection?',
      'What happens if the opening hits a structural element or a buried service?',
    ])}
    <h2>When you do not need one</h2>
    <p>If you only want a brighter room and it is not a bedroom or a required exit, a smaller replacement may do. See <a href="${h('services/basement-window-replacement/')}">basement window replacement</a>, <a href="${h('services/window-well-installation/')}">window wells</a> and <a href="${h('services/egress-windows/')}">egress window planning</a>. Picture the result: a bright, safe basement bedroom where you can breathe, and sleep, easy.</p>
    ${TB_NOTE}
`,
    faq: [
      ['What is an egress window?', 'An egress window is large enough, and reachable enough, to be used as an emergency exit. In a basement it usually means an enlarged opening and a window well.'],
      ['Does a basement bedroom need an egress window?', 'Bedrooms need a safe way out, and Ontario&rsquo;s guide describes emergency escape windows for certain layouts. What applies depends on your design, so confirm with a designer and Toronto Building.'],
      ['Do I need a permit to add a basement egress window in Toronto?', 'Toronto Building lists new windows and relocated openings among work that needs a permit. Confirm your exact work with the City before cutting.'],
      ['How does a window well drain?', 'A window well is built with drainage so it does not collect water against the foundation. Ask each professional how theirs will drain in heavy rain.'],
    ],
    related: [['Egress Windows', 'services/egress-windows/'], ['Window Wells', 'services/window-well-installation/'], ['Walkouts & Entrances', 'services/walkout-construction/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/']],
  },

  // ------------------------------------------------------------------ 6
  {
    file: 'basement-waterproofing-before-renovation.html',
    cats: 'waterproofing planning',
    tag: 'Waterproofing',
    title: 'Basement Waterproofing Before You Renovate: Why It Comes First',
    metaTitle: 'Basement Waterproofing Before Renovation',
    short: 'Basement Waterproofing Before You Renovate',
    description: 'Basement waterproofing before renovation: why moisture comes first, the common causes, and how to choose a fix before you finish a Toronto basement. Read on.',
    excerpt: 'Finishing over a moisture problem hides it. How to diagnose the cause before you spend on finishes.',
    img: 'water-on-basement-floor-near-stairs',
    alt: 'Standing water on a floor beside a staircase',
    formType: 'Waterproofing or moisture issue',
    body: () => `
    ${hero('water-on-basement-floor-near-stairs', 'Standing water on a floor beside a staircase', 'Photo: pppsdavid on Pexels')}
    <p><strong>Basement waterproofing before renovation</strong> comes first because finishes hide moisture; they do not stop it. If your basement has any history of dampness, diagnose the cause and fix it before drywall, insulation or flooring goes up. Otherwise you are paying to bury a problem and inviting it to grow.</p>
    <p>Your basement did not just start smelling weird. It has been filing complaints for months. Basements are dramatic like that, but they are also fixable.</p>

    <h2>Why does moisture come before the renovation?</h2>
    <p>A familiar scenario: a homeowner says the basement &ldquo;just started&rdquo; smelling musty last week. When a professional opens up one section of drywall, the moisture pattern tells a different story. It was slow, quiet and patient. Problems do not appear suddenly. Awareness does. Most renovation problems are not sudden. They are ignored.</p>

    <h2>What causes a wet basement?</h2>
    ${U.checkList([
      'Downspouts and gutters that discharge next to the foundation.',
      'Soil that slopes toward the house.',
      'Cracks in walls or floors, or failed joints.',
      'Weeping tile that is blocked or failed.',
      'Window wells that fill with water.',
      'High groundwater after heavy rain or snowmelt.',
    ])}

    <h2>How do you diagnose it?</h2>
    <p>Note where and when water appears: after rain, in spring, or all year, and whether it comes through walls, the floor-wall joint or a specific crack. The right fix depends on that answer. A downspout extension is a very different bill from excavation. Small fixes prevent big failures.</p>

    <h2>What are the main fixes?</h2>
    <p>${A('services/wet-basement-repair/', 'Wet basement repair')} starts with the simple stuff. ${A('services/interior-waterproofing/', 'Interior waterproofing')} collects and redirects water that reaches the foundation. ${A('services/exterior-waterproofing/', 'Exterior waterproofing')} addresses water at the wall and needs excavation. Targeted ${A('services/foundation-crack-repair/', 'crack repair')} suits a localized leak. Toronto Building says installing a sump pump does not require a permit, but other work may.</p>
    <p>If you live in Toronto and flooding is your worry, the City&rsquo;s ${X(SRC.subsidy, 'Basement Flooding Protection Subsidy Program')} covers part of the cost of items such as backwater valves and sump pumps for eligible owners (page updated June 2026; confirm current terms).</p>

    <h2>What should you do before finishing?</h2>
    ${U.checkList([
      'Have a professional confirm the cause and the fix, and get the warranty in writing.',
      'Test the result through at least one heavy rainfall or thaw if you can.',
      `Use finishes and insulation suited to below-grade walls, and choose a floor the slab can support (see ${A('services/basement-flooring/', 'basement flooring considerations')}).`,
      'Keep access to sump pumps, cleanouts and shut-offs.',
    ])}
    <p>When you are ready to plan the whole project, read ${RENO} and the ${SUITE}. Fixed properly, your basement goes from mystery novel to fresh start.</p>
    ${TB_NOTE}
`,
    faq: [
      ['Should I waterproof my basement before finishing it?', 'If there is any history of water or dampness, yes. Finishing over an unresolved moisture problem hides it and can lead to mould and a second renovation.'],
      ['What causes a basement to leak after heavy rain?', 'Common causes include downspouts and grading that direct water toward the foundation, blocked weeping tile, wall cracks and window wells that fill with water.'],
      ['Do I need a permit for a sump pump in Toronto?', 'Toronto Building says installing a sump pump does not require a building permit. Other water-control work may, so confirm your exact scope.'],
      ['What is the difference between interior and exterior waterproofing?', 'Exterior waterproofing works from outside to keep water away from the wall and needs excavation. Interior waterproofing collects and redirects water that has reached the foundation.'],
    ],
    related: [['Basement Waterproofing', 'services/basement-waterproofing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
];

// Basement-flooring guides live in their own module (four articles, no more)
POSTS.push(...require('./posts-flooring'));

if (require.main === module) {
  for (const p of POSTS) {
    const mt = `${p.metaTitle} | Reno Rise`;
    if (p.description.length < 145 || p.description.length > 165) console.log(`  note: ${p.file} description is ${p.description.length} chars`);
    if (mt.length < 45 || mt.length > 62) console.log(`  note: ${p.file} title is ${mt.length} chars`);
    guidePage({
      depth,
      path: 'blog/' + p.file,
      title: mt,
      description: p.description,
      ogImage: `${L.SITE}/images/og/blog-${p.file.replace('.html', '')}.jpg`,
      h1: p.title,
      crumbs: [['Home', ''], ['Basement Planning Centre', 'blog/'], [p.short, '']],
      active: 'guides',
      body: p.body(),
      faq: p.faq,
      formType: p.formType,
      related: p.related,
      updated: `By <a href="${h('about.html')}">Reno Rise</a>. Published ${p.dateLong || DATE_LONG}. Last updated ${p.dateLong || DATE_LONG}. General planning information, not legal or engineering advice.`,
      article: { headline: p.title, date: p.date || DATE },
      asideLinks: [
        ['Legal secondary suite guide', 'services/legal-basement-apartment-toronto/'],
        ['Basement renovation planning', 'services/basement-renovation/'],
        ['Basement Planning Centre', 'blog/'],
      ],
    });
  }
}

module.exports = { POSTS };
