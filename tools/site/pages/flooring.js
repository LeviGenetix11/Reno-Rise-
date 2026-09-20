// Generates the one commercial basement-flooring page: /services/basement-flooring/
//
// Positioning: basement flooring SUPPORTS the basement renovation / finishing / legal-suite focus. It is not a general
// flooring page (that stays at /services/flooring/ under "Other home improvement services") and there are deliberately no
// pages per material. Reno Rise does not install flooring: it is an independent project-enquiry and matching service.
//
// Rules for this content: no prices or cost ranges, no invented projects, reviews or credentials, no claim that any product
// is waterproof, and technical statements about wood, moisture and testing are attributed to the NWFA, ASTM or Health Canada
// (links below). Everything else is general planning information that defers to the manufacturer and to the professional.
'use strict';
const L = require('../lib');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 2;
const h = (t) => L.href(depth, t);
const A = (t, label) => `<a href="${h(t)}">${label}</a>`;
const X = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

const SRC = {
  nwfa: 'https://nwfa.org/wp-content/uploads/2026/02/NWFA-Installation-Guidelines.pdf',
  nwfaConcrete: 'https://nwfa.org/wp-content/uploads/2020/03/Concrete-Subfloors_Updated.pdf',
  astm: 'https://www.astm.org/Standards/F2170.htm',
  hcMould: 'https://www.canada.ca/en/health-canada/services/publications/healthy-living/addressing-moisture-mould-your-home.html',
  hcHumidity: 'https://www.canada.ca/en/health-canada/services/air-quality/indoor-air-contaminants/reduce-humidity-moisture-mould.html',
  permit: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/when-do-i-need-a-building-permit/',
};

const RENO = A('services/basement-renovation/', 'basement renovation');
const FINISH = A('services/basement-finishing/', 'basement finishing');
const WATERPROOF = A('services/basement-waterproofing/', 'basement waterproofing');
const INTERIOR = A('services/interior-waterproofing/', 'interior waterproofing');
const WET = A('services/wet-basement-repair/', 'wet basement repair');
const CRACK = A('services/foundation-crack-repair/', 'foundation crack repair');
const SUITE = A('services/legal-basement-apartment-toronto/', 'legal secondary suite guide');
const G_BEST = A('blog/best-flooring-for-basement-toronto.html', 'Best Flooring for a Basement in Toronto');
const G_SUB = A('blog/do-you-need-a-subfloor-in-a-finished-basement.html', 'Do You Need a Subfloor in a Finished Basement?');
const G_VINYL = A('blog/vinyl-plank-vs-carpet-basement.html', 'Vinyl Plank vs. Carpet for a Basement');
const G_WOOD = A('blog/hardwood-flooring-in-basement.html', 'Can You Install Hardwood Flooring in a Basement?');

const FAQ = [
  ['Does basement flooring need a subfloor?', `Often a subfloor system is used between the concrete slab and the finished floor, to add a moisture-separation layer, some warmth and a flatter base. Whether one is needed depends on the flooring product, the condition of the slab, how dry the basement is and how much ceiling height there is to spare. The manufacturer's installation instructions decide what is required. The guide ${G_SUB} goes through the common system types.`],
  ['Can you put hardwood flooring in a basement?', `Solid hardwood is generally not recommended below grade: the National Wood Flooring Association says solid wood floors should not be installed below grade unless the manufacturer recommends it. Some engineered hardwood products are approved for below-grade use over concrete, with conditions such as moisture testing and a vapour retarder. See ${G_WOOD} for the difference.`],
  ['Is waterproof vinyl plank really waterproof?', `The label usually describes the plank itself. How the whole floor behaves depends on the seams and edges, the underlayment, moisture coming through the slab and the manufacturer's warranty terms for below-grade use. A waterproof floor covering does not stop water entering a basement, and it does not replace fixing the source.`],
  ['Do I need a building permit to replace basement flooring in Toronto?', `Toronto Building says finishing work that changes nothing structural, adds no new plumbing and creates no additional dwelling unit may not need a permit. Work around the floor might, for example structural changes, new plumbing or heating work, or creating a second unit. Check your exact scope with ${X(SRC.permit, 'Toronto Building')} and the professional doing the work.`],
  ['How much does basement flooring cost in Toronto?', `It depends on the material, the size of the area, how much slab preparation and levelling is needed, whether a subfloor system is used, any moisture work, removal of old flooring and trim. Reno Rise does not publish price ranges it cannot verify. Ask for itemized quotes that show preparation separately from materials and labour.`],
  ['Does Reno Rise install basement flooring?', `No. Reno Rise is an independent project-enquiry and contractor-matching service. Installation, estimates, contracts and warranties are provided by the independent professional you choose. Where there is a suitable fit, Reno Rise may introduce you to one, but a match, an estimate or an appointment is not guaranteed.`],
];

