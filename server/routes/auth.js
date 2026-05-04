'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, role, full_name, phone, birthdate, parent_user_id)
  VALUES (@email, @password_hash, @role, @full_name, @phone, @birthdate, @parent_user_id)
`);

const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const updateLogin = db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?");

const VALID_ROLES = ['athlete','parent','hs_coach','club_coach','recruiter','counselor','ad','loader'];

router.post('/signup', (req, res) => {
  const { email, password, role, full_name, phone, birthdate, parent_user_id } = req.body || {};
  if (!email || !password || !role || !full_name) {
    return res.status(400).json({ error: 'missing_fields', required: ['email','password','role','full_name'] });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'invalid_role', valid: VALID_ROLES });
  }
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short', min: 8 });
  if (findByEmail.get(email.toLowerCase())) return res.status(409).json({ error: 'email_taken' });

  const password_hash = bcrypt.hashSync(password, 10);
  let result;
  try {
    result = insertUser.run({
      email: email.toLowerCase(),
      password_hash,
      role,
      full_name,
      phone: phone || null,
      birthdate: birthdate || null,
      parent_user_id: parent_user_id || null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'signup_failed', detail: e.message });
  }

  const user = { id: result.lastInsertRowid, email: email.toLowerCase(), role, full_name };
  const token = sign(user);

  audit.record({ user, ip: req.ip }, 'user.signup', { type: 'user', id: user.id, metadata: { role } });

  res.cookie('sp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });

  const user = findByEmail.get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });

  updateLogin.run(user.id);
  const token = sign(user);

  audit.record({ user, ip: req.ip }, 'user.login', { type: 'user', id: user.id });

  res.cookie('sp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name }, token });
});

router.post('/logout', authenticate, (req, res) => {
  audit.record(req, 'user.logout', { type: 'user', id: req.user.id });
  res.clearCookie('sp_token');
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

const insertConsent = db.prepare(`
  INSERT INTO consents (athlete_id, parent_user_id, scope, ip_address, version)
  VALUES (@athlete_id, @parent_user_id, @scope, @ip_address, @version)
`);

router.post('/consent', authenticate, (req, res) => {
  const { athlete_id, scope } = req.body || {};
  if (!athlete_id || !scope) return res.status(400).json({ error: 'missing_fields' });
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'parent_only' });

  const result = insertConsent.run({
    athlete_id,
    parent_user_id: req.user.id,
    scope,
    ip_address: req.ip || null,
    version: '1.0',
  });
  audit.record(req, 'consent.recorded', { type: 'athlete', id: athlete_id, metadata: { scope } });
  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

module.exports = router;
