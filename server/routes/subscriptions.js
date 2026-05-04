'use strict';

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const audit = require('../lib/audit');

const router = express.Router();

const PLANS = {
  spark:              { name: 'Spark',              monthly: 0,    annual: 0,    seats: 1,  trial_days: 0  },
  athlete_pro:        { name: 'Athlete Pro',        monthly: 2499, annual: 22900, seats: 1,  trial_days: 14 },
  family:             { name: 'Family Plan',        monthly: 3499, annual: 32900, seats: 4,  trial_days: 14 },
  loader_teammate:    { name: 'Student Loader · Teammate',    monthly: 900,  annual: 8900,  seats: 3,  trial_days: 7 },
  loader_manager:     { name: 'Student Loader · Manager',     monthly: 1900, annual: 17900, seats: 10, trial_days: 7 },
  loader_ambassador:  { name: 'Student Loader · Ambassador',  monthly: 2900, annual: 27900, seats: 25, trial_days: 7 },
};

const insertSub = db.prepare(`
  INSERT INTO subscriptions (owner_user_id, plan, billing_cycle, seats, status, trial_ends_at, renews_at, voucher_code)
  VALUES (@owner_user_id, @plan, @billing_cycle, @seats, @status, @trial_ends_at, @renews_at, @voucher_code)
`);

router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS, currency: 'USD' });
});

router.post('/checkout', authenticate, (req, res) => {
  const { plan = 'athlete_pro', billing_cycle = 'annual', voucher_code } = req.body || {};
  const config = PLANS[plan];
  if (!config) return res.status(400).json({ error: 'unknown_plan', valid: Object.keys(PLANS) });

  const now = new Date();
  const trialEnds = new Date(now.getTime() + config.trial_days * 86400 * 1000);
  const renewsDays = billing_cycle === 'annual' ? 365 : 30;
  const renewsAt = new Date(trialEnds.getTime() + renewsDays * 86400 * 1000);

  const status = config.trial_days > 0 ? 'trialing' : 'active';
  const result = insertSub.run({
    owner_user_id: req.user.id,
    plan,
    billing_cycle,
    seats: config.seats,
    status,
    trial_ends_at: config.trial_days > 0 ? trialEnds.toISOString() : null,
    renews_at: renewsAt.toISOString(),
    voucher_code: voucher_code || null,
  });

  audit.record(req, 'subscription.created', {
    type: 'subscription', id: result.lastInsertRowid, metadata: { plan, billing_cycle },
  });

  // In production: create Stripe checkout session and return URL.
  res.status(201).json({
    id: result.lastInsertRowid,
    plan,
    status,
    trial_ends_at: status === 'trialing' ? trialEnds.toISOString() : null,
    renews_at: renewsAt.toISOString(),
    checkout_url_mock: `/checkout/success?sub=${result.lastInsertRowid}`,
  });
});

router.get('/mine', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM subscriptions WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ count: rows.length, subscriptions: rows });
});

router.post('/:id/pause', authenticate, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND owner_user_id = ?').get(req.params.id, req.user.id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE subscriptions SET status = 'paused' WHERE id = ?").run(sub.id);
  audit.record(req, 'subscription.paused', { type: 'subscription', id: sub.id });
  res.json({ ok: true });
});

router.post('/:id/cancel', authenticate, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND owner_user_id = ?').get(req.params.id, req.user.id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE subscriptions SET status = 'canceled' WHERE id = ?").run(sub.id);
  audit.record(req, 'subscription.canceled', { type: 'subscription', id: sub.id });
  res.json({ ok: true });
});

module.exports = router;
