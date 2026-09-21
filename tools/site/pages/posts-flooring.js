// Basement-flooring guides for the Basement Planning Centre (four articles, no more). Appended to POSTS in posts.js.
//
// Each answers one distinct homeowner question and links to the single commercial page, /services/basement-flooring/.
// Reno Rise does not install flooring: the guides help a homeowner decide what to ask. No prices or cost ranges, no invented
// projects or credentials, and technical statements about wood, moisture and testing cite the NWFA, ASTM or Health Canada.
// "Picture a household..." scenarios are hypothetical and say so.
'use strict';
const L = require('../lib');
const U = require('./util');

const depth = 1;
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
  ontario: 'https://www.ontario.ca/page/add-second-unit-your-house',
};

const FLOORING = A('services/basement-flooring/', 'basement flooring page');
const FINISH = A('services/basement-finishing/', 'basement finishing');
const RENO = A('services/basement-renovation/', 'basement renovation planning');
const WATERPROOF = A('services/basement-waterproofing/', 'basement waterproofing');
const INTERIOR = A('services/interior-waterproofing/', 'interior waterproofing');
const WET = A('services/wet-basement-repair/', 'wet basement repair');
const SUITE = A('services/legal-basement-apartment-toronto/', 'legal secondary suite guide');
const COST = A('blog/basement-renovation-cost-toronto.html', 'basement renovation cost in Toronto');
const WATERPROOF_FIRST = A('blog/basement-waterproofing-before-renovation.html', 'why waterproofing comes before finishing');

const hero = (file, alt, credit) => `<figure class="post-hero">
      <img src="${L.up(depth)}images/stock/${file}.webp" width="1200" height="800" alt="${alt}" fetchpriority="high">
      <figcaption>${credit}. Stock photo, illustrative only. It is not a Reno Rise project.</figcaption>
    </figure>`;

const GENERAL = U.notice(`<p>General planning information, not engineering advice. Product suitability depends on the manufacturer&rsquo;s instructions and a professional&rsquo;s assessment of your slab and moisture conditions. Reno Rise does not install flooring; independent professionals do.</p>`);

const common = { date: '2026-09-20', dateLong: 'September 20, 2026', dateShort: 'Sep 20, 2026', cats: 'flooring planning', tag: 'Basement flooring', formType: 'Basement flooring' };

