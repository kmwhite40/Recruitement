'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const ncaaWindows = require('../lib/ncaa-windows');
const audit = require('../lib/audit');

const router = express.Router();

const insertOutreach = db.prepare(`
  INSERT INTO outreach (athlete_id, recruiter_id, school_id, channel, direction, subject, body, status, compliance_window_ok)
  VALUES (@athlete_id, @recruiter_id, @school_id, @channel, @direction, @subject, @body, @status, @compliance_window_ok)
`);

router.post('/draft', authenticate, (req, res) => {
  const { athlete_id, school_name, division, sport, position } = req.body || {};
  if (!athlete_id || !school_name) return res.status(400).json({ error: 'missing_fields' });

  const athlete = db.prepare(`
    SELECT a.*, u.full_name FROM athletes a
    JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(athlete_id);
  if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

  // Templated draft (in production: routed through Claude with retrieval)
  const subject = `${athlete.grad_year} ${athlete.position || athlete.sport} — ${athlete.full_name} | GPA ${athlete.gpa ?? 'N/A'}`;
  const body = `Coach,

My name is ${athlete.full_name}. I'm a ${athlete.grad_year} ${athlete.position || ''} at ${athlete.hometown ? athlete.hometown : 'my high school'}.${athlete.height_in ? ` I'm ${Math.floor(athlete.height_in / 12)}'${athlete.height_in % 12}",` : ''}${athlete.weight_lb ? ` ${athlete.weight_lb} lbs,` : ''} with a ${athlete.gpa ?? '—'} GPA.

I'm interested in ${school_name} because of your program's commitment to developing ${sport || athlete.sport} players at the next level and the academic strength of your ${athlete.intended_majors ? athlete.intended_majors.split(',')[0].trim() : 'undergraduate'} program.

Below is my profile, which includes verified film, current stats, my transcript, and references from my coaches.

I would welcome the chance to learn more about your program. Thank you for your time.

Sincerely,
${athlete.full_name}
Class of ${athlete.grad_year}`;

  res.json({ subject, body, generated: 'template-v1', editable: true });
});

router.post('/send', authenticate, (req, res) => {
  const { athlete_id, school_id, channel = 'email', subject, body } = req.body || {};
  if (!athlete_id || !subject || !body) return res.status(400).json({ error: 'missing_fields' });

  const athlete = db.prepare('SELECT * FROM athletes WHERE id = ?').get(athlete_id);
  if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

  // Compliance: athletes can send outreach themselves.
  // Recruiters use a different endpoint and have window checks.
  const result = insertOutreach.run({
    athlete_id,
    recruiter_id: null,
    school_id: school_id || null,
    channel,
    direction: 'out',
    subject,
    body,
    status: 'sent',
    compliance_window_ok: 1,
  });
  audit.record(req, 'outreach.sent', { type: 'outreach', id: result.lastInsertRowid, metadata: { athlete_id, school_id } });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post('/recruiter-send', authenticate, (req, res) => {
  if (req.user.role !== 'recruiter') return res.status(403).json({ error: 'recruiter_only' });
  const { athlete_id, channel = 'in_app', subject, body } = req.body || {};

  const athlete = db.prepare('SELECT a.*, u.full_name FROM athletes a JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(athlete_id);
  if (!athlete) return res.status(404).json({ error: 'athlete_not_found' });

  const grade = (new Date().getFullYear() - (athlete.grad_year - 12)) - (athlete.grad_year - 12);
  const athleteGrade = 12 - (athlete.grad_year - new Date().getFullYear());
  const compliance = ncaaWindows.check({ sport: athlete.sport, athleteGrade });
  const rec = db.prepare('SELECT id FROM recruiters WHERE user_id = ?').get(req.user.id);

  const result = insertOutreach.run({
    athlete_id,
    recruiter_id: rec?.id || null,
    school_id: null,
    channel,
    direction: 'in',
    subject: subject || null,
    body,
    status: compliance.allowed ? 'sent' : 'blocked',
    compliance_window_ok: compliance.allowed ? 1 : 0,
  });
  audit.record(req, compliance.allowed ? 'recruiter.message_sent' : 'recruiter.message_blocked', {
    type: 'outreach', id: result.lastInsertRowid, metadata: { compliance },
  });
  if (!compliance.allowed) return res.status(403).json({ error: 'compliance_window_closed', detail: compliance });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/athlete/:athleteId', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM outreach WHERE athlete_id = ? ORDER BY sent_at DESC').all(req.params.athleteId);
  res.json({ count: rows.length, outreach: rows });
});

module.exports = router;
