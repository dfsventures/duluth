# Molly Portfolio Platform

A web application to manage portfolio company updates, metrics, and documents — and for portfolio company founders to submit investor updates.

Built by [DFS Lab](https://www.dfs.vc) and open source under MIT so other investment teams can fork it and run their own instance. Brand colors, the wordmark, and email styling are centralized (CSS variables, a single `LogoMark` component, one token object in `src/lib/email.ts`) to keep re-theming a fork straightforward.

## Overview

**Two user groups:**

- **Portfolio company founders** sign up with their company email, get approved by Molly, then use the platform to maintain their company profile, track key metrics, and send investor updates.
- **Molly admins** log in with their `@dfslab.net` Google accounts to review the full portfolio — approving sign-ups, tracking update cadence, viewing metrics trends, and assembling the team's weekly digest.

## Key Features

### For Founders
- Sign up and get approved by Molly
- Set up company profile (name, logo, sector, geography, funding stage)
- Define and track key metrics (MRR, active users, revenue, etc.)
- Create investor updates with narrative text, metric snapshots, and file attachments
- Publish updates with a confirmation step — DFS Lab is notified by email on publish
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
    login/                # Login page
    signup/               # Founder sign-up
    dashboard/            # Founder dashboard
    admin/                # Admin dashboard, approvals, companies, digest, settings
  components/             # Reusable UI and layout components
  lib/                    # Server-side utilities (auth, db, email, S3)
  types/                  # TypeScript type definitions
prisma/
  schema.prisma           # Database schema
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

Molly is intentionally fork-friendly: if you run an investment team and want your own instance, re-theming means changing the CSS variables in `src/app/globals.css`, the `LogoMark` component, and the color tokens at the top of `src/lib/email.ts`. See [ROADMAP.md](./ROADMAP.md) for planned work on making this a first-class config.
