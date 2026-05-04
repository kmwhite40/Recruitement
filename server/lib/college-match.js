'use strict';

/**
 * College matching engine — transparent, multi-factor.
 * Returns Reach / Target / Likely tiers with explainable per-factor scores.
 */

function score(athlete, school) {
  const factors = {};

  // Academic fit (0-100)
  const gpa = athlete.gpa ?? 3.0;
  const sgpa = school.avg_admit_gpa ?? 3.3;
  factors.academic = Math.max(0, Math.min(100, 100 - (sgpa - gpa) * 80));

  // Athletic fit by division
  const divPref = (athlete.preferred_divisions || []).map(d => d.toLowerCase());
  factors.athletic = divPref.length === 0 || divPref.includes((school.division || '').toLowerCase()) ? 90 : 55;

  // Region preference
  const regionPref = (athlete.preferred_regions || []).map(r => r.toLowerCase());
  factors.region = regionPref.length === 0 || regionPref.includes((school.region || '').toLowerCase()) ? 85 : 60;

  // Position need
  factors.position_need = (school.position_needs || []).includes(athlete.position) ? 95 : 65;

  // School size preference (mid-size default)
  factors.size = 75;

  // Net cost (lower is better; normalize to 0-100)
  const netCost = school.estimated_net_cost ?? 25000;
  factors.cost = Math.max(0, Math.min(100, 100 - (netCost / 50000) * 100));

  const weights = { academic: 0.30, athletic: 0.25, region: 0.10, position_need: 0.20, size: 0.05, cost: 0.10 };
  const total = Object.entries(weights).reduce((sum, [k, w]) => sum + factors[k] * w, 0);

  let tier = 'reach';
  if (total >= 85) tier = 'likely';
  else if (total >= 72) tier = 'target';

  return { score: Math.round(total), tier, factors };
}

module.exports = { score };
