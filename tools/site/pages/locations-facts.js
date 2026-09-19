// Verified local information for the location pages. Every entry was read from the municipality's own
// published page during the September 2026 review (URL kept next to the facts). Facts that change often
// (fees, incentive deadlines) are either left out or dated. Municipalities not listed here have NOT been
// researched, so their pages stay noindex until someone adds sourced local content.
'use strict';

const REVIEWED = 'September 2026';

const MUNICIPAL = {
  mississauga: {
    name: 'City of Mississauga',
    url: 'https://www.mississauga.ca/services-and-programs/building-and-renovating/registering-a-second-unit/',
    facts: [
      'Second units (basement apartments, in-law suites and similar) in detached, semi-detached and townhouse properties must be registered under Mississauga&rsquo;s Second Units Registration By-law.',
      'Registration is done by email: proof of ownership, a copy of the second unit building permit signed off by all City inspectors, and the registration form.',
      'The City says there is no fee to register. Building permits, fire inspections, design work and construction still cost money.',
    ],
  },
  brampton: {
    name: 'City of Brampton',
    url: 'https://www.brampton.ca/EN/residents/Building-Permits/second-dwelling',
    facts: [
      'Brampton allows a maximum of three units on a property (for example a principal dwelling with an attached second unit and a garden suite, or an attached second and third unit).',
      'Second units, third units and garden suites must be registered with the City, and building permits are required for all of them.',
      'Since April 1, 2024, properties on Conservation Authority lands need approval from Credit Valley Conservation or the Toronto and Region Conservation Authority before permits proceed.',
      'Brampton charges recall fees on additional-unit permits when an inspection fails twice, so work should be ready before inspectors arrive.',
    ],
  },
  markham: {
    name: 'City of Markham',
    url: 'https://www.markham.ca/about-city-markham/city-hall/bylaw/registration-basement-apartments-and-second-suites',
    facts: [
      'Two-unit houses must be registered under Markham&rsquo;s Occupancy Registration of Two-Unit Residential By-law 2018-57, and the City warns that occupying an unregistered two-unit house can lead to court action.',
      'Markham Fire &amp; Emergency Services inspects both units as part of registration.',
      'New second suites need a building permit from Building Standards. Suites created before July 1, 1993 use a declaration form and are assessed under the Fire Code&rsquo;s retrofit provisions for older units.',
    ],
  },
  oakville: {
    name: 'Town of Oakville',
    url: 'https://www.oakville.ca/home-environment/building-renovations/building-permits-inspections/construction-projects/accessory-apartment/',
    facts: [
      'Before a building permit, Oakville expects a separate zoning certificate of occupancy approval.',
      'An accessory apartment needs a bedroom, kitchen, living area, washroom and access to laundry facilities (combined spaces are allowed).',
      'Depending on the property, other approvals can come first: utility locates, heritage approval, conservation approval near wetlands or waterways, tree permits, and a development engineering permit for site alteration.',
      'Drawings must show fire separations, HVAC design and water service calculations. Development charges may apply, and property tax assessments can rise after the work.',
    ],
  },
  burlington: {
    name: 'City of Burlington',
    url: 'https://www.burlington.ca/en/building-and-renovating/additional-residential-units.aspx',
    facts: [
      'Burlington allows applications for one, two or three additional residential units on a property, and notes that not every property will qualify.',
      'The first step is a Pre-Building Approval application, followed by a building permit.',
      'Parking rules published by the City: two spaces for the primary home, none for the first additional unit, and one more space for a second or third unit.',
      'The City runs an incentive program (forgivable loans, grants and fee waivers) for qualifying new units and offers a look-up tool for detached units.',
    ],
  },
  pickering: {
    name: 'City of Pickering',
    url: 'https://www.pickering.ca/business-building-development/building-and-renovating/additional-dwelling-units/',
    facts: [
      'Up to two additional dwelling units are permitted on qualifying detached, semi-detached and townhouse properties.',
      'Registration is mandatory under Municipal By-law 8040/23 and includes inspections by both Fire Services and Building Services.',
      'Since April 1, 2025, the Ontario Building Code 2024 applies to new permit applications.',
      'Five pre-approved detached additional dwelling unit designs were developed with the Town of Whitby, though building permits are still required.',
    ],
  },
  whitby: {
    name: 'Town of Whitby',
    url: 'https://www.whitby.ca/services-and-payments/building-and-renovating/additional-dwelling-units/',
    facts: [
      'Additional dwelling units must be registered with Enforcement Services under By-law 8156-25.',
      'A licensed electrical contractor must provide a Certificate of Acceptance showing compliance with the Ontario Electrical Safety Code, and Enforcement Services then inspects the exterior of the property.',
      'Whitby&rsquo;s fee-reimbursement incentive has dated deadlines: a complete building permit application by December 31, 2026, and registration by March 31, 2027. Check the Town&rsquo;s page for current terms.',
    ],
  },
  oshawa: {
    name: 'City of Oshawa',
    url: 'https://www.oshawa.ca/business-development/housing-permits-and-licences/two-unit-houses/',
    facts: [
      'Under Oshawa&rsquo;s Two Unit House Registration By-law, every two-unit house must be registered, and failing to register is an offence under the by-law.',
      'Units created before July 1994 register with an application and a declaration form once they meet property standards, Building Code and Fire Code requirements.',
      'Units created after July 1994 need a building permit before the second unit is created.',
    ],
  },
  milton: {
    name: 'Town of Milton',
    url: 'https://www.milton.ca/en/business-and-development/additional-residential-units.aspx',
    facts: [
      'On urban lots with municipal water and sewage services, Milton allows up to three additional residential units, for a total of four units on the property.',
      'Since April 1, 2025, new and existing additional units must be registered with the Town (one-time fee).',
      'A building permit is required, and units must meet the Zoning By-law, Ontario Building Code and Fire Code.',
    ],
  },
  newmarket: {
    name: 'Town of Newmarket',
    url: 'https://www.newmarket.ca/business-development/building-renovating/additional-residential-unit',
    facts: [
      'Newmarket asks for a Zoning Preliminary Review before the building permit application.',
      'Registration became mandatory in 2013 under Bylaw 2013-13 (as amended) and requires fire department and Electrical Safety Authority documentation or a final permit inspection report.',
      'Registered properties receive an &ldquo;N&rdquo; plate and the additional unit gets a &ldquo;B&rdquo; address designation, which helps emergency responders and waste collection tell the units apart.',
    ],
  },
  'richmond-hill': {
    name: 'City of Richmond Hill',
    url: 'https://www.richmondhill.ca/en/online-services/additional-residential-unit.aspx',
    facts: [
      'By-law 143-24 (December 11, 2024) allows up to three additional residential units on a property, for a maximum of four dwelling units, where the property is connected to municipal water and sewage.',
      'Building permit drawings must be prepared by a qualified professional such as an architect or engineer.',
      'A separate Electrical Safety Authority permit is required, because the Electrical Safety Code adds requirements for additional units.',
      'Pre-approved detached unit designs are available to speed up processing.',
    ],
  },
};

