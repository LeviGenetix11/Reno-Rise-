// Basement pages for GTA municipalities outside Toronto, and the two former homepage-clone door pages.
// The city pages keep their URLs but are noindex,follow and excluded from the sitemap until the owner
// supplies genuinely distinct local information for them (see final summary).
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 2;
const h = (t) => L.href(depth, t);

const CITIES = [
  { slug: 'basement-renovation-ajax', name: 'Ajax', region: 'Durham Region', note: 'Homes in many Ajax subdivisions date from roughly the 1980s to the 2000s, so basements are often newer builds. That can make finishing more straightforward, but moisture and ceiling height should still be confirmed rather than assumed.' },
  { slug: 'basement-renovation-oakville', name: 'Oakville', region: 'Halton Region', note: 'In newer parts of Oakville, such as Glen Abbey and Joshua Creek, basements are more likely to be dry and at a workable height, which can point toward a lighter finishing scope. Older neighbourhoods can differ, so check the specific house.' },
  { slug: 'basement-renovation-pickering', name: 'Pickering', region: 'Durham Region', note: 'Newer communities such as Seaton typically have newer foundations, so a basement may already meet height and moisture needs. Verify this on your own house before choosing a scope.' },
  { slug: 'basement-renovation-richmond-hill', name: 'Richmond Hill', region: 'York Region', note: 'Established areas such as Mill Pond may include older homes where ceiling height deserves an early check, while newer areas such as Jefferson and Oak Ridges are often more straightforward. Owners of larger homes sometimes plan basement suites for extended family or a separate office.' },
  { slug: 'basement-renovation-vaughan', name: 'Vaughan', region: 'York Region', note: 'Newer builds in areas such as Woodbridge, Maple and Vellore Village often have more modern basements, while larger Kleinburg lots can support bigger basement plans, such as suites for extended family. As always, the details of your house decide what is possible.' },
];

for (const c of CITIES) {
  const body = `
    <p>Reno Rise is focused on Toronto basements, but it also receives enquiries from across the GTA. This page covers what homeowners in ${c.name} (${c.region}) should keep in mind when planning a basement project.</p>
    <p>${c.note}</p>
    <h2>Confirm the Basics First</h2>
    ${U.checkList(['Measure ceiling height and check for moisture before choosing a scope.', 'Ask your municipality&rsquo;s building department which work needs a permit. Zoning and permit rules are set locally and Toronto rules do not apply outside Toronto.', 'If you are considering a rental or in-law unit, read our <a href="' + h('services/legal-basement-apartment-toronto/') + '">legal secondary suite guide</a> for the general considerations, then confirm local rules with your municipality.', 'Ask each professional about credentials, insurance, references and permit responsibility.'])}
    <p>For the general process, see <a href="${h('services/basement-renovation/')}">basement renovation planning</a>, <a href="${h('services/basement-finishing/')}">basement finishing</a> and <a href="${h('services/interior-waterproofing/')}">interior waterproofing</a>.</p>
`;
  guidePage({
    depth,
    path: `services/${c.slug}/`,
    title: `Basement Renovation Planning in ${c.name} | Reno Rise`,
    description: `Planning a basement project in ${c.name}? What to confirm about moisture, ceiling height and permits, and how to request a basement assessment.`,
    h1: `Basement Renovation Planning in ${c.name}`,
    sub: `${c.region}. Reno Rise focuses on Toronto but welcomes enquiries from across the GTA.`,
    crumbs: [['Home', ''], ['Services', 'services/'], [`Basement Renovation in ${c.name}`, '']],
    active: 'basement-services',
    body,
    formType: 'General basement renovation',
    robots: 'noindex, follow',
    related: [['Basement Renovation', 'services/basement-renovation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Finishing', 'services/basement-finishing/'], ['Areas Served', 'locations/']],
    updated: 'General planning information. Confirm local requirements with your municipality and qualified professionals.',
  });
}

// ---- former homepage-clone pages: rebuilt in the standard "other service" layout ----
const OTHER = [
  {
    slug: 'door-installation', name: 'Door Installation', eyebrow: 'Doors',
    lead: 'A door that does not sit right is usually a sign it was fitted to a frame that was not square. Door installation covers interior and exterior doors, from measuring the rough opening to hardware and weatherstripping.',
    para: 'What matters most is measuring the actual opening (older Toronto homes are rarely the standard size a big-box door assumes), shimming and levelling the frame, flashing and insulating exterior units, and checking that locks, hinges and seals work before the job is finished.',
    items: ['Measuring the rough opening rather than the old door', 'Frame squaring, shimming and levelling', 'Flashing, insulation and weatherstripping for exterior doors', 'Hardware fitting and a final operation check'],
    links: [['Interior Door Installation', 'interior-door-installation'], ['Exterior Door Installation', 'exterior-door-installation'], ['Door Repair', 'door-repair'], ['Door Replacement', 'door-replacement']],
  },
  {
    slug: 'garage-door-repair', name: 'Garage Door Repair', eyebrow: 'Doors',
    lead: 'Garage door problems range from a misaligned track to a broken spring or opener. Some parts are under high tension, so repair is generally work for a qualified technician rather than a DIY project.',
    para: 'Common issues include worn rollers, damaged panels, off-track doors, failed springs and openers that no longer respond. Ask a professional to diagnose the cause before agreeing to a replacement.',
    items: ['Diagnosing noise, sticking or uneven movement', 'Track alignment and roller replacement', 'Spring and cable repair by a qualified technician', 'Opener and sensor troubleshooting'],
    links: [['Garage Door Installation', 'garage-door-installation'], ['Door Repair', 'door-repair'], ['Garage Renovation', 'garage-renovation']],
  },
];

for (const o of OTHER) {
  const hero = PG.pageHero({ depth, h1: `${o.name} in the GTA`, crumbs: [['Home', ''], ['Services', 'services/'], [o.name, '']], image: 'images/services/category-doors.jpg' });
  const main = `<!-- ========== INTRO ========== -->
<section class="section">
  <div class="container article-wrap">
    <span class="eyebrow">${o.eyebrow}</span>
    <h2 style="font-size:32px; margin-bottom:20px;">${o.name}: What to Know Before You Hire</h2>
    <p>${o.lead}</p>
    <p>${o.para}</p>
    <p class="illustrative-note">Reno Rise focuses on basement projects. This page is general information; the work itself is carried out by independent professionals.</p>
    <h3 style="margin-top:36px;">What This Work Typically Includes</h3>
    ${U.checkList(o.items)}
    <div class="internal-links" style="margin-top:28px;">
${o.links.map(([l, s]) => `      <a href="../${s}/">${l}</a>`).join('\n')}
      <a href="../">All Services</a>
      <a href="../../locations/">Areas We Serve</a>
      <a href="../../contact.html">Tell Us About Your Project</a>
    </div>
  </div>
</section>
<!-- ========== TRUST STRIP ========== -->
<!-- ========== CTA BAND ========== -->
<section class="section-tight"><div class="container"><div class="cta-band"><div><h2>Planning a Home Project?</h2></div></div></div></section>
`;
  U.write(`services/${o.slug}/index.html`, PG.renderPage({
    depth, path: `services/${o.slug}/`,
    title: `${o.name} in the GTA | Reno Rise`,
    description: `${o.name} in the GTA: what the work involves and what to ask before you hire. General information from Reno Rise.`,
    active: 'other', hero, main, noCta: true,
  }));
}
