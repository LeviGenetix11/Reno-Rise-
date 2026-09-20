// Generic long-form guide page (basement cluster pages and new planning articles).
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');

const DEFAULT_ASIDE = [
  ['Legal secondary suite guide', 'services/legal-basement-apartment-toronto/'],
  ['Basement renovation planning', 'services/basement-renovation/'],
  ['Permits in Toronto', 'blog/basement-renovation-permits-toronto.html'],
  ['Cost factors', 'blog/basement-renovation-cost-toronto.html'],
];

/**
 * opts: depth, path, title, description, h1, sub, crumbs, active, body (html), faq [[q,a]],
 *       formType, asideLinks, ctaOpts, ogImage, noticeTop (html), updated (string), related [[label,target]],
 *       after (html placed last in the article, e.g. the matching-service disclosure)
 */
function guidePage(o) {
  const { depth } = o;
  const hero = PG.pageHero({ depth, h1: o.h1, sub: o.sub, crumbs: o.crumbs, variant: 'hero-dark' });
  const faq = o.faq && o.faq.length
    ? `\n    <h2 id="faq">Frequently asked questions</h2>\n${U.faqItems(o.faq)}\n`
    : '';
  const related = o.related && o.related.length
    ? `\n    <h2>Related basement resources</h2>\n    ${U.internalLinks(depth, o.related)}\n`
    : '';
  const main = `
<section class="section">
  <div class="container guide-layout">
  <article class="article-wrap">
    ${o.noticeTop || ''}
    ${o.updated ? `<p class="updated-line">${o.updated}</p>` : ''}
${o.body}
${faq}
    ${U.formBand(depth, { type: o.formType || 'Not sure', title: o.formTitle, text: o.formText })}
${related}
    ${o.after || ''}
  </article>
  ${U.guideAside(depth, { links: o.asideLinks || DEFAULT_ASIDE })}
  </div>
</section>
`;
  const ld = o.faq && o.faq.length ? [PG.faqNode(o.faq.map(([q, a]) => [q, U.strip(a)]))] : [];
  if (o.article) ld.push({ '@type': 'BlogPosting', headline: o.article.headline || o.h1, description: o.description, image: o.ogImage, datePublished: o.article.date, dateModified: o.article.date });
  const html = PG.renderPage({
    depth,
    path: o.path,
    title: o.title,
    description: o.description,
    ogImage: o.ogImage,
    robots: o.robots,
    ldGraph: ld,
    active: o.active,
    hero,
    main,
    ctaOpts: o.ctaOpts,
    script: `<script src="${L.up(depth)}js/assessment-form.js"></script>\n`,
  });
  const file = o.path.endsWith('/') ? o.path + 'index.html' : o.path;
  U.write(file, html);
}

module.exports = { guidePage };
