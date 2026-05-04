'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const VAULT_DIR = path.join(__dirname, '..', '..', 'data', 'documents');
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VAULT_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, '_').slice(-80);
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const VALID = ['transcript','recommendation','test_score','nli','financial_aid','medical','other'];

router.get('/:athleteId', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM documents WHERE athlete_id = ? ORDER BY created_at DESC').all(req.params.athleteId);
  res.json({ count: rows.length, documents: rows });
});

router.post('/:athleteId', authenticate, upload.single('file'), (req, res) => {
  const category = req.body.category;
  if (!VALID.includes(category)) return res.status(400).json({ error: 'invalid_category', valid: VALID });
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const result = db.prepare(`
    INSERT INTO documents (athlete_id, category, title, storage_key, url, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(req.params.athleteId, 10),
    category,
    req.body.title || req.file.originalname,
    req.file.filename,
    `/documents/${req.file.filename}`,
    req.file.size,
    req.user.id,
  );
  audit.record(req, 'document.uploaded', { type: 'athlete', id: parseInt(req.params.athleteId, 10), metadata: { category } });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:athleteId/:id', authenticate, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND athlete_id = ?').get(req.params.id, req.params.athleteId);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  if (doc.storage_key) {
    try { fs.unlinkSync(path.join(VAULT_DIR, doc.storage_key)); } catch (_) {}
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  audit.record(req, 'document.deleted', { type: 'athlete', id: parseInt(req.params.athleteId, 10) });
  res.json({ ok: true });
});

module.exports = router;
