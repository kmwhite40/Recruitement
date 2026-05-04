'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const eligibility = require('../lib/eligibility-rules');
const audit = require('../lib/audit');

const router = express.Router();

const selectCourses = db.prepare('SELECT * FROM core_courses WHERE athlete_id = ? ORDER BY grade_year, area');

const insertCourse = db.prepare(`
  INSERT INTO core_courses (athlete_id, area, course_name, grade_year, letter_grade, credits, status)
  VALUES (@athlete_id, @area, @course_name, @grade_year, @letter_grade, @credits, @status)
`);

const updateCourse = db.prepare(`
  UPDATE core_courses SET
    area = COALESCE(@area, area),
    course_name = COALESCE(@course_name, course_name),
    grade_year = COALESCE(@grade_year, grade_year),
    letter_grade = COALESCE(@letter_grade, letter_grade),
    credits = COALESCE(@credits, credits),
    status = COALESCE(@status, status)
  WHERE id = @id AND athlete_id = @athlete_id
`);

router.get('/:athleteId', (req, res) => {
  const courses = selectCourses.all(req.params.athleteId);
  const status = eligibility.status(courses);
  res.json({ athlete_id: parseInt(req.params.athleteId, 10), status, courses });
});

router.post('/:athleteId/courses', authenticate, (req, res) => {
  const athleteId = parseInt(req.params.athleteId, 10);
  const result = insertCourse.run({
    athlete_id: athleteId,
    area: req.body.area,
    course_name: req.body.course_name,
    grade_year: req.body.grade_year,
    letter_grade: req.body.letter_grade || null,
    credits: req.body.credits ?? 1.0,
    status: req.body.status || 'in_progress',
  });
  audit.record(req, 'eligibility.course_added', { type: 'athlete', id: athleteId, metadata: req.body });

  const courses = selectCourses.all(athleteId);
  const status = eligibility.status(courses);
  res.status(201).json({ id: result.lastInsertRowid, status });
});

router.patch('/:athleteId/courses/:courseId', authenticate, (req, res) => {
  const athleteId = parseInt(req.params.athleteId, 10);
  updateCourse.run({ id: req.params.courseId, athlete_id: athleteId, ...req.body });
  audit.record(req, 'eligibility.course_updated', { type: 'core_course', id: req.params.courseId });

  const courses = selectCourses.all(athleteId);
  const status = eligibility.status(courses);
  res.json({ ok: true, status });
});

router.get('/:athleteId/forecast', (req, res) => {
  const courses = selectCourses.all(req.params.athleteId);
  const status = eligibility.status(courses);
  res.json({
    projected: status.projected_year_end_gpa,
    meets: status.meets,
    floors: status.floors,
    one_line: status.one_line,
    stoplight: status.stoplight,
  });
});

module.exports = router;
