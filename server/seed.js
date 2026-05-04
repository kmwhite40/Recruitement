'use strict';

const bcrypt = require('bcryptjs');
const db = require('./db');

function reset() {
  // Apply migration 002 first so the new tables exist
  try { require('./migrations/002_competitive_features').run(); } catch (_) {}
  const tables = [
    'saved_searches','documents','visits','camps_events','college_coaches','pipeline_schools',
    'recruiter_activity','audit_events','subscriptions','loaders','consents',
    'outreach','film_views','watchlists','recruiters','stats','films',
    'core_courses','athletes','schools','users',
  ];
  for (const t of tables) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {}
  }
}

function seed() {
  reset();
  console.log('▶ Seeding ScholarPath demo data…');

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, role, full_name, phone, birthdate, parent_user_id, identity_verified)
    VALUES (@email, @password_hash, @role, @full_name, @phone, @birthdate, @parent_user_id, @identity_verified)
  `);
  const insertSchool = db.prepare(`
    INSERT INTO schools (name, city, state, region, level, division)
    VALUES (@name, @city, @state, @region, @level, @division)
  `);
  const insertAthlete = db.prepare(`
    INSERT INTO athletes (user_id, school_id, grad_year, sport, position, height_in, weight_lb, dominant_side, hometown, state, gpa, class_rank, intended_majors, personal_statement, ncaa_status, naia_status, publish_status, readiness_score)
    VALUES (@user_id, @school_id, @grad_year, @sport, @position, @height_in, @weight_lb, @dominant_side, @hometown, @state, @gpa, @class_rank, @intended_majors, @personal_statement, @ncaa_status, @naia_status, @publish_status, @readiness_score)
  `);
  const insertCourse = db.prepare(`
    INSERT INTO core_courses (athlete_id, area, course_name, grade_year, letter_grade, credits, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFilm = db.prepare(`
    INSERT INTO films (athlete_id, type, title, duration_sec, url, ai_tags, verified_by, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertStat = db.prepare(`
    INSERT INTO stats (athlete_id, metric, value, unit, season, source, attested_by, attested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertRecruiter = db.prepare(`
    INSERT INTO recruiters (user_id, institution_id, sport_scopes, position_needs, verified_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  const insertActivity = db.prepare(`
    INSERT INTO recruiter_activity (recruiter_id, athlete_id, action, metadata)
    VALUES (?, ?, ?, ?)
  `);
  const insertOutreach = db.prepare(`
    INSERT INTO outreach (athlete_id, recruiter_id, school_id, channel, direction, subject, body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const pwHash = bcrypt.hashSync('password123', 10);

  // === Schools ===
  const linc = insertSchool.run({ name: 'Lincoln High School', city: 'Tampa', state: 'FL', region: 'Southeast', level: 'hs', division: null }).lastInsertRowid;
  const carroll = insertSchool.run({ name: 'Bishop Carroll', city: 'Riverside', state: 'CA', region: 'West', level: 'hs', division: null }).lastInsertRowid;
  const westLinn = insertSchool.run({ name: 'West Linn HS', city: 'West Linn', state: 'OR', region: 'West', level: 'hs', division: null }).lastInsertRowid;
  const mountainView = insertSchool.run({ name: 'Mountain View HS', city: 'Vancouver', state: 'WA', region: 'West', level: 'hs', division: null }).lastInsertRowid;
  const liberty = insertSchool.run({ name: 'Liberty High School', city: 'Peoria', state: 'AZ', region: 'West', level: 'hs', division: null }).lastInsertRowid;
  const skyline = insertSchool.run({ name: 'Skyline HS', city: 'Longmont', state: 'CO', region: 'West', level: 'hs', division: null }).lastInsertRowid;
  const whitworthCol = insertSchool.run({ name: 'Whitworth University', city: 'Spokane', state: 'WA', region: 'West', level: 'college', division: 'D-III' }).lastInsertRowid;

  // === Parent + Athlete: Maya ===
  const mayaParent = insertUser.run({
    email: 'parent.rodriguez@example.com', password_hash: pwHash, role: 'parent',
    full_name: 'Elena Rodriguez', phone: '813-555-0100', birthdate: null, parent_user_id: null, identity_verified: 1,
  }).lastInsertRowid;

  const mayaUser = insertUser.run({
    email: 'maya@example.com', password_hash: pwHash, role: 'athlete',
    full_name: 'Maya Rodriguez', phone: '813-555-0101', birthdate: '2009-04-12', parent_user_id: mayaParent, identity_verified: 1,
  }).lastInsertRowid;

  const mayaId = insertAthlete.run({
    user_id: mayaUser, school_id: linc, grad_year: 2027, sport: 'soccer', position: 'Forward',
    height_in: 67, weight_lb: 130, dominant_side: 'right', hometown: 'Tampa', state: 'FL',
    gpa: 3.74, class_rank: 42,
    intended_majors: 'Kinesiology, Psychology',
    personal_statement: 'I started playing soccer at six and fell in love with the chess match of attacking play — reading defenders, creating space, finishing under pressure.',
    ncaa_status: 'on_track', naia_status: 'cleared', publish_status: 'published', readiness_score: 82,
  }).lastInsertRowid;

  // Maya's core courses
  [
    ['english','English I',9,'A','completed'],
    ['english','English II',10,'A-','completed'],
    ['english','American Literature',11,'B+','completed'],
    ['english','AP English',12,null,'in_progress'],
    ['math','Algebra I',9,'A','completed'],
    ['math','Geometry',10,'B+','completed'],
    ['math','Algebra II',11,'C+','completed'],
    ['science','Biology',9,'A','completed'],
    ['science','Chemistry',10,'B+','completed'],
    ['science','Physics',11,'A-','completed'],
    ['social_science','World History',9,'A','completed'],
    ['social_science','US History',10,'A','completed'],
    ['social_science','Govt + Econ',12,null,'in_progress'],
    ['foreign_lang_or_phil','Spanish I',9,'A','completed'],
    ['foreign_lang_or_phil','Spanish II',10,'A-','completed'],
    ['additional','Pre-Calculus',10,'B','completed'],
    ['additional','Psychology',11,'A','completed'],
    ['additional','AP Statistics',12,null,'in_progress'],
  ].forEach(([area, name, year, grade, status]) => {
    insertCourse.run(mayaId, area, name, year, grade, 1.0, status);
  });

  // Maya's films
  insertFilm.run(mayaId, 'highlight', '2026-27 Highlight Reel', 92, '/film/sample-highlight.mp4',
    JSON.stringify({ tags: ['goal_scored','assist','1v1_win','attacking_run','finish'], generated: 'mock-ai-v0' }), 1);
  insertFilm.run(mayaId, 'full_game', 'vs. Plant HS · Full Game', 5400, '/film/sample-full-game.mp4',
    JSON.stringify({ tags: ['goal_scored','assist'], generated: 'mock-ai-v0' }), 1);
  insertFilm.run(mayaId, 'skills', 'Skills · Ball Control', 60, '/film/sample-skills.mp4',
    JSON.stringify({ tags: ['close_control','finishing'], generated: 'mock-ai-v0' }), null);

  // Maya's stats
  [
    ['goals_per_game','1.22','count','2026-27','coach', 1],
    ['sprint_40','4.62','sec','2026','event', 1],
    ['vertical','23.5','in','2026','event', 1],
    ['1v1_win_rate','63','pct','2026-27','coach', 1],
    ['games_played','18','count','2026-27','coach', 1],
    ['goals','22','count','2026-27','coach', 1],
    ['assists','11','count','2026-27','coach', 1],
  ].forEach(([m, v, u, s, src, attestor]) => insertStat.run(mayaId, m, v, u, s, src, attestor));

  // Coach Williams
  const coachWilliams = insertUser.run({
    email: 'coach.williams@lincolnhs.edu', password_hash: pwHash, role: 'hs_coach',
    full_name: 'Carla Williams', phone: '813-555-0102', birthdate: null, parent_user_id: null, identity_verified: 1,
  }).lastInsertRowid;

  // Other published athletes for the recruiter portal
  const others = [
    { name: 'Jordan Patel', email: 'jordan@example.com', school: carroll, sport: 'soccer', pos: 'Midfielder', ht: 69, wt: 145, gpa: 3.91, gy: 2027, score: 78, hometown: 'Riverside', state: 'CA' },
    { name: 'Sienna Brooks', email: 'sienna@example.com', school: westLinn, sport: 'soccer', pos: 'Forward', ht: 66, wt: 128, gpa: 3.55, gy: 2027, score: 75, hometown: 'West Linn', state: 'OR' },
    { name: 'Alex Nguyen', email: 'alex@example.com', school: mountainView, sport: 'soccer', pos: 'Midfielder', ht: 68, wt: 140, gpa: 4.12, gy: 2027, score: 80, hometown: 'Vancouver', state: 'WA' },
    { name: 'Camila Torres', email: 'camila@example.com', school: liberty, sport: 'soccer', pos: 'Forward', ht: 65, wt: 125, gpa: 3.42, gy: 2027, score: 72, hometown: 'Peoria', state: 'AZ' },
    { name: 'Riley Carter', email: 'riley@example.com', school: skyline, sport: 'soccer', pos: 'Forward', ht: 67, wt: 132, gpa: 3.28, gy: 2028, score: 65, hometown: 'Longmont', state: 'CO' },
  ];

  others.forEach(o => {
    const u = insertUser.run({
      email: o.email, password_hash: pwHash, role: 'athlete',
      full_name: o.name, phone: null, birthdate: null, parent_user_id: null, identity_verified: 1,
    }).lastInsertRowid;
    const aid = insertAthlete.run({
      user_id: u, school_id: o.school, grad_year: o.gy, sport: o.sport, position: o.pos,
      height_in: o.ht, weight_lb: o.wt, dominant_side: 'right', hometown: o.hometown, state: o.state,
      gpa: o.gpa, class_rank: null, intended_majors: null, personal_statement: null,
      ncaa_status: 'on_track', naia_status: 'on_track', publish_status: 'published', readiness_score: o.score,
    }).lastInsertRowid;
    insertFilm.run(aid, 'highlight', `${o.name} Highlight Reel`, 90, '/film/sample-highlight.mp4',
      JSON.stringify({ tags: ['action'] }), coachWilliams);
    insertStat.run(aid, 'goals', String(10 + Math.floor(Math.random() * 18)), 'count', '2026-27', 'coach', coachWilliams);
  });

  // === Recruiter ===
  const recUser = insertUser.run({
    email: 'coach.davis@whitworth.edu', password_hash: pwHash, role: 'recruiter',
    full_name: 'Marcus Davis', phone: null, birthdate: null, parent_user_id: null, identity_verified: 1,
  }).lastInsertRowid;
  const recId = insertRecruiter.run(recUser, whitworthCol, JSON.stringify(['soccer']), JSON.stringify(['Forward','Midfielder'])).lastInsertRowid;

  // Recruiter activity
  insertActivity.run(recId, mayaId, 'profile_view', JSON.stringify({ duration_sec: 252 }));
  insertActivity.run(recId, mayaId, 'film_view', JSON.stringify({ film_id: 1, duration_watched_sec: 90 }));
  insertActivity.run(recId, mayaId, 'watchlist_add', JSON.stringify({ interest: 'warm' }));

  // === Outreach ===
  insertOutreach.run(mayaId, null, whitworthCol, 'email', 'out',
    'Class of 2027 Forward — Maya Rodriguez | 3.74 GPA',
    'Coach,\n\nMy name is Maya Rodriguez. I am a 2027 forward at Lincoln High School…',
    'sent');

  // === Loader example: Jordan loading a profile for a teammate would go here ===

  // === Migration 002 sample data ===
  const insertCoach = db.prepare(`
    INSERT INTO college_coaches (school_name, division, state, region, conference, sport, full_name, title, email, phone, twitter_handle, recruiting_areas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['Whitworth University','D-III','WA','West','NWC','soccer','Marcus Davis','Head Women\'s Soccer Coach','mdavis@whitworth.edu','509-555-0102','@WhitworthWSOC','Pacific NW, CA, AZ'],
    ['Southern Oregon University','NAIA','OR','West','CCC','soccer','Lisa Petrov','Associate Head Coach','lpetrov@sou.edu','541-555-0118','@SOURaiderWSOC','OR, CA, NV, ID'],
    ['Pacific Lutheran University','D-III','WA','West','NWC','soccer','Sarah Kim','Recruiting Coordinator','skim@plu.edu','253-555-0145','','WA, OR, ID, BC'],
    ['Lewis & Clark College','D-III','OR','West','NWC','soccer','Tomás Garza','Head Coach','tgarza@lclark.edu','503-555-0177','@LCWomensSoccer','OR, WA, N. CA'],
    ['Linfield University','D-III','OR','West','NWC','soccer','Jamie Kowalski','Head Coach','jkowalski@linfield.edu','503-555-0190','','OR, WA, ID, CA'],
    ['Eastern Oregon University','NAIA','OR','West','CCC','soccer','Devon Reilly','Head Coach','dreilly@eou.edu','541-555-0166','','OR, ID, WA, MT'],
    ['Concordia University Irvine','D-II','CA','West','PacWest','soccer','Maria Hernandez','Asst Head Coach','mhernandez@cui.edu','949-555-0149','@CUIEaglesWSOC','CA, AZ, NV, HI'],
    ['University of the Pacific','D-II','CA','West','GNAC','soccer','Avery Chen','Head Coach','achen@pacific.edu','209-555-0167','','CA, OR, NV'],
    ['Whitman College','D-III','WA','West','NWC','soccer','Patricia Olivera','Head Coach','polivera@whitman.edu','509-555-0156','','WA, OR, ID, MT'],
    ['Willamette University','D-III','OR','West','NWC','soccer','Jordan Reese','Recruiting Coordinator','jreese@willamette.edu','503-555-0123','','OR, WA, CA'],
  ].forEach(args => insertCoach.run(...args));

  const insertCamp = db.prepare(`
    INSERT INTO camps_events (name, sport, organizer, type, start_date, end_date, city, state, region, divisions, grade_levels, cost_usd, registration_url, expected_coach_count, verified_results, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['Pacific NW ID Camp','soccer','PNW Soccer','id_camp','2026-06-14','2026-06-15','Tacoma','WA','West','D-II,D-III,NAIA','9-12',225,'https://example.com/pnw-id',12,1,'Verified by event partner; combine + small-sided games'],
    ['Bay Area College Showcase','soccer','BACS','showcase','2026-06-21','2026-06-22','Pleasanton','CA','West','D-I,D-II,NAIA','10-12',295,'https://example.com/bacs',24,1,'Large field event; bring shaded gear'],
    ['Southwest Elite ID','soccer','SW Elite','id_camp','2026-07-08','2026-07-09','Phoenix','AZ','West','D-II,D-III,NAIA','9-12',195,'https://example.com/sw-elite',8,0,'Indoor for heat'],
    ['Mountain West Showcase','soccer','MWS','showcase','2026-07-19','2026-07-21','Denver','CO','West','D-I,D-II','11-12',345,'https://example.com/mws',30,1,'Premier event; verified GPS tracking'],
    ['NAIA Open ID','soccer','NAIA','id_camp','2026-08-02','2026-08-03','Salem','OR','West','NAIA','10-12',125,'https://example.com/naia-open',18,1,'NAIA-only; PlayNAIA registration required'],
    ['Northwest Combine','soccer','NW Combine','combine','2026-08-15','2026-08-15','Seattle','WA','West','D-II,D-III,NAIA','10-12',165,'https://example.com/nwc',6,1,'Verified 40, vert, agility — uploads to ScholarPath'],
  ].forEach(args => insertCamp.run(...args));

  // Maya's pipeline
  const insertPipe = db.prepare(`
    INSERT INTO pipeline_schools (athlete_id, school_name, division, state, region, stage, fit_score, notes, next_action, next_action_due)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    [mayaId, 'Whitworth University','D-III','WA','West','contacted',94,'Coach Davis watched 4:12 of game film','Send follow-up email','2026-05-10'],
    [mayaId, 'Southern Oregon University','NAIA','OR','West','replied',92,'Asst coach replied; requested film','Send full game vs Plant HS','2026-05-08'],
    [mayaId, 'Lewis & Clark College','D-III','OR','West','researching',71,'Strong academics; visiting June','Schedule unofficial visit','2026-06-01'],
    [mayaId, 'Linfield University','D-III','OR','West','researching',82,'On Reach list','Email head coach',''],
    [mayaId, 'Pacific Lutheran University','D-III','WA','West','contacted',79,'Sent intro email','Follow up in 7 days','2026-05-12'],
    [mayaId, 'Eastern Oregon University','NAIA','OR','West','visiting',88,'Unofficial visit June 18','Confirm itinerary',''],
  ].forEach(args => insertPipe.run(...args));

  // Maya's planned visits
  const insertVisit = db.prepare(`
    INSERT INTO visits (athlete_id, school_name, type, status, visit_date, itinerary, travel_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    [mayaId, 'Eastern Oregon University','unofficial','confirmed','2026-06-18','Tour campus 10am, watch practice 2pm, dinner with coach 6pm','Family driving from Tampa via PDX'],
    [mayaId, 'Whitworth University','unofficial','planned','2026-07-22','TBD','Possible combine combo'],
    [mayaId, 'Southern Oregon University','official','planned','2026-09-12','Hosted by team captain; campus tour, position meeting, game attendance','School-funded'],
  ].forEach(args => insertVisit.run(...args));

  // Maya's documents
  const insertDoc = db.prepare(`
    INSERT INTO documents (athlete_id, category, title, storage_key, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  [
    [mayaId, 'transcript','Junior-year transcript (signed)','docs/maya_transcript_2026.pdf', 184320, coachWilliams],
    [mayaId, 'recommendation','Coach Williams recommendation letter','docs/maya_rec_williams.pdf', 92160, coachWilliams],
    [mayaId, 'recommendation','Counselor recommendation','docs/maya_rec_counselor.pdf', 88064, coachWilliams],
    [mayaId, 'medical','Sports physical (current)','docs/maya_physical_2026.pdf', 64512, coachWilliams],
  ].forEach(args => insertDoc.run(...args));

  // Recruiter saved search
  const insertSaved = db.prepare(`
    INSERT INTO saved_searches (recruiter_id, name, filters_json, alert_when_new, last_run_at, last_count)
    VALUES (?, ?, ?, 1, datetime('now'), ?)
  `);
  insertSaved.run(recId, '2027 W-Soccer Forwards · West · GPA 3.3+',
    JSON.stringify({ sport: 'soccer', position: 'Forward', grad_year: 2027, region: 'West', min_gpa: 3.3, verified_only: true }),
    5);
  insertSaved.run(recId, '2028 W-Soccer Mids · GPA 3.5+',
    JSON.stringify({ sport: 'soccer', position: 'Midfielder', grad_year: 2028, min_gpa: 3.5 }),
    2);

  console.log('  ✓ migration 002 seeded: 10 coaches, 6 camps, 6 pipeline schools, 3 visits, 4 docs, 2 saved searches');

  console.log('✓ Demo data seeded.');
  console.log('');
  console.log('Test accounts (password: password123):');
  console.log('  Athlete:   maya@example.com');
  console.log('  Parent:    parent.rodriguez@example.com');
  console.log('  Coach:     coach.williams@lincolnhs.edu');
  console.log('  Recruiter: coach.davis@whitworth.edu');
  console.log('');
}

if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = seed;
