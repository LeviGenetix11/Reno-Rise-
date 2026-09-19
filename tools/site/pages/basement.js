// Generates /services/basement-renovation/ (general basement renovation intent).
'use strict';
const L = require('../lib');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 2;
const h = (t) => L.href(depth, t);

const FAQ = [
  ['Do I need a permit for a basement renovation in Toronto?', 'It depends on the work. Toronto Building lists structural or material changes, new windows or doors, heating or plumbing changes, underpinning, a new basement entrance and adding a second dwelling unit as work that needs a permit. Finishing that involves none of those may not. Confirm your specific project with Toronto Building before you start.'],
  ['How much does a basement renovation cost in Toronto?', 'There is no single number, because scope drives everything: ceiling height work, waterproofing, bathrooms, plumbing, electrical, egress windows and finishes all change the total. Reno Rise does not publish price ranges it cannot verify. Get itemized quotes from more than one professional and compare what each includes.'],
  ['Do I need to underpin my basement to finish it?', 'Only if the ceiling height cannot be made workable any other way. Underpinning is structural work that needs engineering and a permit, so it is worth having the height measured and reviewed before anyone recommends it.'],
  ['How long does a basement renovation take?', 'Timelines depend on scope, moisture or structural work, permit review and contractor availability. Ask each professional for a written schedule, and ask what could change it.'],
  ['Does Reno Rise do the renovation?', 'No. Reno Rise is an independent project-enquiry and contractor-matching service. Estimates, contracts, warranties, permits and the construction itself are handled by the independent professional you choose.'],
];

