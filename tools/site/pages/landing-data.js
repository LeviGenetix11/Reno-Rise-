// Content for the keyword landing pages (see landing.js). One entry per row of the Page Map in
// reno-rise-service-keyword-map.xlsx. Rules from that workbook's Read Me: one page per intent cluster, primary
// keyword in the title/H1 only where it reads naturally, secondary keywords used selectively, no pages for
// off-market or ambiguous terms (so out-of-market cities and competitor brand names are ignored).
// Reno Rise is a matching service, so copy describes what a professional does. No prices are published.
'use strict';
const { pages: CLUSTER } = require('./cluster');
const c = (slug) => CLUSTER.find((p) => p.slug === slug);

const TORONTO_AREAS = [
  ['Toronto', 'locations/toronto.html'],
  ['Scarborough', 'locations/scarborough.html'],
  ['Etobicoke', 'locations/etobicoke.html'],
  ['North York', 'locations/north-york.html'],
  ['East York', 'locations/east-york.html'],
  ['All areas served', 'locations/'],
];

const X = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
const SUBSIDY_URL = 'https://www.toronto.ca/services-payments/water-environment/managing-rain-melted-snow/basement-flooding/basement-flooding-protection-subsidy-program/';
const VALVE_URL = 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-permit-application-guides/standalone-plumbing-mechanical-and-drains/backwater-valve/';
const PERMIT_URL = 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/when-do-i-need-a-building-permit/';

const list = (items) => `<ul class="check-list">\n${items.map((t) => `      <li><svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${t}</li>`).join('\n')}\n    </ul>`;

const CREDIT = {
  water: ['water-on-basement-floor-near-stairs', 'Standing water on a floor beside a staircase', 'Photo: pppsdavid on Pexels'],
  trench: ['drainage-pipe-in-gravel-trench', 'Perforated drainage pipe laid in a gravel trench', 'Photo: D Goug on Pexels'],
  crack: ['cement-filled-wall-crack', 'Crack in a wall filled with cement', 'Photo: Aksioart on Pexels'],
  valve: ['yellow-shut-off-valve', 'Yellow shut-off valve on a water pipe', 'Photo: alexasfotos on Pexels'],
  joists: ['unfinished-basement-block-walls-joists', 'Unfinished basement with block walls and exposed floor joists', 'Photo: Curtis Adams on Pexels'],
  windows: ['basement-room-with-windows', 'Basement room with windows and natural light', 'Photo: Peter Vang on Pexels'],
  stairs: ['basement-staircase-brick-wall', 'Staircase down to a basement beside an exposed brick wall', 'Photo: Curtis Adams on Pexels'],
  living: ['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels'],
  sofa: ['finished-basement-sofa-room', 'Finished basement sitting room with a leather sofa and bright windows', 'Photo: Michael Gault Photos on Pexels'],
  fireplace: ['basement-family-room-fireplace', 'Basement family room with wood paneling and a fireplace', 'Photo: Peter Vang on Pexels'],
  dining: ['finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels'],
};

const subsidyFacts = list([
  `Eligible owners of one- to four-unit homes in Toronto can apply, and downspouts must be disconnected from the sewer.`,
  `The City lists subsidies of up to 80% of eligible cost for work such as a home plumbing assessment (up to $500), backwater valves (up to $1,600 per device, maximum two), sump pump installation (up to $2,250), sump pump battery backup (up to $300) and foundation drain severance and capping (up to $400).`,
  `The program maximum is listed as up to $6,650 per property as of May 1, 2026, and subsidies are first-come, first-served.`,
  `Contractors must hold a valid Toronto business licence (a plumbing, drain or building renovator licence qualifies), and backwater valves need a building permit and a City inspection before the valve is enclosed.`,
  `Applications are due within two years of installation for work completed on or after November 12, 2025 (one year for earlier work).`,
]);
const SUBSIDY_NOTE = `<p style="font-size:13.5px;color:var(--muted);">Source: ${X(SUBSIDY_URL, 'City of Toronto Basement Flooding Protection Subsidy Program')}, page updated June 18, 2026 and reviewed September 2026. Program terms change, so confirm them with the City before you buy or install anything.</p>`;

