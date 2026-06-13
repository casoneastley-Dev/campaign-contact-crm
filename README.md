# Campaign Contact CRM

A mobile-responsive browser-based contact manager for a campaign. It is intentionally lightweight: no native app, no external libraries, and no server required for the prototype.

## What it does

- Add, edit, search, and delete campaign contacts
- Track contact channels: email, phone, website, WhatsApp, Telegram
- Store address and organization details
- Add campaign attributes such as donor, staff member, political networking, business networking, endorser, potential endorsement, volunteer, media, consultant, vendor, and do-not-contact
- Track donation status and endorsement status
- Campaign dashboard: contacts, total raised, donors, endorsements, volunteers, follow-ups due
- Log activity per contact: calls, texts, emails, meetings, events, and donations with amounts
- Donation ledger with per-contact totals and an "at limit" warning against the FEC per-election contribution limit
- Follow-up dates with overdue/due-today tracking, plus priority levels for call-time ordering
- Smart filters (overdue follow-ups, donation/endorsement status) and sorts (priority, follow-up date, top donors)
- Duplicate warning when saving a contact whose email or phone already exists
- Export contacts to CSV (includes totals and activity columns) or JSON
- Import a JSON backup (v1 backups upgrade automatically)
- Works on mobile browsers and can be installed as a Progressive Web App on many phones

Sample data: import `sample-contacts.json` to explore all features with 11 fictional contacts.

## How to run locally

Open `index.html` in a browser.

For the installable/offline PWA behavior, serve the folder over a local web server:

```bash
python3 -m http.server 8000
```

On Windows without Python installed, use the included PowerShell server instead:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8000
```

Then open:

```text
http://localhost:8000
```

## Development

The app itself has no dependencies or build step. `lib.js` holds the pure domain
logic (validation, CSV generation, link builders) and is shared between the
browser and the Node test suite.

```bash
npm install   # dev tooling only (ESLint)
npm test      # unit tests via node:test
npm run lint  # ESLint
```

## Important production notes

This prototype stores data in the browser's `localStorage` on the device. That is fine for demos and local testing, but it is not enough for a real campaign contact database.

Before using this in production, add:

- Secure login with role-based access control
- Encrypted server-side database storage
- Audit logs for edits and exports
- Permission controls for donor, staff, and sensitive political relationship data
- Backups and disaster recovery
- Data-retention and deletion policy
- Compliance review for campaign finance, privacy, texting/calling rules, and election-law requirements
- Security review for phishing, device loss, and unauthorized exports

Recommended production stack:

- Frontend: React, Vue, Svelte, or plain HTML/JS if the feature set stays small
- Backend: Django, Rails, Laravel, Node/Express, or FastAPI
- Database: PostgreSQL
- Auth: managed provider such as Auth0, Clerk, Firebase Auth, Supabase Auth, or a campaign-controlled SSO setup
- Hosting: Render, Fly.io, Railway, Heroku, Vercel + backend, AWS, GCP, or Azure

## Compliance and ethical guardrails

Because this stores campaign relationship data, treat it as sensitive. Do not use it to create deceptive impersonation, fake grassroots activity, unauthorized messaging, or hidden profiling. Limit access to staff who need it, and keep exports controlled.
