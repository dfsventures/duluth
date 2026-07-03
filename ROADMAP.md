# Molly — Product Roadmap

_Last updated: 2026-07-03_

This document is the source of truth for existing platform features and planned enhancements. Update it as features ship or priorities change.

---

## Platform Overview

**Molly** is a portfolio management platform originally built by DFS Lab (startup accelerator/VC) to run their own portfolio, and open-sourced for other investment teams to fork. It connects three user types:

- **Founders** — portfolio company operators who submit updates and track metrics
- **Admins** — the investment team's staff who review companies, approve accounts, and analyze the portfolio
- **Investors/LPs** — read-only access via shareable tokenized links (no account required)

**Stack:** Next.js 14 App Router · Prisma ORM · PostgreSQL · S3 · Resend · NextAuth v5 · Anthropic Claude (digest drafting)

Molly is open source (MIT) with the explicit goal that other investment teams can fork and run their own instance — see the Fork Configuration item in the roadmap below.

---

## Existing Features

### Authentication & Access
- **Public homepage** (`/`) — founder-focused hero ("One place to keep your investors in the loop.") with a single primary CTA (Apply for Access); Founder Login and Investor Login are small nav-bar links (Investor Login is the same Google OAuth flow used by admin staff, just relabeled — there is no separate investor account system); a vertically-stacked `01./02./03.` "how it works" section replaces the old icon grid; authenticated users auto-redirect to their dashboard
- Email/password login + Google OAuth (admins restricted to a single email domain, currently `@dfs.vc`, hardcoded in `src/lib/auth.ts` — see Fork Configuration below), surfaced publicly as "Investor Login"
- Founder signup → admin approval → set-password email flow
- Middleware-enforced role-based routing (Founder → `/dashboard`, Admin → `/admin`)
- **Transactional emails** — all 10 templates (approval, rejection, new signup, update published, update reminder, team invite, member added, weekly digest, comment notification, test email) rebuilt around the DFS brand system: Paper/Bone/Obsidian/Sky palette, Space Grotesk / IBM Plex Sans / JetBrains Mono, real DFS logo in the header, no accent bar; proper error handling on Resend API responses
- Login page: founder-focused with Google OAuth demoted to an admin-staff login section
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
  - Email sent to the admin team (`TEAM_EMAIL` env var) on publish (includes metrics table + full body)
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
  - ⚠️ **Likely broken as of 2026-07-03**: the route only exports `POST`, but Vercel Cron invokes with GET — scheduled runs 405 and reminders have probably never sent. Fix queued in the P0 bug-fix batch below (WS0 in `docs/IMPLEMENTATION_PLAN.md`); also requires a valid `RESEND_API_KEY`.
- **Investor Links** — multi-company link creation; full view log; revoke
- **Weekly Digest** (`/admin/digest`) — compose the internal team digest (6 fixed sections + todo list with assignees); AI-assisted drafting via Anthropic Claude from pasted meeting notes or Granola transcript links; sent by email to recipients configured in Settings
- **Company Notes** — admin-only internal notes on each company, with revision history
- **Service Provider Directory** (`/providers`, `/admin/providers`) — founders submit and endorse service providers; admins vet submissions (pending/vetted/rejected) and manage categories
- **Company member management** — add members by email from company detail page; new users created automatically via invite flow; membership role dropdown (Owner/Editor/Viewer) per founder member

> **Note on AI Chat:** the OpenAI-based RAG chatbot (and pgvector embeddings) was deliberately removed, pending a cleaner re-implementation. Re-introduction is planned — see P3 below. The `openai` dependency in package.json is a leftover and can be dropped.

### Document Management
- Upload documents linked to a company or specific update
- Document types: Pitch Deck, Financials, Legal, Product / Demo, Other
- Filter by type, search by name, toggle archived documents
- Archive / unarchive without permanent deletion
- Internal-only flag for admin-visible documents
- Document type badge shown on update detail attachments

### Design & Branding
- **DFS brand system applied app-wide** — Paper/Bone/Obsidian/Sky palette, Space Grotesk / IBM Plex Sans / JetBrains Mono typography, flat/structured corners (no pill/rounded shapes) instead of the previous generic SaaS theme
- **Dark mode removed** — light theme only; the old teal-accented dark theme and its toggle were fully deleted, not just hidden
- **`_Molly` wordmark** — the placeholder auto-generated logo image is gone; a reusable text mark (mono font, brand-colored underscore) is used across the sidebar, nav bars, and auth pages
- Real DFS logo (pulled from DFS Lab's brand assets, not a placeholder) used in transactional email headers
- Status colors (badges, alerts) remapped from generic Tailwind red/green/amber to the brand's own Laterite/Acacia/Ochre

---

## Roadmap

Priorities run P0 (do first) through P3 (later). P0 exists because the platform holds confidential portfolio data and serves LPs — a February middleware auth bypass that survived until July, zero automated tests, and open security-audit items make platform integrity the highest-leverage work before new features.

> **Implementation detail:** step-by-step, junior-executable plans for all P0 and P1 items live in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) (from the 2026-07-03 roadmap review). Workstream numbers (WS0–WS5) below refer to that document.

### P0 — Platform Integrity