const FLOORING_POSTS = [
  // ------------------------------------------------------------------ 1
  {
    ...common,
    file: 'best-flooring-basement-toronto.html',
    title: 'Best Flooring for a Basement in Toronto',
    metaTitle: 'Best Flooring for a Basement in Toronto',
    short: 'Best Flooring for a Basement in Toronto',
    description: 'Best flooring for a basement in Toronto? Compare vinyl plank, tile, engineered flooring, laminate and carpet, and see why moisture comes first. Read the guide.',
    excerpt: 'There is no single winner. There is a right order to decide in, and it starts with the slab, not the showroom.',
    img: 'finished-basement-living-room',
    alt: 'Finished basement living room with a large television and sectional sofa',
    body: () => `
    ${hero('finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels')}
    <p>The best flooring for a <strong>basement in Toronto</strong> is the one your basement can actually support. That sounds like a dodge. It is the honest answer, and it saves people from the most common basement flooring mistake: falling in love with a material before finding out whether the floor underneath is dry.</p>
    <p>So this guide does not crown a winner. It gives you a way to decide, then compares vinyl plank, tile, engineered flooring, laminate and carpet against the situations they tend to fit. If you want the full side-by-side, the ${FLOORING} has a comparison table.</p>
    ${GENERAL}

    <h2>Start with moisture, not the material</h2>
    <p>A basement floor is normally a concrete slab in contact with the ground. Concrete is porous, and moisture can move through it even when nothing has ever leaked. Flooring manufacturers commonly require the slab to be tested before installation; ${X(SRC.astm, 'ASTM F2170')} describes one widely used method, in-slab relative-humidity probes, and notes that a result describes the slab only at the time and place it was tested.</p>
    <p>Humidity in the room matters too. Health Canada advises keeping indoor relative humidity between 30% and 50%, with a dehumidifier where needed (${X(SRC.hcHumidity, 'Health Canada')}). If water has ever come in, fix that first. ${WATERPROOF_FIRST.replace('why waterproofing comes before finishing', 'Why waterproofing comes before finishing')} explains the order, and ${WATERPROOF} and ${WET} cover the fixes.</p>

    <h2>Which floor fits which basement?</h2>
    <p>Think in situations rather than winners. This table is general decision support, not a recommendation for your house:</p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Basement flooring by situation"><table class="compare-table">
      <caption>Options worth discussing, by situation</caption>
      <thead><tr><th scope="col">Situation</th><th scope="col">Options to discuss</th><th scope="col">Main caution</th></tr></thead>
      <tbody>
        <tr><th scope="row">Dry basement, family room or rec room</th><td>Vinyl plank, laminate rated for the space, engineered flooring approved below grade</td><td>Slab flatness and the manufacturer&rsquo;s below-grade terms</td></tr>
        <tr><th scope="row">Past moisture, now fixed and proven dry</th><td>Tile or vinyl over a suitable base; wait before wood or carpet</td><td>Prove it stays dry through a wet season first</td></tr>
        <tr><th scope="row">Bathroom, laundry or utility area</th><td>Porcelain or ceramic tile</td><td>Flat, stable slab and proper preparation</td></tr>
        <tr><th scope="row">Bedroom that should feel warm</th><td>Vinyl or laminate over an insulated subfloor; carpet tiles in a proven-dry room</td><td>Height used by the subfloor</td></tr>
        <tr><th scope="row">Rental-style suite that needs to be durable</th><td>Vinyl plank or tile</td><td>Confirm ceiling height and requirements for a suite</td></tr>
      </tbody>
    </table></div>
    <p>Notice what is missing: nothing on the list is right for every slab. Carpet is the option most sensitive to moisture, and Health Canada&rsquo;s guide to moisture and mould suggests you &ldquo;consider removing any carpets from the basement floor&rdquo; (${X(SRC.hcMould, 'Health Canada')}). Solid hardwood is generally not recommended below grade; see ${A('blog/hardwood-flooring-basement.html', 'Can You Install Hardwood Flooring in a Basement?')}</p>

    <h2>A short decision path</h2>
    <ol class="steps">
      <li><strong>Is the slab dry?</strong> Ask for testing where the product requires it, and fix water problems first.</li>
      <li><strong>How will the room be used?</strong> A gym, a bedroom and a laundry room want different things.</li>
      <li><strong>How much ceiling height can you spare?</strong> Subfloors and levelling compounds take height. Suites have stricter needs (see the ${SUITE}).</li>
      <li><strong>Does the manufacturer allow this product below grade?</strong> Get the wording in writing.</li>
      <li><strong>What does the whole floor cost, not just the boards?</strong> Ask for itemized quotes that separate preparation from materials and labour. Reno Rise does not publish price ranges; ${COST} explains how to compare quotes.</li>
    </ol>
    <p>Picture a household that picks the floor first: a warm-toned plank they saw online, then a slab test that comes back high. The plank was fine. The order was the problem. The reverse order costs a phone call, and it keeps the choice in your hands.</p>

    <h2>Where flooring fits in a basement project</h2>
    <p>Flooring usually comes near the end, after walls, wiring and plumbing. If you are planning the whole space, read ${RENO} and ${FINISH}. For the flooring-specific version of this guide, the ${FLOORING} covers options, subfloor considerations and questions to ask a professional. Reno Rise can review your details and match your project with the contractor best suited to the work.</p>
`,
    faq: [
      ['Is vinyl plank a good choice for a basement?', 'It is a common choice because the plank itself does not absorb water like wood. It still depends on a flat, dry-enough slab, well-sealed edges and the manufacturer&rsquo;s below-grade terms, and it does not stop water entering the basement.'],
      ['Is tile a good choice for a basement floor?', 'Tile copes well with moisture and is often used in basement bathrooms and laundry rooms. It is hard and cool underfoot, needs a flat, stable slab and usually involves more preparation than a floating floor.'],
      ['Which basement flooring is warmest?', 'Carpet and carpet tiles feel warmest, but they are the most moisture-sensitive. Vinyl or laminate over an insulated subfloor is another way to add warmth. Ceiling height and moisture conditions decide what is practical.'],
      ['Does basement flooring have to be waterproof?', '&ldquo;Waterproof&rdquo; is a marketing label that usually describes the plank or core, not the whole floor system. What matters is keeping water out of the basement in the first place and choosing a floor the manufacturer supports below grade.'],
    ],
    related: [['Basement Flooring', 'services/basement-flooring/'], ['Basement Finishing', 'services/basement-finishing/'], ['Basement Waterproofing', 'services/basement-waterproofing/'], ['Basement Renovation', 'services/basement-renovation/']],
  },

  // ------------------------------------------------------------------ 2
  {
    ...common,
    file: 'basement-subfloor-finished-basement.html',
    title: 'Do You Need a Subfloor in a Finished Basement?',
    metaTitle: 'Do You Need a Subfloor in a Finished Basement?',
    short: 'Do You Need a Subfloor in a Finished Basement?',
    description: 'Do you need a basement subfloor? See what a subfloor does for comfort, insulation and moisture, the common system types and the ceiling-height trade-off.',
    excerpt: 'Sometimes yes, sometimes no, and it rarely fixes what people hope it fixes. Here is how to decide.',
    img: 'unfinished-basement-block-walls-joists',
    alt: 'Unfinished basement with block walls and exposed floor joists',
    body: () => `
    ${hero('unfinished-basement-block-walls-joists', 'Unfinished basement with block walls and exposed floor joists', 'Photo: Curtis Adams on Pexels')}
    <p>Do you need a <strong>subfloor in a finished basement</strong>? Not always, but the question is worth asking before the flooring is chosen. A basement subfloor sits between the concrete slab and the finished floor, and it can add warmth, a moisture-separation layer and a flatter base. It also uses ceiling height and cannot fix a wet slab.</p>
    ${GENERAL}

    <h2>What a basement subfloor does</h2>
    ${U.checkList([
      '<strong>Comfort.</strong> A slab feels cold. A subfloor, especially an insulated one, can make the floor feel warmer and softer underfoot.',
      '<strong>Moisture separation.</strong> Some systems create an air gap or a capillary break between the concrete and the flooring. That manages conditions; it does not stop water entering.',
      '<strong>A flatter base.</strong> A subfloor can hide minor unevenness, though large problems need levelling of the slab itself.',
      '<strong>Something to fasten to.</strong> Some flooring is nailed or screwed, which needs a wood-based layer.',
    ])}

    <h2>When a subfloor is often used, and when it may not be needed</h2>
    <p>People tend to reach for a subfloor when the slab is cold, uneven or has a history of dampness that has been fixed, or when the flooring is wood. Some floating and tile installations go directly on a prepared slab with an approved underlayment or membrane instead. What is required depends on the product.</p>
    <p>For wood over concrete, the National Wood Flooring Association strongly recommends a vapour-retarding membrane and says to follow the flooring and adhesive manufacturer on substrate preparation and moisture limits (${X(SRC.nwfaConcrete, 'NWFA guidance on concrete subfloors')}). The manufacturer&rsquo;s instructions are the deciding document.</p>

    <h2>The ceiling-height trade-off</h2>
    <p>Every layer comes out of the room. In a tall basement that is a minor detail. In an older, low basement it can decide what is possible.</p>
    <p>If a suite is possible in future, the height that applies to it is set out in Ontario&rsquo;s guide (${X(SRC.ontario, 'Ontario second-unit guide')}) and explained in the ${SUITE}. Measure finished floor to finished ceiling, ask each system for its stated thickness and confirm the number with Toronto Building before you commit.</p>

    <h2>Common system types</h2>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Basement subfloor system types"><table class="compare-table">
      <caption>Common basement subfloor approaches (general descriptions)</caption>
      <thead><tr><th scope="col">System</th><th scope="col">How it works</th><th scope="col">Worth knowing</th></tr></thead>
      <tbody>
        <tr><th scope="row">Dimpled or studded membrane panels</th><td>Plastic panels create a small air gap and a break from the concrete; flooring or a wood layer goes over them</td><td>Thin, but must be matched to the finish floor</td></tr>
        <tr><th scope="row">Engineered subfloor panels</th><td>A moisture-resistant layer bonded to OSB or plywood, laid as a floating base</td><td>Adds warmth and a flat base; uses more height</td></tr>
        <tr><th scope="row">Plywood or OSB over a vapour retarder</th><td>Sheets fastened over polyethylene, sometimes on sleepers, sometimes with rigid foam between</td><td>Flexible for wood flooring; uses the most height</td></tr>
        <tr><th scope="row">No subfloor</th><td>Underlayment or a membrane directly on a prepared slab</td><td>Only where the flooring manufacturer allows it</td></tr>
      </tbody>
    </table></div>

    <h2>What a subfloor cannot do</h2>
    <p>A subfloor does not make a wet basement dry. If water enters after rain or snowmelt, start with ${WATERPROOF}, ${INTERIOR} or ${WET}, and keep access to drains, cleanouts and sump pits. Read ${WATERPROOF_FIRST} for why the order matters.</p>

    <h2>Questions to ask before you decide</h2>
    ${U.checkList([
      'Does the flooring manufacturer require, allow or forbid a subfloor for this product?',
      'What is the stated thickness of the system, and what will the finished ceiling height be?',
      'How will the slab moisture be tested, and what limit does the product allow?',
      'How will drains, cleanouts and the sump pit stay accessible?',
      'Is the quote itemized so the subfloor is priced separately from the flooring?',
    ])}
    <p>Once you have the answers, the ${FLOORING} compares the finish options and lists questions for a flooring professional. If the subfloor is part of a bigger plan, ${FINISH} and ${RENO} show where it fits.</p>
`,
    faq: [
      ['Does a subfloor make a wet basement dry?', 'No. A subfloor can manage conditions between the slab and the floor, but it does not stop water entering the basement. Fix the source of water first.'],
      ['How much ceiling height does a basement subfloor use?', 'It depends on the system. Each manufacturer states a thickness, and levelling compounds and underlayments add more. Measure your height first and ask for the total build-up before you choose.'],
      ['Can I skip the subfloor under vinyl plank?', 'Some vinyl and laminate products are installed directly on a prepared slab with an approved underlayment. Others specify or benefit from a subfloor. The manufacturer&rsquo;s installation instructions decide.'],
      ['Do I need a permit to add a basement subfloor in Toronto?', `Toronto Building says finishing work that changes nothing structural, adds no new plumbing and creates no additional dwelling unit may not need a permit. Confirm your scope with ${X(SRC.permit, 'Toronto Building')}.`],
    ],
    related: [['Basement Flooring', 'services/basement-flooring/'], ['Basement Finishing', 'services/basement-finishing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/']],
  },

  // ------------------------------------------------------------------ 3
  {
    ...common,
    file: 'vinyl-plank-vs-carpet-basement.html',
    title: 'Vinyl Plank vs. Carpet for a Basement',
    metaTitle: 'Vinyl Plank vs. Carpet for a Basement Floor',
    short: 'Vinyl Plank vs. Carpet for a Basement',
    description: 'Vinyl plank vs carpet for a basement: compare comfort, moisture tolerance, sound, maintenance and replacement, and where each one tends to fit. Read the guide.',
    excerpt: 'Warm and quiet or tough and easy to clean. The answer depends on how dry your basement is more than on taste.',
    img: 'finished-basement-sofa-room',
    alt: 'Finished basement sitting room with a leather sofa and bright windows',
    body: () => `
    ${hero('finished-basement-sofa-room', 'Finished basement sitting room with a leather sofa and bright windows', 'Photo: Michael Gault Photos on Pexels')}
    <p>Vinyl plank or carpet for a <strong>basement</strong>? It is a fair fight. Carpet wins on warmth and quiet. Vinyl plank wins on how it copes with the odd spill.</p>
    <p>But the deciding factor is usually not taste. It is whether the slab underneath stays dry.</p>
    <p>This guide compares the two on the things homeowners actually ask about, then suggests where each tends to fit. For the wider field, including tile, laminate and engineered flooring, see the ${A('services/basement-flooring/', 'basement flooring page')}.</p>
    ${GENERAL}

    <h2>Vinyl plank vs. carpet at a glance</h2>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Vinyl plank versus carpet comparison"><table class="compare-table">
      <caption>Vinyl plank and carpet compared for a basement (general descriptions, not test results)</caption>
      <thead><tr><th scope="col">&nbsp;</th><th scope="col">Vinyl plank</th><th scope="col">Carpet</th></tr></thead>
      <tbody>
        <tr><th scope="row">Comfort</th><td>Firm and cool; underlayment or a subfloor helps</td><td>Soft and warm underfoot</td></tr>
        <tr><th scope="row">Moisture tolerance</th><td>The plank itself does not absorb water like wood; seams, edges and slab moisture still matter</td><td>Low: carpet and pad can hold moisture and support mould if damp</td></tr>
        <tr><th scope="row">Sound</th><td>Can sound hard or hollow without underlayment</td><td>Generally absorbs sound and softens footsteps</td></tr>
        <tr><th scope="row">Maintenance</th><td>Sweep, vacuum, damp mop</td><td>Regular vacuuming and occasional deeper cleaning</td></tr>
        <tr><th scope="row">After a spill or small leak</th><td>Wipe up; check the seams and the slab</td><td>Dry quickly, or expect to lift and replace the pad and possibly the carpet</td></tr>
        <tr><th scope="row">Replacement</th><td>Damaged planks can sometimes be replaced, depending on the product</td><td>Carpet tiles replace piece by piece; broadloom is replaced by area</td></tr>
        <tr><th scope="row">Installation complexity</th><td>Low to moderate; needs a flat slab</td><td>Low to moderate</td></tr>
      </tbody>
    </table></div>

    <h2>The moisture question decides more than the rest</h2>
    <p>Health Canada&rsquo;s guide to moisture and mould suggests you &ldquo;consider removing any carpets from the basement floor&rdquo; (${X(SRC.hcMould, 'Health Canada')}). That is not a ban. It is a reminder that carpet is the option most affected if the basement gets damp, and basements are where dampness happens.</p>
    <p>Vinyl plank is a more forgiving material, but it is not a cure. Seams and edges can still let water reach the slab, and &ldquo;waterproof&rdquo; usually describes the plank, not the whole floor. Read the manufacturer&rsquo;s below-grade terms.</p>
    <p>Either way, the same first step applies: find out whether the basement is dry, and fix any source of water. ${WATERPROOF_FIRST.replace('why waterproofing comes before finishing', 'Why waterproofing comes before finishing')} explains the order.</p>

    <h2>Where each tends to fit</h2>
    ${U.checkList([
      '<strong>Vinyl plank</strong> tends to suit family rooms, hallways, entries, rental-style spaces and any area likely to see spills or heavy use.',
      `<strong>Carpet</strong> tends to suit a bedroom or media room in a basement that has been shown to stay dry, with humidity kept between 30% and 50% (${X(SRC.hcHumidity, 'Health Canada')}).`,
      '<strong>Carpet tiles</strong> sit in between: soft underfoot, and a stained tile can be swapped. The backing can still trap moisture.',
      '<strong>Both in one basement</strong> is common: vinyl in the entry and the play area, carpet where warmth matters, with a proper transition between them.',
    ])}
    <p>Picture a basement with a bedroom, a laundry corner and a games area. Vinyl in the laundry and games area, carpet tiles or a warm underlayment plus vinyl in the bedroom: that is not a rule, just an example of matching material to use rather than picking one floor for everything.</p>

    <h2>What to ask before you choose</h2>
    ${U.checkList([
      'Has the slab been tested where the product requires it, and can I see the result?',
      'Does the manufacturer support this product in a basement, and what does the warranty say?',
      'Would an underlayment or insulated subfloor improve comfort, and how much height does it use?',
      'How easy is it to repair or replace a damaged area?',
    ])}
    <p>The ${A('blog/basement-subfloor-finished-basement.html', 'guide to basement subfloors')} covers the height and comfort trade-offs. If you are planning the whole room, see ${FINISH}. Reno Rise can review your project details and match your project with the contractor best suited to the work.</p>
`,
    faq: [
      ['Which is warmer in a basement, vinyl plank or carpet?', 'Carpet feels warmer underfoot. Vinyl plank over an insulated subfloor or a suitable underlayment can narrow the gap, at the cost of some ceiling height.'],
      ['Which handles a spill or small leak better?', 'Vinyl plank is generally more forgiving of a spill, though water can still reach the slab through seams. Carpet and pad can hold moisture, so they need to dry quickly or be replaced.'],
      ['Can I use vinyl plank in one part of the basement and carpet in another?', 'Yes, it is common. Use a proper transition strip and match each material to how that area is used.'],
      ['Do carpet tiles change the answer?', 'They make repairs easier because individual tiles can be replaced. The backing can still trap moisture, though, and tiles do not solve a damp slab. Check the manufacturer&rsquo;s guidance for below-grade use before you choose them.'],
    ],
    related: [['Basement Flooring', 'services/basement-flooring/'], ['Basement Finishing', 'services/basement-finishing/'], ['Basement Waterproofing', 'services/basement-waterproofing/']],
  },

  // ------------------------------------------------------------------ 4
  {
    ...common,
    file: 'hardwood-flooring-basement.html',
    title: 'Can You Install Hardwood Flooring in a Basement?',
    metaTitle: 'Can You Install Hardwood Flooring in a Basement?',
    short: 'Can You Install Hardwood Flooring in a Basement?',
    description: 'Can you install hardwood flooring in a basement? Solid vs engineered hardwood, moisture limits and manufacturer rules, with no simple yes or no. Read the guide.',
    excerpt: 'Solid hardwood, generally no. Engineered hardwood, sometimes, with conditions. Here is the difference and what decides it.',
    img: 'finished-basement-dining-living-area',
    alt: 'Finished basement dining and living area with small high windows',
    body: () => `
    ${hero('finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels')}
    <p>Can you install <strong>hardwood flooring in a basement</strong>? The useful answer is not yes or no. It is: solid hardwood, generally not; engineered hardwood, sometimes, and only when the manufacturer approves it, the slab tests dry enough and the room&rsquo;s humidity is kept in check.</p>
    ${GENERAL}

    <h2>Solid hardwood vs. engineered hardwood</h2>
    <p><strong>Solid hardwood</strong> is a single piece of wood milled from board thickness. <strong>Engineered hardwood</strong> has a real-wood wear layer bonded to a plywood or fibreboard core built to move less as humidity changes. They look alike on the showroom floor and behave differently over concrete, which is why the rules differ.</p>
    <p>The National Wood Flooring Association says solid wood floors should not be installed below grade unless the manufacturer recommends it (${X(SRC.nwfa, 'NWFA installation guidelines')}). For engineered wood over concrete, the NWFA points to the manufacturer&rsquo;s requirements for substrate preparation, moisture testing and limits, and strongly recommends a vapour-retarding membrane under wood flooring over concrete (${X(SRC.nwfaConcrete, 'NWFA guidance on concrete subfloors')}).</p>

    <h2>Why moisture is the deciding factor</h2>
    <p>Wood takes on and gives off moisture as the air and the slab change. A basement slab can hold and pass moisture vapour even when it has never leaked, and that is the situation wood flooring is least comfortable with. Testing is how a professional finds out: ${X(SRC.astm, 'ASTM F2170')} describes in-slab relative-humidity probes, notes that flooring manufacturers generally require moisture testing before installation on concrete and that a result applies only to the time and place tested. Health Canada&rsquo;s target of 30% to 50% relative humidity is a sensible ceiling for a basement with wood in it (${X(SRC.hcHumidity, 'Health Canada')}).</p>
    <p>If water has ever come in, resolve that first; see ${WATERPROOF}, ${INTERIOR} and ${WET}.</p>

    <h2>What decides whether it can go ahead</h2>
    ${U.checkList([
      '<strong>The manufacturer.</strong> The product must be approved for below-grade installation, and its warranty must not exclude basements. Ask for the wording.',
      '<strong>The slab.</strong> Moisture test results within the product&rsquo;s limit, a flat surface and a properly prepared substrate.',
      `<strong>The base.</strong> A vapour-retarding membrane and any subfloor the manufacturer specifies; see the ${A('blog/basement-subfloor-finished-basement.html', 'subfloor guide')}.`,
      '<strong>The room.</strong> Humidity controlled year-round, with no history of unresolved leaks.',
      '<strong>The professional.</strong> Someone who tests, documents and is willing to put conditions in writing.',
    ])}

    <h2>If the answer is no</h2>
    <p>Wanting the look of wood is not unusual, and there are floors made for basements that give a similar look: wood-look vinyl plank, laminate whose manufacturer supports below-grade use, and wood-look porcelain tile. Each has its own limits, compared on the ${A('services/basement-flooring/', 'basement flooring page')} and in ${A('blog/vinyl-plank-vs-carpet-basement.html', 'Vinyl Plank vs. Carpet for a Basement')}. Picture a couple who love the warmth of wood but have a slab that tests high in spring: choosing a wood-look plank is not settling, it is matching the material to what the basement can support.</p>

    <h2>Questions to ask a flooring professional</h2>
    ${U.checkList([
      'Is the product I am considering approved by its manufacturer for below-grade installation over concrete?',
      'How will the slab be tested, where, and what result does the product allow?',
      'What membrane or subfloor does the manufacturer specify, and how much height will it use?',
      'How will humidity be kept in range, and what would void the warranty?',
      'What is the fallback if the moisture test fails?',
    ])}
    <p>If you are planning a wider project, ${FINISH} and ${RENO} show where flooring fits, and Reno Rise can match your project with the contractor best suited to the work.</p>
`,
    faq: [
      ['Can you install solid hardwood in a basement?', 'It is generally not recommended. The National Wood Flooring Association says solid wood floors should not be installed below grade unless the manufacturer recommends it, and most manufacturers do not.'],
      ['Is engineered hardwood waterproof?', 'No. It is wood, and it is designed to move less than solid wood, not to tolerate water. Some products are approved below grade over concrete, with conditions.'],
      ['Can I put hardwood in a basement that has never leaked?', 'A dry history helps but is not the whole answer. The slab can still hold and pass moisture vapour, so manufacturers usually require moisture testing and a suitable membrane.'],
      ['What are the alternatives to hardwood in a basement?', 'Wood-look vinyl plank, laminate whose manufacturer supports below-grade use, and wood-look porcelain tile are common alternatives. Each has limitations to check with the manufacturer.'],
    ],
    related: [['Basement Flooring', 'services/basement-flooring/'], ['Basement Finishing', 'services/basement-finishing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
];

module.exports = FLOORING_POSTS;
