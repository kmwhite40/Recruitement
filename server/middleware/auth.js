'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'scholarpath-dev-secret-change-me';
const TOKEN_TTL = '7d';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.sp_token) return req.cookies.sp_token;
  return null;
}

const getUser = db.prepare('SELECT id, email, role, full_name, parent_user_id, identity_verified FROM users WHERE id = ?');

function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUser.get(decoded.id);
    if (!user) return res.status(401).json({ error: 'unauthenticated' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function optional(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = getUser.get(decoded.id);
      if (user) req.user = user;
    } catch (_) { /* ignore */ }
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden', required: roles });
    next();
  };
}

module.exports = { sign, authenticate, optional, requireRole, JWT_SECRET };
