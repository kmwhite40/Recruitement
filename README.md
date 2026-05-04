# ScholarPath Athletics

> The modern scholarship-readiness platform for high school student-athletes.
> **Built to be Recruited. Built to be Ready.**

ScholarPath pairs verified athletic film with real-time NCAA / NAIA / JUCO eligibility tracking, AI-assisted coach outreach, and an athlete-side recruiting CRM — so the right college coaches see your athlete, and your athlete is actually ready when they call. We don't promise scholarships. We promise the five things that put one within reach: **preparation, exposure, eligibility, character, and college fit.**

---

## Quick start

```bash
git clone <repo>
cd Recruitement
npm install
npm start
```

Open http://localhost:5173 and sign in with any demo account below.

The first boot auto-applies migrations and seeds demo data (9 users, 6 athletes, 18 core courses, 10 college coaches, 6 camps, 6 pipeline schools, 3 visits, 4 documents, 2 saved searches).

To enable Claude Sonnet 4.6 for outreach drafting / fit explanations / interview evaluation:

```bash
ANTHROPIC_API_KEY=sk-… npm start
```

When the API key is absent, every AI endpoint falls back to deterministic templates so the platform stays fully functional.

---

## Demo accounts

Password for all: **`password123`**

| Role | Email | What you can do |
|---|---|---|
| Athlete | `maya@example.com` | Dashboard, profile, pipeline, visits, interview practice |
| Parent | `parent.rodriguez@example.com` | Parent portal, financial aid, consent, scam alerts |
| HS Coach | `coach.williams@lincolnhs.edu` | Roster, attestation queue, AD reports |
| Recruiter | `coach.davis@whitworth.edu` | Search, watchlists, compare, saved searches |

---

## What's in the box

### 19 pages

| Path | Purpose |
|---|---|
| [`index.html`](index.html) | Marketing landing |
| [`subscription.html`](subscription.html) | Plans incl. Student-Loader tiers + modern checkout |
| [`login.html`](login.html) / [`signup.html`](signup.html) | Auth with role picker |
| [`athlete-dashboard.html`](athlete-dashboard.html) | Readiness ring, Today's Three, **live SSE recruiter activity** |
| [`athlete-profile.html`](athlete-profile.html) | Recruiting profile (film, stats, academics, references) |
| [`pipeline.html`](pipeline.html) | **Athlete CRM (Kanban) — drag schools across 7 stages** |
| [`coach-directory.html`](coach-directory.html) | **Verified college coach contact database** |
| [`camps.html`](camps.html) | **Camps & showcases finder** with verified coach attendance |
| [`visits.html`](visits.html) | **Official / unofficial visit planner** with itineraries |
| [`timeline.html`](timeline.html) | **Grade-by-grade roadmap** from freshman year to signing day |
| [`eligibility-tracker.html`](eligibility-tracker.html) | NCAA / NAIA / JUCO core-course tracker with predictive GPA |
| [`interview-practice.html`](interview-practice.html) | **Voice mock interview** scored on clarity / content / confidence |
| [`recruiter-portal.html`](recruiter-portal.html) | Searchable verified athlete database |
| [`compare.html`](compare.html) | Side-by-side athlete comparison |
| [`coach-dashboard.html`](coach-dashboard.html) | Roster, attestation queue, AD reporting |
| [`parent-consent.html`](parent-consent.html) / [`privacy.html`](privacy.html) / [`terms.html`](terms.html) | Compliance pages |

### Backend (Node + SQLite + JWT)

```
server/
├── index.js                       Express bootstrap, static serving, auto-seed
├── db.js                          better-sqlite3 + 15 base tables
├── seed.js                        Demo data
├── migrations/
│   └── 002_competitive_features.js  Pipeline, coaches, camps, visits, docs, saved-searches
├── middleware/
│   ├── auth.js                    JWT + cookie auth + role guards
│   └── security.js                Rate limit + request log + headers
├── lib/
│   ├── eligibility-rules.js       NCAA core-GPA, forecasts, readiness score
│   ├── ncaa-windows.js            Compliance-aware messaging windows
│   ├── college-match.js           Multi-factor fit (academic, athletic, region, cost)
│   ├── ai.js                      Claude Sonnet 4.6 + prompt caching + fallback
│   └── audit.js                   Audit log writer
├── routes/                        14 route modules
└── test/                          node:test unit suite
```

### Database — 21 tables

Users, athletes, schools, core_courses, films, stats, recruiters, watchlists, film_views, outreach (with email tracking columns), consents, loaders, subscriptions, audit_events, recruiter_activity, **pipeline_schools**, **college_coaches**, **camps_events**, **visits**, **documents**, **saved_searches**.

Foreign keys enforced, WAL mode, indexed where it matters. Migration **002** runs idempotently on every boot — safe to apply on existing data.

---

## Feature highlights

### Eligibility-first

Core-course tracking maps each completed course to NCAA core areas, calculates real core-GPA from letter grades, and forecasts year-end GPA against the D-I, D-II, and NAIA floors with a green/amber/red stoplight.

### Athlete CRM (Kanban pipeline)

Track every school as it moves through **researching → contacted → replied → visiting → offered → committed**. Drag a card; the stage persists immediately. Funnel summary tiles surface the soonest next-action due date.

