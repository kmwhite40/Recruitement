'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { sport, division, state, region, q, limit = 100 } = req.query;
  const conditions = [];
  const params = [];
  if (sport)    { conditions.push('sport = ?'); params.push(sport); }
  if (division) { conditions.push('division = ?'); params.push(division); }
  if (state)    { conditions.push('state = ?'); params.push(state); }
  if (region)   { conditions.push('region = ?'); params.push(region); }
  if (q)        { conditions.push('(school_name LIKE ? OR full_name LIKE ?)'); const like = `%${q}%`; params.push(like, like); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM college_coaches ${where} ORDER BY school_name, title LIMIT ?`;
  params.push(Math.min(parseInt(limit, 10) || 100, 500));
  const rows = db.prepare(sql).all(...params);
  res.json({ count: rows.length, coaches: rows });
});

router.get('/sports', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT sport FROM college_coaches ORDER BY sport').all();
  res.json({ sports: rows.map(r => r.sport) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM college_coaches WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

module.exports = router;