const LANDINGS = [
  // ---------------------------------------------------------------- 1 waterproofing toronto
  {
    slug: 'basement-waterproofing',
    keyword: 'waterproofing toronto',
    crumb: 'Basement Waterproofing',
    metaTitle: 'Waterproofing Toronto: Basement Options',
    description: 'Waterproofing Toronto: compare interior, exterior and drainage fixes for a wet basement, and see what to ask before you hire. Request a basement assessment.',
    h1: 'Basement Waterproofing in Toronto',
    eyebrow: 'Toronto basement waterproofing',
    sub: 'Find out where the water is coming from, then choose the right fix: interior drainage, an exterior membrane or a smaller repair. Connect with qualified Toronto professionals for your project.',
    photo: CREDIT.trench,
    involvesHeading: 'How Basement Waterproofing Works',
    involvesLede: 'Most wet basements have a specific cause. The right fix follows the cause, so diagnosis comes first.',
    cards: [
      ['water', 'Find the source first', 'Water comes through walls, the floor-wall joint, cracks, window wells, or from grading and gutters. The fix depends on which one it is.'],
      ['home', 'Interior waterproofing', 'Collects and redirects water that reaches the foundation, usually to a sump pit and pump, without digging up the yard.'],
      ['foundation', 'Exterior waterproofing', 'Works from outside: excavation, wall repair, a waterproofing membrane and drainage, so water is stopped at the wall.'],
      ['tool', 'Targeted repairs', 'A single crack, a blocked downspout or poor grading can be a smaller fix than a full system.'],
      ['plan', 'Sump pumps and valves', 'A sump pump and, in some homes, a backwater valve protect against groundwater and sewer backup.'],
      ['check', 'Proof before finishing', 'Test the result through a heavy rain or thaw before drywall and flooring go over it.'],
    ],
    sections: [
      {
        h2: 'Finding Waterproofers in Toronto',
        html: `<p>Searching for <strong>waterproofers in Toronto</strong> gives you plenty of names and very little clarity. A good professional starts with a diagnosis, not a sales pitch for whichever system is easiest to install. Ask what is causing the water, what options exist, and why the one being proposed fits your house.</p>
    ${list(['Ask how the water source was identified, and whether a smaller fix would work.', 'Ask what is warranted, for how long, and get it in writing.', 'Ask who handles permits and inspections, and for references you can call.', 'Be careful with paint-on products: they can seal a surface but do not fix where the water is coming from.'])}`,
      },
    ],
    permitHeading: 'Permits and approvals',
    permit: `Toronto Building says installing a sump pump does not require a building permit. Excavation, new drains or structural repairs can be different, and a backwater valve needs a drain permit. Confirm your exact scope with ${X('https://www.toronto.ca/services-payments/building-construction/building-permit/forms-documents-additional-resources/toronto-building-contact-us/', 'Toronto Building')}.`,
    ask: c('basement-waterproofing').ask,
    notFit: c('basement-waterproofing').notFit,
    areasHeading: 'Toronto Neighbourhoods',
    areasText: 'Waterproofing questions come up across the city, from North York and Scarborough to Etobicoke and East York. Enquiries from elsewhere in the GTA are welcome too.',
    areas: TORONTO_AREAS,
    quotes: ['kaylyn', 'reliance'],
    photos: [CREDIT.water, CREDIT.crack, CREDIT.trench],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform waterproofing work.',
    faq: [
      ['What is the difference between interior and exterior waterproofing?', 'Exterior waterproofing works from outside to keep water away from the foundation wall and needs excavation. Interior waterproofing collects and redirects water that has already reached the foundation. The right choice depends on the cause and on access.'],
      ['How do I know where my basement leak is coming from?', 'Note where and when water appears: after rain, in spring or all year, and whether it comes through a wall, the floor-wall joint or a crack. A professional can confirm the cause before recommending a fix.'],
      ['Does waterproof paint fix a wet basement?', 'Paint-on waterproofing products can seal a surface, but they do not address where the water is coming from. Have the cause diagnosed before choosing a fix.'],
      ['Do I need a permit for basement waterproofing in Toronto?', 'Toronto Building says installing a sump pump does not need a building permit. Other work, such as excavation, new drains or a backwater valve, may. Confirm your exact scope with the City.'],
      ['Can Reno Rise help with basement waterproofing near me in Etobicoke, Scarborough or North York?', 'Reno Rise focuses on Toronto and welcomes enquiries from across the GTA. Submit your details and Reno Rise will review them. Availability in a given area cannot be guaranteed.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Interior Waterproofing', 'services/interior-waterproofing/'], ['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Foundation Crack Repair', 'services/foundation-crack-repair/'], ['Sump Pumps', 'services/sump-pump/'], ['Weeping Tile', 'services/weeping-tile/'], ['Waterproofing Before Renovation', 'blog/basement-waterproofing-before-renovation.html']],
    ctaHeading: 'Dealing With a Wet Basement?',
  },

  // ---------------------------------------------------------------- 2 toronto basement renovation
  {
    slug: 'basement-renovation',
    keyword: 'toronto basement renovation',
    crumb: 'Basement Renovations',
    metaTitle: 'Toronto Basement Renovation: Plan & Get Matched',
    description: 'Plan a Toronto basement renovation: scope options, permits, moisture, ceiling height and cost drivers. Request a basement assessment to get matched.',
    h1: 'Toronto Basement Renovation Planning',
    eyebrow: 'Toronto basement renovations',
    sub: 'Understand the scope, the permits and the questions to ask, then connect with qualified local professionals for your basement renovation.',
    secondary: ['Explore Legal Suite Requirements', 'services/legal-basement-apartment-toronto/'],
    involvesHeading: 'What a Basement Renovation Involves',
    involvesLede: 'A good project starts with the condition of the space, not the finishes. Get those answers early and the rest gets calmer.',
    cards: [
      ['water', 'Moisture and drainage', 'A beautiful rec room built over an unresolved moisture problem becomes an expensive repair. Diagnose first.'],
      ['foundation', 'Ceiling height', 'Measure before you plan. If height is short, options include a bench footing or underpinning.'],
      ['window', 'Exits and windows', 'Bedrooms need a safe way out. Egress windows and entrances shape the layout.'],
      ['tool', 'Electrical and plumbing', 'Panel capacity, older wiring and drain locations decide what rooms are practical.'],
      ['plan', 'Permits and drawings', 'Structural, plumbing, heating and second-unit work need permits in Toronto. Plan for them early.'],
      ['home', 'Finishes', 'Insulation for below-grade walls, drywall, flooring and lighting come last, once the shell is sound.'],
    ],
    sections: [
      {
        h2: 'Choose Your Scope',
        html: `<p>Most basement projects fall into one of three broad scopes. These are not price tiers, and every house is different.</p>
    <div class="tier-grid">
      <div class="tier-card"><div class="tier-label">Scope 1</div><div class="tier-price" style="font-size:19px">Finish &amp; refresh</div><p>A dry, tall-enough basement that mainly needs walls, flooring, lighting and paint. See <a href="../basement-finishing/">basement finishing</a>.</p></div>
      <div class="tier-card mid"><div class="tier-label">Scope 2</div><div class="tier-price" style="font-size:19px">Renovate &amp; add rooms</div><p>A bedroom, bathroom or laundry area, which usually brings plumbing, electrical and egress considerations.</p></div>
      <div class="tier-card"><div class="tier-label">Scope 3</div><div class="tier-price" style="font-size:19px">Convert to a suite</div><p>A separate dwelling with its own kitchen and bathroom. See the <a href="../legal-basement-apartment-toronto/">legal secondary suite guide</a>.</p></div>
    </div>`,
      },
      {
        h2: 'What Drives the Cost',
        cream: true,
        html: `<p>Reno Rise does not publish basement price ranges, because a figure without a site visit and a defined scope can mislead. The cost to finish a basement depends on:</p>
    ${list(['Moisture and drainage problems that must be fixed first.', 'Whether the floor must be lowered to reach a workable ceiling height.', 'Adding a bathroom, kitchenette or laundry, and how far drains and supply lines have to travel.', 'Electrical panel capacity and the age of the wiring.', 'New windows, window wells or a separate entrance.', 'Design, engineering, permit fees and inspections, and the level of finishes.'])}
    <p>Our guide to <a href="../../blog/basement-renovation-cost-toronto.html">basement renovation cost in Toronto</a> explains how to compare itemized quotes.</p>`,
      },
      {
        h2: 'Choosing a Basement Contractor in Toronto',
        html: `<p>If you have been searching for <strong>basement contractors in Toronto</strong>, or <strong>basement renovation contractors near you</strong>, here is the direction. Reno Rise does not perform renovations or vet contractors on your behalf, so do the checking yourself. It is worth it.</p>
    ${list(['Ask for proof of liability insurance and WSIB status, and check licensing where required.', 'Ask for references you can actually call, and a written contract with a clear scope.', 'Compare itemized quotes: what is included, what is excluded, how changes are priced.', 'Ask who applies for permits and who books inspections.', 'Be careful with &ldquo;I can start tomorrow&rdquo; and &ldquo;cash is cheaper&rdquo;.'])}`,
      },
    ],
    permit: `Toronto Building lists structural or material changes, new windows or doors, heating or plumbing changes, underpinning, a new basement entrance and adding a second dwelling unit as work that needs a permit (see the ${X(PERMIT_URL, 'City permit page')}). Finishing that involves none of those may not. Confirm your project before you start.`,
    ask: ['Has the moisture history of this basement been checked?', 'Which parts of the work need a permit, and who applies?', 'Is the electrical panel adequate for the added load?', 'How will surprises (old wiring, moisture, structure) be priced and scheduled, in writing?'],
    notFit: 'If your basement is already dry and tall enough and needs paint, flooring and lighting, a full renovation is more than the space requires: basement finishing may be the better starting point. If there is active water entry, fix that first.',
    areas: [['Toronto', 'locations/toronto.html'], ['Scarborough', 'locations/scarborough.html'], ['Etobicoke', 'locations/etobicoke.html'], ['North York', 'locations/north-york.html'], ['All areas served', 'locations/']],
    quotes: ['marco', 'reliance'],
    photos: [CREDIT.living, CREDIT.sofa, CREDIT.fireplace],
    photoNote: 'Ideas for how a finished basement can look. Stock photos from Pexels, shown for inspiration only. They are not Reno Rise projects, and Reno Rise does not perform renovation work.',
    faq: [
      ['Do I need a permit for a basement renovation in Toronto?', 'It depends on the work. Toronto Building lists structural or material changes, new windows or doors, heating or plumbing changes, underpinning, a new entrance and a second unit as needing a permit. Confirm your specific project.'],
      ['How much does a basement renovation cost in Toronto?', 'There is no single number. Scope drives everything: moisture work, ceiling height, bathrooms, electrical, windows and finishes. Reno Rise does not publish price ranges it cannot verify. Get itemized quotes from more than one professional.'],
      ['Do I need to underpin my basement to finish it?', 'Only if ceiling height cannot be made workable another way. Underpinning is structural work that needs engineering and a permit, so have the height measured first.'],
      ['How long does a basement renovation take?', 'It depends on scope, moisture or structural work, permit review and contractor availability. Ask each professional for a written schedule and what could change it.'],
      ['How do I find basement contractors near me in Toronto?', 'Reno Rise reviews your project details and, where there is a suitable fit, may introduce you to an independent professional. It cannot guarantee a match, and you should confirm credentials, insurance and references yourself.'],
      ['Does Reno Rise do the renovation?', 'No. Reno Rise is an independent project-enquiry and contractor-matching service. Estimates, contracts, warranties, permits and construction are handled by the professional you choose.'],
    ],
    formType: 'General basement renovation',
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Finishing', 'services/basement-finishing/'], ['Underpinning', 'services/underpinning/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Egress Windows', 'services/egress-windows/'], ['Basement Soundproofing', 'services/basement-soundproofing/'], ['Toronto Neighbourhoods', 'services/basement-renovation-toronto/']],
    ctaHeading: 'Planning a Toronto Basement Renovation?',
  },

  // ---------------------------------------------------------------- 3 sump pump installation toronto
  {
    slug: 'sump-pump',
    keyword: 'sump pump installation toronto',
    crumb: 'Sump Pumps',
    metaTitle: 'Sump Pump Installation Toronto: What to Know',
    description: 'Sump pump installation Toronto: how a sump system works, backup and battery options, permits and the City flood subsidy. Request a basement assessment.',
    h1: 'Sump Pump Installation in Toronto',
    eyebrow: 'Toronto sump pumps',
    sub: 'A sump pump moves groundwater out of your basement before it becomes a flood. See how installation works, what backup options exist and what the City says about permits and subsidies.',
    photo: CREDIT.water,
    involvesHeading: 'How a Sump Pump System Works',
    involvesLede: 'Water collects in a pit below the floor, and the pump sends it outside. Simple idea, a few details that matter.',
    cards: [
      ['water', 'The pit and the pump', 'A pit collects water from the weeping tile or floor drainage, and a pump discharges it outside. Pump sizing should match how much water the basement actually sees.'],
      ['foundation', 'The discharge line', 'The City&rsquo;s flood-protection guidance says a sump pump should empty onto a permeable surface at least two metres from the foundation wall.'],
      ['tool', 'Battery backup', 'Pumps fail when the power fails, which is often when they are needed most. A battery backup keeps the pump running during an outage.'],
      ['check', 'Replacement and testing', 'A pump that runs constantly, makes new noises or fails to start is a candidate for replacement. Test it before storm season.'],
      ['plan', 'Backup options', 'Battery backups are common. Some homeowners ask about water-powered backups too; ask installers how they work and what limits apply.'],
      ['home', 'Protecting the whole system', 'Downspouts, grading and, in some homes, a backwater valve all affect how much work the pump has to do.'],
    ],
    sections: [
      {
        h2: 'Toronto Flood-Protection Subsidy for Sump Pumps',
        cream: true,
        html: `<p>If you live in Toronto, part of the cost of a sump pump and its battery backup may be covered. Here is what the City publishes.</p>
    ${subsidyFacts}
    ${SUBSIDY_NOTE}`,
      },
      {
        h2: 'Sump Pump Replacement, Repair and Backup Systems',
        html: `<p>People search for <strong>sump pump replacement</strong>, <strong>backup sump pumps</strong> and <strong>battery backups</strong> for the same reason: the first pump did not survive its worst day. Ask any installer what happens during a power outage and during a very heavy rain, and how the pump, the check valve and the discharge line will be set up.</p>
    ${list(['Ask whether the existing pit can be reused, or should be replaced.', 'Ask how the backup is powered and how long it runs.', 'Ask how the pump will be tested and how you will know it has failed.', 'Ask what the warranty covers, in writing.'])}`,
      },
    ],
    permit: `Toronto Building says installing a sump pump does not require a building permit. Related work can be different: a backwater valve needs a drain permit, and digging or new drains may need approval. Confirm your exact scope with the City.`,
    ask: ['Is the pit and pump sized for how much water this basement sees?', 'Where does the discharge go, and is it far enough from the foundation?', 'What happens during a power outage?', 'Are you licensed to work in Toronto, and can you help with the subsidy paperwork?'],
    notFit: 'If water enters through a wall crack or a floor joint, a pump alone may not be the whole answer. Read about interior waterproofing and wet basement repair before you decide.',
    areasHeading: 'Toronto Neighbourhoods',
    areas: TORONTO_AREAS,
    quotes: ['kaylyn', 'reliance'],
    photos: [CREDIT.water, CREDIT.trench, CREDIT.valve],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not install sump pumps.',
    faq: [
      ['Do I need a permit for a sump pump in Toronto?', 'Toronto Building says installing a sump pump does not require a building permit. Related work, such as new drains or a backwater valve, can be different.'],
      ['How much does sump pump installation cost in Toronto?', 'It depends on whether a pit already exists, the pump, the discharge route, a backup system and access. Reno Rise does not publish prices. Get itemized quotes, and check the City subsidy, which the City lists at up to $2,250 for a sump pump and up to $300 for battery backup (80% of eligible cost).'],
      ['What is a backup sump pump?', 'A backup keeps water moving when the main pump fails or the power goes out. Battery systems are common, and some homeowners ask about water-powered alternatives. Ask installers how each works and what limits apply.'],
      ['How do I know if my sump pump needs replacing?', 'Warning signs include a pump that runs constantly, makes new noises, cycles erratically or fails to start. A professional can test it and advise.'],
      ['Can I get money back for a sump pump in Toronto?', 'Possibly. The City runs a Basement Flooding Protection Subsidy Program for eligible owners, with conditions such as disconnected downspouts and a licensed contractor. Confirm current terms with the City.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Backwater Valves', 'services/backwater-valve/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Weeping Tile', 'services/weeping-tile/'], ['Waterproofing Guide', 'services/basement-waterproofing/']],
    ctaHeading: 'Protecting Your Basement From Water?',
  },

  // ---------------------------------------------------------------- 4 foundation repair near me
  {
    slug: 'foundation-crack-repair',
    keyword: 'foundation repair near me',
    crumb: 'Foundation Crack Repair',
    metaTitle: 'Foundation Repair Near Me: Toronto Crack Repair',
    description: 'Foundation repair near me in Toronto: how to tell cosmetic cracks from serious ones, how cracks are repaired and what to ask before you hire. Read the guide.',
    h1: 'Foundation Crack Repair in Toronto',
    eyebrow: 'Toronto foundation crack repair',
    sub: 'A crack in a basement wall is a message, not a mystery. Learn how to tell a hairline crack from a serious one and how repairs are approached, then connect with qualified Toronto professionals.',
    photo: CREDIT.crack,
    involvesHeading: 'How Foundation Crack Repair Works',
    involvesLede: 'The first question is whether the crack is still moving. The answer decides the repair.',
    cards: [
      ['check', 'Active or settled?', 'A crack that has stopped moving can often be sealed. One that keeps growing needs its cause found first.'],
      ['foundation', 'Structural evaluation', 'Wide, horizontal or stair-step cracks, or walls that bow, are worth having an engineer look at.'],
      ['tool', 'Injection sealing', 'Epoxy or polyurethane injection can seal a crack from the inside so water and air stop coming through.'],
      ['water', 'Water control', 'If the crack leaks because of drainage or grading, exterior waterproofing or drainage work may be needed too.'],
      ['plan', 'Monitoring', 'Marking and measuring a crack over time shows whether it is moving.'],
      ['home', 'Restoring the wall', 'Once sealed and dry, the wall can be finished. Do not cover an active leak.'],
    ],
    sections: [
      {
        h2: 'Foundation Repair Near Me: How to Choose',
        html: `<p>If you are searching for <strong>foundation repair near you</strong>, you will find foundation repair companies, contractors and specialists all promising the same thing. What matters is the diagnosis. A good professional explains what is causing the crack before quoting a fix, and involves an engineer when the movement looks structural.</p>
    ${list(['Ask what is causing the crack, and how they know.', 'Ask whether an engineer should assess it, especially for horizontal cracks, widening cracks or bowing walls.', 'Ask what repair is proposed, what is warranted and for how long, in writing.', 'Ask whether the work needs a permit, and who handles it.'])}`,
      },
      {
        h2: 'Signs Worth Having Looked At',
        cream: true,
        html: `${list(['A crack that is getting longer or wider.', 'Horizontal cracks, or stair-step cracks in block walls.', 'A wall that bows or leans inward.', 'Doors or windows that stick, or gaps that appear around them.', 'Water or damp along a crack, especially after rain.'])}
    <p>Every house settles a little, and a hairline crack is often cosmetic. But ignoring one does not make it stop. That crack has a cousin, and they are both growing. Get it looked at.</p>`,
      },
    ],
    permit: 'Crack sealing on its own may not need a permit, but structural repair, excavation or underpinning can. Toronto Building lists underpinning and structural changes among work that needs one. Confirm your exact scope.',
    ask: ['Is the crack active, and how was that decided?', 'Does this need an engineer, and who provides the report?', 'What repair is proposed and what does the warranty cover?', 'If water is involved, how will drainage be addressed?'],
    notFit: 'A hairline crack that has not changed for years may only need monitoring and sealing. If water is entering across the whole basement, see waterproofing options before choosing a crack repair.',
    areas: TORONTO_AREAS,
    quotes: ['reliance', 'kaylyn'],
    photos: [CREDIT.crack, CREDIT.water, CREDIT.joists],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform foundation repairs.',
    faq: [
      ['Are foundation cracks serious?', 'Many are cosmetic, but some are not. Cracks that keep widening, horizontal cracks, stair-step cracks in block walls and bowing walls deserve a professional and possibly an engineer.'],
      ['What causes cracks in a basement foundation?', 'Common causes include settlement, shrinkage as concrete cures, soil and water pressure against the wall, and frost. The cause decides the repair.'],
      ['How are foundation cracks repaired?', 'Stable cracks are often sealed by injecting epoxy or polyurethane from inside. Cracks tied to movement or water pressure may need structural work or exterior drainage and waterproofing.'],
      ['Should I call a contractor or an engineer about a foundation crack?', 'For a stable hairline crack, a qualified contractor may be enough. For anything structural, an engineer&rsquo;s assessment comes first. A good contractor will say so.'],
      ['How do I find foundation repair near me in Toronto?', 'Reno Rise reviews your details and, where there is a suitable fit, may introduce you to an independent professional. It cannot guarantee a match, so check credentials, insurance and references yourself.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Basement Waterproofing', 'services/basement-waterproofing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Underpinning', 'services/underpinning/'], ['Wet Basement Repair', 'services/wet-basement-repair/']],
    ctaHeading: 'Found a Crack in Your Foundation?',
  },

  // ---------------------------------------------------------------- 5 basement flooding toronto
  {
    slug: 'wet-basement-repair',
    keyword: 'basement flooding toronto',
    crumb: 'Wet Basement Repair',
    metaTitle: 'Basement Flooding Toronto: Causes & Repairs',
    description: 'Basement flooding Toronto: what to do first, the common causes, repair options and the City flood-protection subsidy. Request a basement assessment.',
    h1: 'Basement Flooding in Toronto: Causes and Repair',
    eyebrow: 'Toronto wet basement repair',
    sub: 'Whether it was one bad storm or a slow, recurring leak, find the cause before you spend on repairs. Connect with qualified Toronto professionals for your project.',
    photo: CREDIT.water,
    involvesHeading: 'Why Basements Flood and What Fixes It',
    involvesLede: 'Water arrives from above, from around the house, or from the sewer. Treating the wrong cause wastes money.',
    cards: [
      ['water', 'Surface water', 'Downspouts that discharge next to the house, soil that slopes toward it and clogged gutters push water at the foundation.'],
      ['foundation', 'Groundwater', 'High groundwater and failed weeping tile push water up through the floor and joints after heavy rain or snowmelt.'],
      ['tool', 'Sewer backup', 'During severe storms, sewers can back up into a basement. A backwater valve is one protection.'],
      ['check', 'Repair options', 'Drainage fixes, crack repair, a sump system, interior drainage or exterior waterproofing, depending on the cause.'],
      ['plan', 'Prevention', 'Downspout extensions, grading, a sump pump with battery backup and a backwater valve reduce the risk.'],
      ['home', 'Before finishing', 'Confirm the fix works before drywall and flooring go over the area.'],
    ],
    sections: [
      {
        h2: 'If Your Basement Is Flooding Right Now',
        html: `<p>Reno Rise is an enquiry and matching service, not an emergency responder. If water is coming in now:</p>
    ${list(['Stay out of standing water if it could be near outlets, appliances or the electrical panel. Call your utility or a licensed electrician if you are unsure.', 'Call your insurer early and ask what they need, and take photos and video of the damage.', 'Call a plumber or a water-damage restoration company for emergency help.', 'Once the water is out, come back for the diagnosis: find the cause before you repair.'])}`,
      },
      {
        h2: 'Toronto Flood-Protection Help',
        cream: true,
        html: `<p>Toronto runs a subsidy program for flood protection measures such as a backwater valve, a sump pump and battery backup. Here is what the City publishes.</p>
    ${subsidyFacts}
    ${SUBSIDY_NOTE}`,
      },
    ],
    permit: `Toronto Building says installing a sump pump does not require a permit, but a backwater valve needs a drain permit and City inspection. Repairs that involve excavation, new drains or structural changes can need approval too. ${'Confirm your exact scope with the City.'}`,
    ask: ['What do you believe caused this, and how did you confirm it?', 'Is there a lower-cost fix I should try first, such as downspouts or grading?', 'What is warranted, and what would void it?', 'How will you test that the repair worked?'],
    notFit: 'If you are planning a renovation, resolve moisture first: read the guide on waterproofing before renovating.',
    areas: TORONTO_AREAS,
    quotes: ['kaylyn', 'reliance'],
    photos: [CREDIT.water, CREDIT.trench, CREDIT.valve],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects.',
    faq: [
      ['Why does my basement flood after heavy rain?', 'Common causes are downspouts and grading that direct water at the foundation, blocked or failed weeping tile, wall cracks, window wells that fill up and, in some cases, sewer backup.'],
      ['What should I do first if my basement is flooding?', 'Prioritize safety around electricity, call your insurer, document the damage and call emergency help. Then have the cause diagnosed before repairs.'],
      ['Does home insurance cover basement flooding?', 'Coverage varies by policy and by the cause of the water. Ask your insurer directly what your policy covers before you assume.'],
      ['What is a backwater valve and do I need one?', 'A backwater valve closes to stop sewage flowing back into the house during a sewer backup. Whether you need one depends on your home; Toronto requires a drain permit to install one.'],
      ['Does Reno Rise offer an emergency basement flooding service?', 'No. Reno Rise is not an emergency service. For active flooding, contact your insurer and an emergency plumber or restoration company, then come back to plan the repair.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Sump Pumps', 'services/sump-pump/'], ['Backwater Valves', 'services/backwater-valve/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Weeping Tile', 'services/weeping-tile/'], ['Waterproofing Before Renovation', 'blog/basement-waterproofing-before-renovation.html']],
    ctaHeading: 'Has Your Basement Flooded?',
  },

  // ---------------------------------------------------------------- 6 underpinning toronto
  {
    slug: 'underpinning',
    keyword: 'underpinning toronto',
    crumb: 'Underpinning',
    metaTitle: 'Underpinning Toronto: Basement Lowering Guide',
    description: 'Underpinning Toronto: when basement lowering is needed, the alternatives, what the permit involves and what drives cost. Request a basement assessment.',
    h1: 'Underpinning in Toronto: Lowering a Basement Floor',
    eyebrow: 'Toronto underpinning',
    sub: 'Lowering a basement floor is structural work, and often it is not needed at all. Measure first, then decide, then connect with qualified Toronto professionals for your project.',
    photo: CREDIT.joists,
    involvesHeading: 'How Underpinning Works',
    involvesLede: 'Underpinning extends a house&rsquo;s foundation downward, usually in short sections, so the basement floor can be lowered.',
    cards: [
      ['foundation', 'Measure the height', 'Ontario&rsquo;s second-unit guide describes about 1.95 metres (roughly 6 ft 5 in) for basements. Measure from finished floor to the underside of the ceiling finish.'],
      ['check', 'Consider alternatives', 'A bench footing lowers part of the floor with less disruption, and some basements already work without any lowering.'],
      ['plan', 'Engineering and permit', 'Toronto Building lists basement underpinning as work that needs a building permit. Expect engineered drawings and inspections.'],
      ['tool', 'Sequenced excavation', 'Work is done in planned sections beneath the existing foundation so the house stays supported.'],
      ['water', 'Drainage and waterproofing', 'New drainage, waterproofing and a new floor slab are part of the scope, not extras.'],
      ['home', 'Finishing afterwards', 'Plumbing, electrical and finishes follow once the structure is done.'],
    ],
    sections: [
      {
        h2: 'Choosing an Underpinning Contractor in Toronto',
        html: `<p>Searching for <strong>underpinning contractors in Toronto</strong> will show you a lot of options. Reno Rise does not vet or endorse them, so ask the questions that separate careful from careless.</p>
    ${list(['Have you measured the height and confirmed underpinning is needed, or would another approach work?', 'Who provides the engineering, and are stamped drawings included?', 'How will the work be sequenced to protect the house and neighbouring properties?', 'What is included for waterproofing, drainage and the floor slab, and what is excluded?', 'Who applies for the permit and books inspections?'])}`,
      },
      {
        h2: 'What Drives Underpinning Cost',
        cream: true,
        html: `<p>Reno Rise does not publish underpinning price ranges because they depend heavily on the property. The main drivers are:</p>
    ${list(['How much of the perimeter is underpinned and how far the floor is lowered.', 'Soil and groundwater conditions, and access for equipment and material.', 'Engineering, drawings and permit fees.', 'New drainage, waterproofing and a new floor slab.', 'Related work afterwards: plumbing, electrical and finishes.'])}
    <p>More in <a href="../../blog/basement-underpinning-cost-and-when-needed.html">Basement Underpinning in Toronto: When It Is Needed and What Drives Cost</a>.</p>`,
      },
    ],
    permit: c('underpinning').permit,
    ask: c('underpinning').ask,
    notFit: c('underpinning').notFit,
    areasHeading: 'Toronto Neighbourhoods',
    areasText: 'Underpinning questions come up in older homes across the city, including Etobicoke and Scarborough. Enquiries from elsewhere in the GTA are welcome too.',
    areas: TORONTO_AREAS,
    quotes: ['marco', 'reliance'],
    photos: [CREDIT.joists, CREDIT.windows, CREDIT.stairs],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform underpinning.',
    faq: [
      ['What is basement underpinning?', 'Underpinning extends a house&rsquo;s foundation downward, usually in short sections, so the basement floor can be lowered and ceiling height gained.'],
      ['When do I need to underpin my basement in Toronto?', 'Usually when the ceiling height is too low for the use you have in mind. Measure first, because some basements already work and cheaper alternatives may exist.'],
      ['Does underpinning need a permit in Toronto?', 'Yes. Toronto Building lists basement underpinning among the work that requires a building permit, and it typically involves engineered drawings and inspections.'],
      ['What is the difference between underpinning and basement lowering?', 'People use the terms loosely. Underpinning is one method of lowering a floor; a bench footing is another. Which fits depends on the house.'],
      ['How much does basement underpinning cost in Toronto?', 'It depends on the perimeter, depth, soil, access, engineering, drainage and permits. Reno Rise does not publish prices. Ask for itemized quotes and compare what each includes.'],
    ],
    formType: 'Underpinning or ceiling-height work',
    related: [['Bench Footing', 'services/bench-footing/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Basement Renovation', 'services/basement-renovation/'], ['Underpinning Guide', 'blog/basement-underpinning-cost-and-when-needed.html']],
    ctaHeading: 'Is Your Basement Too Low?',
  },

  // ---------------------------------------------------------------- 7 basement window replacement near me
  {
    slug: 'egress-windows',
    keyword: 'basement window replacement near me',
    crumb: 'Basement Windows & Egress',
    metaTitle: 'Basement Window Replacement & Egress Windows',
    description: 'Basement window replacement near me in Toronto: like-for-like swaps vs egress windows, wells, permits and what to ask before you hire. Request an assessment.',
    h1: 'Basement Window Replacement and Egress Windows in Toronto',
    eyebrow: 'Toronto basement windows',
    sub: 'Replacing a small basement window is one job. Cutting a larger egress opening for a bedroom or suite is another. Know which one you need, then connect with qualified Toronto professionals.',
    photo: CREDIT.windows,
    involvesHeading: 'Replacing a Basement Window vs. Adding an Egress Window',
    involvesLede: 'Daylight and a safe exit turn a cellar into a home. The two jobs are related, but not the same.',
    cards: [
      ['window', 'Like-for-like replacement', 'Swapping an existing window for a new one, sized to the current opening, and sealed against water and air.'],
      ['foundation', 'New or larger opening', 'An egress window usually means cutting the foundation wall, with structural care around lintels and pipes.'],
      ['water', 'The window well', 'A well outside the window with drainage, so it does not collect water against your foundation.'],
      ['check', 'A safe way out', 'Ontario&rsquo;s guide explains that escape windows can be required where exits pass through other units.'],
      ['plan', 'Permits', 'Toronto Building lists new windows and relocated openings among work that needs a permit.'],
      ['home', 'Finishing', 'Insulation, air sealing and interior finishing around the opening.'],
    ],
    sections: [
      {
        h2: 'Basement Window Cost: What Moves the Number',
        cream: true,
        html: `<p>People search for <strong>egress window installation price</strong> and <strong>basement egress window cost</strong> because the range is wide. Reno Rise does not publish prices, but here is what moves the total:</p>
    ${list(['Whether it is a like-for-like replacement or a new, larger opening.', 'What is in the wall: structure, lintels, pipes and wiring.', 'The window well, its drainage and any stairs or ladder.', 'Permits, drawings and inspections where required.', 'Interior finishing and air sealing.'])}`,
      },
      {
        h2: 'Finding Basement Window Installers in Toronto',
        html: `<p>Whether you are after <strong>basement window replacement near you</strong> or a full egress upgrade, ask the same basics before hiring.</p>
    ${list(['Will this window and well meet the Building Code for this room in this house?', 'How will the well drain, and what happens in heavy rain?', 'Who applies for the permit and arranges inspection?', 'What happens if the opening hits a structural element or a buried service?'])}`,
      },
    ],
    permit: c('egress-windows').permit,
    ask: c('egress-windows').ask,
    notFit: c('egress-windows').notFit,
    areas: TORONTO_AREAS,
    quotes: ['reliance', 'kaylyn'],
    photos: [CREDIT.windows, CREDIT.dining, CREDIT.stairs],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not install windows.',
    faq: [
      ['What is an egress window?', 'An egress window is large enough, and reachable enough, to be used as an emergency exit. In a basement it usually means an enlarged opening and a window well.'],
      ['Does a basement bedroom need an egress window?', 'Bedrooms need a safe way out, and Ontario&rsquo;s guide describes emergency escape windows for certain layouts. What applies depends on your design, so confirm with a designer and Toronto Building.'],
      ['Do I need a permit to replace or add a basement window in Toronto?', 'Toronto Building lists new windows and relocated openings among work that needs a permit. A like-for-like swap is different from cutting a new opening, so describe your exact work to the City.'],
      ['How much does a basement egress window cost?', 'It depends on the size of the opening, the wall, the window well, permits and finishing. Reno Rise does not publish prices. Get itemized quotes from more than one professional.'],
      ['How does a window well drain?', 'A window well is built with drainage so it does not collect water against the foundation. Ask each professional how theirs will drain in heavy rain.'],
    ],
    formType: 'Separate entrance or egress window',
    related: [['Basement Window Replacement', 'services/basement-window-replacement/'], ['Window Wells', 'services/window-well-installation/'], ['Walkouts & Entrances', 'services/walkout-construction/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Egress Windows Guide', 'blog/egress-windows-toronto-basements.html']],
    ctaHeading: 'Thinking About Basement Windows?',
  },

  // ---------------------------------------------------------------- 8 weeping tile cost
  {
    slug: 'weeping-tile',
    keyword: 'weeping tile cost',
    crumb: 'Weeping Tile',
    metaTitle: 'Weeping Tile Cost in Toronto: What Drives It',
    description: 'Weeping tile cost in Toronto: what drives the price of repair, cleaning and replacement, how to spot a failing drain and what to ask. Request an assessment.',
    h1: 'Weeping Tile in Toronto: Repair, Replacement and Cost',
    eyebrow: 'Toronto weeping tile',
    sub: 'Weeping tile is the drainage pipe around your foundation, and it does its job quietly until it does not. See what drives weeping tile cost and how repair and replacement work.',
    photo: CREDIT.trench,
    involvesHeading: 'How Weeping Tile Works and Fails',
    involvesLede: 'A perforated pipe around the footing collects groundwater and carries it away. When it clogs or collapses, the water has nowhere to go.',
    cards: [
      ['water', 'What it does', 'Weeping tile is a perforated drainage pipe around the foundation footing that collects groundwater and routes it to a sump or storm connection.'],
      ['check', 'Signs it is failing', 'Damp walls or floors after rain, water at the floor-wall joint, or a sump pump that runs constantly can point to a drainage problem.'],
      ['tool', 'Inspection and cleaning', 'A camera inspection can show whether the pipe is blocked, crushed or intact, and some blockages can be cleared.'],
      ['foundation', 'Replacement', 'Replacing weeping tile usually means excavating along the foundation, often as part of exterior waterproofing.'],
      ['plan', 'Where it drains', 'The pipe connects to a sump pit or a permitted discharge point. That connection matters as much as the pipe.'],
      ['home', 'Restoration', 'Backfill, grading and landscaping or hard-surface restoration are part of the job.'],
    ],
    sections: [
      {
        h2: 'What Drives Weeping Tile Cost',
        cream: true,
        html: `<p>Anyone searching for <strong>weeping tile replacement cost</strong> will find wide ranges and few explanations. Reno Rise does not publish prices because the total depends on the house. These are the drivers:</p>
    ${list(['How much of the perimeter needs work, and how deep the footing is.', 'Access: decks, patios, driveways, walkways, landscaping and neighbouring structures.', 'Soil and groundwater conditions.', 'Whether cleaning or repair is enough, or full replacement is needed.', 'The connection to a sump pit or discharge point.', 'Restoration of surfaces after digging, and any permits.'])}
    <p>Get itemized quotes and compare what each includes, including who restores the landscaping.</p>`,
      },
    ],
    permit: 'Excavation and drainage work can involve municipal requirements and may sit alongside other structural or waterproofing work. Confirm your exact scope with Toronto Building before starting.',
    ask: ['How was the weeping tile inspected, and what did you find?', 'Is cleaning or repair enough, or is replacement needed?', 'Where will the new drain connect, and is that permitted?', 'Who restores the surfaces, and what is warranted, in writing?'],
    notFit: 'If access is limited or the problem is a single crack or a grading issue, a smaller fix may work. See waterproofing options before committing to excavation.',
    areas: TORONTO_AREAS,
    quotes: ['reliance', 'kaylyn'],
    photos: [CREDIT.trench, CREDIT.water, CREDIT.crack],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform weeping tile work.',
    faq: [
      ['What is weeping tile?', 'Weeping tile is a perforated drainage pipe around a foundation footing that collects groundwater and carries it away from the house.'],
      ['How do I know if my weeping tile is clogged?', 'Possible signs include dampness or water at the floor-wall joint after rain and a sump pump that runs constantly. A camera inspection can confirm what is happening.'],
      ['Can weeping tile be cleaned or repaired instead of replaced?', 'Sometimes. A blocked pipe may be cleared, and a localized break may be repaired. Widespread collapse usually means replacement. A professional can advise after inspecting it.'],
      ['How much does weeping tile replacement cost?', 'It depends on the length, depth, access, soil, the drain connection and restoration. Reno Rise does not publish prices. Get itemized quotes.'],
      ['Do I need a permit to replace weeping tile?', 'It depends on the scope and where the pipe drains. Excavation and drainage changes can need approval, so confirm with the City.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Sump Pumps', 'services/sump-pump/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Waterproofing Guide', 'services/basement-waterproofing/']],
    ctaHeading: 'Is Your Basement Drain Failing?',
  },

  // ---------------------------------------------------------------- 9 interior waterproofing toronto
  {
    slug: 'interior-waterproofing',
    keyword: 'interior waterproofing toronto',
    crumb: 'Interior Waterproofing',
    metaTitle: 'Interior Waterproofing Toronto: How It Works',
    description: 'Interior waterproofing Toronto: how drainage channels, sump pits and vapour control work, when it fits and what to ask. Request a basement assessment.',
    h1: 'Interior Waterproofing in Toronto',
    eyebrow: 'Toronto interior waterproofing',
    sub: 'Interior drainage systems manage water that has already reached your foundation. See how they work and where they fall short, then connect with qualified Toronto professionals.',
    photo: CREDIT.water,
    involvesHeading: 'How Interior Waterproofing Works',
    involvesLede: 'It manages water rather than stopping it at the source. That distinction is worth understanding before you compare quotes.',
    cards: [
      ['check', 'Assess the entry point', 'Water may enter through the wall, the floor-wall joint, a crack or all three. That decides the system.'],
      ['water', 'Drainage channel', 'A channel along the interior perimeter of the footing collects water before it reaches the floor.'],
      ['tool', 'Sump pit and pump', 'The channel connects to a sump pit, and a pump sends water outside, away from the house.'],
      ['foundation', 'Wall-face membrane', 'Dimple board or a membrane on the wall directs seepage down into the drain, and the floor-wall joint is sealed.'],
      ['plan', 'Backup', 'A battery backup keeps the pump running in a power outage.'],
      ['home', 'Testing', 'A good installer tests the system before the area is closed up and finished.'],
    ],
    sections: [
      {
        h2: 'When Interior Waterproofing Fits, and When It Does Not',
        html: `<p>Interior waterproofing is often chosen when excavating outside is impractical: mature landscaping, an attached garage, a shared wall, or a deck over the problem area. It is less suited when the real issue is a single wall crack or grading that pushes water at the house. In those cases <a href="../foundation-crack-repair/">crack repair</a> or <a href="../exterior-waterproofing/">exterior waterproofing</a> may fit better.</p>`,
      },
    ],
    permit: c('interior-waterproofing').permit,
    ask: c('interior-waterproofing').ask,
    notFit: c('interior-waterproofing').notFit,
    areas: TORONTO_AREAS,
    quotes: ['kaylyn', 'reliance'],
    photos: [CREDIT.water, CREDIT.joists, CREDIT.crack],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform waterproofing.',
    faq: c('interior-waterproofing').faq.concat([
      ['How much does interior waterproofing cost in Toronto?', 'It scales with how much of the perimeter needs a system, whether a pit and pump exist, and access. Reno Rise does not publish prices. Get itemized quotes and compare what each includes.'],
    ]),
    formType: 'Waterproofing or moisture issue',
    related: [['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Sump Pumps', 'services/sump-pump/'], ['Weeping Tile', 'services/weeping-tile/'], ['Waterproofing Guide', 'services/basement-waterproofing/']],
    ctaHeading: 'Need Interior Waterproofing?',
  },

  // ---------------------------------------------------------------- 10 exterior waterproofing toronto
  {
    slug: 'exterior-waterproofing',
    keyword: 'exterior waterproofing toronto',
    crumb: 'Exterior Waterproofing',
    metaTitle: 'Exterior Waterproofing Toronto: How It Works',
    description: 'Exterior waterproofing Toronto: excavation, membrane and drainage explained, when it fits and what to ask before you hire. Request a basement assessment.',
    h1: 'Exterior Waterproofing in Toronto',
    eyebrow: 'Toronto exterior waterproofing',
    sub: 'Working from the outside addresses water at the source. Understand the process, the disruption and the questions to ask, then connect with qualified Toronto professionals.',
    photo: CREDIT.trench,
    involvesHeading: 'How Exterior Waterproofing Works',
    involvesLede: 'It is more disruptive than interior work because of the digging, but it keeps water away from the wall.',
    cards: [
      ['foundation', 'Excavation', 'The soil is dug away to expose the foundation wall down to the footing.'],
      ['tool', 'Wall repair', 'Cracks are repaired and the wall is cleaned and prepared.'],
      ['water', 'Waterproofing membrane', 'A membrane and drainage board are applied to the exterior of the wall to keep water out.'],
      ['check', 'Drainage', 'New or replaced weeping tile carries groundwater away, and grading is restored so water drains away from the house.'],
      ['plan', 'Access and site', 'Decks, patios, walkways, landscaping and neighbouring structures affect feasibility and cost.'],
      ['home', 'Restoration', 'Backfill, grading and surface restoration finish the job.'],
    ],
    sections: [
      {
        h2: 'Is Exterior Waterproofing the Right Fit?',
        html: `<p>It suits cases where water is pressing against the wall and access allows digging. If access is limited or the problem is a single crack, <a href="../interior-waterproofing/">interior waterproofing</a> or <a href="../foundation-crack-repair/">crack repair</a> may be more practical. Ask any professional why exterior work is needed rather than a smaller fix, and how landscaping, patios or decks will be handled.</p>`,
      },
    ],
    permit: c('exterior-waterproofing').permit,
    ask: c('exterior-waterproofing').ask,
    notFit: c('exterior-waterproofing').notFit,
    areas: TORONTO_AREAS,
    quotes: ['reliance', 'kaylyn'],
    photos: [CREDIT.trench, CREDIT.crack, CREDIT.water],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not perform waterproofing.',
    faq: c('exterior-waterproofing').faq.concat([
      ['What is a waterproofing membrane?', 'A membrane is a waterproof layer applied to the outside of the foundation wall, often with drainage board, to keep water from reaching the wall.'],
      ['How much does exterior waterproofing cost in Toronto?', 'It depends on the length and depth of wall, access, restoration, drainage and permits. Reno Rise does not publish prices. Get itemized quotes and compare what each includes.'],
    ]),
    formType: 'Waterproofing or moisture issue',
    related: [['Interior Waterproofing', 'services/interior-waterproofing/'], ['Weeping Tile', 'services/weeping-tile/'], ['Foundation Crack Repair', 'services/foundation-crack-repair/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Waterproofing Guide', 'services/basement-waterproofing/']],
    ctaHeading: 'Need to Stop Water at the Wall?',
  },

  // ---------------------------------------------------------------- 11 backwater valve cost
  {
    slug: 'backwater-valve',
    keyword: 'backwater valve cost',
    crumb: 'Backwater Valves',
    metaTitle: 'Backwater Valve Cost Toronto: Permit & Subsidy',
    description: 'Backwater valve cost in Toronto: what drives the price, the drain permit, the City subsidy and what to ask before you hire. Request a basement assessment.',
    h1: 'Backwater Valve Cost and Installation in Toronto',
    eyebrow: 'Toronto backwater valves',
    sub: 'A backwater valve helps stop sewage flowing back into your basement in a severe storm. See what drives backwater valve cost, what the City requires and what help exists.',
    photo: CREDIT.valve,
    involvesHeading: 'What a Backwater Valve Does',
    involvesLede: 'During severe storms, sewers can back up. The valve closes so sewage cannot flow back into the house.',
    cards: [
      ['check', 'Sewer backup protection', 'The valve sits in the sewer line and closes when flow reverses.'],
      ['plan', 'Drain permit', 'Toronto requires a standalone drain permit. The City says no plans are required for one- and two-unit houses.'],
      ['tool', 'Approved valve types', 'The City restricts which valve types are allowed in a building drain or sewer. Your installer should know the rules.'],
      ['foundation', 'Installation', 'Installing one usually means opening the floor or an exterior excavation to reach the line, then restoring the surface.'],
      ['water', 'Maintenance', 'Valves need periodic checking so they work when a storm arrives. Ask the installer what upkeep is needed.'],
      ['home', 'Part of a system', 'A sump pump, downspout disconnection and grading work alongside a backwater valve.'],
    ],
    sections: [
      {
        h2: 'What Drives Backwater Valve Cost',
        cream: true,
        html: `<p>Reno Rise does not publish prices, because they depend on the house. The drivers are:</p>
    ${list(['Where the sewer line enters the house and how hard it is to reach.', 'Whether the floor must be opened or an outside excavation is needed.', 'The valve type and how many are needed (some homes have more than one connection).', 'The permit and the City inspection before the valve is enclosed.', 'Restoration of the floor or landscaping afterwards.'])}
    <p>Compare itemized quotes, and check whether the subsidy below applies before you decide.</p>`,
      },
      {
        h2: 'Toronto Permit and Subsidy for Backwater Valves',
        html: `<p>The City&rsquo;s ${X(VALVE_URL, 'backwater valve guidance')} (updated July 14, 2026) says a standalone drain permit is required, with no plans required for one- and two-unit houses. The subsidy program adds the following (reviewed September 2026):</p>
    ${subsidyFacts}
    ${SUBSIDY_NOTE}`,
      },
    ],
    permit: `A standalone drain permit is required in Toronto, applied for through Toronto Building Online Services, and the City inspects before the valve is enclosed. Confirm current steps and fees with the City.`,
    ask: ['Do you hold a valid Toronto business licence, and can you pull the permit?', 'Which valve type is proposed, and does it meet the City rules?', 'How will the floor or yard be restored?', 'Can you help with the subsidy paperwork, and what does the warranty cover?'],
    notFit: 'A backwater valve addresses sewer backup, not groundwater seepage. If water comes through walls or floors, look at waterproofing and sump pump options as well.',
    areas: TORONTO_AREAS,
    quotes: ['kaylyn', 'reliance'],
    photos: [CREDIT.valve, CREDIT.water, CREDIT.trench],
    photoNote: 'Stock photos from Pexels, shown for reference only. They are not Reno Rise projects, and Reno Rise does not install valves.',
    faq: [
      ['How much does a backwater valve cost in Toronto?', 'It depends on access, the valve type, the number of valves, the permit and restoration. Reno Rise does not publish prices. The City subsidy lists up to $1,600 per device (80% of eligible cost), maximum two devices. Get itemized quotes.'],
      ['Do I need a permit to install a backwater valve in Toronto?', 'Yes. The City requires a standalone drain permit, with no plans required for one- and two-unit houses, and inspects before the valve is enclosed.'],
      ['Is there a subsidy for backwater valves in Toronto?', 'Toronto runs a Basement Flooding Protection Subsidy Program with conditions, including disconnected downspouts and a contractor with a valid Toronto business licence. Confirm current terms with the City.'],
      ['Do I need a backwater valve?', 'It depends on your home and sewer connection. A backwater valve helps against sewer backup during severe storms. A licensed plumber or the City can advise.'],
    ],
    formType: 'Waterproofing or moisture issue',
    related: [['Sump Pumps', 'services/sump-pump/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Waterproofing Guide', 'services/basement-waterproofing/']],
    ctaHeading: 'Protecting Your Home From Sewer Backup?',
  },
];

module.exports = { LANDINGS };
