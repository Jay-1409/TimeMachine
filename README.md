# TimeMachine

<div align="center">

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen?logo=googlechrome)](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/HarshDev625/TimeMachine)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/HarshDev625/TimeMachine/pulls)

</div>

<p align="center">
  <img src="extension/icon128.png" width="128" height="128" alt="TimeMachine Logo">
</p>

<h3 align="center">Minimal time tracking & productivity insights (no email codes, just login and go)</h3>

TimeMachine is a lightweight Chrome extension + Node.js backend that automatically tracks active website time, groups it into categories, and generates rich PDF reports (with charts) you can download or schedule. The system was recently simplified: email verification / device code flows were removed—only email + password authentication remains.

## ✨ Current Features

- � Simple email + password authentication (30‑day JWT)
- 🕒 Automatic per‑domain active time tracking (background script)
- 🗂 Category tagging (Work / Social / Entertainment / Professional / Other)
- � Productivity dashboard: daily / weekly / monthly
- 🧮 Productivity score (work + professional + partial other)
- 🎨 7 UI themes + compact, responsive popup
- ⏱ Basic Pomodoro (focus/break) timer
- 📄 Rich PDF reports (ranked domains, session summaries, charts via QuickChart)
- 🔁 Offline resilience (local buffering + periodic sync)
- � Scheduled local report generation trigger (optionally email via user-supplied service in future)
- 💬 Authenticated feedback submission

## 🆕 What Changed (v2 Simplification)

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
    auth.js               # /api/auth (signup, login, verify, profile, settings)
    timeData.js           # /api/time-data (sync, report listing, category patch)
    feedback.js           # /api/feedback (submit, list, admin ops)
    report.js             # /api/report (generate PDF)
  models/
    User.js               # Email/password user + device list + settings
    TimeData.js           # Per user/date/domain aggregated sessions
    Feedback.js           # Feedback messages
  README.md               # Backend-only docs

extension/
  background.js           # Tracking engine (sessions, sync, alarms, idle handling)
  popup.js                # UI (charts, category editing, auth, feedback, reports)
  auth.js                 # Token storage & login/signup modal logic
  config.js               # Dynamic base URL + overrides
  report-scheduler.js     # Local schedule logic (daily/weekly/monthly)
  styles / *.css          # Theming & layout
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

- Header (date, user, generated timestamp)
- Key insights (top site, main category, unique domains)
- Ranked table (domains with time, category, sessions summary)
- Doughnut chart (category distribution)
- Horizontal bar chart (all sites time)

Charts rendered server-side using `quickchart-js` + PDFKit.

## 🧠 Tracking Logic (background.js)

Event-driven session handling:
1. Tab activated / URL changed → close previous tab session (duration = now - start).
2. Start new session for active domain.
3. Periodic alarms: flush unsynced local data every 5 min; end stale sessions every 15 min.
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
3. Reload after changes.

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
1. Increase PBKDF2 iterations & add per-user salt field
2. Optional shorter access token + refresh
3. Rate limiting & basic anomaly detection

## 🧪 Testing Ideas (Not Yet Included)

Add tests for:
- auth (signup/login/verify invalid creds)
- time-data sync (capping >12h sessions, daily aggregation)
- report generation (PDF produced, MIME, size threshold)

## 🤝 Contributing

PRs welcome—focus areas:
1. Firefox port (WebExtensions parity)
2. Better productivity scoring algorithm
3. Aggregated weekly/monthly PDF reports
4. Local ML suggestions (break reminders)
5. Test suite / GitHub Actions

Fork → branch → PR. Keep changes focused.

## 📜 License

MIT. See [LICENSE](LICENSE).

## ❤️ Credits

- Chart.js & QuickChart for visualization
- PDFKit for report generation
- All contributors & users providing feedback

---
<p align="center"><a href="https://github.com/HarshDev625/TimeMachine/issues">Report Bug</a> • <a href="https://github.com/HarshDev625/TimeMachine/issues">Request Feature</a></p>
