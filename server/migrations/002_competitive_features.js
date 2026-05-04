'use strict';

/**
 * Migration 002: Pipeline CRM, coach directory, camps finder, visit planner,
 * documents vault, saved searches. Inspired by Teamworks Recruiting,
 * StackAthlete, and ProductiveRecruit features that ScholarPath did not yet
 * have a first-class home for. Idempotent — safe to run on existing data.
 */

const db = require('../db');

const migration = `
CREATE TABLE IF NOT EXISTS pipeline_schools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  school_name TEXT NOT NULL,
  division    TEXT,
  state       TEXT,
  region      TEXT,
  stage       TEXT NOT NULL DEFAULT 'researching' CHECK (stage IN ('researching','contacted','replied','visiting','offered','committed','passed')),
  fit_score   INTEGER,
  notes       TEXT,
  next_action TEXT,
  next_action_due TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(athlete_id, school_name)
);

CREATE TABLE IF NOT EXISTS college_coaches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  school_name TEXT NOT NULL,
  division    TEXT,
  state       TEXT,
  region      TEXT,
  conference  TEXT,
  sport       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  title       TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  twitter_handle TEXT,
  recruiting_areas TEXT,
  verified_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camps_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sport       TEXT NOT NULL,
  organizer   TEXT,
  type        TEXT CHECK (type IN ('id_camp','showcase','combine','clinic','tournament')),
  start_date  TEXT NOT NULL,
  end_date    TEXT,
  city        TEXT,
  state       TEXT,
  region      TEXT,
  divisions   TEXT,
  grade_levels TEXT,
  cost_usd    INTEGER,
  registration_url TEXT,
  expected_coach_count INTEGER,
  verified_results INTEGER DEFAULT 0,
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  school_name TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('unofficial','official')),
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','completed','canceled')),
  visit_date  TEXT NOT NULL,
  itinerary   TEXT,
  travel_notes TEXT,
  outcome_notes TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('transcript','recommendation','test_score','nli','financial_aid','medical','other')),
  title       TEXT NOT NULL,
  storage_key TEXT,
  url         TEXT,
  size_bytes  INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  alert_when_new INTEGER DEFAULT 1,
  last_run_at TEXT,
  last_count  INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_athlete_stage ON pipeline_schools(athlete_id, stage);
CREATE INDEX IF NOT EXISTS idx_coaches_sport_division ON college_coaches(sport, division);
CREATE INDEX IF NOT EXISTS idx_camps_sport_date ON camps_events(sport, start_date);
CREATE INDEX IF NOT EXISTS idx_visits_athlete_date ON visits(athlete_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_documents_athlete_cat ON documents(athlete_id, category);
`;

// Add columns to outreach for email tracking (only if missing)
function maybeAddColumns() {
  const cols = db.prepare("PRAGMA table_info(outreach)").all().map(c => c.name);
  if (!cols.includes('opens'))         db.exec('ALTER TABLE outreach ADD COLUMN opens INTEGER DEFAULT 0');
  if (!cols.includes('last_open_at'))  db.exec('ALTER TABLE outreach ADD COLUMN last_open_at TEXT');
  if (!cols.includes('replied_at'))    db.exec('ALTER TABLE outreach ADD COLUMN replied_at TEXT');
  if (!cols.includes('follow_up_due')) db.exec('ALTER TABLE outreach ADD COLUMN follow_up_due TEXT');
}

function run() {
  db.exec(migration);
  maybeAddColumns();
}

if (require.main === module) {
  run();
  console.log('✓ migration 002 applied');
}

module.exports = { run };
