'use strict';

const rateLimit = require('express-rate-limit');

// Tight limits on auth + AI; generous on read endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', detail: 'Try again in 15 minutes.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_ai_requests' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

function requestLogger(req, _res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  const start = Date.now();
  _res.on('finish', () => {
    const ms = Date.now() - start;
    const userBit = req.user ? `u${req.user.id}/${req.user.role}` : '-';
    if (req.path.startsWith('/api/')) {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${_res.statusCode} ${ms}ms ${userBit}`);
    }
  });
  next();
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
}

module.exports = { authLimiter, aiLimiter, apiLimiter, requestLogger, securityHeaders };
