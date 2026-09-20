// Reno Rise — shared interactions

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Mobile nav ----------
  // A modal menu: while it is open the page behind it is made inert, so keyboard focus and screen readers stay in the
  // menu without a focus trap. Tab past the last item leaves the page (as with any modal); Escape or Close always exits.
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const closeBtn = document.querySelector('.mobile-nav-close');

  const setPageInert = (inert) => {
    Array.from(document.body.children).forEach((el) => {
      if (el === mobileNav || el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT') return;
      el.inert = inert;
    });
  };

  const setMobileNav = (open) => {
    if (!mobileNav) return;
    const wasOpen = mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    setPageInert(open);
    if (open) closeBtn?.focus();
    else if (wasOpen && toggle && toggle.offsetParent !== null) toggle.focus();
  };

  toggle?.addEventListener('click', () => setMobileNav(true));
  closeBtn?.addEventListener('click', () => setMobileNav(false));
  mobileNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMobileNav(false)));

  // ---------- Desktop "Basement Services" dropdown ----------
  const dropdowns = Array.from(document.querySelectorAll('.nav-dropdown'));
  const menuLinks = (dd) => Array.from(dd.querySelectorAll('.nav-dropdown-menu a'));
  const closeDropdown = (dd, returnFocus) => {
    dd.classList.remove('open');
    dd.dispatchEvent(new CustomEvent('dropdown-closed'));
    const btn = dd.querySelector('.nav-dropdown-toggle');
    btn?.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn?.focus();
  };
  const openDropdown = (dd) => {
    dropdowns.forEach((other) => { if (other !== dd) closeDropdown(other, false); });
    dd.classList.add('open');
    dd.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'true');
  };

  dropdowns.forEach((dd) => {
    const btn = dd.querySelector('.nav-dropdown-toggle');
    if (!btn) return;
    let leaveTimer = null;
    let hoverOpened = false; // opened only by the mouse resting on it; a click then pins it open instead of closing it
    dd.addEventListener('dropdown-closed', () => { hoverOpened = false; });

    // Click / tap / Enter / Space (a <button> turns Enter and Space into click).
    btn.addEventListener('click', () => {
      if (dd.classList.contains('open') && hoverOpened) { hoverOpened = false; return; }
      hoverOpened = false;
      if (dd.classList.contains('open')) closeDropdown(dd, false);
      else openDropdown(dd);
    });
    // Arrow keys move into and around the list.
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      openDropdown(dd);
      const links = menuLinks(dd);
      (e.key === 'ArrowDown' ? links[0] : links[links.length - 1])?.focus();
    });
    dd.querySelector('.nav-dropdown-menu')?.addEventListener('keydown', (e) => {
      const links = menuLinks(dd);
      const i = links.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = links[(i + 1) % links.length];
      else if (e.key === 'ArrowUp') next = links[(i - 1 + links.length) % links.length];
      else if (e.key === 'Home') next = links[0];
      else if (e.key === 'End') next = links[links.length - 1];
      if (next) { e.preventDefault(); next.focus(); }
    });
    // Mouse hover opens it too (touch has no hover, so it uses the tap above). Script-driven so aria-expanded matches.
    dd.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(leaveTimer);
      if (!dd.classList.contains('open')) { openDropdown(dd); hoverOpened = true; }
    });
    dd.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      leaveTimer = setTimeout(() => {
        if (hoverOpened && !dd.contains(document.activeElement)) { closeDropdown(dd, false); hoverOpened = false; }
      }, 180);
    });
    // Tabbing out of the menu closes it.
    dd.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !dd.contains(e.relatedTarget)) { closeDropdown(dd, false); hoverOpened = false; }
    });
  });
  // Clicking or tapping anywhere else closes it.
  document.addEventListener('click', (e) => {
    dropdowns.forEach((dd) => { if (!dd.contains(e.target)) closeDropdown(dd, false); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    dropdowns.forEach((dd) => { if (dd.classList.contains('open')) closeDropdown(dd, dd.contains(document.activeElement)); });
    if (mobileNav?.classList.contains('open')) setMobileNav(false);
  });

  // If the window is resized so the hamburger disappears (or the desktop nav does), close whatever is open.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (toggle && toggle.offsetParent === null && mobileNav?.classList.contains('open')) setMobileNav(false);
      const nav = document.querySelector('.main-nav');
      if (nav && nav.offsetParent === null) dropdowns.forEach((dd) => closeDropdown(dd, false));
    }, 100);
  });

  // ---------- Homepage hero background video ----------
  // Muted, looping and decorative. The file is only fetched on wider screens (phones keep the still poster), it does not
  // start for people who prefer reduced motion or have Data Saver on, and a visible button pauses or plays it at any time.
  const heroVideo = document.querySelector('[data-hero-video]');
  const videoBtn = document.querySelector('.hero-video-toggle');
  if (heroVideo && videoBtn) {
    const wide = window.matchMedia('(min-width: 861px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    let userPaused = reduced.matches || saveData;
    let attached = false;
    const label = () => { videoBtn.textContent = heroVideo.paused ? 'Play background video' : 'Pause background video'; };
    const play = () => {
      if (!attached) {
        attached = true;
        const src = document.createElement('source');
        src.src = heroVideo.getAttribute('data-src');
        src.type = 'video/mp4';
        heroVideo.appendChild(src);
        heroVideo.load();
      }
      const p = heroVideo.play();
      if (p && p.catch) p.catch(() => {}); // blocked autoplay just leaves the poster showing
    };
    const sync = () => {
      videoBtn.hidden = !wide.matches;
      if (!wide.matches) { heroVideo.pause(); return; }
      if (userPaused) heroVideo.pause(); else play();
      label();
    };
    heroVideo.addEventListener('play', label);
    heroVideo.addEventListener('pause', label);
    videoBtn.addEventListener('click', () => {
      userPaused = !heroVideo.paused;
      if (userPaused) heroVideo.pause(); else play();
      label();
    });
    wide.addEventListener('change', sync);
    sync();
  }

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
