'use strict';

const db = require('../db');

const insertEvent = db.prepare(`
  INSERT INTO audit_events (actor_user_id, action, target_type, target_id, ip_address, metadata)
  VALUES (@actor_user_id, @action, @target_type, @target_id, @ip_address, @metadata)
`);

function record(req, action, target = {}) {
  insertEvent.run({
    actor_user_id: req.user?.id ?? null,
    action,
    target_type: target.type ?? null,
    target_id: target.id ?? null,
    ip_address: req.ip ?? req.headers['x-forwarded-for'] ?? null,
    metadata: target.metadata ? JSON.stringify(target.metadata) : null,
  });
}

module.exports = { record };
