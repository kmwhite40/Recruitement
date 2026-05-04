/* ScholarPath Athletics — interactivity */
(function () {
  'use strict';

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // Billing toggle (subscription page)
  const billingToggle = document.querySelector('.billing-toggle');
  if (billingToggle) {
    const buttons = billingToggle.querySelectorAll('button');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        document.querySelectorAll('[data-monthly], [data-annual]').forEach((el) => {
          if (mode === 'monthly') {
            if (el.dataset.monthly !== undefined) el.textContent = el.dataset.monthly;
            if (el.dataset.annualNote !== undefined) el.textContent = el.dataset.annualNote;
          } else {
            if (el.dataset.annual !== undefined) el.textContent = el.dataset.annual;
            if (el.dataset.annualNote !== undefined) el.textContent = el.dataset.annualNote;
          }
        });
        document.querySelectorAll('.plan-price .per').forEach((el) => {
          el.textContent = mode === 'monthly' ? '/ mo' : '/ yr';
        });
        document.querySelectorAll('[data-amount-monthly]').forEach((el) => {
          el.textContent = mode === 'monthly' ? el.dataset.amountMonthly : el.dataset.amountAnnual;
        });
      });
    });
  }

  // Role pill switcher
  const rolePills = document.querySelectorAll('.role-pill');
  rolePills.forEach((p) => {
    p.addEventListener('click', () => {
      rolePills.forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
    });
  });

  // Tabs
  document.querySelectorAll('[data-tabs]').forEach((tabset) => {
    const tabs = tabset.querySelectorAll('.tab');
    tabs.forEach((t) => {
      t.addEventListener('click', () => {
        tabs.forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const target = t.dataset.target;
        document.querySelectorAll(`[data-panel]`).forEach((p) => {
          p.classList.toggle('hidden', p.dataset.panel !== target);
        });
      });
    });
  });

  // Score ring drawing
  document.querySelectorAll('.score-ring').forEach((ring) => {
    const value = parseInt(ring.dataset.value || '0', 10);
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    ring.innerHTML = `
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="${radius}" stroke="rgba(255,255,255,0.08)" stroke-width="12" fill="none" />
        <circle cx="90" cy="90" r="${radius}" stroke="url(#ringGrad)" stroke-width="12" fill="none"
          stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-linecap="round"
          style="transition: stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1);" />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2BB673"/>
            <stop offset="100%" stop-color="#5BD89B"/>
          </linearGradient>
        </defs>
      </svg>
      <div class="ring-value">${value}<small> / 100</small></div>
    `;
    requestAnimationFrame(() => {
      const animated = ring.querySelector('circle:nth-child(2)');
      if (animated) animated.style.strokeDashoffset = offset;
    });
  });

  // Soft scroll-fade in
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('fade-up');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-animate]').forEach((el) => io.observe(el));
  }

  // Year in footer
  const y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
