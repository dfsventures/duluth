# Molly — Product Roadmap

_Last updated: 2026-07-07 (P0 + P1 shipped; P2 batch shipped — WS9, WS10, WS11, WS12; mobile-width layout hardening shipped — WS14, WS15)_

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
- **Public homepage** (`/`) — founder-focused hero ("One place to keep your investors in the loop.") with a single primary CTA (Apply for Access); nav bar collapses to a single "Log in" link → `/login` (which already serves both founders and admins); footer carries a muted "Investor access" link → `/investors` (shipped 2026-07-03 — investors never log in, so an audience-split nav overpromised); a vertically-stacked `01./02./03.` "how it works" section replaces the old icon grid; authenticated users auto-redirect to their dashboard
- Email/password login + Google OAuth (admins restricted to a single email domain, configurable via `NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN`, defaults to `dfs.vc` — see Fork Configuration below)
- **Investor Access** (`/investors`) — public page explaining that investor access is link-based (no account needed) with a support contact (`SUPPORT_EMAIL`); replaces the old "Investor Login" button, which silently ran admin Google OAuth and errored for real investors (shipped 2026-07-03)
- Founder signup → admin approval → set-password email flow, rate-limited (10/hour/IP, Postgres-backed) against `/api/auth/signup` and `/api/auth/set-password`
- Middleware-enforced role-based routing (Founder → `/dashboard`, Admin → `/admin`); routing decision logic lives in `src/lib/route-access.ts` as a pure, unit-tested function with regression coverage for the Feb–Jul auth bypass
- **Transactional emails** — all 10 templates (approval, rejection, new signup, update published, update reminder, team invite, member added, weekly digest, comment notification, test email) rebuilt around the DFS brand system: Paper/Bone/Obsidian/Sky palette, Space Grotesk / IBM Plex Sans / JetBrains Mono, real DFS logo in the header, no accent bar; proper error handling on Resend API responses
- Login page: founder-focused with Google OAuth demoted to an admin-staff login section
- Signup page: reframed as an application form with expectation-setting copy
- **Fork Configuration** (shipped 2026-07-06, WS9) — `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN`, `EMAIL_LOGO_PATH`, and the existing `SUPPORT_EMAIL` now cover every UI/email spot that assumed a DFS Lab deployment (~25 occurrences across 12 files, per F14's full sweep) — a fork can rename itself and change its admin domain/logo/support contact with env vars only, no source edits. Unconfigured, output is byte-identical to before. Theming (CSS tokens, `LogoMark`, brand assets under `public/`) remains a deliberate source edit — see README's Fork Configuration section.
- **Approved founders excluded from pending approvals** — only users awaiting password setup appear in the queue

### Founder Features
- **Dashboard** — company summary, update history, days-since-last-update, onboarding prompt, **investor engagement card** (total investor views + last-viewed date) and a "Recent Investor Activity" list surfacing who viewed via investor links, with an empty state linking to Investor Links (shipped 2026-07-03; data source: `ShareableLinkView`, already collected, this is UI)
- **Setup Wizard** — 3-step onboarding: company profile → metric definitions → document upload
- **Company Profile** — name, description, website, sector, geography, funding stage, logo
- **Dynamic Sectors** — user-created sectors; admins can rename/delete
- **Metrics** — define custom metrics with units; record values over time; history table; line chart per metric
- **Updates** — rich text editor, period + title, per-update metric values, file attachments
  - Save as Draft or Publish with inline confirmation
  - **Medium-style draft composer** (shipped 2026-07-08, WS20) — `/updates/new`, the draft-edit mode on `/updates/[id]`, and the admin per-company composer were rebuilt around a borderless display-type title, a chromeless writing surface, and a slim persistent (not selection-bubble) formatting toolbar that dims until focused — the AppShell sidebar stays (Part 8, Q17 = A; this is a content-area restyle, not a full-bleed takeover). Metrics/attachments moved into a collapsed "Details" disclosure one click away. Debounced autosave (~30s, Q16 = B) runs for existing drafts only — suppressed while a manual save/publish/schedule is in flight — with an ambient "Saved · time" indicator; the new-update page still requires an explicit first save (no draft is ever auto-created). Publish is muted/disabled until period + title are filled. Every prior capability survives: template prefill, per-period metrics, attachments, publish-confirm, schedule-for-later, draft delete. `RichEditor` gained an additive `variant="chromeless"` prop (default `"boxed"`) — the templates editor and company-notes editor pass nothing and render byte-identically.
  - **Scheduled Publishing** (shipped 2026-07-06, WS11) — an optional "Schedule for later" disclosure on a draft (collapsed by default) picks a future date; a daily cron (`/api/cron/scheduled-publish`, 9am UTC) publishes it that morning via the same shared publish path as manual publishing (team email included, best-effort). Date-only granularity by design (works on any Vercel plan, no Pro-only per-minute cron needed). Drafts show a "Scheduled · {date}" badge with a "Cancel schedule" control; editing a scheduled draft keeps the schedule, manually publishing early clears it. `sentAt` is always the actual publish instant, never the scheduled date, so the 3-day edit window and cadence detection are unaffected. The two existing publish paths (create-with-SENT, and PATCH-to-SENT) and the new cron now share one `publishUpdate()` helper (`src/lib/publish-update.ts`); the dead `POST /api/updates/[id]/send` endpoint (F13 — unreachable from any client, and it skipped the team email) was deleted rather than left as a drift trap.
  - Email sent to the admin team (`TEAM_EMAIL` env var) on publish (includes metrics table + full body)
  - Edit mode for drafts; view mode with HTML rendering for all
  - **Start from a template** — optional dropdown (only shown if admin-created templates exist) prefills the update body; asks for confirmation before overwriting existing draft text (shipped 2026-07-03, see Update Templates below)
  - Comments (shared with admins) — with email notifications: admins are emailed when a founder comments, founders are emailed when an admin comments
  - PDF download
- **Investor Links** — tokenized read-only links with period date range and expiry (7d/30d/90d/1yr/never)
  - Email gate on first visit (server-validated email format as of 2026-07-03); silent re-tracking via localStorage
  - View log with email + timestamp
  - Revoke links
  - **Fixed 2026-07-06 (F15, found live during WS12 verification)**: the `/share/[token]` page itself was public, but the client-side data fetch it makes to `/api/share/[token]` (and the `/view` email-gate endpoint) was not on the middleware's public-path list — so every investor (who has no account by design) had that fetch 307-redirected to `/login`, and the share page never actually rendered any data. This had likely been broken since the route-access.ts extraction; no links existed in production to have surfaced it via a bug report. Fixed the same way as the prior `/api/cron` and `/brand` gaps (added `/api/share` to `PUBLIC_PREFIXES` in `src/lib/route-access.ts`, a token-gated route needs no session-based gate); regression test added.
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
  - **Fixed 2026-07-03**: two stacked bugs meant this had likely never fired since it shipped — (1) the route only exported `POST` but Vercel Cron invokes with GET, and (2) even after fixing that, auth middleware redirected every cron invocation to `/login` before the route's own `CRON_SECRET` check ever ran, since cron requests carry no session. `/api/cron` is now on the middleware's public-path list (the route's `CRON_SECRET` check remains the real authorization gate); both fixes verified live against production.
  - **Fixed 2026-07-06 (F12, WS10.1)**: the cooldown now only advances when at least one reminder email actually sends for a company — previously a broken Resend key still burned the full cooldown window on every "attempt". Self-healing: once `RESEND_API_KEY` is rotated, the next run retries every still-overdue company instead of waiting out an already-burned window.
- **Metric Alerts** (admin dashboard, shipped 2026-07-06, WS10) — daily cron (`/api/cron/alerts`, 9:30am UTC) evaluates two plain-arithmetic rules per company: a metric changed ≥20% (either direction, env-tunable via `METRIC_ALERT_CHANGE_PCT`) between its two most recent recorded dates, or the last 3 published updates all shipped with zero metrics attached. Fired alerts dedupe atomically on a unique key (no repeat alerts for unchanged data) and surface in a dismissible "Metric Alerts" section on `/admin` (only rendered when alerts exist); dismissing writes an `ALERT_DISMISSED` audit row. Admin-only, no email in v1 — dashboard-only by design so it isn't gated on the Resend outage.
- **Update Templates** (`/admin/templates`) — admin-created reusable skeletons (rich-text body + name/description) founders can start an update from; soft-delete via archive/unarchive; audit-logged (shipped 2026-07-03)
- **Investor Links** — multi-company link creation; full view log; revoke
  - **Bulk LP Report Link** (shipped 2026-07-06, WS12) — "Bulk select by period" in the admin builder: pick a From/To date range and one-click-select every published update in range across the whole portfolio, with a running "N updates across M companies" summary; an optional "Limit the metric summary to this period" checkbox (checked by default after a bulk select) adds an additive `metricScope` field (`ALL_TIME` default / `PERIOD`) on `ShareableLink` — `PERIOD` scopes the share page's per-company metric summary to the link's date range instead of showing each metric's latest all-time value. Every link created before this shipped keeps `ALL_TIME` and renders byte-identically; the founder link builder is unchanged.
- **Updates** (`/admin/updates`) — cross-portfolio feed of every published update (drafts excluded), with search (title/company), a company filter, and three sorts (newest/oldest/company A–Z); each row links to the update detail. Fetch-once + client-side filtering, no pagination — reuses the existing `GET /api/admin/updates` endpoint that already powered the link builder (shipped 2026-07-03)
- **Weekly Digest** (`/admin/digest`) — compose the internal team digest (6 fixed sections + todo list with assignees); AI-assisted drafting via Anthropic Claude from pasted meeting notes or Granola transcript links; sent by email to recipients configured in Settings
- **Company Notes** — admin-only internal notes on each company, with revision history
- **Service Provider Directory** (`/providers`, `/admin/providers`) — founders submit and endorse service providers; admins vet submissions (pending/vetted/rejected), manage categories, and add providers directly (`POST /api/admin/providers`, defaults to Vetted per D2, audit-logged as `PROVIDER_CREATED`)
  - **Real vetting restored (2026-07-03, WS7)**: founder submissions land as PENDING and stay there until an admin promotes or rejects them; endorsements (self or peer) are now pure testimonials and never change status. Previously submissions were auto-promoted to VETTED by the submitter's own endorsement, and any endorsement promoted a pending provider — so the admin queue never filled and "Vetted" didn't mean admin-reviewed. Pending submissions remain visible in the founder directory's community tier by design (a deliberate, deferred decision, not a bug).
- **Company member management** — add members by email from company detail page; new users created automatically via invite flow; membership role dropdown (Owner/Editor/Viewer) per founder member
- **Audit Log** (`/admin/audit`) — timestamped record of every admin mutation (approvals, deletions, provider/digest/note/sector/template CRUD, member adds, manual reminders, test emails); last 100 shown; write-only from `src/lib/audit.ts`, never blocks the action it logs (shipped 2026-07-03)
- **Funds / LPs / Deals** (`/admin/funds`, `/admin/lps`, shipped 2026-07-08, WS16) — foundation for the LP Fund-Report Portal (Part 7 of `docs/IMPLEMENTATION_PLAN.md`): admin CRUD for funds (name/group label/AUM/first-deal-date), portfolio companies (with an editable, exact-match-suggested link to an operational `Company` row, Q14), and per-fund deals (initial/follow-on, amount, instrument, entry/current valuation — editing `currentValuation` stamps `valuationAsOf`). A one-time importer (`scripts/import-investment-tracker.ts`, dry-run by default) populated the real dataset from DFS Lab's investment tracker spreadsheet: 76 deals across 50 portfolio companies and 7 funds, idempotent on re-run. Admin-only — no LP-facing surface yet (that's WS18).

> **Note on AI Chat:** the OpenAI-based RAG chatbot (and pgvector embeddings) was deliberately removed, pending a cleaner re-implementation. Re-introduction is planned — see P3 below. The dead `openai` dependency was dropped from package.json on 2026-07-03 along with five other unused packages (`ai`, `uuid`, `@types/uuid`; `diff`/`@types/diff` were initially flagged too but turned out to be in active use by the company-notes diff view and were restored).

### Document Management
- Upload documents linked to a company or specific update
- Document types: Pitch Deck, Financials, Legal, Product / Demo, Other
- Filter by type, search by name, toggle archived documents
- Archive / unarchive without permanent deletion
- Internal-only flag for admin-visible documents
- Document type badge shown on update detail attachments
- **Server-side MIME/extension allowlist** (as of 2026-07-03) — the upload endpoint no longer trusts the client-supplied MIME type; PDFs, Office formats, images, CSV/TXT/ZIP, and MP4/MOV are allowed and must match a real file extension

### Design & Branding
- **DFS brand system applied app-wide** — Paper/Bone/Obsidian/Sky palette, Space Grotesk / IBM Plex Sans / JetBrains Mono typography, flat/structured corners (no pill/rounded shapes) instead of the previous generic SaaS theme
- **Dark mode removed** — light theme only; the old teal-accented dark theme and its toggle were fully deleted, not just hidden
- **`_Molly` wordmark** — the placeholder auto-generated logo image is gone; a reusable text mark (mono font, brand-colored underscore) is used across the sidebar, nav bars, and auth pages
- Real DFS logo (pulled from DFS Lab's brand assets, not a placeholder) used in transactional email headers
- Status colors (badges, alerts) remapped from generic Tailwind red/green/amber to the brand's own Laterite/Acacia/Ochre
- **Mobile-width layout hardening** (shipped 2026-07-07, WS14–WS15) — app-wide layout correctness at phone widths (~375px): scrollable tables with explicit min-widths, wrap-row cards (link cards, members, approvals, notes, digest list), a scrollable company-detail tab strip, wrapping metric/setup-wizard form rows, stacked publish/schedule banners, stacked provider-modal field grids, and a stacked (below `sm:`) notes revision diff modal. Every fix is className-only and inert at ≥640px. Includes one breaker found via a real device screenshot mid-batch, outside the original audit: the founder `/providers` card grid had no base `grid-cols-1`, so the browser used an unconstrained implicit grid track that let each card blow out past its container, pushing the status badge and Endorse button off-screen — confirmed and fixed by reproducing the exact markup in headless Chrome at a true 375px viewport. Full detail in Part 6 of `docs/IMPLEMENTATION_PLAN.md`.

---

## Roadmap

Priorities run P0 (do first) through P3 (later).

> **Next up — LP Fund-Report Portal (planned 2026-07-08, WS16–WS19; WS16 in progress).** Web-native replacement for the twice-yearly PDF fund reports to LPs: admin-managed funds/deals/valuations (one-time spreadsheet import, Molly becomes source of truth), letter-style fund reports authored in TipTap with an explicit portfolio-company mention picker, valuation markups **frozen at publication** into per-mention snapshots, and an LP surface (`/lp`, styled after www.dfs.vc) with email-OTP login and ~30-day sessions. Full plan in Part 7 of [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md); all decisions (Q6–Q14) were answered 2026-07-08. Confidentiality ground rule: valuation/LP data never enters this (public) repo — the importer reads the tracker xlsx from a local path only. **WS16 (schema, one-time importer, admin funds/LPs/deals CRUD) shipped 2026-07-08** — admin-only, no LP-facing surface yet.

> **P0 and P1 shipped 2026-07-03.** All items from the 2026-07-03 roadmap review (workstreams WS0–WS5, plus a critical follow-on fix — see below) are live on production and verified end-to-end. Full step-by-step detail and verification notes are in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md). Shipped feature detail has been folded into "Existing Features" above; summary:
> - **WS0** — reminder cron GET/POST fix, ESLint repair, six dead deps removed, legacy share-link guard, dev bootstrap hardened
> - **WS1** — Postgres-backed rate limiting on signup/set-password, MIME/extension allowlist on uploads, share-link email validation, admin audit log
> - **WS2** — middleware routing extracted into a tested pure function (`src/lib/route-access.ts`), Vitest suite with a regression test for the Feb–Jul auth bypass, free GitHub Actions CI (not gating deploys)
> - **Unplanned fix, found during WS2 live verification** — `/api/cron/reminders` was also being blocked by auth middleware itself (cron requests carry no session), independent of the WS0 GET/POST bug. Both are now fixed and confirmed live.
> - **WS3** — Update Templates (admin CRUD + founder picker)
> - **WS4** — `/investors` page replaces the broken "Investor Login" OAuth button
> - **WS5** — investor engagement signal on the founder dashboard
>
> Test coverage remains narrow (middleware routing, auth guards, rate limiting) — broadening it further is not yet scheduled; treat "zero automated tests" as resolved for the auth-critical path specifically, not the whole app.
>
> **Part 4 follow-up batch (WS6–WS8) shipped 2026-07-03.** Plans in Part 4 of `docs/IMPLEMENTATION_PLAN.md`; shipped feature detail folded into "Existing Features" above.
> - **WS6** — homepage nav collapsed to a single "Log in" link; "Investor access" moved to the footer
> - **WS7** — admin "Add Provider" flow, and real provider vetting restored (founder submissions stay Pending until an admin acts; endorsements are pure testimonials)
> - **WS8** — `/admin/updates` cross-portfolio feed of published updates (search, company filter, sort)

### P2 — Leverage (next quarter)

> **P2 batch shipped 2026-07-06.** WS9 (Fork Configuration) → WS10 (metric alerts) → WS11 (Scheduled Publishing) → WS12 (Bulk LP Link), planned in Part 5 of [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md), all shipped and folded into "Existing Features" above. **Mobile-Width Layout Hardening (WS14–WS15) shipped 2026-07-07**, planned in Part 6, also folded into "Existing Features" (Design & Branding) above. Comment Threading was deferred out of the batch (see its row below).

| Feature | Description | Benefits |
|---------|-------------|----------|
| **Comment Threading** | Threaded replies, @mentions, resolution status. (Basic comment notifications already shipped.) **Deferred from the Jul 2026 P2 batch** — it's the tier's only redesign of an existing shared surface (highest UX-regression risk), its notification half depends on the currently-broken Resend key, and @mentions need cross-company permission design first. Future sketch in Part 5 / WS13 of `docs/IMPLEMENTATION_PLAN.md`. | Turns one-way updates into a coaching feedback loop. Demoted from top priority: templates improve update quality more per unit of effort. |

### P3 — Later / Opportunistic

| Feature | Description | Benefits |
|---------|-------------|----------|
| **AI re-introduction** | Bring back portfolio-wide AI chat and add AI-assisted insights/alerts, with a cleaner implementation than the removed OpenAI RAG version. Digest drafting (Claude) already ships and can anchor the pattern. | Deliberately paused, not abandoned. Waits on a clean architecture decision. |
| **Metrics Benchmarking** | Anonymized peer comparison (e.g., "Your MRR growth is above portfolio median"). | Motivates founders; needs more portfolio data density to be meaningful. |
| **Portfolio Export / LP Report PDF** | Multi-company polished PDF for LP reporting. Goes beyond the single-update PDF today. **Annotated 2026-07-08 (F18):** the planned LP Fund-Report Portal (see "Next up" above / Part 7 of `docs/IMPLEMENTATION_PLAN.md`) is the deliberate web-native successor to the PDF workflow — do not build a parallel PDF pipeline; the portal's print stylesheet (WS19) is the interim paper escape hatch. Revisit this row only if LPs demand generated PDFs after the portal ships. | Streamlines DFS Lab's investor reporting workflow. |
| **Custom Company Tags** | Admin-created tags (e.g., B2B SaaS, female-led, export-ready) for portfolio segmentation. | Enables thematic analysis without building new dashboards. |
| **Update Versioning / Audit Trail** | Track edits to published updates. Who published/edited and when. | Compliance and data integrity as platform matures. Pairs with the admin audit log (shipped 2026-07-03) — same `AuditLog` model, add `UPDATE_EDITED` entries with a diff in `metadata`. |
| **Investor Accounts (Optional)** | Optional upgrade from token-only to persistent investor accounts. | Enables re-access, saved preferences, and engagement analytics. The `/investors` explainer page (shipped 2026-07-03) is the interim fix; this would replace it with real accounts. |
| **Slack / Webhook Integrations** | Slack notifications for overdue updates, new approvals, published updates. | Connects Molly into existing DFS Lab team workflows. |
| **Mobile-Optimized Update Flow** | Simplified metric entry and editor optimized for small screens — an *interaction redesign* of the founder update flow (composer, metric entry), not just layout. **Mobile-Width Layout Hardening shipped 2026-07-07** (see Design & Branding above) and already makes the existing update form and every other view render correctly at phone widths. **Annotated 2026-07-08:** the Medium-Style Draft Composer (see Founder Features above, shipped 2026-07-08, WS20) delivered the visual/layout half of a composer rethink; this item's remaining scope narrows to mobile-specific *interaction* work (chiefly simplified metric entry). | Many founders are mobile-first. Improves update frequency. |

---

## Notes

- Shipped features should be moved from the roadmap into the "Existing Features" section above.
- Priority tiers should be revisited quarterly or after each major release.
