// Generates the new Basement Planning Centre articles (blog/*.html) and exports their metadata for the blog index.
'use strict';
const L = require('../lib');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 1;
const h = (t) => L.href(depth, t);
const A = (t, label) => `<a href="${h(t)}">${label}</a>`;
const SUITE = A('services/legal-basement-apartment-toronto/', 'legal secondary suite guide');
const RENO = A('services/basement-renovation/', 'basement renovation planning');
const DATE = '2026-09-19';
const TB = 'https://www.toronto.ca/services-payments/building-construction/building-permit/forms-documents-additional-resources/toronto-building-contact-us/';
const PERMIT_SRC = 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/when-do-i-need-a-building-permit/';
const ONT_SRC = 'https://www.ontario.ca/page/add-second-unit-your-house';

const POSTS = [
  {
    file: 'finished-basement-vs-legal-secondary-suite.html',
    cats: 'suites planning permits',
    tag: 'Legal secondary suites',
    title: 'Finished Basement vs. Legal Secondary Suite: What Is the Difference?',
    metaTitle: 'Finished Basement vs. Legal Secondary Suite in Toronto',
    short: 'Finished Basement vs. Legal Secondary Suite',
    description: 'A finished basement and a legal secondary suite are different projects. See how they differ in purpose, permits, code requirements and planning.',
    excerpt: 'They can look identical when the drywall is up, but they are not the same project. Here is how they differ.',
    formType: 'Legal secondary suite / basement apartment',
    body: `
    <p>Homeowners often use &ldquo;finished basement&rdquo; and &ldquo;basement apartment&rdquo; interchangeably. On paper, and in the eyes of the City, they are very different. Knowing which one you are planning shapes the budget, the drawings, the permit path and the questions to ask a professional.</p>
    <h2>The core difference</h2>
    <p>A <strong>finished basement</strong> is extra living space for your own household: a family room, guest bedroom, office or gym. A <strong>legal secondary suite</strong> is a separate, self-contained home inside the house, with its own kitchen and bathroom, created with a building permit and built to the rules for a second dwelling unit. Toronto&rsquo;s zoning by-law describes a secondary suite as self-contained living accommodation with private food-preparation and sanitary facilities, located within and subordinate to the main dwelling.</p>
    <h2>Side by side</h2>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Comparison table"><table class="compare-table">
      <thead><tr><th scope="col">&nbsp;</th><th scope="col">Finished basement</th><th scope="col">Legal secondary suite</th></tr></thead>
      <tbody>
        <tr><th scope="row">Who lives there</th><td>Your household</td><td>Tenants or family in a separate unit</td></tr>
        <tr><th scope="row">Kitchen</th><td>Optional</td><td>Part of the definition of a suite</td></tr>
        <tr><th scope="row">Permit</th><td>Depends on the work (structural, plumbing or heating changes usually need one)</td><td>Toronto Building requires one to add a second dwelling unit</td></tr>
        <tr><th scope="row">Fire separation &amp; exits</th><td>General safety</td><td>Specific separation, exit and alarm requirements for two units</td></tr>
        <tr><th scope="row">Drawings</th><td>Sometimes</td><td>Usually prepared by a qualified designer or engineer</td></tr>
      </tbody>
    </table></div>
    <h2>Why the distinction matters</h2>
    ${U.checkList([
      'A finished basement does not become a legal apartment just because someone lives in it. Legality depends on zoning, permits, inspections and code compliance.',
      'Building a basement without a suite in mind can make a later conversion harder, for example if the ceiling assembly, exits or drains were not planned for it.',
      'Renting an unauthorized unit can expose an owner to enforcement and safety risks. Toronto Fire Services has flagged concerns with two-unit houses that skipped required City review.',
    ])}
    <h2>Which should you plan for?</h2>
    <p>If you want space for your own family, start with ${RENO}. If you are considering rental income or a home for extended family, start with the ${SUITE}. If you are undecided, plan the basement so that a suite remains possible: measure ceiling height, consider exits and windows, and keep plumbing locations in mind.</p>
    ${U.notice(`<p>This is general information, not legal or engineering advice. Whether a specific property qualifies for a secondary suite must be confirmed with <a href="${TB}" rel="noopener">Toronto Building</a> and qualified professionals.</p>`)}
`,
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Renovation', 'services/basement-renovation/'], ['Basement Finishing', 'services/basement-finishing/'], ['Permits in Toronto', 'blog/basement-renovation-permits-toronto.html']],
  },
  {
    file: 'basement-renovation-permits-toronto.html',
    cats: 'permits planning',
    tag: 'Permits & code',
    title: 'Basement Renovation Permits in Toronto: What Usually Needs One',
    short: 'Basement Renovation Permits in Toronto',
    description: 'What Toronto Building says about when a basement renovation needs a permit, and how to check before you start. General information, not legal advice.',
    excerpt: 'Which basement work needs a building permit in Toronto, what usually does not, and who is responsible.',
    formType: 'General basement renovation',
    body: `
    <p>Whether your basement project needs a building permit depends on the work, not on whether it feels big or small. This article summarizes what the City of Toronto says. It is not a substitute for asking Toronto Building about your specific project.</p>
    <h2>Work that Toronto Building says needs a permit</h2>
    <p>According to the City&rsquo;s <a href="${PERMIT_SRC}" rel="noopener">&ldquo;When Do I Need a Building Permit?&rdquo;</a> page (which shows an update date of July 2026), basement finishing needs a permit when it includes:</p>
    ${U.checkList([
      'Structural or material changes, such as removing or adding walls, new windows or doors, relocating openings or enclosing existing spaces.',
      'Installing or modifying heating and plumbing systems.',
      'Excavating and constructing foundations, including underpinning.',
      'Constructing a basement entrance.',
      'Adding a second dwelling unit.',
    ])}
    <h2>Work that may not need one</h2>
    <p>The same page says finishing may not need a permit when it involves no structural or material alterations, creates no additional dwelling unit and does not include new plumbing. It also notes that installing a sump pump does not require a permit. If your plan is purely cosmetic (paint, flooring, lighting on an existing safe layout), that may fall outside the permit requirement, but confirm.</p>
    <h2>Secondary suites</h2>
    <p>Adding a second unit is a permit project. Toronto&rsquo;s secondary-suite application guide describes scaled drawings, plans showing fixtures and alarms, cross-sections, specifications and a rental renovation licence screening form, prepared by qualified people where required. See the ${SUITE} for the overall picture.</p>
    <h2>Who is responsible?</h2>
    <p>As the property owner, you are responsible for compliance. Toronto Building warns that missing permits can lead to construction delays, legal action and removal of work already completed. If a professional applies for permits on your behalf, get that in writing, and ask to see the permit and inspection records.</p>
    <h2>How to check</h2>
    ${U.checkList([
      'Describe your exact scope to <a href="' + TB + '" rel="noopener">Toronto Building</a> or a qualified designer before work begins.',
      'Ask each professional who applies for permits and who arranges inspections.',
      'Keep permit, inspection and drawing records with your house documents.',
    ])}
    ${U.notice('<p>General information based on published City of Toronto pages. Requirements change; confirm with Toronto Building. Reno Rise does not issue permits or give legal advice.</p>')}
`,
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Underpinning', 'services/underpinning/'], ['Egress Windows', 'services/egress-windows/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
  {
    file: 'basement-renovation-cost-toronto.html',
    cats: 'costs planning',
    tag: 'Costs',
    title: 'Basement Renovation Cost in Toronto: What Drives the Price',
    short: 'Basement Renovation Cost in Toronto',
    description: 'What moves the cost of a Toronto basement renovation, how to compare itemized quotes and what to ask before you sign. No unverified price ranges.',
    excerpt: 'Why one number rarely works, and how to compare quotes fairly.',
    formType: 'General basement renovation',
    body: `
    <p>Search for basement renovation costs and you will find wide ranges that are hard to trust. Reno Rise does not publish a price range for basement work, because a number without your house&rsquo;s details would be a guess. What is more useful is understanding what moves the price and how to compare quotes.</p>
    <h2>The biggest cost drivers</h2>
    ${U.checkList([
      '<strong>Moisture and drainage.</strong> Fixing water problems before finishing can be a large line item. See ' + A('blog/basement-waterproofing-before-renovation.html', 'waterproofing before renovation') + '.',
      '<strong>Ceiling height.</strong> If the floor must be lowered, structural work changes the budget significantly. See ' + A('blog/basement-underpinning-cost-and-when-needed.html', 'underpinning') + '.',
      '<strong>Bathrooms, kitchens and laundry.</strong> Plumbing means drains, supply lines, venting and sometimes breaking the slab.',
      '<strong>Electrical.</strong> Panel capacity, older wiring and the number of circuits.',
      '<strong>Windows and entrances.</strong> Egress windows, window wells and separate entrances involve cutting the foundation and drainage.',
      '<strong>Suite requirements.</strong> Fire separation, exits, alarms and drawings add scope. See the ' + SUITE + '.',
      '<strong>Design, engineering and permits.</strong> Drawings, permit fees and inspections.',
      '<strong>Finishes.</strong> Flooring, cabinetry, fixtures and appliances vary widely.',
    ])}
    <h2>How to compare quotes</h2>
    <p>Ask each professional to itemize the quote so you can compare like with like:</p>
    ${U.checkList([
      'What is included and what is excluded (permits, drawings, waterproofing, disposal, finishes, appliances)?',
      'Which items are fixed prices and which are allowances that could change?',
      'How are changes and surprises (old wiring, moisture, structural issues) handled and priced, in writing?',
      'The payment schedule, and whether payments are tied to completed stages.',
      'Warranty terms in writing, and who honours them.',
      'Who applies for permits and arranges inspections.',
    ])}
    <h2>Be careful with</h2>
    <ul class="check-list" style="list-style:none;">
      <li>${L.ICON.check} A single number offered without seeing the basement.</li>
      <li>${L.ICON.check} A quote that is far lower than others with no explanation of what is missing.</li>
      <li>${L.ICON.check} Pressure to skip permits or to pay a large amount up front.</li>
    </ul>
    <p>Before you hire, confirm credentials, insurance, references and permit responsibilities. Reno Rise does not vet professionals on your behalf.</p>
    ${U.notice('<p>This article intentionally contains no price ranges. Costs vary by property and change over time. Request several itemized quotes for your specific scope.</p>')}
`,
    related: [['Basement Renovation', 'services/basement-renovation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Permits in Toronto', 'blog/basement-renovation-permits-toronto.html'], ['Underpinning', 'services/underpinning/']],
  },
  {
    file: 'basement-underpinning-cost-and-when-needed.html',
    cats: 'underpinning costs',
    tag: 'Underpinning',
    title: 'Basement Underpinning in Toronto: When It Is Needed and What Drives Cost',
    metaTitle: 'Underpinning in Toronto: When It Is Needed & What Drives Cost',
    short: 'Underpinning: When It Is Needed and What Drives Cost',
    description: 'When underpinning comes up, the alternatives to consider, permits and what drives underpinning cost in Toronto basements.',
    excerpt: 'Lowering a basement floor is structural work. Here is when it comes up and what to ask first.',
    formType: 'Underpinning or ceiling-height work',
    body: `
    <p>Underpinning lowers a basement floor by extending the foundation downward. It is one of the most involved basement projects, so it is worth being sure it is needed before anyone quotes it.</p>
    <h2>When does it come up?</h2>
    <p>Mostly when ceiling height is short. Ontario&rsquo;s guide to adding a second unit describes a minimum basement ceiling height of about 1.95 metres (roughly 6 ft 5 in). Older Toronto basements are more likely to fall below that, though it varies house by house. If you are planning a secondary suite, height is one of the first things to check. See the ${SUITE}.</p>
    <h2>Measure first</h2>
    <p>Measure from the finished floor level to the underside of the ceiling finish, and remember that flooring, insulation and a fire-rated ceiling will reduce the number. Beams and ducts can lower usable height locally. Ask a designer which measurements apply.</p>
    <h2>Alternatives to consider</h2>
    ${U.checkList([
      'A <a href="' + h('services/bench-footing/') + '">bench footing</a>, which lowers part of the floor while leaving a ledge along the walls.',
      'Rerouting or lifting ducts and pipes that reduce usable height.',
      'Accepting a shorter ceiling in rooms that are not required to meet a height, if that suits your plan (confirm with a designer).',
    ])}
    <h2>Permit and engineering</h2>
    <p>Toronto Building lists basement underpinning as work that needs a building permit. Expect engineered drawings and inspections, and sequencing that protects the house and neighbours.</p>
    <h2>What drives underpinning cost</h2>
    ${U.checkList([
      'How much of the perimeter is underpinned, and how far the floor is lowered.',
      'Soil and groundwater conditions, and access for equipment and material.',
      'Engineering, drawings and permit fees.',
      'New drainage, waterproofing and a new floor slab.',
      'Related work: plumbing relocation, electrical changes and finishes afterward.',
    ])}
    <p>Reno Rise does not publish underpinning price ranges because they depend heavily on the property. Ask for itemized quotes and compare what each includes.</p>
    ${U.notice('<p>General information only. Structural work must be designed and inspected by qualified professionals. Confirm requirements with Toronto Building.</p>')}
`,
    related: [['Underpinning', 'services/underpinning/'], ['Bench Footing', 'services/bench-footing/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Cost factors', 'blog/basement-renovation-cost-toronto.html']],
  },
  {
    file: 'egress-windows-toronto-basements.html',
    cats: 'permits suites planning',
    tag: 'Permits & code',
    title: 'Egress Windows for Toronto Basements: What to Know',
    short: 'Egress Windows for Toronto Basements',
    description: 'What an egress window is, why basement bedrooms and suites need safe exits, and what installation involves, including permits and drainage.',
    excerpt: 'Safe exits and daylight for basement bedrooms and suites, and what installing a window well involves.',
    formType: 'Separate entrance or egress window',
    body: `
    <p>If you plan to use a basement room as a bedroom, or to create a secondary suite, how people get out in an emergency becomes a central design question. An egress window is one common answer.</p>
    <h2>What is an egress window?</h2>
    <p>It is a window large enough, and reachable enough, to serve as an emergency way out. In a basement that usually means a bigger opening in the foundation wall and a window well outside, with drainage and often a way to climb out of the well.</p>
    <h2>Why it matters</h2>
    <p>Ontario&rsquo;s guide to second units explains that emergency escape windows can be required where exits pass through other units, and it gives glazing targets for habitable rooms so that spaces are not dark. Toronto Fire Services also highlights problem exits in two-unit houses. The Building Code sets the details, so have a designer confirm what your layout needs. See the ${SUITE} for how exits fit into the whole project.</p>
    <h2>What installation involves</h2>
    ${U.checkList([
      'Checking what is in the wall: structure, lintels, pipes and wiring.',
      'Cutting the foundation opening and installing the window with proper flashing.',
      'Building a window well with drainage so it does not collect water against the foundation.',
      'Finishing and insulating the interior around the opening.',
      'A permit and inspection where applicable. Toronto Building lists new windows among work that needs a permit.',
    ])}
    <h2>Questions to ask</h2>
    ${U.checkList([
      'Will this window and well meet the Code for this room in this house?',
      'How will the well drain, and what happens in heavy rain?',
      'Who applies for the permit and arranges inspection?',
      'What if the opening hits a structural element or a buried service?',
    ])}
    ${U.notice('<p>General information. Confirm requirements with Toronto Building and a qualified designer. Reno Rise does not provide code advice.</p>')}
`,
    related: [['Egress Windows', 'services/egress-windows/'], ['Window Wells', 'services/window-well-installation/'], ['Walkouts & Entrances', 'services/walkout-construction/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/']],
  },
  {
    file: 'basement-waterproofing-before-renovation.html',
    cats: 'waterproofing planning',
    tag: 'Waterproofing',
    title: 'Basement Waterproofing Before You Renovate: Why It Comes First',
    short: 'Basement Waterproofing Before You Renovate',
    description: 'Why moisture problems should be diagnosed and fixed before finishing a Toronto basement, common causes and how to choose between fixes.',
    excerpt: 'Finishing over a moisture problem hides it. How to diagnose the cause before you spend on finishes.',
    formType: 'Waterproofing or moisture issue',
    body: `
    <p>The most expensive basement mistake is finishing over a problem that has not been solved. Drywall, insulation and flooring hide moisture rather than stopping it, and a small leak can turn into mould and a second renovation.</p>
    <h2>Common causes</h2>
    ${U.checkList([
      'Downspouts and gutters that discharge next to the foundation.',
      'Soil that slopes toward the house.',
      'Cracks in walls or floors, or failed joints.',
      'Weeping tile that is blocked or failed.',
      'Window wells that fill with water.',
      'High groundwater after heavy rain or snowmelt.',
    ])}
    <h2>Diagnose before you decide</h2>
    <p>Note where and when water appears, whether after rain, in spring or all year, and whether it comes through walls, the floor-wall joint or a specific crack. The right fix depends on that answer: a downspout extension is far smaller than excavation.</p>
    <h2>The main options</h2>
    <p>${A('services/wet-basement-repair/', 'Wet basement repair')} starts with simple fixes. ${A('services/interior-waterproofing/', 'Interior waterproofing')} collects and redirects water that reaches the foundation. ${A('services/exterior-waterproofing/', 'Exterior waterproofing')} addresses water at the wall and needs excavation. Targeted ${A('services/foundation-crack-repair/', 'crack repair')} suits a localized leak. Toronto Building notes that installing a sump pump does not require a permit, but other work may.</p>
    <h2>Before you finish the basement</h2>
    ${U.checkList([
      'Have a professional confirm the cause and the fix, and get the warranty in writing.',
      'Test the result through at least one heavy rainfall or thaw where possible.',
      'Use finishes and insulation suitable for below-grade walls.',
      'Keep access to sump pumps, cleanouts and shut-offs.',
    ])}
    <p>Planning the whole project? Read ${RENO} and the ${SUITE}.</p>
`,
    related: [['Basement Waterproofing', 'services/basement-waterproofing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
];

if (require.main === module) {
  for (const p of POSTS) {
    guidePage({
      depth,
      path: 'blog/' + p.file,
      title: (p.metaTitle || p.title) + ' | Reno Rise',
      description: p.description,
      h1: p.title,
      crumbs: [['Home', ''], ['Basement Planning Centre', 'blog/'], [p.short, '']],
      active: 'guides',
      body: p.body,
      formType: p.formType,
      related: p.related,
      updated: `Reno Rise editorial. Published ${'September 19, 2026'}. General planning information, not legal or engineering advice.`,
      article: { headline: p.title, date: DATE },
      asideLinks: [
        ['Legal secondary suite guide', 'services/legal-basement-apartment-toronto/'],
        ['Basement renovation planning', 'services/basement-renovation/'],
        ['Basement Planning Centre', 'blog/'],
      ],
    });
  }
}

module.exports = { POSTS };
