// Text rules applied by sync.js to every page. Each rule is [regex, replacement].
// They remove or neutralise claims the business cannot currently substantiate
// (own crews, licensing/insurance/warranty promises, quote-turnaround promises,
// customer counts, "we pull permits", etc.) and replace them with wording that
// matches how Reno Rise actually operates: an independent project-enquiry and
// contractor-matching service.
'use strict';

const CLAIM_RULES = [
  // URLs that moved to the keyword-map targets (see vercel.json redirects)
  [/sump-pump-installation\//g, 'sump-pump/'],
  [/backwater-valve-installation\//g, 'backwater-valve/'],

  // Brand
  [/Reno Rise Renovations/g, 'Reno Rise'],
  [/Licensed (?:&amp;|&) Insured\s*·\s*/g, ''],
  [/Licensed (?:&amp;|&) Insured/g, 'Independent Professionals'],
  [/Licensed and Insured/g, 'Independent Professionals'],

  // Calls to action that promised something free / quick / in-home
  [/Request Your Free Assessment/g, 'Request a Basement Assessment'],
  [/Book Your Free Assessment/g, 'Request a Basement Assessment'],
  [/Get a Free Assessment/g, 'Tell Us About Your Project'],
  [/Get Your Free Assessment/g, 'Request a Basement Assessment'],
  [/Book a free in-home assessment and get an itemized quote within 48 hours\./g, 'Tell us about your project and Reno Rise will review the details.'],
  [/Book a free, no-obligation assessment and get a detailed quote within 48 hours\./g, 'Tell us about your project and Reno Rise will review the details.'],
];

// Only applied to <title> / meta description / og / twitter text.
const META_RULES = [
  [/ Licensed and insured, serving/g, ' Serving'],
  [/ Fast 24-hour response\./g, ''],
  [/Get a Free Quote/g, 'Contact Reno Rise'],
  [/content="Reno Rise (?!is\b|helps\b|focuses\b|will\b|reviews\b)(?=[a-z])/g, 'content="General information on '],
  [/ Free itemized quotes in 48 hours\./g, ''],
  [/\b(?:real|honest) cost ranges/g, 'illustrative cost ranges'],
  [/\bReal (cabinetry|GTA|pricing|per-square-foot)/g, 'Illustrative $1'],
];

module.exports = { CLAIM_RULES, META_RULES };

// ---------------------------------------------------------------------------
// Applied only to the article region of the secondary (non-basement) service pages, which were written in
// the first person as if Reno Rise performs the work. Reno Rise is a matching service, so first-person
// "we install / we handle / we pull permits" wording is converted to describe what a professional does.
// ---------------------------------------------------------------------------
const SERVICE_SENTENCE_OVERRIDES = [
  [/Proof of licensing and (?:\$2)?M\+ liability insurance/g, 'Proof of licensing and liability insurance to request'],
  [/which is exactly what (?:we|they)(?:'|’)d recommend doing/g, 'which is exactly what is worth doing'],
  [/(?:We|Professionals typically) provide a written contract, proof of licensing and insurance, and a real portfolio before you sign anything/g, 'Expect a written contract, proof of licensing and insurance, and references or a portfolio before you sign anything'],
  [/the gap between a licensed, insured renovation contractor and an unlicensed one/g, 'the gap between a contractor with proper licensing and insurance and one without'],
  [/Areas We Serve/g, 'Areas Served'],
  [/Areas Professionals typically Serve/g, 'Areas Served'],
  [/, the same standard they hold for every trade they send into your home/g, ''],
  [/, the same standard we hold for every trade we send into your home/g, ''],
  [/We run every trade on a project under one licensed, insured crew, so you have a single point of contact and a single warranty covering the whole job, not five separate subcontractors[^.]*\./g, 'A general contractor coordinates the trades on a project so you have a single point of contact instead of managing several subcontractors yourself. Ask each contractor who is responsible for what.'],
  [/We start every waterproofing job with a real inspection, not a sales pitch[^.]*\./g, 'A good waterproofing professional starts with a real inspection rather than a sales pitch for whichever system is easiest to install, and explains any warranty in writing.'],
  [/We coordinate every interior trade under one crew, so a kitchen, bathroom, and flooring project[^.]*\./g, 'A good contractor coordinates the interior trades so that a kitchen, bathroom and flooring project happening at once does not turn into three separate schedules that do not talk to each other.'],
  [/Several GTA municipalities, including Toronto, offer subsidy programs that offset backwater valve installation costs, and we handle the permit and inspection either way\./g, 'Some GTA municipalities, including Toronto, have offered subsidy programs for backwater valve installation. Check current eligibility with your municipality, and confirm who handles any permit and inspection.'],
  [/We handle the permit application where required, engineer footings/g, 'A professional handles the permit application where required, engineers footings'],
];

const SERVICE_BULLETS = [
  [/Warranty-backed workmanship/g, 'Ask about warranty coverage on the work'],
  [/Warranty-backed on every job/g, 'Ask about warranty coverage on the work'],
  [/Fade- and rot-resistant material warranty/g, 'Fade- and rot-resistant materials (ask about the manufacturer warranty)'],
  [/Manufacturer warranty registration handled for you/g, 'Manufacturer warranty registration (confirm who handles it)'],
  [/One crew across every exterior trade/g, 'Coordination across exterior trades'],
  [/One licensed crew from demo to final walkthrough/g, 'Work from demolition through final walkthrough'],
  [/One licensed crew across the entire renovation/g, 'Coordination across the entire renovation'],
  [/One coordinated crew across every trade/g, 'Coordination across every trade'],
  [/Licensed, insured crew across every trade/g, 'Confirm licensing and insurance for each trade'],
  [/Licensed and insured on every job, every trade/g, 'Confirm licensing and insurance for each trade'],
  [/One warranty covering the entire project/g, 'Ask what warranty covers the project'],
  [/Single point of contact for multi-trade projects/g, 'Clear point of contact for multi-trade projects'],
  [/Written contract and warranty on every job/g, 'Written contract and warranty terms to confirm'],
  [/Proof of licensing and \$2M\+ liability insurance/g, 'Proof of licensing and liability insurance to request'],
  [/Real project portfolio and reviews/g, 'References and portfolio to request'],
  [/Free in-home assessment before any commitment/g, 'Site assessment before any commitment'],
  [/In-person assessment before any pricing/g, 'Site assessment before pricing'],
  [/What(?:'|&#39;|’)s Included/g, 'What This Work Typically Includes'],
  [/, Done Right the First Time/g, ': What to Know Before You Hire'],
  [/Typical GTA Range/g, 'Illustrative GTA Range'],
  [/What It Costs to Expect/g, 'Illustrative Cost Ranges'],
  [/at the free assessment/g, 'at the site visit'],
  [/\b[Ff]ree,? (?:in-home )?(?:no-obligation )?assessments?\b/g, 'site assessment'],
  [/\b[Ff]ree,? (?:no-obligation )?quotes?\b/g, 'quote'],
];

const SERVICE_FIRST_PERSON = [
  [/\bWe'll\b/g, 'Professionals will'],
  [/\bWe're\b/g, 'Professionals are'],
  [/\bWe've\b/g, 'Professionals have'],
  [/\bWe'd rather\b/g, 'A good professional would rather'],
  [/\bWe'd\b/g, 'Professionals would'],
  [/\bWe (don't|won't|can't|only|rarely|never|always|also|actually)\b/g, 'Professionals $1'],
  [/\bWe (?!typically\b)(\w+)/g, 'Professionals typically $1'],
  [/\bwe'll\b/g, "they'll"],
  [/\bwe're\b/g, "they're"],
  [/\bwe've\b/g, "they've"],
  [/\bwe'd\b/g, "they'd"],
  [/\bwe (\w+)/g, 'they $1'],
  [/\bOur\b/g, 'The'],
  [/\bour\b/g, 'the'],
];

module.exports.SERVICE_SENTENCE_OVERRIDES = SERVICE_SENTENCE_OVERRIDES;
module.exports.SERVICE_BULLETS = SERVICE_BULLETS;
module.exports.SERVICE_FIRST_PERSON = SERVICE_FIRST_PERSON;
