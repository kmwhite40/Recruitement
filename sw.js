/* ScholarPath PWA service worker */
const CACHE = 'scholarpath-v1';
const STATIC = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/data-loader.js',
  '/manifest.json',
  '/athlete-dashboard.html',
  '/athlete-profile.html',
  '/eligibility-tracker.html',
  '/recruiter-portal.html',
  '/subscription.html',
  '/login.html',
  '/signup.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // API: network-first, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }
  // Static: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      if (res.ok && event.request.method === 'GET' && url.origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, clone));
      }
      return res;
    }).catch(() => cached))
  );
});
