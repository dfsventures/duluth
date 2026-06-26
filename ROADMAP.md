# Molly — Product Roadmap

_Last updated: 2026-06-26_

This document is the source of truth for existing platform features and planned enhancements. Update it as features ship or priorities change.

---

## Platform Overview

**Molly** is a portfolio management platform built for DFS Lab (startup accelerator/VC). It connects three user types:

- **Founders** — portfolio company operators who submit updates and track metrics
- **Admins** — DFS Lab team who review companies, approve accounts, and analyze the portfolio
- **Investors/LPs** — read-only access via shareable tokenized links (no account required)

**Stack:** Next.js 14 App Router · Prisma ORM · PostgreSQL (pgvector) · S3 · Resend · NextAuth v5

---

## Existing Features

### Authentication & Access
- **Public homepage** (`/`) — hero with headline, feature highlights, dual CTAs (Apply / Sign In), Admin Login button; authenticated users auto-redirect to their dashboard
- Email/password login + Google OAuth (restricted to @dfslab.net for admins)
- Founder signup → admin approval → set-password email flow
- Middleware-enforced role-based routing (Founder → `/dashboard`, Admin → `/admin`)
- **Transactional emails** — overhauled email templates (approval, rejection, new signup notification, update published) with shared HTML wrapper featuring teal accent bar, Molly header, branded CTA buttons, and consistent footer; proper error handling on Resend API responses
- Login page: founder-focused with Google OAuth demoted to DFS Lab team section
- Signup page: reframed as an application form with expectation-setting copy
- **Approved founders excluded from pending approvals** — only users awaiting password setup appear in the queue

### Founder Features
- **Dashboard** — company summary, update history, days-since-last-update, onboarding prompt
- **Setup Wizard** — 3-step onboarding: company profile → metric definitions → document upload
- **Company Profile** — name, description, website, sector, geography, funding stage, logo
- **Dynamic Sectors** — user-created sectors; admins can rename/delete
- **Metrics** — define custom metrics with units; record values over time; history table; line chart per metric
- **Updates** — rich text editor, period + title, per-update metric values, file attachments
  - Save as Draft or Publish with inline confirmation
  - Email sent to team@dfslab.net on publish (includes metrics table + full body)
  - Edit mode for drafts; view mode with HTML rendering for all
  - Comments (shared with admins) — with email notifications: admins are emailed when a founder comments, founders are emailed when an admin comments
  - PDF download
- **Investor Links** — tokenized read-only links with period date range and expiry (7d/30d/90d/1yr/never)
  - Email gate on first visit; silent re-tracking via localStorage
  - View log with email + timestamp
  - Revoke links
- **Team Management** (`/team`) — OWNER founders can invite teammates by email (MEMBER/VIEWER roles)
  - New users get an account automatically (APPROVED + set-password link, 48hr expiry); no admin review queue
  - Existing users get a notification email and are added immediately
  - Handles edge cases: re-invites rejected users, regenerates expired tokens, detects duplicates
  - Role change (Editor ↔ Viewer) and remove member in-page
  - Admins can also add members from the company detail page (same invite flow)

### Admin Features
- **Dashboard** — KPI cards (total companies, pending approvals, updates this month, "Behind on updates" companies); 6-month published updates bar chart; sector breakdown; collapsible overdue companies table with days-since color coding
  - **Smart "needing attention" detection** — cadence-based logic: grace period for companies < 30 days old; flagged if 30+ days old with < 3 published updates; for 3+ updates, flagged only if time since last update exceeds average gap from last 5 updates
  - **Unapproved companies filtered** — companies from pending (not yet approved) founders no longer appear in admin list or dashboard stats
- **Approvals** — approve/reject signups with email notifications
- **Company Management** — grid view, search, add company, bulk CSV import
- **Company Detail** — full editable profile; view company updates; manage members; metric charts + history; document management with type tagging, search, filtering, and archive
- **Settings** (`/admin/settings`) — email trigger overview, FROM address display, RESEND_API_KEY configuration check, "Send Test Email" button with live success/error feedback
- **Update Reminders** — Vercel Cron job (daily, 9am UTC) sends reminder emails to founders when updates are overdue
  - Per-company frequency: weekly / bi-weekly / monthly / quarterly / disabled
  - Cooldown via `lastReminderSentAt` prevents repeat emails within the configured window
  - Emails all OWNER + MEMBER founders on the company; secured by `CRON_SECRET`
- **Investor Links** — multi-company link creation; full view log; revoke
- **AI Chat** — conversational AI over portfolio data (updates + documents); markdown + source attribution
- **Company member management** — add members by email from company detail page; new users created automatically via invite flow; membership role dropdown (Owner/Editor/Viewer) per founder member

### Document Management
- Upload documents linked to a company or specific update
- Document types: Pitch Deck, Financials, Legal, Product / Demo, Other
- Filter by type, search by name, toggle archived documents
- Archive / unarchive without permanent deletion
- Internal-only flag for admin-visible documents
- Document type badge shown on update detail attachments

---

## Roadmap

### High Priority

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Comment Threading** | Threaded replies, @mentions, resolution status. (Basic comment notifications already shipped.) | Turns one-way updates into a coaching feedback loop. |
| **Update Templates** | Admin-created templates with pre-filled sections and metric guidance. | Reduces founder cognitive load; improves update consistency and completeness. |

### Medium Priority

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Metrics Benchmarking** | Anonymized peer comparison (e.g., "Your MRR growth is above portfolio median"). | Motivates founders; surfaces outliers for admin attention. |
| **Scheduled Publishing** | Founders write updates ahead of time and schedule publish for a future date/time. | Removes last-minute quarter-end scramble. |
| **Bulk LP Report Link** | Admin creates a single link covering the full portfolio for a period. | Current multi-company links require manual selection. Essential for LP meetings. |
| **Mobile-Optimized Update Flow** | Simplified metric entry and editor optimized for small screens. | Many founders are mobile-first. Improves update frequency. |

### Nice to Have

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Portfolio Export / LP Report PDF** | Multi-company polished PDF for LP reporting. Goes beyond the single-update PDF today. | Streamlines DFS Lab's investor reporting workflow. |
| **Proactive AI Anomaly Alerts** | Auto-surface issues: "MRR dropped 20%", "no metrics in 3 updates". | AI chat is reactive today. Proactive alerts catch problems without admin intervention. |
| **Custom Company Tags** | Admin-created tags (e.g., B2B SaaS, female-led, export-ready) for portfolio segmentation. | Enables thematic analysis without building new dashboards. |
| **Update Versioning / Audit Trail** | Track edits to published updates. Who published/edited and when. | Compliance and data integrity as platform matures. |
| **Investor Accounts (Optional)** | Optional upgrade from token-only to persistent investor accounts. | Enables re-access, saved preferences, and engagement analytics. |
| **Slack / Webhook Integrations** | Slack notifications for overdue updates, new approvals, published updates. | Connects Molly into existing DFS Lab team workflows. |
| **White-Label Branding** | Custom domain, logo, and email templates. | Strengthens DFS Lab brand in founder/investor interactions. |

---

## Notes

- Shipped features should be moved from the roadmap into the "Existing Features" section above.
- Priority tiers should be revisited quarterly or after each major release.
