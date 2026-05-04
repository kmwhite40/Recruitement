'use strict';

const express = require('express');
const db = require('../db');
const { authenticate, optional } = require('../middleware/auth');
const eligibility = require('../lib/eligibility-rules');
const audit = require('../lib/audit');

const router = express.Router();

const selectFull = db.prepare(`
  SELECT a.*, u.full_name, u.email, s.name AS school_name, s.city AS school_city, s.state AS school_state, s.region AS school_region
  FROM athletes a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN schools s ON s.id = a.school_id
  WHERE a.id = ?
`);

const selectCourses = db.prepare('SELECT * FROM core_courses WHERE athlete_id = ? ORDER BY grade_year, area');
const selectFilms = db.prepare('SELECT * FROM films WHERE athlete_id = ? ORDER BY created_at DESC');
const selectStats = db.prepare('SELECT * FROM stats WHERE athlete_id = ? ORDER BY season DESC, metric');
const countOutreach = db.prepare("SELECT COUNT(*) AS n FROM outreach WHERE athlete_id = ? AND direction = 'out'");
const countViews = db.prepare(`
  SELECT COUNT(DISTINCT recruiter_id) AS coaches
  FROM recruiter_activity
  WHERE athlete_id = ? AND action IN ('profile_view','film_view','watchlist_add')
`);

const updateAthlete = db.prepare(`
  UPDATE athletes SET
    school_id = COALESCE(@school_id, school_id),
    grad_year = COALESCE(@grad_year, grad_year),
    sport = COALESCE(@sport, sport),
    position = COALESCE(@position, position),
    height_in = COALESCE(@height_in, height_in),
    weight_lb = COALESCE(@weight_lb, weight_lb),
    gpa = COALESCE(@gpa, gpa),
    intended_majors = COALESCE(@intended_majors, intended_majors),
    personal_statement = COALESCE(@personal_statement, personal_statement),
    publish_status = COALESCE(@publish_status, publish_status),
    updated_at = datetime('now')
  WHERE id = @id
`);

function computeReadiness(athleteId) {
  const courses = selectCourses.all(athleteId);
  const elig = eligibility.status(courses);
  const films = selectFilms.all(athleteId).length;
  const outreach = countOutreach.get(athleteId).n;
  return eligibility.readinessScore({
    profileCompletePct: 80,
    eligibility: elig,
    filmCount: films,
    outreachCount: outreach,
    hasReferences: true,
  });
}

router.get('/', optional, (req, res) => {
  const { sport, grad_year, state, limit = 50, verified_only } = req.query;
  let sql = `
    SELECT a.id, a.grad_year, a.sport, a.position, a.height_in, a.weight_lb, a.gpa, a.publish_status, a.readiness_score,
           u.full_name, s.name AS school_name, s.state AS school_state
    FROM athletes a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN schools s ON s.id = a.school_id
    WHERE a.publish_status = 'published'
  `;
  const params = [];
  if (sport) { sql += ' AND a.sport = ?'; params.push(sport); }
  if (grad_year) { sql += ' AND a.grad_year = ?'; params.push(parseInt(grad_year, 10)); }
  if (state) { sql += ' AND s.state = ?'; params.push(state); }
  sql += ' ORDER BY a.readiness_score DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 50, 200));

  const rows = db.prepare(sql).all(...params);
  res.json({ count: rows.length, athletes: rows });
});

router.get('/:id', optional, (req, res) => {
  const athlete = selectFull.get(req.params.id);
  if (!athlete) return res.status(404).json({ error: 'not_found' });

  const courses = selectCourses.all(athlete.id);
  const elig = eligibility.status(courses);
  const films = selectFilms.all(athlete.id);
  const stats = selectStats.all(athlete.id);
  const views = countViews.get(athlete.id).coaches;

  // Log recruiter view if applicable + broadcast live to the athlete
  if (req.user?.role === 'recruiter') {
    const rec = db.prepare('SELECT r.id, s.name AS school_name FROM recruiters r LEFT JOIN schools s ON s.id = r.institution_id WHERE r.user_id = ?').get(req.user.id);
    if (rec) {
      db.prepare("INSERT INTO recruiter_activity (recruiter_id, athlete_id, action) VALUES (?, ?, 'profile_view')").run(rec.id, athlete.id);
      try {
        const events = require('./events');
        events.broadcast(athlete.id, { type: 'profile_view', school: rec.school_name || 'College program', ts: Date.now() });
      } catch (_) { /* non-fatal */ }
    }
  }

  res.json({
    athlete,
    eligibility: elig,
    films,
    stats,
    courses,
    coaches_viewing: views,
  });
});

router.patch('/:id', authenticate, (req, res) => {
  const athlete = db.prepare('SELECT * FROM athletes WHERE id = ?').get(req.params.id);
  if (!athlete) return res.status(404).json({ error: 'not_found' });
  const isOwner = req.user.id === athlete.user_id;
  const isLoader = db.prepare('SELECT 1 FROM loaders WHERE loader_user_id = ? AND athlete_id = ? AND revoked_at IS NULL').get(req.user.id, athlete.id);
  if (!isOwner && !isLoader && !['hs_coach','admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  updateAthlete.run({ id: athlete.id, ...req.body });
  audit.record(req, 'athlete.updated', { type: 'athlete', id: athlete.id });

  // Recompute readiness
  const score = computeReadiness(athlete.id);
  db.prepare('UPDATE athletes SET readiness_score = ? WHERE id = ?').run(score, athlete.id);

  res.json({ ok: true, readiness_score: score });
});

router.get('/:id/readiness', (req, res) => {
  const athlete = db.prepare('SELECT id FROM athletes WHERE id = ?').get(req.params.id);
  if (!athlete) return res.status(404).json({ error: 'not_found' });
  const courses = selectCourses.all(athlete.id);
  const elig = eligibility.status(courses);
  const films = selectFilms.all(athlete.id).length;
  const outreach = countOutreach.get(athlete.id).n;
  const score = eligibility.readinessScore({
    profileCompletePct: 80, eligibility: elig, filmCount: films, outreachCount: outreach, hasReferences: true,
  });
  res.json({
    score,
    breakdown: {
      academics: elig.stoplight === 'green' ? 88 : 65,
      athletics: 84,
      film: Math.min(100, films * 25),
      outreach: Math.min(100, outreach * 6),
      character: 90,
    },
    eligibility: elig,
  });
});

module.exports = router;
