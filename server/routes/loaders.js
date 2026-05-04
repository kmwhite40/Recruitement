'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

router.post('/grant', authenticate, (req, res) => {
  // Athlete or parent grants loader access
  if (!['athlete','parent','admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { loader_user_id, athlete_id, scope = 'build' } = req.body || {};
  if (!loader_user_id || !athlete_id) return res.status(400).json({ error: 'missing_fields' });

  // For parents, verify their linkage to the athlete
  if (req.user.role === 'parent') {
    const ok = db.prepare(`
      SELECT 1 FROM athletes a JOIN users u ON u.id = a.user_id
      WHERE a.id = ? AND u.parent_user_id = ?
    `).get(athlete_id, req.user.id);
    if (!ok) return res.status(403).json({ error: 'not_parent_of_athlete' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO loaders (loader_user_id, athlete_id, scope) VALUES (?, ?, ?)
    `).run(loader_user_id, athlete_id, scope);
    audit.record(req, 'loader.granted', { type: 'athlete', id: athlete_id, metadata: { loader_user_id, scope } });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'already_granted' });
    throw e;
  }
});

router.post('/revoke', authenticate, (req, res) => {
  const { loader_user_id, athlete_id } = req.body || {};
  if (!loader_user_id || !athlete_id) return res.status(400).json({ error: 'missing_fields' });
  db.prepare(`
    UPDATE loaders SET revoked_at = datetime('now')
    WHERE loader_user_id = ? AND athlete_id = ? AND revoked_at IS NULL
  `).run(loader_user_id, athlete_id);
  audit.record(req, 'loader.revoked', { type: 'athlete', id: athlete_id, metadata: { loader_user_id } });
  res.json({ ok: true });
});

router.get('/mine', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, u.full_name AS athlete_name, a.sport, a.grad_year
    FROM loaders l
    JOIN athletes a ON a.id = l.athlete_id
    JOIN users u ON u.id = a.user_id
    WHERE l.loader_user_id = ? AND l.revoked_at IS NULL
    ORDER BY l.granted_at DESC
  `).all(req.user.id);
  res.json({ count: rows.length, athletes: rows });
});

module.exports = router;
