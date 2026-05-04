'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'film');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, '_').slice(-80);
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    const ok = /^video\//.test(file.mimetype) || /\.(mp4|mov|webm|m4v)$/i.test(file.originalname);
    cb(ok ? null : new Error('only_video_files'), ok);
  },
});

const insertFilm = db.prepare(`
  INSERT INTO films (athlete_id, type, title, duration_sec, storage_key, url, thumbnail_url, ai_tags)
  VALUES (@athlete_id, @type, @title, @duration_sec, @storage_key, @url, @thumbnail_url, @ai_tags)
`);

const verifyFilm = db.prepare(`
  UPDATE films SET verified_by = @verified_by, verified_at = datetime('now')
  WHERE id = @id
`);

/**
 * Mock AI tagging: in production, would dispatch to a vision-model worker.
 * Here we simulate by returning a few sport-aware tags.
 */
function mockAITag(sport, type) {
  const base = ['top_play', 'high_action', 'in_box'];
  const map = {
    soccer: ['goal_scored','assist','1v1_win','attacking_run','press_win'],
    basketball: ['3pt_make','drive_finish','steal','assist','block'],
    football: ['pass_completion','td_throw','sack','tackle','rush_yards'],
    baseball: ['hit','rbi','strikeout','double_play','steal'],
  };
  const sportTags = map[sport?.toLowerCase()] || [];
  const tags = [...sportTags.slice(0, 3), ...base].slice(0, 5);
  return { tags, generated: 'mock-ai-v0', moments: tags.map((t, i) => ({ tag: t, t_sec: 12 + i * 18, score: 0.7 + Math.random() * 0.3 })) };
}

router.post('/upload', authenticate, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const { athlete_id, type = 'highlight', title } = req.body || {};
  if (!athlete_id) return res.status(400).json({ error: 'missing_athlete_id' });

  const athlete = db.prepare('SELECT * FROM athletes WHERE id = ?').get(athlete_id);
  if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

  const tags = mockAITag(athlete.sport, type);
  const url = `/film/${path.basename(req.file.path)}`;

  const result = insertFilm.run({
    athlete_id: parseInt(athlete_id, 10),
    type,
    title: title || req.file.originalname,
    duration_sec: null,
    storage_key: req.file.filename,
    url,
    thumbnail_url: null,
    ai_tags: JSON.stringify(tags),
  });

  audit.record(req, 'film.uploaded', { type: 'film', id: result.lastInsertRowid, metadata: { athlete_id } });
  res.status(201).json({ id: result.lastInsertRowid, url, tags });
});

router.post('/:id/verify', authenticate, requireRole('hs_coach','club_coach','admin'), (req, res) => {
  verifyFilm.run({ id: req.params.id, verified_by: req.user.id });
  audit.record(req, 'film.verified', { type: 'film', id: req.params.id });
  res.json({ ok: true });
});

router.post('/:id/view', authenticate, requireRole('recruiter'), (req, res) => {
  const rec = db.prepare('SELECT id FROM recruiters WHERE user_id = ?').get(req.user.id);
  if (!rec) return res.status(400).json({ error: 'not_recruiter' });
  const film = db.prepare('SELECT * FROM films WHERE id = ?').get(req.params.id);
  if (!film) return res.status(404).json({ error: 'not_found' });
  db.prepare(`
    INSERT INTO film_views (recruiter_id, film_id, duration_watched_sec)
    VALUES (?, ?, ?)
  `).run(rec.id, film.id, req.body.duration_watched_sec || null);
  db.prepare("INSERT INTO recruiter_activity (recruiter_id, athlete_id, action, metadata) VALUES (?, ?, 'film_view', ?)").run(rec.id, film.athlete_id, JSON.stringify({ film_id: film.id }));
  res.json({ ok: true });
});

router.get('/athlete/:athleteId', (req, res) => {
  const films = db.prepare('SELECT * FROM films WHERE athlete_id = ? ORDER BY created_at DESC').all(req.params.athleteId);
  res.json({ count: films.length, films });
});

module.exports = router;
