'use strict';

/**
 * Server-Sent Events for real-time recruiter activity.
 * Athlete dashboards subscribe to /api/events/stream and receive live updates
 * when a recruiter views their profile, watches their film, or adds them to
 * a watchlist.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

const subscribers = new Map(); // athleteId -> Set<res>

function broadcast(athleteId, event) {
  const set = subscribers.get(athleteId);
  if (!set) return;
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (_) { /* dropped */ }
  }
}

function subscribe(athleteId, res) {
  if (!subscribers.has(athleteId)) subscribers.set(athleteId, new Set());
  subscribers.get(athleteId).add(res);
}

function unsubscribe(athleteId, res) {
  const set = subscribers.get(athleteId);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(athleteId);
}

router.get('/stream', authenticate, (req, res) => {
  // Athlete subscribes to events for their own profile
  const athleteRow = db.prepare('SELECT id FROM athletes WHERE user_id = ?').get(req.user.id);
  const athleteId = athleteRow?.id || parseInt(req.query.athlete_id, 10);
  if (!athleteId) return res.status(400).json({ error: 'no_athlete' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Hello
  res.write(`event: hello\ndata: ${JSON.stringify({ athlete_id: athleteId, ts: Date.now() })}\n\n`);
  subscribe(athleteId, res);

  // Heartbeat every 25s to defeat proxy idle timeouts
  const hb = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    unsubscribe(athleteId, res);
  });
});

router.post('/_test-emit', authenticate, (req, res) => {
  // Internal: lets the recruiter portal demo trigger a synthetic event so the
  // athlete's open dashboard shows live activity without staging real recruiters.
  const { athlete_id, type = 'profile_view', school = 'Demo University' } = req.body || {};
  broadcast(parseInt(athlete_id, 10), { type, school, ts: Date.now() });
  res.json({ ok: true, subscribers: subscribers.get(parseInt(athlete_id, 10))?.size || 0 });
});

module.exports = router;
module.exports.broadcast = broadcast;