### Verified coach directory

Searchable college coach contacts with email, phone, division, conference, recruiting territory. One click adds a school to your pipeline; another click drafts an outreach email through Claude Sonnet 4.6.

### Voice interview practice

Web Speech API records your answer, transcribes in-browser, and POSTs to `/api/ai/interview-evaluate` for scoring on clarity, content, and confidence — plus a 60-90 word rewrite to rehearse. Falls back to a heuristic evaluator when no API key is set.

### Live recruiter activity (SSE)

Athlete dashboards subscribe to `/api/events/stream`. Whenever a verified recruiter views your profile, watches your film, or adds you to a watchlist, you see a toast notification within seconds.

### Compliance-aware messaging

Recruiter-to-athlete messages run through `lib/ncaa-windows.js` which enforces sport-specific contact windows by class year. Messages outside the window are server-blocked with `compliance_window_ok = 0` and an audit-log entry.

### Subscription tiers (modern style)

Free Spark · Athlete Pro · Family Plan · Student-Loader (Teammate / Manager / Ambassador). The Student-Loader tier lets a peer build profiles for athletes who don't have time, tech access, or family support — every loader action is consent-gated, athlete-revocable, and audit-logged.

---

## API surface

Base URL: `http://localhost:5173/api`. All `POST` / `PATCH` / `DELETE` require auth (cookie-based JWT, set on login).

| Group | Endpoints |
|---|---|
| **Auth** | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/consent` |
| **Athletes** | `GET /athletes`, `GET /athletes/:id`, `PATCH /athletes/:id`, `GET /athletes/:id/readiness` |
| **Eligibility** | `GET /eligibility/:athleteId`, `POST /eligibility/:athleteId/courses`, `GET /eligibility/:athleteId/forecast` |
| **Pipeline** | `GET/POST /pipeline/:athleteId`, `PATCH /pipeline/:athleteId/:id/stage`, `DELETE /pipeline/:athleteId/:id` |
| **Coaches** | `GET /coaches?sport=&division=&region=&q=` |
| **Camps** | `GET /camps?sport=&type=&region=&max_cost=&after=` |
| **Visits** | `GET/POST /visits/:athleteId`, `PATCH /visits/:athleteId/:id` |
| **Documents** | `GET /documents/:athleteId`, `POST /documents/:athleteId` (multer), `DELETE /…/:id` |
| **Recruiter Search** | `GET /search`, `POST/GET /search/watchlist` |
| **Saved Searches** | `GET/POST /saved-searches`, `DELETE /saved-searches/:id` |
| **Film** | `POST /film/upload`, `POST /film/:id/verify`, `POST /film/:id/view` |
| **Outreach** | `POST /outreach/draft`, `POST /outreach/send`, `POST /outreach/recruiter-send` |
| **AI** | `GET /ai/status`, `POST /ai/outreach-draft`, `POST /ai/college-fit-explain`, `GET /ai/interview-questions`, `POST /ai/interview-evaluate` |
| **Match** | `GET /match/:athleteId` |
| **Subscriptions** | `GET /subscriptions/plans`, `POST /subscriptions/checkout`, `GET /subscriptions/mine`, `POST /subscriptions/:id/{pause,cancel}` |
| **Loaders** | `POST /loaders/grant`, `POST /loaders/revoke`, `GET /loaders/mine` |
| **Events (SSE)** | `GET /events/stream` |
| **Health** | `GET /health` |

---

## Running tests

```bash
npm test
```

Currently 8 tests covering the eligibility rules engine and college matcher. Uses the Node 18+ built-in test runner — no extra dev deps.

---

## Trust & verification

- Every mutating action is logged in `audit_events` with actor, target, IP, and JSON metadata.
- Films and stats carry a `source` (`self` / `coach` / `event` / `system`); recruiters can filter to verified-only.
- Parental consent is recorded with timestamp, version, IP for FERPA / COPPA alignment.
- Recruiters are identity-verified before access.
- Loaders cannot send outreach on behalf of athletes — server-enforced.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (no build step) |
| Backend | Node 18+, Express, better-sqlite3 |
| Auth | JWT in HTTP-only cookies + role guards |
| Validation | zod (available; not heavily used yet) |
| AI | `@anthropic-ai/sdk` with prompt caching |
| File upload | multer |
| Real-time | Server-Sent Events |
| PWA | Service worker + manifest |
| Tests | `node:test` |
| Rate limit | `express-rate-limit` |

Total dependencies: 8 production, 0 dev.

---

## Operational guide

See [RUNBOOK.md](RUNBOOK.md) for deployment, configuration, troubleshooting, and common operations.

---

## Roadmap

- Replace SQLite with Postgres for multi-instance deployments
- Replace film storage with Mux / Cloudflare Stream
- Replace mock AI tagging with a real CV pipeline (PyTorch worker)
- Replace mock subscription with live Stripe Checkout
- React Native apps (athlete, parent, coach, recruiter)
- SOC 2 Type II + Vanta for compliance evidence
- Multi-region AWS deployment with managed Postgres + S3

---

*Not affiliated with the NCAA, NAIA, or NJCAA. ScholarPath does not guarantee any athletic scholarship, offer, admission, or roster spot.*
