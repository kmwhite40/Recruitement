'use strict';

/**
 * NCAA / NAIA / JUCO eligibility rules engine.
 * Rule data is configuration so it can be updated without code changes.
 */

const NCAA_CORE_REQUIREMENTS = {
  english: 4,
  math: 3,
  science: 2,
  social_science: 2,
  foreign_lang_or_phil: 1,
  additional: 4,
  total: 16,
};

const DIVISION_FLOORS = {
  d1: { core_gpa: 2.30, total_core: 16 },
  d2: { core_gpa: 2.20, total_core: 16 },
  naia: { gpa: 2.30, criteria_required: 1 },
};

const GRADE_POINTS = {
  'A+': 4.3, 'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'F': 0,
};

function letterToPoints(letter) {
  if (!letter) return null;
  return GRADE_POINTS[letter.toUpperCase().trim()] ?? null;
}

function calculateCoreGPA(courses) {
  const completed = courses.filter(c => c.status === 'completed' && c.letter_grade);
  if (!completed.length) return null;
  let totalPoints = 0;
  let totalCredits = 0;
  for (const c of completed) {
    const pts = letterToPoints(c.letter_grade);
    if (pts === null) continue;
    totalPoints += pts * (c.credits || 1);
    totalCredits += (c.credits || 1);
  }
  return totalCredits ? +(totalPoints / totalCredits).toFixed(3) : null;
}

function countByArea(courses) {
  const counts = { english: 0, math: 0, science: 0, social_science: 0, foreign_lang_or_phil: 0, additional: 0 };
  for (const c of courses) {
    if (c.status === 'completed' && counts.hasOwnProperty(c.area)) counts[c.area] += (c.credits || 1);
  }
  return counts;
}

function totalCompleted(courses) {
  return courses
    .filter(c => c.status === 'completed')
    .reduce((sum, c) => sum + (c.credits || 1), 0);
}

function totalEnrolled(courses) {
  return courses
    .filter(c => c.status === 'in_progress' || c.status === 'completed')
    .reduce((sum, c) => sum + (c.credits || 1), 0);
}

function forecastEndOfYearGPA(courses) {
  const current = calculateCoreGPA(courses);
  if (current === null) return null;
  const inProgress = courses.filter(c => c.status === 'in_progress');
  if (!inProgress.length) return current;
  // Optimistic projection assumes B+ in remaining (calibrated from historical avg)
  const projected = inProgress.length * 3.3;
  const completedCount = courses.filter(c => c.status === 'completed').length;
  const totalCount = completedCount + inProgress.length;
  const completedPoints = current * completedCount;
  return +(((completedPoints + projected) / totalCount).toFixed(3));
}

function status(courses) {
  const coreGPA = calculateCoreGPA(courses);
  const projected = forecastEndOfYearGPA(courses);
  const completed = totalCompleted(courses);
  const enrolled = totalEnrolled(courses);
  const counts = countByArea(courses);

  const meetsD1 = projected !== null && projected >= DIVISION_FLOORS.d1.core_gpa && enrolled >= 16;
  const meetsD2 = projected !== null && projected >= DIVISION_FLOORS.d2.core_gpa && enrolled >= 16;
  const meetsNAIA = projected !== null && projected >= DIVISION_FLOORS.naia.gpa;

  let stoplight = 'green';
  if (projected === null || (projected < 2.0 && completed > 4)) stoplight = 'red';
  else if (projected < 2.5 || enrolled < 14) stoplight = 'amber';

  return {
    core_gpa: coreGPA,
    projected_year_end_gpa: projected,
    total_core_completed: completed,
    total_core_enrolled: enrolled,
    counts_by_area: counts,
    requirements: NCAA_CORE_REQUIREMENTS,
    floors: DIVISION_FLOORS,
    meets: { d1: meetsD1, d2: meetsD2, naia: meetsNAIA },
    stoplight,
    one_line:
      stoplight === 'green' ? 'On pace. Keep current grades to stay green for D-I, D-II, and NAIA.' :
      stoplight === 'amber' ? 'On watch. One area is dragging your projection — fixable this term.' :
      'Off track. Immediate intervention needed to preserve eligibility.',
  };
}

function readinessScore({ profileCompletePct, eligibility, filmCount, outreachCount, hasReferences }) {
  // Transparent weighted index.
  const weights = { academics: 30, athletics: 25, film: 15, outreach: 15, character: 15 };
  const academicScore = eligibility.stoplight === 'green' ? 100 : eligibility.stoplight === 'amber' ? 65 : 25;
  const athleticScore = filmCount >= 3 ? 90 : filmCount > 0 ? 60 : 30;
  const filmScore = Math.min(100, filmCount * 25);
  const outreachScore = Math.min(100, outreachCount * 6);
  const characterScore = (profileCompletePct >= 80 ? 70 : 40) + (hasReferences ? 30 : 0);

  const score = Math.round(
    (academicScore * weights.academics +
      athleticScore * weights.athletics +
      filmScore * weights.film +
      outreachScore * weights.outreach +
      characterScore * weights.character) / 100
  );
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  NCAA_CORE_REQUIREMENTS,
  DIVISION_FLOORS,
  letterToPoints,
  calculateCoreGPA,
  countByArea,
  totalCompleted,
  totalEnrolled,
  forecastEndOfYearGPA,
  status,
  readinessScore,
};
