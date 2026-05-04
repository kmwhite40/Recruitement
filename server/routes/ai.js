'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const ai = require('../lib/ai');
const matcher = require('../lib/college-match');
const eligibility = require('../lib/eligibility-rules');
const audit = require('../lib/audit');

const router = express.Router();

const selectAthlete = db.prepare(`
  SELECT a.*, u.full_name, u.email, s.name AS school_name, s.state AS school_state, s.city AS school_city
  FROM athletes a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN schools s ON s.id = a.school_id
  WHERE a.id = ?
`);
const selectStats = db.prepare('SELECT * FROM stats WHERE athlete_id = ?');
const selectFilms = db.prepare('SELECT * FROM films WHERE athlete_id = ?');
const selectCourses = db.prepare('SELECT * FROM core_courses WHERE athlete_id = ?');

router.get('/status', (_req, res) => {
  res.json({ enabled: ai.enabled, model: ai.model });
});

router.post('/outreach-draft', authenticate, async (req, res, next) => {
  try {
    const { athlete_id, school } = req.body || {};
    if (!athlete_id || !school?.name) return res.status(400).json({ error: 'missing_fields' });

    const athlete = selectAthlete.get(athlete_id);
    if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

    const courses = selectCourses.all(athlete_id);
    const elig = eligibility.status(courses);
    const stats = selectStats.all(athlete_id);
    const films = selectFilms.all(athlete_id);

    const result = await ai.draftOutreach({ athlete, eligibility: elig, stats, films, school });
    audit.record(req, 'ai.outreach_draft', { type: 'athlete', id: athlete_id, metadata: { school: school.name, source: result.generated_with } });
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/college-fit-explain', authenticate, async (req, res, next) => {
  try {
    const { athlete_id, school } = req.body || {};
    if (!athlete_id || !school?.name) return res.status(400).json({ error: 'missing_fields' });

    const athlete = selectAthlete.get(athlete_id);
    if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

    const courses = selectCourses.all(athlete_id);
    const elig = eligibility.status(courses);
    const stats = selectStats.all(athlete_id);
    const films = selectFilms.all(athlete_id);

    const enriched = { ...athlete, preferred_divisions: ['D-II','D-III','NAIA'], preferred_regions: ['West'] };
    const { score: fitScore } = matcher.score(enriched, school);

    const result = await ai.explainFit({ athlete, eligibility: elig, stats, films, school, fitScore });
    audit.record(req, 'ai.fit_explain', { type: 'athlete', id: athlete_id, metadata: { school: school.name, fit_score: fitScore } });
    res.json({ fit_score: fitScore, ...result });
  } catch (e) { next(e); }
});

const INTERVIEW_QUESTIONS = [
  'Tell me about yourself in two minutes.',
  'Why are you interested in our program specifically?',
  'Describe a time you failed and what you learned from it.',
  'What is your role on your current team and how would you describe your leadership?',
  'How do you balance academics with competitive athletics?',
  'What is the toughest feedback a coach has given you, and how did you respond?',
  'Where do you see yourself in five years — academically, athletically, and personally?',
  'Walk me through a moment in a game where you had to think under pressure.',
];

router.get('/interview-questions', (_req, res) => {
  res.json({ questions: INTERVIEW_QUESTIONS });
});

router.post('/interview-evaluate', authenticate, async (req, res, next) => {
  try {
    const { question, transcript } = req.body || {};
    if (!question || !transcript) return res.status(400).json({ error: 'missing_fields' });
    if (transcript.length > 8000) return res.status(413).json({ error: 'transcript_too_long' });

    const result = await ai.evaluateInterview({ question, transcript });
    audit.record(req, 'ai.interview_evaluated', { metadata: { question, source: result.generated_with } });
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
