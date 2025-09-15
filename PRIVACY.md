# TimeMachine Privacy Policy

_Last updated: 2025-09-15_

TimeMachine helps you focus by tracking active sites, blocking distracting content, and summarizing productivity. We designed it to minimize the data we store and to keep you in control.

## 1. Data We Collect

| Category | What | Where Stored | Retention |
|----------|------|--------------|-----------|
| Account | Email (for authentication) | Backend database | Until account deletion |
| Auth | Hashed password (never plain text) | Backend database | Until account deletion |
| Focus / Problem Sessions | Session start/end, labels, duration | Local first, then synced | Until deleted by user |
| Time Tracking | URL hostname + accumulated seconds | Local first, then synced | Rolling history (per user settings/server limits) |
| Block Lists | Blocked domains, keywords | Synced (user-scoped) | Until removed by user |
| Feedback | Text + optional email | Backend (feedback collection) | Until actioned / periodic pruning |
| Reports | Generated PDF/chart artifacts | Transient (sent to your email) | Not persistently stored after send |

We DO NOT collect: full page content, keystrokes, form entries, downloads, cookies, or precise geolocation.

## 2. How Data Is Processed

1. The extension records foreground tab hostname and time spent at short intervals.
2. Block checks run locally first (url + keywords). Optional in‑page keyword scanning reads visible text only; it never transmits page bodies to the server—only the fact a keyword matched.
3. Data buffers locally and syncs periodically to the backend API over HTTPS.
4. Reports (email summaries) are generated using your already synced, structured data—not raw browsing history.

## 3. Optional Content Keyword Scanning

You can disable in‑page keyword scanning in the Guard tab. When disabled:
- Only URL + domain name matching is used.
- No page text is read or analyzed.

## 4. Cookies & Local Storage

- Auth tokens are stored using extension storage (and/or localStorage) for session continuity.
- No third‑party tracking cookies are set by the extension.

## 5. Data Sharing

We do not sell or share your data with advertisers. Data may be processed by infrastructure/service providers strictly to operate core features (e.g., email delivery service for reports/feedback confirmations).

## 6. Security Measures

- Passwords hashed with a modern algorithm (e.g., bcrypt or argon2 depending on backend implementation).
- All API calls use HTTPS.
- Principle of minimal scope: only necessary fields stored.

## 7. Your Controls

| Action | How |
|--------|-----|
| View time & sessions | Extension popup & analytics tab |
| Delete a blocked site/keyword | Guard tab remove button |
| Delete sessions | Session management UI (focus/problem) |
| Disable keyword scanning | Toggle in Guard tab |
| Sign out | Auth section (clears token locally) |
| Account deletion (data purge) | Contact support (see below) |

## 8. Data Deletion / Export

Full self‑service export & deletion endpoints are planned. For now, email support to request manual deletion. Provide the email you used to register.

## 9. Children’s Privacy

Not intended for users under 13. If a minor’s data was collected, contact us for removal.

## 10. Changes to This Policy

We may update this policy. Material changes will be noted in the changelog and README with an updated date above.

## 11. Contact

For privacy inquiries or deletion requests:
- Email: support@example.com (replace with project email)
- Issue Tracker: GitHub Issues

---
_Transparency first: if you see something missing that you need for compliance (school / enterprise usage), open an issue so we can prioritize it._
