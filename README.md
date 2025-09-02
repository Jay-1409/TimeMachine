# TimeMachine

<div align="center">

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen?logo=googlechrome)](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij)
[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/HarshDev625/TimeMachine)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/HarshDev625/TimeMachine/pulls)

</div>

<p align="center">
  <img src="extension/icon128.png" width="128" height="128" alt="TimeMachine Logo">
</p>

<h3 align="center">Minimal time tracking, Focus Sessions, Guard blocking, and rich reports</h3>

TimeMachine is a lightweight Chrome extension + Node.js backend that automatically tracks active website time, groups it into categories, and generates rich PDF and HTML reports. It now includes Focus Sessions, a Guard for websites & keywords (with a themed blocked page), a Solver tracker, a polished Summary with medals, and 7 UI themes.

## ✨ Current Features

| Area | Highlights |
|------|------------|
| Auth | Simple email + password (30‑day JWT) |
| Tracking | Automatic per‑domain active time (minute slices, local timezone) |
| Classification | Editable categories: Work / Social / Entertainment / Professional / Other |
| Dashboard | Daily / Weekly / Monthly views + Quick Insights panel (Top Site, Focus vs Leisure, Balance Score, Category Mix) |
| Scoring | Productivity score (Work + Professional + 0.5×Other) + balance heuristic |
| Reports | Rich PDF (insights + ranked domains + per-domain session stats + charts) + HTML email reports via EmailJS (with charts) |
| Scheduling | Local daily / weekly / monthly report trigger (no external cron) |
| Resilience | Offline local buffering & retry; incremental 1‑min flush; 5‑min bulk sync |
| Focus Sessions | Preset durations with Start/Pause/Resume/Stop and daily stats |
| Guard | Block websites & keywords, Quick Block current site, in‑app confirm modal |
| Blocked Page | Modern, theme‑aware page with Go Back / Start Focus / Open App |
| Solver | Track problem‑solving sessions with categories and history cards |
| Theming | 7 UI themes (light, dark, cyberpunk, minimal, ocean, sunset, forest) |
| Feedback | In‑extension authenticated feedback submission |
| Privacy | Only domains + aggregated session durations stored (no full URLs) |

## 🆕 What’s New

### v1.5.0

- Focus: refreshed Focus Sessions UI with presets and clear controls
- Guard: website + keyword blocking, Quick Block, in‑app confirm modal, and a modern theme‑aware blocked page
- Summary: top 3 sites highlighted with Gold/Silver/Bronze styling and normalized spacing
- Solver: redesigned session cards and quick start
- Theming: shared tokens across popup and blocked page
- Scheduler: “next scheduled” time shown in Settings
- Performance: popup.js memoized backend URL + event delegation for Guard lists
- Publish prep: cleaned manifest host permissions (removed localhost) and bumped version

### v2 Simplification

| Before | Now |
|--------|-----|
| Email verification codes | Direct email/password signup & login |
| Device verification endpoints | Automatic device tracking only (no code flow) |
| Separate device & utility scripts | Removed (cronJobs, dataCleanup, device-management) |
| Plain PDF summary | Enhanced PDF with charts + session table |
| UTC-based date (timezone drift) | Local date derivation for correct regional day boundaries |

## 📦 Repository Structure (Active Parts Only)

```
backend/
  index.js                # Express app + CORS + route mounting
  routes/
    auth.js               # /api/auth (signup, login, profile, settings)
    timeData.js           # /api/time-data (sync, reports, category patch)
    feedback.js           # /api/feedback (submit, list, admin ops)
    report.js             # /api/report (generate PDF)
  models/
    User.js               # Email/password user + device list + settings
    TimeData.js           # Per user/date/domain aggregated sessions
    Feedback.js           # Feedback messages
  README.md               # Backend-only docs

extension/
  manifest.json           # MV3 config (service worker, permissions, resources)
  background.js           # Tracking engine (sessions, sync, idle handling)
  popup.html              # Main UI (tabs: Analytics, Summary, Focus, Guard, Solver)
  popup.js                # UI logic (charts, categories, focus, guard, solver, reports)
  blocked.html            # Theme-aware blocked page
  blocked.js              # Blocked page logic (actions & timer)
  user_guide.html         # In-extension user guide
  auth.js                 # Token storage & auth helpers
  config.js               # Dynamic base URL + overrides
  report-scheduler.js     # Local schedule logic (daily/weekly/monthly)
  css/
    style.css, analytics.css, summary.css, focus.css, guard.css, stopwatch.css, blocked.css
  icon16.png, icon48.png, icon128.png
```

Removed legacy files (device-authentication.js, utils/cronJobs.js, utils/dataCleanup.js, etc.) for clarity.

## 🔐 Authentication Flow

1. User signs up or logs in: POST `/api/auth/signup` or `/api/auth/login` (email, password, device info).
2. Backend returns a JWT (30d). Token stored in both `localStorage` and `chrome.storage.local`.
3. Extension verifies token (POST `/api/auth/verify`) on popup load.
4. All protected calls carry `Authorization: Bearer <token>`.
5. Expired/invalid token → cleared → user prompted to login again. Unsynced local sessions will sync after re-auth.

## 🗄 Data Model (Essential Fields)

User:
```
email, password(hash), devices[{ deviceId, deviceName, browser, os, lastLogin }],
role, settings{ receiveReports, reportFrequency, categories(Map) }, lastActive
```
TimeData (unique per userEmail+date+domain):
```
userEmail, date(YYYY-MM-DD), domain, totalTime(ms), sessions[{startTime,endTime,duration}], category, timezone
```
Feedback:
```
userEmail, message, status, timestamp
```

## 🔌 Core API Endpoints

