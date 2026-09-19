# Site tooling

The marketing site is static HTML. Shared blocks (header, mobile nav, footer, CTA band, structured data)
repeat on every page, so they are generated instead of hand-edited.

```
node tools/site/build.js      # regenerate pages, sync every page, rebuild sitemap.xml, run checks
node tools/site/sync.js       # only the sitewide sync (add --check for a dry run)
node tools/site/check.js      # static QA: links, anchors, canonicals, metadata, JSON-LD, sitemap, forbidden claims
```

- `lib.js` – header/footer/CTA/disclosure components, canonical destinations, nav menu.
- `page.js` – page shell and structured-data (Organization, WebSite, WebPage, Service, BreadcrumbList, FAQPage, BlogPosting).
- `pages/*.js` – generators for the homepage, the legal secondary suite guide, basement pages, services directory,
  planning-centre articles, locations, contact/about/privacy/terms/404.
- `claims.js` – text rules that remove unverifiable claims and convert first-person "we do the work" copy on the
  secondary (non-basement) service pages.
- `legacy.js` – one-off cleanup of the five older general-renovation articles.

Rules: Reno Rise is an independent enquiry and contractor-matching service. Do not add claims about crews, permits,
licences, warranties, reviews, customer counts or quote turnaround. Regulatory content must cite official sources and
stay qualified. `check.js` fails the build when known unsupported claims reappear.
Tools are excluded from deployment by `.vercelignore`.
