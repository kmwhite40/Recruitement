'use strict';

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

router.get('/', authenticate, requireRole('recruiter','admin'), (req, res) => {
  const {
    sport, position, grad_year, min_gpa, max_gpa, min_height, max_height,
    state, region, verified_only, eligibility_status, limit = 50, offset = 0
  } = req.query;

  const conditions = ["a.publish_status = 'published'"];
  const params = [];

  if (sport) { conditions.push('a.sport = ?'); params.push(sport); }
  if (position) { conditions.push('a.position LIKE ?'); params.push(`%${position}%`); }
  if (grad_year) { conditions.push('a.grad_year = ?'); params.push(parseInt(grad_year, 10)); }
  if (min_gpa) { conditions.push('a.gpa >= ?'); params.push(parseFloat(min_gpa)); }
  if (max_gpa) { conditions.push('a.gpa <= ?'); params.push(parseFloat(max_gpa)); }
  if (min_height) { conditions.push('a.height_in >= ?'); params.push(parseInt(min_height, 10)); }
  if (max_height) { conditions.push('a.height_in <= ?'); params.push(parseInt(max_height, 10)); }
  if (state) { conditions.push('s.state = ?'); params.push(state); }
  if (region) { conditions.push('s.region = ?'); params.push(region); }
  if (verified_only === 'true') {
    conditions.push("EXISTS (SELECT 1 FROM films f WHERE f.athlete_id = a.id AND f.verified_by IS NOT NULL)");
  }
  if (eligibility_status === 'on_track') {
    conditions.push("a.ncaa_status IN ('registered','on_track','cleared')");
  }

  const sql = `
    SELECT a.id, a.grad_year, a.sport, a.position, a.height_in, a.weight_lb, a.gpa,
           a.readiness_score, a.ncaa_status,
           u.full_name,
           s.name AS school_name, s.state AS school_state, s.region AS school_region,
           (SELECT COUNT(*) FROM films WHERE athlete_id = a.id AND verified_by IS NOT NULL) AS verified_film_count,
           (SELECT COUNT(*) FROM stats WHERE athlete_id = a.id AND source != 'self') AS verified_stat_count
    FROM athletes a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN schools s ON s.id = a.school_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.readiness_score DESC, a.gpa DESC
    LIMIT ? OFFSET ?
  `;
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const rows = db.prepare(sql).all(...params);
  audit.record(req, 'recruiter.search', { metadata: { filters: req.query, results: rows.length } });
  res.json({ count: rows.length, athletes: rows });
});

router.post('/watchlist', authenticate, requireRole('recruiter'), (req, res) => {
  const rec = db.prepare('SELECT id FROM recruiters WHERE user_id = ?').get(req.user.id);
  if (!rec) return res.status(400).json({ error: 'not_a_verified_recruiter' });
  const { athlete_id, notes, interest_level } = req.body || {};
  try {
    const result = db.prepare(`
      INSERT INTO watchlists (recruiter_id, athlete_id, notes, interest_level)
      VALUES (?, ?, ?, ?)
    `).run(rec.id, athlete_id, notes || null, interest_level || 'cold');
    db.prepare("INSERT INTO recruiter_activity (recruiter_id, athlete_id, action) VALUES (?, ?, 'watchlist_add')").run(rec.id, athlete_id);
    audit.record(req, 'watchlist.add', { type: 'athlete', id: athlete_id });
    try {
      const events = require('./events');
      const recRow = db.prepare('SELECT s.name AS school_name FROM recruiters r LEFT JOIN schools s ON s.id = r.institution_id WHERE r.id = ?').get(rec.id);
      events.broadcast(athlete_id, { type: 'watchlist_add', school: recRow?.school_name || 'College program', ts: Date.now() });
    } catch (_) {}
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'already_watching' });
    throw e;
  }
});

router.get('/watchlist', authenticate, requireRole('recruiter'), (req, res) => {
  const rec = db.prepare('SELECT id FROM recruiters WHERE user_id = ?').get(req.user.id);
  if (!rec) return res.json({ count: 0, athletes: [] });
  const rows = db.prepare(`
    SELECT w.*, a.grad_year, a.sport, a.position, a.gpa, u.full_name, s.name AS school_name
    FROM watchlists w
    JOIN athletes a ON a.id = w.athlete_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN schools s ON s.id = a.school_id
    WHERE w.recruiter_id = ?
    ORDER BY w.added_at DESC
  `).all(rec.id);
  res.json({ count: rows.length, athletes: rows });
});

module.exports = router;
