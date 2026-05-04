'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const matcher = require('../lib/college-match');

const router = express.Router();

// Sample college dataset — in production, would be a real schools/programs table.
const SAMPLE_COLLEGES = [
  { id: 101, name: 'Whitworth University', division: 'D-III', region: 'West', state: 'WA', avg_admit_gpa: 3.5, estimated_net_cost: 14000, position_needs: ['Forward','Midfielder'] },
  { id: 102, name: 'Southern Oregon University', division: 'NAIA', region: 'West', state: 'OR', avg_admit_gpa: 3.2, estimated_net_cost: 11000, position_needs: ['Forward','Defender'] },
  { id: 103, name: 'University of the Pacific', division: 'D-II', region: 'West', state: 'CA', avg_admit_gpa: 3.6, estimated_net_cost: 22000, position_needs: ['Forward'] },
  { id: 104, name: 'Lewis & Clark College', division: 'D-III', region: 'West', state: 'OR', avg_admit_gpa: 3.7, estimated_net_cost: 18000, position_needs: ['Midfielder'] },
  { id: 105, name: 'Pacific Lutheran University', division: 'D-III', region: 'West', state: 'WA', avg_admit_gpa: 3.4, estimated_net_cost: 16500, position_needs: ['Forward','Midfielder'] },
  { id: 106, name: 'Concordia University Irvine', division: 'D-II', region: 'West', state: 'CA', avg_admit_gpa: 3.5, estimated_net_cost: 24000, position_needs: ['Defender','Midfielder'] },
  { id: 107, name: 'Eastern Oregon University', division: 'NAIA', region: 'West', state: 'OR', avg_admit_gpa: 3.0, estimated_net_cost: 9500, position_needs: ['Forward','Goalkeeper'] },
  { id: 108, name: 'Linfield University', division: 'D-III', region: 'West', state: 'OR', avg_admit_gpa: 3.5, estimated_net_cost: 17000, position_needs: ['Forward'] },
];

router.get('/:athleteId', (req, res) => {
  const athlete = db.prepare('SELECT * FROM athletes WHERE id = ?').get(req.params.athleteId);
  if (!athlete) return res.status(404).json({ error: 'not_found' });

  const enriched = {
    ...athlete,
    preferred_divisions: ['D-II','D-III','NAIA'],
    preferred_regions: ['West'],
  };

  const matches = SAMPLE_COLLEGES
    .map(c => ({ college: c, ...matcher.score(enriched, c) }))
    .sort((a, b) => b.score - a.score);

  res.json({
    athlete_id: athlete.id,
    matches,
    by_tier: {
      likely: matches.filter(m => m.tier === 'likely'),
      target: matches.filter(m => m.tier === 'target'),
      reach:  matches.filter(m => m.tier === 'reach'),
    },
  });
});

module.exports = router;
