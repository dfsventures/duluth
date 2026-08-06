# Molly Portfolio Platform

A web application to manage portfolio company updates, metrics, and documents — and for portfolio company founders to submit investor updates.

Built by [DFS Lab](https://www.dfs.vc) and open source under MIT so other investment teams can fork it and run their own instance. Brand colors, the wordmark, and email styling are centralized (CSS variables, a single `LogoMark` component, one token object in `src/lib/email.ts`) to keep re-theming a fork straightforward.

## Overview

**Two user groups:**

- **Portfolio company founders** sign up with their company email, get approved by Molly, then use the platform to maintain their company profile, track key metrics, and send investor updates.
- **Admins** log in with Google accounts on an allow-listed domain (`NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN`, defaults to `dfs.vc` — see Fork Configuration below) to review the full portfolio — approving sign-ups, tracking update cadence, viewing metrics trends, and assembling the team's weekly digest.

## Key Features

### For Founders
- Sign up and get approved by Molly
- Set up company profile (name, logo, sector, geography, funding stage)
- Define and track key metrics (MRR, active users, revenue, etc.)
- Create investor updates with narrative text, metric snapshots, and file attachments
- Publish updates with a confirmation step — the admin team is notified by email on publish
- Receive email notifications when an admin leaves a comment on an update
- Generate shareable read-only links for investors with configurable expiry (7 days to never)
- Download a formatted PDF of each update
- Invite teammates by email (Owner, Editor, Viewer roles) — new users get an account automatically
- Manage team access: change roles, remove members
- Browse the service-provider directory; submit and endorse providers

### For Molly Admins
- Approve or reject founder sign-up requests
- Global dashboard showing update cadence across all portfolio companies
- Company detail pages with full update history, metrics trends, and documents
- Create companies and add members by email — new users are created and invited automatically
- Comment on updates to communicate with founders — founders are notified by email; admins are notified when founders reply
- Create shareable LP links covering one or multiple portfolio companies for a given period
- Compose and send a weekly team digest — AI-assisted drafting (Anthropic Claude) from pasted meeting notes or transcript links
- Keep internal notes on each company, with revision history
- Manage a service-provider directory: founders submit and endorse providers, admins vet them
- Configure per-company update reminder frequency (weekly, bi-weekly, monthly, quarterly)

### LP Fund-Report Portal
A separate, third audience alongside founders/admins and investor-link recipients: **limited partners** of the funds an admin has configured. Admins manage funds, portfolio companies, and per-fund deals/valuations (imported once from a spreadsheet, then Molly is the source of truth — see `scripts/import-investment-tracker.ts` in SETUP.md), and author letter-style reports per fund with an explicit `@`-mention picker for portfolio companies. Publishing **freezes** valuation snapshots into the report (the LP-facing numbers never silently drift after the fact); re-publishing after an edit re-freezes fresh ones.

LPs have no account and no NextAuth session. They authenticate at `/lp` with a one-time, 6-digit email code (10-minute validity, fail-closed attempt cap) and land on a ~30-day session; from there they see a library of every published report across the funds they belong to, and each report page renders portfolio-company mentions as hover/tap cards showing the multiple and dollar detail since DFS's first check. The whole `/lp` surface is public at the routing layer (`PUBLIC_PREFIXES` in `src/lib/route-access.ts`) by design — the `lp_session` cookie is the real, separate gate, checked directly by Server Components rather than by any client-side API fetch. **No new env vars or paid services are needed** — reuses the existing Resend integration and the Postgres-backed rate limiter.

Forks: the LP tables (`Fund`, `PortfolioCompany`, `Deal`, `LimitedPartner`, `LpSession`, `LpOtpCode`, `FundReport`, `FundReportMention`) are entirely additive and dormant until an admin creates a fund — no migration risk to running an unmodified instance without ever using this feature. The importer is a one-time CLI script; it never runs automatically and never reads or writes anything outside the path you give it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth (Google OAuth for admins, email/password for founders) |
| File Storage | S3-compatible (AWS S3 / Cloudflare R2) |
| Email | Resend |
| AI | Anthropic Claude (AI-assisted weekly digest drafting) |
| Design System | DFS brand — Paper/Bone/Obsidian/Sky palette, Space Grotesk / IBM Plex Sans / JetBrains Mono, light theme only |

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables and fill in your values
cp .env.example .env.local

# Push database schema
npm run db:push

# Start development server
npm run dev
```

See **[SETUP.md](./SETUP.md)** for detailed configuration instructions for each service (database, Google OAuth, S3, email, OpenAI).

## Project Structure

```
src/
  app/                    # Pages and API routes (Next.js App Router)
    api/                  # Backend API
      auth/               # Sign-up, password setup, NextAuth
      companies/          # Company CRUD, metrics, updates
      updates/            # Update CRUD, comments, PDF generation
      documents/          # File upload and download
      admin/              # Approvals, dashboard, company management, digest
      providers/          # Service-provider directory
      lp/                 # LP portal auth (request/verify/logout OTP endpoints)
    login/                # Login page
    signup/               # Founder sign-up
    dashboard/            # Founder dashboard
    admin/                # Admin dashboard, approvals, companies, digest, settings
    lp/                   # LP portal (library + report pages, its own layout)
  components/             # Reusable UI and layout components
  lib/                    # Server-side utilities (auth, db, email, S3, lp-auth)
  types/                  # TypeScript type definitions
prisma/
  schema.prisma           # Database schema
scripts/
  import-investment-tracker.ts   # One-time LP fund/deal spreadsheet importer (see SETUP.md)
```

## Deployment

Recommended stack for ~100 portfolio companies at **$25–75/month**:

- **Vercel** for hosting ($20/mo)
- **Neon** for PostgreSQL (free tier)
- **Cloudflare R2** for file storage (~$1–5/mo)
- **Resend** for transactional email (free tier)
- **Anthropic** API pay-as-you-go for digest drafting (low single digits/mo)

## License

MIT — free to use, fork, and modify. See [LICENSE](./LICENSE) for details.

### Fork Configuration

A fork can rename the deployment with env vars only — no source edits needed for these four:

- `NEXT_PUBLIC_ORG_NAME` — organization display name in UI copy, page titles, and emails (default `"DFS Lab"`)
- `NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN` — email domain granted admin access via Google OAuth, no leading `@` (default `"dfs.vc"`)
- `EMAIL_LOGO_PATH` — path under `public/` to the logo shown in transactional email headers (default `"/brand/dfs-logo-primary.png"`; recommended ~54×22px to avoid letterboxing)
- `SUPPORT_EMAIL` — contact address on the public `/investors` page and the rejection email's reply-to (default `"support@dfs.vc"`)

`NEXT_PUBLIC_*` vars are inlined into the client bundle at build time, so changing them requires a redeploy, not just an env edit. With none of the above set, a deploy behaves byte-identically to unconfigured DFS Lab defaults.

Theming stays a source edit by design (not yet runtime-configurable):
- Replace `public/brand/*` assets and `public/favicon.png` with your own
- Replace the CSS theme tokens (colors, fonts) in `src/app/globals.css`
- The `LogoMark` component (`src/components/ui/logo-mark.tsx`) and the color token object at the top of `src/lib/email.ts` are the two places brand colors are centralized if you want to re-theme beyond swapping CSS variables

See the Fork Configuration item in [ROADMAP.md](./ROADMAP.md) for the full history of this work.
