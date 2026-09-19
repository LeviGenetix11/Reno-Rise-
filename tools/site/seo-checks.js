// On-page SEO checklist (SEO_brief/on-page-seo.md) checks for the Basement Planning Centre guides.
'use strict';

function seoChecks(pages, warn) {
  for (const { rel, html } of pages.values()) {
    if (rel !== '404.html' && !/rel="apple-touch-icon"/.test(html)) warn(rel, 'missing apple-touch-icon');
    if (!/^blog\/[^/]+\.html$/.test(rel) || !html.includes('class="post-hero"')) continue;

    const faqs = (html.match(/class="faq-item"/g) || []).length;
    if (faqs < 4 || faqs > 8) warn(rel, `FAQ has ${faqs} questions (checklist: 4-8)`);
    if (!/"@type":"FAQPage"/.test(html)) warn(rel, 'missing FAQPage schema');
    if (!/"@type":"BlogPosting"/.test(html)) warn(rel, 'missing BlogPosting schema');

    const article = (html.match(/<article[\s\S]*?<\/article>/) || [''])[0];
    const internal = (article.match(/href="(?!https?:|#|mailto:|tel:)[^"]+"/g) || []).length;
    const external = (article.match(/href="https?:[^"]+"[^>]*rel="noopener"/g) || []).length;
    if (internal < 3) warn(rel, `only ${internal} internal links (checklist: 3-5+)`);
    if (external < 2) warn(rel, `only ${external} external links with rel=noopener (checklist: 2-3)`);
    if (!/<img[^>]*width="1200"[^>]*height="800"/.test(html)) warn(rel, 'hero image missing width/height');

    const title = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/&amp;/g, '&');
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    if (title.length < 45 || title.length > 62) warn(rel, `title ${title.length} chars (checklist: 50-60)`);
    if (desc.length < 145 || desc.length > 165) warn(rel, `meta description ${desc.length} chars (checklist: 150-160)`);
    if (!/Published [A-Z][a-z]+ \d+, \d{4}/.test(html) || !/Last updated/.test(html)) warn(rel, 'missing visible published / last updated date');

    const text = article.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    const first100 = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ').toLowerCase();
    const h1 = ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '');
    if (!/basement/.test(first100)) warn(rel, 'primary keyword (basement) not in the first 100 words');
    if (!/!/.test(text) === false) warn(rel, 'contains an exclamation mark');
    if (!h1) warn(rel, 'missing h1');
  }
}

module.exports = { seoChecks };
