# ScholarPath Athletics — Runbook

Operational guide for deploying, running, and troubleshooting ScholarPath Athletics. Read [README.md](README.md) first for product overview.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [First-time setup](#first-time-setup)
3. [Daily operations](#daily-operations)
4. [Configuration](#configuration)
5. [Database operations](#database-operations)
6. [Deployment](#deployment)
7. [Monitoring & logs](#monitoring--logs)
8. [Troubleshooting](#troubleshooting)
9. [Common tasks](#common-tasks)
10. [Backup & recovery](#backup--recovery)
11. [Security checklist](#security-checklist)
12. [Incident response](#incident-response)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | 24.x tested |
| npm | ≥ 9 | Bundled with Node |
| Disk | ~ 200 MB free | For node_modules + DB + film/docs |
| Network | Outbound HTTPS | Only if using `ANTHROPIC_API_KEY` |

No system services required — SQLite runs in-process. No Postgres, no Redis, no S3 in the default configuration.

---

## First-time setup

```bash
git clone <repo> Recruitement
cd Recruitement
npm install
npm start
```

On first boot you'll see:

```
▶ Empty database — running first-time seed…
▶ Seeding ScholarPath demo data…
  ✓ migration 002 seeded: 10 coaches, 6 camps, 6 pipeline schools, 3 visits, 4 docs, 2 saved searches
✓ Demo data seeded.
```

Then:

```
ScholarPath Athletics
→ http://localhost:5173
→ API: http://localhost:5173/api/health
```

Verify the install:

```bash
curl http://localhost:5173/api/health
# {"status":"ok","users":9,"athletes":6,"version":"0.1.0"}
```

Run the test suite:

```bash
npm test          # 8 tests should pass in ~30ms
```

---

## Daily operations

### Start the server

```bash
npm start                       # default port 5173
PORT=8080 npm start             # custom port
NODE_ENV=production npm start   # disables request logging
```

### Stop the server

```bash
# Ctrl+C in the foreground terminal, or:
lsof -ti:5173 | xargs kill
```

### Auto-restart on file changes (dev)

```bash
npm run dev                     # uses node --watch
```

---

## Configuration

All configuration is via environment variables. There is no config file; the app reads `process.env` at startup.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `5173` | HTTP port |
| `NODE_ENV` | unset | Set to `production` to disable per-request logging |
| `JWT_SECRET` | `scholarpath-dev-secret-change-me` | **Replace in production.** Used to sign session JWTs |
| `ANTHROPIC_API_KEY` | unset | When set, `/api/ai/*` calls Claude Sonnet 4.6; otherwise falls back to templates |

Example production launch:

```bash
NODE_ENV=production \
PORT=443 \
JWT_SECRET=$(openssl rand -hex 32) \
ANTHROPIC_API_KEY=sk-ant-… \
node server/index.js
```

---

## Database operations

### Reset the database

Wipes the SQLite file and re-seeds:

```bash
npm run reset
```

What this does:

```
rm -f data/scholarpath.db && node server/seed.js
```

The seed script automatically applies migration 002 before inserting demo data.

### Apply a migration without reseeding

```bash
node server/migrations/002_competitive_features.js
```

Migrations are idempotent (`CREATE TABLE IF NOT EXISTS` + introspection of column lists before `ALTER`).

### Inspect the database

```bash
sqlite3 data/scholarpath.db
sqlite> .tables
sqlite> .schema athletes
sqlite> SELECT id, full_name FROM users;
sqlite> SELECT stage, COUNT(*) FROM pipeline_schools GROUP BY stage;
sqlite> .quit
```

### Backup

```bash
# Live backup (safe while server is running thanks to WAL mode)
sqlite3 data/scholarpath.db ".backup '/tmp/scholarpath-$(date +%Y%m%d-%H%M).db'"
```

### Restore

```bash
# Stop the server first
lsof -ti:5173 | xargs kill
cp /tmp/scholarpath-YYYYMMDD-HHMM.db data/scholarpath.db
rm -f data/scholarpath.db-shm data/scholarpath.db-wal
npm start
```

---

## Deployment

### Single-VM deployment (simplest)

```bash
# On the server (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install -y nodejs npm git nginx

# Clone & install
git clone <repo> /opt/scholarpath
cd /opt/scholarpath
npm install --omit=dev

# Run under systemd
sudo tee /etc/systemd/system/scholarpath.service > /dev/null <<'EOF'
[Unit]
Description=ScholarPath Athletics
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/scholarpath
Environment=NODE_ENV=production
Environment=PORT=5173
EnvironmentFile=/etc/scholarpath.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
EOF

# Secrets file
sudo tee /etc/scholarpath.env > /dev/null <<EOF
JWT_SECRET=$(openssl rand -hex 32)
ANTHROPIC_API_KEY=sk-ant-…
EOF
sudo chmod 600 /etc/scholarpath.env

sudo systemctl enable --now scholarpath
sudo systemctl status scholarpath
```

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name scholarpath.example.com;
    ssl_certificate     /etc/letsencrypt/live/scholarpath.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scholarpath.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE needs unbuffered + long timeouts
    location /api/events/stream {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 24h;
        proxy_set_header Connection '';
    }
}
```

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` set to a random 32-byte value
- [ ] HTTPS terminated at the proxy
- [ ] `data/` directory owned by the service user only (`chmod 700`)
- [ ] `data/scholarpath.db` backed up nightly
- [ ] Logs forwarded to syslog or a log aggregator
- [ ] Rate limits reviewed (`server/middleware/security.js`)
- [ ] Firewall: only 80/443 inbound; `5173` not exposed
- [ ] Anthropic key stored in env file with `chmod 600`, not in git

---

## Monitoring & logs

### Log format

When `NODE_ENV != production`, every API request is logged to stdout:

```
2026-05-04T01:48:13.211Z POST /api/auth/login 200 24ms -
2026-05-04T01:48:13.444Z GET  /api/pipeline/1 200 8ms u1/athlete
2026-05-04T01:48:14.118Z PATCH /api/pipeline/1/3/stage 200 6ms u1/athlete
```

Format: `<ISO timestamp> <METHOD> <path> <status> <ms> <user>`

Where `<user>` is `u<id>/<role>` for authed requests, `-` for anonymous.

### Capture logs

```bash
# Foreground
npm start 2>&1 | tee -a /var/log/scholarpath.log

# Under systemd
journalctl -u scholarpath -f
journalctl -u scholarpath --since "1 hour ago"
```

### Audit log

Every mutating action is recorded in the `audit_events` table:

```sql
SELECT created_at, action, actor_user_id, target_type, target_id
FROM audit_events
ORDER BY created_at DESC
LIMIT 50;
```

Common actions to audit:
- `user.signup`, `user.login`, `user.logout`
- `consent.recorded`
- `athlete.updated`
- `eligibility.course_added`, `eligibility.course_updated`
- `film.uploaded`, `film.verified`
- `outreach.sent`, `recruiter.message_sent`, `recruiter.message_blocked`
- `subscription.created`, `subscription.paused`, `subscription.canceled`
- `loader.granted`, `loader.revoked`
- `pipeline.stage_changed`
- `recruiter.search`, `watchlist.add`
- `ai.outreach_draft`, `ai.fit_explain`, `ai.interview_evaluated`

### Health check (for load balancers)

```bash
curl -fsS http://localhost:5173/api/health || exit 1
```

Returns 200 with JSON when healthy. Tie this into your load balancer's health probe.

---

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::5173
```

```bash
lsof -ti:5173 | xargs kill -9
npm start
```

### Database locked / corrupted

```bash
# Stop the server
lsof -ti:5173 | xargs kill

# Inspect WAL state
ls -la data/scholarpath.db*

# If WAL is the problem, checkpoint it
sqlite3 data/scholarpath.db "PRAGMA wal_checkpoint(TRUNCATE);"

# If beyond repair, restore from backup or reseed
npm run reset
```

### "AI features not working"

1. `curl http://localhost:5173/api/ai/status` — should show `{"enabled":true,...}` if API key is set.
2. If `enabled: false`, check the env var: `echo "$ANTHROPIC_API_KEY" | head -c 10`.
3. Check the SDK loaded: `npm ls @anthropic-ai/sdk`.
4. Server logs will show `[ai] failed to load @anthropic-ai/sdk: …` if loading failed.

When the API key is unset, AI endpoints return template-generated responses with `generated_with: "template-v1"`. This is intentional, not a bug.

### "I'm signed in but `/api/auth/me` returns 401"

- Cookie not being sent: ensure your fetch calls include `credentials: 'include'`.
- Mismatched origin: the auth cookie is `SameSite=Lax`. If your frontend runs on a different origin, configure CORS and switch to `SameSite=None; Secure`.
- JWT secret rotated: every existing session is invalidated. Users must log in again.

### "Recruiter search returns 0 athletes"

- Athletes need `publish_status = 'published'` to appear. Check with:
  ```sql
  SELECT id, full_name, publish_status FROM athletes JOIN users ON users.id = athletes.user_id;
  ```
- Filters might be too tight. Try `/api/search?sport=soccer` with no other filters.
- Recruiter must be authed and have role `recruiter` (and a row in `recruiters`).

### SSE notifications not appearing

- Browser tab must be the athlete's own dashboard (`/api/events/stream` looks up the athlete by the authed user).
- Behind nginx? Check `proxy_buffering off` and a long `proxy_read_timeout` for the `/api/events/stream` location (see deployment example).
- Test the broadcast manually:
  ```bash
  curl -b /tmp/sp.txt -X POST http://localhost:5173/api/events/_test-emit \
    -H "Content-Type: application/json" \
    -d '{"athlete_id":1,"type":"profile_view","school":"Test U"}'
  ```

### Test suite fails

```bash
node --test server/test/eligibility.test.js
```

If a test fails, the assertion message tells you which fixture or expectation broke. The tests have no DB dependencies — they exercise the rules engine directly.

---

## Common tasks

### Add a new admin user (manual)

```bash
sqlite3 data/scholarpath.db <<SQL
INSERT INTO users (email, password_hash, role, full_name, identity_verified)
VALUES (
  'admin@example.com',
  '$(node -e "console.log(require('bcryptjs').hashSync('changeme!', 10))")',
  'admin',
  'Site Admin',
  1
);
SQL
```

### Promote an athlete profile to published

```sql
UPDATE athletes SET publish_status = 'published' WHERE id = ?;
```

### Revoke a loader's access immediately

```sql
UPDATE loaders SET revoked_at = datetime('now')
WHERE loader_user_id = ? AND athlete_id = ?;
```

### Force a subscription to cancel (refund handled separately)

```sql
UPDATE subscriptions SET status = 'canceled' WHERE id = ?;
```

### Disable AI for one user only

There's no per-user toggle. Either unset `ANTHROPIC_API_KEY` (affects all users) or short-circuit at the route level — add an early return in `server/routes/ai.js` when `req.user.email` matches your block list.

### Increase rate limits

Edit `server/middleware/security.js`:

```js
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,        // was 20 — set higher
  ...
});
```

Restart the server.

---

## Backup & recovery

### Nightly backup cron

```bash
sudo crontab -e
# Runs at 02:30 every day
30 2 * * * /usr/bin/sqlite3 /opt/scholarpath/data/scholarpath.db ".backup '/var/backups/scholarpath/$(date +\%Y\%m\%d).db'" && find /var/backups/scholarpath -mtime +30 -delete
```

### File backups

Beyond the SQLite DB, also back up:

| Path | Contents |
|---|---|
| `data/film/` | Uploaded athlete films |
| `data/documents/` | Uploaded transcripts, recommendations, NLI scans |

These are user-uploaded media and must be preserved. Consider rsync to off-host storage or an S3 bucket.

### Disaster recovery drill

Once a quarter:

1. On a fresh VM, `git clone`, `npm install`.
2. Restore the latest SQLite backup to `data/scholarpath.db`.
3. Restore `data/film/` and `data/documents/`.
4. `NODE_ENV=production npm start`.
5. Smoke test: log in as Maya, view dashboard, view eligibility, view pipeline.
6. Document the recovery time and restore source.

---

## Security checklist

| Control | Status | Notes |
|---|---|---|
| HTTPS only (behind proxy) | Configure | Use nginx/Caddy + Let's Encrypt |
| `JWT_SECRET` rotated from default | **Required** | `openssl rand -hex 32` |
| `data/` permissions `700` | Configure | `sudo chown -R www-data:www-data data && sudo chmod -R 700 data` |
| Audit log retention | Implement | Truncate `audit_events` after 12 months by policy |
| Parental consent on under-18 athletes | Server-enforced | See `server/routes/auth.js#consent` |
| Recruiter identity verification | Manual | Mark `users.identity_verified = 1` only after manual review |
| Loader cannot send outreach | Server-enforced | Loaders are blocked at `/api/outreach/send` by role check |
| NCAA messaging windows | Server-enforced | `server/lib/ncaa-windows.js` |
| Rate limiting | On | `server/middleware/security.js` |
| Security headers | On | `securityHeaders` middleware |
| Multer file size cap | On | 500 MB film, 25 MB documents |

### Adult ↔ minor messaging

Direct private messaging between adults and minors is restricted by design. The `outreach` table records every message with audit metadata. **Before adopting in a state with strict mandatory reporter laws**, confirm your routing satisfies state requirements and add the appropriate visibility for parents/coaches.

---

## Incident response

### Suspected data breach

1. **Stop the bleeding.** Take the service offline: `sudo systemctl stop scholarpath`.
2. **Preserve evidence.** `cp -a data /tmp/scholarpath-incident-$(date +%s)`.
3. **Rotate credentials.** New `JWT_SECRET` (invalidates all sessions); new `ANTHROPIC_API_KEY`.
4. **Identify scope.**
   ```sql
   SELECT actor_user_id, action, COUNT(*) FROM audit_events
   WHERE created_at >= datetime('now','-24 hours')
   GROUP BY actor_user_id, action
   ORDER BY COUNT(*) DESC;
   ```
5. **Notify affected users.** State law dictates timeline — typically 30–72 hours.
6. **Restore service** with rotated secrets after root cause is identified.

### Mass data deletion

Foreign keys with `ON DELETE CASCADE` mean deleting a user removes their athletes, films, stats, etc. **There is no undo.** Always work from a backup copy.

### Reporting abuse

Athletes, parents, and coaches can report abuse through the platform. The route is currently a placeholder — wire `POST /api/abuse-report` to your incident response inbox before going live.

---

## Contacts

- Engineering: replace with your team
- Compliance / privacy: privacy@scholarpath.example
- Legal: legal@scholarpath.example
- On-call rotation: replace with your rotation

---

*Document this file when you change deployment topology, add a new env var, or introduce a new operational concern. The runbook is only useful if it stays current.*
