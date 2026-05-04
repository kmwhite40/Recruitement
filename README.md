# ScholarPath Athletics

The modern scholarship-readiness platform for high school student-athletes.
Built to be Recruited. Built to be Ready.

## Run it

```bash
npm install   # already done if you cloned with node_modules
npm start     # boots Node server on http://localhost:5173
# or: PORT=5174 npm start
```

First boot auto-seeds the SQLite database with demo data.
Open http://localhost:5173 and sign in with any demo account.

### Demo accounts (password: `password123`)

| Role | Email |
|---|---|
| Athlete | `maya@example.com` |
| Parent | `parent.rodriguez@example.com` |
| HS Coach | `coach.williams@lincolnhs.edu` |
| Recruiter | `coach.davis@whitworth.edu` |

## Frontend pages

| Path | Purpose |
|---|---|
| `index.html` | Landing — hero, features, roles, pricing preview |
| `subscription.html` | Pricing + Student-Loader tiers + modern checkout |
| `login.html` / `signup.html` | Auth pages with role picker |
| `athlete-dashboard.html` | Readiness score, Today's Three, recruiter activity, matches |
| `athlete-profile.html` | Recruiting profile (film, stats, academics, references) |
| `eligibility-tracker.html` | NCAA / NAIA / JUCO core-course tracker |
| `recruiter-portal.html` | Searchable verified athlete database |
| `parent-consent.html` | Required for under-18 athletes |
| `privacy.html` / `terms.html` | Compliance pages |

`data-loader.js` hydrates dashboard / profile / eligibility / search with live API
data when the server is running, and falls back to static demo content otherwise.

## Backend API

Express + SQLite (better-sqlite3) + JWT cookie auth.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | — | Health and counts |
| `/api/auth/signup` | POST | — | Create account (any role) |
| `/api/auth/login` | POST | — | Sign in, sets `sp_token` cookie |
| `/api/auth/logout` | POST | ✓ | Clear session |
| `/api/auth/me` | GET | ✓ | Current user |
| `/api/auth/consent` | POST | parent | Record parental consent |
| `/api/athletes` | GET | optional | List published athletes (filterable) |
| `/api/athletes/:id` | GET | optional | Full athlete with eligibility, film, stats |
| `/api/athletes/:id` | PATCH | owner / loader / coach | Update athlete |
| `/api/athletes/:id/readiness` | GET | — | Live readiness score + breakdown |
| `/api/eligibility/:athleteId` | GET | — | Core-course matrix, GPA, forecasts |
| `/api/eligibility/:athleteId/courses` | POST/PATCH | ✓ | Add or update a course |
| `/api/eligibility/:athleteId/forecast` | GET | — | Stoplight + division-floor checks |
| `/api/search` | GET | recruiter | Athlete search w/ deep filters |
| `/api/search/watchlist` | POST/GET | recruiter | Manage watchlist |
| `/api/film/upload` | POST | ✓ | Multer-backed film upload + AI tag mock |
| `/api/film/:id/verify` | POST | coach | Coach attests a film |
| `/api/film/:id/view` | POST | recruiter | Records a view (analytics) |
| `/api/outreach/draft` | POST | ✓ | AI-template draft email to a coach |
| `/api/outreach/send` | POST | athlete | Send outreach |
| `/api/outreach/recruiter-send` | POST | recruiter | Recruiter→athlete msg, NCAA windows enforced |
| `/api/match/:athleteId` | GET | — | College fit match (Reach/Target/Likely) |
| `/api/subscriptions/plans` | GET | — | All plans + pricing |
| `/api/subscriptions/checkout` | POST | ✓ | Start subscription (mock checkout) |
| `/api/subscriptions/mine` | GET | ✓ | List user's subscriptions |
| `/api/subscriptions/:id/pause` | POST | owner | Pause subscription |
| `/api/subscriptions/:id/cancel` | POST | owner | Cancel subscription |
| `/api/loaders/grant` | POST | athlete/parent | Grant a loader access to a profile |
| `/api/loaders/revoke` | POST | athlete/parent | Revoke loader access |
| `/api/loaders/mine` | GET | ✓ | Profiles a loader is helping with |

## Architecture

```
server/
├── index.js                 # Express bootstrap, static serving, auto-seed
├── db.js                    # better-sqlite3 + full schema (15 tables)
├── seed.js                  # Demo data: 9 users, 6 athletes, 18 core courses
├── middleware/auth.js       # JWT issue + cookie auth + role guards
├── lib/
│   ├── eligibility-rules.js # NCAA core-GPA, forecasts, readiness score
│   ├── ncaa-windows.js      # Compliance-aware messaging windows
│   ├── college-match.js     # Multi-factor fit (academic, athletic, region, cost)
│   └── audit.js             # Audit-log every mutating action
└── routes/
    ├── auth.js          ├── athletes.js     ├── eligibility.js
    ├── search.js        ├── film.js         ├── outreach.js
    ├── subscriptions.js ├── loaders.js      └── match.js
```

## Database (SQLite)

15 tables: `users`, `schools`, `athletes`, `core_courses`, `films`, `stats`,
`recruiters`, `watchlists`, `film_views`, `outreach`, `consents`, `loaders`,
`subscriptions`, `audit_events`, `recruiter_activity`. Foreign keys on,
WAL mode, with appropriate indexes.

## Trust & Verification

- Every mutating action is logged in `audit_events` with actor, target, IP, metadata.
- Films and stats carry a `source` (self / coach / event / system) — recruiters can
  filter to verified-only.
- Parental consent recorded with timestamp, version, IP for FERPA/COPPA alignment.
- NCAA messaging windows enforced server-side per sport and class year.
- Loaders cannot send outreach on behalf of athletes — server-enforced.

## PWA / Mobile

- `manifest.json` with maskable icons, app shortcuts, theme color
- `sw.js` service worker — cache-first for static, network-only for API
- All pages pull `data-loader.js` which hydrates UI from live API and shows
  a "Live API" badge when the server is running

## What's next (production-ready upgrades)

- Postgres + connection pooling instead of SQLite
- Replace film storage with Mux / Cloudflare Stream
- Replace mock AI tagging with real CV pipeline (PyTorch worker)
- Replace mock subscriptions with live Stripe Checkout
- Replace AI-templated outreach with Claude API + retrieval
- React Native apps (athlete, parent, coach, recruiter)
- SOC 2 Type II + Vanta + production deployment to AWS multi-AZ
