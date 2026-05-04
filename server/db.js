'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'scholarpath.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('athlete','parent','hs_coach','club_coach','recruiter','counselor','ad','admin','loader')),
  full_name     TEXT NOT NULL,
  phone         TEXT,
  birthdate     TEXT,
  identity_verified INTEGER DEFAULT 0,
  parent_user_id INTEGER REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS schools (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  city  TEXT, state TEXT, region TEXT,
  level TEXT NOT NULL CHECK (level IN ('hs','college','club')),
  division TEXT
);

CREATE TABLE IF NOT EXISTS athletes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id     INTEGER REFERENCES schools(id),
  grad_year     INTEGER NOT NULL,
  sport         TEXT NOT NULL,
  position      TEXT,
  height_in     INTEGER,
  weight_lb     INTEGER,
  dominant_side TEXT,
  hometown      TEXT,
  state         TEXT,
  gpa           REAL,
  class_rank    INTEGER,
  intended_majors TEXT,
  personal_statement TEXT,
  ncaa_status   TEXT DEFAULT 'not_registered',
  naia_status   TEXT DEFAULT 'not_registered',
  juco_eligible INTEGER DEFAULT 1,
  publish_status TEXT DEFAULT 'draft' CHECK (publish_status IN ('draft','review','published')),
  readiness_score INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS core_courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,
  course_name TEXT NOT NULL,
  grade_year  INTEGER NOT NULL,
  letter_grade TEXT,
  credits     REAL DEFAULT 1.0,
  status      TEXT DEFAULT 'in_progress' CHECK (status IN ('planned','in_progress','completed'))
);

CREATE TABLE IF NOT EXISTS films (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('highlight','full_game','skills')),
  title       TEXT NOT NULL,
  duration_sec INTEGER,
  storage_key TEXT,
  url         TEXT,
  thumbnail_url TEXT,
  ai_tags     TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,
  value       TEXT NOT NULL,
  unit        TEXT,
  season      TEXT,
  source      TEXT DEFAULT 'self' CHECK (source IN ('self','coach','event','system')),
  attested_by INTEGER REFERENCES users(id),
  attested_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recruiters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id  INTEGER REFERENCES schools(id),
  sport_scopes    TEXT,
  position_needs  TEXT,
  verified_at     TEXT
);

CREATE TABLE IF NOT EXISTS watchlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  notes       TEXT,
  interest_level TEXT DEFAULT 'cold' CHECK (interest_level IN ('cold','warm','active','hot')),
  added_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(recruiter_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS film_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER REFERENCES recruiters(id),
  film_id     INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  duration_watched_sec INTEGER,
  viewed_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  recruiter_id INTEGER REFERENCES recruiters(id),
  school_id   INTEGER REFERENCES schools(id),
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms','call','in_app')),
  direction   TEXT NOT NULL CHECK (direction IN ('out','in')),
  subject     TEXT,
  body        TEXT,
  status      TEXT DEFAULT 'sent' CHECK (status IN ('draft','sent','delivered','replied','blocked')),
  compliance_window_ok INTEGER DEFAULT 1,
  sent_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  parent_user_id INTEGER REFERENCES users(id),
  scope       TEXT NOT NULL,
  signed_at   TEXT DEFAULT (datetime('now')),
  ip_address  TEXT,
  version     TEXT DEFAULT '1.0'
);

CREATE TABLE IF NOT EXISTS loaders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  loader_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  scope       TEXT DEFAULT 'build' CHECK (scope IN ('build','edit','film')),
  granted_at  TEXT DEFAULT (datetime('now')),
  revoked_at  TEXT,
  UNIQUE(loader_user_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  plan        TEXT NOT NULL CHECK (plan IN ('spark','athlete_pro','family','loader_teammate','loader_manager','loader_ambassador')),
  billing_cycle TEXT DEFAULT 'annual' CHECK (billing_cycle IN ('monthly','annual','none')),
  seats       INTEGER DEFAULT 1,
  status      TEXT DEFAULT 'active' CHECK (status IN ('trialing','active','paused','canceled')),
  trial_ends_at TEXT,
  renews_at   TEXT,
  voucher_code TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  ip_address  TEXT,
  metadata    TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recruiter_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES recruiters(id),
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  metadata    TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_athletes_sport_grad ON athletes(sport, grad_year);
CREATE INDEX IF NOT EXISTS idx_athletes_publish ON athletes(publish_status);
CREATE INDEX IF NOT EXISTS idx_films_athlete ON films(athlete_id);
CREATE INDEX IF NOT EXISTS idx_stats_athlete ON stats(athlete_id);
CREATE INDEX IF NOT EXISTS idx_core_athlete ON core_courses(athlete_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outreach_athlete ON outreach(athlete_id, sent_at);
`;

db.exec(schema);

module.exports = db;
