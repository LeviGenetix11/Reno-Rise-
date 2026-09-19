// Generates /blog/ as the "Basement Planning Centre".
'use strict';
const L = require('../lib');
const PG = require('../page');
const U = require('./util');
const { POSTS } = require('./posts');

const depth = 1;
const h = (t) => L.href(depth, t);
const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';

const FILTERS = [
  ['all', 'All Guides'],
  ['planning', 'Basement Planning'],
  ['suites', 'Legal Secondary Suites'],
  ['costs', 'Costs'],
  ['permits', 'Permits & Code'],
  ['waterproofing', 'Waterproofing'],
  ['underpinning', 'Underpinning'],
  ['general', 'General Renovations'],
];

const LEGACY = [
  { file: 'how-much-does-a-home-renovation-cost-gta.html', cats: 'general costs', tag: 'General renovations', img: 'images/blog/home-renovation-cost-gta/hero-home-renovation.jpg', alt: 'Home renovation project in the GTA', date: 'Sep 17, 2026', read: '13 min read', title: 'Home Renovation Cost in the GTA: Illustrative 2026 Planning Ranges', text: 'General planning ranges by category for whole-home projects. Illustrative only, not quotes.' },
  { file: 'renovation-cost-by-room-gta.html', cats: 'general costs', tag: 'General renovations', img: 'images/home/gallery-deck.jpg', alt: 'Deck project in a GTA home', date: 'Sep 17, 2026', read: '9 min read', title: 'Renovation Cost by Room: Deck, Attic, Garage, Closet, Bedroom, Basement', text: 'Illustrative planning ranges for six commonly asked-about rooms. Not quotes.' },
  { file: 'home-addition-cost-gta.html', cats: 'general costs', tag: 'General renovations', img: 'images/blog/home-addition-cost-gta/home-addition-construction.jpg', alt: 'Home addition under construction', date: 'Sep 17, 2026', read: '10 min read', title: 'Home Addition Cost in the GTA: Illustrative Planning Ranges', text: 'Illustrative planning ranges for bump-outs and one- and two-storey additions.' },
  { file: 'kitchen-renovation-cost-guide.html', cats: 'general costs', tag: 'General renovations', img: 'images/blog/kitchen-renovation-cost/kitchen-renovation-in-progress.jpg', alt: 'Kitchen renovation in progress', date: 'Sep 16, 2026', read: '9 min read', title: 'Kitchen Renovation Cost in the GTA: Illustrative 2026 Planning Ranges', text: 'Illustrative planning ranges for kitchen work and how to compare quotes.' },
  { file: 'best-renovations-to-do-in-winter-gta.html', cats: 'general planning', tag: 'General renovations', img: 'images/blog/winter-renovation-gta/winter-house-exterior.jpg', alt: 'Snow-covered GTA home exterior in winter', date: 'Sep 17, 2026', read: '7 min read', title: 'Best Renovations to Do in Winter in the GTA', text: 'Which projects suit the colder months, and which are better left to spring.' },
];

const arrow = L.ICON.arrow;

const plainCard = (o) => `      <article class="post-card" data-category="${o.cats}">
        <div class="thumb thumb-plain">
          <span class="tag">${o.tag}</span>
          <span class="thumb-title">${o.short}</span>
        </div>
        <div class="body">
          <div class="meta"><span>${clock} Sep 19, 2026</span></div>
          <h3>${o.title}</h3>
          <p>${o.excerpt}</p>
          <a class="readmore" href="${o.href}">Read guide ${arrow}</a>
        </div>
      </article>`;

const imgCard = (o) => `      <article class="post-card" data-category="${o.cats}">
        <div class="thumb">
          <img src="../${o.img}" alt="${o.alt}" loading="lazy">
          <span class="tag">${o.tag}</span>
        </div>
        <div class="body">
          <div class="meta"><span>${clock} ${o.date}</span><span>${clock} ${o.read}</span></div>
          <h3>${o.title}</h3>
          <p>${o.text}</p>
          <a class="readmore" href="${o.file}">Read article ${arrow}</a>
        </div>
      </article>`;

const suiteCard = plainCard({
  cats: 'suites planning permits', tag: 'Legal secondary suites', short: 'Legal Secondary Suite Guide',
  title: 'Legal Basement Apartments & Secondary Suites in Toronto: The Guide',
  excerpt: 'Our cornerstone guide: what makes a basement apartment legal, what to confirm with Toronto Building, and what to ask contractors.',
  href: h('services/legal-basement-apartment-toronto/'),
});

const stockCard = (p) => `      <article class="post-card" data-category="${p.cats}">
        <div class="thumb">
          <img src="../images/stock/${p.img}-700w.webp" width="700" height="467" alt="${p.alt}" loading="lazy">
          <span class="tag">${p.tag}</span>
        </div>
        <div class="body">
          <div class="meta"><span>${clock} Sep 19, 2026</span></div>
          <h3>${p.title}</h3>
          <p>${p.excerpt}</p>
          <a class="readmore" href="${p.file}">Read guide ${arrow}</a>
        </div>
      </article>`;

const postCards = POSTS.map(stockCard);

const pc = (tag, title, text, href) => `        <a class="pc-card" href="${href}">
          <span class="pc-tag">${tag}</span>
          <h3>${title}</h3>
          <p>${text}</p>
        </a>`;

const main = `
<section class="section">
  <div class="container">
    <div class="planning-centre">
      <span class="eyebrow on-dark">Start here</span>
      <h2>Basement Planning Centre</h2>
      <p>Plain-language guides for Toronto homeowners planning a basement renovation or legal secondary suite. Start with these three, then browse everything below.</p>
      <div class="pc-grid">
${pc('Cornerstone guide', 'Legal Basement Apartments &amp; Secondary Suites', 'What makes a unit legal, what to confirm with Toronto Building and what to ask contractors.', h('services/legal-basement-apartment-toronto/'))}
${pc('Permits &amp; code', 'Basement Renovation Permits in Toronto', 'What the City says needs a permit, what may not, and who is responsible.', 'basement-renovation-permits-toronto.html')}
${pc('Costs', 'Basement Renovation Cost in Toronto', 'What drives the price and how to compare itemized quotes fairly.', 'basement-renovation-cost-toronto.html')}
      </div>
    </div>

    <div class="filter-bar" role="group" aria-label="Filter guides by topic">
${FILTERS.map(([k, label], i) => `      <button type="button"${i === 0 ? ' class="active"' : ''} data-filter="${k}">${label}</button>`).join('\n')}
    </div>
    <div class="card-grid">
${suiteCard}
${postCards.join('\n')}
${LEGACY.map(imgCard).join('\n')}
    </div>
    <p data-filter-empty hidden style="text-align:center;color:var(--muted);margin-top:28px;">No guides in this category yet. Try &ldquo;All Guides&rdquo;.</p>
  </div>
</section>
`;

const hero = PG.pageHero({
  depth,
  h1: 'Basement Planning Centre',
  sub: 'Cost, permit and secondary-suite guides for Toronto basements.',
  crumbs: [['Home', ''], ['Basement Planning Centre', '']],
  variant: 'hero-dark',
});

U.write('blog/index.html', PG.renderPage({
  depth,
  path: 'blog/',
  title: 'Basement Planning Centre: Toronto Cost, Permit & Suite Guides | Reno Rise',
  description: 'Plain-language guides to Toronto basement renovation costs, permits, legal secondary suites, underpinning and waterproofing, plus general renovation articles.',
  active: 'guides',
  hero,
  main,
}));