const body = `
    <p>An unfinished basement either becomes the most-used room in the house or the place where boxes go to be forgotten. The difference is usually planning: knowing what shape the space is in, what you want it to do, and what has to be confirmed before work begins. This page covers general <strong>basement renovation</strong> planning for Toronto homes. If your goal is a self-contained rental or in-law apartment, start with the <a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a> instead.</p>

    ${U.notice(`<p><strong>Thinking about a rental unit?</strong> A secondary suite has additional requirements for fire separation, exits, alarms and permits. Read <a href="${h('services/legal-basement-apartment-toronto/')}">Legal Basement Apartments &amp; Secondary Suites in Toronto</a> before you set a budget.</p>`, true)}

    <h2>What a Basement Renovation Involves</h2>
    <p>A good project starts with the condition of the space, not the finishes. Before layout, a professional will normally look at moisture and drainage, ceiling height, exits and windows, the electrical panel&rsquo;s spare capacity, and the location of the main drain and utilities. That order matters: a beautiful rec room built over an unresolved moisture problem becomes an expensive repair.</p>
    <p>Depending on what you find, the scope can include waterproofing or drainage work, <a href="${h('services/underpinning/')}">underpinning</a> if height is short, framing, insulation suited to below-grade walls, electrical and plumbing rough-ins, <a href="${h('services/egress-windows/')}">egress windows</a> for bedrooms, flooring, and finishes.</p>

    <h2>Choose Your Scope</h2>
    <p>Most basement projects fall into one of three broad scopes. These are not price tiers, and every house is different.</p>
    <div class="tier-grid">
      <div class="tier-card">
        <div class="tier-label">Scope 1</div>
        <div class="tier-price" style="font-size:19px">Finish &amp; refresh</div>
        <p>A dry, tall-enough basement that mainly needs walls, flooring, lighting and paint. See <a href="${h('services/basement-finishing/')}">basement finishing</a>.</p>
      </div>
      <div class="tier-card mid">
        <div class="tier-label">Scope 2</div>
        <div class="tier-price" style="font-size:19px">Renovate &amp; add rooms</div>
        <p>A bedroom, bathroom or laundry area, which usually brings plumbing, electrical and egress considerations.</p>
      </div>
      <div class="tier-card">
        <div class="tier-label">Scope 3</div>
        <div class="tier-price" style="font-size:19px">Convert to a suite</div>
        <p>A separate dwelling with its own kitchen and bathroom. See the <a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a>.</p>
      </div>
    </div>

    ${U.stockGallery(depth, [
      ['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels'],
      ['finished-basement-sofa-room', 'Finished basement sitting room with a leather sofa and bright windows', 'Photo: Michael Gault Photos on Pexels'],
      ['basement-family-room-fireplace', 'Basement family room with wood paneling and a fireplace', 'Photo: Peter Vang on Pexels'],
    ])}

    <h2>What Drives the Cost</h2>
    <p>Reno Rise does not publish basement price ranges, because a figure without a site visit and a defined scope can mislead. The factors that move a budget most are:</p>
    ${U.checkList([
      'Moisture and drainage problems that must be fixed before finishing.',
      'Whether the floor must be lowered to reach a workable ceiling height.',
      'Adding a bathroom, kitchenette or laundry, and how far drains and supply lines have to travel.',
      'Electrical panel capacity and the age of the wiring.',
      'New windows, window wells or a separate entrance.',
      'Design, engineering, permit fees and inspections.',
      'The level of finishes, fixtures and appliances.',
    ])}
    <p>Our guide to <a href="${h('blog/basement-renovation-cost-toronto.html')}">basement renovation cost in Toronto</a> explains how to compare itemized quotes.</p>

    <h2>How a Project Typically Runs</h2>
    <p>Project details vary, but most basement renovations move through similar phases. Your chosen professional sets the actual schedule.</p>
    <ol class="stage-list">
      <li><strong>Assessment and planning</strong><span>Moisture, ceiling height, exits and electrical capacity are reviewed. Drawings and any permit applications are prepared before demolition.</span></li>
      <li><strong>Structure, systems and build</strong><span>Waterproofing or underpinning comes first when needed, then framing, rough-ins, insulation and drywall, with inspections at the required stages.</span></li>
      <li><strong>Finishes and close-out</strong><span>Flooring, trim, fixtures and paint, followed by final inspections and a walkthrough.</span></li>
    </ol>

    <h2>Common Mistakes to Avoid</h2>
    ${U.checkList([
      'Finishing over a basement that is damp but &ldquo;has not leaked in a while.&rdquo; Drywall hides moisture; it does not stop it.',
      'Calling a room a bedroom without a compliant egress window, which can affect safety, insurance and a future sale.',
      'Using standard batt insulation directly against a below-grade wall without a moisture-safe assembly.',
      'Adding a bathroom or kitchenette without confirming the electrical panel and drain capacity.',
      'Skipping permits on a &ldquo;cosmetic&rdquo; job that grows to include moved walls or relocated drains. The owner is responsible for compliance.',
    ])}

    <h2>When a Full Renovation Is Not the Right Fit</h2>
    <p>If your basement is already dry and tall enough and needs paint, flooring and lighting, a full renovation is more than the space requires. <a href="${h('services/basement-finishing/')}">Basement finishing</a> may be the better starting point. If there is active water entry or visible foundation movement, that should be diagnosed and resolved first: see <a href="${h('services/interior-waterproofing/')}">interior waterproofing</a> and <a href="${h('services/wet-basement-repair/')}">wet basement repair</a>.</p>
`;

guidePage({
  depth,
  path: 'services/basement-renovation/',
  title: 'Basement Renovation in Toronto | Planning Guide | Reno Rise',
  description: 'Plan a Toronto basement renovation: scope options, permits, moisture, ceiling height and cost factors. Request a basement assessment to be connected with professionals.',
  h1: 'Basement Renovation Planning in Toronto',
  sub: 'Understand the scope, the permits and the questions to ask, then connect with qualified local professionals for your project.',
  crumbs: [['Home', ''], ['Services', 'services/'], ['Basement Renovations', '']],
  active: 'basement',
  body,
  faq: FAQ,
  formType: 'General basement renovation',
  updated: 'Last reviewed September 2026. This page is general planning information; confirm requirements for your property with Toronto Building and qualified professionals.',
  related: [
    ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'],
    ['Basement Finishing', 'services/basement-finishing/'],
    ['Underpinning', 'services/underpinning/'],
    ['Interior Waterproofing', 'services/interior-waterproofing/'],
    ['Egress Windows', 'services/egress-windows/'],
    ['Basement Soundproofing', 'services/basement-soundproofing/'],
    ['Basement Renovation in Toronto Neighbourhoods', 'services/basement-renovation-toronto/'],
  ],
});
