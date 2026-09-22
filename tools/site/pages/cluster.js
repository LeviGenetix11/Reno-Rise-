// Generates the basement-cluster service pages (replaces thin, claim-heavy template pages).
// URLs are unchanged. Content is general planning information: Reno Rise does not perform the work.
'use strict';
const L = require('../lib');
const U = require('./util');
const { guidePage } = require('./guide');

const depth = 2;
const h = (t) => L.href(depth, t);
const link = (slug, label) => `<a href="${h('services/' + slug + '/')}">${label}</a>`;
const SUITE = `<a href="${h('services/legal-basement-apartment-toronto/')}">legal secondary suite guide</a>`;

const PERMIT_NOTE = 'Toronto Building lists underpinning, structural or material changes, new windows or doors, constructing a basement entrance, heating or plumbing changes and adding a second dwelling unit among the work that needs a building permit. Confirm what applies to your project.';

const pages = [
  {
    slug: 'basement-finishing',
    photos: [['finished-basement-living-room', 'Finished basement living room with a large television and sectional sofa', 'Photo: Curtis Adams on Pexels'], ['finished-basement-sofa-room', 'Finished basement sitting room with a leather sofa and bright windows', 'Photo: Michael Gault Photos on Pexels'], ['basement-family-room-fireplace', 'Basement family room with wood paneling and a fireplace', 'Photo: Peter Vang on Pexels']],
    title: 'Basement Finishing in Toronto | What to Know Before You Start | Reno Rise',
    description: 'Basement finishing for dry, tall-enough Toronto basements: walls, flooring, lighting and when a permit is needed. Request a basement assessment.',
    h1: 'Basement Finishing in Toronto',
    sub: 'A lighter-scope option for basements that are already dry and tall enough. Learn what it covers and where it stops.',
    formType: 'Finished basement',
    intro: [
      `Basement finishing is the right conversation when the shell is already sound: dry walls and floor, workable ceiling height and safe access. It turns bare concrete and studs into comfortable living space with insulated walls, drywall, flooring, lighting and paint. If moisture, low height or a self-contained rental unit is involved, the project is bigger than finishing. See <a href="${h('services/basement-renovation/')}">basement renovation planning</a> or the ${SUITE}.`,
    ],
    involves: ['Confirming the basement is dry and that any past moisture has been diagnosed and resolved.', 'Framing and insulation designed for below-grade walls, with a moisture-safe assembly.', 'Electrical layout, lighting and outlets, with the panel checked for spare capacity.', `Drywall, ceiling treatment, trim and a floor chosen for a below-grade slab (see ${link('basement-flooring', 'basement flooring options')}).`, 'Smoke and carbon monoxide alarm placement, and clear access to any mechanical equipment.'],
    permit: `Cosmetic finishing that changes nothing structural, adds no new plumbing and creates no additional dwelling unit may not need a permit, according to Toronto Building. ${PERMIT_NOTE}`,
    timelineLede: 'A straightforward basement finish typically takes two to four weeks of active work once permits, where needed, are in hand.',
    timeline: ['Permit review, where the scope needs one, adds time before framing can start.', 'A fire-rated ceiling assembly or additional insulation work extends the schedule versus a simple paint-and-flooring job.', 'Inspections between electrical rough-in and closing up the walls add scheduled pauses.', 'Material lead times for flooring or cabinetry can affect the finish date more than the labour itself.'],
    mistakesLede: 'Basement finishing is the lighter-scope project, and homeowners still run into avoidable problems:',
    mistakes: ['Finishing over a basement whose moisture history was never actually confirmed.', 'Assuming finishing alone creates a legal secondary suite.', 'Skipping a permit check because the work &ldquo;feels cosmetic.&rdquo;', 'Not checking electrical panel capacity before adding new circuits.', 'Choosing flooring before confirming it suits a below-grade concrete slab.'],
    ask: ['Has the moisture history of this basement been checked before finishing?', 'Which parts of the work need a permit, and who applies for it?', 'How will insulation and vapour control be handled on the foundation walls?', 'Is the electrical panel adequate for the added load?'],
    notFit: `If you plan to rent the space as a separate apartment, finishing alone will not make it a legal suite. Read the ${SUITE}. If water is entering, start with ${link('interior-waterproofing', 'interior waterproofing')} or ${link('wet-basement-repair', 'wet basement repair')}.`,
    faq: [['Is basement finishing the same as a renovation?', 'Finishing usually means completing a sound space: walls, flooring and lighting. A renovation is broader and can include waterproofing, height work, new bathrooms or bedrooms and layout changes.'], ['Does finishing a basement make it a legal apartment?', 'No. A legal secondary suite is a separate dwelling created with a building permit and built to Building Code and Fire Code requirements.']],
    related: [['Basement Renovation', 'services/basement-renovation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Soundproofing', 'services/basement-soundproofing/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Basement Flooring', 'services/basement-flooring/']],
  },
  {
    slug: 'underpinning',
    title: 'Basement Underpinning in Toronto | When It Is Needed | Reno Rise',
    description: 'Basement underpinning lowers the floor to gain ceiling height. Learn when it is needed, how it works and what to ask. Request a basement assessment.',
    h1: 'Basement Underpinning in Toronto',
    sub: 'Lowering a basement floor to gain ceiling height is structural work. Understand when it comes up and how to approach it.',
    formType: 'Underpinning or ceiling-height work',
    intro: [
      'Underpinning extends a house&rsquo;s foundation downward, usually in short sections, so the basement floor can be lowered. Homeowners consider it when an older basement is too low to be a comfortable or approved living space, and it is often part of a secondary-suite conversion.',
      'Because it involves excavating beside and beneath the existing foundation, it needs engineering, a permit and careful sequencing. It is also rarely the only option: a bench footing may lower part of the floor with less disruption, and some basements already meet height requirements.',
    ],
    involves: ['A survey of existing ceiling height, floor level, beams and ducts.', 'Structural engineering drawings and a building permit.', 'Excavation and new footings placed in a planned sequence beneath the existing foundation.', 'Drainage and waterproofing integrated with the new foundation wall and floor.', 'Inspections at stages required by the building department.'],
    permit: `Toronto Building specifically lists basement underpinning as work that requires a permit. ${PERMIT_NOTE}`,
    ask: ['Have you measured the existing height and confirmed underpinning is needed, or would another approach work?', 'Who provides the engineering, and are stamped drawings included?', 'How will the work be sequenced to protect the house and neighbouring properties?', 'What is included for waterproofing, drainage and floor slab, and what is excluded?'],
    notFit: `If your ceiling height already works, underpinning adds cost and disruption without benefit. Have the height measured first. See also ${link('bench-footing', 'bench footing')}, and read <a href="${h('blog/basement-underpinning-cost-and-when-needed.html')}">Underpinning: when it is needed and what drives cost</a>.`,
    faq: [['Do I need underpinning to build a basement apartment?', 'Only if the existing ceiling height cannot meet the height that applies to your project. Ontario&rsquo;s second-unit guide describes about 1.95 metres (roughly 6 ft 5 in) for basements. Have a designer confirm what applies.'], ['Does underpinning need a permit in Toronto?', 'Yes. Toronto Building lists basement underpinning among the work that requires a building permit.']],
    related: [['Bench Footing', 'services/bench-footing/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Interior Waterproofing', 'services/interior-waterproofing/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
  {
    slug: 'egress-windows',
    title: 'Egress Windows for Toronto Basements | Planning Guide | Reno Rise',
    description: 'Egress windows give basement bedrooms a safe way out and natural light. Learn what is involved, permits and what to ask. Request a basement assessment.',
    h1: 'Egress Windows for Toronto Basements',
    sub: 'Safe exits and daylight are central to a bedroom or secondary suite. See what installing or enlarging a basement window involves.',
    formType: 'Separate entrance or egress window',
    intro: [
      'An egress window is a window large enough, and reachable enough, to be used as an emergency way out. In a basement it usually means enlarging an existing opening or cutting a new one in the foundation wall and adding a window well outside. It also brings in natural light, which helps the space feel like a home rather than a cellar.',
      `Ontario&rsquo;s guide to second units notes that emergency escape windows can be required where exits pass through other units, and gives glazing targets for habitable rooms. The Building Code sets the specifics, so a designer should confirm what your layout needs. It also matters for any bedroom in a secondary suite; see the ${SUITE}.`,
    ],
    involves: ['Confirming the location, and whether the wall is load-bearing or has a lintel or beam nearby.', 'Cutting the foundation opening, installing the window and flashing it against water entry.', 'Building a window well with drainage, and a ladder or step arrangement where required.', 'Interior finishing, insulation and air sealing around the opening.', 'A building permit and inspection where applicable.'],
    permit: `Toronto Building includes new windows and structural or material changes among work that needs a permit. ${PERMIT_NOTE}`,
    ask: ['Will the window and well meet the Code requirements for this room and this house?', 'How will the well be drained so it does not collect water against the foundation?', 'Who applies for the permit and arranges inspection?', 'What happens if the opening runs into a structural element or an old pipe?'],
    notFit: `If you only want a brighter room and not a bedroom or exit, a smaller window replacement may be enough: see ${link('basement-window-replacement', 'basement window replacement')} and ${link('window-well-installation', 'window well installation')}.`,
    faq: [['Is an egress window required for a basement bedroom?', 'Bedrooms need a safe way out, and Ontario&rsquo;s guide describes escape windows for certain layouts. What applies depends on the design, so confirm with a designer and Toronto Building.'], ['Do I need a permit to cut a new basement window?', 'Toronto Building lists new windows among the work that needs a permit, so confirm before cutting.']],
    related: [['Window Well Installation', 'services/window-well-installation/'], ['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Walkout & Separate Entrances', 'services/walkout-construction/'], ['Egress Windows Guide', 'blog/egress-windows-toronto-basements.html']],
  },
  {
    slug: 'basement-soundproofing',
    photos: [['finished-basement-dining-living-area', 'Finished basement dining and living area with small high windows', 'Photo: Elias Storm on Pexels'], ['room-under-renovation', 'Room under renovation with a ladder and drywall', 'Photo: Valentin Ivantsov on Pexels'], ['basement-room-with-windows', 'Basement room with windows and natural light', 'Photo: Peter Vang on Pexels']],
    title: 'Basement Soundproofing in Toronto | Suites, Theatres & Gyms | Reno Rise',
    description: 'Plan basement soundproofing for rental suites, home theatres and gyms: assemblies, ceilings and sealing. Request a basement assessment.',
    h1: 'Basement Soundproofing in Toronto',
    sub: 'Sound control is easiest to build into the ceiling and walls before drywall goes up. Learn the basics.',
    formType: 'Legal secondary suite / basement apartment',
    intro: [
      'Whether the basement is a rental suite, a home theatre or a gym, noise travels through the floor above, through shared walls and through gaps around pipes and ducts. Good sound control is a design decision: it is much easier to plan into the framing and ceiling assembly than to add later.',
      'In a secondary suite, sound control often overlaps with the fire-separating ceiling assembly, which is one reason it is worth planning the two together with a designer.',
    ],
    involves: ['Reviewing where sound is likely to travel: ceiling, party walls, ducts and pipe penetrations.', 'Insulation chosen for sound as well as thermal performance.', 'Resilient channel or other isolation methods, and additional drywall layers where designed.', 'Sealing gaps, outlets and penetrations that leak sound.', 'Coordinating with any required fire-separation assemblies.'],
    permit: 'Soundproofing on its own may not need a permit, but it is usually part of a larger project, and in a secondary suite the ceiling assembly is also a fire-separation element. Ask your designer how the two fit together.',
    timelineLede: 'Soundproofing is rarely a stand-alone timeline: it is built into the framing and ceiling stage of a larger project, typically adding a few days to that stage rather than running on its own schedule.',
    timeline: ['Design coordination with the fire-separation assembly, where one is required, happens before framing, not after.', 'Additional drywall layers or resilient channel add installation time versus a standard assembly.', 'Sealing every duct, pipe and outlet penetration properly takes longer than it looks, and is easy to rush.', 'Verifying the assembly (or simply confirming it was built as designed) is usually a short final step.'],
    mistakesLede: 'Sound control is one of those details that is cheap to plan for and expensive to fix afterward:',
    mistakes: ['Waiting until after drywall is up to think about sound control.', 'Treating soundproofing and fire separation as two unrelated decisions in a secondary suite.', 'Leaving outlets, light fixtures or duct penetrations unsealed, which lets sound bypass the whole assembly.', 'Choosing insulation for thermal performance only, without checking its sound rating.', 'Not asking what level of sound reduction the design is actually aiming for.'],
    ask: ['Is sound control designed together with the fire-separation assembly?', 'How are ducts, pipes and lights sealed so they do not bypass the assembly?', 'What level of sound reduction is the design aiming for, and how is it verified?', 'What ceiling height is left after the assembly is built?'],
    notFit: `Soundproofing cannot fix a structural or moisture problem. Sort those out first: ${link('interior-waterproofing', 'interior waterproofing')}, and the ${SUITE}.`,
    faq: [['Should soundproofing be done before drywall?', 'Generally yes. Assemblies are far easier to build into open framing than to retrofit behind finished walls.']],
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Basement Finishing', 'services/basement-finishing/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
  {
    slug: 'basement-waterproofing',
    title: 'Basement Waterproofing in Toronto | Options Explained | Reno Rise',
    description: 'Understand interior, exterior and drainage options for wet Toronto basements before you renovate. Request a basement assessment.',
    h1: 'Basement Waterproofing in Toronto',
    sub: 'Find where the water is coming from before choosing a fix. An overview of the options and how to choose between them.',
    formType: 'Waterproofing or moisture issue',
    intro: [
      'A basement stays dry through a combination of surface grading, roof drainage, foundation condition and below-grade drainage. When one fails, the symptoms look similar: damp walls, efflorescence, a musty smell or water on the floor. The fix depends on the cause, so diagnosis comes first.',
      `This page is an overview. For specific approaches see ${link('interior-waterproofing', 'interior waterproofing')}, ${link('exterior-waterproofing', 'exterior waterproofing')}, ${link('wet-basement-repair', 'wet basement repair')} and ${link('foundation-crack-repair', 'foundation crack repair')}.`,
    ],
    involves: ['Identifying the entry point: wall crack, floor-wall joint, window well, grading or roof drainage.', 'Low-cost fixes first: downspout extensions, grading and gutter repairs.', 'Targeted repairs, such as crack injection, where the cause is localized.', 'Interior drainage with a sump system, or exterior membrane and weeping tile replacement, when the problem is wider.', 'Confirming the result before finishing over the area.'],
    permit: 'Toronto Building notes that installing a sump pump does not require a permit. Excavation, new drains or structural repairs can be different, so confirm before starting.',
    ask: ['How did you determine where the water is coming from?', 'Is a cheaper drainage or grading fix enough, or is a full system needed?', 'What does the warranty cover, in writing, and who honours it?', 'How will the work be tested before finishes go over it?'],
    notFit: 'If you are only planning cosmetic finishing over a dry basement, waterproofing is not required, but any past moisture should still be understood.',
    faq: [['Should I waterproof before finishing a basement?', 'If there is any history of water or dampness, yes. Finishing over an unresolved moisture problem hides it and can lead to mould and repairs.'], ['Do I need a permit for a sump pump?', 'Toronto Building states that installing a sump pump does not require a building permit.']],
    related: [['Interior Waterproofing', 'services/interior-waterproofing/'], ['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Waterproofing Before Renovation', 'blog/basement-waterproofing-before-renovation.html'], ['Sump Pumps', 'services/sump-pump/']],
  },
  {
    slug: 'interior-waterproofing',
    title: 'Interior Basement Waterproofing in Toronto | Reno Rise',
    description: 'How interior waterproofing works: drainage channels, sump pits and vapour control. When it fits, when it does not, and what to ask.',
    h1: 'Interior Waterproofing in Toronto',
    sub: 'Interior drainage systems manage water that has already reached the foundation. See how they work and where they fall short.',
    formType: 'Waterproofing or moisture issue',
    intro: [
      'Interior waterproofing intercepts water at the base of the wall and routes it to a sump pit, where a pump sends it outside. It is often chosen when exterior excavation is impractical, for example because of landscaping, an attached garage or a shared wall.',
      'It manages water rather than stopping it at the source, which is the key difference from exterior waterproofing. That is worth understanding before you compare quotes.',
    ],
    involves: ['Assessing whether water enters through the wall, the floor-wall joint, a crack, or a combination.', 'Installing a drainage channel along the interior perimeter of the footing.', 'Connecting to a sump pit and pump, with a discharge line directed away from the house.', 'Wall-face membrane or dimple board and sealing of the floor-wall joint where appropriate.', 'Testing the system before the area is closed up and finished.'],
    permit: 'Toronto Building says installing a sump pump does not require a permit. Larger projects that include breaking the slab for new drains, underpinning or a renovation may involve permits, so confirm the whole scope.',
    ask: ['Is an interior system the right fit, or would exterior work or a smaller repair address the cause?', 'How much of the perimeter is covered and why?', 'What backup do you provide if power fails (battery or water-powered backup), and is it included?', 'What is warranted, for how long, and in writing?'],
    notFit: `If water is entering through a visible crack, ${link('foundation-crack-repair', 'a targeted crack repair')} may be smaller and better. If exterior grading is pushing water toward the foundation, ${link('exterior-waterproofing', 'exterior waterproofing')} addresses the source.`,
    faq: [['What is the difference between interior and exterior waterproofing?', 'Exterior waterproofing works from outside to keep water away from the foundation wall and needs excavation. Interior waterproofing collects and redirects water that has already reached the foundation.'], ['Will interior waterproofing stop water entering the walls?', 'It manages water at the floor level. It does not seal the foundation wall itself, so an actively leaking crack may need separate repair.']],
    related: [['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Wet Basement Repair', 'services/wet-basement-repair/'], ['Sump Pumps', 'services/sump-pump/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
  {
    slug: 'exterior-waterproofing',
    title: 'Exterior Basement Waterproofing in Toronto | Reno Rise',
    description: 'Exterior waterproofing stops water at the foundation wall. Learn how it works, when it fits and what to ask before you hire.',
    h1: 'Exterior Waterproofing in Toronto',
    sub: 'Working from the outside addresses water at the source. Understand the process, disruption and questions to ask.',
    formType: 'Waterproofing or moisture issue',
    intro: [
      'Exterior waterproofing means excavating along the foundation, cleaning and repairing the wall, applying a membrane, and installing drainage such as new weeping tile before backfilling. It addresses water before it reaches the wall, but it is more disruptive than interior work because of the digging.',
      'Access matters: decks, patios, landscaping, walkways and neighbouring structures all affect feasibility and cost.',
    ],
    involves: ['Excavation to expose the foundation wall to the footing.', 'Wall repair, crack sealing and a waterproof membrane with drainage board.', 'Replacing or adding weeping tile and connecting it to a discharge point.', 'Backfilling with appropriate material and restoring grade so water drains away from the house.', 'Coordinating utilities, landscaping restoration and any needed permits.'],
    permit: 'Excavation and drainage work can involve municipal requirements, and it may sit alongside structural work. Confirm with Toronto Building before starting.',
    ask: ['Why is exterior work needed rather than a smaller fix?', 'How much will be excavated and how will landscaping, patios or decks be handled?', 'Will weeping tile be replaced, and where does it discharge?', 'What is warranted, and is the warranty transferable to a future owner?'],
    notFit: `If access is limited or the problem is a single crack, ${link('interior-waterproofing', 'interior waterproofing')} or ${link('foundation-crack-repair', 'crack repair')} may be more practical.`,
    faq: [['Is exterior waterproofing better than interior?', 'They do different jobs. Exterior work addresses water at the wall; interior work manages water that reaches the foundation. The right choice depends on the cause and on access.']],
    related: [['Interior Waterproofing', 'services/interior-waterproofing/'], ['Weeping Tile', 'services/weeping-tile/'], ['Foundation Crack Repair', 'services/foundation-crack-repair/'], ['Waterproofing Guide', 'blog/basement-waterproofing-before-renovation.html']],
  },
  {
    slug: 'wet-basement-repair',
    title: 'Wet Basement Repair in Toronto | Find the Cause First | Reno Rise',
    description: 'Wet basement repair starts with finding why the basement is wet. Common causes, low-cost fixes and when to call a professional.',
    h1: 'Wet Basement Repair in Toronto',
    sub: 'Most wet basements have a specific cause. Finding it first saves money and avoids repeating the repair.',
    formType: 'Waterproofing or moisture issue',
    intro: [
      'Water in a basement can come from above (roofs and gutters), from around (grading and soil), or from within (plumbing). Treating the wrong cause wastes money, so the useful first step is diagnosis.',
      'Common causes include downspouts that discharge next to the foundation, soil sloping toward the house, cracks in the wall or floor, failed or clogged weeping tile, high groundwater and window wells that fill with water.',
    ],
    involves: ['Documenting where and when water appears (after rain, snowmelt, or all the time).', 'Checking eavestroughs, downspouts and grading.', 'Inspecting walls, floor-wall joints, penetrations and window wells.', 'Choosing the least invasive fix that addresses the cause: drainage, crack repair, sump system or exterior work.', 'Drying and, if needed, addressing mould before finishing.'],
    permit: 'Toronto Building notes that installing a sump pump does not require a permit. Other repairs depend on the scope. Ask the contractor doing the work.',
    ask: ['What do you believe is causing the water and how did you confirm it?', 'Is there a lower-cost fix I should try first, such as downspout or grading work?', 'What is warranted, and what would void it?', 'How will you test that the repair worked?'],
    notFit: `If you are planning a renovation, resolve moisture first: read <a href="${h('blog/basement-waterproofing-before-renovation.html')}">Basement Waterproofing Before You Renovate</a>.`,
    faq: [['Why does my basement leak after heavy rain?', 'Common reasons are downspouts and grading that direct water toward the foundation, blocked weeping tile or wall cracks. A professional can help identify which applies.']],
    related: [['Interior Waterproofing', 'services/interior-waterproofing/'], ['Exterior Waterproofing', 'services/exterior-waterproofing/'], ['Sump Pumps', 'services/sump-pump/'], ['Foundation Crack Repair', 'services/foundation-crack-repair/']],
  },
  {
    slug: 'walkout-construction',
    photos: [['basement-staircase-brick-wall', 'Staircase down to a basement beside an exposed brick wall', 'Photo: Curtis Adams on Pexels'], ['basement-room-with-windows', 'Basement room with windows and natural light', 'Photo: Peter Vang on Pexels']],
    title: 'Basement Walkouts & Separate Entrances in Toronto | Reno Rise',
    description: 'Planning a basement walkout or separate entrance? What is involved, permits and drainage considerations. Request a basement assessment.',
    h1: 'Walkouts & Separate Entrances for Toronto Basements',
    sub: 'A private entrance can make a basement suite practical. Learn what is involved and what to confirm first.',
    formType: 'Separate entrance or egress window',
    intro: [
      'A separate basement entrance can be a below-grade stairwell, a side-door entrance or a full walkout where the lot slopes. It gives tenants or family independent access, improves light and can support safe exit planning for a suite.',
      'Because it means cutting into the foundation, managing drainage and often changing grade, it is structural and site work that needs planning and approvals.',
    ],
    involves: ['Reviewing the lot, grade, side yard width and property lines.', 'Structural design for the new opening and lintel.', 'Excavation, retaining walls or stair enclosure, and drainage at the bottom of the stairwell.', 'Door, framing, waterproofing and finishing.', 'Confirming zoning and permit requirements.'],
    permit: `Toronto Building lists constructing a basement entrance among the work that needs a permit, and zoning may affect where an entrance can go. ${PERMIT_NOTE}`,
    timelineLede: 'A separate entrance or walkout typically takes one to three weeks of construction once permits are approved, depending on how much excavation and stairwell construction the lot requires.',
    timeline: ['Structural design and stamped drawings for the new opening are prepared before excavation starts.', 'Permit review for a new basement entrance typically takes longer than for lighter renovation work, and zoning can add a step.', 'Excavation depth and stairwell length are the main construction-time drivers.', 'Weather affects exterior excavation and drainage work more than interior steps.'],
    mistakesLede: 'Because this is structural, site-specific work, the mistakes here tend to be expensive ones:',
    mistakes: ['Assuming an entrance location is allowed without checking zoning and side yard requirements first.', 'Underestimating drainage at the base of the stairwell, which is how a walkout becomes a flood risk.', 'Not confirming who provides the structural design and stamped drawings before excavation starts.', 'Building the entrance without connecting it to the overall exit plan for a secondary suite.', 'Skipping the permit because the work is framed as &ldquo;just a door and some stairs.&rdquo;'],
    ask: ['Is the entrance location allowed by zoning and does it work with my lot?', 'How is the stairwell drained so it does not flood?', 'Who provides the structural design and permit drawings?', 'How does this fit into the exit plan for the suite?'],
    notFit: `If you only need extra light or an emergency exit for a bedroom, an ${link('egress-windows', 'egress window')} may be enough.`,
    faq: [['Does a legal basement apartment need a separate entrance?', 'Ontario&rsquo;s guide describes separate exits as preferred and shared exits as possible with added fire separation. Zoning can also affect entrances, so ask a designer and Toronto Building.']],
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Egress Windows', 'services/egress-windows/'], ['Underpinning', 'services/underpinning/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
  {
    slug: 'basement-renovation-toronto',
    title: 'Toronto Basement Renovation: Older Homes & Neighbourhoods | Reno Rise',
    description: 'What Toronto homeowners should know about basements in older neighbourhoods: low ceilings, moisture, wiring and permits. Request a basement assessment.',
    h1: 'Basement Renovation in Toronto Neighbourhoods',
    sub: 'Toronto basements vary by neighbourhood and building age. Here is what commonly affects a project in older homes and newer suburbs.',
    formType: 'General basement renovation',
    intro: [
      'Toronto&rsquo;s housing stock ranges from Victorian and Edwardian semis in areas like Cabbagetown and Riverdale to wider detached homes further out, such as around Bedford Park. That range shapes what a basement project involves.',
      `Older homes commonly have lower basements, older foundations and older electrical systems, which can bring underpinning, waterproofing and rewiring into the conversation. Newer or previously updated homes are often more straightforward. Either way, the details are specific to your house. For the general process see <a href="${h('services/basement-renovation/')}">basement renovation planning</a>, and for rental units see the ${SUITE}.`,
    ],
    involves: ['Measuring ceiling height early, since older basements are more likely to be short.', 'Checking foundation condition and moisture history before finishing.', 'Reviewing the electrical service; older homes may still have outdated wiring. See ' + link('knob-and-tube-removal', 'knob-and-tube removal') + ' and ' + link('panel-upgrade', 'panel upgrades') + '.', 'Considering how narrow lots and shared walls affect access, entrances and windows.', 'Confirming permits with Toronto Building.'],
    permit: `Toronto Building requires permits for work such as underpinning, structural changes, new windows or doors, heating or plumbing changes, a basement entrance and adding a second dwelling unit. Finishing that involves none of those may not. ${'Confirm your project directly.'}`,
    timelineLede: 'Older Toronto homes often add time versus a newer, previously updated house, mainly because more gets discovered once walls and ceilings open up.',
    timeline: ['Underpinning or wiring replacement, where either is needed, extends the schedule the most in older homes.', 'Permit review, and City comments on older or non-standard construction, can take longer to resolve.', 'Narrow lots and shared walls can slow excavation-based work, such as a new entrance or exterior waterproofing.', 'Inspections at each stage (structural, electrical, plumbing) apply the same way regardless of the home&rsquo;s age, but older homes tend to need more of them.'],
    mistakesLede: 'Homeowners in older Toronto neighbourhoods tend to run into the same few surprises:',
    mistakes: ['Assuming ceiling height is fine without actually measuring it.', 'Not checking the electrical service for knob-and-tube wiring or panel capacity before planning new circuits.', 'Underestimating how a narrow lot or shared wall limits entrance or window options.', 'Budgeting for a straightforward finish without a contingency for what an older foundation or old wiring might reveal.', 'Assuming permit requirements are the same as for a newer home nearby.'],
    ask: ['Has ceiling height been measured, and is underpinning actually needed here?', 'What is the wiring and panel situation, and what would need to be updated?', 'How do neighbouring structures or a narrow lot affect access and entrances?', 'What will require a permit for this house, and who is responsible for it?'],
    notFit: `If your basement is already dry and tall enough, ${link('basement-finishing', 'basement finishing')} may be all you need.`,
    faq: [['Do older Toronto homes need underpinning?', 'Sometimes. Older basements are more likely to have low ceilings, but it varies house by house, so measure before assuming.'], ['Do I need a permit for a basement renovation in Toronto?', 'It depends on the work. Toronto Building lists structural changes, new windows or doors, plumbing or heating changes, underpinning, a basement entrance and a second unit as needing a permit.']],
    related: [['Legal Secondary Suites', 'services/legal-basement-apartment-toronto/'], ['Underpinning', 'services/underpinning/'], ['Knob-and-Tube Removal', 'services/knob-and-tube-removal/'], ['Basement Renovation', 'services/basement-renovation/']],
  },
];

// Pages that are now built by pages/landing.js (homepage-style keyword landing pages) reuse this data.
const LANDING_SLUGS = new Set(['underpinning', 'egress-windows', 'basement-waterproofing', 'interior-waterproofing', 'exterior-waterproofing', 'wet-basement-repair']);
module.exports = { pages };

for (const p of pages) {
  if (LANDING_SLUGS.has(p.slug)) continue;
  const body = `
    <p>${p.intro.join('</p>\n    <p>')}</p>

    ${p.photos ? U.stockGallery(depth, p.photos, { heading: 'Photos for Reference' }) : ''}

    <h2>What the Work Typically Involves</h2>
    ${U.checkList(p.involves)}

    <h2>Timeline Expectations</h2>
    <p>${p.timelineLede}</p>
    ${U.checkList(p.timeline)}

    <h2>Common Mistakes Homeowners Make</h2>
    <p>${p.mistakesLede}</p>
    ${U.checkList(p.mistakes)}

    <h2>Permits and Approvals</h2>
    <p>${p.permit}</p>

    <h2>Questions to Ask a Professional</h2>
    ${U.checkList(p.ask)}

    <h2>When This Is Not the Right Fit</h2>
    <p>${p.notFit}</p>
`;
  guidePage({
    depth,
    path: `services/${p.slug}/`,
    title: p.title,
    description: p.description,
    h1: p.h1,
    sub: p.sub,
    crumbs: [['Home', ''], ['Services', 'services/'], [p.h1.replace(/ in Toronto$/, '').replace(/ for Toronto Basements$/, '').replace('Basement Renovation in Toronto Neighbourhoods', 'Toronto Basement Renovation'), '']],
    active: 'basement-services',
    body,
    faq: p.faq,
    formType: p.formType,
    related: p.related,
    updated: 'Last reviewed September 2026. General planning information; Reno Rise does not perform this work. Confirm requirements for your property with Toronto Building and qualified professionals.',
  });
}
