# Molly Portfolio Platform

A web application for Molly to manage portfolio company updates, metrics, and documents — and for portfolio company founders to submit investor updates.

## Overview

**Two user groups:**

- **Portfolio company founders** sign up with their company email, get approved by Molly, then use the platform to maintain their company profile, track key metrics, and send investor updates.
- **Molly admins** log in with their `@dfslab.net` Google accounts to review the full portfolio — approving sign-ups, tracking update cadence, viewing metrics trends, and querying everything through an AI chatbot.

## Key Features

### For Founders
- Sign up and get approved by Molly
- Set up company profile (name, logo, sector, geography, funding stage)
- Define and track key metrics (MRR, active users, revenue, etc.)
- Create investor updates with narrative text, metric snapshots, and file attachments
- Publish updates with a confirmation step — DFS Lab is notified by email on publish
- Generate shareable read-only links for investors with configurable expiry (7 days to never)
- Download a formatted PDF of each update
- Invite teammates by email (Owner, Editor, Viewer roles) — new users get an account automatically
- Manage team access: change roles, remove members

### For Molly Admins
- Approve or reject founder sign-up requests
- Global dashboard showing update cadence across all portfolio companies
- Company detail pages with full update history, metrics trends, and documents
- Create companies and add members by email — new users are created and invited automatically
- Comment on updates to communicate with founders
- Create shareable LP links covering one or multiple portfolio companies for a given period
- AI chatbot that searches across all portfolio data and answers questions using OpenAI
- Configure per-company update reminder frequency (weekly, bi-weekly, monthly, quarterly)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL + Prisma ORM + pgvector |
| Auth | NextAuth (Google OAuth for admins, email/password for founders) |
| File Storage | S3-compatible (AWS S3 / Cloudflare R2) |
| Email | Resend |
| AI | OpenAI API with RAG (retrieval-augmented generation) |

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
      admin/              # Approvals, dashboard, company management
      ai/                 # AI chatbot endpoint
    login/                # Login page
    signup/               # Founder sign-up
    dashboard/            # Founder dashboard
    admin/                # Admin dashboard, approvals, companies, AI chat
  components/             # Reusable UI and layout components
  lib/                    # Server-side utilities (auth, db, email, S3, AI)
  types/                  # TypeScript type definitions
prisma/
  schema.prisma           # Database schema
```

## Deployment

Recommended stack for ~100 portfolio companies at **$25–75/month**:

- **Vercel** for hosting ($20/mo)
- **Neon** for PostgreSQL with pgvector (free tier)
- **Cloudflare R2** for file storage (~$1–5/mo)
- **Resend** for transactional email (free tier)
- **OpenAI** API pay-as-you-go (~$10–50/mo)

## License

MIT — free to use, fork, and modify. See [LICENSE](./LICENSE) for details.