const body = `
    ${U.notice(`<p><strong>General planning information.</strong> Reno Rise does not install flooring. It is an independent project-enquiry and contractor-matching service, so the choice of material, the installation and the warranty belong to the independent professional you hire. Nothing here confirms that a product suits your basement; the manufacturer's instructions and a professional's assessment do that.</p>`)}

    <p>Flooring a basement is a different job from flooring the main floor. The floor is usually a concrete slab in contact with the ground, and that changes what will last, what feels comfortable and what has to happen before a single plank or tile goes down. Get the order right and the floor tends to look after itself. Get it wrong and the prettiest material in the showroom can turn into a repair.</p>
    <p>This page compares the main options for Toronto basements, explains what to check first and lists questions worth asking. It is written for homeowners planning ${FINISH}, a wider ${RENO}, or a space that may later become a ${SUITE}.</p>

    <h2 id="why-different">Why Basement Flooring Needs Different Planning</h2>
    <p>A slab-on-ground floor is cooler than the rest of the house, can hold and pass moisture vapour, and is rarely perfectly flat. Ceiling height is also tight in many older Toronto basements, so every layer added on top of the slab comes out of the room's height.</p>
    ${U.checkList([
      'Moisture comes from below and from the room&rsquo;s own humidity, not only from leaks.',
      'The slab may be uneven, cracked or patched, and different floors tolerate that differently.',
      'Each layer of subfloor and flooring takes ceiling height, which matters most for a bedroom or a secondary suite.',
      'Drains, cleanouts, sump pits and floor-mounted equipment usually need to stay accessible.',
      'Manufacturers set their own conditions for below-grade installation, and those conditions can differ from product to product.',
    ])}
    <p>That is why the sensible order is moisture first, then the slab, then any subfloor, then the finished floor. Flooring normally comes near the end of a basement project, after walls, electrical and plumbing rough-ins are done.</p>

    <h2 id="moisture">Check for Moisture Before Choosing a Floor</h2>
    <p>The most useful first step is to find out whether the basement is dry and to deal with any source of water. A floor covering can hide a moisture problem for a while; it does not solve one. If water enters after heavy rain or snowmelt, start with ${WATERPROOF} or ${WET}. If a drainage system is being considered, see ${INTERIOR}. Read ${A('blog/basement-waterproofing-before-renovation.html', 'why waterproofing comes before renovation')} for the reasoning.</p>
    <p>Signs worth writing down before you talk to anyone:</p>
    ${U.checkList([
      'Damp or dark patches on the slab, especially after rain or in spring.',
      'White, chalky mineral deposits on concrete or block (efflorescence).',
      'A musty smell, or condensation on cold surfaces in summer.',
      'Water marks at the base of walls, or a history of flooding.',
      'A dehumidifier that runs constantly to keep the space comfortable.',
    ])}
    <p>Professionals commonly test the slab before installing. ${X(SRC.astm, 'ASTM F2170')} describes one widely used method, in-slab relative-humidity probes, and notes that flooring manufacturers generally require moisture testing before installation on concrete and that a result describes the slab only at the time and place tested. Ask which test will be used, where, how many locations, what limit the chosen product allows and whether you can see the result.</p>
    <p>Day-to-day humidity matters too. Health Canada advises keeping indoor relative humidity between 30% and 50% and using a dehumidifier where needed (${X(SRC.hcHumidity, 'Health Canada')}).</p>

    <h2 id="concrete">Concrete Condition and Floor Levelling</h2>
    <p>A professional will look at the slab itself before recommending a floor. Things that matter:</p>
    ${U.checkList([
      'High and low spots. Most click-together and glue-down products publish a flatness limit, and tile installers work to their own tolerances.',
      'Cracks. Fine hairline shrinkage cracks are common; a crack that is growing, offset or leaking is a foundation question first (see ' + CRACK + ').',
      'Old adhesive, paint, sealer or patching that could stop new materials bonding.',
      'Whether the slab has been repaired, replaced or lowered, for example after underpinning, and how long it has had to dry.',
    ])}
    <p>Floor levelling usually means patching, grinding high areas or applying a self-levelling compound. It adds thickness and needs cure time, so ask which product is proposed, how long it must dry and whether it is compatible with the flooring or adhesive you chose.</p>

    <h2 id="subfloor">Subfloor and Insulation Considerations</h2>
    <p>A subfloor system sits between the slab and the finished floor. Approaches you may hear about for basement subfloor installation include:</p>
    ${U.checkList([
      'Dimpled or studded membrane panels that create a small air gap and a break between concrete and flooring.',
      'Engineered subfloor panels, a moisture-resistant layer bonded to OSB or plywood, laid as a floating base.',
      'Plywood or OSB over a polyethylene vapour retarder, sometimes on sleepers and sometimes with rigid foam insulation between.',
      'No subfloor at all: some floating floors and tile are installed directly on a prepared slab, with an approved underlayment or membrane.',
    ])}
    <p>An insulated basement subfloor can make a floor feel warmer and more cushioned and can help hide minor unevenness. The trade-offs are height, cost and the fact that it cannot make a wet slab acceptable. It also has to suit the finish floor: for wood flooring over concrete, the NWFA strongly recommends a vapour-retarding membrane and says to follow the flooring and adhesive manufacturer on substrate preparation and moisture limits (${X(SRC.nwfaConcrete, 'NWFA concrete subfloor guidance')}).</p>
    <p>If you are planning a suite, ceiling height is a key requirement, so measure finished floor to finished ceiling before choosing a system. The ${SUITE} explains what to confirm with Toronto Building. For a fuller walk-through of system types, read ${G_SUB}</p>

    <h2 id="options">Basement Flooring Options</h2>
    <p>There is no single best basement floor. Each option below has a place. Which one suits you depends on how dry the slab is, how the room will be used, how much ceiling height you can spare and what the manufacturer allows below grade. For a plain-language overview, see ${G_BEST}</p>

    <h3>Luxury vinyl plank</h3>
    <p>Luxury vinyl plank (LVP) is a layered synthetic plank, sold as click-together floating floors or as glue-down planks. Because the plank does not absorb water the way wood does, vinyl plank basement flooring is a common choice for family rooms, hallways and rental-style spaces. It is firm underfoot, so an underlayment or subfloor system is often used for comfort and sound.</p>
    <p><strong>Watch for:</strong> it copies the slab's flatness problems, seams and edges can still let water reach the slab, and &ldquo;waterproof&rdquo; usually describes the plank, not the whole floor system. Some products and adhesives also have slab-moisture limits. Read the manufacturer's installation and warranty terms for below-grade use. See ${G_VINYL} for a comparison with carpet.</p>

    <h3>Waterproof laminate</h3>
    <p>Laminate has a fibreboard-type core under a printed wear surface. &ldquo;Waterproof&rdquo; laminates use treated cores and sealed locking edges, but manufacturers describe their limits differently: some cover spills for a stated time only, and some exclude below-grade installation or standing water. It suits a dry, stable basement where a hard-surface look and moderate installation effort are wanted.</p>
    <p><strong>Watch for:</strong> swelling at edges and seams if water sits, noise without underlayment, and warranty exclusions. Confirm the exact wording for your product before relying on the word &ldquo;waterproof&rdquo;.</p>

    <h3>Engineered hardwood</h3>
    <p>Engineered hardwood has a real-wood wear layer bonded to a plywood or fibreboard core, designed to move less with humidity than a solid plank. Solid hardwood is a single piece of wood milled from board thickness. The difference is why the two are treated differently below grade: the NWFA says solid wood floors should not be installed below grade unless the manufacturer recommends it (${X(SRC.nwfa, 'NWFA installation guidelines')}). Some engineered products are approved for below-grade use over concrete, with conditions such as slab moisture testing, a vapour retarder, acclimation and humidity control.</p>
    <p><strong>Watch for:</strong> the manufacturer must expressly approve the product below grade, humidity swings still matter, and the thickness of the wear layer limits future refinishing. An engineered hardwood basement floor is a decision for a dry, well-managed space, not a default. More in ${G_WOOD}</p>

    <h3>Porcelain or ceramic tile</h3>
    <p>Tile does not absorb water like wood and copes well with occasional wetting, so tile flooring for basements is often used in bathrooms, laundry rooms, entries and utility areas. It is durable and easy to clean.</p>
    <p><strong>Watch for:</strong> it is hard and cool underfoot, it needs a flat, stable slab, cracks in the concrete can telegraph through, grout needs sealing and cleaning, and a membrane or uncoupling layer may be specified. Preparation is often the larger part of the job.</p>

    <h3>Carpet</h3>
    <p>Broadloom carpet with a pad is the warmest and quietest option underfoot and is popular for bedrooms and media rooms. Basement carpet installation also carries the highest moisture sensitivity of the options here: carpet and pad can hold water and support mould if they get damp. Health Canada's guide to moisture and mould suggests you advises to &ldquo;consider removing any carpets from the basement floor&rdquo;ldquo;consider removing any carpets from the basement flooradvises to &ldquo;consider removing any carpets from the basement floor&rdquo;rdquo; (${X(SRC.hcMould, 'Health Canada')}).</p>
    <p><strong>Watch for:</strong> carpet suits only a basement that has been shown to stay dry, with humidity kept in check. Follow the manufacturer's guidance on underlay and installation over concrete.</p>

    <h3>Carpet tiles</h3>
    <p>Carpet tiles are modular squares that can be lifted and replaced one at a time. They are often used in home offices, playrooms and gyms, where a stained or worn area means swapping a few tiles rather than a whole room.</p>
    <p><strong>Watch for:</strong> the backing can still trap moisture, and tiles do not cure a damp slab. They are easier to replace, not more tolerant of water in any dependable way.</p>

    <h3>Insulated subfloor systems</h3>
    <p>These are a base layer rather than a finished surface, used under one of the finishes above (see the subfloor section). They are worth discussing when the floor is cold, the slab is slightly uneven or cushioning is wanted.</p>
    <p><strong>Watch for:</strong> added height, added cost, compatibility with the finish floor, and the fact that they manage conditions rather than stop water entering the basement.</p>

    <h2 id="compare">Basement Flooring Compared</h2>
    <p>The table below gives general descriptions to help you frame questions. They are not test results, and individual products vary, so use them alongside the manufacturer's specifications.</p>
    <p class="table-hint">On a narrow screen, scroll the table sideways to see every column.</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Basement flooring comparison table">
    <table class="compare-table compare-wide">
      <caption>Basement flooring options compared: general descriptions, not test results</caption>
      <thead><tr><th scope="col">Flooring type</th><th scope="col">Moisture tolerance</th><th scope="col">Comfort</th><th scope="col">Maintenance</th><th scope="col">Relative installation complexity</th><th scope="col">Common basement applications</th><th scope="col">Important limitation</th></tr></thead>
      <tbody>
        <tr><th scope="row">Luxury vinyl plank</th><td>Moderate to high for the plank itself; seams and slab moisture still matter</td><td>Moderate; firm and cool without an underlayment or subfloor</td><td>Low</td><td>Low to moderate</td><td>Family rooms, hallways, rental-style spaces</td><td>Needs a flat slab; &ldquo;waterproof&rdquo; rarely covers the whole system</td></tr>
        <tr><th scope="row">Waterproof laminate</th><td>Moderate; varies by product and by manufacturer wording</td><td>Moderate</td><td>Low</td><td>Low to moderate</td><td>Dry, stable basements wanting a hard-surface look</td><td>Edges and seams can swell if water sits; some warranties exclude below grade</td></tr>
        <tr><th scope="row">Engineered hardwood</th><td>Low to moderate; better than solid wood but still wood</td><td>Moderate to high</td><td>Moderate</td><td>Moderate to high</td><td>Finished, dry family rooms where the manufacturer approves below grade</td><td>Requires manufacturer approval, moisture testing and humidity control</td></tr>
        <tr><th scope="row">Porcelain or ceramic tile</th><td>High for the tile; grout and the base beneath matter</td><td>Low to moderate; hard and cool</td><td>Low to moderate (grout)</td><td>High</td><td>Bathrooms, laundry rooms, entries, utility areas</td><td>Needs a flat, stable slab; cracks can telegraph through</td></tr>
        <tr><th scope="row">Carpet</th><td>Low</td><td>High</td><td>Moderate to high</td><td>Low to moderate</td><td>Bedrooms and media rooms in basements shown to stay dry</td><td>Holds moisture; Health Canada advises considering removal from basement floors</td></tr>
        <tr><th scope="row">Carpet tiles</th><td>Low to moderate</td><td>Moderate to high</td><td>Low to moderate; individual tiles can be replaced</td><td>Low</td><td>Home offices, playrooms, gyms</td><td>Backing can trap moisture; not a fix for a damp slab</td></tr>
        <tr><th scope="row">Insulated subfloor system</th><td>Varies by system; designed to separate the floor from the slab, not to stop water entry</td><td>Improves warmth and cushioning underfoot</td><td>Low (hidden layer)</td><td>Moderate</td><td>Under vinyl, laminate or engineered flooring</td><td>Adds height; must suit the finish floor; does not fix leaks</td></tr>
      </tbody>
    </table>
    </div>

    <h2 id="process">How Basement Flooring Installation Typically Works</h2>
    <p>The steps below are an overview of what an independent professional typically does. The details depend on the product, the slab and the scope.</p>
    <ol class="steps">
      <li><strong>Assess moisture and the slab.</strong> Note past leaks, check humidity and, where the product requires it, test the slab.</li>
      <li><strong>Fix the source of water first.</strong> Drainage, cracks and grading come before any finish.</li>
      <li><strong>Prepare the slab.</strong> Clean, repair, grind or level, and allow products to cure.</li>
      <li><strong>Install a moisture barrier or subfloor system if specified.</strong> Follow the flooring manufacturer's requirements for the base.</li>
      <li><strong>Plan the layout.</strong> Allow for expansion gaps, transitions, stairs, drains and access panels.</li>
      <li><strong>Install the flooring.</strong> Floating, glue-down or tile setting, with any acclimation the product needs.</li>
      <li><strong>Finish the details.</strong> Baseboards, thresholds, stair edges and cleaning.</li>
      <li><strong>Review care and warranty terms.</strong> Get the maintenance instructions and what the warranty covers, in writing.</li>
    </ol>

    <h2 id="questions">Questions to Ask a Flooring Professional</h2>
    ${U.checkList([
      'How will you check that this basement is dry enough for the flooring you are proposing, and can I see the results?',
      'Does the manufacturer approve this product below grade, and does the warranty apply to a basement slab? Can I see the wording?',
      'How will the slab be prepared and levelled, and what is included in that price?',
      'Is a subfloor or vapour retarder needed for this product, and how much ceiling height will it use?',
      'What happens if the moisture test fails or a problem shows up once the old floor is removed?',
      'How will drains, cleanouts, the sump pit and equipment stay accessible?',
      'Who removes the old flooring, and who is responsible for disposal?',
      'Does the quote itemize preparation, materials, labour and trim separately?',
      'What care does the floor need, and what would void the warranty?',
      'Which parts of the work, if any, need a permit, and who applies for it?',
    ])}
    <p>Before you hire, confirm credentials, insurance, references and who is responsible for permits. Reno Rise cannot vouch for any professional on your behalf.</p>

    ${U.stockGallery(depth, [
      ['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels'],
      ['finished-basement-sofa-room', 'Finished basement sitting room with a leather sofa and bright windows', 'Photo: Michael Gault Photos on Pexels'],
      ['unfinished-basement-block-walls-joists', 'Unfinished basement with block walls and exposed floor joists', 'Photo: Curtis Adams on Pexels'],
    ], { heading: 'Basement Rooms for Reference', note: 'Illustrative stock photos from Pexels. They show basement spaces in general and are not Reno Rise projects; Reno Rise does not install flooring.' })}

    <p class="sources-note"><strong>Sources:</strong> ${X(SRC.nwfa, 'NWFA wood flooring installation guidelines')}; ${X(SRC.nwfaConcrete, 'NWFA: solid and engineered wood over concrete subfloors')}; ${X(SRC.astm, 'ASTM F2170, in-slab relative humidity testing')}; ${X(SRC.hcMould, 'Health Canada: guide to addressing moisture and mould indoors')}; ${X(SRC.hcHumidity, 'Health Canada: reducing humidity, moisture and mould')}. Product and warranty terms vary; the manufacturer's instructions apply.</p>
    <p class="sources-note">Flooring for the rest of the house? The general ${A('services/flooring/', 'flooring information page')} covers other rooms; this page is only about below-grade floors.</p>
`;

