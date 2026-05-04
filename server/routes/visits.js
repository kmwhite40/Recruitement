'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const insertVisit = db.prepare(`
  INSERT INTO visits (athlete_id, school_name, type, status, visit_date, itinerary, travel_notes)
  VALUES (@athlete_id, @school_name, @type, @status, @visit_date, @itinerary, @travel_notes)
`);

router.get('/:athleteId', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM visits
    WHERE athlete_id = ?
    ORDER BY visit_date
  `).all(req.params.athleteId);
  res.json({ count: rows.length, visits: rows });
});

router.post('/:athleteId', authenticate, (req, res) => {
  if (!req.body.school_name || !req.body.visit_date) return res.status(400).json({ error: 'missing_fields' });
  const result = insertVisit.run({
    athlete_id: parseInt(req.params.athleteId, 10),
    school_name: req.body.school_name,
    type: req.body.type || 'unofficial',
    status: req.body.status || 'planned',
    visit_date: req.body.visit_date,
    itinerary: req.body.itinerary || null,
    travel_notes: req.body.travel_notes || null,
  });
  audit.record(req, 'visit.created', { type: 'athlete', id: parseInt(req.params.athleteId, 10), metadata: { school: req.body.school_name } });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:athleteId/:id', authenticate, (req, res) => {
  const fields = ['status','visit_date','itinerary','travel_notes','outcome_notes'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });
  params.push(req.params.id, req.params.athleteId);
  db.prepare(`UPDATE visits SET ${sets.join(', ')} WHERE id = ? AND athlete_id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/:athleteId/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM visits WHERE id = ? AND athlete_id = ?').run(req.params.id, req.params.athleteId);
  res.json({ ok: true });
});

module.exports = router;
