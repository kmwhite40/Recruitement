'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const STAGES = ['researching','contacted','replied','visiting','offered','committed','passed'];

const selectByAthlete = db.prepare(`
  SELECT * FROM pipeline_schools WHERE athlete_id = ? ORDER BY
    CASE stage
      WHEN 'researching' THEN 1
      WHEN 'contacted' THEN 2
      WHEN 'replied' THEN 3
      WHEN 'visiting' THEN 4
      WHEN 'offered' THEN 5
      WHEN 'committed' THEN 6
      WHEN 'passed' THEN 7
    END, fit_score DESC NULLS LAST, school_name
`);

const insertSchool = db.prepare(`
  INSERT INTO pipeline_schools (athlete_id, school_name, division, state, region, stage, fit_score, notes, next_action, next_action_due)
  VALUES (@athlete_id, @school_name, @division, @state, @region, @stage, @fit_score, @notes, @next_action, @next_action_due)
`);

const updateStage = db.prepare(`
  UPDATE pipeline_schools SET stage = @stage, updated_at = datetime('now') WHERE id = @id AND athlete_id = @athlete_id
`);

const updateRow = db.prepare(`
  UPDATE pipeline_schools SET
    notes = COALESCE(@notes, notes),
    next_action = COALESCE(@next_action, next_action),
    next_action_due = COALESCE(@next_action_due, next_action_due),
    fit_score = COALESCE(@fit_score, fit_score),
    updated_at = datetime('now')
  WHERE id = @id AND athlete_id = @athlete_id
`);

router.get('/:athleteId', (req, res) => {
  const rows = selectByAthlete.all(req.params.athleteId);
  const byStage = Object.fromEntries(STAGES.map(s => [s, []]));
  for (const r of rows) byStage[r.stage].push(r);
  res.json({
    athlete_id: parseInt(req.params.athleteId, 10),
    stages: STAGES,
    counts: Object.fromEntries(STAGES.map(s => [s, byStage[s].length])),
    by_stage: byStage,
    total: rows.length,
  });
});

router.post('/:athleteId', authenticate, (req, res) => {
  const athleteId = parseInt(req.params.athleteId, 10);
  try {
    const result = insertSchool.run({
      athlete_id: athleteId,
      school_name: req.body.school_name,
      division: req.body.division || null,
      state: req.body.state || null,
      region: req.body.region || null,
      stage: req.body.stage || 'researching',
      fit_score: req.body.fit_score ?? null,
      notes: req.body.notes || null,
      next_action: req.body.next_action || null,
      next_action_due: req.body.next_action_due || null,
    });
    audit.record(req, 'pipeline.school_added', { type: 'athlete', id: athleteId, metadata: { school: req.body.school_name } });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'already_in_pipeline' });
    throw e;
  }
});

router.patch('/:athleteId/:id/stage', authenticate, (req, res) => {
  const stage = req.body.stage;
  if (!STAGES.includes(stage)) return res.status(400).json({ error: 'invalid_stage', valid: STAGES });
  updateStage.run({ id: req.params.id, athlete_id: req.params.athleteId, stage });
  audit.record(req, 'pipeline.stage_changed', { type: 'athlete', id: parseInt(req.params.athleteId, 10), metadata: { pipeline_id: req.params.id, stage } });
  res.json({ ok: true, stage });
});

router.patch('/:athleteId/:id', authenticate, (req, res) => {
  updateRow.run({ id: req.params.id, athlete_id: req.params.athleteId, ...req.body });
  res.json({ ok: true });
});

router.delete('/:athleteId/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM pipeline_schools WHERE id = ? AND athlete_id = ?').run(req.params.id, req.params.athleteId);
  audit.record(req, 'pipeline.removed', { type: 'athlete', id: parseInt(req.params.athleteId, 10), metadata: { pipeline_id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
