'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { sport, type, state, region, division, max_cost, after, q, limit = 100 } = req.query;
  const conditions = ['1 = 1'];
  const params = [];
  if (sport)    { conditions.push('sport = ?'); params.push(sport); }
  if (type)     { conditions.push('type = ?'); params.push(type); }
  if (state)    { conditions.push('state = ?'); params.push(state); }
  if (region)   { conditions.push('region = ?'); params.push(region); }
  if (division) { conditions.push("divisions LIKE ?"); params.push(`%${division}%`); }
  if (max_cost) { conditions.push('cost_usd <= ?'); params.push(parseInt(max_cost, 10)); }
  if (after)    { conditions.push('start_date >= ?'); params.push(after); }
  if (q)        { conditions.push('(name LIKE ? OR organizer LIKE ?)'); const like = `%${q}%`; params.push(like, like); }

  const sql = `SELECT * FROM camps_events WHERE ${conditions.join(' AND ')} ORDER BY start_date LIMIT ?`;
  params.push(Math.min(parseInt(limit, 10) || 100, 200));
  const rows = db.prepare(sql).all(...params);
  res.json({ count: rows.length, camps: rows });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM camps_events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

module.exports = router;
