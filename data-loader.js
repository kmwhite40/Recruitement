/* ScholarPath — connects static UI to the live API when the server is running.
 * Falls back gracefully to demo content if the API is unavailable (e.g. file://). */
(function () {
  'use strict';

  const ATHLETE_ID = window.SP_ATHLETE_ID || 1;
  const isApiAvailable = location.protocol === 'http:' || location.protocol === 'https:';

  // Register service worker for PWA / offline behaviour
  if ('serviceWorker' in navigator && isApiAvailable) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    if (!res.ok) throw new Error(`api_error_${res.status}`);
    return res.json();
  }

  // Inject a small "live data" indicator
  function showLiveBadge() {
    if (document.querySelector('.sp-live-badge')) return;
    const b = document.createElement('div');
    b.className = 'sp-live-badge';
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1000;padding:0.45rem 0.8rem;background:rgba(43,182,115,0.15);border:1px solid rgba(43,182,115,0.4);border-radius:999px;font-size:0.78rem;color:#2BB673;font-weight:600;backdrop-filter:blur(6px);';
    b.innerHTML = '<span style="display:inline-block;width:8px;height:8px;background:#2BB673;border-radius:50%;box-shadow:0 0 8px #2BB673;margin-right:0.5rem;"></span>Live API';
    document.body.appendChild(b);
  }

  // === Page-specific loaders ===
  async function hydrateDashboard() {
    try {
      const r = await api(`/api/athletes/${ATHLETE_ID}/readiness`);
      const ring = document.querySelector('.score-ring');
      if (ring) {
        ring.dataset.value = r.score;
        // Trigger redraw via app.js helper if present
        const ev = new Event('sp:rerender');
        window.dispatchEvent(ev);
      }
      showLiveBadge();
    } catch (_) { /* keep static content */ }
  }

  async function hydrateProfile() {
    try {
      const data = await api(`/api/athletes/${ATHLETE_ID}`);
      const a = data.athlete;

      const heroH1 = document.querySelector('.profile-hero h1');
      if (heroH1) heroH1.textContent = a.full_name;
      const subline = document.querySelector('.profile-hero .subline');
      if (subline && a.position) {
        subline.textContent = `${a.position} · ${Math.floor(a.height_in/12)}'${a.height_in%12}" · ${a.school_name || ''} · ${a.school_city || ''}, ${a.school_state || ''}`;
      }
      // Update stat tiles
      const tiles = document.querySelectorAll('.stat-row .stat-tile .val');
      if (tiles.length >= 1 && a.gpa) tiles[0].textContent = a.gpa;
      showLiveBadge();
    } catch (_) {}
  }

  async function hydrateEligibility() {
    try {
      const data = await api(`/api/eligibility/${ATHLETE_ID}`);
      const s = data.status;

      const banner = document.querySelector('.elig-banner');
      const lights = document.querySelectorAll('.elig-banner .stoplight .l');
      if (lights.length === 3) {
        lights.forEach(l => l.className = 'l');
        const idx = s.stoplight === 'green' ? 0 : s.stoplight === 'amber' ? 1 : 2;
        lights[idx].classList.add(`on-${s.stoplight}`);
      }
      const h3 = document.querySelector('.elig-banner h3');
      if (h3) h3.textContent = s.stoplight === 'green' ? "You're on pace." : s.stoplight === 'amber' ? "Watch zone." : "Off track.";
      const p = document.querySelector('.elig-banner p');
      if (p) p.textContent = s.one_line;

      // GPA tile
      const gpaEl = document.querySelector('.elig-banner [style*="font-mono"], .elig-banner .mono');
      if (gpaEl && s.core_gpa) gpaEl.textContent = s.core_gpa;

      showLiveBadge();
    } catch (_) {}
  }

  async function hydrateRecruiterSearch() {
    try {
      // Recruiter login required
      const me = await api('/api/auth/me');
      if (me.user.role !== 'recruiter') return;

      const params = new URLSearchParams({ sport: 'soccer', grad_year: '2027', verified_only: 'true', limit: '24' });
      const data = await api('/api/search?' + params.toString());
      const grid = document.querySelector('.athlete-grid');
      if (!grid || !data.athletes.length) return;

      grid.innerHTML = data.athletes.map(a => `
        <article class="athlete-card" onclick="location.href='athlete-profile.html?id=${a.id}'">
          <div class="athlete-thumb" style="background:linear-gradient(135deg,#1E7A4D,#0B1A2B);">
            <span style="font-size:3.5rem;opacity:0.6;">⚽</span>
            <span class="badge ${a.verified_film_count > 0 ? 'badge-verified' : ''} verified">
              ${a.verified_film_count > 0 ? '<span class="dot dot-green"></span> Verified' : 'Self-Reported'}
            </span>
            <span class="grad-year">${a.grad_year}</span>
          </div>
          <div class="athlete-info">
            <div class="flex-between">
              <div>
                <div class="name">${a.full_name}</div>
                <div class="meta">${a.position || ''} · ${a.height_in ? Math.floor(a.height_in/12)+"'"+(a.height_in%12)+'"' : ''} · ${a.school_name || ''}, ${a.school_state || ''}</div>
              </div>
              <span class="badge badge-verified" style="font-size:0.7rem;">${a.readiness_score || 0}/100</span>
            </div>
            <div class="athlete-stats">
              <div class="s"><div class="lbl">GPA</div><div class="val">${a.gpa ?? '—'}</div></div>
              <div class="s"><div class="lbl">Film</div><div class="val">${a.verified_film_count}</div></div>
              <div class="s"><div class="lbl">NCAA</div><div class="val" style="font-size:0.78rem;">${a.ncaa_status === 'on_track' ? 'On Track' : a.ncaa_status}</div></div>
            </div>
          </div>
        </article>
      `).join('');

      const counter = document.querySelector('.flex-between .text-dim strong');
      if (counter) counter.textContent = data.count;

      showLiveBadge();
    } catch (_) {}
  }

  // === Real-time SSE for athlete dashboard ===
  function showToast(html, ms = 6000) {
    const t = document.createElement('div');
    t.className = 'sp-toast';
    t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.4s, transform 0.4s';
      t.style.opacity = 0;
      t.style.transform = 'translateX(40px)';
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  function startLiveStream() {
    if (typeof EventSource === 'undefined') return;
    let es;
    try { es = new EventSource('/api/events/stream'); } catch (_) { return; }
    es.addEventListener('hello', () => { /* connected */ });
    es.addEventListener('profile_view', (e) => {
      const d = JSON.parse(e.data);
      showToast(`<strong>${d.school}</strong> just opened your profile.`);
    });
    es.addEventListener('film_view', (e) => {
      const d = JSON.parse(e.data);
      showToast(`<strong>${d.school}</strong> is watching your film right now.`);
    });
    es.addEventListener('watchlist_add', (e) => {
      const d = JSON.parse(e.data);
      showToast(`<strong>${d.school}</strong> added you to their watchlist.`);
    });
    es.onerror = () => { /* expected on disconnect; browser auto-reconnects */ };
  }

  // Page detection
  function init() {
    if (!isApiAvailable) return;
    const path = location.pathname;
    if (path.endsWith('athlete-dashboard.html'))   { hydrateDashboard(); startLiveStream(); }
    if (path.endsWith('athlete-profile.html'))     hydrateProfile();
    if (path.endsWith('eligibility-tracker.html')) hydrateEligibility();
    if (path.endsWith('recruiter-portal.html'))    hydrateRecruiterSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
