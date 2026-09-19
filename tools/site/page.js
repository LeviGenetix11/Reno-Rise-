// Page shell + structured-data helpers shared by the page generators and sync.js.
'use strict';
const L = require('./lib');
const { SITE, up, escapeHtml } = L;

const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;

function orgNode() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Reno Rise',
    url: `${SITE}/`,
    logo: `${SITE}/images/logo-mark.png`,
    email: L.EMAIL,
    telephone: '+1-289-512-8112',
    areaServed: [
      { '@type': 'City', name: 'Toronto' },
      { '@type': 'AdministrativeArea', name: 'Greater Toronto Area' },
    ],
    description:
      'Reno Rise is an independent project-enquiry and contractor-matching service that helps Toronto homeowners plan basement renovations and legal secondary suites and connect with qualified local professionals.',
  };
}

function websiteNode() {
  return { '@type': 'WebSite', '@id': SITE_ID, name: 'Reno Rise', url: `${SITE}/`, publisher: { '@id': ORG_ID } };
}

function webPageNode(url, name, description, type = 'WebPage') {
  const n = { '@type': type, '@id': `${url}#webpage`, url, name, isPartOf: { '@id': SITE_ID }, about: { '@id': ORG_ID } };
  if (description) n.description = description;
  return n;
}

function breadcrumbNode(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  };
}

function serviceNode({ name, url, description, serviceType }) {
  return {
    '@type': 'Service',
    '@id': `${url}#service`,
    name,
    serviceType: serviceType || 'Homeowner project enquiry and contractor matching',
    description,
    url,
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'City', name: 'Toronto' },
  };
}

function faqNode(qas) {
  return {
    '@type': 'FAQPage',
    mainEntity: qas.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

const ldScript = (graph) =>
  `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}\n</script>`;

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Standard <head> for a page. `path` is the site-relative URL ('' = home, 'services/x/', 'about.html'). */
function head({ depth, path, title, description, ogImage, ldGraph = [], robots = '', extra = '' }) {
  const url = `${SITE}/${path}`;
  const img = ogImage || `${SITE}/images/og/reno-rise-default.png`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t}</title>
<meta name="description" content="${d}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<link rel="canonical" href="${url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"></noscript>
<link rel="stylesheet" href="${up(depth)}css/style.css">
<link rel="icon" type="image/png" href="${up(depth)}images/favicon.png">

${ldGraph.length ? ldScript(ldGraph) + '\n' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Reno Rise">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
${extra}
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>

`;
}

/** Page hero used by inner pages. */
function pageHero({ depth, h1, crumbs, image, sub, variant = '' }) {
  const parts = crumbs
    .map(([label, target], i) => (i === crumbs.length - 1 ? `<span aria-current="page">${label}</span>` : `<a href="${L.href(depth, target)}">${label}</a>`))
    .join(`\n      ${L.ICON.crumb}\n      `);
  const style = image ? ` style="background-image:url('${up(depth)}${image}')"` : '';
  return `<!-- ========== PAGE HERO ========== -->
<section class="page-hero${variant ? ' ' + variant : ''}"${style}>
  <div class="container page-hero-inner">
    <h1>${h1}</h1>
    ${sub ? `<p class="page-hero-sub">${sub}</p>` : ''}
    <div class="breadcrumb" aria-label="Breadcrumb">
      ${parts}
    </div>
  </div>
</section>
`;
}

/** Assemble a full page. */
function renderPage({ depth, path, title, description, ogImage, ldGraph, robots, active, solid = true, hero, main, ctaOpts, script = '', noCta = false, extraHead = '' }) {
  const h = head({ depth, path, title, description, ogImage, ldGraph, robots, extra: extraHead });
  return (
    h +
    L.header(depth, { solid, active }) +
    `<main id="main-content">\n\n` +
    (hero || '') +
    main +
    '\n' +
    (noCta ? '' : L.ctaBand(depth, ctaOpts) + '\n') +
    `</main>\n\n` +
    L.footer(depth) +
    `\n\n<script src="${up(depth)}js/script.js"></script>\n${script}</body>\n</html>\n`
  );
}

module.exports = { ORG_ID, SITE_ID, orgNode, websiteNode, webPageNode, breadcrumbNode, serviceNode, faqNode, ldScript, stripTags, head, pageHero, renderPage };