guidePage({
  depth,
  path: 'services/basement-flooring/',
  title: 'Basement Flooring Installation Toronto | Reno Rise',
  description: 'Compare basement flooring options for Toronto homes: vinyl plank, engineered wood, tile, carpet and insulated subfloors. Tell Reno Rise about your project.',
  h1: 'Basement Flooring Installation in Toronto',
  sub: 'Moisture, concrete and ceiling height change the flooring decision below grade. Compare the options, then connect with independent professionals.',
  crumbs: [['Home', ''], ['Services', 'services/'], ['Basement Flooring', '']],
  active: 'services',
  body,
  faq: FAQ,
  formType: 'Basement flooring',
  formTitle: 'Tell Us About Your Basement Flooring Project',
  formText: 'Tell Reno Rise about your basement and what you are planning for the floor. Reno Rise reviews the details and, where there is a suitable fit, may connect you with an independent professional. This does not confirm an appointment, a quote, product suitability or a match.',
  updated: 'Last reviewed September 2026. General planning information, not engineering advice; confirm requirements for your property with Toronto Building and the professionals responsible for your project.',
  asideLinks: [
    ['Basement renovation planning', 'services/basement-renovation/'],
    ['Basement finishing', 'services/basement-finishing/'],
    ['Basement waterproofing', 'services/basement-waterproofing/'],
    ['Do you need a subfloor?', 'blog/do-you-need-a-subfloor-in-a-finished-basement.html'],
    ['Best flooring for a basement', 'blog/best-flooring-for-basement-toronto.html'],
  ],
  related: [
    ['Basement Renovation', 'services/basement-renovation/'],
    ['Basement Finishing', 'services/basement-finishing/'],
    ['Basement Waterproofing', 'services/basement-waterproofing/'],
    ['Interior Waterproofing', 'services/interior-waterproofing/'],
    ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'],
    ['Flooring guides in the Planning Centre', 'blog/'],
  ],
  after: L.disclosure(),
});
