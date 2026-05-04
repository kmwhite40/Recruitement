'use strict';

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

function recId(userId) {
  return db.prepare('SELECT id FROM recruiters WHERE user_id = ?').get(userId)?.id;
}

router.get('/', authenticate, requireRole('recruiter'), (req, res) => {
  const id = recId(req.user.id);
  if (!id) return res.json({ count: 0, searches: [] });
  const rows = db.prepare('SELECT * FROM saved_searches WHERE recruiter_id = ? ORDER BY created_at DESC').all(id);
  for (const r of rows) {
    try { r.filters = JSON.parse(r.filters_json); } catch (_) { r.filters = {}; }
    delete r.filters_json;
  }
  res.json({ count: rows.length, searches: rows });
});

router.post('/', authenticate, requireRole('recruiter'), (req, res) => {
  const id = recId(req.user.id);
  if (!id) return res.status(400).json({ error: 'not_a_verified_recruiter' });
  const { name, filters, alert_when_new = true } = req.body || {};
  if (!name || !filters) return res.status(400).json({ error: 'missing_fields' });
  const result = db.prepare(`
    INSERT INTO saved_searches (recruiter_id, name, filters_json, alert_when_new)
    VALUES (?, ?, ?, ?)
  `).run(id, name, JSON.stringify(filters), alert_when_new ? 1 : 0);
  audit.record(req, 'search.saved', { type: 'saved_search', id: result.lastInsertRowid, metadata: { name } });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id', authenticate, requireRole('recruiter'), (req, res) => {
  const id = recId(req.user.id);
  db.prepare('DELETE FROM saved_searches WHERE id = ? AND recruiter_id = ?').run(req.params.id, id);
  res.json({ ok: true });
});

module.exports = router;
