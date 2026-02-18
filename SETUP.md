# Molly Portfolio Platform — Setup Guide

This guide walks you through getting the platform running from scratch.

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **PostgreSQL** 15+ with the `pgvector` extension
- **npm** (comes with Node.js)

## 1. Install dependencies

```bash
npm install
```

This will also run `prisma generate` automatically to create the database client.

## 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with the details below.

### Database (required)

You need a PostgreSQL database. Two easy options:

**Option A — Neon (free, hosted):**
1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project.
3. Enable the `pgvector` extension: run `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL editor.
4. Copy the connection string into `DATABASE_URL`.

**Option B — Local Postgres:**
1. Install PostgreSQL locally.
2. Create a database: `createdb dfslab`
3. Enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
4. Set `DATABASE_URL=postgresql://youruser:yourpassword@localhost:5432/dfslab`

### Auth secret (required)

Generate a random secret for session encryption:

```bash
openssl rand -base64 32
```

Paste the result into `AUTH_SECRET`.

Set `NEXTAUTH_URL=http://localhost:3000` for local development.

### Google OAuth (required for admin login)

This lets Molly team members sign in with their `@dfslab.net` Google accounts.

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a new project (or use an existing one).
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth Client ID**.
4. Application type: **Web application**.
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy the **Client ID** into `GOOGLE_CLIENT_ID`.
7. Copy the **Client Secret** into `GOOGLE_CLIENT_SECRET`.

For production, add your production URL as an additional redirect URI.

### S3-compatible storage (required for file uploads)

For storing uploaded documents and logos. Works with AWS S3, Cloudflare R2, or MinIO.

**Cloudflare R2 (recommended — free egress):**
1. Go to [Cloudflare dashboard](https://dash.cloudflare.com) > R2.
2. Create a bucket called `dfslab-uploads`.
3. Create an API token with read/write access to the bucket.
4. Fill in `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET`.

**AWS S3:**
1. Create an S3 bucket.
2. Create an IAM user with S3 access.
3. Fill in the same variables. Set `S3_ENDPOINT` to `https://s3.amazonaws.com`.

### Email — Resend (required for approval emails)

1. Go to [resend.com](https://resend.com) and create a free account.
2. Verify your sending domain (or use Resend's test domain for development).
3. Create an API key and paste it into `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to your verified sender address.

### OpenAI (optional — for AI chatbot)

1. Go to [platform.openai.com](https://platform.openai.com) and create an API key.
2. Paste it into `OPENAI_API_KEY`.
3. The chatbot works without this — it will show a "not configured" message until you add the key.

## 3. Set up the database

Push the schema to your database:

```bash
npm run db:push
```

This creates all the tables. To explore your data visually:

```bash
npm run db:studio
```

## 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Create your first admin account

1. Go to `http://localhost:3000/login`.
2. Click "Sign in with Google" using a `@dfslab.net` account.
3. The system will automatically create your admin account.

## 6. Test the founder flow

1. Go to `http://localhost:3000/signup`.
2. Fill in a test founder name, email, and company name.
3. In the admin dashboard (`/admin/approvals`), approve the sign-up.
4. Check the founder's email (or the Resend dashboard) for the password-set link.
5. Set a password and log in as the founder.

---

## Deployment

### Vercel (recommended)

1. Push your code to GitHub.
2. Import the repo in [vercel.com](https://vercel.com).
3. Add all environment variables from `.env.local` to the Vercel project settings.
4. Set `NEXTAUTH_URL` to your production URL (e.g. `https://portfolio.dfslab.net`).
5. Update your Google OAuth redirect URI to include the production callback URL.
6. Deploy.

### Estimated costs for ~100 portfolio companies

| Service | Cost |
|---------|------|
| Vercel (Pro) | $20/mo |
| Neon Postgres (free tier) | $0 |
| Cloudflare R2 | ~$1-5/mo |
| Resend (free tier, 3k emails/mo) | $0 |
| OpenAI API (pay-as-you-go) | ~$10-50/mo |
| **Total** | **~$25-75/mo** |

---

## Project structure

```
src/
  app/                    # Next.js App Router pages and API routes
    api/                  # Backend API routes
      auth/               # Auth endpoints (signup, set-password, NextAuth)
      companies/          # Company CRUD + metrics + updates
      updates/            # Update CRUD + comments + PDF
      documents/          # File upload/download
      admin/              # Admin-only endpoints (approvals, dashboard)
      ai/                 # AI chatbot endpoint
    login/                # Login page
    signup/               # Founder sign-up page
    set-password/         # Password setup page
    setup-wizard/         # Post-approval onboarding wizard
    dashboard/            # Founder dashboard
    company/              # Founder company profile + metrics pages
    updates/              # Founder update pages (create, view, download)
    admin/                # Admin pages (dashboard, approvals, companies, chat)
  components/
    ui/                   # Reusable UI components (Button, Input, Card, etc.)
    layout/               # Layout components (Sidebar, AppShell, PageHeader)
  lib/                    # Shared utilities
    auth.ts               # NextAuth configuration
    auth-guard.ts         # API route auth helpers
    db.ts                 # Prisma client
    email.ts              # Email sending (Resend)
    s3.ts                 # S3 file storage
    ai.ts                 # OpenAI RAG integration
    pdf.ts                # Investor update PDF/HTML generation
    utils.ts              # General utilities
  types/                  # TypeScript type definitions
prisma/
  schema.prisma           # Database schema
```
