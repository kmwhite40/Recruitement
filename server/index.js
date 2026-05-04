'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const db = require('./db');
const { optional } = require('./middleware/auth');
const { authLimiter, aiLimiter, apiLimiter, requestLogger, securityHeaders } = require('./middleware/security');

// Apply migrations on every boot — idempotent.
require('./migrations/002_competitive_features').run();

const app = express();
const PORT = process.env.PORT || 5173;
const ROOT = path.join(__dirname, '..');

app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(cors({ credentials: true, origin: true }));
app.use(securityHeaders);
app.use(requestLogger);

// Routers — rate-limited per surface area
app.use('/api/auth',          authLimiter, require('./routes/auth'));
app.use('/api/ai',            aiLimiter,   require('./routes/ai'));
app.use('/api/athletes',      apiLimiter,  require('./routes/athletes'));
app.use('/api/eligibility',   apiLimiter,  require('./routes/eligibility'));
app.use('/api/search',        apiLimiter,  require('./routes/search'));
app.use('/api/film',          apiLimiter,  require('./routes/film'));
app.use('/api/outreach',      apiLimiter,  require('./routes/outreach'));
app.use('/api/subscriptions', apiLimiter,  require('./routes/subscriptions'));
app.use('/api/loaders',       apiLimiter,  require('./routes/loaders'));
app.use('/api/match',         apiLimiter,  require('./routes/match'));
app.use('/api/pipeline',      apiLimiter,  require('./routes/pipeline'));
app.use('/api/coaches',       apiLimiter,  require('./routes/coaches'));
app.use('/api/camps',         apiLimiter,  require('./routes/camps'));
app.use('/api/visits',        apiLimiter,  require('./routes/visits'));
app.use('/api/documents',     apiLimiter,  require('./routes/documents'));
app.use('/api/saved-searches',apiLimiter,  require('./routes/saved-searches'));
app.use('/api/events',                     require('./routes/events')); // SSE — no rate limit (it's a long-lived stream)
app.use('/documents', express.static(path.join(ROOT, 'data', 'documents')));

// Health
app.get('/api/health', (_req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const athleteCount = db.prepare('SELECT COUNT(*) AS n FROM athletes').get().n;
  res.json({ status: 'ok', users: userCount, athletes: athleteCount, version: '0.1.0' });
});

// Static frontend (HTML, CSS, JS, manifest, sw)
app.use(optional);
app.use('/film', express.static(path.join(ROOT, 'data', 'film')));
app.use(express.static(ROOT, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders: (res, p) => {
    if (p.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
  },
}));

// 404 fallback for SPA-ish navigation
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  const candidate = path.join(ROOT, `${req.path.replace(/^\//, '')}.html`);
  if (fs.existsSync(candidate)) return res.sendFile(candidate);
  res.status(404).sendFile(path.join(ROOT, 'index.html'));
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server_error' });
});

// Auto-seed on first run if empty
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  console.log('▶ Empty database — running first-time seed…');
  require('./seed')();
}

app.listen(PORT, () => {
  console.log('');
  console.log('  ScholarPath Athletics');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → API: http://localhost:${PORT}/api/health`);
  console.log('');
});