Auth:
- POST `/api/auth/signup`
- POST `/api/auth/login`
- POST `/api/auth/verify`
- GET  `/api/auth/profile`
- POST `/api/auth/update-settings`

Time Tracking:
- POST `/api/time-data/sync` (batch push sessions)
- GET  `/api/time-data/report/:userEmail?date=YYYY-MM-DD&endDate=...` (range list)
- PATCH `/api/time-data/category` (update a domain’s category for a date)

Reports:
- POST `/api/report/generate` (returns PDF binary) – includes charts + ranked domains + sessions.

Feedback:
- POST `/api/feedback/submit`
- GET  `/api/feedback/my`
- (Admin) GET `/api/feedback/all`, PATCH `/api/feedback/status/:id`

## 📄 Rich PDF Report Contents

| Section | Details |
|---------|---------|
| Header | Date, user, generated timestamp |
| Key Insights | Top site, main category share, unique domains, session medians/longest, focus ratio |
| Domain Table | Rank · Domain · Time · Category · Sessions · Avg Session · Longest Session · Active Span |
| Charts | Doughnut (category distribution) & Horizontal Bar (all site times) |

Rendered server‑side with `quickchart-js` + PDFKit.

## ✉️ Email Reports (EmailJS)

- Send one-off reports or schedule them to send automatically from the background
- Works with your own EmailJS credentials (privacy-first, no central mail server)
- Uses HTML with embedded charts (QuickChart); plain-text fallback included
- Template tip: render the message variable using triple braces to avoid escaping HTML, e.g. `{{{message}}}`

Setup in the extension Settings:
1. Select EmailJS as the service
2. Enter Service ID, Template ID, and Public Key
3. In your EmailJS template, add variables: `to_email`, `subject`, `message`, `message_text`
4. Click “Send Test Email” to verify

## 🧠 Tracking Logic (background.js)

Event-driven session handling:
1. Tab activated / URL changed → close previous tab session (duration = now - start).
2. Start new session for active domain.
3. Alarms: incremental flush (1 min), bulk sync (5 min), stale session cutoff (15 min).
4. Idle / lock → end all active sessions; resume on activity.
5. Offline failures store sessions locally until next successful sync.

Date key is derived in LOCAL TIME (fixes prior off-by-one for positive timezones like IST).

## 🛠 Development Setup

Backend:
```bash
git clone https://github.com/HarshDev625/TimeMachine.git
cd TimeMachine/backend
npm install
cp .env.example .env   # (create one if not present)
# .env needs at least:
# MONGODB_URI=mongodb://localhost:27017/timemachine
# JWT_SECRET=your-long-secret
npm run dev
```

Extension (unpacked):
1. Open Chrome → `chrome://extensions` → enable Developer Mode.
2. Load unpacked → select `TimeMachine/extension` folder.
3. Click the extension icon → login → start browsing.
4. Click the help ( ? ) button anytime to open the bundled in‑extension user guide.

## 🔎 Table of Contents

1. Features
2. Quick Start
3. Architecture Overview
4. Data Model
5. API Endpoints
6. Tracking & Sync Logic
7. Reports
8. Development Setup
9. Security Notes
10. Email Reports (EmailJS)
11. Contribution Guide
12. License

## ⚡ Quick Start (End User)

1. Install from Chrome Web Store (link above) or load unpacked from `extension/`.
2. Open the extension popup → Sign up (email + password) or Sign in.
3. Start browsing; time is tracked automatically per active domain.
4. Reassign categories in the list to tune productivity score.
5. Use Guard to block distracting sites/keywords (Quick Block for current site). 
6. Start Focus Sessions using presets; pause/resume/stop as needed.
7. Download a PDF report or enable scheduled reports in Settings.
7. Press the ? help button for updated docs (opens this README on GitHub).

## 🆘 In-Extension Help

An offline user guide (`extension/user_guide.html`) is bundled with the extension (open via the ? button) covering features, tabs, themes, scheduling, Guard, Focus, Solver, and troubleshooting. This README hosts developer documentation.

## ⚙ Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, Mongoose, PDFKit, quickchart-js, JSON Web Tokens |
| DB | MongoDB |
| Extension UI | Vanilla JS, Chart.js, HTML/CSS |
| Auth | JWT (Bearer), PBKDF2 (CryptoJS) password hashing |

## 🔒 Security Notes

- PBKDF2 (1000 iterations) with shared secret currently (improvable: per-user salt + higher iterations)
- JWT 30d expiry; no refresh token layer yet
- CORS restricted to extension origin(s) + localhost dev
- All time & feedback endpoints behind auth middleware

Planned improvements:
1. Per-user salt + higher PBKDF2 iterations
2. Short‑lived access + refresh token rotation
3. Rate limiting / anomaly detection
4. Optional encryption-at-rest for session payloads

## 🧪 Testing Ideas (Not Yet Included)

Add tests for:
- auth (signup/login/verify invalid creds)
- time-data sync (capping >12h sessions, daily aggregation)
- report generation (PDF produced, MIME, size threshold)

## 🤝 Contributing

PRs welcome. Keep changes focused and include a brief description (screenshots for UI changes help). Open an issue to discuss bigger ideas first.

## 📜 License

MIT. See [LICENSE](LICENSE).

## 🛡️ Security

If you find a security issue, please open a private issue with minimal details and request a secure contact.

## ❤️ Credits

- Chart.js & QuickChart for visualization
- PDFKit for report generation
- All contributors & users providing feedback

---
<p align="center"><a href="https://github.com/HarshDev625/TimeMachine/issues">Report Bug</a> • <a href="https://github.com/HarshDev625/TimeMachine/issues">Request Feature</a></p>
