# Decision needed: stay device-local, or add a small shared backend?

*For David — the one architectural fork left. Everything else on your list is built.*

## Where we are

The app currently runs 100% in the browser. Contacts, connections, AI briefs, the
protocol/knowledge docs, and the Anthropic API key all live in `localStorage` on
each person's device. Claude is called directly from the browser with that key.

This was the right call to ship fast (no hosting, no accounts, works on GitHub
Pages), but it has three structural limits that only a backend fixes:

| Limit | Consequence today |
|---|---|
| **No team sharing** | Your contacts, Michael's, and Cason's are three separate databases. Sync is manual JSON export/import. A brief generated on one phone doesn't exist on another. |
| **Data safety** | Clearing browser data deletes the campaign's contact list. Backups are manual exports. |
| **Per-device API key** | Everyone pastes a key into their own device. No usage visibility, no central revocation. |

## Option A — stay device-local (status quo)

- **Cost:** $0 hosting, forever.
- **Good for:** prototype/demo phase, single primary user, zero ops.
- **Mitigations available:** automatic backup-download reminders; a "share
  bundle" export that packages contacts + briefs for another device.

## Option B — thin serverless backend (recommended once >1 person uses it for real)

A small worker (Cloudflare Workers/Pages or Vercel) + a hosted database:

- **Shared contact DB** — everyone sees the same contacts, connections, briefs.
- **One API key held server-side** — never in any browser; central spend visibility.
- **Real backups** — data survives any device.
- **Team logins** — simple invite-based auth (Clerk/Supabase Auth), which also
  starts the compliance story (access control, audit trail) from the README.
- Also unlocks later: scheduled/overnight research runs, shared "memory file"
  edits, webhook-style alerts (e.g. "brief this new contact automatically").

**Cost estimate:** free tiers cover a campaign's scale — Cloudflare Workers +
D1/KV or Supabase free tier ≈ **$0–5/month**. Claude API usage is unchanged
(same calls, made server-side).

**Effort estimate:** roughly a focused day for the minimal version: auth,
contacts CRUD, brief storage, and proxying the two AI endpoints. The frontend
already isolates all AI calls in one module (`ai.js`), so it's a swap of the
transport layer, not a rewrite.

## Recommendation

Prototype/demo with David & Michael reviewing → **A is fine right now.**
The moment two people are entering real contacts they both need to see →
**build B.** The codebase was structured so B is additive, not a rebuild.

*Prepared June 2026.*
