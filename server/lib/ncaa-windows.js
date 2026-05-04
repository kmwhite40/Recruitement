'use strict';

/**
 * Compliance-aware messaging windows.
 * Simplified approximation; production would track sport-specific dead periods
 * and class-year contact rules.
 */

const RULES = {
  football: {
    contact_open_grade: 11,
    notes: 'D-I football: written communication permitted from June 15 after sophomore year.',
  },
  basketball: {
    contact_open_grade: 10,
    notes: 'D-I basketball: written communication permitted from June 15 after sophomore year.',
  },
  soccer: {
    contact_open_grade: 11,
    notes: 'Most contact rules permit written outreach during junior year.',
  },
  baseball: {
    contact_open_grade: 11,
    notes: 'Recruiting calendar follows D-I bylaws; written outreach generally permitted in junior year.',
  },
  volleyball: {
    contact_open_grade: 11,
    notes: 'Written outreach permitted during junior year window.',
  },
  default: {
    contact_open_grade: 11,
    notes: 'Default: written outreach generally permitted from June 15 after sophomore year.',
  },
};

function check({ sport, athleteGrade }) {
  const rule = RULES[sport?.toLowerCase()] || RULES.default;
  const allowed = athleteGrade >= rule.contact_open_grade;
  return { allowed, rule_applied: rule };
}

module.exports = { check, RULES };