const TORONTO = {
  name: 'City of Toronto',
  subsidyUrl: 'https://www.toronto.ca/services-payments/water-environment/managing-rain-melted-snow/basement-flooding/basement-flooding-protection-subsidy-program/',
  ravineUrl: 'https://www.toronto.ca/services-payments/building-construction/tree-ravine-protection-permits/when-to-apply-for-a-tree-or-ravine-permit/',
  valveUrl: 'https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-permit-application-guides/standalone-plumbing-mechanical-and-drains/backwater-valve/',
};

// Toronto neighbourhoods: geography facts only (hedged). The City-wide rules live on locations/toronto.html.
const TORONTO_GEO = {
  etobicoke: 'Etobicoke is crossed by valleys such as the Humber River and Mimico Creek, so some properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  scarborough: 'Scarborough includes ravines, the Rouge Valley and the Scarborough Bluffs, so some properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  'north-york': 'North York includes stretches of the Don River valley and other ravines, so some properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  'east-york': 'East York sits beside the Don Valley, so some properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  york: 'Some York properties sit near the Humber River valley, so they may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  'downtown-toronto': 'Downtown Toronto borders the Don Valley, and some nearby properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
  'midtown-toronto': 'Midtown includes ravine pockets, and some properties may fall under the City&rsquo;s Ravine and Natural Feature Protection By-law.',
};

module.exports = { REVIEWED, MUNICIPAL, TORONTO, TORONTO_GEO };
