'use strict';

/* Run with: node --test server/test/ */

const test = require('node:test');
const assert = require('node:assert');

const eligibility = require('../lib/eligibility-rules');
const matcher = require('../lib/college-match');

test('letterToPoints converts standard grades', () => {
  assert.strictEqual(eligibility.letterToPoints('A'), 4.0);
  assert.strictEqual(eligibility.letterToPoints('B+'), 3.3);
  assert.strictEqual(eligibility.letterToPoints('C'), 2.0);
  assert.strictEqual(eligibility.letterToPoints('F'), 0);
  assert.strictEqual(eligibility.letterToPoints('a'), 4.0); // case-insensitive
  assert.strictEqual(eligibility.letterToPoints(null), null);
  assert.strictEqual(eligibility.letterToPoints('Z'), null);
});

test('calculateCoreGPA averages completed core courses', () => {
  const courses = [
    { area: 'english', course_name: 'E1', grade_year: 9, letter_grade: 'A', credits: 1, status: 'completed' },
    { area: 'math',    course_name: 'M1', grade_year: 9, letter_grade: 'B', credits: 1, status: 'completed' },
    { area: 'english', course_name: 'E2', grade_year: 10, letter_grade: 'C', credits: 1, status: 'completed' },
    { area: 'science', course_name: 'S1', grade_year: 11, letter_grade: null, credits: 1, status: 'in_progress' },
  ];
  const gpa = eligibility.calculateCoreGPA(courses);
  // (4.0 + 3.0 + 2.0) / 3 = 3.0
  assert.strictEqual(gpa, 3.0);
});

test('forecastEndOfYearGPA blends completed and projected', () => {
  const courses = [
    { area: 'english', course_name: 'E1', grade_year: 11, letter_grade: 'A', credits: 1, status: 'completed' },
    { area: 'math',    course_name: 'M1', grade_year: 11, letter_grade: 'A', credits: 1, status: 'completed' },
    { area: 'science', course_name: 'S1', grade_year: 12, letter_grade: null, credits: 1, status: 'in_progress' },
  ];
  const projected = eligibility.forecastEndOfYearGPA(courses);
  // current = 4.0, projected = (4.0*2 + 3.3*1)/3 = 3.767
  assert.ok(projected > 3.7 && projected < 3.8);
});

test('status produces green stoplight for strong student', () => {
  const courses = [];
  for (let i = 0; i < 16; i++) {
    courses.push({ area: 'english', course_name: 'C' + i, grade_year: 10, letter_grade: 'A', credits: 1, status: 'completed' });
  }
  const s = eligibility.status(courses);
  assert.strictEqual(s.stoplight, 'green');
  assert.ok(s.meets.d1, 'should meet D-I floor');
  assert.ok(s.meets.d2, 'should meet D-II floor');
  assert.ok(s.meets.naia, 'should meet NAIA floor');
});

test('status produces amber for borderline student', () => {
  const courses = [
    { area: 'english', course_name: 'E1', grade_year: 9, letter_grade: 'C', credits: 1, status: 'completed' },
    { area: 'math',    course_name: 'M1', grade_year: 9, letter_grade: 'C', credits: 1, status: 'completed' },
    { area: 'english', course_name: 'E2', grade_year: 10, letter_grade: 'D', credits: 1, status: 'completed' },
    { area: 'math',    course_name: 'M2', grade_year: 10, letter_grade: 'D', credits: 1, status: 'completed' },
  ];
  const s = eligibility.status(courses);
  assert.ok(['amber','red'].includes(s.stoplight));
});

test('readinessScore is between 0 and 100', () => {
  const elig = { stoplight: 'green' };
  const score = eligibility.readinessScore({
    profileCompletePct: 90, eligibility: elig, filmCount: 4, outreachCount: 12, hasReferences: true,
  });
  assert.ok(score >= 0 && score <= 100);
  assert.ok(score >= 70, `expected high score, got ${score}`);
});

test('college-match scores higher for in-region in-division school', () => {
  const athlete = {
    gpa: 3.7, position: 'Forward',
    preferred_divisions: ['D-III'], preferred_regions: ['West'],
  };
  const goodFit = { division: 'D-III', region: 'West', state: 'OR', avg_admit_gpa: 3.5, estimated_net_cost: 14000, position_needs: ['Forward'] };
  const poorFit = { division: 'D-I', region: 'Northeast', state: 'NY', avg_admit_gpa: 3.9, estimated_net_cost: 38000, position_needs: ['Defender'] };

  const a = matcher.score(athlete, goodFit);
  const b = matcher.score(athlete, poorFit);

  assert.ok(a.score > b.score, `expected ${a.score} > ${b.score}`);
  assert.ok(['likely','target'].includes(a.tier));
});

test('college-match returns valid tiers', () => {
  const athlete = { gpa: 3.0, position: 'Forward', preferred_divisions: [], preferred_regions: [] };
  const school = { division: 'D-II', region: 'West', avg_admit_gpa: 3.3, estimated_net_cost: 25000 };
  const result = matcher.score(athlete, school);
  assert.ok(['likely','target','reach'].includes(result.tier));
  assert.ok(result.score >= 0 && result.score <= 100);
});
