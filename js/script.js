// Reno Rise — shared interactions

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Mobile nav ----------
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const closeBtn = document.querySelector('.mobile-nav-close');

  const setMobileNav = (open) => {
    if (!mobileNav) return;
    mobileNav.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (open) closeBtn?.focus();
    else if (document.activeElement && mobileNav.contains(document.activeElement)) toggle?.focus();
  };

  toggle?.addEventListener('click', () => setMobileNav(true));
  closeBtn?.addEventListener('click', () => setMobileNav(false));
  mobileNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMobileNav(false)));

  // ---------- Desktop "Basement Services" dropdown ----------
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  const closeDropdown = (dd, returnFocus) => {
    dd.classList.remove('open');
    const btn = dd.querySelector('.nav-dropdown-toggle');
    btn?.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn?.focus();
  };
  dropdowns.forEach((dd) => {
    const btn = dd.querySelector('.nav-dropdown-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const open = !dd.classList.contains('open');
      dropdowns.forEach((other) => closeDropdown(other, false));
      dd.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    dd.addEventListener('focusout', (e) => {
      if (!dd.contains(e.relatedTarget)) closeDropdown(dd, false);
    });
  });
  document.addEventListener('click', (e) => {
    dropdowns.forEach((dd) => { if (!dd.contains(e.target)) closeDropdown(dd, false); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    dropdowns.forEach((dd) => { if (dd.classList.contains('open')) closeDropdown(dd, true); });
    if (mobileNav?.classList.contains('open')) setMobileNav(false);
  });

  // ---------- Sticky header shadow on scroll ----------
  const header = document.querySelector('.site-header');
  if (header && header.classList.contains('solid')) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  // ---------- Filter bar (blog index) ----------
  // A card can belong to several categories: data-category="costs permits".
  const filterButtons = document.querySelectorAll('.filter-bar button');
  const filterCards = document.querySelectorAll('[data-category]');
  const emptyNote = document.querySelector('[data-filter-empty]');
  filterButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      const filter = btn.dataset.filter;
      let visible = 0;
      filterCards.forEach((card) => {
        const match = filter === 'all' || card.dataset.category.split(/\s+/).includes(filter);
        card.hidden = !match;
        if (match) visible += 1;
      });
      if (emptyNote) emptyNote.hidden = visible > 0;
    });
  });
});
