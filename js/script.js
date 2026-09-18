// Reno Rise — shared interactions

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const closeBtn = document.querySelector('.mobile-nav-close');

  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => mobileNav.classList.add('open'));
  }
  if (closeBtn && mobileNav) {
    closeBtn.addEventListener('click', () => mobileNav.classList.remove('open'));
  }
  mobileNav?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileNav.classList.remove('open'));
  });

  // Sticky header shadow on scroll
  const header = document.querySelector('.site-header');
  if (header && header.classList.contains('solid')) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  // Services carousel arrows
  const track = document.querySelector('.services-track');
  const prevBtn = document.querySelector('[data-carousel="prev"]');
  const nextBtn = document.querySelector('[data-carousel="next"]');
  if (track && prevBtn && nextBtn) {
    const scrollAmount = () => track.querySelector('.service-card')?.offsetWidth + 24 || 300;
    prevBtn.addEventListener('click', () => track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => track.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
  }

  // Testimonial dots (simple fade cycle if more than one group is added later)
  const dots = document.querySelectorAll('.dots span');
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      dots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  // Lead / quote forms — client-side confirmation only.
  // NOTE: this site has no backend. Submitting here does not send an email,
  // SMS, or CRM notification anywhere. Wire this up to a real form
  // endpoint (Formspree, Netlify Forms, a serverless function, etc.)
  // before relying on it to capture real leads.
  document.querySelectorAll('form.lead-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const successEl = document.getElementById(`${form.id}-success`);
      if (successEl) {
        form.style.display = 'none';
        successEl.classList.add('show');
      }
    });
  });

  // Filter bar (blog/services/locations index pages)
  const filterButtons = document.querySelectorAll('.filter-bar button');
  const filterCards = document.querySelectorAll('[data-category]');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      filterCards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
});