| Item | Description | Why now |
|------|-------------|---------|
| **Bug-fix & hygiene batch (WS0)** | Fix the reminder cron GET/POST mismatch (see Update Reminders note above); repair the never-configured ESLint setup (no config file; eslint 9 / config-next 16 mismatch with Next 14); remove six dead dependencies (`openai`, `ai`, `uuid`, `@types/uuid`, `diff`, `@types/diff`); guard legacy share links against null periods; harden the dev bootstrap route behind an explicit env flag. | Found in the 2026-07-03 review. The cron bug silently disables a shipped feature; lint has never actually run. |
| **Security hardening batch (WS1)** | Rate limiting on `/api/auth/signup` and `/api/auth/set-password` (Postgres-backed — no new services); validate MIME type server-side on document upload; validate email format on the share-link gate; audit log for admin actions. | All four are open items from the security audit. Cheap individually; together they close the known attack surface. |
| **Auth/authz test suite (WS2)** | Minimal automated tests covering middleware routing, `requireAuth` / `requireAdmin` / `requireCompanyAccess`, and share-token access. Vitest + free GitHub Actions CI; deploys are deliberately not gated on tests (preserves push-to-deploy). | The middleware bypass shipped in February and was found by accident in July. There are currently zero tests; CI should catch the next one. |

### P1 — Close the Core Loop (this quarter)

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Update Templates** | Admin-created templates with pre-filled sections and metric guidance. | Reduces founder cognitive load; improves update consistency and completeness. |
| **Investor entry point** | "Investor Login" on the homepage currently runs admin Google OAuth — it fails for actual investors. **Decision (2026-07-03):** remove the button and replace it with a public `/investors` explainer page describing link-based access (WS4); persistent investor accounts remain P3. | A public CTA that errors for its named audience erodes trust with exactly the audience LPs represent. |
| **Share-link engagement for founders** | Surface `ShareableLinkView` data (already collected) as a simple "your investor viewed this" signal on the founder dashboard. | The reward loop that keeps founders publishing. Data already exists; this is UI. |

### P2 — Leverage (next quarter)

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Bulk LP Report Link** | Admin creates a single link covering the full portfolio for a period. Before building: resolve the open metric-scoping question (finding F7 in `docs/IMPLEMENTATION_PLAN.md` — pinned-update links currently show investors the latest all-time value of every metric, which bulk links would inherit). | Current multi-company links require manual selection. Essential for LP meetings. |
| **Scheduled Publishing** | Founders write updates ahead of time and schedule publish for a future date/time. | Removes last-minute quarter-end scramble. |
| **Rule-based metric alerts** | Auto-surface issues with plain arithmetic — "MRR dropped 20%", "no metrics in last 3 updates". No AI dependency. | Proactive problem detection without waiting on the AI re-introduction. AI-assisted versions fold into P3. |
| **Comment Threading** | Threaded replies, @mentions, resolution status. (Basic comment notifications already shipped.) | Turns one-way updates into a coaching feedback loop. Demoted from top priority: templates improve update quality more per unit of effort. |
| **Fork Configuration** | Move the hardcoded values that assume a DFS Lab deployment into env vars: `ADMIN_EMAIL_DOMAIN` (currently `@dfs.vc` in `src/lib/auth.ts`, duplicated in `login/page.tsx` copy), `ORG_NAME` (currently "DFS Lab" in `layout.tsx` page title), `SUPPORT_EMAIL` (currently `support@dfs.vc` in `email.ts` rejection template), and `LOGO_PATH` (currently DFS's own logo file, hardcoded in `email.ts`). Theming (CSS variables, `LogoMark`, email color tokens) is already centralized in source but still requires editing files directly — no runtime config exists yet. | A fork can't change its admin domain, support address, org name, or logo without editing source today. This is the actual blocker for other investment teams adopting Molly, not just re-theming. |

### P3 — Later / Opportunistic

| Feature | Description | Benefits |
|---------|-------------|----------|
| **AI re-introduction** | Bring back portfolio-wide AI chat and add AI-assisted insights/alerts, with a cleaner implementation than the removed OpenAI RAG version. Digest drafting (Claude) already ships and can anchor the pattern. | Deliberately paused, not abandoned. Waits on a clean architecture decision. |
| **Metrics Benchmarking** | Anonymized peer comparison (e.g., "Your MRR growth is above portfolio median"). | Motivates founders; needs more portfolio data density to be meaningful. |
| **Portfolio Export / LP Report PDF** | Multi-company polished PDF for LP reporting. Goes beyond the single-update PDF today. | Streamlines DFS Lab's investor reporting workflow. |
| **Custom Company Tags** | Admin-created tags (e.g., B2B SaaS, female-led, export-ready) for portfolio segmentation. | Enables thematic analysis without building new dashboards. |
| **Update Versioning / Audit Trail** | Track edits to published updates. Who published/edited and when. | Compliance and data integrity as platform matures. Pairs with the P0 admin audit log. |
| **Investor Accounts (Optional)** | Optional upgrade from token-only to persistent investor accounts. | Enables re-access, saved preferences, and engagement analytics. Resolves the P1 investor entry point permanently. |
| **Slack / Webhook Integrations** | Slack notifications for overdue updates, new approvals, published updates. | Connects Molly into existing DFS Lab team workflows. |
| **Mobile-Optimized Update Flow** | Simplified metric entry and editor optimized for small screens. | Many founders are mobile-first. Improves update frequency. |

---

## Notes

- Shipped features should be moved from the roadmap into the "Existing Features" section above.
- Priority tiers should be revisited quarterly or after each major release.
