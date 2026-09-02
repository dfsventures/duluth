# Molly — Roadmap Review & Implementation Plan

_Prepared: 2026-07-03 · Reviewed against `ROADMAP.md` (last updated 2026-07-02)_

> **Status (2026-07-03, end of day): Parts 1–3 are complete.** All six workstreams (WS0–WS5) shipped to production the same day and were verified live on `molly.dfslab.net`. One bug beyond this plan was found during WS0's live verification: `/api/cron/reminders` was **also** blocked by the auth middleware itself (Vercel Cron requests carry no session, so every invocation was 307-redirected to `/login` before the route's `CRON_SECRET` check ran) — independent of, and stacked on, the GET/POST bug F1 describes. Fixed by adding `/api/cron` to the middleware public-path list (commit `b6cb846`); the route-level secret check remains the real gate, confirmed live (200 with secret, 401 without).
>
> **Part 4 (added later the same day)** contains the follow-up batch WS6–WS8, from a follow-up product review. **Shipped and verified on production 2026-07-03.**
>
> **Part 5 (added 2026-07-06)** is the plan for the P2 tier of `ROADMAP.md` (WS9–WS12, with Comment Threading explicitly deferred). **Shipped and verified on production 2026-07-06** — all four workstreams (WS9 → WS10 → WS11 → WS12) live on `molly.dfslab.net`.
>
> **Part 6 (added 2026-07-07)** is the mobile-width layout hardening batch (WS14–WS15). **Shipped and verified 2026-07-07.**
>
> **Part 7 (added 2026-07-08)** plans the **LP Fund-Report Portal** (WS16–WS19) — funds/deals/LP management, snapshot-frozen fund reports with portfolio-company hover cards, and an OTP-authenticated LP surface styled after www.dfs.vc. **Planned, not yet started.** Open decisions Q6–Q14 await user answers (recommendations attached).
>
> **Part 8 (added 2026-07-08)** plans the **Medium-style draft composer** (WS20) — chromeless, distraction-free draft pages for updates (and the Part 7 report editor), per a user-supplied Medium screenshot. **Planned, not yet started.** The screenshot was received and reviewed the same day (after several failed delivery attempts) — it confirmed the design targets and resolved Q18 (bubble toolbar + left-margin "+" insert); decisions Q15–Q17 remain open (recommendations attached).

This document is the output of a full codebase-vs-roadmap review. It has five parts:

1. **Review findings** — where the code and the roadmap agree, where they drift, and issues found during review that the roadmap doesn't know about yet.
2. **Implementation plan** — step-by-step workstreams for all P0 and P1 items (plus a small bug-fix/hygiene workstream), written so a junior engineer can execute them without further design decisions. P2/P3 get recommendations only.
3. **P2/P3 recommendations** — sketches only.
4. **Follow-up batch (WS6–WS8)** — homepage login CTA consolidation, admin provider management + real vetting, and a cross-portfolio updates page for admins.
5. **P2 batch (WS9–WS12)** — fork configuration, rule-based metric alerts, scheduled publishing, bulk LP report link; Comment Threading explicitly deferred (added 2026-07-06).

**Hard constraints honored throughout:**

- **No new cost lines.** Everything uses the existing stack (Vercel, Postgres, S3, Resend, Anthropic) or free tooling (Vitest, GitHub Actions). No new paid services, no plan upgrades. Rate limiting is Postgres-backed specifically to avoid adding a Redis service.
- **No UX regressions.** Every change is additive or invisible to existing founders, admins, and investor link recipients. Each workstream ends with an explicit "UX impact" statement.

---

## Confidentiality & synthetic-data convention (MUST READ before appending to this file or committing anything)

_Added 2026-08-06 as Part 28's standing guardrail, after the Part 27 confidentiality audit found real DFS-internal data (F52–F57) had accumulated in this very file, in `ROADMAP.md`, in `prisma/seed.ts`, and in source. This convention exists to stop that recurring. It binds every future Felix/Alvin dispatch and any human editing the repo._

**The rule.** No committed file — narrative docs (this file, `ROADMAP.md`, `README.md`, `SETUP.md`), code comments, source, seed data, or test fixtures — may contain **real DFS-specific operational identifiers**:

- real portfolio-company or founder names, or any detail that identifies one (deal counts, valuations, written-off status, DD-document incidents);
- real fund-vehicle names/labels or the exact portfolio shape (deal/company/fund counts);
- real LP names or email addresses;
- real vetted-vendor names, sites, or contact emails;
- named DFS team members tied to internal process/decisions.

**Write about them the way Part 27 wrote about its own findings** — by `file:line + category`, never by restating the sensitive content. When a narrative genuinely needs an example value, use a synthetic placeholder from the app's established convention: `Acme` / `AcmeHQ` for companies, `example.com` / `acme.com` for domains and emails, `FUND1`/`FUND2` (or `SPV`/`CAF` generic-shape labels only if illustrating structure, never the real set), `Jane Founder` for people. This is the same discipline already used across `src/**/__tests__/*` and by Part 27's own write-up.

**Why real values are never needed in-repo.** The LP/financial-data importers (`scripts/import-investment-tracker.ts`, `scripts/backfill-rounds.ts`) already establish the ground rule: real deal amounts, valuations, and vehicle sets are read from an **external file passed as a CLI argument** (`.xlsx`, gitignored) at run time and are **never** committed. Extend that same posture to prose: the real name goes in your head or your terminal, the synthetic placeholder goes in the file.

**Automated backstop.** A local pre-commit hook (Part 28, WS65) scans staged additions against a **gitignored** local blocklist of the actual real terms and blocks the commit on a match. The blocklist itself is never committed (that would just relocate the leak); a committed `.confidential-terms.example` documents its format with synthetic entries only. The hook is a safety net, not a substitute for writing synthetically in the first place.

---

## Part 1 — Review Findings

### 1.1 Roadmap accuracy check

The "Existing Features" section of `ROADMAP.md` was verified against the code and is **accurate**. All claimed features exist where described. The P0 security items were each confirmed still open in code:

| Roadmap claim | Verified in code |
|---|---|
| No rate limiting on signup / set-password | Confirmed — `src/app/api/auth/signup/route.ts` and `set-password/route.ts` have zero throttling. No rate-limit code exists anywhere in `src/`. |
| Client-supplied MIME type on upload | Confirmed — `src/app/api/documents/upload/route.ts:27-32` only checks `typeof mimeType === "string"`, then signs an S3 URL with it and stores it verbatim. |
| Share-link email gate accepts any string | Confirmed — `src/app/api/share/[token]/view/route.ts:14` only checks `typeof email === "string"`. `"asdf"` is logged as a valid investor view. |
| No audit log for admin actions | Confirmed — no `AuditLog` model, no logging in any `/api/admin/*` route. |
| Zero automated tests | Confirmed — no test files, no test runner installed, no `test` script. |
| Hardcoded `@dfs.vc` admin domain | Confirmed — `src/lib/auth.ts:47`, plus copy in `src/app/login/page.tsx:30,116`. |
| Dead `openai` dependency | Confirmed — and it's worse, see 1.2 below. |

### 1.2 New findings (not on the roadmap)

Found during this review, ordered by severity:

**F1 — The reminder cron job is likely broken (HIGH).**
`src/app/api/cron/reminders/route.ts` only exports a `POST` handler, but **Vercel Cron invokes cron paths with HTTP GET**. A GET to that route returns 405 and no reminder logic runs. Unless someone is triggering it manually with the secret, update reminders have not been sending since the route shipped. → Fixed in WS0. **Verify first**: check the Vercel dashboard → project → Logs (filter path `/api/cron/reminders`) or Cron Jobs tab for failing invocations before assuming.

**F2 — Linting has never run (MEDIUM).**
There is no ESLint config file in the repo (`.eslintrc*` / `eslint.config.*` don't exist), and running `npx next lint` drops into the interactive setup wizard. Additionally the installed versions are mismatched with Next 14: `eslint@^9` and `eslint-config-next@^16` (Next 14's `next lint` expects ESLint 8 and a matching config version). So `npm run lint` has never actually checked anything. → Fixed in WS0.

**F3 — Six dead dependencies (LOW, hygiene).**
Nothing in `src/` or `prisma/` imports any of: `openai`, `ai` (Vercel AI SDK), `uuid`, `@types/uuid`, `diff`, `@types/diff`. (`zod` is also currently unused, but **keep it** — WS1 uses it.) → Removed in WS0.

**F4 — Legacy share links can crash the share endpoint (LOW).**
`src/app/api/share/[token]/route.ts:73` does `new Date(link.periodEnd!)` on the legacy path (no `selectedUpdates`). If a legacy row ever has `periodStart`/`periodEnd` null, this produces `Invalid Date` and the Prisma query throws → investor sees "Internal server error". Defensive one-liner. → Fixed in WS0.

**F5 — Dev bootstrap route relies only on `NODE_ENV` (LOW).**
`src/app/api/dev/bootstrap/route.ts` creates an admin with password `password123` and is listed as public in the middleware (`/api/dev` prefix). It refuses when `NODE_ENV === "production"`, which does hold on Vercel — but a single env check guarding an instant-admin backdoor deserves defense in depth. → Hardened in WS0 (roadmap already tracked the hardcoded password as "low").

**F6 — `package.json` says `"license": "ISC"` but the repo ships an MIT `LICENSE` (TRIVIAL).** → Fixed in WS0.

**F7 — Product question, no code change proposed (DECISION NEEDED, default = leave as is).**
For pinned-update share links, `GET /api/share/[token]` returns the **latest value of every metric the company has ever recorded** (no date filter — the code comments say this is intentional). That means an investor viewing a link pinned to Q1 updates also sees current metric values. If that's intended (investors see fresh numbers), no action. If links should only show data from the shared updates' era, say so and we'll scope it — but note that changing it alters what existing recipients see, so it defaults to unchanged.

### 1.3 P1 feature status

- **Update Templates** — nothing exists. No model, no UI, no mention in code. Full build (WS3).
- **Investor entry point** — confirmed broken-by-design: `src/components/ui/investor-login-button.tsx` fires admin Google OAuth with `callbackUrl: "/admin"`; a real investor gets Google's `AccessDenied` error. Plan (WS4) replaces it with a static explainer page — the "remove/redirect" option from the roadmap, chosen because it's zero-cost, can't break anyone, and the P3 "Investor Accounts" item is the real fix.
- **Share-link engagement for founders** — the data is fully collected (`ShareableLinkView` rows with email + timestamp) and already visible in the `/links` page view log. The roadmap item is purely a founder-dashboard surface. Small build (WS5).

---

## Part 2 — Implementation Plan

### Ordering, deployment model, and ground rules

**Execution order:** WS0 → WS1 → WS2 → WS3 → WS4 → WS5. WS0–WS2 are P0. Each workstream is one or more commits; **finish and verify one workstream on the live deploy before starting the next** (this repo deploys to production on push — there is no staging).

**Ground rules for the implementing engineer:**

1. **Never run `prisma db push` against a stale env.** Before any schema step: `vercel env pull .env.local`, then run Prisma with that URL explicitly:
   ```bash
   vercel env pull .env.local
   # grab DATABASE_URL from .env.local, then:
   DATABASE_URL="<value from .env.local>" npx prisma db push
   ```
   All schema changes in this plan are **purely additive** (new tables only — no altered columns), so `db push` is safe for existing data and for the currently-deployed code. **Push the schema before pushing the code that uses it.**
2. **Match existing code style.** API routes follow the pattern in `src/app/api/links/route.ts` (guard → validate → act → `NextResponse.json`, try/catch returning 500). Client pages follow `src/app/links/page.tsx`. Server-component pages follow `src/app/admin/settings/page.tsx`.
3. **Every route file starts with** `export const dynamic = "force-dynamic";` (match the codebase).
4. **Don't touch response shapes of existing endpoints.** Add fields/endpoints; never rename or remove.
5. After each workstream: run `npm run typecheck && npm run lint && npm test` (scripts exist after WS0/WS2), push, and verify the acceptance checklist on the live deploy.

---

### WS0 — Bug fixes & hygiene (½ day)

**Goal:** fix the broken cron, make lint real, drop dead weight. No feature changes.

#### WS0.1 Fix the cron method mismatch (F1)

File: `src/app/api/cron/reminders/route.ts`

1. First check Vercel → Logs / Cron Jobs to confirm the failure mode (expect 405s on GET at 09:00 UTC).
2. Rename the existing exported function from `POST` to a plain function `handleReminders(req: NextRequest)` and export both methods wrapping it:
   ```ts
   async function handleReminders(req: NextRequest) {
     // ... existing body unchanged, including the CRON_SECRET check ...
   }

   export async function GET(req: NextRequest) {
     return handleReminders(req);
   }

   export async function POST(req: NextRequest) {
     return handleReminders(req);
   }
   ```
   (Keep `POST` so any existing manual-test scripts keep working.) The `CRON_SECRET` check stays exactly as is — Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations regardless of method.
3. **Verify:** after deploy, trigger manually — `curl -X GET https://<prod-domain>/api/cron/reminders -H "Authorization: Bearer <CRON_SECRET>"` — expect `{"sent":N,"skipped":M}`. Then confirm the next scheduled 09:00 UTC run succeeds in Vercel logs. ⚠️ A successful run may send a backlog of genuinely-overdue reminder emails to founders — that is correct behavior, but tell Molly's admins to expect it.

#### WS0.2 Make ESLint work (F2)

1. `npm remove eslint eslint-config-next && npm install -D eslint@^8.57.0 eslint-config-next@14.2.35`
2. Create `.eslintrc.json` at repo root:
   ```json
   { "extends": "next/core-web-vitals" }
   ```
3. Run `npm run lint`. Fix trivial findings (unused imports etc.). If a rule fires widely and fixing it is out of scope, set it to `"warn"` in `.eslintrc.json` and note it — do **not** refactor components to satisfy lint in this workstream.
4. Add a `typecheck` script to `package.json`: `"typecheck": "tsc --noEmit"`. Run it; it should pass already.

#### WS0.3 Remove dead dependencies (F3) + license field (F6)

1. `npm remove openai ai uuid @types/uuid diff @types/diff`
2. In `package.json`, change `"license": "ISC"` → `"license": "MIT"`.
3. Run `npm run build` locally to prove nothing referenced them.
4. Also delete the "the `openai` dependency … can be dropped" sentence from the AI Chat note in `ROADMAP.md` (it's now done).

#### WS0.4 Defensive guard on legacy share links (F4)

File: `src/app/api/share/[token]/route.ts` — in the legacy branch (`else` at line ~71), before using `link.periodStart!`:

```ts
} else if (link.periodStart && link.periodEnd) {
  // Legacy link: filter by company + period range
  ...existing code...
} else {
  updates = [];
}
```

And guard the metric filter the same way: the legacy `metricDateFilter` (line ~87) must only apply when both dates exist; otherwise use `{}`.

#### WS0.5 Harden dev bootstrap (F5)

File: `src/app/api/dev/bootstrap/route.ts` — replace the guard at the top:

```ts
if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_BOOTSTRAP !== "true") {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

Add `ALLOW_DEV_BOOTSTRAP=true` to `.env.example` (commented out) with a warning comment. Do **not** add it to Vercel.

**WS0 acceptance checklist**
- [ ] Manual cron trigger returns `{sent, skipped}`; next scheduled run green in Vercel logs
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm run build` passes with the six packages removed
- [ ] Opening a share link created before Feb (period-based) still renders
- [ ] `POST /api/dev/bootstrap` on prod returns 404

**UX impact:** none visible, except founders with genuinely overdue updates start receiving the reminder emails the product always claimed to send. **Cost impact:** none (removes packages).

---

### WS1 — P0 security hardening batch (2–3 days)

Four independent items. Ship each as its own commit, in this order.

#### WS1.1 Rate limiting on signup and set-password (Postgres-backed)

No Redis, no new service — a tiny counter table in the existing Postgres. Fixed-window counting: correct enough for abuse prevention, trivially understandable, one upsert per request.

**Step 1 — Schema.** Append to `prisma/schema.prisma`:

```prisma
// ─── Rate Limiting ────────────────────────────────────────

model RateLimitCounter {
  id          String   @id @default(cuid())
  key         String   // e.g. "signup:203.0.113.7"
  windowStart DateTime
  count       Int      @default(1)

  @@unique([key, windowStart])
  @@map("rate_limit_counters")
}
```

Run the `db push` procedure from the ground rules.

**Step 2 — Helper.** New file `src/lib/rate-limit.ts`:

```ts
import { db } from "@/lib/db";

const WINDOW_MS = 60 * 60 * 1000; // 1-hour fixed windows

/**
 * Postgres-backed fixed-window rate limiter.
 * Returns true if the request is allowed, false if over the limit.
 * Fails OPEN on DB errors — an outage must not lock users out of auth.
 */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit: number
): Promise<boolean> {
  const key = `${bucket}:${identifier}`;
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  try {
    const counter = await db.rateLimitCounter.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: 1 } },
      create: { key, windowStart },
    });
    // Opportunistic cleanup of stale windows (~1% of calls)
    if (Math.random() < 0.01) {
      db.rateLimitCounter
        .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * WINDOW_MS) } } })
        .catch(() => {});
    }
    return counter.count <= limit;
  } catch (err) {
    console.error("rate-limit check failed (allowing request):", err);
    return true;
  }
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
```

**Step 3 — Apply.** At the top of the `POST` handler in `src/app/api/auth/signup/route.ts` (inside the try, before parsing the body):

```ts
const ip = clientIp(req);
if (!(await checkRateLimit("signup", ip, 10))) {
  return NextResponse.json(
    { error: "Too many attempts. Please try again in an hour." },
    { status: 429 }
  );
}
```

Same in `src/app/api/auth/set-password/route.ts` with bucket `"set-password"`, limit `10`.

Limits rationale: 10/hour/IP is far above any legitimate use (a human signs up once; set-password is clicked from an email once or twice) but low enough to make token brute-forcing and signup spam useless. Shared office NATs won't realistically hit it.

**Step 4 — Client handling.** Check `src/app/signup/page.tsx` and `src/app/set-password/page.tsx`: both already display `error` from the JSON response on non-OK statuses (verify by reading the fetch handler). If either only handles specific statuses, make sure a 429's `error` message reaches the same error display. No visual changes.

#### WS1.2 Server-side MIME/extension allowlist on document upload

**Step 1 — Allowlist.** Append to `src/lib/constants.ts`:

```ts
// Server-side upload validation: MIME type → allowed file extensions.
// Keep in sync with what founders actually upload (decks, financials,
// legal docs, product demos). SVG is deliberately excluded (XSS vector).
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "application/zip": ["zip"],
  "video/mp4": ["mp4"],       // product demo videos
  "video/quicktime": ["mov"],
};
```

(mp4/mov included deliberately — the "Product / Demo" doc type implies demo videos; excluding them would break a plausible existing workflow, violating the no-UX-regression rule.)

**Step 2 — Validate.** In `src/app/api/documents/upload/route.ts`, after the existing `mimeType` string check:

```ts
const allowedExtensions = ALLOWED_UPLOAD_TYPES[mimeType.toLowerCase()];
if (!allowedExtensions) {
  return NextResponse.json(
    { error: "This file type is not supported. Supported types: PDF, Office documents, images, CSV, TXT, ZIP, MP4/MOV video." },
    { status: 400 }
  );
}
const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
if (!allowedExtensions.includes(ext)) {
  return NextResponse.json(
    { error: `File extension ".${ext}" does not match the file type.` },
    { status: 400 }
  );
}
if (name.length > 255) {
  return NextResponse.json({ error: "File name is too long." }, { status: 400 });
}
```

Store the lowercased `mimeType`.

**Step 3 — Verify existing UX.** Find every upload call site (`grep -rn "documents/upload" src/`) — the setup wizard, update editor attachments, and admin company documents. Confirm each surfaces the `error` string from a 400 response to the user (they already handle upload errors; just confirm). Manually upload a PDF and a PNG on the live deploy after shipping; then rename `evil.html` to keep its `text/html` MIME and confirm rejection.

> Out of scope (noted for the roadmap): file-size caps require the client to send the size and the presigned PUT to sign `ContentLength`. Worth doing later; skipped here to keep client changes zero.

#### WS1.3 Validate the share-link email gate

File: `src/app/api/share/[token]/view/route.ts`. Replace the string check:

```ts
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same pattern as signup
if (
  !email ||
  typeof email !== "string" ||
  email.length > 254 ||
  !emailRegex.test(email.trim())
) {
  return NextResponse.json(
    { error: "Please enter a valid email address." },
    { status: 400 }
  );
}
```

Then check `src/app/share/[token]/page.tsx`: find the email-gate form submit handler. If it doesn't already show the server `error` on a non-OK response, add an inline error message under the input (reuse the page's existing error styling). Investors with real emails see zero difference; the localStorage silent re-track path is untouched.

#### WS1.4 Audit log for admin actions

**Step 1 — Schema.** Append to `prisma/schema.prisma`, then `db push`:

```prisma
// ─── Audit Log ────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  actorEmail String
  action     String   // e.g. "USER_APPROVED"
  targetType String?  // e.g. "User", "Company"
  targetId   String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([createdAt])
  @@map("audit_logs")
}
```

(No relation to `User` — keep log rows immutable and decoupled from user deletion.)

**Step 2 — Helper.** New file `src/lib/audit.ts`:

```ts
import { db } from "@/lib/db";

/**
 * Record an admin action. Never throws — audit logging must not
 * break the action being logged.
 */
export async function logAdminAction(
  actor: { id?: string; email?: string | null },
  action: string,
  opts: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> } = {}
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? "unknown",
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        metadata: opts.metadata as any,
      },
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}
```

**Step 3 — Instrument.** Rule: **every mutating handler (POST/PATCH/PUT/DELETE) that calls `requireAdmin()`** gets one `await logAdminAction(user!, ...)` immediately after the mutation succeeds. Find them all with `grep -rln "requireAdmin" src/app/api/`. The list as of this review, with action names:

| Route | Action(s) |
|---|---|
| `api/admin/approvals/[id]/approve` | `USER_APPROVED` (targetType `User`) |
| `api/admin/approvals/[id]/reject` | `USER_REJECTED` |
| `api/admin/users` POST / `api/admin/users/[id]` PATCH, DELETE | `USER_CREATED` / `USER_UPDATED` / `USER_DELETED` |
| `api/admin/companies` POST | `COMPANY_CREATED` (targetType `Company`) |
| `api/admin/companies/import` POST | `COMPANIES_IMPORTED` (metadata: `{ count }`) |
| `api/admin/providers/[id]` PATCH/DELETE | `PROVIDER_UPDATED` / `PROVIDER_DELETED` (include status change in metadata) |
| `api/admin/providers/categories` POST | `PROVIDER_CATEGORY_CREATED` |
| `api/admin/digest/[id]/send` POST | `DIGEST_SENT` (metadata: recipient count) |
| `api/admin/digest-recipients` POST / `[id]` DELETE | `DIGEST_RECIPIENT_ADDED` / `_REMOVED` |
| `api/admin/test-email` POST | `TEST_EMAIL_SENT` |
| `api/companies/[id]/remind` POST | `MANUAL_REMINDER_SENT` |
| `api/sectors/[id]` PATCH/DELETE *(admin-gated — verify, then log)* | `SECTOR_RENAMED` / `SECTOR_DELETED` |

If a route the grep finds isn't in this table, log it anyway with a sensible `VERB_NOUN` name. Put the call **after** the DB write succeeds, before the response. Include old→new values in `metadata` where cheap (e.g., provider status).

**Step 4 — Viewer.** New page `src/app/admin/audit/page.tsx` as a **Server Component**, modeled exactly on `src/app/admin/settings/page.tsx` (same auth guard pattern, same layout wrappers): fetch `db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 })` and render a plain table — timestamp, actor email, action, target, metadata (JSON.stringify, truncated). Add a sidebar entry in `src/components/layout/sidebar.tsx` admin nav: `{ label: "Audit Log", href: "/admin/audit", icon: ScrollText }` (import `ScrollText` from `lucide-react`), placed just above Settings.

**WS1 acceptance checklist**
- [ ] 11th signup attempt from one IP within an hour → 429 with friendly message; signup page shows it
- [ ] Normal signup and set-password flows unchanged
- [ ] PDF/PNG/DOCX uploads work everywhere (wizard, update attachments, admin docs); `text/html` rejected with readable error
- [ ] Share gate rejects `asdf`, accepts real emails; existing localStorage re-entry still silent
- [ ] Approving a user creates an `audit_logs` row; `/admin/audit` renders it; founders cannot reach `/admin/audit`
- [ ] All existing API response shapes unchanged (only new 4xx cases added)

**UX impact:** none for legitimate users; abusers get 429s/400s. **Cost impact:** none — one extra Postgres row write per auth attempt and per admin action (negligible volume).

---### WS2 — P0 auth/authz test suite + CI (2 days)

**Goal:** the February middleware bypass class of bug becomes impossible to ship silently. Unit tests with mocked DB — no test database needed, so CI stays free and fast.

#### WS2.1 Install Vitest

```bash
npm install -D vitest
```

New file `vitest.config.ts` at repo root:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

#### WS2.2 Extract the middleware decision into a pure function

The middleware's routing logic is currently inline in `src/middleware.ts` where it can't be tested. Extract it **without changing behavior**.

New file `src/lib/route-access.ts`:

```ts
export interface SessionInfo {
  isLoggedIn: boolean;
  roles: string[];   // e.g. ["ADMIN"], ["FOUNDER"]
  status?: string;   // "PENDING" | "APPROVED" | "REJECTED"
}

export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; to: string };

// "/" must be an exact match: every pathname starts with "/", so a prefix
// match here would make every route public. (This exact bug shipped in
// February and survived until July — see the regression tests.)
const PUBLIC_PREFIXES = ["/login", "/signup", "/set-password", "/api/auth", "/api/dev", "/share"];

export function decideRoute(pathname: string, search: string, s: SessionInfo): RouteDecision {
  const isAdmin = s.roles.includes("ADMIN");
  const isFounder = s.roles.includes("FOUNDER");

  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return { type: "next" };

  if (!s.isLoggedIn) {
    return { type: "redirect", to: `/login?callbackUrl=${encodeURIComponent(pathname + search)}` };
  }

  if (isFounder && !isAdmin && s.status !== "APPROVED" && pathname !== "/setup-wizard") {
    return { type: "redirect", to: "/login" };
  }

  if (pathname.startsWith("/admin") && !isAdmin) {
    return { type: "redirect", to: "/dashboard" };
  }

  if (pathname === "/dashboard" && isAdmin && !isFounder) {
    return { type: "redirect", to: "/admin" };
  }

  return { type: "next" };
}
```

Rewrite `src/middleware.ts` as a thin adapter (careful: the current version builds the callbackUrl with `searchParams.set`, which encodes — the extracted version must produce an equivalent URL; keep the `URL` object in the adapter if simpler):

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { decideRoute } from "@/lib/route-access";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = decideRoute(req.nextUrl.pathname, req.nextUrl.search, {
    isLoggedIn: !!req.auth,
    roles: req.auth?.user?.roles ?? [],
    status: req.auth?.user?.status,
  });
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.png).*)"],
};
```

**Manually verify on the live deploy immediately after this ships** (before writing more tests): logged-out `/dashboard` redirects to login; founder can't reach `/admin`; homepage loads logged-out; `/share/<token>` loads logged-out. This is the one refactor in the plan that touches security-critical behavior — treat it with respect.

#### WS2.3 Tests

Create `src/lib/__tests__/route-access.test.ts`. Cover at minimum (one `it` per line):

- `/` logged-out → next (public)
- **Regression: `/dashboard` logged-out → redirect to `/login?...`** (the February bug: nothing but `/` may be public via the root path)
- **Regression: `/admin` logged-out → redirect** and `/api/admin/dashboard`-style paths are NOT public
- `/login`, `/signup`, `/set-password`, `/api/auth/session`, `/share/abc123` logged-out → next
- Logged-in PENDING founder: `/dashboard` → redirect `/login`; `/setup-wizard` → next
- Approved founder: `/dashboard` → next; `/admin` → redirect `/dashboard`; `/admin/settings` → redirect
- Pure admin: `/admin` → next; `/dashboard` → redirect `/admin`
- Admin+founder: `/dashboard` → next
- callbackUrl preserves path and query string

Create `src/lib/__tests__/auth-guard.test.ts` using `vi.mock`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { userCompanyMembership: { findUnique: vi.fn() } },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin, requireCompanyAccess } from "@/lib/auth-guard";
```

Cases: no session → 401; session but status `PENDING` → 403; role required and missing → 403; happy paths return the user; `requireCompanyAccess`: admin bypasses membership lookup; member passes; non-member → 403. Assert on `error?.status` and `user`.

Create `src/lib/__tests__/rate-limit.test.ts` (mock `db.rateLimitCounter.upsert`): under limit → true; over → false; upsert throws → true (fail-open).

Keep total runtime under a few seconds; no network, no real DB.

#### WS2.4 CI (free)

New file `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

Notes: `npm ci` runs `postinstall` → `prisma generate`, which needs no database. GitHub Actions is free at this repo's scale (fully free if the repo is public). **Deliberately not gating Vercel deploys on tests** — that would change the push-to-deploy workflow; the red ✗ on GitHub is the alarm. (If you later want gating, the one-line change is `"build": "vitest run && next build"` — a product decision, not part of this plan.)

**WS2 acceptance checklist**
- [ ] `npm test` green locally and in Actions
- [ ] Live-deploy spot checks after the middleware refactor (list in WS2.2) all pass
- [ ] Temporarily re-introducing the Feb bug locally (`"/"` in the prefix list) makes the regression test fail

**UX impact:** none (pure refactor + tooling). **Cost impact:** none.

---

### WS3 — P1: Update Templates (2–3 days)

**Goal:** admins write templates (rich-text skeletons with section headers and metric guidance); founders can start a new update from one. Entirely additive — founders who ignore templates see one new optional control only when templates exist.

#### WS3.1 Schema

Append to `prisma/schema.prisma`, then `db push`:

```prisma
// ─── Update Templates ─────────────────────────────────────

model UpdateTemplate {
  id          String    @id @default(cuid())
  name        String
  description String?   // one-line hint shown to founders
  body        String    @db.Text // rich text HTML, same format as Update.body
  createdById String
  archivedAt  DateTime? // soft delete — founders only see active templates
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  createdBy User @relation("CreatedTemplates", fields: [createdById], references: [id])

  @@map("update_templates")
}
```

And add to the `User` model's relation block: `createdTemplates UpdateTemplate[] @relation("CreatedTemplates")`.

#### WS3.2 API routes

`src/app/api/admin/templates/route.ts` — `GET` (list all incl. archived, `requireAdmin`), `POST` (create; validate `name` non-empty ≤120 chars, `body` non-empty). Follow the guard/validate/act pattern.

`src/app/api/admin/templates/[id]/route.ts` — `PATCH` (update name/description/body, or set/clear `archivedAt` via an `archived: boolean` field), `DELETE` (sets `archivedAt`, does not hard-delete). `requireAdmin` on both.

`src/app/api/templates/route.ts` — `GET`, `requireAuth()` (any approved user): returns active templates only (`archivedAt: null`), fields `id, name, description, body`, ordered by name.

Log template create/update/archive via `logAdminAction` (WS1.4): `TEMPLATE_CREATED` / `TEMPLATE_UPDATED` / `TEMPLATE_ARCHIVED`.

#### WS3.3 Admin UI

New page `src/app/admin/templates/page.tsx` (client page — model on `src/app/admin/providers/page.tsx` for list + form patterns):

- List of templates (name, description, updated date, archived badge), "New Template" button.
- Create/edit form: `Input` for name, `Input` for description, `RichEditor` (existing component, same one founders use) for body. Save → POST/PATCH. Archive/unarchive buttons.
- Sidebar: add `{ label: "Templates", href: "/admin/templates", icon: LayoutTemplate }` (from `lucide-react`) to the admin nav, after Companies.

Seed content: after shipping, an admin creates the first template by hand (e.g., sections "Highlights / Lowlights / Metrics commentary / Asks"). No code-side seeding.

#### WS3.4 Founder UI

File: `src/app/updates/new/page.tsx`:

1. On load (alongside existing fetches), fetch `/api/templates`. Store in state.
2. If (and only if) templates exist, render a select above the Title field, using the existing Radix `Select` component styling found elsewhere in the app: placeholder "Start from a template (optional)", options = template names with description as secondary text.
3. On selection: if `body` state is empty (strip tags/whitespace to check), set `setBody(template.body)`. If not empty, `window.confirm("Replace your current draft text with this template?")` before applying. Never touch title/period/metrics.
4. No changes to submit logic, drafts, or edit mode.

**WS3 acceptance checklist**
- [ ] Admin creates/edits/archives a template; audit rows appear
- [ ] Founder with zero templates sees a pixel-identical new-update page
- [ ] Founder picks a template → editor prefills; typing first then picking asks before overwriting
- [ ] Archived templates disappear for founders but stay listed (badged) for admins
- [ ] Founders get 403 from `/api/admin/templates`

**UX impact:** additive only. **Cost impact:** none.

---

### WS4 — P1: Fix the investor entry point (½ day)

**Chosen approach (roadmap offered two):** replace the misleading OAuth button with a static explainer page. Zero cost, zero risk; real investor accounts remain P3.

1. New page `src/app/investors/page.tsx` — a public **Server Component** styled like the homepage (reuse its header/footer structure and `LogoMark`):
   - Heading: "Investor access works through secure links."
   - Body: investors don't need an account — founders and the DFS Lab team share tokenized links by email; if you've received one, open it directly; links may expire, so ask your contact for a fresh one if it doesn't load.
   - Contact line: `const supportEmail = process.env.SUPPORT_EMAIL || "support@dfs.vc";` rendered as a `mailto:` (this string is already public in the rejection email — it leaks nothing new — and introduces the `SUPPORT_EMAIL` env var the P2 fork-config item wants).
   - "Back to home" link.
2. `src/middleware.ts` / `src/lib/route-access.ts`: add `"/investors"` to the public prefixes. **Add a route-access test for it** (logged-out → next).
3. `src/app/page.tsx`: replace `<InvestorLoginButton ... />` with `<Link href="/investors" className="...same classes...">Investor Access</Link>`, and drop the import.
4. Delete `src/components/ui/investor-login-button.tsx` (confirm no other imports: `grep -rn "InvestorLoginButton" src/`).
5. Add `SUPPORT_EMAIL` to `.env.example` and (optionally) to Vercel env.

**Trade-off to be aware of:** admins lose the homepage shortcut into Google OAuth. They keep the admin login section on `/login` (labeled "For @dfs.vc accounts only"), which is their documented path. Investors who previously hit a dead-end Google error now get an explanation — strictly better.

**WS4 acceptance checklist**
- [ ] `/investors` renders logged-out; homepage link goes there; no Google prompt anywhere on the homepage
- [ ] Admin can still sign in via `/login`
- [ ] Route-access test covers `/investors`

**UX impact:** strictly improved for investors; one extra click for admins landing on the homepage. **Cost impact:** none.

---

### WS5 — P1: Investor-engagement signal on the founder dashboard (1 day)

**Goal:** surface existing `ShareableLinkView` data on `/dashboard`. Read-only, additive.

#### WS5.1 API

New file `src/app/api/companies/[id]/engagement/route.ts`:

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;

    const where = { link: { companies: { some: { companyId } } } };
    const [totalViews, recentViews] = await Promise.all([
      db.shareableLinkView.count({ where }),
      db.shareableLinkView.findMany({
        where,
        orderBy: { viewedAt: "desc" },
        take: 5,
        select: {
          id: true,
          email: true,
          viewedAt: true,
          link: { select: { label: true } },
        },
      }),
    ]);

    return NextResponse.json({ totalViews, recentViews });
  } catch (err) {
    console.error("GET /api/companies/[id]/engagement error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

(No masking of viewer emails: founders already see full emails in the `/links` view log, so this reveals nothing new.)

#### WS5.2 Dashboard UI

File: `src/app/dashboard/page.tsx`:

1. Fetch `/api/companies/${selectedCompany.id}/engagement` alongside the updates fetch; store `{ totalViews, recentViews }` in state. Non-OK response → treat as zero views (never block the dashboard on this call).
2. Add a fourth summary card "Investor Views" (icon: `Eye` from `lucide-react`): big number = `totalViews`, subtitle = `recentViews[0]` ? `Last viewed ${formatDate(...)}` : "No views yet". Change the grid from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4` so nothing squeezes on tablet widths.
3. Below "Recent Updates", add a "Recent Investor Activity" section: if `recentViews` is empty, an `EmptyState` ("No investor views yet — create a link on the Investor Links page to share your updates" with a link to `/links`); otherwise a compact list — email, link label (fallback "Investor link"), `viewedAt` formatted.

**WS5 acceptance checklist**
- [ ] Founder with views sees correct count + recent list; founder with none sees the empty state
- [ ] Opening a share link and passing the email gate increments the dashboard count on refresh
- [ ] Founder A cannot fetch company B's engagement (403 — covered by `requireCompanyAccess`)
- [ ] Dashboard still renders normally if the engagement fetch fails

**UX impact:** additive; the 3→4 card grid is the only visual change to an existing element. **Cost impact:** none.

---

## Part 3 — P2/P3 Recommendations (no detailed plans)

Suggestions only; each fits the no-new-cost constraint when its time comes:

- **Fork Configuration (P2)** — WS4 already introduces `SUPPORT_EMAIL`. The remaining envs (`ADMIN_EMAIL_DOMAIN`, `ORG_NAME`, `LOGO_PATH`) are mechanical replacements; do them in one sweep with a grep-driven checklist (`dfs.vc`, `DFS Lab`, logo path). Homepage copy ("DFS Lab gets notified…") should join that sweep.
- **Bulk LP Report Link (P2)** — extend `ShareableLink` with an `allCompanies Boolean @default(false)` rather than materializing every company row; the share endpoint already fans out per company.
- **Scheduled Publishing (P2)** — piggyback on the existing daily cron (add a `publishAt DateTime?` to `Update`); no new infrastructure. Note the cron currently runs once daily at 09:00 UTC — acceptable granularity for "publish tomorrow", not for "publish at 3pm"; adding a second cron schedule on the same route is still free.
- **Rule-based metric alerts (P2)** — same cron, plain arithmetic, email via existing templates. Design the rule storage (per-company thresholds) before coding.
- **Metrics on pinned share links (decision F7)** — resolve before building Bulk LP links, since those will inherit the same metric-scoping semantics.
- **Update Versioning (P3)** — the `CompanyNoteRevision` pattern already in the schema is the template; pairs naturally with the WS1.4 audit log.
- **AI re-introduction (P3)** — when it returns, use the already-installed Anthropic SDK and the digest-drafting pattern; don't reintroduce a second AI vendor (`openai` was removed in WS0 — keep it that way, and note the P3 line in ROADMAP.md still says "cleaner implementation than the removed OpenAI RAG version", which leaves vendor choice open; Claude-only keeps one cost line).

**Rough effort:** WS0 ½d · WS1 2–3d · WS2 2d · WS3 2–3d · WS4 ½d · WS5 1d → **~8–10 junior-engineer days** total for P0+P1.

## Roadmap bookkeeping

As each workstream ships, move the corresponding item in `ROADMAP.md` from the Roadmap tables into "Existing Features" (per that file's own convention), and add F1 (cron fix) to the changelog/commit message so the "Update Reminders" feature claim becomes true.

---

# Part 4 — Follow-up Batch: WS6–WS8

_Added 2026-07-03 (afternoon), after WS0–WS5 shipped. From a product review of three issues raised by the team. Same constraints as Parts 1–3: **no new cost lines**, **no UX regressions**. All product decisions below were confirmed with the team on 2026-07-03._

## Part 4 review findings

**F8 — Provider vetting is vestigial (MEDIUM, drift between product claim and code).**
The roadmap and the admin UI both present a founder-submits → admin-vets flow, but the code short-circuits it twice:

1. `POST /api/providers` (`src/app/api/providers/route.ts:84-96`) creates every founder submission as `PENDING`, then immediately creates the submitter's own endorsement and promotes the provider to `VETTED`. Every submission is therefore instantly vetted by its own author.
2. `POST /api/providers/[id]/endorse` (`src/app/api/providers/[id]/endorse/route.ts:33-36`) promotes any `PENDING` provider to `VETTED` on any endorsement.

Net effect: the admin "Pending Review" queue can never receive anything through the normal flow, and the "Vetted" badge means "someone (possibly the submitter themselves) wrote an endorsement note," not "reviewed by DFS Lab." → Fixed in WS7.

**F9 — Admins have no add-provider path (LOW, missing UI + endpoint).**
Technically an admin *can* call the founder submission endpoint (it's `requireAuth`, not founder-scoped), but it forces an "experience note" endorsement from them and labels them as the submitter/endorser — semantically wrong for an admin curating the directory. There is no "Add Provider" button on `/admin/providers`; admins can only edit/vet/delete what founders submit. → Fixed in WS7.

**F10 — Homepage nav still audience-splits the login (LOW, copy/IA).**
After WS4 the nav reads "Founder Login" + "Investor Access." Since investors never log in and `/login` already serves both founders and DFS Lab admins (neutral "Welcome back" heading, credentials form, "DFS Lab team?" Google section — verified, no changes needed there), the split labels overpromise. → Fixed in WS6.

**F11 — No cross-portfolio updates view (feature gap).**
Admins can only read updates company-by-company via each company detail page. `GET /api/admin/updates` already returns all published updates portfolio-wide (id, title, period, sentAt, company) — it currently powers the admin link builder — but no page renders it as a browsable feed. → Built in WS8.

### Decisions taken (confirmed with the team, 2026-07-03)

| # | Decision |
|---|---|
| D1 | Homepage nav collapses to a single **"Log in"** CTA → `/login`. The `/investors` page **stays live**, linked from the homepage **footer** ("Investor access"). |
| D2 | Admins get a direct **Add Provider** flow; admin-created providers default to **VETTED** (the form's status selector stays visible, so an admin can park one as pending if they want). |
| D3 | **Real vetting restored, admin-only**: founder submissions land as `PENDING`; endorsements (self or peer) **never** change status; only admins promote/reject. Endorsements become pure testimonials. |
| D4 | The all-updates page is **admin-only** and shows **published updates only** (drafts stay private to founders until published). |

**Judgment call (flagged, not asked):** pending submissions remain **visible** in the founder directory's existing "community" tier (badged, filterable — that tier is already designed and shipped). Restoring vetting changes what the *Vetted* badge means, not who can see the listing. If the team would rather hide pending entries from other founders until vetted, that is a one-line filter change in `GET /api/providers` (default `status` filter from `{ not: "REJECTED" }` to `VETTED`-plus-own-pending) — decide before or after WS7 ships; the rest of the workstream is unaffected.

---

## WS6 — Single login CTA on the homepage (¼–½ day)

**Goal:** one honest login entry point. No changes to `/login` (already dual-audience) or `/investors` (already public with a back-home link).

1. `src/app/page.tsx` — in the nav header (the `div` holding the two links), replace both the "Founder Login" `Link` and the "Investor Access" `Link` with a single:
   ```tsx
   <Link href="/login" className="hover:text-foreground transition-colors">
     Log in
   </Link>
   ```
2. Same file — footer: the current footer is a single `© {year} DFS Lab` line. Make it a flex row keeping the © text and adding a muted link:
   ```tsx
   <footer className="flex items-center justify-center gap-4 border-t px-6 py-5 text-center text-xs text-muted-foreground">
     <span>© {new Date().getFullYear()} DFS Lab</span>
     <span aria-hidden>·</span>
     <Link href="/investors" className="hover:text-foreground transition-colors">
       Investor access
     </Link>
   </footer>
   ```
3. No route-access changes (`/investors` is already in `PUBLIC_PREFIXES`, covered by an existing test). No middleware changes.
4. Run `npm run typecheck && npm run lint && npm test`, push, verify live.

**WS6 acceptance checklist**
- [ ] Homepage nav shows exactly one login link ("Log in") → `/login`
- [ ] Footer shows the "Investor access" link → `/investors`; page still renders logged-out
- [ ] `/login` unchanged: founder credentials form + "DFS Lab team?" Google section both work
- [ ] Logged-in visit to `/` still auto-redirects to `/dashboard` or `/admin`

**UX impact:** founders/admins get a clearer single entry (label change only — the destination is the page both audiences already use). Investors keep a discoverable path via the footer. **Cost impact:** none.

---

## WS7 — Admin provider management + real vetting (1–1.5 days) — SHIPPED 2026-07-03

Two halves; ship as two commits in this order (7.1 is purely additive; 7.2 changes flow semantics).

### WS7.1 Admin "Add Provider"

**Step 1 — Endpoint.** New file `src/app/api/admin/providers/route.ts` (only `[id]/` and `categories/` exist under that directory today):

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!body.categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });

  const category = await db.serviceCategory.findUnique({ where: { id: body.categoryId } });
  if (!category) return NextResponse.json({ error: "Invalid category" }, { status: 400 });

  // schema has @@unique([name, categoryId]) — check first so the user gets a 409, not a 500
  const existing = await db.serviceProvider.findUnique({
    where: { name_categoryId: { name: body.name.trim(), categoryId: body.categoryId } },
  });
  if (existing) return NextResponse.json({ error: "A provider with that name already exists in this category" }, { status: 409 });

  const validStatuses = ["PENDING", "VETTED", "REJECTED"] as const;
  const status = validStatuses.includes(body.status) ? body.status : "VETTED";

  const provider = await db.serviceProvider.create({
    data: {
      type: body.type === "INDIVIDUAL" ? "INDIVIDUAL" : "FIRM",
      name: body.name.trim(),
      website: body.website?.trim() || null,
      linkedin: body.linkedin?.trim() || null,
      categoryId: body.categoryId,
      description: body.description?.trim() || null,
      contactEmail: body.contactEmail?.trim() || null,
      country: body.country?.trim() || null,
      city: body.city?.trim() || null,
      status,                       // D2: defaults to VETTED for admin-created entries
      submittedById: user!.id,      // provenance: "Submitted by <admin name>" renders honestly
    },
    include: {
      category: { select: { id: true, name: true } },
      endorsements: { select: { id: true, userId: true, note: true, createdAt: true, user: { select: { id: true, name: true } } } },
    },
  });

  await logAdminAction(user!, "PROVIDER_CREATED", { targetType: "ServiceProvider", targetId: provider.id, metadata: { name: provider.name, status } });
  return NextResponse.json(provider, { status: 201 });
}
```

**Step 2 — UI.** `src/app/admin/providers/page.tsx`: follow the exact pattern `src/app/admin/templates/page.tsx` used — widen `editTarget` from `Provider | null` to `Provider | "new" | null`:

- Add an **"Add Provider"** primary button next to "Add Category" in the `PageHeader` `action` (wrap both in a flex `div`).
- `openNew()` sets `editTarget = "new"` and seeds `editForm` with defaults: `{ type: "FIRM", status: "VETTED", categoryId: categories[0]?.id ?? "" }`.
- In `handleSaveEdit`, branch: `editTarget === "new"` → `POST /api/admin/providers`, else the existing `PATCH`. Surface the endpoint's `error` string on failure (409 duplicate included).
- Modal title: `"Add Provider"` in new mode. The existing edit form already has every field including the status selector — no new form fields needed.

### WS7.2 Restore real vetting (D3)

**Step 1 —** `src/app/api/providers/route.ts` (`POST`): delete the auto-promote block — the `db.serviceProvider.update({ ..., data: { status: "VETTED" } })` call and the "this also promotes to VETTED" comment (lines ~89-96). **Keep** the endorsement creation itself (the submitter's experience note remains a testimonial on the listing). Submissions now stay `PENDING`.

**Step 2 —** `src/app/api/providers/[id]/endorse/route.ts` (`POST`): delete the promotion block (lines ~33-36, `if (provider.status === "PENDING") { ...update to VETTED }`) and its comment. Endorsements no longer change status for anyone.

**Step 3 — Founder-facing copy.** `src/app/providers/page.tsx`:
- The endorse-modal title currently branches to `"Endorse & verify this provider"` for `PENDING` providers (line ~354) — drop the branch; it's always `"Endorse this provider"` (keep the existing your-endorsement update variant). Remove/adjust the pending-specific helper copy near line ~359 that implies endorsing verifies.
- In the submit-provider modal, add one expectation-setting line under the form (muted, small): *"New submissions appear in the community tier and are marked Vetted once reviewed by the DFS Lab team."*
- Everything else stays: the All/Vetted/Pending filter, the "community" count label, and the pending `StatusBadge` are already built for exactly this state.

**Step 4 — No data migration.** Every existing provider was auto-promoted at creation, so there are no live `PENDING` rows to reconcile; the queue simply starts filling with new submissions. Admin vet/reject actions are already audit-logged via `PROVIDER_UPDATED` (statusFrom/statusTo metadata, WS1.4).

**WS7 acceptance checklist**
- [ ] Admin: "Add Provider" creates a VETTED entry (visible in founder directory immediately); audit row `PROVIDER_CREATED` appears; duplicate name+category → readable 409 message
- [ ] Founder: new submission lands `PENDING`, visible in the community tier with a pending badge, and shows up in the admin "Pending Review" queue
- [ ] Endorsing a pending provider (as a different founder) adds the testimonial but does **not** change its status
- [ ] Admin approve from the queue → provider moves to Vetted; reject → hidden from founder default view (existing behavior)
- [ ] No "verify" language remains in founder-facing endorse copy
- [ ] Founders still get 401/403 from `POST /api/admin/providers`

**UX impact:** founders' submissions stay immediately visible (community tier) — only the instant "Vetted" badge changes, which is the point. Admins gain add capability. **Cost impact:** none.

---

## WS8 — Cross-portfolio updates page for admins (1 day) — SHIPPED 2026-07-03

**Goal:** `/admin/updates` — one browsable, filterable feed of all published updates (D4: admin-only, published-only). Portfolio scale is small (tens of companies, hundreds of updates), so fetch once and filter/sort client-side — **no pagination, no API redesign**.

**Step 1 — Endpoint (additive only).** `src/app/api/admin/updates/route.ts` is consumed by the admin link builder (`/admin/links`), so its response shape must not lose fields. Add one field to the `select`: `createdBy: { select: { name: true } }` (who published it). Adding is safe; the link builder ignores unknown fields.

**Step 2 — Page.** New file `src/app/admin/updates/page.tsx`, client page modeled on `src/app/admin/providers/page.tsx` (fetch-once + client filters):

- Fetch `GET /api/admin/updates` on mount.
- Controls row: a search `Input` (matches against `title` and `company.name`, case-insensitive), a company `<select>` (options derived from the distinct companies in the response, "All companies" default), and a sort `<select>`: **Newest first** (default, by `sentAt` desc) / Oldest first / Company A–Z (then newest within a company).
- Result count line (e.g., "42 updates · 12 companies") that reflects active filters.
- Rows: one `Card` per update — title, company name, `formatPeriod(period)`, `formatDate(sentAt)`, author name if present — the whole row a `Link` to `/updates/${id}` (admins pass `requireCompanyAccess` via the admin bypass; verified the update-detail API guards allow this).
- `EmptyState` for zero results ("No published updates match your filters") and for a genuinely empty portfolio.

**Step 3 — Sidebar.** `src/components/layout/sidebar.tsx`: insert `{ label: "Updates", href: "/admin/updates", icon: FileText }` into `adminNav` directly after Companies (`FileText` is already imported for the founder nav).

**Step 4 —** `npm run typecheck && npm run lint && npm test && npm run build`, push, verify live.

**WS8 acceptance checklist**
- [ ] `/admin/updates` lists all published updates newest-first; drafts never appear
- [ ] Search, company filter, and all three sorts work and combine; count line updates
- [ ] Clicking a row opens the update detail as an admin
- [ ] Founders hitting `/admin/updates` are redirected to `/dashboard` (existing middleware `/admin` gating — no new rules needed)
- [ ] `/admin/links` link builder still works (response shape unchanged, one field added)

**UX impact:** purely additive (one new sidebar entry, one new page). **Cost impact:** none — reuses the existing endpoint, no new queries at scale.

---

## Part 4 sequencing & effort

WS6 → WS7 → WS8 (independent of each other, so any order works; this one puts the smallest, most visible fix first). Same ground rules as Part 2: one workstream per commit-and-verify cycle on the live deploy, `typecheck && lint && test` before every push. No schema changes anywhere in this batch — no `db push` needed.

**Rough effort:** WS6 ¼–½d · WS7 1–1.5d · WS8 1d → **~2.5–3 junior-engineer days.**

## Part 4 roadmap bookkeeping

`ROADMAP.md` has been annotated with F8 (the vestigial-vetting drift) on the Service Provider Directory feature claim, and a "Next up" section pointing at WS6–WS8. As each workstream ships, fold it into "Existing Features" per the file's convention — in particular, the homepage description (currently "Founder Login and Investor Access are small nav-bar links") must be rewritten when WS6 lands.

---

# Part 5 — P2 Batch: WS9–WS12 (Comment Threading deferred)

_Added 2026-07-06, after WS0–WS8 shipped and verified. Scope: the P2 tier of `ROADMAP.md` ("Leverage — next quarter"). Same hard constraints as Parts 1–4: **no new cost lines** (existing Vercel/Neon/S3/Resend/Anthropic stack + free tooling only), **no UX regressions** (every change additive or invisible), **additive-only schema changes**._

**Every claim below was re-verified against the code on 2026-07-06** — file paths and line numbers cite the current working tree.

## Part 5 ground rules (carry-over + additions)

All Part 2 ground rules still apply verbatim (schema-push procedure, code-style matching, `force-dynamic`, never change existing response shapes, quality gates before every push). Additions for this batch:

1. **Quality gate before every push:** `npm run typecheck && npm run lint && npm test`. One workstream per commit-and-verify cycle on the live deploy (`molly.dfslab.net`) — there is no staging.
2. **Schema pushes in this batch** (all additive — new table, new nullable/defaulted columns): WS10 (new `metric_alerts` table), WS11 (`Update.scheduledFor` column), WS12 Option B (`ShareableLink.metricScope` column). Push the schema before pushing the code that uses it, per the Part 2 procedure.
3. **Resend prerequisite:** the production `RESEND_API_KEY` was returning 401 as of 2026-07-02 and rotation is unconfirmed. **Before starting WS10 or WS11, verify email works** via `/admin/settings` → "Send Test Email". WS10 v1 deliberately sends no email (dashboard-only), and WS11's publish email is best-effort (never blocks the publish), so neither workstream is *blocked* by the key — but their acceptance checklists include email checks that can only pass after rotation. See F12 for why the broken key is worse than "emails just don't arrive."
4. **Cron facts (verified against Vercel docs, 2026-07):** every plan now allows up to 100 cron jobs per project, so adding cron entries is free and unconstrained. The frequency limit is what matters: **Hobby = once per day max, with invocation anywhere within the scheduled hour; Pro = per-minute precision.** This batch designs everything around daily crons so it works on any plan; only decision Q3's rejected option needs Pro.

## Part 5 review findings

Continuing the F-numbering from Part 4 (F1–F11):

**F12 — Reminder cron burns its cooldown even when every email fails (MEDIUM, live impact today).**
`src/app/api/cron/reminders/route.ts:75-99`: each `sendUpdateReminderEmail` call is wrapped in its own try/catch, and then `lastReminderSentAt` is set and `sent++` counted **unconditionally**. With the currently-invalid Resend key, every "sent" reminder since the WS0/WS2 cron fixes has actually been a 401 swallowed by the catch — and the cooldown still advanced, so founders won't be retried for a full frequency window. The roadmap's "Update Reminders … verified live" claim is true of the cron *mechanics* but currently false of *delivery*. Fix in WS10.1 (one-commit change: only update the cooldown / count `sent` when at least one email for that company succeeded). Rotating the Resend key is still the real fix for delivery.

**F13 — `POST /api/updates/[id]/send` is a dead publish endpoint that skips the team email (LOW, drift trap).**
`src/app/api/updates/[id]/send/route.ts` flips DRAFT→SENT and sets `sentAt`, but sends **no** `sendUpdatePublishedEmail` — unlike both real publish paths (`POST /api/companies/[id]/updates` with status SENT, and `PATCH /api/updates/[id]`, which both email the team). Grep confirms no client code calls it (`grep -rn "/send" src/` outside `api/` finds nothing; the update pages publish via PATCH). It's a session-guarded zombie that would silently under-notify if anything ever adopted it. WS11 removes it while touching the publish paths (flagged judgment call — see WS11.6).

**F14 — The fork-config hardcode list in ROADMAP.md is a large undercount (LOW, docs drift).**
The roadmap names three spots (`auth.ts`, `layout.tsx` title, `email.ts` logo). The actual sweep (`grep -rn "dfs\.vc\|DFS Lab" src/`) finds **~25 occurrences across 12 files**, including client components that can't read plain server env vars: `login/page.tsx` (3: OAuth error copy, "DFS Lab team?" divider, "For @dfs.vc accounts only"), `signup/page.tsx:67`, `providers/page.tsx:344`, `updates/new/page.tsx` (2), `updates/[id]/page.tsx` (2), `share/[token]/page.tsx` (2), plus server-side `page.tsx` homepage (3), `investors/page.tsx` (2), `layout.tsx:29`, `email.ts` (7 — incl. the hardcoded `support@dfs.vc` mailto in the rejection template at line 162, twice in one line), the Claude prompt in `api/admin/digest/generate/route.ts` (3), and `api/dev/bootstrap/route.ts:16`. Also trivial: `.env.example` defaults say `@dfslab.net` while the code defaults say `@dfs.vc`. WS9 covers the full sweep; ROADMAP.md annotated.

**F7 restatus (still open, now load-bearing):** re-verified in `src/app/api/share/[token]/route.ts:91-93` — explicit-update ("pinned") links apply an **empty metric date filter**, so investors always see the latest all-time value of every metric. Every link created since the share-link redesign takes this path (the founder/admin builders only create explicit-update links, and `periodStart/periodEnd` are auto-derived from the selected updates' `sentAt` range at `api/links/route.ts:74-76` — so the period data needed for scoping already exists on every new-style link row). This is decision **Q1** below and gates WS12.

**F15 — `/api/share/[token]` (and `/view`) were middleware-gated, breaking every investor link end-to-end (HIGH, found live 2026-07-06 during WS12 verification, not in the original plan).**
`/share/[token]/page.tsx` fetches its data client-side from `/api/share/${token}` in a `useEffect` (line 91) — a plain unauthenticated `fetch()`, since investors have no accounts. `src/lib/route-access.ts`'s `PUBLIC_PREFIXES` listed `/share` (the page) but not `/api/share` (the data API it depends on), so that fetch was 307-redirected to `/login` for every request with no session — i.e. every real investor. The share page itself would render (its own route is public) but perpetually show nothing, since its one data call always failed. Confirmed live via `curl https://molly.dfslab.net/api/share/<any-token>` → `307` to `/login`, both before and independent of any WS12 change (WS12 only edited the metric-filter logic inside the route handler, which the request never reached). No links existed in the production database to have surfaced this via a bug report. Same root-cause shape as the `/api/cron` (F1/WS0) and `/brand` (2026-07-06) gaps already fixed the same way. **Fixed same-day**: added `/api/share` to `PUBLIC_PREFIXES`, plus a regression test in `route-access.test.ts` — the route needs no session-based gate since the link's own token is its authorization, exactly like `/share` itself.

**F16 — inline update-body images break outside an authenticated browser session (MEDIUM, found 2026-07-07 during the post-batch no-session-surface audit; open, needs a product decision).**
The RichEditor inserts inline images as `<img src="/api/documents/[id]/view">`. That route is (correctly) gated by `requireCompanyAccess` — it was the subject of the June documents-IDOR fix — so the images only resolve for a logged-in user with access to the company. Two surfaces render update bodies outside that condition: (1) the investor share page (`share/[token]/page.tsx` renders `update.body` via `dangerouslySetInnerHTML`) — a sessionless investor gets a broken image; (2) the update-published team email (`email.ts` embeds `${opts.body}`) — email clients can't resolve the relative URL at all, and couldn't pass auth even if they could. **Do NOT fix by adding `/api/documents` to `PUBLIC_PREFIXES` — that reopens the June IDOR.** Candidate fixes considered: (a) share API rewrites body image URLs to short-lived presigned S3 URLs at fetch time (fixes investors; emails still broken); (b) a token-scoped proxy route `/api/share/[token]/doc/[docId]` that validates the document belongs to a company covered by the link (fixes investors, cleaner); (c) email-side: rewrite to presigned URLs at send time (expiry tension: S3 presign default is 1hr, emails live longer) or strip inline images from email bodies.

**Decided 2026-07-07 (user): option (b), shipped same day.** `GET /api/share/[token]/doc/[docId]` (already covered by the `/api/share` public prefix from F15) authorizes by link token with the same expiry rule as the main share endpoint, then requires the document to be non-internal AND belong to a company covered by the link — every rejection is a 404 so document existence never leaks. The share API rewrites `/api/documents/[id]/view` URLs in update bodies to the proxy via `rewriteDocumentUrls()` (`src/lib/share-docs.ts`, pure, unit-tested). **The email half of F16 remains a known limitation**: inline images in the update-published team email still don't render (relative URLs + auth). Option (c) was not chosen; revisit if it ever matters — the team reads updates in-app anyway.

## Open product decisions (answer before or during the batch)

> **All decided 2026-07-06 (user review): every recommendation accepted as-is.**
> Q1 = **B** (additive `metricScope`, default `ALL_TIME`) · Q2 = **snapshot** · Q3 = **date-only** · Q4 = **admin-only, fixed env-tunable thresholds, no email in v1** · Q4b = **B** (±20% either direction, neutral wording) · Q5 = **defer Comment Threading (WS13 out of batch)**.
> Consequently WS12 is un-gated and joins the batch at full scope (~1.5d): batch = WS9 → WS10 → WS11 → WS12.

Per protocol these are the user's calls; each comes with a recommendation. Q1/Q2 gate WS12 only — WS9–WS11 can start immediately.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q1** (= F7) | What metric values should a **bulk LP link** show — and should link creators be able to scope metrics to the shared period? | **A.** Keep current semantics everywhere (latest all-time values; zero schema change). **B.** Add an additive `metricScope` field on `ShareableLink` (default `ALL_TIME` = today's behavior for every existing link); the admin bulk builder can set `PERIOD` to scope the metric summary to the link's period. **C.** Change pinned-link metric semantics globally to period-scoped. | **B.** A ships a Q2-period LP report showing July numbers — confusing in an LP meeting. C silently changes what existing recipients see (UX-regression violation). B is additive, opt-in, and existing links render byte-identically. |
| **Q2** | Bulk link model: **snapshot** (one-click select-all-published-updates-in-a-date-range in the admin builder; link pins exactly those updates) or **evergreen** (an `allCompanies` flag that auto-includes future updates/companies)? | Snapshot / Evergreen / both | **Snapshot.** Matches the roadmap wording ("a single link covering the full portfolio **for a period**") and the LP-meeting use case; reuses `POST /api/links` unchanged; an evergreen link that silently grows after the LP meeting is a liability, and can layer on later without conflict. |
| **Q3** | Scheduled publishing granularity: **date-only** (publishes the morning of the chosen date, daily cron, works on any Vercel plan) or **date+time** (needs an hourly/minutely cron → Pro plan required, and Hobby's within-the-hour jitter makes even "9am" imprecise)? | Date-only / date+time | **Date-only.** Honest about what a daily cron delivers, plan-independent, and solves the actual roadmap problem ("removes last-minute quarter-end scramble"). Upgrading to time-of-day later is purely additive (tighten the cron schedule + swap the date input for datetime). |
| **Q4** | Metric alerts audience & config: admin-only or founder-visible? Fixed global thresholds or per-company/per-metric config UI? | Admin-only + fixed global / founder-visible / per-company config | **Admin-only, fixed global thresholds (env-tunable), no email in v1.** Alerts are a portfolio-triage tool; founder-visible "your MRR dropped" banners feel punitive and need product care. Per-metric threshold config is a later layer once the fixed rules prove out. Dashboard-only also sidesteps the Resend outage. |
| **Q4b** | "MRR dropped 20%" is direction-blind for lower-is-better metrics (churn, burn): drop-only alerts will also fire when churn *improves* is not the issue — the issue is a churn *increase* fires nothing, and a churn *decrease* fires a false "drop" alert. | **A.** Drop-only (roadmap wording, accept false positives on inverted metrics). **B.** Fire on ±X% change either direction, neutrally worded ("changed −34%"). | **B.** Same arithmetic, neutral phrasing ("MRR changed −34% (12,000 → 7,900)") is never *wrong*, only occasionally uninteresting — admins dismiss those. Direction metadata per metric is the later fix. |
| **Q5** | Comment Threading: include in this batch or defer? | Include last / defer | **Defer** — see "WS13 (deferred)" at the end for the full justification and a future sketch. |

---

## WS9 — Fork Configuration (1 day) — SHIPPED 2026-07-06

**Goal:** a fork can change its org name, admin OAuth domain, email logo, and support contact **with env vars only** — no source edits. With no env vars set, production output stays byte-identical (defaults = current hardcoded values). This is the stated blocker for Molly's open-source purpose; nothing else in the batch depends on it, but it ships first because it's the smallest and unblocks external adopters.

**Confirmed decisions:** none needed — pure mechanical sweep. One technical judgment call, flagged: **use `NEXT_PUBLIC_`-prefixed vars for values needed in client components** (org name, admin domain — both already public information: they're rendered on the public login page today). `NEXT_PUBLIC_` vars are inlined at build time, readable from both server and client code, which lets one var serve `auth.ts` (server) and `login/page.tsx` (client). Caveat to document: changing them requires a redeploy, not just an env edit. Cheap reversal: they're ordinary env reads; switching to server-passed props later is mechanical.

**Schema changes: none.**

### WS9.1 Central org module

New file `src/lib/org.ts`:

```ts
// Fork-facing configuration. All values have DFS Lab defaults so an
// unconfigured deploy behaves exactly as before.
// NEXT_PUBLIC_ vars are inlined at BUILD time — changing them requires a redeploy.

/** Organization display name, used in UI copy, page titles, and emails. */
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || "DFS Lab";

/** Email domain granted admin access via Google OAuth (no leading "@"). */
export const ADMIN_EMAIL_DOMAIN = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || "dfs.vc"
).replace(/^@/, "");
```

Server-only values stay as plain env vars where they already live: `SUPPORT_EMAIL` (exists), `EMAIL_FROM` / `TEAM_EMAIL` (exist), and a new `EMAIL_LOGO_PATH` read inside `email.ts` (WS9.3).

### WS9.2 Auth domain check

`src/lib/auth.ts:47` — replace `if (!email || !email.endsWith("@dfs.vc")) return false;` with:

```ts
import { ADMIN_EMAIL_DOMAIN } from "@/lib/org";
// ...
if (!email || !email.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) return false;
```

Also `src/app/api/dev/bootstrap/route.ts:16`: `` const DEV_ADMIN_EMAIL = `admin@${ADMIN_EMAIL_DOMAIN}`; `` (dev-only nicety so fork devs get a working bootstrap admin).

### WS9.3 Email templates (`src/lib/email.ts`)

1. Top of file, alongside `FROM`/`TEAM_EMAIL`:
   ```ts
   import { ORG_NAME } from "@/lib/org";
   const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@dfs.vc";
   const EMAIL_LOGO_PATH = process.env.EMAIL_LOGO_PATH || "/brand/dfs-logo-primary.png";
   ```
2. Line 64 (header): `src="${BASE_URL}${EMAIL_LOGO_PATH}"` and `alt="${ORG_NAME}"`. Keep the fixed width/height attrs — document in `.env.example` that a fork's logo should be ~54×22 or it will letterbox.
3. Replace every literal "DFS Lab" with `${ORG_NAME}`: footer line 80, approval template line 140, rejection sign-off line 163, reminder templates lines 265 and 270.
4. Rejection template line 162: both the `mailto:` href and the visible text currently hardcode `support@dfs.vc` — replace both with `${SUPPORT_EMAIL}` (this wires up the already-existing env var, closing the roadmap's explicit sub-item).
5. `src/app/investors/page.tsx:6` already reads `SUPPORT_EMAIL` — leave it, but replace its two "DFS Lab" copy occurrences (lines 39, 59) with `{ORG_NAME}`.

### WS9.4 Server-component copy

- `src/app/layout.tsx:29`: `` title: `Molly — ${ORG_NAME} Portfolio Platform` `` (module-level metadata reads env at build — fine).
- `src/app/page.tsx` lines 10, 57, 98: feature-card copy ("… ${ORG_NAME} gets notified automatically."), hero eyebrow, © footer.
- `src/app/api/admin/digest/generate/route.ts` lines 125, 128, 171: the Claude prompt ("You are generating the ${ORG_NAME} weekly digest…"), the title format instruction, and the fallback title.

### WS9.5 Client-component copy

Import `ORG_NAME` / `ADMIN_EMAIL_DOMAIN` from `@/lib/org` (works in client components because the values are build-inlined):

- `src/app/login/page.tsx:30` → `` `Access denied. Only @${ADMIN_EMAIL_DOMAIN} accounts can sign in with Google.` ``; line 102 → `{ORG_NAME} team?`; line 116 → `For @{ADMIN_EMAIL_DOMAIN} accounts only`.
- `src/app/signup/page.tsx:67`, `src/app/providers/page.tsx:344`, `src/app/updates/new/page.tsx:189,411`, `src/app/updates/[id]/page.tsx:212,343` → `{ORG_NAME}` in each sentence.
- `src/app/share/[token]/page.tsx:216` ("${ORG_NAME} Portfolio Update") and `:356` ("Shared via Molly · ${ORG_NAME} portfolio management platform").

### WS9.6 Docs & env plumbing

1. `.env.example`: add a new "Fork configuration" section documenting `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN`, `EMAIL_LOGO_PATH` (with the logo-dimensions note and the redeploy-required caveat), and cross-reference the existing `SUPPORT_EMAIL`. Fix the default-domain drift noted in F14 (pick one canonical example domain, e.g. `example.com`, for the commented defaults so forks stop inheriting either DFS domain by accident in docs).
2. README: extend the fork/deployment section: the four env vars above, plus the file-based steps env vars deliberately don't cover — replace `public/brand/*` assets, `public/favicon.png`, and the CSS theme tokens in `globals.css` (theming stays source-edit by design; runtime theming is out of scope, matching the roadmap note).
3. Optional (skip if time-boxed): a 5-line vitest for `org.ts` asserting the `@`-stripping normalization.

**WS9 acceptance checklist**
- [ ] With no new env vars set: production homepage, login, signup, share page, investor page, and a test email render identical copy to before (spot-check each)
- [ ] `grep -rn "dfs\.vc\|DFS Lab" src/` returns only the default fallbacks in `org.ts` and `email.ts` (and `admin/settings/page.tsx`'s existing `TEAM_EMAIL`/`EMAIL_FROM` fallbacks, which are already env-driven)
- [ ] Local run with `NEXT_PUBLIC_ORG_NAME="Acme Ventures" NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN="acme.vc"`: login page shows "Acme Ventures team?" / "For @acme.vc accounts only"; page title updates; Google sign-in from a non-acme.vc account is refused
- [ ] Rejection email (trigger via a test rejection or read the built HTML) links `mailto:` to `SUPPORT_EMAIL`'s value
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** none — defaults reproduce current output exactly. **Cost impact:** none. **Schema:** none.

---

## WS10 — Rule-based metric alerts (2.5–3 days) — SHIPPED 2026-07-06

**Goal:** plain-arithmetic portfolio alerts, evaluated by a daily cron, surfaced on the admin dashboard with a dismiss action. No AI, no email in v1 (per Q4 recommendation). Assumes Q4 = admin-only/fixed-thresholds and Q4b = ±change; adjust wording if the user picks drop-only.

**Schema change (additive, `db push` before code):** new `metric_alerts` table.

### WS10.1 First commit — fix F12 (reminder cooldown burn)

`src/app/api/cron/reminders/route.ts`: track per-company success and only advance the cooldown when something was actually delivered:

```ts
let anySent = false;
for (const membership of company.memberships) {
  try {
    if (process.env.RESEND_API_KEY) {
      await sendUpdateReminderEmail({ /* ...unchanged... */ });
      anySent = true;
    }
  } catch (err) { /* ...unchanged logging... */ }
}

if (anySent) {
  await db.company.update({ where: { id: company.id }, data: { lastReminderSentAt: now } });
  sent++;
} else {
  skipped++;
}
```

This makes a broken Resend key self-healing: once the key is rotated, the next 09:00 UTC run retries everyone still overdue instead of waiting out a burned cooldown. Verify live post-deploy with the manual curl (`{sent, skipped}` — with the key still broken, expect `sent: 0`).

### WS10.2 Schema

Append to `prisma/schema.prisma`, then `db push`:

```prisma
// ─── Metric Alerts ────────────────────────────────────────

model MetricAlert {
  id                 String    @id @default(cuid())
  companyId          String
  rule               String    // "METRIC_CHANGE" | "NO_METRICS_IN_UPDATES"
  metricDefinitionId String?   // set for METRIC_CHANGE
  message            String    // e.g. "MRR changed −34% (12,000 → 7,900)"
  dedupeKey          String    @unique // see evaluator — prevents refiring on unchanged data
  metadata           Json?     // { previousValue, latestValue, changePct, previousDate, latestDate }
  firedAt            DateTime  @default(now())
  resolvedAt         DateTime? // set when an admin dismisses
  resolvedById       String?

  company          Company           @relation(fields: [companyId], references: [id], onDelete: Cascade)
  metricDefinition MetricDefinition? @relation(fields: [metricDefinitionId], references: [id], onDelete: Cascade)

  @@index([resolvedAt, firedAt])
  @@map("metric_alerts")
}
```

Add back-relations `metricAlerts MetricAlert[]` to `Company` and `MetricDefinition` (relation-list fields add no DB columns — still additive).

### WS10.3 Pure evaluator (tested)

New file `src/lib/metric-alerts.ts` — pure function over plain data, mirroring the `route-access.ts` extract-and-test pattern:

```ts
export const DEFAULT_CHANGE_PCT = 20; // override via METRIC_ALERT_CHANGE_PCT env (server-only)

export interface MetricSeries {
  metricDefinitionId: string;
  name: string;
  unit: string | null;
  values: { value: number; date: Date }[]; // sorted date desc, up to 5
}

export interface CompanySnapshot {
  companyId: string;
  companyName: string;
  metricDefinitionCount: number;
  series: MetricSeries[];
  // newest-first, up to 3, published only
  lastPublishedUpdates: { id: string; metricValueCount: number }[];
}

export interface FiredAlert {
  rule: "METRIC_CHANGE" | "NO_METRICS_IN_UPDATES";
  companyId: string;
  metricDefinitionId?: string;
  message: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
}

export function evaluateCompanyAlerts(
  snap: CompanySnapshot,
  changePct: number = DEFAULT_CHANGE_PCT
): FiredAlert[] { /* rules below */ }
```

**Rule 1 — METRIC_CHANGE.** For each series with ≥2 values on distinct dates: `latest` vs `previous` (next-earlier distinct date). Skip when `previous === 0` (undefined percentage). Fire when `Math.abs((latest - previous) / previous) * 100 >= changePct`. Message: `` `${name} changed ${sign}${rounded}% (${fmt(previous)} → ${fmt(latest)})` ``. `dedupeKey` = `` `METRIC_CHANGE:${companyId}:${metricDefinitionId}:${latestDateISO}` `` — a re-run on unchanged data produces the same key and is skipped; a *new* latest value produces a new key and re-evaluates. (`MetricValue.value` is Prisma `Decimal` — the cron converts with `Number()` before building snapshots, matching the codebase convention.)

**Rule 2 — NO_METRICS_IN_UPDATES.** Fire when `metricDefinitionCount > 0` AND `lastPublishedUpdates.length >= 3` AND all three have `metricValueCount === 0`. Message: `` `No metrics attached to the last 3 updates` ``. `dedupeKey` = `` `NO_METRICS_IN_UPDATES:${companyId}:${lastPublishedUpdates[0].id}` `` (refires only after another metric-less update is published).

Tests in `src/lib/__tests__/metric-alerts.test.ts`: 19.99% change → no fire; 20% exactly → fire; negative and positive direction both fire (or only negative, if Q4b = A); previous 0 → skip; single value → skip; R2 fires only with ≥3 published updates AND ≥1 metric definition AND all-zero counts; dedupeKey stability for identical input.

### WS10.4 Cron route

New file `src/app/api/cron/alerts/route.ts` — same shape as the reminders cron (GET + POST → shared handler, `CRON_SECRET` bearer check first; `/api/cron` is already in `PUBLIC_PREFIXES` at `src/lib/route-access.ts:21`, so no middleware change). Handler:

1. Fetch companies using the same `approvedCompanyFilter` as `api/admin/dashboard/route.ts:59-61` (skip unapproved-founder companies), including `metricDefinitions` with `values: { orderBy: { date: "desc" }, take: 5 }` (Prisma nested take is per-parent), and `updates: { where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 3, select: { id: true, _count: { select: { metricValues: true } } } }`.
2. Build snapshots (`Number()` the Decimals), run `evaluateCompanyAlerts` per company with `Number(process.env.METRIC_ALERT_CHANGE_PCT) || DEFAULT_CHANGE_PCT`.
3. Persist all fired alerts with one `db.metricAlert.createMany({ data, skipDuplicates: true })` — the `dedupeKey` unique constraint makes dedup atomic and race-free.
4. Return `{ evaluated: companies.length, fired: <createMany count> }` and `console.log` it, matching the reminders cron.

`vercel.json`: append `{ "path": "/api/cron/alerts", "schedule": "30 9 * * *" }` (daily — works on Hobby; the 100-cron-per-project limit is nowhere near a concern).

### WS10.5 Admin API

- New `src/app/api/admin/alerts/route.ts` — `GET` (`requireAdmin`): open alerts (`resolvedAt: null`), `orderBy: { firedAt: "desc" }, take: 100`, including `company: { select: { id: true, name: true } }` and `metricDefinition: { select: { name: true, unit: true } }`.
- New `src/app/api/admin/alerts/[id]/route.ts` — `PATCH` (`requireAdmin`): body `{ resolved: true }` → set `resolvedAt: new Date(), resolvedById: user!.id`; then `logAdminAction(user!, "ALERT_DISMISSED", { targetType: "MetricAlert", targetId: id, metadata: { rule, companyId } })`. Guard/validate/act pattern per Part 2 rules; both files start with `export const dynamic = "force-dynamic";`.

### WS10.6 Admin dashboard UI

`src/app/admin/dashboard` page (client): fetch `/api/admin/alerts` alongside the existing dashboard fetch; non-OK → treat as empty (never block the dashboard). Render a **"Metric Alerts"** section between the KPI cards and the charts, **only when alerts exist** (zero visual change for a clean portfolio): one row per alert — company name (link to `/admin/companies/[id]`), message, fired date, and a "Dismiss" button (PATCH, then remove from local state). Laterite accent for the rule badge, consistent with existing status-color conventions. No sidebar entry — the dashboard is the alerts surface.

**WS10 acceptance checklist**
- [ ] F12: manual reminder-cron trigger with broken/absent Resend key reports `sent: 0` and does not advance `lastReminderSentAt` (check a known-overdue company's row)
- [ ] `npm test` green including the new evaluator tests
- [ ] Manual `curl -H "Authorization: Bearer <CRON_SECRET>" https://molly.dfslab.net/api/cron/alerts` returns `{evaluated, fired}`; without the secret → 401
- [ ] Seed a ≥20% metric change on a test company (record two values via the metrics page), trigger the cron → alert row appears on `/admin/dashboard`; second trigger fires no duplicate
- [ ] Dismiss removes the alert, writes an `ALERT_DISMISSED` audit row, and it stays gone on refresh
- [ ] Founder accounts get 403 from `/api/admin/alerts`; admin dashboard renders unchanged when zero alerts exist
- [ ] Next scheduled 09:30 UTC run green in Vercel logs

**UX impact:** admin-only, additive (a section that only appears when alerts exist); founders see nothing. **Cost impact:** none — one daily query batch over a tens-of-companies portfolio plus one small table. **Schema:** additive (`metric_alerts` + two relation-list fields).

---

## WS11 — Scheduled Publishing (2 days) — SHIPPED 2026-07-06

**Goal:** founders can schedule a draft to publish on a future date; a daily cron publishes due drafts and sends the existing team-notification email. Assumes Q3 = date-only. Everything is additive: founders who never touch the schedule control see an unchanged flow.

**Schema change (additive, `db push` before code):** one nullable column on `Update`:

```prisma
  scheduledFor DateTime? // null = not scheduled; date-only semantics (publishes at the next daily cron ≥ this instant)
```

### WS11.1 Extract a single publish path

The publish side-effect is currently duplicated: `POST /api/companies/[id]/updates` (lines 138-162) and `PATCH /api/updates/[id]` (lines 192-222) each build and send `sendUpdatePublishedEmail` with identical shapes. A cron publisher would be a third copy — extract instead. New file `src/lib/publish-update.ts`:

```ts
import { db } from "@/lib/db";
import { sendUpdatePublishedEmail } from "@/lib/email";

/**
 * Flip a DRAFT update to SENT and send the team notification.
 * The email is best-effort: a Resend failure must never roll back
 * or block the publish (matches existing behavior in both publish paths).
 * Returns the updated row, or null if the update was not a publishable draft.
 */
export async function publishUpdate(updateId: string) {
  const existing = await db.update.findUnique({
    where: { id: updateId },
    select: { status: true },
  });
  if (!existing || existing.status === "SENT") return null;

  const updated = await db.update.update({
    where: { id: updateId },
    data: { status: "SENT", sentAt: new Date(), scheduledFor: null },
  });

  try {
    const full = await db.update.findUnique({
      where: { id: updateId },
      include: {
        company: { select: { id: true, name: true } },
        metricValues: { include: { metricDefinition: { select: { name: true, unit: true } } } },
      },
    });
    if (full) {
      await sendUpdatePublishedEmail({ /* same mapping as the PATCH route today */ });
    }
  } catch (emailErr) {
    console.error("Failed to send publish email:", emailErr);
  }

  return updated;
}
```

Refactor `PATCH /api/updates/[id]`'s just-published branch to call it (keeping the metric-replacement transaction exactly where it is, before the publish flip). The create-with-SENT path in `POST /api/companies/[id]/updates` may either stay as-is or reuse the email-sending half — implementer's choice; do not change its response shape or transaction structure.

**Also (F13, flagged judgment call):** delete the dead `src/app/api/updates/[id]/send/route.ts`. No client code calls it (verified by grep), it's session-guarded (no external integration risk), and it publishes without notifying the team — leaving it invites exactly the drift this workstream is consolidating. Cheap reversal: `git revert`. If the user objects, the alternative is one line — make it call `publishUpdate()` — but dead code that *works* is still dead code.

### WS11.2 Accept `scheduledFor` on the write paths

- `PATCH /api/updates/[id]`: accept optional `scheduledFor: string | null`. Rules: settable/clearable **only while the update is (and stays) DRAFT** — reject with 400 ("Only drafts can be scheduled") if the row is SENT or the same request sets `status: "SENT"` (publishing now supersedes a schedule; `publishUpdate`/the publish branch clears it anyway). Validate: parseable date, and `> now` (400 "Scheduled date must be in the future"). Store as the UTC instant of the chosen date's 00:00 (client sends `new Date(dateInput + "T00:00:00Z").toISOString()`) — the 09:00 UTC cron then publishes it that morning.
- `POST /api/companies/[id]/updates`: accept the same optional field, only honored when the effective status is DRAFT; same validation.

### WS11.3 Cron route

New file `src/app/api/cron/scheduled-publish/route.ts` — same GET+POST/`CRON_SECRET` shape as the other crons:

```ts
const due = await db.update.findMany({
  where: { status: "DRAFT", scheduledFor: { lte: new Date() } },
  select: { id: true },
});
let published = 0, failed = 0;
for (const u of due) {
  try { (await publishUpdate(u.id)) ? published++ : failed++; }
  catch (err) { console.error(`scheduled publish failed for ${u.id}:`, err); failed++; }
}
return Response.json({ published, failed });
```

Per-update try/catch so one bad row can't block the rest. `vercel.json`: append `{ "path": "/api/cron/scheduled-publish", "schedule": "0 9 * * *" }`. (Same daily hour as reminders; relative ordering between the two jobs is not guaranteed and does not matter — a same-morning "overdue" reminder racing a scheduled publish is a one-time cosmetic edge case, and Hobby-plan hour jitter would defeat any ordering attempt anyway.) `/api/cron` public-prefix already covers it.

### WS11.4 Founder UI

`src/app/updates/new/page.tsx` (and mirrored on the draft-edit path in `src/app/updates/[id]/page.tsx`):

1. Below the existing Save as Draft / Publish buttons (around line 437), add a "Schedule for later" disclosure: a native `<input type="date">` (native controls are the codebase convention; `min` = tomorrow) plus a "Schedule" button, enabled only when a date is picked. Submitting saves with `status: "DRAFT"` and the `scheduledFor` ISO string. Helper copy (muted, small): *"Publishes on the morning of the selected date (UTC). You can keep editing until then."*
2. Drafts with `scheduledFor` show it: in the updates list (the status badge at line ~285 currently renders "Published"/"Draft") add a third presentation for drafts with `scheduledFor` — "Scheduled · {date}" (ochre/warning token per the status-color conventions). On the edit page, a banner: *"Scheduled to publish on {date}"* with a "Cancel schedule" button (PATCH `scheduledFor: null`).
3. Publishing manually (existing confirm flow) works unchanged on a scheduled draft and clears the schedule.

### WS11.5 Edge cases (spec'd, no decisions needed)

- Editing a scheduled draft: allowed, schedule persists (it's still a DRAFT).
- Deleting a scheduled draft: existing draft-delete flow; row (and schedule) gone.
- `sentAt` is set to the **actual** publish instant, not `scheduledFor` — the 3-day edit window, cadence detection, and share-link period derivation all key off `sentAt` and keep working with zero changes.
- Resend down at publish time: the update still publishes (best-effort email, F12-style lesson pre-applied); the miss is logged.

**WS11 acceptance checklist**
- [ ] Founder schedules a draft for tomorrow → badge shows "Scheduled"; cancel returns it to a plain draft
- [ ] Schedule a draft for today (via API or by setting the date then manually curling the cron with the secret) → update flips to SENT, appears on `/admin/updates`, `scheduledFor` is null, team email arrives (post-Resend-rotation) or a logged failure does not block the publish
- [ ] Scheduling a published update → 400; scheduling in the past → 400
- [ ] Manual publish of a scheduled draft works and clears the schedule
- [ ] Founders who ignore the control see a pixel-identical flow (disclosure collapsed by default)
- [ ] `POST /api/updates/[id]/send` returns 404 (route deleted, F13) — and the update pages still publish fine via PATCH
- [ ] Cron: 401 without secret; next scheduled 09:00 UTC run green in Vercel logs
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive (optional disclosure + a new badge state for scheduled drafts only). **Cost impact:** none — one daily indexed-scan cron. **Schema:** additive (`Update.scheduledFor`).

---

## WS12 — Bulk LP Report Link (0.5–1.5 days, **gated on Q1 + Q2**) — SHIPPED 2026-07-06

**Goal (assuming recommendations Q1 = B, Q2 = snapshot):** an admin opens the link builder, picks a date range, one-clicks "select all published updates in range," optionally scopes the metric summary to that period, and gets a single portfolio-wide link for an LP meeting. Effort: ~0.5 day if Q1 = A (no schema, builder convenience only); ~1.5 days for the full Q1 = B version below.

### WS12.1 Schema (only if Q1 = B; additive, `db push` before code)

On `ShareableLink`:

```prisma
  metricScope String @default("ALL_TIME") // "ALL_TIME" | "PERIOD" — ALL_TIME = pre-existing behavior
```

Every existing row gets `ALL_TIME` via the default → existing links render byte-identically. (String, not enum: adding a Postgres enum is a heavier DDL for two values, and the codebase already uses strings for `AuditLog.action`, `Document.docType`.)

### WS12.2 Share endpoint scoping (only if Q1 = B)

`src/app/api/share/[token]/route.ts` — the metric filter at lines 91-93 becomes:

```ts
const periodEndInclusiveForMetrics = link.periodEnd ? endOfDayUTC(link.periodEnd) : null; // reuse the existing 23:59:59.999 normalization
const metricDateFilter =
  link.metricScope === "PERIOD" && link.periodStart && periodEndInclusiveForMetrics
    ? { date: { gte: link.periodStart, lte: periodEndInclusiveForMetrics } }
    : link.selectedUpdates.length > 0 || !link.periodStart || !link.periodEnd
      ? {} // unchanged pre-existing behavior for ALL_TIME links
      : { date: { gte: link.periodStart, lte: link.periodEnd } };
```

This works because `POST /api/links` already derives `periodStart`/`periodEnd` from the min/max `sentAt` of the selected updates (lines 74-76) — every new-style link has the period data. The per-company "latest value per metric" reduction below the query needs no changes; it just operates on the filtered set. Companies whose metrics all fall outside the period show an empty metrics list on the share page — verify the share page's rendering of `metrics: []` is graceful (it must already handle companies with no metrics at all).

### WS12.3 Link creation

`src/app/api/links/route.ts` `POST`: accept optional `metricScope`, validate against `["ALL_TIME", "PERIOD"]` (400 otherwise), default `"ALL_TIME"`. No other changes — response shape untouched. (Founders technically *can* pass it; harmless and consistent. The founder UI doesn't expose it in v1.)

### WS12.4 Admin builder UI

`src/app/admin/links/page.tsx` (the builder already lists every published update via `GET /api/admin/updates` — client-side selection over fetched data, so "select all" needs zero new endpoints):

1. Above the update-selection list, add a "Bulk select by period" row: two native `<input type="date">` fields (From / To) and a **"Select all in range"** button that checks every listed update whose `sentAt` falls in the range (and a "Clear selection" affordance). Show a per-selection summary line: "N updates across M companies."
2. If Q1 = B: a checkbox **"Limit the metric summary to this period"** → sends `metricScope: "PERIOD"`. Default it to checked when the bulk-select was used, unchecked otherwise (flagged micro-judgment: this default is the entire point of the feature for LP reports; reversal is removing one `useState` default).
3. Everything else (label, expiry, create, copy-link) unchanged.

**WS12 acceptance checklist**
- [ ] Open a share link created **before** this workstream → renders byte-identically (metrics still all-time latest)
- [ ] Admin bulk-selects a quarter → link created with all published updates in range across companies; share page groups them per company as today
- [ ] (Q1 = B) With period-scoping on: the share page's metric summary shows the latest value **within** the period per metric; values recorded after the period do not appear; a company with no in-period metrics shows an empty metrics section gracefully
- [ ] (Q1 = B) `metricScope: "banana"` → 400; omitted → ALL_TIME
- [ ] Founder `/links` builder unchanged
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive admin-builder controls; existing links and the founder flow untouched. **Cost impact:** none. **Schema:** one defaulted column (Q1 = B only).

---

## WS13 — Comment Threading: **recommend deferring out of this batch**

Recommendation (Q5): **defer**, for four reasons. (1) The roadmap itself demoted it ("templates improve update quality more per unit of effort") — and templates have now shipped, so the comparison should be re-run with real usage data before investing here. (2) It's the only P2 item that redesigns an existing founder-and-admin-facing surface (the comment section on every update) rather than adding a new one — the highest UX-regression risk in the tier, deserving its own focused batch. (3) Its notification half (@mentions, reply notifications) lands on top of an email pipeline that is currently broken (Resend 401) — building notification UX before delivery works means shipping untestable features. (4) @mentions need real permission design (founders must not be able to mention/see users outside their company; admins can — this is a product surface, not a schema field).

**Future sketch (for the next batch's Felix, not for implementation now):** additive `parentId String?` and `resolvedAt DateTime?` on `Comment` (self-relation, one level deep — no arbitrary nesting); `GET/POST /api/updates/[id]/comments` gain `parentId` handling (response shape additive); UI renders one indent level with a "Resolve" toggle on root comments (admin + author only); @mentions deferred even then. Verified against `prisma/schema.prisma` (`Comment` model, lines 204-216) and `src/app/api/updates/[id]/comments/route.ts` — the flat model and its two notification fan-outs (founder→admins, admin→founders) port cleanly; reply notifications should go to the parent-comment author instead of the full fan-out.

`ROADMAP.md` annotated: Comment Threading stays in P2, marked "deferred from the Jul 2026 P2 batch."

---

## Part 5 sequencing, batch scope & effort

**Recommended batch scope — agree with the prior recommendation, extended by one:** start with **WS9 → WS10** (fork config unblocks the project's stated open-source purpose at near-zero risk; alerts are the highest-leverage admin feature and also fix F12). **WS11 belongs in the same batch**: it rides the same cron pattern WS10 just exercised, needs no product decisions beyond Q3's default, and is fully verifiable without email. **WS12 joins the batch iff Q1/Q2 are answered by the time WS11 ships** — otherwise it waits; nothing else depends on it. **WS13 is out** (see above).

Order: WS9 → WS10 → WS11 → WS12. Each workstream = commit(s) + live verification before the next starts. WS10 and WS11 are independent of each other in code (only WS10.1's cron-file touch overlaps WS11's cron additions trivially), but sequential shipping keeps live verification honest.

| WS | Item | Effort | Schema push | Gated on |
|---|---|---|---|---|
| WS9 | Fork Configuration | 1d | — | nothing |
| WS10 | Metric alerts (+ F12 fix) | 2.5–3d | `metric_alerts` | Q4/Q4b (defaults recommended) |
| WS11 | Scheduled Publishing | 2d | `Update.scheduledFor` | Q3 (default recommended) |
| WS12 | Bulk LP Report Link | 0.5–1.5d | `ShareableLink.metricScope` (Q1 = B only) | **Q1 + Q2 (real forks — must be answered)** |
| WS13 | Comment Threading | — | — | deferred (Q5) |

**Total: ~6–7.5 junior-engineer days** for WS9–WS12.

**Resend dependency summary:** rotate the key before or during WS10 — WS10.1 makes reminders self-healing after rotation; WS11's publish email and any future alert emails are best-effort until then; only email-related acceptance items block on it.

## Part 5 roadmap bookkeeping

Done alongside this plan: `ROADMAP.md` annotated with F12 (reminder delivery vs. cron mechanics), F14 (fork-config hardcode undercount), the Comment Threading deferral, and a "Next up" pointer to this Part. As each workstream ships, fold it into "Existing Features" per the file's convention; the fork-config row moves wholesale with the new env-var names documented.

---

# Part 6 — Mobile-Width Layout Hardening (WS14–WS15)

_Added 2026-07-07, after a real-device report showed `/admin/providers` breaking at phone width (header buttons pushed off-screen, card text crushed to one word per line). Commit `e1a91cc` already fixed the two reported spots (`page-header.tsx` now stacks below `sm:`; the providers card row and header action group wrap) — this Part is the full-app audit that request triggered. Scope: **layout only** — no schema changes, no behavior changes, no new dependencies. Same hard constraints as Parts 1–5._

> **Status (2026-07-07): WS14 shipped and verified live** (commit `93203c7`, deployed to `molly.dfslab.net`). All ten confirmed phone-width breakers fixed with the four house patterns (A–D), plus one addition found mid-batch via a real device screenshot (WS14.7, founder `/providers` card grid — see below). Quality gates (`typecheck`, `lint`, `test`, `build`) passed; no new lint errors. Live curl check: `/`, `/login`, `/investors` return 200; all auth-gated touched routes (`/providers`, `/admin`, `/links`, `/admin/audit`, `/admin/companies/[id]`, `/admin/digest/[id]`, `/company/metrics`, `/setup-wizard`, `/updates/new`, `/updates/[id]`) 307-redirect to `/login` as expected with no session — no 500s. WS15 in progress next.

**Method note:** this audit was done by reading layout code (Tailwind classes + flex/grid structure) against a 375 px reference width — no browser. Where the math is borderline rather than provably broken, the item says **"verify on device"** instead of asserting a break. Every file/line below was read in the current working tree on 2026-07-07.

**The arithmetic that decides most of these calls:** a 375 px phone minus the AppShell's `px-4` leaves **343 px** of content; inside a default `CardContent` (`p-6`) that drops to **~295 px**. A native `<input>` has an intrinsic minimum width of roughly 170 px (browsers won't shrink it below its `size` default), and buttons/badges never shrink below their text. So any non-wrapping flex row containing an input plus anything else, or ~3 buttons, overflows — and because `AppShell`'s `<main>` has no `overflow-x-hidden`, one overflowing row gives the whole page a horizontal scrollbar.

## Part 6 ground rules

All prior ground rules apply (quality gate `typecheck && lint && test` before every push; one workstream per commit-and-verify cycle on the live deploy; no staging). Additions:

1. **Layout-only diffs.** No JSX restructuring beyond adding wrapper `<div>`s and className changes. If a fix seems to need moving logic, stop and flag it.
2. **Desktop must be pixel-identical at ≥ 640 px.** Every technique below is chosen because it is inert when space is sufficient: `flex-wrap` only wraps when out of room; `overflow-x-auto` shows no scrollbar when content fits; `min-w-[...]` on tables is below their natural desktop width; `grid-cols-1 sm:grid-cols-2` reproduces today's layout at `sm:`+. Spot-check one desktop screenshot per page anyway.
3. **Breakpoint convention (audited, consistent — keep it):** `sm:` (640 px, Tailwind default) for content layout; `md:` (768 px) exclusively for the app shell (sidebar overlay ↔ static, mobile top bar). That split is intentional — the 60-rem sidebar needs more room than content does — and no file deviates from it. Do not introduce custom breakpoints.
4. **House patterns.** Use these four named patterns everywhere below; don't invent variants:
   - **Pattern A — scrollable table:** wrap the `<table>` in `<div className="overflow-x-auto">` **and give the table an explicit min-width** (e.g. `min-w-[560px]`). Without the min-width the `w-full` table just crushes its columns instead of scrolling — the audit-log page currently has the wrapper but not the min-width.
   - **Pattern B — wrap-row card** (the `e1a91cc` ProviderRow fix, `src/app/admin/providers/page.tsx:411-420`): outer row `flex flex-wrap items-start gap-3`; text column `min-w-48 flex-1`; action cluster `shrink-0`. The min-width makes the shrink-0 cluster wrap onto its own row instead of squeezing the text.
   - **Pattern C — stack row** (the `page-header.tsx` fix): `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.
   - **Pattern D — wrapping form row:** add `flex-wrap` to `flex items-end gap-3` rows that mix a `flex-1` input with fixed-width inputs/buttons; give the `flex-1` field a `min-w-48` so it takes a full row alone rather than crushing.

## Part 6 audit findings (whole app, by pattern)

Every page under `src/app/` was read. Counts are of distinct broken/at-risk spots, not files.

**A. Tables without a horizontal-scroll container — 5 spots (of 7 app tables; 1 has a wrapper, 1 is fine).**
Confirmed breakers (wide tables that crush unusably or overflow at 343/295 px):
- `src/app/admin/companies/[id]/page.tsx:1244` — Documents tab, **7 columns** (Name/Type/Date/Uploaded By/Size/Visibility/actions). Worst table in the app.
- `src/app/admin/page.tsx:382` — Overdue-companies table, 5 columns incl. a "Remind" button column.
- `src/app/admin/page.tsx:255` — Metric Alerts table, 4 columns incl. free-text alert message + Dismiss button.
Mild (few narrow columns; fit, standardize anyway while in the file): `src/app/updates/[id]/page.tsx:615` (3 cols), `src/app/admin/companies/[id]/page.tsx:1115` and `src/app/company/metrics/page.tsx:337` (2 cols each — genuinely fine, leave them).
Already wrapped but missing the table min-width: `src/app/admin/audit/page.tsx:50-51`.

**B. Non-wrapping flex rows with fixed-width inputs — 3 spots, all provable overflows.**
- `src/app/company/metrics/page.tsx:219` — "Define a New Metric": `flex items-end gap-3` with flex-1 name input + `w-32` unit + Add button ≈ 412 px needed vs ~295 available.
- `src/app/company/metrics/page.tsx:288` — per-metric "Add value" row: `w-44` date + `w-36` value + button ≈ 434 px.
- `src/app/setup-wizard/page.tsx:309` — metric-definition rows: flex-1 + `w-32` + trash button, same failure.

**C. `justify-between` card rows whose `shrink-0` action cluster crushes the text column — 7 spots** (the exact `/admin/providers` failure mode, pre-`e1a91cc`):
- `src/app/links/page.tsx:340,354` — founder link cards: cluster (views + Copy Link + revoke, ~250 px; ~330 px in confirm-delete state) is `shrink-0` on a non-wrapping row → label/expiry column gets ~90 px. **Breaker.**
- `src/app/admin/links/page.tsx:440,461` — identical markup, same break.
- `src/app/admin/companies/[id]/page.tsx:1392,1407` — Members rows: badge + role `<select>` + trash vs. a text column with no `min-w-0`; long emails can force page overflow. **Breaker-ish; verify on device.**
- `src/app/team/page.tsx:263,281` — same members pattern, same risk.
- `src/app/admin/approvals/page.tsx:146,167` — Reject+Approve cluster (~190 px); text has `min-w-0` so it crushes-but-functions. Borderline; fix for conformance.
- `src/app/admin/companies/[id]/page.tsx:1583,1594` — Notes rows: up to 4 controls (~150 px); crushed-but-functional. Borderline.
- `src/app/admin/digest/page.tsx:90,97` — digest list rows: small cluster + `truncate` title; lowest risk of the set.

**D. Page-level header rows that don't stack — 2 spots** (pages that didn't use `PageHeader`, or whose `action` prop itself is a non-wrapping cluster):
- `src/app/admin/digest/[id]/page.tsx:210,240` — custom header: title column vs. a `shrink-0` cluster of badge + up to 3 buttons (Edit/Delete/Send ≈ 300+ px). The cluster has `flex-wrap` but is `shrink-0` on a non-wrapping row → title crushed. **Breaker.**
- `src/app/updates/[id]/page.tsx:383` — `PageHeader action`: badge + Edit + Download PDF in non-wrapping `flex gap-3`; with a "Scheduled · {date}" badge this exceeds 343 px even after the header stacks. **Breaker in the scheduled state.**
(Conformance, not breakers: `src/app/admin/companies/page.tsx:183` two-button action ≈ 300 px, fits but has no wrap; `src/app/admin/companies/[id]/page.tsx:~630-668` delete-confirm cluster Confirm Delete + Cancel + Back ≈ 330 px, borderline.)

**E. Confirm/banner rows with text + button clusters — 3 spots, breakers in their confirm states:**
- `src/app/updates/[id]/page.tsx:437-468` — draft publish banner: `justify-between` text vs. buttons; the confirm state adds "Publish and notify the {ORG} team?" + 2 buttons on one non-wrapping row.
- `src/app/updates/[id]/page.tsx:425-434` — scheduled banner, same shape.
- `src/app/updates/new/page.tsx:432-473` — form action row: confirm state = text (~230 px) + 2 buttons on a non-wrapping `justify-end` row.

**F. Tab bar without overflow handling — 1 spot, breaker:**
- `src/app/admin/companies/[id]/page.tsx:916-931` — 5 tabs (Updates/Metrics/Documents/Members/Notes), each icon + label + `px-4` ≈ 550 px total on a non-wrapping, non-scrolling row.

**G. Modals — structurally fine (all use `p-4` + `max-h-[90vh] overflow-y-auto`), 4 cramped grids inside them:**
- `grid grid-cols-2` field pairs with no `sm:` variant: `src/app/admin/providers/page.tsx:311,353` and `src/app/providers/page.tsx:317` → ~140 px per field inside the modal at 375 px. Usable but cramped.
- `src/app/admin/companies/[id]/page.tsx:1703` — notes-history diff modal: `grid grid-cols-2 divide-x` Before/After panes → ~150 px per pane. See judgment call JC2.

**H. Misc borderline (verify on device, cheap conformance fixes):**
- `src/app/admin/companies/[id]/page.tsx:1151` — Documents upload row (select + checkbox + button ≈ 330 px, non-wrapping; the filter row below it at :1194 already wraps).
- `src/app/admin/companies/new/page.tsx:226` — 3-button assignment toggle ≈ 334 px vs 295 px inside the card.
- `src/app/setup-wizard/page.tsx:186-234` — 3-step indicator; reads as fitting (3 × 40 px circles + `text-xs` labels + flexible connectors) but is the one layout where the math is close. Verify on device.

**Verified fine at 375 px — no work needed** (listing so nobody re-audits): AppShell/sidebar mobile nav (hamburger, overlay, backdrop, `onClose` on nav links — the mobile nav genuinely works: `src/components/layout/app-shell.tsx`, `sidebar.tsx`), `page-header.tsx` (fixed in `e1a91cc`), all Recharts usage (`ResponsiveContainer width="100%"` in both `src/components/ui/metric-chart.tsx:43` and `src/app/admin/page.tsx:306`), **the share page `src/app/share/[token]/page.tsx`** (single column, `min-w-0` + `flex-wrap` throughout, email-gate modal `max-w-sm` + `px-4` — the most mobile-critical page is in the best shape), founder dashboard, `/admin/companies` grid, both providers pages (post-`e1a91cc`), `/admin/updates`, `/admin/templates`, `/admin/digest` list + `new`, `/admin/settings` + panels, `/team` invite form, homepage, `/investors`, auth pages, `/company/profile`, company switcher, RichEditor (toolbar already `flex-wrap`), all `grid gap-* sm:grid-cols-*` form grids in the update create/edit forms.

## Part 6 judgment calls

- **JC1 — tables: horizontal scroll, not column hiding (recommendation: scroll; decide only if you disagree).** Hiding columns below `sm:` would change what admins can see on mobile — that's a product decision. Pattern A (scroll within the card) preserves every column with zero information loss, so this plan uses it everywhere and needs no sign-off. If you'd rather hide low-value columns (e.g. drop Uploaded By/Size from the documents table on phones), say so and WS14.2 changes trivially.
- **JC2 — notes diff modal: stack Before/After vertically below `sm:` (small technical call, made here; flagging per protocol).** `grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 sm:divide-x` — at 375 px two ~150 px prose panes are unreadable; stacked panes (Before above After) keep the comparison usable. Desktop unchanged. Cheap reversal: delete the two `sm:` prefixes. This is admin-only and behind two clicks, hence WS15 not WS14.
- **JC3 — admin dashboard tables stay tables.** The alternative (re-render alerts/overdue rows as stacked cards below `sm:`) is more code, duplicates markup, and drifts from JC1's principle. Scroll containers only.

---

## WS14 — Worst offenders: confirmed phone-width breakers (~1 day)

**Goal:** at 375 px, no route in the app produces a horizontal page scrollbar, and every confirmed-broken surface above is usable. All changes are className-level and inert at ≥ 640 px.

**Confirmed decisions:** Patterns A–D as specified; JC1 = scroll-not-hide; no schema, no behavior changes.

### WS14.1 Company-detail tab bar
`src/app/admin/companies/[id]/page.tsx:916` — make the tab row scrollable instead of clipped:
```tsx
<div className="mb-6 flex gap-1 overflow-x-auto border-b">
```
and add `shrink-0 whitespace-nowrap` to the tab `<button>` className (line 921) so tabs scroll as a strip rather than shrinking. No visible change on desktop (5 tabs ≈ 550 px < content width).

### WS14.2 Tables → Pattern A
- `src/app/admin/companies/[id]/page.tsx:1244` (Documents): the table already sits in `<CardContent className="p-0">` — wrap the `<table>` in `<div className="overflow-x-auto">` and change the table to `className="w-full min-w-[720px] text-sm"`.
- `src/app/admin/page.tsx:255` (Metric Alerts): wrap + `min-w-[560px]`.
- `src/app/admin/page.tsx:382` (Overdue companies): wrap + `min-w-[640px]`.
- `src/app/admin/audit/page.tsx:51`: wrapper exists; just add `min-w-[640px]` to the `<table>` so it scrolls instead of crushing (the JSON metadata column is the risk).
Leave the 2–3-column metric/update tables alone (they fit; touching them buys nothing).

### WS14.3 Metric form rows → Pattern D
- `src/app/company/metrics/page.tsx:219`: `className="flex flex-wrap items-end gap-3"` and add `min-w-48` to the `flex-1` wrapper div.
- `src/app/company/metrics/page.tsx:288`: same — `flex flex-wrap items-end gap-3` (the `w-44`/`w-36` inputs then wrap above the button).
- `src/app/setup-wizard/page.tsx:309`: same — `flex flex-wrap items-end gap-3` + `min-w-48` on the flex-1 name wrapper.

### WS14.4 Link cards (founder + admin) → Pattern B
`src/app/links/page.tsx:340` and `src/app/admin/links/page.tsx:440` — change the card row from
```tsx
<div className="flex items-start justify-between gap-4">
  <div className="min-w-0 flex-1 space-y-1.5">
```
to
```tsx
<div className="flex flex-wrap items-start gap-4">
  <div className="min-w-48 flex-1 space-y-1.5">
```
(drop `justify-between`; the flex-1 text column provides the same spacing when both fit on one row). The action cluster (lines 354 / 461) keeps its existing `shrink-0 flex-wrap` — with the outer row now wrapping, it drops onto its own row on phones, exactly like ProviderRow.

### WS14.5 Publish/schedule banners and confirm rows
- `src/app/updates/[id]/page.tsx:426` and `:438` — both banners: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` (Pattern C); also add `flex-wrap` to the confirm-state cluster at `:443`.
- `src/app/updates/new/page.tsx:432` — action row: `flex flex-wrap items-center justify-end gap-3` (the confirm-prompt text then wraps above the buttons; the two-button non-confirm state is unaffected).

### WS14.6 Non-stacking headers
- `src/app/admin/digest/[id]/page.tsx:210` — Pattern C on the outer row: `mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`; the action cluster at `:240` keeps `flex-wrap` but should drop `shrink-0` (redundant once stacked) — or keep it; either is fine once the outer row stacks.
- `src/app/updates/[id]/page.tsx:383` — `PageHeader action` cluster: `flex flex-wrap items-center gap-3`.

### WS14.7 Founder `/providers` card grid — added mid-batch, device-verified breaker not in Felix's original audit
`src/app/providers/page.tsx:233,245` — both card grids (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`) were missing a base `grid-cols-1`. Diagnosed by reproducing the exact `ProviderCard` markup in an isolated Tailwind harness and measuring in real headless Chrome at a true 375px viewport (via CDP, `Emulation.setDeviceMetricsOverride`): with no base column count, the grid falls back to an implicit auto-sized column track whose width follows the CSS Grid default-track content-sizing algorithm rather than clamping to the container — confirmed empirically: the `ProviderCard`'s own non-shrinking rows (the `truncate`-forced-nowrap title next to the `StatusBadge`, and the non-wrapping endorsement-count/`Endorse`-button footer row, neither of which has `min-w-0` on both sides) pushed the rendered card to ~474px inside a 343px-wide container, at genuine document-level horizontal overflow (`scrollWidth` 491 vs `clientWidth` 375) — exactly matching the reported screenshot (badge clipped mid-word, `Endorse` button showing only its icon). Fix: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` (same technique WS15.2 already uses for the modal field grids) — this clamps the implicit column's minimum to 0 so oversized card content is contained rather than blowing out the grid; re-measured after the fix at `scrollWidth === clientWidth === 375`, badge and button fully on-screen. Inert at ≥640px: `sm:`/`lg:` already override the column count there, identical to every other `grid-cols-1 sm:grid-cols-*` pair already in this codebase.
Checked adjacent card-grids for the same failure category (`/admin/companies`, admin dashboard stat cards): their card titles wrap normally (no `truncate`/`nowrap`) so their intrinsic min-content is bounded by the longest single word, not a full unbreakable string — they don't hit this failure mode, consistent with Felix's audit marking them fine. This appears to be an isolated case, specific to the combination of a forced-nowrap title and an unguarded non-wrapping footer row.

### WS14 acceptance checklist
- [ ] In devtools at 375×812 **and on the real device that produced the original report**, visit: `/admin`, `/admin/companies/[id]` (all 5 tabs), `/admin/audit`, `/admin/links`, `/links`, `/company/metrics`, `/setup-wizard` (step 2), `/updates/new`, `/updates/[id]` (draft, scheduled, and confirm-publish states), `/admin/digest/[id]`, `/providers` (card grid) — **no horizontal page scrollbar on any of them** (`document.scrollingElement.scrollWidth === clientWidth` in the console is the honest check)
- [x] `/providers` card grid: verified in headless Chrome at a true 375px viewport (CDP device-metrics override) — `scrollWidth === clientWidth === 375` after the `grid-cols-1` fix, badge and Endorse button fully on-screen (was off-screen before)
- [ ] Documents/alerts/overdue/audit tables scroll horizontally *within their card* at 375 px; every column reachable
- [ ] Tab strip on company detail scrolls; Notes tab reachable at 375 px
- [ ] Link cards: label + expiry fully readable; action buttons on their own row; confirm-delete state doesn't overflow
- [ ] Both metric forms and the wizard metric rows: all inputs full-width-ish and tappable, Add button reachable
- [ ] Desktop (≥ 1280 px) screenshot of each touched page matches pre-change rendering
- [x] `npm run typecheck && npm run lint && npm test` pass (2026-07-07; `npm run build` also passed)
- [ ] Remaining device-dependent checklist items above require a real phone/devtools walk — not verifiable by the implementing agent; see final report for the walk list

**UX impact:** phone-width rendering goes from broken to usable on 10 surfaces; at ≥ 640 px every touched page renders pixel-identically (all techniques inert when space suffices). No flow, copy, or data changes.
**Cost impact:** zero — Tailwind classes only, no new dependencies or services.

---

## WS15 — Polish pass: borderline rows, cramped modals, conformance (~0.5–1 day)

**Goal:** finish the inventory — the crushed-but-functional rows, the cramped modal grids, and the "borderline, add wrap for safety" spots — so the app has one consistent answer to narrow widths. Optional: WS14 alone fixes everything a user has actually reported or that provably breaks.

> **Status (2026-07-07): WS15.1–WS15.3 shipped and verified live** (commit `cf06796`, deployed to `molly.dfslab.net`). JC2 (diff-modal stacking) adopted as recommended. Quality gates (`typecheck`, `lint`, `test`, `build`) passed; no new lint errors. Live curl check: `/`, `/login`, `/investors` 200; `/providers`, `/admin`, `/team`, `/admin/approvals`, `/admin/companies`, `/admin/companies/new`, `/admin/digest`, `/admin/companies/[id]` all 307-redirect to `/login` as expected with no session — no 500s. WS15.4 (device walk) was **not performed** — no code, and the implementing agent cannot render mobile layouts on a physical device; the checklist is handed to the user in the final report instead.

### WS15.1 Member/approval/notes rows → Pattern B
- `src/app/admin/companies/[id]/page.tsx:1392` (Members) and `src/app/team/page.tsx:263`: outer row → `flex flex-wrap items-center gap-3`; give the avatar+name block `min-w-48 flex-1` (on the company-detail one, also add `min-w-0` + `truncate` to the name/email `<p>`s — long emails are the overflow vector); action cluster gets `shrink-0`.
- `src/app/admin/approvals/page.tsx:146`: same treatment (text block already has `min-w-0 flex-1` — change to `min-w-48 flex-1` and add `flex-wrap` + drop `justify-between` on the outer row, `shrink-0` on the button cluster).
- `src/app/admin/companies/[id]/page.tsx:1583` (Notes rows): already `min-w-0` + `shrink-0`; add `flex-wrap` to the outer row and upgrade the text div to `min-w-48 flex-1` for conformance.
- `src/app/admin/digest/page.tsx:90`: same one-line conformance change (lowest priority in this WS).

### WS15.2 Modal field grids
- `src/app/admin/providers/page.tsx:311` and `:353`, `src/app/providers/page.tsx:317`: `grid grid-cols-2 gap-3` → `grid grid-cols-1 gap-3 sm:grid-cols-2`. (Name/Type, Country/City stack on phones; identical at `sm:`+.)
- `src/app/admin/companies/[id]/page.tsx:1703` (JC2): `grid flex-1 grid-cols-2 overflow-hidden divide-x` → `grid flex-1 grid-cols-1 divide-y overflow-y-auto sm:grid-cols-2 sm:divide-y-0 sm:divide-x` (switch `overflow-hidden` to `overflow-y-auto` so stacked panes scroll within the modal).

### WS15.3 Header/cluster conformance (add `flex-wrap`, nothing else)
- `src/app/admin/companies/page.tsx:183` — header action `flex gap-2` → `flex flex-wrap gap-2`.
- `src/app/admin/companies/[id]/page.tsx` header action wrapper (the div holding Delete/confirm/Back, ~line 630) → add `flex-wrap`.
- `src/app/admin/companies/[id]/page.tsx:1151` — Documents upload row → `flex flex-wrap items-center gap-2`.
- `src/app/admin/companies/new/page.tsx:226` — assignment toggle → `flex flex-wrap gap-3`.

### WS15.4 Device-verification list (no code, 15 minutes on a phone)
Walk these and file anything that still looks wrong as new findings: setup-wizard step indicator; `/share/[token]` with a real link containing inline images (prose `max-w-full` should handle them — confirm); the share email-gate; `/admin/approvals` with a long email; a members list with a long email; the company-detail Metrics tab chart at 375 px.

### WS15 acceptance checklist
- [ ] At 375 px: members (`/team` + admin company detail), approvals, notes, and digest-list rows show full text with action clusters wrapped below when needed; no page-level horizontal scroll — device-dependent, not verifiable by the implementing agent
- [ ] Provider modals (all three forms) show stacked fields at 375 px, two-up at ≥ 640 px — device-dependent, not verifiable by the implementing agent
- [ ] Notes diff modal at 375 px: Before pane above After pane, scrollable; desktop side-by-side unchanged — device-dependent, not verifiable by the implementing agent
- [ ] WS15.4 device walk done; new findings (if any) recorded in this doc as F-items — **not performed by the implementing agent; see final report for the device-walk checklist handed to the user**
- [x] Desktop screenshots of touched pages unchanged — no JSX restructuring, only className additions inert at ≥640px (verified by code review, not a rendered screenshot); quality gates pass: `typecheck`, `lint` (no new errors), `test` (74/74), `build` all green, 2026-07-07

**UX impact:** additive-only; the single deliberate mobile-behavior change is the diff modal stacking (JC2). Desktop pixel-identical everywhere.
**Cost impact:** zero.

---

## Part 6 sequencing & effort

WS14 → WS15, independent commits. No schema pushes, no env changes, no product-decision gates (JC1/JC2 recommendations are adopted unless the user objects).

| WS | Item | Effort | Gated on |
|---|---|---|---|
| WS14 | Confirmed phone-width breakers (tables, tab bar, form rows, link cards, banners, headers) | ~1d | nothing |
| WS15 | Polish: borderline rows, modal grids, conformance, device walk | 0.5–1d | nothing (optional; JC2 inside it) |

**Total: ~1.5–2 junior-engineer days.** If choosing one, ship WS14 — it covers every provable break including everything in the same family as the original `/admin/providers` report.

## Part 6 roadmap bookkeeping

`ROADMAP.md` updated alongside this plan: a **Mobile-Width Layout Hardening** row added to P2 (pointing here), and the P3 **Mobile-Optimized Update Flow** row annotated to reconcile the two — that item is a founder-flow *interaction redesign* (simplified metric entry, mobile-first composer); this Part is app-wide *layout correctness* at phone widths and neither replaces nor depends on it.

**Done (2026-07-07):** WS14 and WS15 both shipped same-day; the P2 row was folded into "Existing Features" → Design & Branding in `ROADMAP.md`, and the P3 Mobile-Optimized Update Flow annotation was updated from "planned" to "shipped" to reflect that layout correctness is now live.

---

# Part 7 — LP Fund-Report Portal (WS16–WS19)

_Added 2026-07-08. The largest feature since the platform was built: a web-native replacement for DFS Lab's twice-yearly PDF fund reports to LPs. Same hard constraints as Parts 1–6: **no new cost lines** (existing Vercel/Neon/S3/Resend/Anthropic + free tooling), **no UX regressions** (everything here is a new surface — founders, admins, and investor-link recipients see nothing change until they opt in), **additive-only schema changes** (all new tables; two back-relation fields on existing models, which add no DB columns)._

**Every infrastructure claim below was re-verified against the working tree on 2026-07-08**, and the source spreadsheet was re-parsed from scratch (openpyxl) rather than trusting the briefing — which turned out to matter; see F17.

## What this feature is

DFS Lab runs multiple funds/vehicles (FUND1–3, FUND4, FUND5, CAF1, plus a MISC bucket of one-off SPVs). Twice a year each fund's LPs get a letter-style report narrating fund performance and highlighting portfolio companies. Today that's a PDF; this makes it web pages in Molly:

1. **One page per fund report** — letter-style prose; portfolio companies mentioned in the text are highlighted, and hovering (tapping, on mobile) a company name shows a card with the markup on its valuation vs. when DFS invested.
2. **LP access** — an LP enters their email at `/lp`, receives a one-time code, verifies, and lands on a library listing every published report across all funds they're in. Sessions last ~30 days.
3. **Aesthetic** — the LP surface takes its look from www.dfs.vc (the public site), not Molly's app chrome.
4. **Admin side** — manage LPs, funds, deals/valuations; author reports in the existing TipTap editor with an explicit company-mention picker; publish.

### Decisions already made by the user (2026-07-08) — baked in throughout

| Decision | How the plan implements it |
|---|---|
| **Hover markup numbers are frozen at publication** | `FundReportMention.snapshot` (Json) is computed from `Deal` rows and written at publish time; LP pages read only the snapshot. Draft previews compute live; the next report re-freezes fresh numbers. |
| **Molly is the source of truth after a one-time import** | WS16's importer is a run-once script; all ongoing edits happen through admin CRUD on funds/deals/valuations. No recurring upload workflow. **Partially superseded 2026-07-15 (Part 10, Q22-B):** during a sheet-backed transition period, sheet-owned deal/valuation fields sync one-way from the Deals sheet and become read-only in admin CRUD *while sync is enabled* (WS27.5); Molly remains the analytical read layer and the long-term source of truth, and forks/deploys without Google env vars keep this row's original behavior exactly. |
| **Explicit mention picker, not name auto-detection** | `@tiptap/extension-mention` in the report editor; typing `@` opens a picker scoped to the fund's portfolio companies. |
| **LP sessions last ~30 days** | `LpSession.expiresAt = verify time + 30 days`, fixed (no sliding renewal — simplest honest implementation; sliding is an additive change later). |

## Part 7 ground rules (carry-over + additions)

All Part 2/Part 5 ground rules apply (additive `db push` before code, per the `vercel env pull --environment=production` procedure; match code style; `export const dynamic = "force-dynamic"` on route files; never change existing response shapes; `npm run typecheck && npm run lint && npm test` before every push; one workstream per commit-and-verify cycle on the live deploy). Additions specific to this feature:

1. **CONFIDENTIALITY — the repo is public (MIT, intentionally).** Valuation data, LP names/emails, and the tracker spreadsheet must **never** enter the repo. Concretely:
   - The importer is code-only: it takes the xlsx path as a CLI argument pointing **outside the repo** (`~/Downloads/...`). No fixtures, no seed files, no committed JSON dumps, no sample rows with real numbers in tests or docs — unit tests use synthetic data only.
   - Add `*.xlsx` to `.gitignore` (defensive; the file should never be inside the tree anyway — verified `.gitignore` currently has no such guard).
   - Importer dry-run output prints real valuations to the terminal — never paste it into commits, PR bodies, or issues.
   - No real LP emails or fund numbers in acceptance-testing screenshots either.
2. **The LP surface is a sessionless-client family.** This codebase has had **four** bugs from forgetting that middleware gates everything without a NextAuth session (`/api/cron` F1-adjacent, `/brand`, `/api/share` F15, inline images F16). Every LP page and LP API route must be in `PUBLIC_PREFIXES` with its **own** auth layer (the LP session cookie), and WS18 adds regression tests for each — plus a design countermeasure: LP pages are **Server Components that read the DB directly**, so the read path has no client-side API fetches to forget to public-prefix at all. The only client→API calls in the whole LP surface are the three auth endpoints.
3. **Resend must be verified working before WS18 ships** (key rotated 2026-07-06 per `ROADMAP.md`/memory; re-confirm via `/admin/settings` → Send Test Email). WS16–WS17 don't touch email.
4. **New free tooling used** (allowed — free, MIT): `@tiptap/extension-mention@^3` (runtime dep, pairs with the installed TipTap 3.19), and `xlsx` + `tsx` as devDependencies for the one-time importer. No new services, no new cost lines.

## Part 7 review findings

Continuing the F-numbering (Part 5/6 ended at F16):

**F17 — The briefing's spreadsheet parse was wrong in ways that would have corrupted the import (HIGH for the importer, found by re-parsing the file 2026-07-08).**
The tracker (`DFS Lab Investment Tracker [External-Confidential].xlsx`, sheets `Deals` + `IRR Calc`) does hold ~50 companies across 7 vehicles as described, but four specifics in the briefing don't survive contact with the file:

1. **There are no canonical FUND5 or CAF1 blocks in "IRR Calc".** Row 2 block headers are: FUND1 (col B), FUND2 (P), FUND3 (AD), `FUND1 + FUND2 + FUND3` (AR, aggregate), ALL (BF, aggregate), FUND4 (BU), CUSTOM (CR, aggregate), MISC (DK), `3 YRS+` (DZ, aggregate). FUND5's 2 deals and CAF1's 4 deals exist **only inside the ALL aggregate**. Worse, the standalone FUND4 block is **stale** — 12 deals vs. 19 in ALL (missing all seven 2025–26 FUND4 deals: Northwind ×2, Contoso, Fabrikam, Globex, Initech, and one Umbrella tranche). The briefing's importer strategy ("read only the canonical vehicle blocks") would have silently dropped 13 deals.
2. **The "Deals" sheet is not a derivable summary — it is the best import source in the file.** Rows 16–91 are a clean flat deal table (header row 15: `Company / Vehicle / Investment / Date / Country / Amount / Instrument / Valuation-Cap(post) / Current Valuation / Markups / Implied Value / Notes` in cols C–N): **76 deals, 50 unique companies, all 7 vehicles, zero malformed cells, plus a Notes column** ("Includes $50m in dilution", "Sufficient Capital", …) that exists nowhere else. Verified: its 76 (company, vehicle, type, date, amount) keys **exactly equal** the IRR-Calc ALL block after excluding ALL's 12 leading negative-cashflow helper rows (IRR plumbing that duplicates MISC deals as dated outflows). The importer reads the Deals sheet, full stop.
3. **The IRR-Calc ALL block is partially corrupted and must not be the source.** Eleven of its current-valuation cells (BN67–BN81 region) are number-formatted as dates; openpyxl surfaces them as `#VALUE!`/`datetime.time` garbage. The same deals are numerically clean in the Deals sheet.
4. **The per-deal "as-of date" column is `=TODAY()`** — every cell reads as the file-open date (2026-07-08). It is not a stored data point and must not be imported as a valuation date; the importer stamps `valuationAsOf` with the import run date instead.

Also material for schema/UI design, confirmed from the flat table: follow-ons are widespread — 30 of 76 rows are `Follow-On` (note the hyphen; the briefing wrote "Follow On"), across far more companies than the briefing's "Widgetco, Bluewave, Greenfield at least". Two companies (Northstar, Southgate) each have **two `Initial` rows** in the same vehicle (same amount/cap, different 2024 dates) — so no uniqueness constraint on (company, fund, type) is possible, and the importer should surface such near-duplicates in its dry-run report for a human eyeball rather than dedupe them. Instrument strings are free text with typos (`Prefered Shares` alongside `Preferred Shares`, plus `Secondary`, `Modified YC SAFE (KEN)`, `Priced Round`) — store as free text, don't enumerate. The Deals sheet also carries per-fund metadata worth importing once: vehicle group labels (row 3: "African Multi-Asset Cohort Funds" over FUND1–3, "Blockchain Fund" over FUND4, "2026 Vintage" over FUND5/CAF1, "Single SPVs" over MISC), First Deal Date (row 5), Deployed (row 6), and AUM (row 7) per vehicle column (row 4, cols B–H; ignore TOTAL and the aggregate columns I–L). Derived columns (Markups, Implied Value, MOIC/TVPI/IRR) are **not** imported — Molly computes multiples from stored valuations.

**F18 — ROADMAP.md's P3 "Portfolio Export / LP Report PDF" row overlaps this feature (docs drift, annotate now).**
That row promises "multi-company polished PDF for LP reporting." This portal is the deliberate successor to the PDF workflow — the row must be annotated so nobody builds a parallel PDF pipeline; the LP-facing print stylesheet (WS19, decision Q11) is the interim escape hatch for LPs who want paper. Annotated in `ROADMAP.md` alongside this plan.

**Infrastructure verification (all confirmed in the working tree 2026-07-08):** `src/lib/email.ts` has exactly 10 `send*` templates — the OTP email becomes #11. `src/lib/rate-limit.ts` exists as described (`checkRateLimit(bucket, identifier, limit)`, 1-hour fixed windows, **fails open** on DB errors — fine for its current auth buckets, but OTP verification needs a fail-closed layer, so WS18 caps attempts on the OTP row itself). `PUBLIC_PREFIXES` in `src/lib/route-access.ts:34` currently lists 10 prefixes; `/lp` + `/api/lp` will be #11–12. `ShareableLink` tokens use `crypto.randomBytes(24).toString("hex")` (`api/links/route.ts:82`) — the LP session token reuses the pattern at 32 bytes. TipTap is `^3.19.0` (8 packages); `@tiptap/extension-mention` is **not installed** (new free dep, noted in ground rule 4); `RichEditor` (`src/components/ui/rich-editor.tsx`) already has the external-value sync fix and takes no extensions prop — WS17 adds one additively. Three daily crons exist (`vercel.json`); **this feature needs zero crons** (OTP/session expiry is enforced at read time; stale-row cleanup piggybacks opportunistically, same trick as `rate-limit.ts:24`). Route namespaces `/lp`, `/admin/funds`, `/admin/lps`, `/admin/reports` are all free (checked `src/app/`). `scripts/` exists (raw SQL precedent) — the importer lives there. `Company.aliases String[]` exists and is used for import-time company matching. The dfs.vc aesthetic was studied from the local `~/GitHub/dfsweb` source + the brand skill (`~/.claude/skills/dfs-brand-style`), since the live site 403s automated fetches; the app already loads all three brand fonts globally in `src/app/layout.tsx`, so the LP surface needs no font work. One briefing claim I could not independently verify without pulling prod credentials: that Contoso and Lantern already exist as Molly `Company` rows — the import plan treats matches as suggestions regardless, so nothing depends on it.

## Part 7 technical judgment calls (made here, flagged per protocol — each with a cheap reversal)

- **JC4 — LP auth is a separate opaque-token cookie, NOT a NextAuth audience.** NextAuth's JWT carries `roles`/`status` that the middleware (`route-access.ts`) and `auth-guard.ts` interpret for founder/admin gating; grafting a fourth audience onto it risks the exact security surface WS2 exists to protect, and NextAuth's middleware runs on the edge where Prisma can't go anyway. Instead: `LpSession` table (random 32-byte hex token, 30-day expiry, revocable by row deletion), `lp_session` httpOnly/secure/sameSite=lax cookie, checked in pages/routes via `src/lib/lp-auth.ts` — Postgres-backed, zero new deps, same philosophy as the ShareableLink token and the Postgres rate limiter. Reversal: the helper is one function; swapping its internals for anything else later touches no callers.
- **JC5 — LP pages are Server Components reading the DB directly** (modeled on `admin/settings/page.tsx` / `admin/audit/page.tsx`), not client pages fetching APIs. This is the structural fix for the four-bug F15 family (ground rule 2): the read path can't forget a public prefix it doesn't have. Only the three auth mutations (`request`, `verify`, `logout`) are client-called APIs. Reversal: standard Next.js either way.
- **JC6 — the mention picker is scoped to portfolio companies with deals in the report's fund.** Mentioning a company the fund never invested in would render a hover card with no numbers — nonsense in an LP report. If a report ever needs to name a non-fund company, the author just types the name without mentioning it. Reversal: delete one `where` clause.
- **JC7 — anti-enumeration on OTP request.** `POST /api/lp/auth/request` returns the same generic 200 whether or not the email belongs to an LP (LP lists are confidential; the repo — and thus the endpoint's existence — is public). Failure to send (Resend down) is logged but still returns the generic 200. Reversal: one branch.
- **JC8 — importer deps as devDependencies** (`xlsx` for parsing, `tsx` for running TS scripts) rather than a Python sidecar: one language, one script, reviewable in the repo, useful to forks importing their own trackers. Reversal: `npm remove`.
- **JC9 — `RichEditor` gains one optional prop** (`extraExtensions?: AnyExtension[]`, default `[]`, spread into the extensions array) instead of a forked editor component. Founders' editor is byte-identical when the prop is absent; the report editor passes the configured Mention extension. Reversal: revert one prop.

## Part 7 open product decisions (Q6–Q14 — answer before the gated workstream ships)

> **All decided 2026-07-08 (user review). Two answers differ from the recommendations:**
> **Q6 = since-first-check headline** (not blended): the hover card leads with the multiple from the earliest deal's entry valuation to the current valuation, e.g. "4.6x since first check (Oct 2020)", with the per-deal breakdown beneath. Blended math is not shown.
> **Q7 = B** (opt-in notify checkbox) · **Q8 = start fresh** · **Q9 = `/lp`** · **Q10 = edit-in-place + session revoke** · **Q11 = print stylesheet** · **Q12 = A** (MISC stays one fund) · **Q13 = A** (unpublish-to-edit, republish re-freezes) · **Q14 = exact-match auto-link only**.
> **WS17.2 hover-card detail flag = FULL detail** (differs from the plan's multiples-first conservatism): cards show DFS check sizes, multiples, AND entry → current company valuations in dollars (e.g. "$4M → $18.5M"). LPs see everything the spreadsheet's Deals sheet knows about a position.
> Nothing remains gated; WS16 can start.

Per protocol these are the user's calls; recommendations attached. **Q6, Q12–Q14 gate WS16/17 details; Q7–Q11 gate WS18/19.** None block starting WS16 if the recommendations are acceptable defaults.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q6** | **Follow-on presentation in the hover card.** 22+ companies have multiple deals (30 of 76 rows are follow-ons; Northstar/Southgate even have two Initials each). What does the card headline say? | **A.** Blended multiple headline (Σ implied value ÷ Σ invested across the fund's deals in that company), with a small per-deal breakdown beneath. **B.** Per-deal rows only. **C.** Initial-deal multiple only. | **A.** The headline answers the LP's real question ("how is our money in this company doing") in one number; the per-deal rows keep it honest. C misleads whenever follow-ons dominate; B has no headline. |
| **Q7** | **Notify LPs by email when a report publishes?** | **A.** No email — LPs visit `/lp` when told out-of-band. **B.** Optional "Notify LPs of this fund" checkbox on the publish confirm (template #12); no unsubscribe mechanism in v1. **C.** Automatic email on every publish + unsubscribe link. | **B.** Twice-yearly, relationship-based investor mail from their own fund manager doesn't need self-serve unsubscribe machinery in v1 (the email includes the support contact); automatic-with-no-opt-out (C) removes admin control, and A makes the portal undiscoverable. If you want zero email risk at launch, A is fine and B is purely additive later — WS19 isolates it. |
| **Q8** | **Backfill old PDF reports as historical entries?** | Start fresh / backfill as attached PDFs / retype old reports as web pages | **Start fresh.** The schema doesn't preclude a later `pdfDocumentId` on `FundReport`; retyping history has no reader demand yet, and attaching PDFs needs an admin upload surface this plan doesn't otherwise build. |
| **Q9** | **URL namespace.** | `/lp` (+ `/api/lp`) vs. `/reports` | **`/lp`.** Short, audience-honest, zero collision risk (`/updates` already means founder updates; a founder-visible word like "reports" invites future clashes). Note: `PUBLIC_PREFIXES` matches by `startsWith`, so **no authenticated route may ever be created under a path starting with `/lp`** — same discipline the existing 10 prefixes already require. |
| **Q10** | **LP email change.** | Admin edits the email in place / delete + recreate | **Edit in place** on `/admin/lps` (audit-logged with old→new in metadata), **revoking the LP's active sessions** in the same transaction (`deleteMany LpSession`) — the old inbox must not retain access via a live cookie. Fund memberships and report visibility are keyed to the LP row and survive untouched. |
| **Q11** | **Print/PDF escape hatch for LPs who want the old format?** | None / `@media print` stylesheet / real PDF generation | **Print stylesheet** (WS19, ~half a page of CSS): hides chrome, sets a print-safe white background and readable serif-free text; the browser's Print-to-PDF does the rest. Real PDF generation is the P3 roadmap item this feature supersedes (F18) — don't build it here. |
| **Q12** | **How to model the MISC bucket.** The spreadsheet lumps all one-off SPVs into one "MISC" vehicle, but in reality each single-deal SPV likely has its own distinct LP set. | **A.** Import MISC as one `Fund` like the others; simply don't author reports for it until needed. **B.** Split into per-deal funds at import. | **A.** It keeps the import faithful to the source and costs nothing; if DFS ever reports to single-SPV LPs, splitting is additive admin CRUD work (create fund, reassign deal). B invents 12 funds and their LP rosters from data the spreadsheet doesn't contain. |
| **Q13** | **Published-report lifecycle.** Can a published report be edited? | **A.** Unpublish-to-edit: published reports are read-only; "Unpublish" flips to DRAFT (report disappears from `/lp`), edit, republish **re-freezes snapshots as of republish time**. **B.** Allow in-place edits of published body text without touching frozen snapshots. | **A.** One mental model — *published = frozen, both prose and numbers* — matches the user's snapshot decision and avoids the "the text says 4× but the card says 5×" divergence B invites. The brief unpublish window is invisible in practice (LPs check the portal rarely). |
| **Q14** | **Auto-link imported portfolio companies to existing Molly `Company` rows?** | Suggestions only (admin links manually later) / auto-link exact matches / fuzzy auto-link | **Auto-link only unambiguous exact matches** (case-insensitive on `Company.name` and `Company.aliases`), print everything else as suggestions in the dry-run report, and expose the link as an editable field on the admin portfolio-company form. Linkage is cosmetic in v1 (future: pull logo/website into hover cards) — nothing breaks if it's wrong or absent, but fuzzy auto-linking wrong is embarrassing in an LP-facing surface later. |

---

## WS16 — Foundation: schema, one-time importer, admin funds/LPs/deals management (3–3.5 days) — SHIPPED 2026-07-08

**Goal:** the data layer exists, the spreadsheet's 76 deals / 50 companies / 7 funds are in production Postgres, and admins can CRUD all of it. Admin-only — founders and investors see nothing. No email, no LP surface yet.

**Confirmed decisions baked in:** Molly is the post-import source of truth; Q12 = A and Q14 = auto-link-exact recommended defaults (adjust if the user overrides).

### WS16.1 Schema (additive — all new tables + two relation-list fields; `db push` before code)

Append to `prisma/schema.prisma`:

```prisma
// ─── LP Fund-Report Portal ────────────────────────────────

model Fund {
  id            String    @id @default(cuid())
  slug          String    @unique // import key, e.g. "FUND1" — never shown to LPs
  name          String    // display name, editable, e.g. "FUND1" or "DFS Lab SPV I"
  groupLabel    String?   // e.g. "African Multi-Asset Cohort Funds" (Deals sheet row 3)
  firstDealDate DateTime?
  aumUsd        Decimal?
  sortOrder     Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  deals   Deal[]
  lps     LpFundMembership[]
  reports FundReport[]

  @@map("funds")
}

model PortfolioCompany {
  id        String   @id @default(cuid())
  name      String   @unique
  country   String?
  companyId String?  @unique // optional link to an operational Molly Company (Q14)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company  Company?            @relation(fields: [companyId], references: [id], onDelete: SetNull)
  deals    Deal[]
  mentions FundReportMention[]

  @@map("portfolio_companies")
}

model Deal {
  id                 String    @id @default(cuid())
  fundId             String
  portfolioCompanyId String
  investmentType     String    // "INITIAL" | "FOLLOW_ON"
  dealDate           DateTime
  country            String?
  amountUsd          Decimal
  instrument         String?   // free text — source data has typos/variants (F17)
  entryValuation     Decimal?  // valuation/cap (post) at investment
  currentValuation   Decimal?  // admin-maintained after import; 0 = written off
  valuationAsOf      DateTime? // when currentValuation was last set (import date initially, F17.4)
  notes              String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  fund             Fund             @relation(fields: [fundId], references: [id], onDelete: Cascade)
  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)

  @@index([fundId])
  @@index([portfolioCompanyId])
  @@map("deals")
}

model LimitedPartner {
  id        String   @id @default(cuid())
  email     String   @unique // stored lowercased/trimmed
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  funds    LpFundMembership[]
  sessions LpSession[]
  otpCodes LpOtpCode[]

  @@map("limited_partners")
}

model LpFundMembership {
  id        String   @id @default(cuid())
  lpId      String
  fundId    String
  createdAt DateTime @default(now())

  lp   LimitedPartner @relation(fields: [lpId], references: [id], onDelete: Cascade)
  fund Fund           @relation(fields: [fundId], references: [id], onDelete: Cascade)

  @@unique([lpId, fundId])
  @@map("lp_fund_memberships")
}

model LpOtpCode {
  id         String    @id @default(cuid())
  lpId       String
  codeHash   String    // sha256 hex of the 6-digit code — never store the code
  expiresAt  DateTime  // request time + 10 minutes
  attempts   Int       @default(0) // fail-closed cap of 5 (rate limiter fails open — this doesn't)
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  lp LimitedPartner @relation(fields: [lpId], references: [id], onDelete: Cascade)

  @@index([lpId, createdAt])
  @@map("lp_otp_codes")
}

model LpSession {
  id         String   @id @default(cuid())
  token      String   @unique // crypto.randomBytes(32).toString("hex")
  lpId       String
  expiresAt  DateTime // verify time + 30 days, fixed
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())

  lp LimitedPartner @relation(fields: [lpId], references: [id], onDelete: Cascade)

  @@index([lpId])
  @@map("lp_sessions")
}

model FundReport {
  id          String    @id @default(cuid())
  fundId      String
  title       String    // e.g. "FUND1 — H1 2026 Report"
  periodLabel String?   // e.g. "H1 2026"
  body        String    @db.Text // TipTap HTML incl. mention spans (data-portco)
  status      String    @default("DRAFT") // "DRAFT" | "PUBLISHED"
  publishedAt DateTime?
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  fund      Fund                @relation(fields: [fundId], references: [id])
  createdBy User                @relation("CreatedFundReports", fields: [createdById], references: [id])
  mentions  FundReportMention[]

  @@index([fundId, status])
  @@map("fund_reports")
}

model FundReportMention {
  id                 String   @id @default(cuid())
  reportId           String
  portfolioCompanyId String
  companyName        String   // display name frozen at publish
  snapshot           Json     // frozen at publish — shape in WS17.2
  createdAt          DateTime @default(now())

  report           FundReport       @relation(fields: [reportId], references: [id], onDelete: Cascade)
  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)

  @@unique([reportId, portfolioCompanyId])
  @@map("fund_report_mentions")
}
```

Back-relations (no DB columns — still additive): on `Company` add `portfolioCompany PortfolioCompany?`; on `User` add `createdFundReports FundReport[] @relation("CreatedFundReports")`.

Strings, not enums, for `investmentType`/`status` — house convention (`AuditLog.action`, `Document.docType`, `MetricAlert.rule`). `Decimal` for money, matching `MetricValue.value`.

### WS16.2 One-time importer (`scripts/import-investment-tracker.ts`)

`npm install -D xlsx tsx`. Run as:

```bash
# dry-run (default): parse + validate + print what WOULD be written; touches nothing
npx tsx scripts/import-investment-tracker.ts ~/Downloads/"DFS Lab Investment Tracker [External-Confidential].xlsx"
# real run against prod (env pulled per the Part 2 ground-rule procedure):
DATABASE_URL="<from .env.local>" npx tsx scripts/import-investment-tracker.ts <path> --write
```

Parsing rules (all verified against the actual file — F17):

1. **Source: the `Deals` sheet flat table only.** Find the header row by scanning column C for the cell `"Company"` (row 15 today — scan, don't hardcode); data rows follow until the first row with a non-string company cell. Columns (0-indexed from A): C=name, D=vehicle, E=investment type (`"Initial"`/`"Follow-On"` → `INITIAL`/`FOLLOW_ON`), F=date, G=country, H=amount, I=instrument (free text, trimmed, imported verbatim — typos included), J=entry valuation, K=current valuation, N=notes. **Skip columns L/M (Markups, Implied Value — derived) and O–Q (segmentation helpers).** Expect exactly 76 rows / 50 distinct companies / vehicles `{FUND1, FUND2, FUND3, FUND4, FUND5, CAF1, MISC}` — hard-fail with a diff if the file has drifted from these verified counts, so a stale re-run can't half-import.
2. **Fund metadata from the same sheet's header block**: vehicle slugs in row 4 cols B–H (ignore `TOTAL` col I and aggregate cols J–L), `firstDealDate` row 5, `aumUsd` row 7, `groupLabel` best-effort from the merged row-3 labels (null if the merge lookup is awkward — it's an editable display field). `sortOrder` = column order.
3. **Never read the `IRR Calc` sheet** (stale FUND4 block, `#VALUE!`-corrupted valuation cells, duplicated MISC helper rows — F17.1/.3).
4. `valuationAsOf` = the import run timestamp, not the sheet's `=TODAY()` column (F17.4).
5. **Idempotent**: upsert `Fund` by `slug`, `PortfolioCompany` by `name` (trimmed); for `Deal`, find-first on `(fundId, portfolioCompanyId, investmentType, dealDate, amountUsd)` and only create when absent (re-running after a partial failure is safe; the schema deliberately has no unique constraint here because genuine near-duplicate tranches exist — Northstar/Southgate, F17).
6. **Company matching (Q14)**: for each `PortfolioCompany`, look up Molly `Company` where `name` matches case-insensitively or appears in `aliases`; auto-link only single unambiguous matches (`--write` sets `companyId`), print all candidates in the report.
7. **Dry-run report** (terminal only — confidential, ground rule 1): per-fund deal/company counts, total invested per fund vs. the sheet's `Deployed` row as a checksum, the near-duplicate rows (same company+fund+type, e.g. the double-Initials) flagged for human review, unmatched/matched Molly companies, and any row skipped with its reason. `--write` prints the same, then writes inside a transaction.

### WS16.3 Admin API routes

All `requireAdmin`, guard→validate→act pattern, `force-dynamic`, audit-logged via `logAdminAction`:

- `src/app/api/admin/funds/route.ts` — GET (list, incl. `_count` of deals/lps/reports), POST (create: `slug` unique + non-empty ≤40 chars, `name` non-empty ≤120). `FUND_CREATED`.
- `src/app/api/admin/funds/[id]/route.ts` — PATCH (name/groupLabel/aumUsd/firstDealDate/sortOrder; slug immutable), DELETE (**409 unless the fund has zero deals, LPs, and reports** — no destructive cascades from a misclick). `FUND_UPDATED` / `FUND_DELETED`.
- `src/app/api/admin/portfolio-companies/route.ts` — GET (list; optional `?fundId=` filters to companies with deals in that fund — WS17's picker reuses this), POST (create: name unique). `PORTCO_CREATED`.
- `src/app/api/admin/portfolio-companies/[id]/route.ts` — PATCH (name/country/companyId link), DELETE (409 unless zero deals and zero mentions). `PORTCO_UPDATED` / `PORTCO_DELETED`.
- `src/app/api/admin/deals/route.ts` — POST (create: fundId + portfolioCompanyId exist, `investmentType` ∈ {INITIAL, FOLLOW_ON}, dealDate parseable, amountUsd > 0; valuations optional ≥ 0). `DEAL_CREATED`.
- `src/app/api/admin/deals/[id]/route.ts` — PATCH (any field; **setting `currentValuation` also sets `valuationAsOf: new Date()`** — this is the ongoing valuation-maintenance path now that Molly is the source of truth), DELETE (hard delete with confirm in UI). `DEAL_UPDATED` (metadata: old→new valuation) / `DEAL_DELETED`.
- `src/app/api/admin/lps/route.ts` — GET (list with fund memberships), POST (create: email valid per the WS1.3 regex, lowercased, unique; optional name + fundIds[]). `LP_CREATED`.
- `src/app/api/admin/lps/[id]/route.ts` — PATCH (name; **email change lowercases, revokes all `LpSession` rows in the same transaction, audit metadata `{ from, to }`** — Q10), DELETE (cascade removes memberships/sessions/OTPs; confirm dialog in UI). `LP_UPDATED` / `LP_DELETED`.
- `src/app/api/admin/lps/[id]/funds/route.ts` — POST `{ fundId }` / DELETE `{ fundId }` to assign/unassign (upsert on the `@@unique`). `LP_FUND_ASSIGNED` / `LP_FUND_UNASSIGNED`.

### WS16.4 Admin UI

- **`src/app/admin/funds/page.tsx`** (client, modeled on `admin/providers/page.tsx`): fund cards/table — name, slug badge, group label, AUM, deal/LP/report counts; New Fund modal; row click → detail.
- **`src/app/admin/funds/[id]/page.tsx`** (client, modeled on `admin/companies/[id]/page.tsx` tabs): header (editable fund fields) + three tabs:
  - **Deals** — table (company, type badge, date, amount, instrument, entry val, current val, multiple *computed client-side* as current/entry, valuationAsOf), Add Deal modal (portfolio-company `<select>` with an inline "New company…" option, native inputs per house convention), edit/delete per row. Pattern A (scrollable table with min-width) from Part 6 for phone widths.
  - **LPs** — membership list; assign-existing `<select>` + create-new-LP inline form; remove button.
  - **Reports** — list of this fund's reports with status badges, linking into WS17's editor (empty until WS17 ships; render the tab from the start with an EmptyState).
- **`src/app/admin/lps/page.tsx`** (client): LP table (email, name, fund chips, created), New LP modal, edit modal (email change shows a "this signs the LP out everywhere" note), delete with confirm.
- **Sidebar** (`src/components/layout/sidebar.tsx` `adminNav`): `{ label: "Funds", href: "/admin/funds", icon: Landmark }` and `{ label: "LPs", href: "/admin/lps", icon: Handshake }` (both icons exist in lucide-react), inserted after "Companies".

**WS16 acceptance checklist**
- [ ] `db push` applied additively; existing app behavior unchanged (spot-check dashboard, updates, share link)
- [ ] Importer dry-run against the real xlsx prints 76 deals / 50 companies / 7 funds, per-fund invested totals matching the sheet's `Deployed` row, and flags the Northstar/Southgate double-Initial rows for review
- [ ] Importer `--write` against prod populates the tables; **re-running it creates zero new rows** (idempotency)
- [ ] No spreadsheet data anywhere in the repo: `git status` clean of xlsx/JSON artifacts; `*.xlsx` in `.gitignore`; tests contain only synthetic numbers
- [ ] Admin can create/edit a fund, add a deal, edit a current valuation (and `valuationAsOf` updates), create an LP, assign them to two funds; every mutation appears in `/admin/audit`
- [ ] Deleting a fund with deals → 409 with readable message; empty fund deletes
- [ ] LP email change revokes sessions (verify after WS18; until then, assert the `deleteMany` is in the transaction via code review + unit test)
- [ ] Founders get 401/403 from every `/api/admin/funds|lps|deals|portfolio-companies` route; `/admin/funds` redirects founders to `/dashboard` (existing middleware `/admin` gating)
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** admin-only additions (two sidebar entries, three new pages); founders/investors see nothing. **Cost impact:** none — two devDeps, small tables, no services. **Schema:** additive (8 new tables + 2 relation-list fields).

---

## WS17 — Report authoring, mentions, snapshot publishing (2.5–3 days) — SHIPPED 2026-07-08/09 (Q6 headline is since-first-check, not blended, per the Part 7 decision banner — this diverges from the body text below, which predates that banner)

**Goal:** admins write letter-style fund reports in the existing editor, mention portfolio companies via an explicit `@` picker, preview exactly what LPs will see, and publish — freezing valuation snapshots at that instant. Still admin-only; nothing is LP-visible until WS18.

**Gated on:** Q6 (blended-multiple recommendation assumed), Q13 (unpublish-to-edit assumed).

### WS17.1 Mention extension

`npm install @tiptap/extension-mention` (v3, matches the installed TipTap 3.19 packages). New file `src/components/ui/portco-mention.ts`:

```ts
import Mention from "@tiptap/extension-mention";

/**
 * Portfolio-company mention for fund reports.
 * Deterministic HTML so the server can extract ids with one regex:
 *   <span data-portco="<id>" class="portco-mention"><name></span>
 */
export function portcoMention(fetchItems: (query: string) => Promise<{ id: string; label: string }[]>) {
  return Mention.configure({
    renderHTML({ node }) {
      return ["span", { "data-portco": node.attrs.id, class: "portco-mention" }, node.attrs.label];
    },
    // parseHTML so editing an existing report round-trips the spans back into mention nodes
    suggestion: {
      char: "@",
      items: ({ query }) => fetchItems(query),
      render: /* dropdown positioned under the caret; style like the app's native selects;
                 arrow keys + Enter select; Esc closes — follow the tiptap-mention docs example,
                 plain DOM, no new UI dep */
    },
  });
}
```

Add the JC9 prop to `src/components/ui/rich-editor.tsx`: `extraExtensions?: AnyExtension[]` (default `[]`), spread after the existing extensions. **No other RichEditor change** — founder surfaces pass nothing and render byte-identically.

### WS17.2 Pure snapshot + extraction helpers (tested)

New file `src/lib/report-snapshot.ts` — pure functions, `route-access.ts` extract-and-test pattern:

```ts
export interface DealInput {
  investmentType: string;      // "INITIAL" | "FOLLOW_ON"
  dealDate: Date;
  amountUsd: number;           // caller Number()s Prisma Decimals, house convention
  entryValuation: number | null;
  currentValuation: number | null;
}

export interface MentionSnapshot {
  companyName: string;
  country: string | null;
  totalInvestedUsd: number;
  totalImpliedValueUsd: number;   // Σ amount × per-deal multiple (deals with unknown multiple contribute their amount at 1×? NO — they are excluded from both totals and listed as "n/a"; see rules)
  blendedMultiple: number | null; // totalImplied / totalInvested over deals with known multiples; null if none
  firstDealDate: string;          // ISO date
  deals: Array<{
    investmentType: string;
    dealDate: string;             // ISO
    amountUsd: number;
    multiple: number | null;      // currentValuation / entryValuation; 0 = written off; null = unknown
  }>;
}

export function buildMentionSnapshot(companyName: string, country: string | null, deals: DealInput[]): MentionSnapshot;

/** Extract distinct portfolio-company ids from report HTML (matches WS17.1's renderHTML). */
export function extractMentionIds(html: string): string[]; // /data-portco="([^"]+)"/g, deduped
```

Rules (unit-test each): per-deal `multiple` = `entryValuation > 0 && currentValuation != null ? currentValuation / entryValuation : null` (so `currentValuation === 0` → multiple `0`, rendered "written off" — real case: Redwood, Ironclad, Bluewave); deals with `null` multiple are excluded from both blended totals (never silently counted at 1×) and shown as "n/a" rows; blended multiple = Σ(amount×multiple)/Σ(amount) over included deals, `null` when none; per-deal rows are the raw material for Q6's presentation either way, so a Q6 override only changes the LP-page rendering, not this shape. **The hover card intentionally shows multiples and relative dates, not raw valuations** — flag: if the user wants dollar valuations visible to LPs, that's a one-line rendering addition, but multiples leak less if a link/session ever escapes.

Tests (`src/lib/__tests__/report-snapshot.test.ts`, synthetic data only): single initial deal; initial + follow-on blending; written-off (current 0); null entry → n/a excluded from blend; all-null → blendedMultiple null; extraction on empty body / duplicated mentions / attribute-order robustness.

### WS17.3 Report API routes

All `requireAdmin` + audit-logged:

- `src/app/api/admin/reports/route.ts` — GET (list, `?fundId=` filter, include fund name + mention count), POST (create DRAFT: fundId exists, title non-empty ≤200). `REPORT_CREATED`.
- `src/app/api/admin/reports/[id]/route.ts` — GET (full row for the editor), PATCH (title/periodLabel/body; **only while DRAFT — 400 "Unpublish first" on PUBLISHED**, Q13; fundId immutable after creation), DELETE (DRAFT only; 409 on PUBLISHED). `REPORT_UPDATED` / `REPORT_DELETED`.
- `src/app/api/admin/reports/[id]/publish/route.ts` — POST: load report (must be DRAFT); `extractMentionIds(body)`; verify every id is a `PortfolioCompany` **with ≥1 deal in the report's fund** (JC6 — 400 listing offenders otherwise); in one transaction: delete existing `FundReportMention` rows for the report, `create` one per mentioned company with `buildMentionSnapshot(...)` over the fund-scoped deals (Number()-ing Decimals), set `status: "PUBLISHED", publishedAt: new Date()`. `REPORT_PUBLISHED` (metadata: mention count).
- `src/app/api/admin/reports/[id]/unpublish/route.ts` — POST: PUBLISHED → DRAFT (keep `publishedAt` for reference; mentions stay until the next publish overwrites them — LP pages only read PUBLISHED reports, so stale drafts leak nothing). `REPORT_UNPUBLISHED`.

### WS17.4 Shared report renderer

New file `src/components/report-view.tsx` — a server-renderable component used by **both** the admin preview and the WS18 LP page (one renderer = preview is honest): takes `{ title, periodLabel, publishedAt, fundName, bodyHtml, mentions: MentionSnapshot[] }`, renders the letter layout (WS18.4 styling) with `dangerouslySetInnerHTML` for the body (admin-authored, same trust model as the share page's founder-authored bodies) and mounts the `MentionCards` client island (WS18.5). Draft previews pass **live-computed** snapshots; published pages pass frozen ones — the component can't tell the difference, by design.

### WS17.5 Admin authoring UI

- **`src/app/admin/reports/page.tsx`** — all reports: title, fund, status badge (DRAFT ochre / PUBLISHED acacia, house tokens), periodLabel, publishedAt; fund filter `<select>`; "New Report" (fund + title + optional period label).
- **`src/app/admin/reports/[id]/page.tsx`** — editor: title/period inputs; `RichEditor` with `extraExtensions={[portcoMention(fetch from /api/admin/portfolio-companies?fundId=<report.fundId>)]}`; a muted helper line "Type @ to mention a portfolio company — mentioned companies get a valuation hover card in the LP view"; Save (PATCH, drafts only); **Preview** link; **Publish** button with confirm ("Publishing freezes today's valuation numbers into this report. Continue?"); on PUBLISHED: read-only body + "Unpublish to edit" button. Mention spans styled in-editor (Sky underline) via the editor's `<style>` block.
- **`src/app/admin/reports/[id]/preview/page.tsx`** — Server Component (`requireAdmin` guard pattern from `admin/settings/page.tsx`): loads the report, computes live snapshots for current mentions, renders `<ReportView>` full-bleed in the LP chrome with a "PREVIEW — draft, numbers not frozen" banner.
- Fund detail's Reports tab (WS16.4) now lists + links into these pages.

**WS17 acceptance checklist**
- [ ] Founder update editor renders byte-identical (no `extraExtensions` passed) — spot-check `/updates/new`
- [ ] Typing `@` in a report shows only companies with deals in that report's fund; selecting inserts a highlighted mention; save/reload round-trips it (parseHTML works)
- [ ] Publish freezes snapshots: publish, then change a deal's `currentValuation` in `/admin/funds/[id]`, re-open the published preview — card numbers unchanged; a **new** report mentioning the same company shows the updated number in its draft preview
- [ ] Mentioning a company, deleting its fund deal, then publishing → 400 with the offending company named
- [ ] PATCH on a PUBLISHED report → 400; unpublish → edit → republish re-freezes (numbers update)
- [ ] Written-off (current valuation 0) renders "written off", not "0×–ish" garbage; null-entry deals render "n/a" and don't skew the blend (unit tests + one manual check)
- [ ] All report mutations in `/admin/audit`; founders 403 on every reports route
- [ ] `npm run typecheck && npm run lint && npm test` green (new snapshot/extraction tests included)

**UX impact:** admin-only; the single shared-surface touch is the additive `RichEditor` prop (default = today's behavior). **Cost impact:** none — one MIT npm package. **Schema:** none beyond WS16's.

---

## WS18 — LP portal: OTP auth, library, report pages (3–3.5 days) — SHIPPED 2026-07-09

**Goal:** the LP-facing surface — email → OTP → 30-day session → library → report pages with hover cards — styled after www.dfs.vc. **Verify Resend works before starting** (ground rule 3).

### WS18.1 LP auth library

New file `src/lib/lp-auth.ts` (JC4):

```ts
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import crypto from "crypto";

export const LP_COOKIE = "lp_session";
export const LP_SESSION_DAYS = 30;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function sha256(s: string) { return crypto.createHash("sha256").update(s).digest("hex"); }
export function newSessionToken() { return crypto.randomBytes(32).toString("hex"); }
export function newOtpCode() { return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0"); }

/** Server-component/route helper: the logged-in LP (with fund memberships) or null. */
export async function getLp() {
  const token = cookies().get(LP_COOKIE)?.value;
  if (!token) return null;
  const session = await db.lpSession.findUnique({
    where: { token },
    include: { lp: { include: { funds: { select: { fundId: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  // touch lastUsedAt at most hourly, best-effort (never blocks the page)
  if (Date.now() - session.lastUsedAt.getTime() > 60 * 60 * 1000) {
    db.lpSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { session, lp: session.lp, fundIds: session.lp.funds.map((f) => f.fundId) };
}
```

Pure decision logic (expiry check, attempt-cap check) lives in small exported functions so it's unit-testable with mocked `db`, mirroring `auth-guard.test.ts`.

### WS18.2 Auth API routes (the only client-called LP endpoints — JC5)

All three under `src/app/api/lp/auth/`, `force-dynamic`, public-prefixed (WS18.6), rate-limited via the existing `checkRateLimit`:

- **`request/route.ts`** POST `{ email }`: validate format (WS1.3 regex), lowercase/trim; rate-limit `("lp-otp-ip", clientIp, 10)` **and** `("lp-otp-email", email, 5)` → 429 with "Too many requests — try again in an hour"; look up `LimitedPartner`; **if found**: create `LpOtpCode` (`codeHash: sha256(code)`, `expiresAt: now + OTP_TTL_MS`) and `sendLpOtpEmail(email, code)` (send failure → `console.error`, still generic response); **always** return `{ ok: true }` with identical timing-insensitive body whether or not the LP exists (JC7). Opportunistically delete expired OTP rows (~1% of calls, `rate-limit.ts:24` trick).
- **`verify/route.ts`** POST `{ email, code }`: rate-limit `("lp-verify-ip", clientIp, 20)` + `("lp-verify-email", email, 10)`; find the LP, then the **newest unconsumed, unexpired** `LpOtpCode`; if none → 400 `"That code is invalid or has expired."` (one generic message for every failure mode — no oracle). **Increment `attempts` before comparing** (fail-closed — the rate limiter fails open, this cannot); if `attempts > OTP_MAX_ATTEMPTS` → same generic 400. Compare `sha256(code)` with `crypto.timingSafeEqual`. On success, in a transaction: set `consumedAt`, create `LpSession` (30 days); set the cookie on the response: `httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600`. Return `{ ok: true }`.
- **`logout/route.ts`** POST: read cookie; delete the session row if present; clear the cookie; `{ ok: true }`.

### WS18.3 OTP email — template #11

`src/lib/email.ts`: `sendLpOtpEmail(email: string, code: string)` using the existing header/footer/`C` tokens: subject `Your ${ORG_NAME} access code`, the 6-digit code in a large JetBrains-Mono block (match the existing template aesthetics), "This code expires in 10 minutes.", and "If you didn't request this, you can ignore this email." — no links needed (the LP is already on the verify screen).

### WS18.4 LP layout + pages (Server Components, dfs.vc aesthetic)

Design source: `~/GitHub/dfsweb` (`assets/css/styles.css`, `index.html`) + the brand skill. The translation, using tokens/fonts already in `globals.css`/`layout.tsx` (no new fonts, no new assets — the DFS logo already ships at `public/brand/`, already public-prefixed):

- Paper background, Obsidian text, generous whitespace, left-aligned everything, 0–2px corners.
- Mono **eyebrow labels** with wide letter-spacing (`font-mono text-xs tracking-[0.12em] uppercase text-muted-foreground`) above headings — the dfs.vc signature.
- Space Grotesk display headings with tight tracking (`font-display tracking-tight`).
- Sky as the single accent: mention highlights, links, the `_` underscore mark.
- Line dividers (Bone), no cards/shadows; footer mirroring dfs.vc's: logo, one-line tagline, contact column.

Files:

- **`src/app/lp/layout.tsx`** — minimal public chrome (NOT `AppShell`): top bar with the DFS logo image (`/brand/...`, email-header asset) linking to `/lp`, a "Sign out" button (client island POSTing logout) shown only when a session exists; dfs.vc-style footer; `export const metadata = { robots: { index: false, follow: false } }` (**noindex — confidential surface on a public web app**).
- **`src/app/lp/page.tsx`** — Server Component, `force-dynamic`: `const ctx = await getLp()`. **No session** → render the entry screen (eyebrow `LP PORTAL`, heading "Fund reports for our limited partners.", and the `<LpLoginForm />` client island: email field → POST request → code field → POST verify → `router.refresh()`; generic success copy "If this address receives fund reports from us, a code is on its way."; verify errors show the API's generic message). **Session** → the library: reports where `status: "PUBLISHED"` and `fundId ∈ ctx.fundIds`, grouped by fund (fund `sortOrder`, then `publishedAt` desc), each row = title, period label, published date → `/lp/reports/[id]`; EmptyState "No reports yet." for LPs in funds with nothing published.
- **`src/app/lp/reports/[id]/page.tsx`** — Server Component, `force-dynamic`: `getLp()` → no session: `redirect("/lp")`. Load the report; **404 (`notFound()`) unless `status === "PUBLISHED"` AND `report.fundId ∈ ctx.fundIds`** — membership failures are indistinguishable from nonexistence, like the F16 doc proxy. Render `<ReportView>` (WS17.4) with the **frozen** `FundReportMention` snapshots. Letter styling: narrow measure (`max-w-2xl`), eyebrow = fund name + period, title, published date in mono, prose body (mirror the share page's update-body prose classes), mention spans Sky-underlined.

### WS18.5 Hover cards

New file `src/components/mention-cards.tsx` (client island mounted by `ReportView`): receives `MentionSnapshot[]`; on mount, `querySelectorAll('[data-portco]')` within the report body and binds `mouseenter`/`focus` (desktop) and `click` toggle (touch); renders one absolutely-positioned card near the active span (plain DOM/React state — no new UI dep; Radix popovers need declarative triggers we don't have inside `dangerouslySetInnerHTML`). Card content (Q6 = A): company name; headline `{blendedMultiple}× since {firstDealDate year}` in Space Grotesk (or "Written off" when blended = 0, "—" when null); beneath, one mono row per deal: `{Initial|Follow-on} · {MMM yyyy} · {multiple}×` (n/a for null). Progressive enhancement: no JS → mentions are just highlighted text; keyboard: spans get `tabindex="0"` and show on focus, Esc dismisses.

### WS18.6 Route access + tests

`src/lib/route-access.ts`: append `"/lp"` and `"/api/lp"` to `PUBLIC_PREFIXES` with a comment continuing the F15-family documentation (LPs have no NextAuth session **by design**; the `lp_session` cookie checked in `lp-auth.ts` is the real gate). Tests in `route-access.test.ts`: `/lp`, `/lp/reports/abc`, `/api/lp/auth/request` logged-out → `next` (the regression tests this codebase has earned four times over). New `src/lib/__tests__/lp-auth.test.ts` (mocked db): expired session → null; missing cookie → null; valid → lp with fundIds. Extend rate-limit usage tests only if patterns diverge (they shouldn't).

**WS18 acceptance checklist**
- [ ] Resend test email confirmed working before starting; OTP email arrives with the code, on-brand
- [ ] Full flow live: enter LP email → code → library shows exactly the funds that LP belongs to; a second LP in two funds sees both funds' reports
- [ ] Non-LP email gets the identical "code is on its way" response and no email; nothing distinguishes it from the LP path externally
- [ ] Wrong code 5× → 6th attempt rejected even with the correct code (fail-closed cap); requesting a fresh code recovers
- [ ] 11th OTP request from one IP in an hour → 429; 6th for one email → 429
- [ ] Session cookie: revisit after closing the browser still logged in; deleting the `LpSession` row (or admin email-change, Q10) signs the LP out on next request; logout works
- [ ] Direct URL to a report in a fund the LP is **not** in → 404; DRAFT report URL → 404 even for a fund member; logged-out report URL → redirect to `/lp`
- [ ] Hover card shows frozen numbers (change a valuation post-publish, card unchanged); works on tap at 375px; page has no horizontal scroll at 375px (Part 6 standards)
- [ ] `curl` checks: `/lp` 200 logged-out; `/api/lp/auth/request` 200 (not 307-to-login!) — the F15-family check, plus the route-access unit tests
- [ ] LP pages send noindex metadata; founder/admin/investor surfaces byte-identical throughout
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** entirely new audience surface; zero change for founders, admins (beyond WS16/17's opt-in pages), and investor-link recipients. **Cost impact:** none — OTP email volume is tens of sends twice a year; three small tables. **Schema:** none beyond WS16's.

---

## WS19 — Publish notification + polish (0.5–1 day; notification half gated on Q7) — SHIPPED 2026-07-09

1. **(Q7 = B, if confirmed)** Email template #12 `sendLpReportPublishedEmail({ email, fundName, reportTitle })` — "A new report for {fundName} is available", one button → `${BASE_URL}/lp`, support-contact line. Publish confirm (WS17.5) gains a "Notify this fund's LPs by email" checkbox (default off); the publish endpoint accepts `{ notify: boolean }` and fans out best-effort per LP (per-recipient try/catch, F12 lesson: one bad address never blocks the rest or the publish; result `{ notified, failed }` in the audit metadata).
2. **(Q11) Print stylesheet** — in the LP layout, an `@media print` block: hide the top bar/footer/sign-out, white background, Obsidian-on-white text, mention underlines off, page margins. LPs print-to-PDF to recreate the old artifact.
3. **Docs** — `README.md`: LP portal section (audience model, `/lp`, OTP, 30-day sessions, confidentiality note for forks); `SETUP.md`: importer usage (with the confidentiality warnings); no new env vars anywhere in this feature (verify + state it).
4. **ROADMAP bookkeeping** — fold shipped workstreams into "Existing Features"; resolve the F18 annotation.

**WS19 acceptance checklist**
- [ ] (Q7) Publishing with notify on emails every LP of that fund once; a bounced address doesn't block others or the publish; audit row carries `{ notified, failed }`
- [ ] Browser print preview of a report page: clean letter, no chrome
- [ ] README/SETUP updated; `grep` confirms no new env vars introduced by Part 7
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive. **Cost impact:** none. **Schema:** none.

---

## Part 7 sequencing, batch split & effort

**Recommended phasing — two release batches:**

- **Batch A (admin-only, zero LP exposure): WS16 → WS17.** Ships the data layer, the import, and authoring. The team can enter/verify all data and draft the first real report while the LP surface is still being built. Nothing outside `/admin` changes.
- **Batch B (LP-facing): WS18 → WS19.** Gate: Resend re-verified, Q7/Q9/Q11 answered (Q9's `/lp` recommendation is needed *before* WS18's first file is created). Go live, then send the first real report's link to a friendly LP as the pilot before announcing broadly.

Vertical-slice alternatives were considered and rejected: auth-first has nothing to show; report-page-first has no data. The dependency chain is genuinely schema → content → audience.

| WS | Item | Effort | Schema push | Gated on |
|---|---|---|---|---|
| WS16 | Schema + importer + admin funds/LPs/deals | 3–3.5d | 8 new tables | Q12/Q14 (defaults recommended) |
| WS17 | Report authoring, mentions, snapshot publish | 2.5–3d | — | Q6, Q13 (defaults recommended) |
| WS18 | LP portal: OTP auth, library, report pages | 3–3.5d | — | **Q9**; Resend verified; Q10 semantics |
| WS19 | Publish notification + print + docs | 0.5–1d | — | **Q7** (notification half), Q11 |

**Total: ~9–11 junior-engineer days** — consistent with "biggest feature since the platform was built" (P0+P1 were ~8–10d combined).

## Part 7 roadmap bookkeeping

Done alongside this plan: `ROADMAP.md` gains a "Next up — LP Fund-Report Portal" pointer to this Part, and the P3 "Portfolio Export / LP Report PDF" row is annotated per F18. As each workstream ships, fold it into "Existing Features" per the file's convention; the P3 row should be resolved (superseded-by-portal, print-stylesheet interim) when WS19 lands.

---

# Part 8 — Medium-Style Draft Composer (WS20)

_Added 2026-07-08, from a user request: a screenshot of a Medium draft page, with "I'd like all our draft pages for posts and updates to look this clean."_

> ✅ **Screenshot received and reviewed 2026-07-08** (`~/Downloads/medium-draft.png`, after several delivery attempts failed). It confirms the design-target list below and **resolves the two items that were flagged as screenshot-dependent**: (1) the top bar is *wordmark + quiet grey "Draft" label* on the left and *a pale, disabled-until-publishable Publish button, overflow "···", and account cluster* on the right — no back arrow, the wordmark is the exit; (2) **the left-margin circled "+" insert button IS present** next to the empty body paragraph, alongside the selection bubble toolbar (shown in the screenshot's onboarding hint: B, i, link | large-T, small-T, blockquote, indent — over selected text). The screenshot also shows a **dismissible first-run hint** ("Select text to change formatting, add headers, or create links.") — adopted as optional WS20.6. Q18 is therefore effectively answered by the source material; WS20.1/WS20.2 below have been updated to match.

## What "Medium draft clean" means (design target)

Medium's draft page is defined by what it removes:

1. **No boxes.** No card borders, no labeled form fields, no section headers around the writing surface. The page *is* the document.
2. **A thin utility top bar**, not an app header: "Draft in {publication} · Saved" on the left, a Publish button and overflow on the right. Everything else is canvas.
3. **A huge borderless title** — a bare text input styled as display type, placeholder "Title", no label.
4. **A chromeless body** — placeholder "Tell your story…", no permanent toolbar; formatting appears contextually (a bubble toolbar over selected text).
5. **A narrow centered measure** (~680–740px) with generous whitespace.
6. **An ambient save state** ("Saved") instead of a prominent Save button.

DFS-brand translation (per the brand skill: restrained, structured-by-content, Obsidian-on-Paper): keep Molly's tokens and fonts — the title becomes `font-display` Space Grotesk with tight tracking, the save state and period render in JetBrains Mono, Sky stays the single accent. "Medium's layout discipline, DFS's skin."

## Current state (verified 2026-07-08 — the gap is large)

- **`src/app/updates/new/page.tsx`** — the founder composer is a boxed form: `AppShell` + `PageHeader` ("New Update" + description), then one `Card` titled "Create New Update" (lines 247–253) containing labeled Period/Title inputs in a 2-col grid (280–297), a labeled `RichEditor` (299–307), a labeled metric-input grid (310–332), a dashed attachments box (335–345), and a bordered action row (357–398) with Save as Draft / Publish plus the schedule disclosure (400–443). Every one of these is a box inside a box — the anti-Medium.
- **`src/app/updates/[id]/page.tsx`** — draft **edit** mode (`editing` state, lines 513–581) is the same pattern: a `Card` with labeled Period/Title inputs, `RichEditor`, metric grid, and a Save/Cancel row. (View mode for published updates is out of scope — the request is about *draft* pages.)
- **`src/app/admin/companies/[id]/updates/new/page.tsx`** — an admin compose-on-behalf-of-a-company page with the same boxed pattern (found via the `RichEditor` call-site sweep; it was not previously catalogued in this doc).
- **`src/components/ui/rich-editor.tsx`** — one shared editor with a **permanent 20-button toolbar** in a bordered container (line 164), used by five call sites: the three composers above, `admin/templates/page.tsx`, and `admin/companies/[id]/page.tsx` (notes). Any restyle must therefore be an **opt-in variant** — templates and notes are short utility forms where the boxed look is right, and silently restyling them would be a real regression.
- TipTap v3's `BubbleMenu` (for the contextual toolbar) ships in `@tiptap/react/menus` and wants `@floating-ui/dom`; `@floating-ui/core` is already present transitively (package-lock line 1177, via Radix) — the exact missing piece is a free MIT install to confirm at implementation time.

**Constraint note (flagged, per protocol):** this is a deliberate, user-requested redesign of an existing founder-facing surface — the exact category the no-UX-regression rule protects. The rule is read here as: **visual redesign is authorized by the request; capability regression is not.** Every current capability (template prefill, per-period metrics, attachments, publish-confirm, schedule-for-later, draft save) must survive relocation. The acceptance checklist enforces capability parity item by item.

## Part 8 open product decisions (Q15–Q18)

> **All decided 2026-07-08 (user review). Q17 and Q18 diverge from the recommendations, and both reduce scope:**
> **Q15 = three update composers + the WS17 report editor** (recommended) · **Q16 = B** (debounced autosave for existing drafts only, suppressed while submitting/confirming; recommended) · **Q17 = A — KEEP the AppShell sidebar**, restyle only the content area (diverges from the full-bleed rec; WS20.2's top-bar design shrinks to an in-content header row) · **Q18 = B — slim persistent toolbar**, borderless, appearing on focus (the user chose B explicitly even after the screenshot resolved the rec toward A — no bubble menu, no floating "+", no @tiptap/react/menus or floating-ui work; image insert and alignment stay in the persistent toolbar, restyled).
> **Consequence:** WS20 sheds its two riskiest integrations (BubbleMenu + FloatingMenu) and the full-bleed shell; effort lands at or under the low end (~2–2.5d). Sequencing unchanged: WS16 → WS20 → WS17 → WS18 → WS19.
> **Reconciliation note for the implementer:** the WS20 body text below was written against the screenshot-resolved recommendations (bubble toolbar, floating "+", full-bleed top bar, WS20.6 selection hint) — where it conflicts with this banner, **the banner wins**: sidebar stays, one slim persistent toolbar, no menus package, and WS20.6 is dropped (its hint text describes a selection bubble that won't exist). Keep from the screenshot review: the **muted/disabled Publish until period + title exist**, the borderless display-type title, and the ambient save state — all orthogonal to Q17/Q18.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q15** | **Scope of "all our draft pages for posts and updates."** Molly has no "posts" entity — candidates: founder `/updates/new`, founder draft-edit on `/updates/[id]`, the admin per-company composer, the WS17 fund-report editor (Part 7, not yet built), the admin templates editor, company notes. | Any subset | **The three update composers + the WS17 report editor** (born clean rather than restyled later — see sequencing). **Exclude** templates and notes: short utility forms, not writing surfaces. Confirm whether "posts" meant the fund reports. |
| **Q16** | **Autosave, or keep explicit save?** Medium's "Saved" implies background autosave. Molly's new-update page has no row to save into until first save; the edit page PATCHes an existing draft. | **A.** Keep explicit save; add an ambient "Saved · 2:41 PM" mono indicator after each save. **B.** A + debounced autosave (~30s after typing stops) **for existing drafts only** (edit page, and the new page after first save). **C.** Full Medium: auto-create the draft as soon as there's a title. | **B.** Delivers the "Saved" feel without C's side effect (drafts materializing that the founder never asked for, polluting the updates list). A is the fallback if B's edge cases (autosave racing a publish click) eat the budget — B must suppress autosave while `submitting`/`confirmPublish` is true. |
| **Q17** | **How much chrome disappears?** Medium hides all navigation on the draft page. | **A.** Keep the AppShell sidebar; restyle only the content area. **B.** Full-bleed composer: no sidebar; a thin top bar ("← Updates · Draft in {Company} · Saved" left; Schedule/Publish right). | **B** — it *is* the Medium look, and the composer's own top bar keeps the exit path ("← Updates" is exactly where the current back-link at `updates/new/page.tsx:216-222` already goes). Cheap reversal: the shell is one component; re-wrapping in `AppShell` is a one-line change per page. |
| **Q18** | **Toolbar model.** ~~Open~~ → **resolved by the screenshot (2026-07-08)**: it shows both Medium mechanisms — the selection bubble toolbar (B, i, link, large-T, small-T, blockquote, indent) *and* the left-margin circled "+" insert button on the empty paragraph. | **A.** Bubble toolbar + left-margin "+" (the screenshot's model). **B.** Permanent slimmed toolbar (fallback). | **A, now concrete:** bubble toolbar on selection for marks/headings/quote/link; a floating left-margin "+" (TipTap v3 `FloatingMenu`, same `@tiptap/react/menus` module as `BubbleMenu`) on the empty active paragraph for inserts — image upload and divider. Text-align (in Molly's current toolbar, absent from Medium's) moves into the bubble toolbar to preserve capability. B remains the tested fallback only if the floating-ui integration eats the budget. |

## WS20 — Chromeless draft composer (2.5–3 days, assumes Q15–Q18 recommendations) — SHIPPED 2026-07-08 (per the decision banner above, not the recommendations: sidebar kept, slim persistent toolbar, no BubbleMenu/FloatingMenu, WS20.6 dropped)

### WS20.1 `RichEditor` chromeless variant (additive prop, same pattern as JC9)

`src/components/ui/rich-editor.tsx`: add `variant?: "boxed" | "chromeless"` (default `"boxed"` → byte-identical for templates/notes and every caller that doesn't opt in).

- `chromeless`: outer container drops `rounded-md border border-input bg-background`; the permanent toolbar is not rendered. Instead, two contextual controls (both from `@tiptap/react/menus`; install `@floating-ui/dom` if the build asks — free/MIT), matching the screenshot exactly:
  - **`BubbleMenu` on text selection** — Bold, Italic, Underline (Molly capability, not in Medium's bar — keep), link, H2, H3, blockquote, alignment; rendered as a small Obsidian bar with Paper icons (Medium's is dark-on-light-page too).
  - **`FloatingMenu` left-margin "+"** — a circled `+` beside the empty active paragraph (screenshot-confirmed) that expands to the insert actions: image upload (existing `handleImageUpload` flow) and divider.
  Editor prose gains a larger base size (`prose`, not `prose-sm`) and `min-h-[50vh]`; placeholder "Tell your investors what happened…" (per-call-site overridable, as today).
- Composes with the existing `extraExtensions` prop (Part 7 JC9): the WS17 report editor will use `variant="chromeless"` + the mention extension.

### WS20.2 Composer shell

New file `src/components/layout/composer-shell.tsx` — the Q17-B full-bleed layout for all in-scope composers, mirroring the screenshot's top-bar grammar. Paper background, `max-w-[46rem]` centered column; sticky thin top bar:

- **Left** (screenshot: wordmark + quiet grey "Draft"): the `LogoMark` as the exit link (destination: `/updates`, or the company detail page in the admin composer — Medium uses its wordmark as the only way out, but keep a small `← Updates` text link too if testing shows founders miss it; micro-call for the implementer), then mono muted `Draft in {companyName}` + the save-state indicator (`Saved · 2:41 PM` / `Saving…` / `Unsaved changes` — JetBrains Mono, muted; the screenshot's empty draft shows just "Draft", which is the pre-first-save state here).
- **Right** (screenshot: pale Publish · "···" · account cluster): a **Publish button that renders muted/disabled until the draft is publishable** (period + title non-empty — exactly the screenshot's pale-green disabled Publish), and an overflow "···" menu holding the secondary actions: **Schedule for later** (the existing disclosure's content in a small panel) and, on the edit page, **Delete draft** (existing flow). The publish confirm renders as a slim banner under the top bar, reusing the current copy and button pair.

Mobile: top bar wraps per Part 6 Pattern C; the canvas is already single-column.

### WS20.3 `/updates/new` rework

A layout transplant — all state/handlers (`handleSubmit`, template logic, metric inputs, schedule) survive verbatim; lines 214–447 restructure onto the shell:

1. Canvas order: **Title** (borderless input, `font-display text-4xl tracking-tight`, placeholder "Title"), a small mono **Period** input inline beneath it (placeholder `2026-Q3` — required data rendered as a byline detail, not a form field), then the chromeless body.
2. **Template picker** (only when templates exist): one muted line under the title while the body is empty — "Start from a template ▾" (borderless native select) — hidden once the body has content. Same `applyTemplate` confirm logic (line 106–116).
3. **Metrics + attachments** move below the canvas into a collapsed disclosure `Details — metrics & attachments` (chevron pattern copied from the schedule disclosure, lines 403–415). Expanded content = the existing metric grid and upload box, unchanged. Medium's model is write-first, configure-second; the fields keep 100% of their function one click away.
4. Error/success messages render as the slim banner under the top bar (existing `message` state + styling).

### WS20.4 `/updates/[id]` draft-edit rework + admin composer parity

- Edit mode (lines 513–581) adopts the same shell/canvas (identical relocation; Save/Cancel become top-bar actions; Q16-B autosave wires into `handleSaveEdit` with a debounce, suppressed while `saving`). Published-view mode untouched.
- `src/app/admin/companies/[id]/updates/new/page.tsx`: same transplant; back link → the company detail page.

### WS20.5 Save-state + autosave (Q16-B)

Small hook `useDraftAutosave({ enabled, dirty, onSave })` colocated with the shell: 30s debounce after last change; disabled until the draft exists (new page: after first manual save); disabled during `submitting`/`confirmPublish`/schedule submission; exposes `saveState` for the top-bar indicator. **No schema or API changes** — it calls the existing POST/PATCH endpoints.

### WS20.6 First-run formatting hint (optional, from the screenshot)

The screenshot shows Medium's dismissible onboarding hint ("Select text to change formatting, add headers, or create links." as a bottom sheet with a toolbar illustration). Contextual toolbars are invisible until discovered, so some hint is worth having — but a bottom-sheet carousel is over-built for Molly. Cheap version: a single muted line under the empty body (`Select text to format · type on an empty line for the + insert button`), dismissed by an `×` and remembered in `localStorage` (`molly:composer-hint-dismissed`), never shown again and never shown when the body already has content. ~20 lines; cut first if the budget runs out.

### WS20 sequencing vs Part 7

WS20 is independent of Part 7's data work but **should land before WS17 builds the report editor**, so that editor is born on the composer shell instead of being restyled a week later. Recommended combined order: WS16 → **WS20** → WS17 → WS18 → WS19. If WS20's decisions stall, WS17 proceeds on the boxed pattern and adopts the shell in a later pass (cheap: WS17.5 already isolates its editor page).

**WS20 acceptance checklist**
- [ ] **Screenshot check (source received 2026-07-08, `~/Downloads/medium-draft.png`):** the shipped composer matches its structure — quiet top bar (wordmark exit + "Draft in {Company}" + save state left; muted-until-publishable Publish + overflow right), borderless serif-scale title, chromeless body, left-margin "+" on the empty paragraph, bubble toolbar on selection — final look reviewed by the user
- [ ] Capability parity, every item exercised on the live deploy: template prefill (incl. overwrite confirm), period required-validation, metric values saved with a draft AND with a publish, attachment upload, publish confirm + team email, schedule-for-later (create + cancel, now via the overflow menu), plain draft save, 3-day edit-window rules unchanged
- [ ] Templates editor (`/admin/templates`) and company-notes editor render byte-identical (default `variant="boxed"`)
- [ ] Bubble toolbar: bold/italic/underline/H2/H3/quote/link/alignment on selection; left-margin "+" inserts image (upload round-trips) and divider; Cmd-B/Cmd-I shortcuts still work
- [ ] Publish button is muted/disabled until period + title are filled, then enables (screenshot behavior); first-run hint (WS20.6, if built) dismisses and stays dismissed
- [ ] Autosave: typing in an existing draft → "Saving…" → "Saved · time" within ~30s; no autosave fires mid-publish; the new-update page never creates a row before first explicit save
- [ ] 375px: no horizontal scroll on any composer (Part 6 standard); top bar wraps cleanly
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** a deliberate, user-requested redesign of the three update composers (and the future report editor); every capability preserved, relocated at most one click away. Templates/notes editors and all published-view pages unchanged. **Cost impact:** none (at most one free MIT dep, `@floating-ui/dom`). **Schema:** none.

## Part 8 roadmap bookkeeping

`ROADMAP.md`: add the composer redesign as a planned P2 row pointing here, and annotate the P3 "Mobile-Optimized Update Flow" row — WS20 delivers the *visual/layout* half of a composer rethink; that P3 item's remaining scope narrows to mobile-specific *interaction* work (simplified metric entry). Fold into "Existing Features" when shipped.

# Part 9 — Expired Set-Password Link Recovery (WS21–WS22)

_Added 2026-07-09, from a real founder support email: "Please could you send another password link for Molly?… the previous one expired." A founder is waiting on this now — the batch is sized for same-day execution._

**Interim manual rescue (works today, before anything ships):** an admin can open the founder's company detail page and re-add them as a member with their existing email. The invite flow's existing-user path (`src/app/api/companies/[id]/members/invite/route.ts:56-131`) regenerates the token for password-less accounts (flipping PENDING → APPROVED on the way) and re-emails a set-password link, reusing the existing membership. Undiscoverable, but functional — unblock the waiting founder this way while WS21 deploys.

## Verified current behavior (all line refs checked 2026-07-09)

- Setup tokens expire after 48h, generated at **three** sites: `api/admin/approvals/[id]/approve/route.ts:33-34` (`randomUUID`), `api/companies/[id]/members/invite/route.ts:8-13` (`randomBytes(32).hex`, used 4×), and `api/auth/signup/route.ts:46-52` (`randomBytes(32).hex`, in a stuck-state resend branch).
- Expired token at `/set-password` → `api/auth/set-password/route.ts:45-50` returns a 400 with "contact support" prose, no machine-readable code, no recovery path. The page (`src/app/set-password/page.tsx`) renders the form for any token and only surfaces errors after a submit.
- `/api/admin/approvals` lists only `{ status: PENDING, approvalToken: null }` (route.ts:12) — users who were approved but never set a password are invisible to admins.
- Tokens are cleared **only** on set-password success (route.ts:56-64), which is also the **only** place `status` flips to APPROVED.
- Rate limiting (`src/lib/rate-limit.ts`) already guards signup and set-password at 10/hr/IP; `/api/auth` and `/set-password` are both in `PUBLIC_PREFIXES` (`route-access.ts:34`) — a new endpoint under `/api/auth/**` needs **no** middleware change (no F15-family exposure; route-access tests already exercise `/api/auth/*`).
- The member-added path (`invite/route.ts:167-182`) deliberately issues tokens to users who already **have** passwords (set-or-reset semantics) — so "has a token" does not imply "password-less".

## Part 9 review findings

**F19 — The approve endpoint never sets `status: "APPROVED"`; the signup route's existing stuck-state resend is unreachable for the approval path.** `approve/route.ts:36-41` writes only `{ approvalToken, tokenExpiresAt }`; APPROVED is set by set-password itself (line 60). Consequence: an admin-approved signup founder is `PENDING` + token, so the signup route's existing recovery branch (`signup/route.ts:38-64`, gated on `status === "APPROVED" && !passwordHash`) can never fire for them — they hit the 409 "account already exists" instead. That branch only ever rescues invite-created users. Any eligibility logic in this Part keyed on "status APPROVED" (as the initial task shape assumed) would repeat this bug; WS21.1's `canResendSetupLink()` predicate is written against the real state machine.

**F20 — A user rejected after approval can still activate their account.** `reject/route.ts:32-36` sets only `{ status: "REJECTED" }` — it does not clear `approvalToken`/`tokenExpiresAt` — and set-password never checks `status` (any valid-token holder gets `status: "APPROVED"` written at line 60). So approve-then-reject leaves a live 48h activation link that silently un-rejects the user. Low severity (requires an admin to reverse a decision inside the window), fixed in WS21.4/21.5.

**F21 — ROADMAP.md line 35 claims the opposite of what the code does.** "only users awaiting password setup appear in the queue" — the `approvalToken: null` filter means users awaiting password setup are *precisely the hidden population*; the queue shows users awaiting an admin decision. Annotated in ROADMAP now; WS22 makes a corrected version of the sentence true.

Also noted (not contradictions, so no F numbers): the three generation sites use two token formats and hardcode "48 hours" in three email templates (`email.ts:148,300,328`) plus ROADMAP line 58; and the two expiry checks disagree on `tokenExpiresAt: null` (set-password:45 treats null as valid-forever, invite:99-100 and signup:40-41 treat it as expired). WS21.1 unifies all of this in one helper — null becomes **expired** (the stricter, majority semantics; safe now that a resend path exists).

## Part 9 technical judgment calls (flagged per protocol, each with a cheap reversal)

- **JC10 — The self-serve resend is token-keyed, not email-keyed.** The founder reaches the resend button *from the expired link itself*, so `POST { token: <the expired token> }` covers the entire entry path with zero enumeration surface (you must already possess a previously-issued 256-bit token; expired tokens stay in the DB until replaced or consumed). No email input, no account-existence oracle to neutralize, and the fresh link goes only to the stored account address by construction. If the link itself is lost, admins have WS22 (and the invite-flow rescue). Reversal: the endpoint later also accepts `{ email }` with the same always-`{ ok: true }` response.
- **JC11 — Resends reuse `sendApprovalEmail`.** Its copy ("Your account has been approved… Set your password to get started") reads correctly for both eligible populations (approved signups and invited-but-never-set users). Reversal: a dedicated template later, ~30 lines in `email.ts`.
- **JC12 — Token format unifies on `randomBytes(32).hex`** (the majority format, 256-bit vs UUID's 122). Tokens are opaque strings looked up by `findUnique` — format changes are invisible to everything, including outstanding old-format tokens.
- **JC13 — The set-password API's 400s gain an additive machine-readable `code` field** (`"TOKEN_EXPIRED" | "TOKEN_INVALID"`). The existing client reads only `data.error`, so this is invisible until the same WS's UI starts using it. The expired-vs-invalid distinction was already leaked by the two different prose messages, and tokens are unguessable, so this creates no new oracle.

## Part 9 open product decisions (Q19–Q20)

> **Both decided 2026-07-09 (user review): recommendations accepted as-is.**
> **Q19 = B** (7-day TTL via the single `SETUP_TOKEN_TTL_DAYS` constant) · **Q20 = A** (WS22 admin queue ships in the same batch).
> Batch = WS21 → WS22, ~1–1.25 days, unblocked. (Queued behind the in-flight WS18/WS19 LP batch — same working tree.)

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q19** | **Token lifetime.** 48h is demonstrably too short for founders across time zones with busy inboxes — this bug is the proof. | **A.** Keep 48h, rely on the new resend. **B.** 7 days. **C.** 14+ days. | **B — 7 days.** Long enough to survive a weekend + travel, short enough that a compromised inbox has a bounded window; with F20 fixed, rejection now kills the token immediately regardless of TTL. One constant (`SETUP_TOKEN_TTL_DAYS`) — trivially revisited. |
| **Q20** | **Does the admin "Awaiting password setup" queue (WS22) ship in v1 or get deferred?** Self-serve (WS21) alone fixes the founder-side dead end. | **A.** Ship WS22 in the same batch. **B.** Defer; revisit if support emails continue. | **A.** It closes the admin blind spot F21 documents (today an admin literally cannot see who's stuck, which is why this arrived as a support email), it lets the team *proactively* push a fresh link — including to the founder waiting right now — and it's ~half a day on existing patterns (approve/reject sibling route, audit log, wrap-row cards). Severable without touching WS21 if you'd rather not. |

---

## WS21 — Self-serve link recovery + token lifecycle cleanup (~0.5–0.75 day) — SHIPPED 2026-07-09

**Goal:** an expired set-password link becomes a one-click "email me a fresh link" instead of a dead end; token generation/expiry collapses to one helper with a 7-day TTL (Q19-B); the F20 rejection hole closes. No schema changes — existing `approvalToken`/`tokenExpiresAt` columns carry everything.

### WS21.1 `src/lib/setup-token.ts` (new) + tests

```ts
import crypto from "crypto";

/** Single source of truth for setup-link lifetime (Q19-B; was 48h hardcoded at 3 sites). */
export const SETUP_TOKEN_TTL_DAYS = 7;

export function generateSetupToken() {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    tokenExpiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Null expiry counts as EXPIRED (the stricter of the two semantics that existed; see Part 9 notes). */
export function isSetupTokenExpired(u: { tokenExpiresAt: Date | null }): boolean {
  return !u.tokenExpiresAt || u.tokenExpiresAt < new Date();
}

/**
 * Who may be (re)issued a setup link. Written against the real state machine (F19):
 * an admin-approved signup founder is PENDING + token; an invited user is APPROVED + token.
 * PENDING with no token = still awaiting admin approval — must NOT be able to mint a link.
 */
export function canResendSetupLink(u: {
  passwordHash: string | null;
  status: string;
  approvalToken: string | null;
}): boolean {
  if (u.passwordHash) return false;
  if (u.status === "REJECTED") return false;
  return u.status === "APPROVED" || u.approvalToken !== null;
}
```

`src/lib/__tests__/setup-token.test.ts` (pure, no mocks — house style of route-access tests): TTL lands ~7 days out; null/past/future `tokenExpiresAt` → expired/expired/valid; `canResendSetupLink` truth table — the six states that matter: PENDING+token+no-hash ✓ (the F19 population), APPROVED+no-hash ✓ (invited), PENDING+no-token ✗ (approval bypass guard), REJECTED+token ✗ (F20), any state with `passwordHash` ✗, APPROVED+no-token+no-hash ✓ (defensive).

### WS21.2 Replace the three generation sites with the helper

- `api/admin/approvals/[id]/approve/route.ts`: drop the `randomUUID` import; lines 33-34 become `const { token: approvalToken, tokenExpiresAt } = generateSetupToken();` (JC12).
- `api/companies/[id]/members/invite/route.ts`: delete the local `generateToken()` (lines 8-13), import `generateSetupToken` and use it at all four call sites (59, 107, 171, 195); replace the inline expiry check at 99-100 with `isSetupTokenExpired(existingUser)`.
- `api/auth/signup/route.ts`: in the stuck-state branch, replace the inline generation (46-52) with the helper and the expiry check (40-41) with `isSetupTokenExpired`; fix the F19-unreachable gate — line 39's `existing.status === "APPROVED" && !existing.passwordHash` becomes `canResendSetupLink(existing)` (re-submitting the signup form now also rescues approved-but-PENDING founders, matching the branch's original intent).

### WS21.3 Email copy: "48 hours" → interpolated TTL

`src/lib/email.ts`: import `SETUP_TOKEN_TTL_DAYS`; the three hardcoded `<strong>48 hours</strong>` strings (lines 148, 300, 328) become `<strong>${SETUP_TOKEN_TTL_DAYS} days</strong>`. No other template mentions the lifetime (verified by grep).

### WS21.4 `api/auth/set-password/route.ts` — error codes, REJECTED guard, status precheck

- POST: not-found 400 (line 37-42) gains `code: "TOKEN_INVALID"`; expired 400 (45-50) uses `isSetupTokenExpired(user)` and gains `code: "TOKEN_EXPIRED"` (JC13). New guard between them: `if (user.status === "REJECTED")` → the same `TOKEN_INVALID` response (F20 half 1 — indistinguishable from nonexistence, like the F16 doc proxy).
- New `GET` handler in the same file — the page's on-load precheck, so the expired card shows on arrival rather than after the founder has typed a password. Rate-limited on its own bucket (`checkRateLimit("token-status", clientIp(req), 30)` — separate from POST's bucket so page loads can't burn submit attempts). Reads `token` from `req.nextUrl.searchParams`. Returns `{ valid: false, code: "TOKEN_INVALID" }` for missing/unknown tokens and REJECTED users; `{ valid: false, code: "TOKEN_EXPIRED" }` when `isSetupTokenExpired`; else `{ valid: true }`. **Deliberately mirrors POST validity, not resend eligibility** — member-added reset links belong to users who already have a password (invite:167-182) and must still validate here.

### WS21.5 `api/admin/approvals/[id]/reject/route.ts` — kill outstanding tokens

Line 32-36's update data becomes `{ status: "REJECTED", approvalToken: null, tokenExpiresAt: null }` (F20 half 2 — belt to WS21.4's braces).

### WS21.6 `api/auth/set-password/resend/route.ts` (new) — the self-serve endpoint

Under `/api/auth` → already public (route-access.ts:34), no middleware change. Follows the signup route's structure and email-guard conventions:

```ts
export async function POST(req: NextRequest) {
  if (!(await checkRateLimit("resend-setup", clientIp(req), 5))) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }
  const { token } = await req.json();
  if (typeof token === "string" && token.length > 0) {
    const user = await db.user.findUnique({ where: { approvalToken: token } });
    if (user && canResendSetupLink(user)) {
      const { token: fresh, tokenExpiresAt } = generateSetupToken();
      await db.user.update({ where: { id: user.id }, data: { approvalToken: fresh, tokenExpiresAt } });
      try {
        if (process.env.RESEND_API_KEY) {
          const { sendApprovalEmail } = await import("@/lib/email");
          await sendApprovalEmail(user.email, fresh); // stored address only — never client-supplied (JC10/JC11)
        }
      } catch (e) { console.error("Failed to resend setup email:", e); }
    }
  }
  return NextResponse.json({ ok: true }); // always neutral — success is indistinguishable from no-op
}
```

Limit is 5/hr/IP (it triggers outbound email — tighter than the 10/hr auth forms). Ineligible/unknown tokens fall through silently to the neutral response.

### WS21.7 `src/app/set-password/page.tsx` — expired-state UI

Add `tokenState: "checking" | "valid" | "expired" | "invalid"` (initial `"checking"` when a token is present; `"invalid"` when absent — absorbing the existing missing-token card) and `resendState: "idle" | "sending" | "sent"`.

- On mount (`useEffect`, token present): `fetch("/api/auth/set-password?token=" + encodeURIComponent(token))` → set state from `valid`/`code`. While `"checking"`, render the existing centered "Loading..." (same as the Suspense fallback).
- `"valid"` → the existing form, unchanged. If a POST still fails with `code === "TOKEN_EXPIRED"` (token aged out between load and submit), flip to `"expired"` rather than showing the dead-end message.
- `"expired"` → a card in the existing invalid-card layout: heading "This link has expired", copy "Setup links expire after 7 days. We can email you a fresh one — it goes to the address this link was issued for.", a full-width Button "Email me a new link" → `POST /api/auth/set-password/resend { token }`; on ok, swap to a confirmation ("If this link was eligible for renewal, a fresh one is on its way — check your inbox.") with two muted links: "Back to login" and `mailto:` support (mirror the `/investors` page's `SUPPORT_EMAIL` usage). On 429, surface the error inline. `"sending"` disables the button.
- `"invalid"` → the existing invalid-link card (no resend button — there is no token row to renew; copy keeps the support contact).

### WS21.8 Bookkeeping

- `ROADMAP.md`: line 29 gains the resend endpoint mention; line 58's "48hr expiry" → "7-day expiry"; fold the shipped feature into "Existing Features" (Authentication & Access) per convention.
- Route-access regression: add `"/api/auth/set-password/resend"` to the public-path expectations in `route-access.test.ts` (one line, the F15-family ritual even though the prefix already covers it).

**WS21 acceptance checklist**
- [ ] `npm run typecheck && npm run lint && npm test` green; new `setup-token.test.ts` covers the six-state truth table
- [ ] Live (production, post-deploy): visit `/set-password?token=garbage` → invalid card, no resend button; `curl -s -o /dev/null -w "%{http_code}" 'https://molly.dfslab.net/api/auth/set-password?token=x'` → 200 not 307 (F15-family check)
- [ ] Live with a real expired token (the waiting founder's, or manufacture one by backdating `tokenExpiresAt` on a test user): page shows the expired card on load *without* typing a password; one click → fresh email arrives at the stored address; new link sets the password and auto-signs-in; the old token no longer works
- [ ] Resend with an already-passworded user's stale token → neutral `{ ok: true }`, no email state change that grants anything (account unchanged)
- [ ] Reject an approved-but-unset test user → their outstanding link immediately dies (both the cleared token and the status guard verified)
- [ ] 6th resend POST from one IP inside an hour → 429
- [ ] Approval/invite/member-added emails all say "7 days"; approve → set-password within the window still works end-to-end (token format change is invisible)

**UX impact:** additive only — the happy path (valid token → form → dashboard) is byte-identical; the previously dead expired/invalid states gain recovery UI; three email templates change one phrase. **Cost impact:** none — existing Postgres rate-limit table, existing Resend templates, no new services. **Schema:** none.

## WS22 — Admin "Awaiting password setup" queue (~0.5 day, Q20 gates) — SHIPPED 2026-07-09

**Goal:** approved-but-never-set-password users become visible on `/admin/approvals`, with an audit-logged per-user resend — the team can answer "please send another link" emails (and pre-empt them) without the invite-flow workaround.

### WS22.1 `GET api/admin/approvals/awaiting/route.ts` (new)

`requireAdmin`; return users matching the Prisma mirror of `canResendSetupLink` ∧ no password:

```ts
where: {
  passwordHash: null,
  status: { not: "REJECTED" },
  OR: [{ status: "APPROVED" }, { approvalToken: { not: null } }],
},
orderBy: { tokenExpiresAt: "asc" }, // most-expired first
select: { id, email, name, status, tokenExpiresAt, createdAt, memberships: { include: { company: { select: { id, name } } } } }
```

Kept as a sibling endpoint rather than reshaping the existing `GET /api/admin/approvals` response (whose client reads `data.data ?? data` — additive beats clever here).

### WS22.2 `POST api/admin/approvals/[id]/resend/route.ts` (new)

Sibling of approve/reject, same skeleton: `requireAdmin`; 404 if no user; 400 `"User is not awaiting password setup"` if `!canResendSetupLink(user)`; else `generateSetupToken()` → update → `sendApprovalEmail` (RESEND_API_KEY-guarded try/catch, per siblings) → `logAdminAction(actor!, "SETUP_LINK_RESENT", { targetType: "User", targetId: id, metadata: { email: user.email } })` → return the updated user summary.

### WS22.3 `/admin/approvals/page.tsx` — second section

Below the pending list (and independent of its empty state): heading "Awaiting password setup" with a one-line description ("Approved accounts that haven't finished setup. Resend replaces the old link."). Loads WS22.1 alongside the existing fetch. Each row: wrap-row Card (Part 6 Pattern B, same as the pending cards) — name/email/company on the left; on the right a mono expiry note (`link expired {formatDate}` in `text-laterite` when past, else `expires {formatDate}` muted) and a per-row "Resend link" Button with the page's existing per-id `actionStates` pattern (loading → "Sent ✓" / inline error). Section hidden when the list is empty (the page's existing all-clear empty state stays authoritative).

### WS22.4 Bookkeeping

`ROADMAP.md`: replace the false line-35 claim (F21 annotation added 2026-07-09) with the now-true statement: pending queue = awaiting admin decision; a separate "Awaiting password setup" section lists approved-but-unset accounts with audit-logged resend. Fold into "Existing Features" (Admin Features → Approvals) when shipped.

**WS22 acceptance checklist**
- [ ] The waiting founder (and any other stuck accounts — expect ≥1 row on first deploy) appears in the new section with an expired-link marker
- [ ] Resend → founder receives a fresh 7-day link; `SETUP_LINK_RESENT` row visible in `/admin/audit` with the email in metadata; button shows "Sent ✓"
- [ ] Resend against a user who completed setup meanwhile → clean 400 surfaced inline, no email
- [ ] A PENDING user with no token (awaiting approval) appears **only** in the pending queue, never in awaiting-setup; a REJECTED user appears in neither
- [ ] Pending approve/reject flows byte-identical; section absent when empty; 375px: rows wrap per Pattern B, no horizontal scroll
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive admin-only section; founder/investor surfaces untouched. **Cost impact:** none. **Schema:** none.

## Part 9 sequencing & effort

WS21 → WS22, same batch, combined **~1–1.25 days**. WS21 is the founder-facing fix and ships first; WS22 (if Q20-A confirmed) lands the same day and is the fastest way to push the waiting founder a fresh link without any action on their side. Out of scope, noted for the roadmap conversation: there is **no forgot-password flow at all** for users who *have* passwords (verified — the only `/set-password` senders are approval/invite/member-added). Today's accidental substitute is the member-added reset link. A proper `/forgot-password` reuses ~80% of WS21's machinery (token helper, neutral resend, rate limit, expired-state UI) if/when it's prioritized.

---

# Part 10 — Portfolio Ledger, Cross-Fund Views, Derived Metrics & Sheet Ingestion (WS23–WS27)

_Added 2026-07-15, derived from the user's PRD ("LP Platform / Portfolio Tracker") after a full review pass (claims verified against the working tree 2026-07-15; findings F22–F25 below). Scope = the PRD's Phases 1–3 equivalent; the PRD's Phase 4 ("decide what deserves native product workflows") is deliberately **not planned here** — it is a future product decision. Same hard constraints as every prior Part: **no new cost lines**, **no UX regressions** (LP/founder/investor surfaces unchanged except where a decision below explicitly says otherwise), **additive-only schema changes** via the house `db push` procedure._

## What this Part is

The PRD's core judgment is correct: the LP-facing flow is directionally right, and the real work is underneath — evolving the snapshot-style deal tracker into a ledger that can support round-level history, dilution-aware valuation, and scripted IRR/TVPI, with Google Sheets as a **short-term, one-way** input source. Three PRD premises did not survive verification (F22, F23, F25), which reshapes the phasing: the PRD's Phase 1 collapses to two cosmetic fixes plus one decided session change (WS23), its "unified dataset" ask is already shipped so Phase 2's real content is cross-fund *views* (WS25) on top of the new ledger tables (WS24), metrics are Phase 3 (WS26), and the Sheets sync — the highest-risk, most-external item — goes **last** (WS27), not second.

## Decisions Q21–Q27 — all answered by the user 2026-07-15 (every recommendation accepted)

> **Q21** — LP sessions: **keep the shipped 30-day persistent sessions** (PRD A5 was misinformed — F22) **and add idle-timeout enforcement** on the existing `LpSession.lastUsedAt` column. Exact window delegated to Felix: **7 days** (JC14, flagged).
> **Q22 = B** — **One-way Sheet→Molly sync** for the transition period. Sheet-owned deal/valuation fields become **read-only in admin CRUD while sync is enabled**; Molly remains the analytical read layer and the long-term destination (the PRD itself frames Sheets as short-term). This supersedes Part 7's "Molly is the source of truth after a one-time import" ground rule **for synced fields only, while sync is enabled** — annotated in Part 7's decision table.
> **Q23** — IRR/TVPI and all derived metrics are **admin-only in v1**. Nothing on `/lp` changes; hover-card semantics (Q6 since-first-check headline, WS17.2 FULL detail) are untouched.
> **Q24** — Ownership/dilution is **optional-when-known**: nullable fields, never required, SAFE conversion events modeled. The team commits to adding round-size / ownership columns to the Deals sheet **going forward** (no historical backfill of data that was never recorded).
> **Q25** — Publish notification stays the **opt-in checkbox** (Q7-B). PRD A2's "must email LPs when a report is published" was loose drafting, not a re-decision.
> **Q26** — Both operational commitments confirmed: synced fields read-only (see Q22), and **the team adds and maintains a stable ID column in the Deals sheet** (never reused, never reordered-away) — without it, change detection is unsound and WS27 does not ship.
> **Q27** — Publish confirm gains a **data-staleness banner + one-click "Sync now"** (visible only when sync is enabled), so frozen snapshots are never unknowingly minted from week-old marks.

## Part 10 ground rules (carry-over + additions)

All Part 2/5/7 ground rules apply (additive `db push` before code per the `vercel env pull --environment=production` procedure; `export const dynamic = "force-dynamic"` on route files; never change existing response shapes; `npm run typecheck && npm run lint && npm test` before every push; one workstream per commit-and-verify cycle). Additions:

1. **CONFIDENTIALITY — unchanged and extended.** The repo is public. Valuations, LP data, the tracker spreadsheet, **and now the spreadsheet's ID** never enter git: the spreadsheet ID, service-account email, and private key are Vercel env vars only (`.env.example` gets names, never values). Sync diffs contain real valuations → they live in the DB (`SheetSyncRun.summary`, admin-gated UI), **not** in console logs where avoidable, and never in commits/PR bodies/screenshots. All tests use synthetic data.
2. **Frozen `MentionSnapshot` backward compatibility is non-negotiable.** Published `FundReportMention.snapshot` rows keep their WS17.2 shape forever; every renderer (`mention-cards.tsx`, `report-view.tsx`, print CSS) must continue to render old rows byte-identically. Nothing in this Part adds fields to the snapshot or changes what `buildMentionSnapshot` reads (per-deal `entryValuation`/`currentValuation` stay authoritative — see JC16).
3. **The LP surface does not change.** Except WS23.1's idle timeout (explicitly decided, Q21), no LP-visible pixel or number moves. Acceptance checklists include a grep-able guard: no WS in this Part touches `src/app/lp/**`, `mention-cards.tsx`, `report-view.tsx`, or `report-snapshot.ts`'s snapshot shape.
4. **Fork story: the Sheets feature is OFF when env vars are absent.** No Google env vars → no cron effect (route no-ops), no `/admin/sync` nav item, no staleness banner, no read-only field locking — a fork that never touches Google gets today's behavior exactly. This is a hard acceptance item, not a nice-to-have.
5. **New deps: none planned.** The Sheets client is hand-rolled on `crypto` + `fetch` (JC15). If that judgment call is reversed, the fallback (`googleapis` or `google-auth-library`) is free/Apache-2.0 — still no cost line, but it must be called out in the shipping commit.

## Part 10 review findings

Continuing the F-numbering (Part 9 ended at F21). F22–F25 come from the PRD review (2026-07-15); every claim below was verified against the working tree.

**F22 — PRD A5 ("current behavior does not persist sessions across visits… intentional") contradicts shipped, decided behavior — and the PRD's own open-questions list inherits the false premise.** `src/lib/lp-auth.ts:14` (`LP_SESSION_DAYS = 30`), `src/app/api/lp/auth/verify/route.ts:64-77` (DB session = verify + 30 days; **persistent** cookie with `maxAge: LP_SESSION_DAYS * 24 * 60 * 60`), `prisma/schema.prisma:581`, decided as a Part 7 ground rule 2026-07-08. Sessions are fixed-expiry; `lastUsedAt` is touched at-most-hourly, best-effort, and enforced nowhere (`lp-auth.ts:76-79`). The PRD's risk item "whether session persistence should remain **disabled** long term" asks about a state that does not exist. **Resolved by Q21**: keep 30-day persistence, add idle enforcement (WS23.1).

**F23 — PRD A7 / Phase 1's "fix report publishing dependencies around company existence" targets a bug that does not exist.** The company-existence chain is guarded end to end: the mention picker only offers companies with ≥1 deal in the report's fund (`api/admin/portfolio-companies/route.ts:18`, `deals: { some: { fundId } }`); publish re-validates and 400s with named offenders (`api/admin/reports/[id]/publish/route.ts:26-40`, the JC6 check); `PortfolioCompany` DELETE 409s while any deals **or mentions** exist (`api/admin/portfolio-companies/[id]/route.ts:51-56`), making the schema's mention cascade unreachable through the API; published mentions are frozen JSON untouched by later deal edits. A7 read as a *requirement* is already satisfied. The PRD's Phase 1 therefore reduces to F24 plus a small draft-integrity affordance (WS23.2/23.3).

**F24 — The publish offenders message can print a raw cuid instead of a name.** `publish/route.ts:35`: `byId.get(oid)?.name ?? oid` — when a draft still contains a mention span for a company that was since deleted (possible only for zero-deal companies, per the F23 guards), the admin sees an opaque id. Cosmetic; fixed in WS23.2.

**F25 — PRD problem statement #1 ("No unified cross-fund source of truth… too fund-specific") and requirement B1 misdiagnose the layer.** The shipped **data layer is already unified and cross-fund**: one `deals` table spanning all funds, one global `PortfolioCompany` table (`prisma/schema.prisma:496-533`); companies already appear across funds. What's genuinely missing is cross-fund *views and analytics* — there is no all-deals screen and no per-company-across-funds screen. Real complaint, wrong diagnosis; WS25 builds the views, and WS24's "normalization" scope is correspondingly small (rounds/marks/cashflows are *new* structures, not a re-normalization of deals).

**Infrastructure verification (working tree, 2026-07-15):** route namespaces `/admin/portfolio` and `/admin/sync` are free (checked `src/app/admin/`); lib names `portfolio-metrics.ts`, `sheets.ts`, `sheet-sync.ts` are free (checked `src/lib/`). Three crons exist in `vercel.json` — the weekly sync becomes #4. `/api/cron` is already in `PUBLIC_PREFIXES` (`route-access.ts:41`) so the sync cron needs **no middleware change** (no new F15-family surface); the cron route reuses the alerts cron's shared GET+POST `CRON_SECRET` handler pattern (`api/cron/alerts/route.ts`). `AuditLog.actorId` is nullable with a required `actorEmail` string (`schema.prisma:424-436`) and `logAdminAction` accepts `{ id?, email? }` — a cron-triggered sync can write audit rows as `{ email: "sheets-sync@cron" }` with no schema change (JC20). The publish confirm lives in `admin/reports/[id]/page.tsx` (`confirmPublish` state, `handlePublish` at line 122) — the Q27 banner slots into that existing dialog. `Deal.notes` exists and is sheet-sourced today; `Fund`/`PortfolioCompany` back-relation additions in WS24 are relation-list fields only (no DB columns). `xlsx`/`tsx` devDeps from WS16 remain available for the backfill script.

## Part 10 technical judgment calls (flagged per protocol — each with a cheap reversal)

- **JC14 — LP idle window = 7 days exactly** (Q21 delegated the number). Rationale: LPs engage in bursts around report publications; 7 days keeps a session alive through an engaged week while cutting the shared-device exposure window from 30 days to ≤7 after last use. The at-most-hourly `lastUsedAt` touch granularity is noise at this scale, and the touch being best-effort (`.catch(() => {})`) can only *shorten* effective idle life, never extend it. Reversal: one constant (`LP_IDLE_DAYS`).
- **JC15 — Zero-dependency Google Sheets client.** Service-account auth is a signed RS256 JWT (`crypto.createSign`) exchanged at `oauth2.googleapis.com/token`, then one `fetch` to the Sheets v4 `values.get` endpoint — ~60 lines total, read-only scope (`spreadsheets.readonly`). No `googleapis` (heavy) or `google-auth-library` dep; better for a fork-friendly repo (fewer supply-chain surfaces, and forks that don't use Sheets carry zero extra code weight). Reversal: swap `src/lib/sheets.ts` internals for `googleapis` — callers unchanged.
- **JC16 — `ValuationMark` is company-level *history*; the per-deal `currentValuation` remains the authoritative render path.** Writing a new mark (manual or sync) fans out to that company's deals' `currentValuation` + `valuationAsOf` in the same transaction — exactly what an admin edit does today. This preserves the shipped hover-card/snapshot semantics byte-identically (ground rule 2) while gaining the ledger history the PRD wants. Reversal: a later WS can flip readers to `ValuationMark` directly; until then no reader changes.
- **JC17 — The backfill synthesizes one `FinancingRound` per existing deal (no grouping), `kind: "UNKNOWN"`, `source: "BACKFILL"`.** Grouping same-company/same-date rows into shared rounds would have to guess through the known Northstar/Southgate duplicate-Initial rows (F17); one-per-deal is mechanical, honest, and admins can merge rounds later via CRUD. Reversal: the script's `--revert` deletes `source: "BACKFILL"` rows and nulls the pointers (the reversibility requirement).
- **JC18 — "Fund-company position" (the PRD's entity) is a computed view, not a table.** Positions are derivable by grouping deals on (fund, company); persisting them invites drift. Reversal: nothing persisted, so a future materialized table costs nothing to add.
- **JC19 — Sync scope v1 = deals + valuations only; never destructive.** The sync creates/updates `Deal` rows (and auto-creates `PortfolioCompany` rows for exact-new names, flagged in the diff) but **never deletes anything and never creates funds** — an unknown vehicle column or a sheet-ID that disappears becomes a report line for a human, not a mutation. Reversal: widen scope in a later WS.
- **JC20 — Cron-triggered syncs write audit rows as actor `{ email: "sheets-sync@cron" }`** (nullable `actorId` verified above); manual syncs log the clicking admin. Reversal: cosmetic relabel.

---

## WS23 — LP session idle timeout + report-draft integrity polish (~0.5–0.75 day) — SHIPPED 2026-07-20

**Goal:** Q21 ships (7-day idle enforcement on the existing column), and the PRD's Phase 1 residue — F24 and the stale-mention affordance — closes. No schema changes.

### WS23.1 Idle timeout in `src/lib/lp-auth.ts` (+ tests)

- Add `export const LP_IDLE_DAYS = 7;` beside `LP_SESSION_DAYS` (JC14).
- `isSessionValid` gains the idle check, additively — the param type widens to `{ expiresAt: Date; lastUsedAt?: Date }`:

```ts
export function isSessionValid(
  session: { expiresAt: Date; lastUsedAt?: Date } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!session || session.expiresAt.getTime() <= now.getTime()) return false;
  if (session.lastUsedAt && now.getTime() - session.lastUsedAt.getTime() > LP_IDLE_DAYS * 24 * 60 * 60 * 1000) {
    return false; // idle-expired (Q21/JC14); callers already treat invalid as logged-out
  }
  return true;
}
```

- `getLp()` already passes the full session row, so the enforcement is automatic; the hourly `lastUsedAt` touch (lines 76-79) is unchanged and is what keeps active users alive. The 30-day cookie/`expiresAt` hard cap is untouched.
- Extend `lp-auth` unit tests: fresh session valid; `lastUsedAt` 8 days ago → invalid even with future `expiresAt`; `lastUsedAt` absent (legacy callers/tests) → hard-expiry-only behavior preserved; boundary at exactly 7 days.

### WS23.2 F24 fix — name deleted companies honestly in the publish error

`api/admin/reports/[id]/publish/route.ts:35`: offenders that are missing from `byId` (deleted companies) render as `"a company that no longer exists"` instead of the raw cuid; offenders present-but-dealless keep their names. One-line message split; no shape change (still `{ error }`, 400).

### WS23.3 Draft-integrity affordance — "Mentioned companies" summary in the report editor

`admin/reports/[id]/page.tsx`: under the editor (near the existing `@`-hint at line ~289), a muted list computed client-side — `extractMentionIds(body)` (pure regex, safe to import client-side from `@/lib/report-snapshot`) matched against the picker's fetch results (`/api/admin/portfolio-companies?fundId=`). Each mentioned company renders as a small chip; ids with no match render a `text-laterite` chip "unknown company — remove this mention from the text". This surfaces the F23 edge (deleted-while-drafted) *before* the publish 400, and doubles as an at-a-glance list of which hover cards the report will carry. No new API.

**WS23 acceptance checklist**
- [ ] `npm run typecheck && npm run lint && npm test` green; lp-auth idle tests cover the four cases above
- [ ] Live: an LP session with `lastUsedAt` backdated 8 days (SQL against a test LP) → `/lp` redirects to the login step; a fresh OTP works; an active session is untouched
- [ ] Publish a draft mentioning a since-deleted zero-deal test company → 400 message says "no longer exists", no cuid; the editor shows the red chip for it beforehand
- [ ] Grep guard: no diffs under `src/app/lp/**` except none (WS23.1 is lib-only), no changes to `mention-cards.tsx`/`report-view.tsx`/snapshot shape

**UX impact:** LPs idle >7 days re-authenticate via OTP (explicitly decided, Q21 — the only intentional behavior change in this Part for any non-admin); admin report editor gains an additive summary strip. **Cost impact:** none. **Schema:** none.

## WS24 — Ledger schema + reversible backfill of the 76 production deals (~2–2.5 days) — SHIPPED 2026-07-20

**Verified result:** dry-run before apply confirmed 76 deals / 50 portfolio companies (the correct, verified count — two test deals that had inflated it to 78/52 were identified, confirmed as test entries by the user, and deleted with explicit sign-off before this backfill ran). Apply created 76 `FinancingRound` rows (one per deal) and 50 `ValuationMark` rows (one per company), linked all 76 deals via `roundId`, and reported zero valuation disagreements. Re-run dry-run after apply confirmed full idempotency ("0 to do" everywhere).

**Goal:** the round/mark/cashflow ledger exists (additive tables + nullable `Deal` columns), and every production deal is linked to a synthesized round with `--revert` available. Admin-only, and in this WS *invisible* — no UI reads the new tables yet (WS25 does).

### WS24.1 Schema (additive — `db push` per house procedure before code)

Append to `prisma/schema.prisma` (back-relations on `PortfolioCompany`/`Fund`/`Deal` are relation-list or nullable-FK fields):

```prisma
model FinancingRound {
  id                 String   @id @default(cuid())
  portfolioCompanyId String
  label              String?  // free text: "Seed", "Series A", "SAFE (2024)" — mirrors Deal.instrument's free-text convention (F17)
  kind               String   @default("UNKNOWN") // "PRICED" | "SAFE" | "CONVERSION" | "OTHER" | "UNKNOWN"
  roundDate          DateTime
  raisedUsd          Decimal? // FULL round size, all investors — optional-when-known (Q24)
  preMoneyUsd        Decimal?
  postMoneyUsd       Decimal? // valuation or cap (post)
  source             String   @default("MANUAL") // "MANUAL" | "BACKFILL" | "SHEET"
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)
  deals            Deal[]           @relation("RoundDeals")
  conversions      Deal[]           @relation("ConvertedDeals")

  @@index([portfolioCompanyId, roundDate])
  @@map("financing_rounds")
}

model ValuationMark {
  id                 String   @id @default(cuid())
  portfolioCompanyId String
  valuationUsd       Decimal  // company valuation; 0 = written off (house convention)
  asOf               DateTime
  source             String   @default("MANUAL") // "MANUAL" | "BACKFILL" | "SHEET"
  notes              String?
  createdAt          DateTime @default(now())

  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)

  @@index([portfolioCompanyId, asOf])
  @@map("valuation_marks")
}

model FundCashflow {
  id                 String   @id @default(cuid())
  fundId             String
  portfolioCompanyId String?  // set for company-attributed distributions/exits
  kind               String   // "CAPITAL_CALL" | "DISTRIBUTION" | "FEE" | "OTHER"
  date               DateTime
  amountUsd          Decimal  // always positive; direction is implied by kind
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  fund             Fund              @relation(fields: [fundId], references: [id], onDelete: Cascade)
  portfolioCompany PortfolioCompany? @relation(fields: [portfolioCompanyId], references: [id], onDelete: SetNull)

  @@index([fundId, date])
  @@map("fund_cashflows")
}
```

`Deal` gains three nullable columns (additive) + relations: `roundId String?` (→ `FinancingRound` `"RoundDeals"`), `convertedInRoundId String?` (→ `FinancingRound` `"ConvertedDeals"` — which priced round a SAFE converted in, Q24), `ownershipPct Decimal?` (fund's ownership after this deal's round, 0–100, optional-when-known, Q24). **Deliberately absent:** any position table (JC18), any change to `currentValuation`/`valuationAsOf` semantics (JC16), any snapshot-shape change (ground rule 2).

### WS24.2 `scripts/backfill-rounds.ts` (tsx; dry-run default, `--apply`, `--revert`)

Same conventions as `import-investment-tracker.ts` (local run against prod per the env-pull procedure; output prints valuations — never paste it anywhere).

- **Apply** (idempotent — skips deals with `roundId` already set): per deal, create `FinancingRound { portfolioCompanyId, roundDate: dealDate, postMoneyUsd: entryValuation, label: instrument, kind: "UNKNOWN", source: "BACKFILL" }` and set `deal.roundId` (JC17). Then per company, one `ValuationMark { valuationUsd, asOf, source: "BACKFILL" }` from the company's most recent non-null (`currentValuation`, `valuationAsOf`) deal pair; companies whose deals disagree on `currentValuation` are printed for a human eyeball (expected: the Northstar/Southgate F17 near-dupes).
- **Revert**: null all `Deal.roundId`/`convertedInRoundId` pointing at `source: "BACKFILL"` rounds, then delete `BACKFILL` rounds and marks. Refuses (with a list) if any `BACKFILL` round has acquired non-backfill references (e.g. a manually-set `convertedInRoundId`) — reversibility must not destroy human work.
- Dry-run prints per-company round/mark counts and the disagreement list; apply re-run prints "0 to do".

### WS24.3 Bookkeeping

`.gitignore` already guards `*.xlsx`; nothing else. No ROADMAP change yet (nothing user-visible until WS25).

**WS24 acceptance checklist**
- [ ] `npx prisma db push` clean against prod (additive only — verify no drop statements in the diff preview); `npm run typecheck && npm run lint && npm test` green
- [ ] Dry-run against prod: exactly 76 rounds planned (one per deal), ~50 marks, disagreement list reviewed by the user before `--apply`
- [ ] Apply → re-run dry-run prints 0; spot-check one multi-deal company in Prisma Studio (rounds carry the deal dates/caps)
- [ ] `--revert` on a **local/branch DB copy** restores nulls and deletes backfill rows (do not revert prod; the flag exists as the escape hatch)
- [ ] Published report hover cards byte-identical before/after (frozen snapshots + JC16 — verify one live report page)
- [ ] Grep guard: no changes under `src/app/**` in this WS (schema + script only)

**UX impact:** none — no surface reads the new tables yet. **Cost impact:** none. **Schema:** 3 new tables + 3 nullable `Deal` columns, all additive.

## WS25 — Cross-fund portfolio views + rounds/marks/cashflows CRUD (~2–2.5 days) — SHIPPED 2026-07-20

**Goal:** the F25 gap closes — admins get an all-deals view and a per-company cross-fund view — and the WS24 ledger becomes maintainable (rounds/marks/cashflows CRUD, audit-logged). Admin-only.

### WS25.1 APIs (all `requireAdmin`, house route conventions, audit-logged)

- `GET /api/admin/portfolio` — all deals joined with fund + company (+ round label), filterable `?fundId=&portfolioCompanyId=&investmentType=&q=`; plus a summary object (totalInvested, dealCount, companyCount, fundCount). Decimal → `Number()` per house convention.
- `GET /api/admin/portfolio/companies/[id]` — one company: deals across funds, rounds (dated), marks (dated), computed per-fund position groups (JC18 — computed in the route, not stored).
- Rounds: `POST /api/admin/rounds`, `PATCH/DELETE /api/admin/rounds/[id]` (`ROUND_CREATED/UPDATED/DELETED`; DELETE 409s if any deal points at it — repoint first, mirroring the F23 delete-guard pattern).
- Marks: `POST /api/admin/portfolio-companies/[id]/marks` — creates the mark **and fans out** `currentValuation`/`valuationAsOf` to that company's deals in one transaction (JC16), `MARK_CREATED` with old→new metadata; `DELETE /api/admin/marks/[id]` removes history only (no fan-out reversal — deliberate; the current valuation is corrected by writing a new mark, never by deleting history).
- Cashflows: `POST /api/admin/funds/[id]/cashflows`, `PATCH/DELETE /api/admin/cashflows/[id]` (`CASHFLOW_*`). Validation: kind ∈ enum, amount > 0.
- The existing deal PATCH (`api/admin/deals/[id]`) additionally accepts `roundId`, `convertedInRoundId`, `ownershipPct` (nullable; 0–100 check) — additive fields on an existing route, response shape extended additively.

### WS25.2 `/admin/portfolio` page (+ sidebar link)

Summary strip (4 stat cards, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` — the WS14.7 base-class lesson), filters (native `<select>` per house convention: fund, type; text search), all-deals table (Part 6 Pattern A scrollable), each row linking company → WS25.3 and fund → `/admin/funds/[id]`. Admin sidebar gains "Portfolio" next to "Funds".

### WS25.3 `/admin/portfolio/[id]` company page

Header (name, country, operational-Company link chip per Q14); deals-across-funds table (Pattern A) with inline round assignment (native `<select>` of the company's rounds) and optional `ownershipPct` input; rounds timeline section (create/edit/delete; fields per WS24.1, all optional except date); marks history (dated list, newest first; "Record new mark" form → WS25.1 fan-out, with helper text "updates the current valuation on all of this company's deals"); computed positions block (per fund: invested, deal count, latest multiple).

### WS25.4 `/admin/funds/[id]` additions

A "Cashflows" section (Pattern B wrap-row cards: kind badge, date, amount, optional company, notes; add/edit/delete). Below it, a placeholder note where WS26's performance card will land. Existing deals table/inline-valuation UI unchanged in this WS.

**WS25 acceptance checklist**
- [ ] All new/changed routes 307 without session, 403 for founders, 200 for admin (live curl, F15-family ritual)
- [ ] `/admin/portfolio` totals reconcile with the fund pages' numbers (spot-check FUND1); filters compose
- [ ] Recording a mark updates every deal of that company (verify a multi-fund company) and writes `MARK_CREATED` with old→new; round delete with attached deals → 409
- [ ] Deal PATCH round/ownership fields round-trip; setting `ownershipPct: 150` → 400
- [ ] 375px: portfolio table scrolls (Pattern A), stat cards stack, cashflow rows wrap (Pattern B)
- [ ] Frozen published-report cards still byte-identical (JC16 fan-out equals today's admin-edit path); grep guard on LP files holds
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive admin pages/sections; founder/LP/investor surfaces untouched. **Cost impact:** none. **Schema:** none (WS24's).

## WS26 — Derived metrics engine, admin-only (~1.5–2 days) — SHIPPED 2026-07-20

**Implementation note (deviation flagged, cheap to reverse):** the plan text for `fundFlows` said "deal amounts as dated outflows, DISTRIBUTION inflows, CAPITAL_CALL/FEE per kind" without spelling out CAPITAL_CALL's sign. Shipped behavior: CAPITAL_CALL rows are **excluded** from the XIRR flow series (deal amounts already represent the capital-deployed outflow; adding CAPITAL_CALL too would double-count), and instead feed `computePaidIn`'s TVPI/DPI override when a fund has any recorded. FEE rows are an additional outflow. Documented in `portfolio-metrics.ts`; the only change needed to reverse this is inside `fundFlows`.

**Goal:** IRR/TVPI/DPI and dilution-aware values are computed by code from ledger records (PRD B5/B6), shown **only** on admin surfaces (Q23). Pure lib + tests first, house style.

### WS26.1 `src/lib/portfolio-metrics.ts` (pure, unit-tested — the route-access/share-metrics/report-snapshot pattern)

- `xirr(flows: { date: Date; amount: number }[]): number | null` — Newton's method with bisection fallback and guard rails (needs ≥1 negative and ≥1 positive flow, clamp to (-0.9999, 10], `null` on non-convergence — never NaN/Infinity out). **Acceptance fixtures are synthetic** (ground rule 1) and hand-computed; the spreadsheet's IRR blocks are explicitly NOT a reference — F17 documented them as stale/corrupted.
- `fundFlows(deals, cashflows, impliedNav, asOf)` — assembles the gross cashflow series: deal amounts as dated outflows, `DISTRIBUTION` inflows, `CAPITAL_CALL`/`FEE` per kind, plus a terminal NAV inflow at `asOf`.
- `tvpi/dpi/rvpi(paidIn, distributions, nav)` — with the explicit fallback: when a fund has zero `CAPITAL_CALL` rows, `paidIn = Σ deal amounts` and the result carries `approximate: true` (rendered as "≈, no capital calls recorded" — never silently precise).
- `positionValue(deal, latestMark)` — dilution-aware when `ownershipPct != null` (`ownershipPct × latestMark`), else zero-dilution implied value (`amountUsd × multiple`, the shipped assumption) with `dilutionAware: false` so the UI can badge it. Reuses `computeMultiple` from `report-snapshot.ts` — no duplicate multiple math.

### WS26.2 Admin surfaces

- `/admin/funds/[id]`: "Performance" card — invested, implied value, TVPI (≈-badged when approximate), DPI, gross IRR (dash + tooltip when `null`), asOf = latest mark date. Mono figures, muted "admin-only estimate; gross of fees unless FEE rows are recorded" footnote.
- `/admin/portfolio`: summary strip gains blended implied value; table rows show position value with a "no dilution data" dot-badge where `dilutionAware: false` (expected: everywhere, until Q24's new sheet columns flow in).
- `/admin/portfolio/[id]`: per-position values with the same badging.

**WS26 acceptance checklist**
- [ ] `portfolio-metrics.test.ts`: xirr two-flow exact case, multi-flow fixture, non-convergent → `null`, empty/one-sided → `null`; tvpi approximate flag; positionValue both branches; all synthetic numbers
- [ ] Live: FUND1 performance card renders; with no cashflow rows TVPI shows the ≈ badge; after adding a test `DISTRIBUTION` on a test fund, DPI moves and IRR recomputes
- [ ] **Q23 guard:** grep confirms `portfolio-metrics` is imported only under `src/app/admin/**` and `src/app/api/admin/**`; `/lp` pages and share/hover-card code untouched (ground rule 3)
- [ ] `npm run typecheck && npm run lint && npm test` green; 375px check on the new cards

**UX impact:** additive admin cards/columns. **Cost impact:** none (pure computation). **Schema:** none.

## WS27 — Google Sheets one-way sync + staleness affordances (~2.5–3 days) — gated, ships LAST — CODE SHIPPED 2026-07-20, LINKING STEP SHIPPED 2026-07-20, APPLY STILL DISABLED PENDING A LIVE RUN OF THE LINKING STEP (see status note below — do not lift the gate without reading it)

**Goal:** the Deals sheet becomes a recurring one-way input (Q22-B): weekly cron + manual "Sync now", diff-first with a persistent run/diff surface at `/admin/sync`, sheet-owned fields read-only while enabled, staleness banner on publish (Q27). Entirely env-gated (ground rule 4).

**Gates (all three, before the first line of code):** (1) the team has added the stable **ID column** to the Deals sheet and backfilled it for all 76 rows (Q26); (2) a Google Cloud service account exists, the sheet is shared with its email read-only, and `GOOGLE_SA_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` / `SHEETS_SPREADSHEET_ID` are set in Vercel (user provisions; names-only in `.env.example`); (3) the new go-forward columns for round size / ownership are named and positioned (Q24 — sync maps them to `FinancingRound.raisedUsd` / `Deal.ownershipPct` when present, skips them cleanly when absent).

**CORRECTION (2026-07-20) — the sheet-structure assumptions below were wrong.** This section originally inherited its column layout from the *original Excel file* the Part 7 importer read. The live production Google Sheet — verified directly via the Sheets API, not assumed — has a materially different structure. Corrected facts, load-bearing for WS27.2/27.3:

- The tab is named **"All Deals"**, not "Deals" — there is no "Deals" tab in this spreadsheet.
- The **header is at row 1**, not row 15 — there is no summary block above the table. Data starts row 2, and (as of this writing) runs to row 77 — **76 data rows**, matching production's 76 deals 1:1 in original order.
- Confirmed columns (by header text, left to right): A = blank/sequential display number (unused), **B = "Stable ID column"** (already backfilled: `D-0001` through `D-0076`, sequential, unique, zero blanks, zero duplicates, verified via direct API read), C = Company, D = Vehicle, E = Investment (`"Initial"` / `"Follow-On"`), F = Date (string format like `"May 8, 2019"` — not ISO, parsed with an explicit month-name parser, not `new Date(string)`), G = Country, H = Amount (currency string like `"$150,000"` — parsed by stripping `$`/`,`), I = Instrument (free text, typos preserved as-is per F17), J = `"Valuation/\nCap (post)"` (entry valuation, same currency-string format — note the literal embedded newline in the header text), K = Current Valuation (same format), L = `"Markups*"` (a plain decimal multiple — **not synced**, it's derived from J/K, not an independent field), M = Implied Value (currency-string, **not synced** — also derived), N = Notes.
- **Column lookup is by header TEXT (case-insensitive, trimmed), never hardcoded letters** — this is what makes the round-size/ownership columns (not yet added, Q24 gate #3) pick up automatically once named, and skip cleanly (no error, no block) while absent.
- No `=TODAY()` as-of column exists in the real sheet (the original plan text's assumption); ignore that line below.

The rest of this section (WS27.1/27.4-27.7) is unaffected by the correction and stands as originally planned. WS27.2/27.3 below have been updated in place to match.

**Status (2026-07-20, updated same day): schema live, all sync code shipped. A live-verification incident left 27 duplicate `Deal` rows in production; those have since been deleted (independently verified, explicit user confirmation — see below). The one-time `sheetRowId` linking step this incident depended on not existing has now shipped as an admin UI feature. The post-incident safety gate (`SHEETS_SYNC_APPLY_ENABLED`) is still unset/off in production and must stay that way until a human runs the linking step live and gets a clean report — read this whole note before touching sync again.**

The WS27.1 schema push (`Deal.sheetRowId String? @unique` + `SheetSyncRun`) was completed with explicit user sign-off (the `--accept-data-loss` warning was boilerplate on a brand-new all-NULL unique column, verified safe via `prisma migrate diff` beforehand). `src/lib/sheets.ts`/`sheet-sync.ts` (WS27.2/27.3, pure, 31 tests) were already shipped. WS27.4–27.6 then shipped on top: `src/lib/sheet-sync-runner.ts` (the DB-touching apply/runner), the weekly cron (`/api/cron/sheets-sync`, `vercel.json`), the manual admin route (`/api/admin/sheets-sync`, GET status/history + POST dry-run/apply), read-only enforcement on synced deals/marks (Q22-B), the `/admin/sync` page, the sidebar nav gate, and the Q27 publish-confirm staleness banner.

**Incident (2026-07-20, during live auth-gating verification):** a `curl` against `/api/cron/sheets-sync` with the real `CRON_SECRET` — intended only to confirm the 200/401 auth boundary — actually executed a full `CRON`-trigger apply. Because the one-time `sheetRowId` linking step (see below) had not run yet, every one of the 76 "All Deals" sheet rows had no matching `Deal.sheetRowId` to update, so `computeSheetDiff` correctly-but-harmfully classified all 76 as **creates**. The apply ran to completion before any human reviewed it, producing **27 duplicate `Deal` rows** (not 76 — the other sheet rows errored out in validation, e.g. unresolved vehicle/date/amount cells, and were captured as diff errors instead of creates). Verified via read-only aggregate-count queries only (no company names or dollar values were read or printed at any point): `dealCount` 76→103, `dealsWithSheetRowId` 0→27, `portfolioCompanyCount` unchanged at 50, `valuationMarkCount` unchanged at 50. This means: no new companies were invented, no valuations were overwritten or fanned out (the JC16 mark path only fires on *updates*, and there were zero updates — only creates), and the original 76 deals are untouched, still `sheetRowId: null`. The blast radius is exactly and only the 27 new duplicate rows.

**Cleanup (2026-07-20, same day, explicit fresh user authorization):** the 27 duplicate rows — exactly and only the `Deal` rows where `sheetRowId IS NOT NULL`, since zero legitimate deals had that set at the time — were deleted from production and the deletion independently verified (`dealCount` back to 76, `dealsWithSheetRowId` back to 0). This is noted here for the record; it is a completed, one-time action, not a standing instruction — do not re-run any bulk `Deal` delete against production without a fresh, specific authorization.

**Immediate mitigation shipped the same day:** `runSheetSync()` now refuses every non-dry-run apply (`CRON` or `MANUAL`) unless `SHEETS_SYNC_APPLY_ENABLED=true` is explicitly set in Vercel (absent everywhere today, including prod) — dry-run/preview is unaffected and still fully functional. This was verified live: a repeat cron invocation with the correct `CRON_SECRET` now returns `{"status":"FAILED"}` (a recorded `SheetSyncRun` row, zero new deals). This closes the immediate risk of the next Monday-08:00-UTC cron creating another batch, but the 27 duplicates from the incident are still sitting in prod.

**A second, independent problem surfaced in the process:** `GOOGLE_SA_EMAIL`/`GOOGLE_SA_PRIVATE_KEY`/`SHEETS_SPREADSHEET_ID` are provisioned in Vercel as write-only ("Encrypted", and empirically un-pullable — `vercel env pull` returns empty strings for exactly these three, while `CRON_SECRET`/`DATABASE_URL` pull correctly). This means `scripts/link-sheet-rows.ts`, as originally written, could not run locally at all — the house `vercel env pull` procedure that every prior script in this project relied on doesn't work for Sheets credentials specifically.

**Both follow-ups are now resolved:**
1. **The 27 duplicate rows were deleted** (see the cleanup note above, same day, explicit fresh user authorization) — prod is back to 76 deals, all with `sheetRowId: null`.
2. **The linking step has been redesigned and shipped as an admin UI feature** (same day): `src/lib/sheet-link.ts` (pure matching logic — company + vehicle + investment type + date, amount as a tiebreaker; ported from `scripts/link-sheet-rows.ts`, which has been deleted now that its logic lives here) + `POST /api/admin/sheets-sync/link` (`requireAdmin`-gated; `{ apply: false }` previews, `{ apply: true }` writes) + a "Link existing deals to sheet rows" section on `/admin/sync`. Preview reads the live sheet and reports a match per deal (matched / already-linked / ambiguous / unmatched) without writing anything. Apply is **all-or-nothing**: it refuses to write anything if any deal is ambiguous or unmatched (deliberately no partial-apply-with-override — 76 rows, one-time operation, simpler and safer). Idempotent — already-linked deals are always skipped, safe to re-run. Writes go through `logAdminAction` (`DEALS_LINKED_TO_SHEET`) exactly like every other admin write, so the real authenticated admin's session produces the audit trail — this is why it's a route and not a script.

**What's still an open human step:** this feature has been built but not yet run against production (no authenticated admin session was available to the agent that built it, by design — see ground rules). The remaining sequence is: an admin logs in, runs the preview on `/admin/sync`, confirms a clean report (0 ambiguous, 0 unmatched), clicks Apply, and only after that separately decides whether to set `SHEETS_SYNC_APPLY_ENABLED=true` to re-enable the recurring sync's real applies. Until that happens, WS27's cron/manual-sync machinery remains intentionally inert (dry-run only) by design, and that's the correct, safe state — not a regression.

### WS27.1 Schema (additive; `db push`)

`Deal.sheetRowId String? @unique` (the sheet-ID ↔ deal identity), plus:

```prisma
model SheetSyncRun {
  id         String    @id @default(cuid())
  trigger    String    // "CRON" | "MANUAL" | "DRY_RUN"
  status     String    // "SUCCESS" | "FAILED"
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  summary    Json?     // diff: creates/updates(field old→new)/newCompanies/errors — confidential, admin-gated reads only
  error      String?

  @@index([startedAt])
  @@map("sheet_sync_runs")
}
```

### WS27.2 `src/lib/sheets.ts` — env gate + zero-dep client (JC15) — SHIPPED 2026-07-20

`sheetsSyncEnabled()` = all three env vars present (the single switch every UI/route checks); `getSheetRows()` = SA-JWT (RS256, hand-signed via `crypto.createSign`) → token exchange at `oauth2.googleapis.com/token` → one `fetch` to the Sheets v4 `values.get` endpoint on the `'All Deals'!A1:Z1000` range (tab name corrected above); returns `{ header, rows }` as raw strings. `findColumn(header, name)` does the case-insensitive, trimmed header-text lookup every caller uses instead of hardcoded letters. ~115 lines; scope `spreadsheets.readonly`; zero new deps (JC15 upheld).

### WS27.3 `src/lib/sheet-sync.ts` — pure diff engine + tests — SHIPPED 2026-07-20

`computeSheetDiff(sheet: SheetTable, dbDeals, knownFunds, knownCompanies)` → `{ creates, updates: [{ sheetRowId, dealId, field, from, to }...], newCompanies, errors: { duplicateIds, missingIds, unknownVehicles, badCells } }`. Carries the corrected sheet structure as code: header-text column lookup (not hardcoded letters — the round-size/ownership columns pick up automatically once named and are skipped cleanly while absent), `"Follow-On"` literal mapped to `FOLLOW_ON`, an explicit `Month D, YYYY` date parser (not `new Date(string)` — engine/locale-dependent), currency-string parsing (`$`/`,` stripped), free-text instruments preserved, `Markups*`/`Implied Value` deliberately NOT synced (derived columns, not independent data). 14 unit tests on synthetic rows (ground rule 1): duplicate ID → error not mutation; missing ID → error with the correct 1-based sheet row number; unknown vehicle → error, never invents a fund (JC19); bad Investment/currency cells → `badCells`, not a mutation; reordered rows → identical diff (identity is the ID, not position); a single valuation change → exactly one field-level update; no changes → zero diff.

**Deviation (flagged, cheap):** `applySheetDiff(diff, actor)` was **not** added to `sheet-sync.ts` as originally planned — it needs `db`/`getSheetRows`/`logAdminAction` access, which would have broken that file's "pure, Prisma-free, schema-independent" contract (the whole reason it shipped safely on its own before the schema was live). It lives instead in the new `src/lib/sheet-sync-runner.ts`, alongside `runSheetSync()` (the shared entry point both the cron and admin routes call). Per JC19, never destructive: creates deals (+ exact-name `PortfolioCompany` auto-creates, flagged), applies non-valuation field updates per deal, and groups `currentValuation` changes by company into one `ValuationMark { source: "SHEET" }` + JC16 fan-out per company (last-write-wins if a run touches more than one deal of the same company). Writes a `SheetSyncRun` row (status, summary) win or lose. **Also carries the post-incident safety gate** (see the status note above): non-dry-run applies additionally require `SHEETS_SYNC_APPLY_ENABLED=true`.

### WS27.4 Routes — SHIPPED 2026-07-20

`GET+POST /api/cron/sheets-sync` (weekly, `vercel.json` `"0 8 * * 1"`, shared `CRON_SECRET` handler matching `api/cron/alerts`) and `GET+POST /api/admin/sheets-sync` (`requireAdmin`; GET = `{enabled, runs}` status/history, POST = dry-run preview or MANUAL apply) are live. Both route through `src/lib/sheet-sync-runner.ts`'s `runSheetSync()`.

### WS27.5 Read-only enforcement (Q22-B/Q26) — SHIPPED 2026-07-20

`api/admin/deals/[id]` PATCH/DELETE 409 on sheet-owned fields (`investmentType`/`dealDate`/`amountUsd`/`instrument`/`entryValuation`/`currentValuation`/`notes`) once `sheetsSyncEnabled() && deal.sheetRowId` — `roundId`/`convertedInRoundId`/`ownershipPct` stay editable. The marks POST 409s when every deal of a company is sheet-synced. `/admin/funds/[id]`'s deal table swaps the edit/delete controls for a "synced from sheet" chip under the same two-condition gate (verified live-consistent: it's exactly the 27 incident-duplicate rows showing this chip right now, which is correct behavior given their `sheetRowId` is set — see the status note above for why those rows shouldn't exist).

### WS27.6 `/admin/sync` page + Q27 publish affordance — SHIPPED 2026-07-20

- `/admin/sync` (sidebar item, rendered only when enabled): status header (last successful run), "Sync now" + "Preview changes (dry run)" buttons, run-history table, expandable latest-diff detail (field-level old→new rows, new companies, error list).
- Publish confirm (`admin/reports/[id]/page.tsx`): when enabled, "Portfolio data last synced {date} ({n} days ago)" (ochre when >7 days or never) with an inline "Sync now" button (Q27). Absent entirely when sync is disabled.

### WS27.7 Docs + bookkeeping — PARTIAL

`.env.example` has the three names (values stay Vercel-only). `ROADMAP.md` updated per the Part 10 bookkeeping note below. **Not done:** the `SETUP.md` "Google Sheets ingestion" section — deferred until the linking step has actually been run live and `SHEETS_SYNC_APPLY_ENABLED` is on, so the doc describes the actual final setup flow rather than one that gets rewritten again immediately after.

### WS27.8 One-time linking step — SHIPPED 2026-07-20

The last missing piece: each of the 76 `Deal` rows needs its `sheetRowId` populated so the recurring sync recognizes them as existing rather than new (this is exactly the gap the incident above fell into). Shipped as an admin UI feature rather than a script, because `GOOGLE_SA_EMAIL`/`GOOGLE_SA_PRIVATE_KEY` are Vercel "Sensitive" env vars that can never be pulled locally — the logic can only run inside the deployed app, with a real admin session.

- `src/lib/sheet-link.ts` — pure matching logic (no DB/network), same extraction pattern as `sheet-sync.ts`. `parseSheetLinkRows` reads sheet rows into candidates; `matchDealsToSheetRows` matches each deal by company + vehicle + investment type + date (amount as a tiebreaker on a multi-candidate content key), reporting `matched` / `already-linked` / `ambiguous` / `unmatched` — never guesses. 12 unit tests on synthetic data (ground rule 1). Ported from `scripts/link-sheet-rows.ts`, which has been **deleted** now that its logic lives here and is reachable — keeping both would have meant two implementations to keep in sync for no benefit.
- `POST /api/admin/sheets-sync/link` (`requireAdmin`-gated, same auth boundary as every other admin route — no alternate/bypass entry point) — `{ apply: false }` (default) previews: reads the live sheet + all 76 deals, returns a match per deal, writes nothing. `{ apply: true }` applies: writes `Deal.sheetRowId` for matched deals only, **refuses entirely if any deal is ambiguous or unmatched** (all-or-nothing, no partial-apply-with-override — deliberate, safer default for a 76-row one-time operation per the plan). Idempotent: already-linked deals are always skipped, safe to re-run. On a successful apply, logs `DEALS_LINKED_TO_SHEET` via `logAdminAction` with the real authenticated admin as actor (this is precisely why this is a route and not a script) — metadata carries counts and deal/stable IDs only, never company names or dollar amounts.
- `/admin/sync` — new "Link existing deals to sheet rows" card above the run-history table: "Preview matches" button renders a status-badged table (matched/already-linked/ambiguous/unmatched, per-deal detail); "Apply links" is disabled until a clean preview (0 ambiguous, 0 unmatched) has been fetched into state, and disabled again if there's nothing to apply (all already linked).
- Not touched: `SHEETS_SYNC_APPLY_ENABLED` remains unset in production — turning it on is a separate, later human decision after this linking step has actually been run and verified live.

**WS27 acceptance checklist**
- [x] `sheet-sync.test.ts` green (synthetic rows: reorder-invariance, duplicate-ID error, field-level valuation diff) — 14 tests, plus 3 more in `sheets.ts`'s `findColumn`/parsing helpers exercised via the same file
- [x] `sheet-link.test.ts` green (synthetic rows: content-key match, idempotent already-linked skip, ambiguous on duplicate content key, ambiguous on claimed stable ID, unmatched, amount tiebreak) — 12 tests
- [x] **Fork story (ground rule 4):** with the three env vars absent, `sheetsSyncEnabled()` is false everywhere it's checked (cron no-ops 200, `/admin/sync` nav/page hidden, publish banner hidden, deals fully editable, linking route 400s cleanly) — code-reviewed and consistent with the shipped route-access/sidebar/deal-route logic; not separately re-verified on a creds-less preview deploy this session
- [x] `curl` cron route with correct `CRON_SECRET` → 200 (body `{"status":"FAILED"}` under the new incident safety gate, by design), wrong secret → 401, no secret → 401 — all live-verified against `molly.dfslab.net`
- [x] `/api/admin/sheets-sync`, `/api/admin/sheets-sync/link`, and `/admin/sync` all 307-redirect with no session — live-verified
- [ ] Live sync end-to-end (dry-run → apply → `ValuationMark(source:"SHEET")` → `/admin/audit` → draft-vs-published snapshot proof) — **blocked**: apply is intentionally disabled (`SHEETS_SYNC_APPLY_ENABLED`) until the linking step below has been run and verified live
- [ ] **Linking step live run** (dry-run preview → clean report → apply → 76 deals carry `sheetRowId` → `/admin/audit` shows `DEALS_LINKED_TO_SHEET`) — built and route/auth-verified this session, **not yet run** — no authenticated admin session was available to the agent that built it, by design; this is the user's click-through, see checklist below
- [ ] Synced deal PATCH on a sheet-owned field → 409; `ownershipPct` PATCH → 200; manually-created deal keeps full CRUD — code-reviewed, not live-exercised against a legitimately-synced deal (none exist yet — the 27 incident duplicates were deleted, and the linking step hasn't been run yet)
- [ ] Publish confirm staleness banner + Sync now — code-reviewed, needs a real browser click-through (user checklist below)
- [x] No spreadsheet ID/valuations/company names/dollar amounts in any commit, PR body, or client bundle this session — every live-verification step used aggregate counts only (see status note)
- [x] `npm run typecheck && npm run lint && npm test && npm run build` green on every commit this session

**UX impact:** admin-only, and gated behind env vars — forks and a creds-less deploy are pixel-identical to today. For DFS admins the one deliberate change is Q22-B's read-only lock on sheet-owned deal fields (decided 2026-07-15; the sheet is where those edits now happen). **Cost impact:** none — Google Sheets API read-only usage is free-tier, no new paid services, no new deps (JC15). **Schema:** 1 new table + 1 nullable unique `Deal` column, additive.

## Part 10 sequencing, batch split & effort

**Three release batches:**

- **Batch A — WS23 alone** (same-day ship): the only LP-adjacent change (idle timeout) plus the Phase-1 residue. Isolating it keeps the ledger work off the LP surface's critical path.
- **Batch B — WS24 → WS25 → WS26** (admin ledger, views, metrics): zero LP exposure, zero external dependencies, each WS independently shippable. The WS24 backfill's dry-run disagreement list needs a user eyeball before `--apply` (expected: the F17 Northstar/Southgate near-dupes).
- **Batch C — WS27** (Sheets sync): gated on the three operational items (ID column, service account + env vars, new-column names). Batch B does not wait for these; if the gates stall, Batches A/B still deliver the PRD's ledger and analytics value with Molly-native editing exactly as today.

| WS | Item | Effort | Schema push | Gated on |
|---|---|---|---|---|
| WS23 | LP idle timeout (Q21/JC14) + F24 + mention summary | 0.5–0.75d | — | — |
| WS24 | Ledger schema + reversible 76-deal backfill | 2–2.5d | 3 tables + 3 `Deal` columns | user eyeball on backfill dry-run |
| WS25 | Cross-fund views + rounds/marks/cashflows CRUD | 2–2.5d | — | WS24 |
| WS26 | Derived metrics (admin-only, Q23) | 1.5–2d | — | WS24 (WS25 surfaces host it) |
| WS27 | Sheets one-way sync + Q27 affordances | 2.5–3d | 1 table + 1 `Deal` column | **ID column · SA creds/env vars · new-column names** |

**Total: ~9–11 junior-engineer days** — comparable to Part 7. Deliberately **not** planned (PRD Phase 4): whether raw data entry eventually goes native and the sheet retires — revisit after WS27 has run for a few cycles.

## Part 10 roadmap bookkeeping

Done alongside this plan: `ROADMAP.md` gains a "Next up — Part 10" blockquote under "Roadmap", and the shipped Funds/LPs/Deals bullet is annotated with the Q22-B transition pointer; Part 7's "Molly is the source of truth" decision row is annotated as partially superseded (synced fields, while sync is enabled). As each WS ships, fold into "Existing Features" per convention. Open user inputs mid-implementation, none of which block Batches A/B: (1) provision the Google service account + set the three env vars; (2) add + backfill the sheet's ID column; (3) name the go-forward round-size/ownership columns; (4) eyeball the WS24 backfill dry-run before `--apply`. One flagged delegation to confirm whenever convenient: **the 7-day idle window (JC14)** — one constant if you want a different number.

---

# Part 11 — Sidebar Navigation Information-Architecture Rework (WS28)

**Status: shipped 2026-07-20.** See "WS28 implementation notes" at the end of this Part for what actually landed, including the Sync-relocation design decision (Q30 diverged from the original code sketch — see below).

## What this Part is

A UX/IA review of `src/components/layout/sidebar.tsx`, requested directly by the user ("it's all over the field now and the navigation is not intuitive") after five feature parts (7, 8, 9, 10, and the smaller batches before them) each added sidebar items independently, with no holistic pass since. This Part is **analysis and a signed-off plan only** — no product code changes ship until the open questions below are answered. It reads the real current arrays and every linked admin route rather than working from memory.

## Part 11 review findings

**The current state, read directly from `src/components/layout/sidebar.tsx` (2026-07-20):**

- `founderNav`: 7 items, unchanged since 2026-07-03 — Dashboard, Company Profile, Metrics, Updates, Investor Links, Team, Service Providers. Confirmed no drift: `src/app/{company,dashboard,links,team,providers,updates}` has grown no new top-level surfaces. Founder nav is not the problem.
- `adminNav`: **13 flat items**, growing to **14** when `syncEnabled` (Dashboard, Approvals, Companies, Funds, [Sync], Portfolio, LPs, Updates, Templates, Investor Links, Weekly Digest, Service Providers, Audit Log, Settings). No section headers, no dividers, one `<ul>`. Order is the order features shipped in (P0/P1 → providers/templates/digest/audit → Part 7 Funds/LPs → Part 10 Portfolio/Sync), not a deliberate information architecture.

**Specific, named problems:**

1. **"Companies" and "Portfolio" are two different models wearing confusingly similar labels, and they sit two items apart in the list — worse than if they were far apart.** Confirmed directly from `prisma/schema.prisma`: `Company` (line 81) is the founder-account model — signup, members, updates, metrics, documents — driving `/admin/companies` (grid view, search, add, bulk CSV import, editable profile). `PortfolioCompany` (line 497) is a wholly separate ledger entity — `name`, `country`, an *optional* `companyId` link back to `Company` — driving `/admin/portfolio`, which renders `Deal`/`Fund`/`FinancingRound`/`ValuationMark` rows (invested amounts, instruments, entry/current valuation, IRR/TVPI/DPI). A `PortfolioCompany` can exist with no linked `Company` at all (and vice versa). Reading top-to-bottom — Dashboard, Approvals, **Companies**, Funds, **Portfolio**, LPs — a first-time admin has every reason to assume "Portfolio" is a filtered or expanded view of "Companies" (this is also how VCs colloquially use the word "portfolio" — "our portfolio companies"). It is not; it's the deal ledger. This is the single clearest case in the whole nav of the hypothesis in the task brief, confirmed rather than assumed.
2. **A second, quieter version of the same problem: "Investor Links" and "LPs" are also two unrelated models.** `Investor Links` (`/admin/links`) manages `ShareableLink` — ad hoc, tokenable, per-company-or-bulk read-only links to founder updates, no account involved. `LPs` (`/admin/lps`) manages the `LP`/`LpFundMembership` models — real limited partners with email/name who authenticate via OTP at `/lp` and read fund reports (Part 7/10). Both are "give an external investor read access to something," but to genuinely different content (company updates vs. fund reports) through genuinely different mechanisms (token vs. login session). Sitting four rows apart with no grouping cue, a skimming admin has no signal these are different systems.
3. **A real, frequently-used feature has zero sidebar presence.** `/admin/reports` (Fund Report authoring, shipped Part 7 WS17 — the letter-style LP reports with the mention picker and frozen valuation snapshots) is not in `adminNav` at all. It's reachable today only by opening a specific fund at `/admin/funds/[id]` and clicking a "View reports" link scoped to that fund (`src/app/admin/funds/[id]/page.tsx:658,668,678`). Authoring LP reports is one of the two or three things this app exists to help DFS do (per the task brief's own framing: "reporting to LPs") and it is currently the most hidden surface in the product — more hidden than the Audit Log.
4. **"Sync" is positioned by array-splice mechanics, not by meaning.** The code inserts it with `[...adminNav.slice(0, 4), syncItem, ...adminNav.slice(4)]` (sidebar.tsx:94) — i.e., "after whatever the 4th item happens to be," which today puts it between Funds and Portfolio only because that's where index 4 lands. `/admin/sync` itself is a status/action page for keeping `Deal` rows current from the source spreadsheet — closer in nature to a tab on the ledger area than to a global peer of Dashboard or Approvals, and it's also the rarest-use item in the entire nav (weekly cron + occasional manual runs).
5. **No grouping signal anywhere, so unrelated jobs interleave.** Reading the current order top to bottom mixes: account gatekeeping (Approvals), day-to-day company/update operations (Companies, Updates, Templates, Investor Links), the fund/LP ledger and reporting arc (Funds, Portfolio, LPs), and internal-only tooling (Weekly Digest, Service Providers, Audit Log, Settings) — four genuinely different jobs an admin does, presented as one undifferentiated list of 13–14 items. This is the "flat list that grew by when it was built, not what it's for" pattern named in the task brief, and it's visible as soon as you group the items by job (see proposal below) — almost every item slots cleanly into one of four clusters.
6. **Ordering doesn't track usage.** `Templates`, `Weekly Digest`, and `Audit Log` — all low-frequency, internal-facing tools — sit ahead of nothing in particular; there's no attempt to put daily-use items near the top and occasional-use items near the bottom within the flat list.

**Not a problem:** the mobile overlay/hamburger behavior from Part 6 (WS14–WS15) needs no changes. `<nav className="flex-1 overflow-y-auto px-3 py-4">` already scrolls independently of the fixed header/footer rows; adding section headers or dividers just extends content inside that existing scroll container. Nothing here fights the `h-dvh`/fixed-overlay/`-translate-x-full` pattern documented in Part 6.

## Part 11 open product decisions (Q28–Q33)

> **All six decided 2026-07-20 (user review). Five recommendations accepted; Q30 diverges:**
> **Q28 = A** (labeled groups: "Company Operations" / "Funds & LPs" / "Admin Tools", Dashboard ungrouped) · **Q29 = B** ("Portfolio" → "Deal Ledger", copy-only) · **Q30 = B — Sync moves OUT of the top-level sidebar entirely**, becoming a tab/section inside `/admin/funds` instead of a grouped nav item (WS28.2's proposed `adminNav` sketch must drop the conditional "Sync" append shown at line ~3006; WS28.3+ needs a new step adding the Sync tab/section to the fund detail page) · **Q31 = A** ("Fund Reports") · **Q32 = B** ("Update Templates") · **Q33 = B** (frequency-ordered founder nav).
> **Consequence for the implementer:** the WS28.2 `adminNav` sketch is otherwise correct as written (three labeled groups + ungrouped Dashboard, per Q28/Q29/Q31/Q32), but must NOT include a "Sync" entry anywhere in the sidebar array — that surface relocates into the fund detail page's own UI, a small additional step beyond the original "single file, copy/structure only" scope. Everything else in WS28 (effort, no schema/route changes, mobile-overlay compatibility) stands.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q28** | **Group header wording for the four admin clusters.** | **A.** "Company Operations" / "Funds & LPs" / "Admin Tools" (Dashboard ungrouped at top). **B.** Shorter: "Companies" / "Funds" / "Tools". **C.** No visible labels, unlabeled dividers only (like many flat sidebars use). | **A.** Three short labeled groups plus an ungrouped Dashboard at top. Given problems #1 and #2 above are specifically about labels sounding alike, a *silent* divider (C) doesn't fix the confusion — the header text is doing the disambiguating work, not just the visual break. |
| **Q29** | **Rename "Portfolio" (`/admin/portfolio`, the deal ledger).** This is the single most confusable label (finding #1). | **A.** Keep "Portfolio," rely on the new "Funds & LPs" group header to disambiguate. **B.** Rename to "Deal Ledger." **C.** Rename to "Investments." | **B — "Deal Ledger."** Grouping alone (A) helps but a skimming eye reads the item label first and the group header second; "Portfolio" is also the term of art for the *cluster itself* ("our portfolio"), so it's a bad fit for one specific sub-view within it even when grouped. "Deal Ledger" matches the underlying model names (`Deal`, `FinancingRound`, `ValuationMark`) and reads as clearly distinct from "Companies." Route/href unchanged — copy-only. |
| **Q30** | **Where does "Sync" live** (finding #4)? | **A.** Keep as its own top-level nav item, just moved into the "Funds & LPs" group (last position) instead of spliced at index 4. **B.** Remove from the sidebar entirely; surface only as a tab/section inside `/admin/funds`. | **A.** It's genuinely rare-use, but its whole job is *oversight* — an admin needs to notice when a sync run failed or is stale without first thinking to open a specific fund. Grouping it under "Funds & LPs" already demotes it appropriately; fully hiding it (B) risks the exact "forgot this exists" failure mode `/admin/reports` fell into (finding #3). |
| **Q31** | **Exact label for the newly-added Fund Reports item** (finding #3 — adding *some* entry isn't in question, the wording is). | **A.** "Fund Reports." **B.** "LP Reports." **C.** "Reports." | **A — "Fund Reports."** Matches the model name (`FundReport`) and the existing `/admin/funds/[id]` link copy ("View reports"); "LP Reports" (B) risks the same LP/Investor-Links ambiguity as finding #2; "Reports" alone (C) is too generic once Audit Log and Weekly Digest are also technically "reports." |
| **Q32** | **"Templates" → "Update Templates"?** Once grouped near Companies/Updates it's less ambiguous, but "Templates" alone is still generic in a product that also has Fund Reports. | **A.** Keep "Templates." **B.** Rename "Update Templates." | **B.** Cheap, and it's specifically the kind of one-word label that reads fine in isolation but gets vaguer as the app adds more document types (fund reports, digests). |
| **Q33** | **Founder nav order** — currently Dashboard, Company Profile, Metrics, Updates, Investor Links, Team, Service Providers. Not broken, but not frequency-ordered either: Company Profile and Team are edit-rarely items ranked above Updates, which is the recurring core loop. | **A.** Leave order as-is. **B.** Reorder to Dashboard, Updates, Metrics, Investor Links, Company Profile, Team, Service Providers — recurring actions first, setup-once items pushed down. | **B**, but this is the lowest-stakes call in this Part — 7 items is small enough that order barely matters for scanability; only worth doing because it's nearly free alongside the admin rework. |

One item I'm **not** turning into a question: whether "Service Providers" belongs under "Company Operations" or "Admin Tools." It's founder-facing (a directory founders submit to) but admin-vetted and not part of the Company/Update/Investor-Links loop those other items share — I'm placing it under "Admin Tools" below since vetting submissions is closer to internal ops than day-to-day company management, but flagging the reasoning here in case that reads wrong once you see it grouped.

## WS28 — Sidebar reorganization (~0.5 day)

**Goal:** replace the two flat arrays in `src/components/layout/sidebar.tsx` with a grouped structure (admin) and a reordered flat list (founder, per Q33), add the missing Fund Reports entry, and relabel per Q29/Q31/Q32 — all pending the answers above. No route changes except linking to the already-existing `/admin/reports`; every other href is unchanged, so this is copy/structure only, not a routing change.

### WS28.1 Proposed `founderNav` (per Q33-B; revert to current order if Q33-A)

```ts
const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: FileText },
  { label: "Metrics", href: "/company/metrics", icon: BarChart3 },
  { label: "Investor Links", href: "/links", icon: Link2 },
  { label: "Company Profile", href: "/company/profile", icon: Building2 },
  { label: "Team", href: "/team", icon: Users },
  { label: "Service Providers", href: "/providers", icon: Briefcase },
];
```

### WS28.2 Proposed `adminNav` — grouped (per Q28-A/Q29-B/Q30-A/Q31-A/Q32-B; substitute the other options if the sign-off differs)

```ts
const adminNav = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard }, // ungrouped, sits above the first header
];

const adminNavGroups = [
  {
    label: "Company Operations",
    items: [
      { label: "Approvals", href: "/admin/approvals", icon: Shield },
      { label: "Companies", href: "/admin/companies", icon: Building2 },
      { label: "Updates", href: "/admin/updates", icon: FileText },
      { label: "Update Templates", href: "/admin/templates", icon: LayoutTemplate },
      { label: "Investor Links", href: "/admin/links", icon: Link2 },
    ],
  },
  {
    label: "Funds & LPs",
    items: [
      { label: "Funds", href: "/admin/funds", icon: Landmark },
      { label: "Deal Ledger", href: "/admin/portfolio", icon: PieChart },
      { label: "LPs", href: "/admin/lps", icon: Handshake },
      { label: "Fund Reports", href: "/admin/reports", icon: NotebookPen }, // new — closes finding #3
      // "Sync" appended here only when syncEnabled, per Q30-A — see WS28.3
    ],
  },
  {
    label: "Admin Tools",
    items: [
      { label: "Weekly Digest", href: "/admin/digest", icon: BookOpen },
      { label: "Service Providers", href: "/admin/providers", icon: Briefcase },
      { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];
```

`NotebookPen` (or an equivalent lucide-react "authoring" icon — verify against the installed lucide-react version; `FileSignature`/`ClipboardList` are reasonable fallbacks) is the only new icon import needed; every other icon is already imported in the file today.

### WS28.3 Render changes

- Replace the `[...adminNav.slice(0, 4), syncItem, ...adminNav.slice(4)]` splice (sidebar.tsx:92-96) with appending the Sync item into the "Funds & LPs" group's `items` array only when `syncEnabled` — removes the index-4 fragility named in finding #4 as a side effect.
- The `<nav>` render (sidebar.tsx:123-150) maps groups instead of a flat array: render the ungrouped Dashboard row, then for each group render a header row followed by its items. Group header styling reuses the existing DFS mono-label convention already used elsewhere in the app (`font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground`, e.g. `src/components/report-view.tsx:30`, `src/components/composer/composer-top-bar.tsx:60`) rather than inventing a new style.
- `isActive` logic (sidebar.tsx:126-129) is per-item and grouping-agnostic — no change needed there.
- Founder nav keeps its current flat `<ul>` render entirely (no groups) — only the array order changes per Q33.

**WS28 acceptance checklist**
- [x] `adminNav` restructured into the three signed-off groups + ungrouped Dashboard; `founderNav` reordered per the signed-off Q33 answer
- [x] "Fund Reports" added and reachable from the sidebar for the first time; existing `/admin/funds/[id]` → `/admin/reports?fundId=...` links unaffected
- [x] Relabels applied exactly as signed off (Q29/Q31/Q32) — hrefs unchanged, this is copy-only
- [x] ~~Sync item appended into its group only when `syncEnabled`~~ — superseded by Q30-B: Sync doesn't appear in the sidebar array at all (see implementation notes below); the index-splice logic is gone as planned
- [x] Group headers use the existing mono-uppercase-tracking convention, not a new style
- [x] Active-state highlighting still correct for every item, grouped or not, including the renamed ones
- [x] Mobile: sidebar overlay/hamburger still correct at ~375px (Part 6 pattern) — group headers render inside the same scrolling `<nav>` container, no new fixed-height elements added; user click-through still pending (see final report)
- [x] Fork story: with the three Sheets env vars absent, the "Funds & LPs" group renders identically minus any Sync-related surface (there's no Sync row to begin with now) — no new env-var dependencies introduced by this Part; the Sync *tab* on `/admin/funds` is itself gated on the same `enabled` check and disappears entirely for an unconfigured fork
- [x] `npm run typecheck && npm run lint && npm run build` green
- [x] Live-verified on `molly.dfslab.net` — see implementation notes for the curl-based auth-gating checks; the sidebar's visual grouping itself needs a user click-through (no browser session available to this implementer)

**Effort: ~0.5 day, actual ~1 day** (grew beyond the single-file estimate once Q30-B required relocating the Sync UI into a new tab on `/admin/funds` — see below).

## WS28 implementation notes (shipped 2026-07-20)

**The Q30 divergence.** The plan's original code sketch (WS28.2) proposed keeping "Sync" as a nav item, conditionally appended to the "Funds & LPs" group. The signed-off Q30-B decision overrides that: Sync was removed from the sidebar array entirely. Before deciding *where* it should live instead, this was verified against the actual data model rather than assumed:
- `SheetSyncRun` (`prisma/schema.prisma`) has **no `fundId` column** — a sync run's `summary`/`error`/`status` describe one pass over the entire spreadsheet, not one fund.
- `sheetsSyncEnabled()` (`src/lib/sheets.ts`) takes no fund argument — it's a pure three-env-var check, identical regardless of which fund you're looking at.
- `/admin/funds/[id]` already surfaces a *global* `sheetsSyncEnabled` boolean per fund (`GET /api/admin/funds/[id]`) purely to decide whether that fund's deal-valuation fields are read-only — it was never fund-scoped sync data, just the same global flag reused per page.

Conclusion: sync is a single global integration, not a per-fund one. Duplicating an identical "Sync" tab on every individual fund's detail page (`/admin/funds/[id]`) would have been misleading — it would visually imply fund-scoping that doesn't exist in the data. Instead, the Sync UI (status, run history, manual "Sync now"/"Preview" actions, and the one-time deal-linking tool) was extracted from the old `/admin/sync` page into `src/components/admin/sync-panel.tsx` and mounted as a single "Sync" tab on the **`/admin/funds` list page** (`src/app/admin/funds/page.tsx`) — one place, shown once, honest about being fund-agnostic. This also matches the plan's own decision-banner wording literally ("tab/section inside `/admin/funds`," not `/admin/funds/[id]`).

Implementation details:
- `/admin/funds` gained a `Suspense`-wrapped inner component (matching the existing `/admin/reports` pattern) so it can read `?tab=sync` from the URL; a lightweight `GET /api/admin/sheets-sync` fetch (mirroring the old sidebar's own gating fetch) decides whether the "Sync" tab button renders at all — a fork with no Sheets env vars sees the Funds page exactly as before, no new tab, no new fetch cost beyond the one call.
- `/admin/sync` (old route) now just does `redirect("/admin/funds?tab=sync")` — a one-line server component — so any existing bookmarks or the error-message reference in `/admin/reports/[id]/page.tsx` ("check /admin/sync") keep working; that error message was also updated to point at the new location.
- `src/components/admin/sync-panel.tsx` is a near-verbatim extraction of the old page's body (state, fetch calls, dry-run/apply buttons, run-history list, deal-linking preview/apply) with the `AppShell`/`PageHeader` wrapper stripped out and replaced by an inline header matching the fund-detail-page tab content style — no behavior changes.

Everything else in this Part shipped exactly as sketched: `adminNav` → `adminNavGroups` (three labeled groups + ungrouped `adminDashboardItem`), `founderNav` reordered per Q33-B, "Portfolio" → "Deal Ledger" and "Templates" → "Update Templates" (copy-only), "Fund Reports" linked to `/admin/reports` for the first time (icon: `NotebookPen`), group headers using the exact `font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground` convention from `report-view.tsx`/`composer-top-bar.tsx`.

## Part 11 roadmap bookkeeping

`ROADMAP.md`'s top "_Last updated_" line and the "Roadmap" section's Part 11 pointer were updated to "shipped 2026-07-20," and the shipped nav structure (including the Sync-relocation rationale) was folded into "Existing Features" (Admin Features section).

---

# Part 12 — Sidebar Visual Hierarchy, Accessibility & Icon Legibility (WS29)

**Status: shipped 2026-07-20.** See "WS29 implementation notes" at the end of this Part for what actually landed.

## What this Part is

A follow-on UX review of the *already-shipped* WS28 grouped sidebar, requested directly by the user together with a collaborating design-review pass. WS28 (Part 11) fixed the label-confusion problem (Companies/Portfolio, Investor Links/LPs) by introducing three labeled groups; this Part asks whether the grouping *reads* as grouping once rendered, and whether the nav's fixed-length, always-expanded structure holds up as more items get added — five of the last five Parts added at least one nav item apiece. This Part started from a pixel-faithful static mockup rendered from the real compiled Tailwind CSS and screenshotted at 1280px and 390px, then every finding below was re-verified against the live `src/components/layout/sidebar.tsx` source, `src/app/globals.css`, and a grep of the whole app's existing divider/accessibility conventions — nothing here is taken on the strength of the screenshot alone.

## Part 12 review findings (verified against the current code, not just the rendered screenshots)

1. **Grouping is structurally present but visually underweight, and it's measurably weaker than the app's own established label convention — confirmed, not just an eyeballing artifact.** The group header (sidebar.tsx:166) is `mb-1.5 px-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground` — no font-weight class at all, so it renders at the browser default (400/normal). The app already has a purpose-built small-caps label style for exactly this job: `.label` in `globals.css:109-112` is `text-xs font-semibold uppercase tracking-widest text-muted-foreground font-mono`. The sidebar header is lighter-weight than the app's own label convention, not just "could be bolder" — this reads as an unintentional omission from WS28, not a considered lighter-weight choice. Group-to-group separation is `mt-4` (16px top margin, sidebar.tsx:165) with **no divider line**; item-to-item spacing inside a group is `space-y-1` (4px). The 4× ratio matters less than the fact it's whitespace-only, at a font weight that doesn't otherwise signal structure elsewhere in the app.
2. **Zero ARIA/semantic grouping — confirmed, but the sidebar is not an outlier.** Group headers are plain `<p>` tags (sidebar.tsx:166-168): no `role="group"`, no `aria-labelledby`, no heading element. But a grep of the *entire* app turns up `aria-*` attributes in only 7 files total (password show/hide toggle, two icon-only buttons, two composer field labels) and **zero** uses of `role="group"` or `aria-labelledby` anywhere in the codebase. The `<nav>` landmark itself is present and correctly used (sidebar.tsx:160). Reframed: this is a real, cheap-to-fix gap, but it's consistent with — not a regression relative to — the rest of the app's current accessibility maturity. Worth fixing here since we're already in the file; not evidence the sidebar specifically needs urgent remediation relative to everything else. A broader app-wide accessibility pass is out of scope for this Part.
3. **No "which section am I in" reinforcement beyond the active row itself — confirmed.** Only `renderItem`'s active branch (sidebar.tsx:122-123, `bg-primary-50 text-primary-600`) signals state; the group header above it gets no acknowledgment.
4. **Nav length/scroll headroom — confirmed by direct measurement of the real Tailwind classes, not just visual impression.** Item rows are `py-2` + `text-sm` line-height ≈ 36px, with 4px inter-item gaps (`space-y-1`). Today's admin nav: Dashboard (36px) + group 1/5 items (≈234px) + group 2/4 items (≈194px) + group 3/4 items (≈194px), plus header (64px), footer (≈72px), and nav padding (32px) ≈ **826px** of content before the nav's own `overflow-y-auto` region needs to scroll. This lines up with the "barely fits around 900px" read from the screenshot — the finding holds up under measurement, it isn't overstated. 15 destinations today (1 ungrouped + 14 grouped); every one of the last five Parts added at least one sidebar item, so this is a real trend, not a hypothetical.
5. **Icon distinctiveness at 16px — confirmed as a legitimate (if minor) finding.** `Deal Ledger` uses `PieChart` (sidebar.tsx:25,69) — reads as "analytics," not "ledger," and `PieChart` is used nowhere else in the app so it's safe to retire. `LPs` (`Handshake`, line 70/24) and `Service Providers` (`Briefcase`, line 78/20) are both filled, roughly-square, blocky glyphs at `h-4 w-4` (16px, line 127) — a real but low-severity at-a-glance confusion risk. Note `Briefcase` is shared between `founderNav` (line 38, "Service Providers") and `adminNavGroups` (line 78, same label) — the two never render simultaneously (role-gated), but if it's swapped it should swap in both places for concept/icon consistency.
6. **Dashboard tier gap — confirmed identical to inter-group spacing.** Same `mt-4` (16px) is used both above the first group and between every subsequent group (sidebar.tsx:165) — no extra weight distinguishes the Dashboard/Company-Operations boundary from any other group boundary.

## Corrections to the original brief

- **The proposed `hairline()` reuse target (`src/lib/email.ts:109`) is the wrong file.** Verified: that function emits a raw inline-styled `<div>` HTML string for transactional emails — a separate rendering pipeline (Resend HTML emails), not importable into a React/Tailwind component. It does establish the *visual concept* (1px `bone`-colored divider) but not a reusable code path. The actual established in-app convention for this exact visual is `border-t border-border` (used repeatedly: `mention-cards.tsx:82`, `sync-panel.tsx:360`, `providers/page.tsx:458,483`, `lp/layout.tsx:33`, `share/[token]/page.tsx` ×4, `company/metrics/page.tsx:288`, `admin/companies/[id]/page.tsx:832`) or `divide-y`/`divide-bone` for list separators (`admin/links/page.tsx:343`, `links/page.tsx:261`, `lp/page.tsx:68`). **Use `border-t border-border`, not `hairline()`.**
- The `.label` utility class (`globals.css:109-112`) is the closer existing pattern for "how this app makes small-caps text read as a structural header" — recommend the group header adopt `font-semibold` to match it, rather than inventing a new weight/size/color treatment. This is a one-class addition, not new design.
- Finding #2's accessibility gap is real but should be scoped and prioritized as "cheap, do it here" rather than "the sidebar is uniquely broken" — see finding #2 above.

## Part 12 open product decisions (Q34–Q36)

> **All three decided 2026-07-20 (user review): every recommendation accepted.**
> **Q34 = A** (swap both icons: Deal Ledger `PieChart`→`Rows3`, Service Providers `Briefcase`→`Wrench`, in both `founderNav` and `adminNavGroups`) · **Q35 = B** (defer proposal C — collapsible/auto-expanding groups — no codebase precedent, real unresolved interaction question, nav still measurably fits; revisit at ~20 items or an actual scrolling complaint) · **Q36 = A** (one-line "someday" note in `ROADMAP.md` for the cmd+K idea).
> WS29 is fully unblocked — ships the grouping/a11y/icon polish only, per the scoped plan below.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q34** | **Icon swaps for at-a-glance distinctiveness** (finding #5). Changes visual muscle memory for admins who already recognize the current shapes, so it's a real (if small) taste call, not a pure bug fix. | **A.** Swap both — `Deal Ledger`: `PieChart` → `Rows3` (tabular-ledger-rows metaphor, silhouette distinct from `ScrollText`/`NotebookPen`/`PieChart` already in use); `Service Providers`: `Briefcase` → `Wrench` (linear/diagonal silhouette, clearly distinct from `Handshake`'s clasped-hands blob), applied to **both** `founderNav` and `adminNavGroups` for concept consistency. **B.** Swap `Deal Ledger` only (`PieChart` → `Rows3`); leave `Handshake`/`Briefcase` as-is since they're a minor confusion, not a mislabel. **C.** No icon changes — the current set is legible enough, not worth the retraining cost for a team this size. | **A.** `PieChart` is a genuine mismatch (reads as analytics, not ledger) independent of the Handshake/Briefcase question, so it should move regardless. The Handshake/Briefcase pair is lower-severity but `Wrench` is a materially more distinct silhouette at 16px and the swap is free once we're touching icon imports either way. |
| **Q35** | **Proposal C — auto-expand-active-group / collapse-others / persist via `localStorage`.** The one with real engineering + interaction cost; see the dedicated section below for full reasoning. | **A.** Build it now. **B.** Defer — ship the grouping/a11y/icon polish (this Part) now; revisit collapse/expand only if the nav crosses roughly 20 items, or if scrolling becomes a user-reported complaint rather than a measured-but-not-yet-felt risk. | **B — defer.** See "On proposal C" below for the full reasoning; short version: 15 items still fits without scrolling on a typical desktop viewport, the codebase has zero existing collapsible-nav precedent to build on (this would be new interaction machinery, not a reuse), and the auto-expand-on-navigate vs. manually-collapsed-by-the-admin conflict is a real unresolved UX question, not just an implementation detail. |
| **Q36** | **Proposal D — cmd+K command palette.** Explicitly flagged by the reviewer as a stretch/future idea, not a fix for the stated complaint. | **A.** Add one line under a "Someday / P3" heading in `ROADMAP.md` so the idea isn't lost. **B.** Leave it out entirely — it's a small enough idea to re-propose fresh if it ever becomes relevant. | **A**, weakly. It's a one-line cost to preserve the idea for a small expert team that might genuinely want it later, and "someday" notes are already a house convention in this doc (see Part 9's Comment Threading deferral). But this is genuinely low-stakes either way — happy to go with B if you'd rather keep `ROADMAP.md` free of speculative entries. |

### On proposal C specifically

Recommend **not building it in this pass** (Q35-B). Reasoning:

- **The problem it solves isn't fully felt yet.** Finding #4 measured today's nav at ≈826px of content, which fits inside a typical ~900px+ desktop viewport without scrolling; it's tight, not broken. Mobile already scrolls the sidebar inside its overlay (an accepted Part 6 pattern, not a regression). Collapse/expand is the right tool for a nav that has *outgrown* its space — this one is approaching that line, not past it.
- **There is no existing collapsible-nav precedent anywhere in this codebase to build on** (confirmed by grep: no Accordion/Collapsible component, no `aria-expanded` usage, no `useState`-driven collapse pattern anywhere in `src/components`). This would be genuinely new interaction machinery, not a reuse of an established pattern — real design and testing surface, not a small add-on. The `localStorage` *persistence* mechanism itself does have precedent (`src/context/company-context.tsx` persists the selected company the same way), so that specific piece is low-risk; the collapsible-group UI and its state machine are the actual new cost.
- **The auto-expand/collapse interaction has a genuine unresolved UX question, not just an implementation detail:** if an admin manually collapses "Company Operations" and later navigates to `/admin/approvals` via a bookmark or an email link, does the group auto-re-expand (undoing their preference every time) or stay collapsed (silently hiding the active-page context)? Either answer is defensible, but it needs a real decision, and it's exactly the kind of edge case that's cheap to spec now and expensive to discover after shipping.
- **The stated workflow risk cuts against it too.** The brief itself raises the concern that admins who "genuinely move between all three domains daily" would pay a collapse/expand tax for a benefit (vertical space) that isn't costing them anything yet. For a small internal team using an app they already know well, that tradeoff likely isn't worth it today.
- If we do build it later, the trigger conditions worth watching for: the nav crossing roughly 20 items, a fourth group being added, or an actual user complaint about scrolling — any of those would flip the cost/benefit and this section can be pulled forward wholesale.

## Judgment calls (flagged, cheap, reversible — no sign-off needed)

- **JC17** — Group header gains `font-semibold` (matching the app's own `.label` convention) and a `border-t border-border` divider before every group except the first (Dashboard already sits above group 1 with its own gap — see JC19). Text/tracking/size/color otherwise unchanged.
- **JC18** — `role="group"` + `aria-labelledby` on each group's wrapping `<div>`, pointing at an `id` added to the header `<p>`; `aria-current="page"` added to the active nav link (`renderItem`, sidebar.tsx:117) alongside the existing visual highlight — standard practice for assistive tech to announce the current page reliably, and a natural pairing with the `role="group"` fix since both are "finish what WS28 started" accessibility work.
- **JC19** — Dashboard-to-first-group gap increased (e.g. `mt-6`/`mt-8` instead of the shared `mt-4`) so it visually commits to being its own tier, independent of the inter-group `mt-4` from JC17.
- **JC20** — When the active route belongs to a group, that group's header renders in `text-foreground` instead of `text-muted-foreground` (computed the same way `isActive` already is, just OR'd across `group.items`) — closes finding #3 for sighted users at near-zero cost, using data the component already has.

## WS29 — Sidebar visual hierarchy, accessibility & icon polish (~0.5–1 day)

**Goal:** ship JC17–JC20 plus whichever of Q34/Q36 gets signed off, entirely within `src/components/layout/sidebar.tsx` (+ `globals.css` if the `.label`-adjacent class needs a shared home rather than an inline Tailwind string — implementer's call, no visible difference either way). No route changes, no schema changes, no changes to `founderNav`'s flat (non-grouped) rendering beyond the Q34-A icon swap if accepted.

### WS29.1 Proposed group rendering sketch (JC17/JC18/JC19/JC20 combined)

```tsx
{adminNavGroups.map((group, i) => {
  const headingId = `sidebar-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  const groupActive = group.items.some((item) => isActive(item.href));
  return (
    <div
      key={group.label}
      role="group"
      aria-labelledby={headingId}
      className={cn(i === 0 ? "mt-6" : "mt-4", i > 0 && "border-t border-border pt-4")}
    >
      <p
        id={headingId}
        className={cn(
          "mb-1.5 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em]",
          groupActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {group.label}
      </p>
      <ul className="space-y-1">{group.items.map(renderItem)}</ul>
    </div>
  );
})}
```

`renderItem` additionally sets `aria-current={active ? "page" : undefined}` on the `<Link>` (sidebar.tsx:117-119).

### WS29.2 Icon swap (only if Q34 = A or B)

`Deal Ledger`: `PieChart` → `Rows3` in `adminNavGroups` (sidebar.tsx:69) and the import list (line 25). If Q34-A: also `Service Providers`: `Briefcase` → `Wrench` in **both** `founderNav` (line 38) and `adminNavGroups` (line 78), plus the import list.

**WS29 acceptance checklist**
- [ ] Group headers render `font-semibold`, matching (not diverging from) the app's `.label` convention
- [ ] `border-t border-border` divider renders between groups (not above the first group, which instead gets the wider Dashboard-tier gap per JC19)
- [ ] Dashboard-to-group-1 gap is visually distinct from inter-group gaps
- [ ] Active group's header renders in `text-foreground`; inactive groups stay `text-muted-foreground`
- [ ] `role="group"`/`aria-labelledby` present on every group; `aria-current="page"` present on the active link — spot-check with a screen reader or the browser accessibility tree, not just visual inspection
- [ ] Icon swap(s) applied exactly per the signed-off Q34 answer, both `founderNav` and `adminNavGroups` if Q34-A; unused `PieChart`/`Briefcase` imports removed if fully retired
- [ ] Mobile overlay at ~375px unaffected — this Part only restyles content already inside the existing scrolling `<nav>` container (per Part 11's own "not a problem" note); no change to `AppShell`'s `sidebarOpen` state or the `-translate-x-full` toggle
- [ ] `npm run typecheck && npm run lint && npm run build` green
- [ ] Live-verified on `molly.dfslab.net`: desktop screenshot shows visibly separated groups with a divider line; mobile screenshot at 390px still renders correctly; keyboard/screen-reader spot check confirms group announcements

**Effort: ~0.5–1 day.** Single file, no schema/route changes, no new dependencies (no accordion/collapsible library needed since Q35 defers proposal C).

## Part 12 sequencing

WS29 has no dependency on Part 11 beyond it already being shipped (it is). Blocked only on Q34/Q36 sign-off; Q35 doesn't block WS29 either way since it's a "not now" recommendation, not a prerequisite decision — WS29 ships the same regardless of how Q35 lands, it just determines whether a *future* Part gets opened for proposal C.

## WS29 implementation notes (shipped 2026-07-20)

Shipped exactly per the WS29.1 sketch and WS29.2, no deviations:
- Group rendering: `role="group"` + `aria-labelledby={headingId}` on each group's wrapping `<div>`, `id={headingId}` on the header `<p>` (`sidebar-group-<slug>`), `groupActive` computed via `group.items.some((item) => isActive(item.href))` and used to switch the header between `text-foreground` (active) and `text-muted-foreground` (inactive). Header gained `font-semibold`. First group gets `mt-6` (vs. the shared `mt-4` used for Dashboard-to-group-1 previously); groups after the first additionally get `border-t border-border pt-4` as the inter-group divider — the first group has no divider since Dashboard isn't itself a labeled group.
- `renderItem`'s `<Link>` gained `aria-current={active ? "page" : undefined}`, alongside the pre-existing `bg-primary-50`/`text-primary-600` visual active state — unchanged.
- Icon swaps (Q34-A, both nav lists): `Deal Ledger` (`adminNavGroups`) `PieChart` → `Rows3`; `Service Providers` `Briefcase` → `Wrench` in both `founderNav` and `adminNavGroups`. `PieChart` and `Briefcase` were fully unused elsewhere in the file after the swap, so both were dropped from the `lucide-react` import list and replaced with `Wrench`/`Rows3`.
- No `globals.css` changes were needed — the group-header treatment stayed a plain Tailwind string (`.label`'s exact classes weren't reused as a shared class since the header also needs the conditional `text-foreground`/`text-muted-foreground` swap, which `.label` doesn't parameterize).
- Quality gates: `npm run typecheck`, `npm run lint`, `npm run test` (172 tests, 15 files), `npm run build` all green. No route/schema changes, so no live-endpoint re-verification was needed beyond a visual/DOM check on the deployed sidebar.

## Part 12 roadmap bookkeeping

`ROADMAP.md`'s top "_Last updated_" line and the "Roadmap" section's Part 12 pointer were updated to "shipped 2026-07-20" (mirroring the Part 11 entry), the existing Part 11 sidebar bullet under "Existing Features" got a short addendum noting the visual/a11y polish rather than a new bullet, and a one-line P3 "someday" row for the cmd+K command palette (Q36-A) was added to the P3 table.

---

# Part 13 — Deal Ledger Table Density & Navigation Cues, Select/Spacing Follow-ups (WS30–WS32)

**Status: shipped 2026-07-21.** All three workstreams (WS30 → WS31 → WS32) landed in that order, one commit-and-verify cycle each. See "Part 13 implementation notes" at the end of this Part for what actually landed, including corrections to finding #9's select census and the two selects deliberately left native.

Third item from the same round of annotated live-screenshot feedback that produced commit `e7c2262` (Update Templates moved under Updates; the `Select` component built and applied to `/admin/updates`; that page's card gap widened `space-y-3` → `space-y-4`). The user's annotation on `/admin/portfolio` (the "Deal Ledger" table, 76 deals × 11 columns): *"We need to do better with display of tables. This feels cramped with no clear navigation cues."* This Part also resolves the two follow-ups that commit deliberately left open rather than silently expanding: the `Select` component's rollout scope, and whether `space-y-3` (12px list-item spacing) should widen everywhere or stay a one-page fix.

Every finding below was re-verified against the live production database (`vercel env pull --environment=production`, direct Prisma queries — see finding #2/#3) and the actual current source, not just the flagged screenshot.

## Part 13 review findings (verified against the current code and live production data)

1. **Deal Ledger markup, confirmed as described.** `src/app/admin/portfolio/page.tsx:191-245` — plain `<table>`, `overflow-x-auto rounded-md border border-border` wrapper, `<thead>` with `bg-muted/40` (not sticky), no row hover state, no sortable columns, `px-3 py-2` cell padding, 11 columns, 76 rows, only the outer container border providing visual structure. 76 rows are fetched in one unpaginated request (`GET /api/admin/portfolio` → `db.deal.findMany` with no `take`/`skip`) and held entirely in client state — confirmed a sort feature would be a pure client-side concern, no API/pagination changes needed.
2. **Ownership column: confirmed 100% empty in production, exactly as the screenshot showed — 0 of 76 deals have `ownershipPct` set.** This isn't a data-quality bug: the field's own schema comment (`prisma/schema.prisma`, `Deal.ownershipPct`, added Part 10/WS24) calls it "optional-when-known... never required, never read by any existing renderer." It's designed to fill in gradually as ownership data becomes known, not expected to be populated at import time.
3. **Round column — correction to the original brief.** The brief's screenshot read guessed Round was sparse "like Ownership." Verified against live data: it's the opposite — **76 of 76 deals have a populated round with a non-null label.** But every single one is **byte-identical to that same deal's `instrument` field** (0 mismatches across all 76 rows: "YC SAFE" ×64, "Convertible Note" ×3, "Priced Round" ×3, "Preferred Shares"/"Prefered Shares" ×4, "Modified YC SAFE (KEN)" ×1, "Secondary" ×1). Additionally, **all 76 `FinancingRound` rows are 1:1 with deals** — zero rounds are currently shared by more than one deal — and `round.kind` is `"UNKNOWN"` on all 76 (the kind classification was never backfilled). So today, in this specific table, Round carries zero information beyond what Instrument already shows. This is a stronger finding than "sparse, deserves de-emphasis" — it's **currently pure duplication**, a candidate for removal from the ledger view rather than a tooltip-collapse. (`FinancingRound` itself is a real, richer entity — label/kind/date/raised/pre/post-money, fully editable — but that detail lives on the per-company drill-down, `src/app/admin/portfolio/[id]/page.tsx`, which is unaffected by anything in this Part.)
4. **Both sparse/redundant columns are already de-emphasized in the current code** — worth noting since it means the existing implementation isn't naive: `Round` (line 229) and `Ownership` (line 232) already render `text-xs text-muted-foreground` while every other column renders plain-weight text. The existing author clearly anticipated "these two columns carry less signal." That existing treatment is sound for Ownership (JC23 below); it's Round specifically whose *duplication*, not just its visual weight, is the real finding (Q37 below).
5. **Table-shell pattern census, precise count (grepped all `<table` usages across `src/app`, then verified each thead's actual classes rather than trusting the first grep pass).** Nine files contain `<table>`, but only **four** — `admin/portfolio/page.tsx` (the flagged one), `admin/portfolio/[id]/page.tsx`, `admin/lps/page.tsx`, `admin/funds/[id]/page.tsx` — share the exact same shell: `overflow-x-auto rounded-md border border-border` wrapper + `<tr className="border-b bg-muted/40 text-left text-muted-foreground">` header + `px-3 py-2` cells. The other five are each a genuinely different shape: `admin/audit/page.tsx` uses `rounded-xl` + uppercase-tracking-wide header, no `bg-muted`, on a simple 5-column, always-time-ordered, 100-row-capped log with no sort need; `admin/page.tsx` (×2 tables) and `admin/companies/[id]/page.tsx` (×2 tables) and `company/metrics/page.tsx` and `updates/[id]/page.tsx` all use a small, borderless, `pb-2`-header pattern nested directly inside a `Card` — dashboard widgets and per-metric mini-tables, a different scale and context entirely. Forcing those five into the same shell would mean fighting the abstraction, not reusing it — the original brief's "9-file blast radius" overstated how uniform the pattern actually is. (Corrected from the brief, which hadn't yet distinguished shell-sharing files from files that merely contain *a* `<table>`.)
6. **Sticky header is a clean fit with the existing scroll architecture — no restructuring needed.** `AppShell` (`src/components/layout/app-shell.tsx`) renders `<main className="flex-1 overflow-y-auto">` — page content scrolls inside `main`, not the document body. `position: sticky` on the table's `<thead>` with `top-0` sticks correctly against that actual scrolling ancestor as the user scrolls past the summary cards and filter row above the table. `PageHeader` carries no sticky/fixed positioning of its own to collide with. No bounded-height wrapper or layout change required.
7. **Row-hover convention already exists in the app and should be reused, not invented.** `hover:bg-muted/50` is the established "this row/card is interactive" idiom (`admin/companies/page.tsx:287`, `admin/updates/page.tsx:193`, `admin/companies/[id]/page.tsx:973`, all on `Card`). Applying the same opacity to `<tr>` keeps the new treatment visually consistent with cards elsewhere instead of introducing a new value.
8. **Zebra striping has zero precedent anywhere in the codebase** — `even:bg-`/`odd:bg-`/`nth-child` all return no hits app-wide. It would be a new visual pattern, not a reuse, and stacking it on top of hover + sticky header + wider padding on an already-dense 11-column financial table risks visual noise rather than clarity. Dropping it from the prototype (JC21 below).
9. **Select sweep count, verified by direct grep (excluding the new `Select` component's own file and the 2 already-converted selects on `/admin/updates`): 24 native `<select>` elements remain across 13 files** — `providers/page.tsx` (×2), `admin/providers/page.tsx` (×3), `admin/portfolio/[id]/page.tsx` (×2), `admin/companies/new/page.tsx` (×1), `admin/funds/[id]/page.tsx` (×5), `admin/companies/[id]/page.tsx` (×5), `admin/reports/page.tsx` (×2), `updates/new/page.tsx` (×1), `team/page.tsx` (×2), `company/profile/page.tsx` (×1). All exhibit the identical arrow-flush-to-border problem the `Select` component already fixed once.
10. **`space-y-3` census confirms the brief's count (17 files) but also surfaces a nuance the brief didn't check: not every hit is a "list of cards" gap.** Some are form-field stacks — e.g. `admin/digest/new/page.tsx:213` (`CardContent ... space-y-3`) and `share/[token]/page.tsx:193` (`<form onSubmit=... className="mt-4 space-y-3">`) space out form inputs, not list items. A blind global `space-y-3` → `space-y-4` replace would also loosen unrelated form-field spacing that was never part of the "cards too close together" complaint — a real risk for Q39 below.

## Part 13 open product decisions (Q37–Q39)

> **All three decided 2026-07-21 (user review). Q37/Q38 accepted as recommended; Q39 diverges:**
> **Q37 = A** (drop the duplicate Round column, 11→10 columns) · **Q38 = A** (build sortable columns in this pass — Company/Fund/Date/Amount/Current Val./Multiple/Position Value sortable, client-side, default `dealDate` desc unchanged) · **Q39 = A — widen `space-y-3`→`space-y-4` everywhere it spaces list items app-wide** (not just `/admin/updates`), diverging from Felix's "leave scoped" recommendation. Per the plan's own bookkeeping note, this promotes the small WS32 (swap only the list-item sites identified in finding #10 — Funds, LPs, Reports, Providers, Templates-panel, Digest, Approvals, Links — explicitly skipping the form-field `space-y-3` sites, which are a different use of the same class) from "not scoped unless Q39=A" to in-scope for this batch.
> WS30 and WS31 are fully unblocked; WS32 is now also in scope alongside them.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **Q37** | **Deal Ledger's Round column** — now confirmed to be 100%-duplicate of Instrument today (finding #3), not sparse. What should the ledger table show? | **A.** Drop the Round column from the ledger table entirely; keep Instrument. No data loss — the full `FinancingRound` editor (label/kind/date/raised/pre/post-money) still lives on the per-company drill-down page, untouched by this change. Ships as 10 columns instead of 11, and removes a column that today adds literally nothing a reader doesn't already have from Instrument. **B.** Keep both columns as-is — Round and Instrument could diverge later (once `round.kind` gets backfilled, or once a round is shared by more than one deal, e.g. multiple SAFEs grouped under one priced round), and removing the column now could be premature relative to where the sheet-sync/ledger data model is headed. **C.** Keep the column but make its label a link into the company's round history instead of plain text — most engineering for the least payoff; there's no cross-fund round-detail view to link to yet, and this doesn't fix "duplicate today." | **A.** It's dead weight in the table *today*, verified with actual data, not a guess — and dropping it directly serves the stated complaint (fewer columns to parse) with zero information loss, since the richer entity remains fully visible and editable one click away. If rounds start meaningfully diverging from deals later (shared rounds, backfilled `kind`), that's a good trigger to reconsider — not a reason to keep a duplicate column now. |
| **Q38** | **Sortable columns.** Real interactive engineering (client sort state + indicator icons + default sort), scoped beyond the strict "fix cramped/no cues" ask. Effort is genuinely low here specifically because all 76 rows are already fetched unpaginated and held in client state (finding #1) — no server-side sort, no pagination changes. | **A.** Build it now, in this pass — client `useState<{key, dir}>`, a comparator per column, chevron indicators (unsorted/asc/desc), default sort unchanged (`dealDate` desc, matching the API's current order). **B.** Ship the visual/density pass only (sticky header, hover, padding, Round removal) and treat sort as a fast-follow if it's still wanted after seeing the density fix live. | **A, weakly.** The chevron affordance is the most literal answer to "no clear navigation cues" — it's a real cue the current table completely lacks, and unlike most sort features this one has no pagination/server complexity tax since the data's already all in memory. But it's still optional relative to the stated complaint (density/hover/sticky-header alone would substantially address "cramped"), so flagging rather than just building it — happy to descope to B if you'd rather see the density-only version live first. |
| **Q39** | **`space-y-3` (12px) system-wide** — is the complaint about the one flagged page, or the whole app's list-spacing convention? Genuine taste call: this is app-wide visual rhythm, not a bug. | **A.** Widen `space-y-3` → `space-y-4` everywhere it currently spaces list *items* (not form fields — finding #10 shows the two aren't the same set). **B.** Leave the convention as-is elsewhere; the widened gap stays scoped to `/admin/updates`, the one page actually annotated. Revisit only if the complaint recurs on another page. | **B.** The user's annotation was on one specific page's screenshot, not a general "everything feels tight" complaint. `space-y-3` is a deliberate, consistent rhythm across 8+ list pages (Funds, LPs, Reports, Providers, Templates, Digest, Approvals, Links) — a system-wide widen is a bigger, more visible rhythm change than "fix the one thing I pointed at," and finding #10 shows a naive sweep would also touch unrelated form-field spacing. Cheaper to expand later from one confirmed data point than to guess broadly now and have to walk it back. |

## Judgment calls (flagged, cheap, reversible — no sign-off needed)

- **JC21** — No zebra striping in the Deal Ledger redesign, departing from the original prototype description. No precedent anywhere in the app (finding #8), and it risks visual noise stacked on top of hover + sticky header + wider padding on an 11-column (10 after Q37-A) financial table. Sticky header + row hover + generous padding + (if Q38-A) sort chevrons are the "navigation cues"; can add zebra later if the table still reads as flat once those ship.
- **JC22** — Row hover reuses `hover:bg-muted/50`, the app's existing Card-hover opacity (finding #7), rather than inventing a new value.
- **JC23** — Ownership column stays exactly as-is (data, position, and its existing `text-xs text-muted-foreground` de-emphasis) — it's correctly designed sparse-fill-in-over-time data (finding #2/#4), not a duplicate or a mistake, so there's nothing to fix here specifically.
- **JC24** — Cell padding gets a modest bump (`px-3 py-2` → `px-4 py-2.5`), same scale of change as the `space-y-3` → `space-y-4` bump already shipped on `/admin/updates`, not a dramatic redesign.

## WS30 — Deal Ledger density & navigation-cue pass (~1–1.5 days, upper end if Q38 = A)

**Scope:** `src/app/admin/portfolio/page.tsx` only, plus one new shared primitive. No API/schema changes (Q37-A removes a rendered column, not underlying data; the `round` relation stays fetched — cheap to keep in the API response in case Q37 is later revisited, or trim it from the `include`/response shape if you'd rather not carry dead payload — implementer's call, no behavior difference either way).

### New shared primitive: `src/components/ui/table.tsx`

Modeled on the same single-purpose idiom as `select.tsx` — small, composable pieces, not a heavyweight data-table abstraction:

```tsx
"use client";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-card">
      <tr className="border-b bg-muted/40 text-left text-muted-foreground">{children}</tr>
    </thead>
  );
}

// Plain (non-sortable) header cell — used as-is by files that adopt Table/TableHead
// later (WS31) without needing sort.
export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}

// Sortable header cell — only used where Q38 = A.
export function SortableTh<K extends string>({
  label, sortKey, active, dir, onSort, className,
}: { label: string; sortKey: K; active: boolean; dir: "asc" | "desc"; onSort: (key: K) => void; className?: string }) {
  return (
    <th
      className={cn("cursor-pointer select-none px-4 py-2.5 font-medium hover:text-foreground", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </span>
    </th>
  );
}

export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b last:border-0 hover:bg-muted/50", className)}>{children}</tr>;
}
```

### Deal Ledger page changes

- Swap the raw `<table>`/`<thead>`/`<tr>` markup for `Table` / `TableHead` / `TableRow`, cells bumped to `px-4 py-2.5` (JC24).
- Drop the Round `<th>`/`<td>` pair per Q37-A (or leave as-is per Q37-B — single-line diff either way, no other change depends on this).
- If Q38-A: add `SortableTh` to every sortable column (Company, Fund, Date, Amount, Current Val., Multiple, Position Value — skip Type/Instrument/Ownership as low-value sort targets, implementer's call to adjust), a `sortState` + comparator, default `{ key: "dealDate", dir: "desc" }` matching the API's existing order so nothing visually changes until a user clicks a header.
- Ownership column and its styling: unchanged (JC23).

**WS30 acceptance checklist**
- [ ] `Table`/`TableHead`/`Th`/`TableRow` (and `SortableTh` if Q38-A) render byte-equivalent visual structure to the current table for every existing data case (empty ownership `—`, written-off multiples, dilution-aware dot indicator)
- [ ] `<thead>` sticks to the top of the page's scroll region (`main`, not the window) when scrolling past 76 rows — verified by an actual scroll, not just a static screenshot
- [ ] Row hover (`hover:bg-muted/50`) visible on mouse-over, no layout shift
- [ ] Round column removed (Q37-A) or confirmed unchanged (Q37-B) exactly per the signed-off answer
- [ ] If Q38-A: clicking a sortable header re-orders the full 76-row set correctly in both directions; the chevron reflects current sort state; default view on page load is unchanged (`dealDate` desc)
- [ ] No zebra striping (JC21) — confirm the prototype's zebra idea was deliberately dropped, not forgotten
- [ ] Filters (fund/type/search) and the loading skeleton still work unchanged
- [ ] Mobile: table still scrolls horizontally inside its own container at ~375px (existing `overflow-x-auto` behavior preserved — this Part doesn't add a new mobile pattern)
- [ ] `npm run typecheck && npm run lint && npm run build` green
- [ ] Live-verified on `molly.dfslab.net`: desktop screenshot shows visible density/hover/sticky-header improvement against the flagged original; scroll-past-76-rows confirms the sticky header in practice

## WS31 — Sweep the two already-shipped shared primitives to their remaining sites (~1.5–1.75 days, splittable into two independent slices)

Both halves are mechanical, low-risk, no-new-decision cleanup — same category of work as each other, bundled here rather than left as vague "worth a follow-up" notes.

### WS31.1 — `Select` component sweep (~0.75–1 day)

Apply `src/components/ui/select.tsx` to the 24 remaining native `<select>` elements across the 13 files in finding #9. Mechanical (import + tag swap + move `label` prop where one exists inline), but budget real time per file — several have custom `onChange` logic or sit inside modals/forms where verifying nothing else shifted matters more than the swap itself. No visual or behavioral decision left open; this is "finish what was already validated in production," not new design.

### WS31.2 — Table shell migration (~0.5–0.75 day)

Migrate `admin/portfolio/[id]/page.tsx`, `admin/lps/page.tsx`, and `admin/funds/[id]/page.tsx` — the three files confirmed in finding #5 to already share Deal Ledger's exact pre-WS30 shell — onto the new `Table`/`TableHead`/`Th`/`TableRow` primitives from WS30, picking up sticky header + row hover + the padding bump for free. **Explicitly out of scope:** `admin/audit/page.tsx`, `company/metrics/page.tsx`, `admin/page.tsx`, `admin/companies/[id]/page.tsx`, `updates/[id]/page.tsx` — finding #5 confirmed these are genuinely different shapes (different scale, different header style, some already borderless-by-design), and forcing them onto this shell would be fighting the abstraction, not reusing it. If any of those pages gets its own density complaint later, that's a fresh, separate design pass — not an extension of this one.

**WS31 acceptance checklist**
- [ ] All 24 selects render with the same visible chevron treatment as `/admin/updates`'s two already-converted selects; every existing `onChange`/validation/conditional-option behavior preserved per file
- [ ] The three migrated tables (WS31.2) keep their existing columns/data/links exactly; only the shell (border/header/hover/padding) changes
- [ ] `npm run typecheck && npm run lint && npm run build` green
- [ ] Live-verified on `molly.dfslab.net`: spot-check at least one select per file and all three migrated tables

## Part 13 sequencing

WS30 is blocked on Q37 and Q38 sign-off (Q39 is independent and doesn't block either workstream — it only decides whether a future WS32 gets opened for the system-wide spacing change). WS31 depends on WS30 shipping first (it reuses WS30's new `Table` primitives) but has no open product decisions of its own — it can start immediately once WS30 lands, no additional sign-off needed. If Q39 = A, that's a small separate WS32 (~0.25–0.5 day: swap `space-y-3` → `space-y-4` only at the list-item sites identified in finding #10, explicitly skipping the form-field sites) — not scoped here since the default recommendation is B (no system-wide change).

## Part 13 implementation notes (shipped 2026-07-21)

WS30 → WS31 → WS32 shipped in that order, one commit-and-verify cycle each (quality gates green, live-verified on `molly.dfslab.net` before starting the next workstream). Deviations from this Part's plan as written, found while implementing:

- **Finding #9's select census was stale.** Actual count was 26 native `<select>` elements across 11 files, not 24 across 13 (the doc's own enumerated list only ever summed to 10 files/24 selects despite the "13 files" prose) — it missed `admin/portfolio/page.tsx`'s own fund/type filter selects, which have the identical arrow-flush-to-border problem and were swept in alongside the rest.
- **Two selects were deliberately left native, correcting finding #9's "all exhibit the identical problem" claim:** `updates/new/page.tsx`'s "start from a template" dropdown is intentionally chromeless (`border-0 bg-transparent`, no border to be flush against) — the composer's minimal styling, not a bug; and `admin/portfolio/[id]/page.tsx`'s inline round-assignment select lives in a dense table cell sized to match the adjacent compact ownership `<input>` (`px-2 py-1 text-xs`) — `Select`'s `input-field` base (`h-10`) would have blown up that row's height next to a control that wasn't converted.
- `team/page.tsx`'s two role selects and `admin/companies/[id]/page.tsx`'s member-role select already had `appearance-none` + a hand-rolled `ChevronDown` (the exact fix `Select` encodes) — no visual bug existed there. Converted anyway to converge on one shared primitive, sized with `className="w-auto"` to preserve their compact inline-row footprint.
- `Table`'s sketch in this doc only exposed a wrapper `className`; every adopting page needed a different `min-width` on the inner `<table>` for `overflow-x-auto` to keep scrolling horizontally on narrow viewports (mobile acceptance criterion) instead of squishing columns. Added a small `tableClassName` prop to carry it — the only deviation from the doc's literal code sketch.
- WS32's `space-y-3` census also came in different from the doc: 19 files / 27 occurrences currently in the codebase, not "17 files." Classified every hit as list-item (changed) vs. form-field (left alone) against the Q39 banner's 8 named areas (Funds, LPs, Reports, Providers, Templates panel, Digest, Approvals, Links) — 15 sites across 9 files changed; everything outside those named areas (including `admin/companies/[id]`, `admin/portfolio/[id]`'s round-edit form, `admin/digest/[id]`'s todo editor, `setup-wizard`, `share/[token]`, and `admin/updates`'s already-separately-widened page) was left untouched.

Full outcome detail, quality-gate results, and the consolidated user click-through checklist (sticky header, sort-click behavior, row hover, Select dropdowns, list spacing) are in the implementer's final report for this batch, not duplicated here.

## Part 13 roadmap bookkeeping (shipped 2026-07-21)

`ROADMAP.md`'s top "_Last updated_" line and the "Roadmap" section's Part 13 pointer were updated to "shipped 2026-07-21" (mirroring the Part 11/12 entries), and the Deal Ledger table's existing "Cross-fund portfolio views + ledger CRUD" bullet under "Existing Features" got a short addendum noting the density/navigation-cue polish rather than a new bullet.

---

# Part 14 — Fund Performance Snapshot in LP Reports (WS33–WS36)

_Added 2026-07-29, from the user's request to add a fund-level performance snapshot (invested/implied value/TVPI/DPI/gross IRR + the full deal table, as seen on `/admin/funds/[id]`) into an LP report letter — the same screenshot the admin fund page itself renders. Reviewed against the working tree before any decision was asked for (see Q40–Q45 below); every claim in this Part was verified against real files, not assumed from the screenshot. Same hard constraints as every prior Part: **no new cost lines**, **no UX regressions** (founder/investor surfaces untouched; the admin fund page's own Performance card is extraction-only, pixel-identical after this ships), **additive-only schema changes** via the house `db push` procedure._

## Decisions Q40–Q45 — all answered by the user 2026-07-29

> **Q40 = A** — Expose all five Performance stats (Invested, Implied Value, TVPI, DPI, Gross IRR) to LPs exactly as admins see them, but **only** inside a report the admin explicitly builds for that fund's own LPs — a narrow, explicit carve-out of the Q23 admin-only wall, not a general reversal. Nothing else that reads `portfolio-metrics.ts` becomes LP-visible.
> **Q41 = A** — Full per-deal table (company/type/date/amount/instrument/entry valuation/current valuation/multiple), a straight embed of what's on the admin fund page — not a rolled-up summary.
> **Q42** — No "synced from sheet" provenance badges reach LPs. Confirmed obviously out of scope, no pushback.
> **Q43** — No fund-picker needed. A report is always scoped to exactly one fund (`FundReport.fundId`, required, no multi-fund concept anywhere in the schema); the snapshot is always of that report's own fund. Confirmed, no pushback.
> **Q44 = A** — Re-freeze on every publish, matching the existing `@company` mention behavior exactly (delete-and-recreate the frozen row each publish).
> **Q45 = A** — A visible block rendered inline at the cursor position in the letter — not a hover chip (the mention pattern) and not a fixed-position toggle. A new editor toolbar button inserts it.

## Part 14 ground rules (carry-over + additions)

All prior-Part ground rules apply (additive `db push` before code; `export const dynamic = "force-dynamic"` on route files; never change existing response shapes; `npm run typecheck && npm run lint && npm test` before every push; one workstream per commit-and-verify cycle). Additions:

1. **The Q23 admin-only wall stays intact everywhere except the one explicit exception this Part ships.** `computeFundPerformance`/`buildFundReportSnapshot` may only ever be invoked for `report.fundId` — never a client-suppliable fund id, never from `src/app/lp/**` or `src/api/share/**` directly (those surfaces only *read* an already-frozen row scoped to the report they already have access to). Acceptance checklists below include an explicit grep guard for this.
2. **`Fund.slug` never reaches the payload.** The schema itself documents `slug` as "never shown to LPs" (finding #3) — the new snapshot carries `fund.name` only.
3. **Frozen `FundReportMention`/`MentionSnapshot` shape and the hover-card rendering path are untouched.** Nothing in this Part changes `report-snapshot.ts`'s existing mention functions, `mention-cards.tsx`, or the WS17.2 snapshot shape — this is a second, independent freeze living alongside the first, not a modification of it.
4. **CONFIDENTIALITY — unchanged.** The repo is public; no real valuation/LP data enters git. All new tests use synthetic fixtures, same as every prior Part.

## Part 14 review findings

1. **The admin Performance card's numbers are computed inline, not through a reusable function.** `src/app/api/admin/funds/[id]/route.ts:37-80` builds `invested`/`impliedValue`/`tvpi`/`dpi`/`grossIrr` directly from `portfolio-metrics.ts`'s primitives (`positionValue`, `computePaidIn`, `tvpi`, `dpi`, `fundFlows`, `xirr`) inline in the route handler — there is no single `computeFundPerformance()`-shaped function today. To actually "reuse `portfolio-metrics.ts`'s existing functions" (rather than write a third copy of this ~30-line block for the report-freeze path), WS33 extracts it into the module and refactors the existing route to call it — a byte-identical-output refactor, not a behavior change.
2. **Company mentions never render numbers inline in the letter — this is a materially different UI pattern, not a reuse of one.** `src/components/ui/portco-mention.ts` stores only a name-bearing `<span data-portco>`; the frozen numbers live in a separate `FundReportMention.snapshot` row, revealed only via a hover/click popover (`src/components/mention-cards.tsx`). Q45-A is correctly a new, always-visible block — it reuses the mention pattern's *plumbing shape* ("marker in the stored HTML" + "frozen JSON row alongside it," same delete-and-recreate freeze semantics) but not its *visual* behavior.
3. **`Fund.slug`'s schema comment is explicit: "never shown to LPs."** (`prisma/schema.prisma`, `Fund.slug`). Confirmed as a hard constraint on the new payload (ground rule 2), not a new one this Part invents.
4. **`FundReport` is single-fund-scoped everywhere — no multi-fund concept exists.** `fundId String` is required on `FundReport`, with no join table or array anywhere in the schema, and the report editor (`admin/reports/[id]/page.tsx`) only ever knows one `report.fund`. Confirms Q43: there is exactly one fund a report's snapshot can be, so no picker UI is needed — only an insert affordance.
5. **No `ReactNodeViewRenderer`/`NodeViewWrapper` precedent exists anywhere in this codebase** (grep-verified across `src/`). Every existing TipTap extension (`Image`, `Link`, the portco mention) renders via plain `renderHTML` markup, not a live React component inside the editing surface. WS34 follows that same precedent — a static placeholder marker while drafting, with the real stat-strip-plus-table rendering only in `ReportView` (never inside the editor itself) — rather than introduce this codebase's first NodeView. Flagged as JC-A below, with a documented, cheap upgrade path if true in-editor WYSIWYG is wanted later.

## Part 14 judgment calls (flagged per protocol — each with a cheap reversal)

- **JC-A — Editor-time rendering is a static placeholder, not a live in-editor preview** (finding #5). The inserted block shows "Fund performance snapshot — {fund} (updates when published)" while drafting; the real numbers only render in Preview (still live-computed, matching the existing mention-preview convention) and on the published/LP pages. Reversal: swap the node's `renderHTML` for a `ReactNodeViewRenderer` later — the frozen-data model and freeze timing don't change either way, this only affects what the block looks like while composing.
- **JC-B — The deal table inside `ReportView` reuses the exact `Table`/`TableHead`/`Th`/`TableRow` primitives (WS30/31)** the admin fund page already uses, rather than a letter-styled variant — same bordered/`bg-muted` treatment, which may read as a bit "admin-chrome" inside an otherwise plain-prose letter. Reversal: a scoped CSS override later if it looks visually inconsistent once live; not blocking on this Part.
- **JC-C — The toolbar button doesn't prevent a second insertion.** An admin can insert the marker more than once; every instance renders the same frozen payload (harmless duplication, not a second data source). Reversal: one-line guard (`editor.getHTML().includes('data-fund-snapshot')`) to disable the button after first use, if duplicate blocks turn out to be an actual footgun in practice.
- **JC-D — The per-deal table includes the "As of" (valuation date) column**, even though Q41-A's literal enumeration named 8 columns without it. It's already computed, already shown on the admin page, and dropping it felt like an arbitrary trim of "a straight embed of what's on the admin fund page." Reversal: delete one `<Th>`/`<td>` pair if you'd rather match the literal 8-column list.

---

## WS33 — Schema + pure fund-snapshot builder, reusing `portfolio-metrics.ts` (~1–1.5 days)

**Goal:** additive schema for a frozen fund-level snapshot, plus the pure, unit-tested logic that builds it — extracted once (finding #1) so the admin route, the publish freeze (WS35), and the draft-preview live-compute (WS35) all call the same function instead of a third copy of the Performance-card math.

### WS33.1 Schema (additive — `db push` per house procedure before code)

```prisma
model FundReportFundSnapshot {
  id        String   @id @default(cuid())
  reportId  String   @unique // one snapshot per report — reports are single-fund scoped (Q43/finding #4)
  fundId    String
  fundName  String   // display name frozen at publish — never fund.slug (finding #3 / ground rule 2)
  snapshot  Json     // shape: FundSnapshotPayload, WS33.3
  createdAt DateTime @default(now())

  report FundReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  fund   Fund       @relation(fields: [fundId], references: [id], onDelete: Cascade)

  @@map("fund_report_fund_snapshots")
}
```

Add back-relations: `FundReport.fundSnapshot FundReportFundSnapshot?` and `Fund.reportSnapshots FundReportFundSnapshot[]`.

### WS33.2 Extract `computeFundPerformance()` into `src/lib/portfolio-metrics.ts`

Move the inline block from `src/app/api/admin/funds/[id]/route.ts:37-80` into a new pure function, same inputs/outputs, zero behavior change:

```ts
export interface FundPerformance {
  invested: number;
  impliedValue: number;
  dilutionAware: boolean;
  paidIn: number;
  approximate: boolean;
  tvpi: number | null;
  dpi: number | null;
  grossIrr: number | null;
  asOf: Date;
}

export function computeFundPerformance(
  deals: {
    amountUsd: number;
    entryValuation: number | null;
    currentValuation: number | null;
    ownershipPct: number | null;
    dealDate: Date;
    valuationAsOf: Date | null;
  }[],
  cashflows: { kind: string; date: Date; amountUsd: number }[]
): FundPerformance {
  // Byte-identical to the current route body: invested = Σ amountUsd; the
  // positionValue() loop for impliedValue/dilutionAware; distributions +
  // capitalCallAmounts -> computePaidIn(); asOf = latest valuationAsOf ?? now;
  // grossIrr via fundFlows() + xirr(). Moved, not rewritten.
}
```

`src/app/api/admin/funds/[id]/route.ts` calls `computeFundPerformance(fund.deals, fund.cashflows)` instead of inlining the block — refactor only; verify the JSON response is byte-identical in the acceptance checklist.

### WS33.3 `buildFundReportSnapshot()` — the frozen payload (Q40-A stats + Q41-A full deal table)

```ts
export interface FundSnapshotDealRow {
  companyName: string;
  investmentType: string;
  dealDate: string; // ISO
  amountUsd: number;
  instrument: string | null;
  entryValuationUsd: number | null;
  currentValuationUsd: number | null;
  multiple: number | null; // reuses computeMultiple from report-snapshot.ts
  valuationAsOf: string | null; // JC-D
}

export interface FundSnapshotPayload {
  fundName: string; // never fund.slug — finding #3
  performance: FundPerformance;
  deals: FundSnapshotDealRow[];
}

export function buildFundReportSnapshot(
  fundName: string,
  deals: (FundSnapshotDealInput & { companyName: string })[],
  cashflows: { kind: string; date: Date; amountUsd: number }[]
): FundSnapshotPayload {
  return {
    fundName,
    performance: computeFundPerformance(deals, cashflows),
    deals: deals.map((d) => ({
      companyName: d.companyName,
      investmentType: d.investmentType,
      dealDate: d.dealDate.toISOString(),
      amountUsd: d.amountUsd,
      instrument: d.instrument,
      entryValuationUsd: d.entryValuation,
      currentValuationUsd: d.currentValuation,
      multiple: computeMultiple(d.entryValuation, d.currentValuation),
      valuationAsOf: d.valuationAsOf ? d.valuationAsOf.toISOString() : null,
      // Deliberately no sheetRowId / "synced from sheet" field of any kind —
      // Q42 is held structurally (the type has no such key), not just hidden
      // by the renderer.
    })),
  };
}
```

### WS33.4 `src/lib/report-snapshot.ts` — marker detection

Sibling of `extractMentionIds`:

```ts
export function hasFundSnapshotMarker(html: string): boolean {
  return /data-fund-snapshot="true"/.test(html);
}
```

### WS33.5 Tests

`portfolio-metrics.test.ts` gains: `computeFundPerformance` verified against the same fixtures already used to hand-verify the existing route (reuse, don't re-derive); `buildFundReportSnapshot` asserted to never produce an object with a `sheetRowId`/provenance key even when fed a deal fixture that has one (Q42 structural guard, not a UI-only check).

**WS33 acceptance checklist**
- [ ] `npx prisma db push` clean against prod (additive only — verify no drop statements in the diff preview)
- [ ] `GET /api/admin/funds/[id]`'s `performance` object is byte-identical before/after the WS33.2 refactor (diff a real fund's response)
- [ ] `computeFundPerformance` / `buildFundReportSnapshot` / `hasFundSnapshotMarker` unit-tested; `npm run typecheck && npm run lint && npm test` green
- [ ] `buildFundReportSnapshot`'s output type carries no `sheetRowId`/"synced" field under any input — Q42 held structurally
- [ ] Grep guard: at this point in the plan, `computeFundPerformance`/`buildFundReportSnapshot` are imported only from `src/app/api/admin/**` (WS35 adds the publish-route and preview-route imports next; nothing under `src/app/lp/**` yet)

**UX impact:** none — schema-only, plus a same-output refactor. **Cost impact:** none. **Schema:** 1 new table (`fund_report_fund_snapshots`) + 2 relation fields, all additive.

## WS34 — Editor: fund-snapshot block node + toolbar button (~1 day)

**Goal:** an admin can insert a visible "fund performance snapshot" block at the cursor in a report letter (Q45-A), scoped to the report's own fund only (Q43/finding #4 — no picker needed).

### WS34.1 `src/components/ui/fund-snapshot-node.ts` (new)

A plain TipTap block atom node — the same "marker now, real render later" shape as `portco-mention.ts`, but block-level and always-visible, with no Suggestion/picker machinery (there's only one fund to insert), following the `Image` node's precedent (finding #5) rather than introducing this codebase's first NodeView:

```ts
import { Node, mergeAttributes } from "@tiptap/core";

export const FundSnapshotNode = Node.create({
  name: "fundSnapshot",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      fundId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-fund-id"),
        renderHTML: (attrs: { fundId?: string | null }) => ({ "data-fund-id": attrs.fundId }),
      },
      fundName: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-fund-name"),
        renderHTML: (attrs: { fundName?: string | null }) => ({ "data-fund-name": attrs.fundName }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-fund-snapshot]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-fund-snapshot": "true", class: "fund-snapshot-block" }),
      `Fund performance snapshot — ${HTMLAttributes["data-fund-name"] ?? "this fund"} (updates when published)`,
    ];
  },
});
```

Editor-time content is a static placeholder only (JC-A) — the real stat-strip-plus-table never renders inside the editing surface itself, only in Preview (still live, WS35) and on the published/LP pages (WS36).

### WS34.2 `src/components/ui/rich-editor.tsx` — new optional prop + toolbar button

```ts
interface RichEditorProps {
  // ...existing props...
  /** Report-editor-only: adds an "Insert fund snapshot" toolbar button that
   * drops a fundSnapshot node for this fund (Part 14, WS34). Undefined for
   * every other caller (update composer, templates, company notes) — zero
   * visual or behavioral change there. */
  fundSnapshot?: { id: string; name: string };
}
```

`FundSnapshotNode` joins the base `extensions` array unconditionally (tiny, no picker deps — same posture as `Image`/`Link` always being present regardless of caller). The toolbar gains one conditional button after the existing groups:

```tsx
{fundSnapshot && (
  <>
    <div className="mx-1 h-5 w-px bg-border" />
    <ToolbarButton
      onClick={() =>
        editor
          .chain()
          .focus()
          .insertContent({ type: "fundSnapshot", attrs: { fundId: fundSnapshot.id, fundName: fundSnapshot.name } })
          .run()
      }
      title="Insert fund snapshot"
    >
      <BarChart3 className="h-4 w-4" />
    </ToolbarButton>
  </>
)}
```

### WS34.3 `src/app/admin/reports/[id]/page.tsx` wiring

Pass `fundSnapshot={{ id: report.fund.id, name: report.fund.name }}` to `RichEditor` alongside the existing `extraExtensions={extraExtensions}`. Optionally add a line near the existing "@ to mention" hint: "Use the chart icon in the toolbar to insert this fund's performance snapshot."

### WS34.4 Minimal editor-view styling

`.fund-snapshot-block` gets a light dashed-border placeholder treatment scoped to the editor's own CSS — distinguishes it from a plain paragraph and signals it's a selectable/deletable unit (`atom: true`/`selectable: true`). Cosmetic only, not the real render.

**WS34 acceptance checklist**
- [ ] Toolbar button inserts one `fundSnapshot` block at the cursor; the block is selectable/deletable as a unit; reopening the draft round-trips the marker correctly (`parseHTML`'s `div[data-fund-snapshot]` matches `renderHTML`'s output)
- [ ] Every other `RichEditor` caller (update composer, templates editor, company-notes editor) renders byte-identically — `fundSnapshot` prop absent, no new toolbar button, no new extension side effects
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] 375px: the placeholder block doesn't overflow its container (plain block-level div at this stage, no table yet — nothing new to break)

**UX impact:** additive — one new toolbar button, visible only on the fund-report editor. **Cost impact:** none. **Schema:** none (WS33's).

## WS35 — Publish-time freeze + draft-preview live compute (~0.75–1 day)

**Goal:** publishing a report with a fund-snapshot marker freezes `FundReportFundSnapshot` in the same transaction as the mention freeze (mirroring the existing mention delete-and-recreate, so republish always re-freezes — Q44-A); the draft preview computes it live, matching the existing mention-preview convention (Q13's "next publish re-freezes fresh numbers regardless of what this preview showed").

### WS35.1 `src/app/api/admin/reports/[id]/publish/route.ts`

Inside the existing `$transaction`, alongside the mention `deleteMany`/create loop:

```ts
await tx.fundReportFundSnapshot.deleteMany({ where: { reportId: id } });
if (hasFundSnapshotMarker(report.body)) {
  const fund = await tx.fund.findUnique({
    where: { id: report.fundId }, // never a client-suppliable id — ground rule 1
    include: { deals: { include: { portfolioCompany: { select: { name: true } } } }, cashflows: true },
  });
  const snapshot = buildFundReportSnapshot(
    fund!.name,
    fund!.deals.map((d) => ({
      companyName: d.portfolioCompany.name,
      investmentType: d.investmentType,
      dealDate: d.dealDate,
      amountUsd: Number(d.amountUsd),
      instrument: d.instrument,
      entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
      currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
      valuationAsOf: d.valuationAsOf,
    })),
    fund!.cashflows.map((c) => ({ kind: c.kind, date: c.date, amountUsd: Number(c.amountUsd) }))
  );
  await tx.fundReportFundSnapshot.create({
    data: { reportId: id, fundId: report.fundId, fundName: fund!.name, snapshot: snapshot as unknown as object },
  });
}
```

Always deletes first (handles "marker removed before republish" the same way mentions already do), and always keys off `report.fundId` — never a fund id read from the request body — closing the "could this ever freeze a different fund's numbers into this report" question structurally.

### WS35.2 `src/app/admin/reports/[id]/preview/page.tsx`

Mirror the existing mention live-compute block: if `hasFundSnapshotMarker(report.body)`, fetch `report.fund`'s deals/cashflows and call `buildFundReportSnapshot()` live (never frozen in preview), pass the result as a new `fundSnapshot` prop to `ReportView`.

### WS35.3 `src/app/lp/reports/[id]/page.tsx`

Add `fundSnapshot: { select: { fundName: true, snapshot: true } }` to the existing `fundReport.findUnique` include; pass it to `ReportView` if present. No new query surface and no fund-id parameter accepted from the client anywhere in this file — the only fund ever readable here remains `report.fundId`, gated by the unchanged existing membership check (`ctx.fundIds.includes(report.fundId)`).

**WS35 acceptance checklist**
- [ ] Publish a report with the marker → a `FundReportFundSnapshot` row is created with `fundId === report.fundId`, always
- [ ] Publish a report without the marker → no row created (and the `deleteMany` is a no-op)
- [ ] Insert the marker into an already-published report, unpublish, republish → the row is recreated (deleted-and-recreated, matching mention behavior) with fresh numbers if the underlying deal data changed since (Q44-A)
- [ ] Remove the marker from a previously-snapshotted report, republish → the row is deleted (no orphaned frozen data left behind)
- [ ] Draft preview shows live-computed numbers that change immediately after editing a deal's valuation elsewhere, exactly like mention hover cards do today
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] **Grep guard (admin-only wall, explicitly required):** `computeFundPerformance`/`buildFundReportSnapshot` are never imported from `src/app/lp/**` or `src/app/api/share/**` — the LP route only ever reads the already-frozen `FundReportFundSnapshot` row scoped to `report.fundId`; it never computes anything live and never accepts a fund id of its own
- [ ] Manually attempt to view another fund's snapshot data via a report you don't have LP access to → identical 404 to today (membership check unchanged — confirm by reading the diff, not just by not testing it)

**UX impact:** none until WS36 renders the frozen data — this WS is data plumbing only. **Cost impact:** none. **Schema:** none (WS33's).

## WS36 — Shared rendering: `<FundPerformanceCard>` extraction + `<FundSnapshotBlock>` in `ReportView` (~1–1.5 days)

**Goal:** the LP report page and the admin preview page render the exact same Performance-card-plus-deal-table markup the admin fund page shows (Q40-A/Q41-A), inline at the marker's position in the letter (Q45-A), using the existing scrollable-table Pattern A for the narrower `max-w-2xl` letter width.

### WS36.1 Extract `src/components/fund-performance-card.tsx`

Pull the JSX at `src/app/admin/funds/[id]/page.tsx:462-497` (the Performance card) into a shared component taking the same shape (now `FundPerformance` from WS33.2) as a prop; the admin fund page imports and renders it unchanged (byte-identical output — extraction, not a redesign). Add an optional `deals?: FundSnapshotDealRow[]` prop — when present, renders the full per-deal table (Q41-A) beneath the stat strip using the existing `Table`/`TableHead`/`Th`/`TableRow` primitives (JC-B) wrapped in `overflow-x-auto` with an explicit `min-w-[720px]` (Pattern A). The admin fund page's own Deals tab keeps its existing separate table unchanged — that one still needs the "synced from sheet" column and sortable headers, which are Deal-Ledger-specific and out of scope for this shared component.

### WS36.2 `src/components/fund-snapshot-block.tsx` (new — sibling of `mention-cards.tsx`)

```tsx
"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FundPerformanceCard } from "@/components/fund-performance-card";
import type { FundSnapshotPayload } from "@/lib/portfolio-metrics";

export function FundSnapshotBlock({ data }: { data: FundSnapshotPayload | null }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.querySelector<HTMLElement>(".report-body [data-fund-snapshot]"));
  }, [data]);

  if (!data || !target) return null;
  return createPortal(
    <FundPerformanceCard performance={data.performance} deals={data.deals} fundName={data.fundName} />,
    target
  );
}
```

Same "find the marker after mount, render the real thing over it" shape as `MentionCards`, but a portal into the marker element rather than hand-built DOM — the real content here is a full React component tree (stat strip + table), not four lines of text.

### WS36.3 `src/components/report-view.tsx`

Add `fundSnapshot?: FundSnapshotPayload | null` to `ReportViewProps`; render `<FundSnapshotBlock data={fundSnapshot ?? null} />` alongside the existing `<MentionCards mentions={mentions} />`.

### WS36.4 Wire the three callers

- `src/app/lp/reports/[id]/page.tsx` (WS35.3): pass `fundSnapshot={report.fundSnapshot ? { fundName: report.fundSnapshot.fundName, ...(report.fundSnapshot.snapshot as FundSnapshotPayload) } : null}`
- `src/app/admin/reports/[id]/preview/page.tsx` (WS35.2): pass the live-computed payload
- `src/app/admin/funds/[id]/page.tsx`: swap its inline Performance JSX for `<FundPerformanceCard performance={fund.performance} />` (no `deals` prop — its own Deals tab below is unaffected and keeps the sync badge/inline-edit features that are out of scope for the shared component)

**WS36 acceptance checklist**
- [ ] `/admin/funds/[id]`'s Performance card renders pixel-identical after the extraction (before/after screenshot)
- [ ] A published report with a fund-snapshot marker shows the stat strip + full deal table inline, in the letter's normal reading flow, on both `/lp/reports/[id]` and `/admin/reports/[id]/preview` — byte-identical between the two (mirrors the existing "preview is honest" guarantee)
- [ ] The deal table never renders a "synced from sheet" badge or any sheet-provenance indicator (Q42) — confirmed both by the payload's own shape (WS33.5) and visually
- [ ] The deal table scrolls horizontally inside its own container at 375px (Pattern A) rather than squeezing the narrower `max-w-2xl` letter width; the stat strip stacks using the same base grid classes already used on the admin page (carried over verbatim by the extraction)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Live-verified on `molly.dfslab.net`: publish a real report with a snapshot block, view it as an actual LP session, confirm the numbers match the fund's live admin Performance card at the moment of publish

**UX impact:** additive on the LP/admin-preview surfaces (a new, deliberately-inserted block only ever appears where an admin explicitly added it); the admin fund page's own Performance card is visually unchanged (extraction only). **Cost impact:** none. **Schema:** none (WS33's).

## Part 14 sequencing

WS33 unblocks everything else (schema + the pure builder that both WS35 and WS36 depend on). WS34 (editor node/toolbar) has no dependency on WS33 and can be built in parallel. WS35 needs WS33's builder and WS34's marker/attribute name to exist before it's meaningful. WS36 needs WS33's payload shape decided but can start once that's settled, in parallel with WS35. Recommended order: **WS33 → WS34 → WS35 → WS36**, one commit-and-verify cycle each (quality gates green, live-verified on `molly.dfslab.net` before starting the next workstream) — overall effort **~4–5 days**, comparable in scale to Part 10's WS24–26 batch.

## Part 14 roadmap bookkeeping (to do once shipped)

Once WS33–WS36 ship: annotate the "Fund Report authoring" bullet under Admin Features in `ROADMAP.md` with the new insertable fund-performance-snapshot block (Q40-A/Q41-A/Q44-A/Q45-A) and its scope (that report's own fund only, no sheet-provenance data, freezes and re-freezes with every publish exactly like company mentions); update the top `_Last updated_` line and flip the "Next up" pointer below to "shipped," following the exact pattern used for Parts 11–13.

---

# Part 15 — Per-Fund Performance Override (Gross MOIC / Net TVPI / Net DPI)

_Added 2026-07-30, from a message Stephen (DFS Lab team member) sent Joseph right after the Part 14 walkthrough: he'd updated the internal tracking sheet for CAF1 specifically with Gross MOIC / Net TVPI / Net DPI figures and asked to show those (alongside Invested and Implied Value) and drop Gross IRR "for now." Per house convention this went through a discuss-first round before any plan was written — the request was investigated against the real code first (not assumed from the message), talked through with Joseph as open questions (Q46–Q52 below), and only written up here after he answered. Same hard constraints as every prior Part: **no new cost lines**, **no UX regressions** (every fund except CAF1 is byte-identical after this ships, on every surface, until an admin fills in that fund's override fields), **additive-only schema changes** via the house `db push` procedure._

**What this is not:** a relabeling of Part 14's existing computed TVPI/DPI/Gross IRR. `computeFundPerformance()` (`src/lib/portfolio-metrics.ts:8-15`) is explicit that its numbers are gross-of-fees by construction unless `FEE` cashflow rows exist, and TVPI/DPI fall back to an `approximate: true` paid-in stand-in when no `CAPITAL_CALL` rows exist — there is no code path anywhere that can currently produce a "net" figure. `FundCashflow` rows can only ever be created one at a time through the WS25 admin CRUD (`scripts/import-investment-tracker.ts` never touches them, and neither does the sheet sync) — confirming Stephen's three numbers are genuinely computed outside Molly, not something the existing engine could derive if only it were asked to. See findings F26–F29 below.

## Decisions Q46–Q52 — all answered by the user 2026-07-30

> **Q46 (source)** — Manual admin override only. No sheet-sync changes, no automation: Stephen supplies the three numbers, an admin types them into Molly once.
> **Q47 (scope)** — Schema is generic: every `Fund` gets the same three nullable override columns. Only CAF1 has values populated today; no CAF1-specific code path anywhere.
> **Q48 (mixed state)** — Fine indefinitely; not treated as a transitional state to migrate away from, and not over-engineered for permanence either. No further design needed here.
> **Q49 (replace vs. add)** — Confirmed: Invested and Implied Value stay Molly-computed, unchanged, for every fund including CAF1. Gross MOIC / Net TVPI / Net DPI replace the TVPI/DPI slots only on a fund that has override values present.
> **Q50 (IRR removal scope)** — CAF1-only, and only conditional on override values being present: Gross IRR is hidden for a fund on every surface that fund's Performance card renders (admin fund page + LP fund-snapshot block) exactly while that fund has at least one override value set. Every other fund keeps showing Gross IRR exactly as today, everywhere. Reversible by clearing the override.
> **Q51 (staleness note)** — No separate "last updated"/provenance indicator for the override values. Displayed plainly; the card's existing "As of" line is untouched (it continues to describe the computed Implied Value's own valuation date, not when the override was entered).
> **Q52 (freeze/republish interaction)** — Confirmed no edge case beyond the existing Part 14 design: an already-published CAF1 report keeps its frozen old-style card exactly as published; only a future publish freezes override-branched numbers, matching the existing re-freeze-on-every-publish behavior (Q44-A) with no special-casing needed.

## Part 15 ground rules (carry-over + additions)

All prior-Part ground rules apply (additive `db push` before code; `export const dynamic = "force-dynamic"` on route files; never change existing response shapes; `npm run typecheck && npm run lint && npm test` before every push; one workstream per commit-and-verify cycle). Additions:

1. **`computeFundPerformance()`'s own signature and output stay byte-identical.** The override is attached as a sibling field by callers (`buildFundReportSnapshot()`'s new, optional 4th parameter), never mixed into the pure metrics engine — every existing `portfolio-metrics.test.ts` fixture keeps passing unchanged, and the Q23 admin-only-estimate semantics of the computed engine are untouched for every fund.
2. **Every fund with all three override columns null renders byte-identical to today, on every surface** — admin fund page, LP fund-snapshot block, admin report preview. This is the inertness guarantee: shipping this Part changes nothing observable for any fund except CAF1, and only once an admin actually fills in CAF1's fields.
3. **The override edit affordance lives only in the admin-only fund detail page component (`src/app/admin/funds/[id]/page.tsx`), never inside the shared `FundPerformanceCard`/`FundSnapshotBlock`.** That same component tree is portalled into the read-only LP page (`FundSnapshotBlock`, Part 14/WS36.2) — keeping the editing UI out of it is a structural guarantee that an edit control can never reach an LP session, not just a convention to remember.
4. **CONFIDENTIALITY — unchanged.** The repo is public; no real fund performance figures enter git. Any new tests use synthetic fixtures, same as every prior Part.

## Part 15 review findings

26. **`portfolio-metrics.ts`'s Gross IRR/TVPI/DPI are gross-of-fees/approximate-paid-in by construction, and there is no way to produce a "net" figure today.** The module's own header comment (`src/lib/portfolio-metrics.ts:8-15`) says so explicitly; `fundFlows()` only turns `FEE` cashflow rows into an outflow *if any exist* for a fund, and `computePaidIn()` falls back to `Σ deal amounts` (flagged `approximate: true`) absent real `CAPITAL_CALL` rows. This is a genuine data-and-methodology gap Stephen's override closes, not a labeling mismatch with what Part 14 shipped.
27. **No bulk or automated path has ever populated `FundCashflow` rows for any fund, CAF1 included.** Grepped `scripts/import-investment-tracker.ts` (the one-time deal importer) for any mention of "cashflow" — zero hits — and `sheet-sync-runner.ts`/`sheet-sync.ts` never touch `FundCashflow` either. The only creation path is the WS25 admin CRUD (`POST /api/admin/funds/[id]/cashflows`), entered one row at a time. Consistent with CAF1 showing "(0)" cashflow rows in the earlier screenshot, and explains why Stephen is supplying externally-computed figures rather than Molly being asked to compute them from data it doesn't have.
28. **Automating the sheet-read side of this (rejected in Q46) would have reversed a standing Part 11 decision, not extended one.** `docs/IMPLEMENTATION_PLAN.md:1723` documents that the Deals-sheet importer deliberately does **not** import its own Markups/Implied Value/MOIC/TVPI/IRR columns — "Molly computes multiples from stored valuations" — and `sheets.ts`/`sheet-sync-runner.ts` today read Deal-level fields only, with no fund-level/summary sync surface of any kind. Q46's manual-override answer is consistent with that prior decision; a future sheet-sync extension for these fields (if ever wanted) is a materially separate project, not a small addition to the existing sync.
29. **No existing schema field, on `Fund` or anywhere else, holds a Gross MOIC/Net TVPI/Net DPI value.** Grep-verified across `src/`, `prisma/`, `docs/`. This is genuinely new, additive schema (WS37.1), not a repurposed column.
30. **`FundPerformanceCard` (`src/components/fund-performance-card.tsx`) hardcodes a single, fund-agnostic 5-stat grid today** — no per-fund conditional logic exists anywhere in it. WS37 is the first thing to add fund-specific branching to this shared component, which both the admin fund page and the Part 14 LP fund-snapshot block render.

## Part 15 judgment calls (flagged per protocol — each with a cheap reversal)

- **JC-A — Reuses the existing `FUND_UPDATED` audit action** (already logs whatever changed via `metadata: data` on the existing PATCH handler) instead of a new, override-specific action. Reversal: a one-line string-literal split (`FUND_PERFORMANCE_OVERRIDE_UPDATED`) later, if `/admin/audit` ever needs to filter these edits separately from other fund-metadata changes (name/AUM/etc.).
- **JC-B — "Override active" is defined as "at least one of the three fields is non-null,"** not "all three or none." An admin who saves only Gross MOIC and leaves the other two blank gets a card that's already switched into override mode, showing "—" for the missing two. Reversal: tighten to an all-or-nothing check (one extra `&&`) if a partial save turns out to look broken in practice — flagged explicitly since Q47–Q49 didn't specify partial-entry behavior and this is a genuine judgment call, not something Joseph confirmed either way.
- **JC-C — The override inputs accept any finite number, including negative values** — no domain-specific bounds check, matching the existing `aumUsd` field's own lack of one on this same route. Reversal: add a `>= 0` guard if a mistyped negative value ever reaches production.

---

## WS37 — Manual per-fund performance override, CAF1-first (~0.75 day)

**Goal:** an admin can type Gross MOIC / Net TVPI / Net DPI into any fund; when present, those three values replace the TVPI/DPI slots on that fund's Performance card and Gross IRR is hidden, on every surface the card renders (admin fund page, LP fund-snapshot block, admin report preview); every fund without override values is untouched.

### WS37.1 Schema (additive — `db push` per house procedure before code)

```prisma
model Fund {
  id            String    @id @default(cuid())
  slug          String    @unique
  name          String
  groupLabel    String?
  firstDealDate DateTime?
  aumUsd        Decimal?
  sortOrder     Int       @default(0)

  // Part 15, WS37.1 — manual admin-entered performance overrides (Q46–Q52).
  // Generic per-fund (Q47), independently nullable so an admin can fill
  // these in incrementally; populated for CAF1 only today. No "as of"/
  // provenance column (Q51 — no separate staleness note; FUND_UPDATED
  // audit rows already timestamp every change if that history is ever
  // needed).
  grossMoicOverride Decimal?
  netTvpiOverride   Decimal?
  netDpiOverride    Decimal?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  deals     Deal[]
  lps       LpFundMembership[]
  reports   FundReport[]
  cashflows FundCashflow[]
  reportSnapshots FundReportFundSnapshot[]

  @@map("funds")
}
```

### WS37.2 `src/lib/portfolio-metrics.ts` — thread the override through as a sibling field, not a computed one

```ts
// Part 15, WS37.2 — a fund's manual performance override (Q46/Q47). Deliberately
// NOT part of FundPerformance/computeFundPerformance()'s own shape — that
// function stays a pure, byte-identical computation from deals/cashflows
// (ground rule 1). Callers that have a fund's override columns attach this
// as a sibling field when building the payload.
export interface FundPerformanceOverride {
  grossMoic: number | null;
  netTvpi: number | null;
  netDpi: number | null;
}

export interface FundSnapshotPayload {
  fundName: string; // never fund.slug — finding #3 (Part 14)
  performance: FundPerformance;
  performanceOverride: FundPerformanceOverride | null; // Part 15 — null for every fund but CAF1 today
  deals: FundSnapshotDealRow[];
}

export function buildFundReportSnapshot(
  fundName: string,
  deals: (FundSnapshotDealInput & { companyName: string })[],
  cashflows: FundPerformanceCashflow[],
  performanceOverride: FundPerformanceOverride | null = null
): FundSnapshotPayload {
  return {
    fundName,
    performance: computeFundPerformance(deals, cashflows),
    performanceOverride,
    deals: deals.map((d) => ({ /* unchanged */ } as FundSnapshotDealRow)),
  };
}
```

`computeFundPerformance()` itself is not touched — no new parameter, no new field on `FundPerformance`. This keeps the extraction Part 14 did (WS33.2) byte-identical for the admin route's own live `performance` computation; the admin fund page and the report pipeline separately attach the fund's override columns as a sibling value (WS37.4/WS37.5 below).

### WS37.3 `src/app/api/admin/funds/[id]/route.ts` — expose + accept the three fields

GET: add to the JSON response, same `Decimal → number | null` pattern already used for `aumUsd`:

```ts
grossMoicOverride: fund.grossMoicOverride !== null ? Number(fund.grossMoicOverride) : null,
netTvpiOverride: fund.netTvpiOverride !== null ? Number(fund.netTvpiOverride) : null,
netDpiOverride: fund.netDpiOverride !== null ? Number(fund.netDpiOverride) : null,
```

PATCH: extend the existing `data` object and validation block (no new route, no new audit action — reuses `FUND_UPDATED`, JC-A):

```ts
const data: {
  name?: string;
  groupLabel?: string | null;
  firstDealDate?: Date | null;
  aumUsd?: number | null;
  sortOrder?: number;
  grossMoicOverride?: number | null;
  netTvpiOverride?: number | null;
  netDpiOverride?: number | null;
} = {};
// ...existing fields unchanged...
for (const field of ["grossMoicOverride", "netTvpiOverride", "netDpiOverride"] as const) {
  if (body[field] === undefined) continue;
  if (body[field] === null || body[field] === "") {
    data[field] = null;
    continue;
  }
  const n = Number(body[field]);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: `${field} must be a number.` }, { status: 400 });
  }
  data[field] = n;
}
```

The existing `await logAdminAction(user!, "FUND_UPDATED", { targetType: "Fund", targetId: id, metadata: data as Record<string, unknown> })` line needs no change — it already forwards whichever fields were present in `data`, so an override-only PATCH produces an audit row with just the override fields in `metadata`.

### WS37.4 `src/app/admin/funds/[id]/page.tsx` — edit affordance next to the Performance card

Placed directly below `<FundPerformanceCard>` in this admin-only page component (ground rule 3), not inside the Cashflows tab — these three numbers aren't ledger entries and don't feed the computed engine the way capital calls/distributions/fees do; they directly determine what the card immediately above shows. This also mirrors the page's own existing precedent: the `editingHeader` inline-edit pattern already used for name/groupLabel/AUM at the top of this same file is the closest analog for "a few admin-typed fields with a Save/Cancel toggle."

```tsx
const [editingOverrides, setEditingOverrides] = useState(false);
const [overrideGrossMoic, setOverrideGrossMoic] = useState("");
const [overrideNetTvpi, setOverrideNetTvpi] = useState("");
const [overrideNetDpi, setOverrideNetDpi] = useState("");
const [savingOverrides, setSavingOverrides] = useState(false);

function openEditOverrides() {
  setOverrideGrossMoic(fund.grossMoicOverride !== null ? String(fund.grossMoicOverride) : "");
  setOverrideNetTvpi(fund.netTvpiOverride !== null ? String(fund.netTvpiOverride) : "");
  setOverrideNetDpi(fund.netDpiOverride !== null ? String(fund.netDpiOverride) : "");
  setEditingOverrides(true);
}

async function handleSaveOverrides() {
  setSavingOverrides(true);
  try {
    const res = await fetch(`/api/admin/funds/${fund.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grossMoicOverride: overrideGrossMoic.trim() === "" ? null : Number(overrideGrossMoic),
        netTvpiOverride: overrideNetTvpi.trim() === "" ? null : Number(overrideNetTvpi),
        netDpiOverride: overrideNetDpi.trim() === "" ? null : Number(overrideNetDpi),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
    await refetchFund(); // same refresh call handleSaveHeader already uses
    setEditingOverrides(false);
    setMessage({ type: "success", text: "Performance override saved." });
  } catch (err) {
    setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong" });
  } finally {
    setSavingOverrides(false);
  }
}
```

```tsx
<FundPerformanceCard
  performance={fund.performance}
  overrides={{ grossMoic: fund.grossMoicOverride, netTvpi: fund.netTvpiOverride, netDpi: fund.netDpiOverride }}
/>
{editingOverrides ? (
  <div className="mb-6 rounded-md border border-border bg-card p-4">
    <p className="mb-3 text-sm text-muted-foreground">
      Manual override — when any of these three are set, they replace the TVPI/DPI slots above and Gross IRR is
      hidden for this fund everywhere its Performance card renders. Clear all three to go back to Molly&apos;s own
      computed numbers.
    </p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Input label="Gross MOIC" type="number" step="0.01" value={overrideGrossMoic} onChange={(e) => setOverrideGrossMoic(e.target.value)} />
      <Input label="Net TVPI" type="number" step="0.01" value={overrideNetTvpi} onChange={(e) => setOverrideNetTvpi(e.target.value)} />
      <Input label="Net DPI" type="number" step="0.01" value={overrideNetDpi} onChange={(e) => setOverrideNetDpi(e.target.value)} />
    </div>
    <div className="mt-3 flex gap-2">
      <Button size="sm" onClick={handleSaveOverrides} disabled={savingOverrides}>{savingOverrides ? "Saving..." : "Save"}</Button>
      <Button variant="secondary" size="sm" onClick={() => setEditingOverrides(false)} disabled={savingOverrides}>Cancel</Button>
    </div>
  </div>
) : (
  <Button variant="secondary" size="sm" className="mb-6" onClick={openEditOverrides}>
    Edit performance override
  </Button>
)}
```

### WS37.5 `src/components/fund-performance-card.tsx` — branch on override presence

```tsx
interface FundPerformanceCardProps {
  performance: FundPerformanceLike;
  deals?: FundSnapshotDealRow[];
  fundName?: string;
  showCaveat?: boolean;
  /** Part 15, WS37.5 — a fund's manual override (Q46/Q47/Q49/Q50). `null`/absent
   * for every fund except CAF1 today; when at least one field is non-null
   * (JC-B), the card switches into override mode. */
  overrides?: { grossMoic: number | null; netTvpi: number | null; netDpi: number | null } | null;
}

export function FundPerformanceCard({ performance, deals, fundName, showCaveat = true, overrides }: FundPerformanceCardProps) {
  const overrideActive = !!overrides && (overrides.grossMoic !== null || overrides.netTvpi !== null || overrides.netDpi !== null);
  return (
    <div className="mb-6 rounded-md border border-border bg-card p-4">
      {/* header unchanged */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Invested, Implied Value cells unchanged */}
        {overrideActive ? (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Gross MOIC</p>
              <p className="font-mono text-lg font-semibold">{overrides!.grossMoic !== null ? `${overrides!.grossMoic.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net TVPI</p>
              <p className="font-mono text-lg font-semibold">{overrides!.netTvpi !== null ? `${overrides!.netTvpi.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net DPI</p>
              <p className="font-mono text-lg font-semibold">{overrides!.netDpi !== null ? `${overrides!.netDpi.toFixed(2)}x` : "—"}</p>
            </div>
          </>
        ) : (
          <>
            {/* existing TVPI / DPI / Gross IRR cells, byte-identical to today */}
          </>
        )}
      </div>
      {showCaveat && (
        <p className="mt-3 text-xs text-muted-foreground">
          Admin-only estimate; gross of fees unless FEE cashflow rows are recorded.
          {!overrideActive && performance.approximate && " TVPI/DPI use total invested as a paid-in stand-in — no capital-call rows recorded yet, so treat as approximate."}
          {!performance.dilutionAware && " * Implied value assumes zero dilution (no ownership % recorded on these deals yet)."}
        </p>
      )}
      {/* deals table unchanged */}
    </div>
  );
}
```

Only the TVPI-approximate clause is suppressed in override mode (it no longer applies — that cell isn't rendered); the lead sentence and the Implied Value dilution caveat still apply on the admin page (`showCaveat=true`) since Invested/Implied Value stay Molly-computed either way. On the LP snapshot (`showCaveat=false`) this whole paragraph is already suppressed today, so nothing changes there.

### WS37.6 `src/components/fund-snapshot-block.tsx` and the report pipeline — pass the override through

- `fund-snapshot-block.tsx`: add `overrides={data.performanceOverride}` to its `<FundPerformanceCard>` call.
- `src/app/admin/reports/[id]/preview/page.tsx` (live compute): the existing `db.fund.findUnique({ where: { id: report.fundId }, include: {...} })` call has no `select`, so `fund.grossMoicOverride`/`netTvpiOverride`/`netDpiOverride` are already returned — pass a 4th argument to `buildFundReportSnapshot()`:
  ```ts
  buildFundReportSnapshot(fund.name, /* deals */, /* cashflows */, {
    grossMoic: fund.grossMoicOverride !== null ? Number(fund.grossMoicOverride) : null,
    netTvpi: fund.netTvpiOverride !== null ? Number(fund.netTvpiOverride) : null,
    netDpi: fund.netDpiOverride !== null ? Number(fund.netDpiOverride) : null,
  })
  ```
- `src/app/api/admin/reports/[id]/publish/route.ts` (freeze): identical change inside the transaction's `tx.fund.findUnique(...)` call, same 4th argument to `buildFundReportSnapshot()`. Once frozen into `FundReportFundSnapshot.snapshot`, `performanceOverride` travels with the rest of the payload automatically.
- `src/app/lp/reports/[id]/page.tsx`: **no code change needed.** It already spreads `...(report.fundSnapshot.snapshot as FundSnapshotPayload)`, which will include `performanceOverride` automatically once the publish route freezes it — confirmed by re-reading this file, not assumed.

**WS37 acceptance checklist**
- [ ] `prisma db push` run against production per house procedure (additive: three new nullable `Decimal` columns) before any code lands
- [ ] Every fund except CAF1: admin fund page Performance card renders byte-identical to today, before and after this ships (ground rule 2) — before/after screenshot
- [ ] CAF1 before an admin enters any override value: its card is identical to every other fund's card — an all-null override is fully inert (Q47/Q48, ground rule 2)
- [ ] CAF1 after an admin enters all three override values: admin fund page shows Gross MOIC / Net TVPI / Net DPI in place of TVPI/DPI, the Gross IRR cell is gone, Invested and Implied Value are unchanged and still live-computed (Q49/Q50)
- [ ] The same override branching renders on `/admin/reports/[id]/preview` and the real `/lp/reports/[id]` page for a CAF1 report with a fund-snapshot marker — byte-identical between the two, mirroring WS36's existing "preview is honest" guarantee
- [ ] Clearing all three override fields (blank + save) reverts CAF1's card to fully computed numbers everywhere, including Gross IRR reappearing — confirmed live, not just by code inspection
- [ ] A CAF1 report already published before override values existed keeps its old frozen card unchanged after the override is entered; only a fresh publish after that freezes the override-branched snapshot (Q52)
- [ ] `PATCH /api/admin/funds/[id]` rejects a non-numeric override value with 400, same pattern as the route's other numeric fields
- [ ] A `FUND_UPDATED` audit row is written with the changed override field(s) in `metadata`, visible on `/admin/audit` (JC-A)
- [ ] `npm run typecheck && npm run lint && npm test` green; `portfolio-metrics.test.ts` gains coverage for `buildFundReportSnapshot()`'s new 4th parameter — both a no-override call (byte-identical output to before this Part) and a populated-override call that correctly attaches `performanceOverride`
- [ ] Grep-guard: `computeFundPerformance()`'s own signature and `FundPerformance` interface are unchanged — confirms the override is bolted on at the payload level, not mixed into the pure metrics engine (ground rule 1)
- [ ] Live-verified on `molly.dfslab.net`: enter CAF1's real three values, confirm on both the admin fund page and an actual LP session; confirm every other fund's card and LP-facing report are unaffected

**UX impact:** additive on the admin surface (a new, optional edit affordance next to the Performance card); zero change on every LP-facing surface except CAF1, and even CAF1's LP experience only changes once an admin has actually entered values — no founder, admin, or investor-link surface outside this one card is touched. **Cost impact:** none — three nullable Postgres columns, no new service, no sheet-sync surface. **Effort estimate:** ~0.75 day (schema + engine threading + one route + one shared component + one admin page + report-pipeline wiring + tests), matching the "simplest" shape scoped in the discuss-first round.

## Part 15 roadmap bookkeeping (to do once shipped)

Once WS37 ships: annotate the "Fund Report authoring" bullet under Admin Features in `ROADMAP.md` with the new per-fund manual performance override (Q46–Q52) and its scope (generic schema, CAF1-populated only, replaces TVPI/DPI and hides Gross IRR only while override values are present, reversible by clearing them, no sheet-sync involvement); update the top `_Last updated_` line, following the exact pattern used for Parts 11–14. Until then, ROADMAP.md carries only a forward-pointer note (added now, in this same edit) rather than a "shipped" claim.

---

# Part 16 — Pre-Investment Due Diligence Intake (WS38–WS43)

_Added 2026-08-02, scoped from a live discussion between the user and Felix — the first pre-investment concept Molly has ever modeled (every existing domain concept — `Company`, `Deal`, `Fund`, `PortfolioCompany` — assumes the company is already an investee). Findings F30–F33 verified against the working tree; decisions Q53–Q60 all answered by the user the same day, every Felix recommendation accepted. **This Part is planning only — no code has shipped.** Same hard constraints as every prior Part: no new cost lines, no UX regressions (every existing founder/admin/investor-link surface is either untouched or only additively touched), additive-only schema changes via the house `db push` procedure._

## What this Part is

DFS Lab's real pre-investment workflow — decide to invest, email the founders a warm note with a Google Form and a Drive folder, collect documents, close — becomes a real onboarding surface inside Molly instead of a side channel, because the user's stated goal is that DD founders "start getting used to Molly from the start, since these teams will be part of the portfolio anyway." Concretely: an admin who has already decided to invest creates a company in Molly that isn't a portfolio company yet and invites its founder directly — a genuinely new capability, not a repair of ordinary self-signup — and that founder gets full, real Molly access immediately (dashboard, updates, metrics, team), with a small persistent checklist steering them through the actual DD paperwork (five optional-except-passport document uploads, one required yes/no question, and two Stellar-specific essay questions when applicable). An admin reviews what comes in and explicitly promotes the company into the real portfolio, or — if the deal doesn't close — explicitly deletes it, founder account and all.

## Decisions Q53–Q60 — all answered by the user 2026-08-02 (every recommendation accepted)

> **Q53 (state location)** — **Shape 1: `Company.stage`** (`"DILIGENCE" | "ACTIVE"`), not a new `UserStatus` value. The founder becomes fully `APPROVED` and can log in the moment they set a password, exactly like an ordinary team invite today. **Zero changes to `src/lib/auth.ts`, `src/lib/auth-guard.ts`, `src/lib/route-access.ts`, or `set-password/route.ts`'s unconditional `status: "APPROVED"` write** — this Part does not touch the tested auth core at all.
> **Q54 (promotion trigger)** — **Both.** The founder completing the checklist surfaces the company in a new admin review queue (parallel in pattern to today's Approvals/Awaiting-setup queues); an explicit admin action is what actually promotes `stage` to `"ACTIVE"`, and is the natural moment to audit-log the decision. Real `Fund`/`Deal`/`PortfolioCompany` creation stays a separate, later, manual action through the existing Deal Ledger admin CRUD — **not** wired into promotion by this Part.
> **Q55 (dashboard access)** — **Non-blocking.** Full dashboard access (Updates/Metrics/Team/everything) from the first login; a persistent DD-checklist card/banner, never a gate.
> **Q56 (invite UI)** — **Fix `/admin/companies/new`'s broken "Assign User" flow in place** (closes F32) rather than building a new page; the DD fields (Stellar checkbox) live on that same form.
> **Q57 (non-close deletion)** — **Reuse the existing `DELETE /api/companies/[id]`** endpoint (already admin-only, audit-logged, cascade-safe) — with DD-specific confirm copy distinct from the generic delete button's wording, since deleting a DD company also deletes a real, if brand-new, founder account.
> **Q58 (Stellar flag)** — **Plain admin-ticked checkbox at invite time, no `Fund` linkage.** Verified: the `Company → PortfolioCompany → Deal → Fund` chain that would otherwise answer "is this a Stellar deal" doesn't exist until a `Deal` row is created, which normally happens well after a close — there is no data to derive this from at invite time regardless of how `Fund.groupLabel` were structured.
> **Q59 (doc security)** — **Yes, fix `isInternal` enforcement now**, scoped exactly to the two read routes identified (F33) — filter `isInternal` documents out of `GET /api/companies/[id]/documents` for non-admins, and 403 non-admin reads of `GET /api/documents/[id]` when the document is internal (a role check, not an uploader exception — see WS42). Confirmed a real, pre-existing gap, not DD-specific, but DD (passport scans, bank statements) is what makes it worth fixing now rather than later. Explicitly **not** extended to a stricter "uploader + admin only" model — that was presented as an option and declined.
> **Q60 (F32 sequencing)** — Folded into Q56: F32 gets fixed as part of this work (WS39), not as a separate standalone commit first.

## Part 16 ground rules (carry-over + additions)

All prior-Part ground rules apply (additive `db push` before code; `export const dynamic = "force-dynamic"` on route files; never change existing response shapes; `npm run typecheck && npm run lint && npm test` before every push; one workstream per commit-and-verify cycle). Additions:

1. **No changes to the tested auth core, anywhere in this Part.** `src/lib/auth.ts`, `src/lib/auth-guard.ts`, `src/lib/route-access.ts`, and `set-password/route.ts`'s status write are out of scope by design (Q53) — every WS's acceptance checklist below includes a grep guard confirming this.
2. **`Company.stage` defaults to `"ACTIVE"`.** Every company that exists today (self-signup or admin-created) is unaffected by the migration with zero backfill.
3. **A DD founder's account looks exactly like a team-invited teammate's account to every existing piece of auth/email machinery** — `User{status: APPROVED, approvalToken, tokenExpiresAt}`, same `generateSetupToken()`/`canResendSetupLink()`/resend flow, same `/set-password` page. Only the invite *email's copy* and the *company's* `stage` differ.
4. **CONFIDENTIALITY, extended.** Passport scans and bank statements are the most sensitive documents this app has ever stored. Filenames, counts, and any content never enter git, console logs, commit messages, or this document's own examples. All test fixtures are synthetic.
5. **`/lp`, `/api/lp`, `/share`, `/api/share` are untouched by every WS in this Part** — grep-guarded per WS, matching the standing rule from Parts 7/10/14 that new work doesn't casually cross into the LP/investor-link surfaces.

## Part 16 review findings (continuing the F-numbering — Part 15 ended at F29)

**F30 — the `/setup-wizard` non-APPROVED exemption in `route-access.ts` is dead code today.** `set-password/route.ts:67-75` unconditionally writes `status: "APPROVED"` the instant any token holder sets a password, and `authorize()` (`src/lib/auth.ts:26`) refuses login for anyone not already `APPROVED`. Since founders never use Google OAuth, there is no code path that produces a logged-in founder session with `status !== "APPROVED"` — the exemption in `route-access.ts:54` for that case is unreachable in production. (`/setup-wizard` is instead reached today only via a narrower, separate trigger: a fully-`APPROVED` founder with zero company memberships gets a "Complete your setup" prompt on `/dashboard` and `/company/profile`.) This confirms Q53's Shape 1 is the lower-risk fork — introducing a real, live `IN_DILIGENCE` `UserStatus` would have required resurrecting and correctly wiring this exemption, not just leaving it alone.

**F31 — the Setup Wizard's step 3 (document upload) is non-functional.** `src/app/setup-wizard/page.tsx:376-380` renders a drag-and-drop box and a bare `<input type="file" multiple>` with **no `onChange` handler** — nothing is wired to `/api/documents/upload` or anywhere else. Combined with step 1 (creates a brand-new company from scratch — wrong shape for DD, where the admin pre-creates the company) and step 2 (metric definitions — not in the DD field list at all), the Setup Wizard is not a reusable flow for this feature; only its visual shell (step indicator, card layout) is worth imitating. WS40 below is a new, purpose-built flow, not an extension of `/setup-wizard`.

**F32 — `/admin/companies/new`'s "Assign User" flow is broken.** The page (`src/app/admin/companies/new/page.tsx:70-77`) posts `{ existingUserEmail }` or `{ newUser: { name, email } }`, but `POST /api/companies` (`src/app/api/companies/route.ts:101-102`) destructures `const { userEmail, userName } = body` — field names that never match what the client sends. `assignUserId` silently falls back to the admin's own id, so using this form to "assign" a founder today actually makes the *admin* the OWNER member of the new company regardless of what's typed in. No email is ever sent in either branch. No tests cover it. Fixed as part of WS39 (Q56/Q60) — and fixing it also makes the *ordinary* (non-DD) "assign an existing/new user to a fresh company" capability work correctly for the first time, a welcome side effect rather than added scope.

**F33 — `isInternal` is not enforced as access control on document reads, only rendered as a display badge.** `GET /api/companies/[id]/documents` (`route.ts:20-41`) and `GET /api/documents/[id]` (`route.ts:17-31`, which returns a live presigned download URL) both gate purely on `requireCompanyAccess(companyId)` — any member of the company, any role — with zero filtering on `isInternal`. The flag is rendered as a "Internal"/"Shared" badge only inside the **admin** company page; founders have no document-browser UI at all today (only inline attachment upload in the update composer), so this has been latent/harmless so far. DD's passport scans and bank statements make it acute: marking them `isInternal: true` would not, by itself, stop a co-founder/teammate on the same company from viewing or downloading them. Fixed narrowly in WS42 per Q59.

**F34 and F35 — found during implementation and during the 2026-08-03 platform audit, both in WS43's decline/delete path. Full detail in Part 17**, not repeated here to avoid two sources of truth: F34 is a plan-vs-schema conflict caught and corrected the same session it was introduced (`Company` deletion doesn't cascade to `User`); F35 is a real, still-open gap in the corrected fix (the founder-account cleanup silently no-ops when the founder created a `ShareableLink` before being declined).

**Infrastructure verification (working tree, 2026-08-02):** `Company` has no status/stage field today (`prisma/schema.prisma:81-111`) — the brief's original framing of "Founder/Company status fields" conflated `User.status` with something that doesn't exist on `Company` yet; this Part adds it. The three call sites that already exclude PENDING-founder companies from admin views (`api/admin/companies/route.ts:12-14`, `api/admin/dashboard/route.ts:59-61`, `api/cron/alerts/route.ts:16-18`) duplicate the same inline filter with no shared helper — extracted in WS38. `api/cron/reminders/route.ts` filters only on `reminderFrequencyDays: { not: null }`, which is editable **only from the admin company page** (`admin/companies/[id]/page.tsx`), never from a founder's own `/company/profile` — so a DD-stage company can only start receiving "you're behind on updates" reminders if an admin deliberately turns them on, a non-issue not worth a filter change (JC-DD-A below). `Document.docType` is a free nullable string and `DOC_TYPES` (`src/lib/constants.ts:1-9`) a plain array/union — extending it is a trivial additive change, no migration. `logAdminAction()` (`src/lib/audit.ts`) accepts arbitrary action strings and nullable `actorId` — no schema change needed to log any new DD-specific action.

## Part 16 technical judgment calls (flagged per protocol — each with a cheap reversal)

- **JC-DD-A — `api/cron/reminders` is left unmodified.** `reminderFrequencyDays` is only settable from the admin company page, never by a founder — so a DD-stage company can only get reminder emails if an admin deliberately enables them, which is already a deliberate admin action taken with full context. Reversal: add `stage: "ACTIVE"` to that route's `where` clause later if this ever proves wrong in practice.
- **JC-DD-B — the shared filter lives in a new `src/lib/company-filters.ts`, not inlined further or added to `src/lib/db.ts`.** Matches the house convention of one small pure-ish helper file per concern (`setup-token.ts`, `share-metrics.ts`, `report-snapshot.ts`). Reversal: trivial rename/relocate.
- **JC-DD-C — `CompanyDiligence` is a separate 1:1 model, not six new nullable columns inlined onto `Company`.** Several existing readers spread `Company` broadly (`GET /api/companies` does `...m.company`) — inlining DD fields directly on `Company` would silently appear in every existing company payload immediately. A separate model with its own route keeps the blast radius to exactly the surfaces that ask for it. Reversal: cheap to inline later if ever wanted; both are additive.
- **JC-DD-D — no `Fund` linkage for the Stellar flag (Q58), stored as `CompanyDiligence.isStellarEcosystem`.** Verified no Deal/Fund record exists at invite time (F-verified in the discovery pass), so there is nothing to derive Stellar-ness from programmatically; a plain admin-ticked boolean is the honest shape.
- **JC-DD-E — the promote action (WS41) writes only `Company.stage`/`CompanyDiligence.closedAt`, never touches `Fund`/`Deal`/`PortfolioCompany`.** Q54 explicitly separates real deal-ledger creation as a later, manual, distinct action through the existing Deal Ledger admin CRUD (Part 7/10) — mixing it into promotion would silently couple two independently-evolving systems. Reversal: none needed, this is a hard boundary per the decision, not a placeholder.
- **JC-DD-F — checklist completion (`CompanyDiligence.completedAt`) is recomputed lazily on every `GET`/`PATCH` of the checklist (WS40) and on every admin queue load (WS41), not written eagerly by a founder "Submit" button.** There is no explicit founder submission step in the confirmed field list, and documents/answers can change (e.g. a founder re-uploads a passport) right up until an admin promotes — recompute-on-read keeps `completedAt` always honest without a webhook-style fan-out from the upload/archive routes. Reversal: swap for an explicit "Mark ready for review" founder action later if recompute-on-read ever proves surprising in practice (e.g., an admin looking at a stale queue between founder page loads).
- **JC-DD-G — the DD review queue is its own page, `/admin/diligence`, not a third section bolted onto `/admin/approvals`.** `Approvals` reviews `User` rows (a yes/no on a person); this queue reviews `Company`/`CompanyDiligence` rows (documents + questionnaire) — different underlying models, different review actions (promote/decline vs. approve/reject), and Part 11 already established that conflating differently-shaped review surfaces on one page causes the exact nav confusion it fixed. Reversal: cheap to fold into `/admin/approvals` as a third section later if the two queues turn out to be used together in practice, same pattern as how "Awaiting password setup" was added as a section rather than a page.

---

## WS38 — Schema: `Company.stage`, `CompanyDiligence`, shared portfolio-company filter (~0.5–0.75 day)

**Goal:** additive schema for the DD state machine, and one shared helper replacing the three duplicated `approvedCompanyFilter`-style inline filters — now also excluding `stage: "DILIGENCE"` companies from every admin-facing "real portfolio" view. Invisible on its own — no UI reads any of this yet.

### WS38.1 Schema (additive — `db push` per house procedure before code)

```prisma
model Company {
  // ...existing fields unchanged...
  stage String @default("ACTIVE") // "DILIGENCE" | "ACTIVE" — Part 16, Q53. Existing rows default to ACTIVE, zero backfill needed.

  // ...existing relations unchanged...
  diligence CompanyDiligence?
}

// Part 16, WS38 — one row per due-diligence-stage company (Q53–Q60).
// Deliberately a separate model, not inlined onto Company (JC-DD-C).
model CompanyDiligence {
  id                  String    @id @default(cuid())
  companyId           String    @unique
  isUsIncorporated    Boolean?  // required question, but nullable until answered
  isStellarEcosystem  Boolean   @default(false) // admin-ticked at invite time (Q58) — no Fund linkage
  stellarWhyText      String?   @db.Text // required only when isStellarEcosystem
  stellarTimelineText String?   @db.Text // required only when isStellarEcosystem
  completedAt         DateTime? // recomputed lazily (JC-DD-F) — non-null once the checklist is done
  closedAt            DateTime? // set by the explicit admin promote action (WS41)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@map("company_diligence")
}
```

### WS38.2 `src/lib/company-filters.ts` (new)

```ts
/**
 * The "is this a real, decision-visible company" filter — excludes
 * companies whose founder is still awaiting an ordinary signup decision
 * (PENDING, no token) AND companies still in due-diligence intake
 * (Part 16, Q53). Was duplicated inline in three places; extracted here
 * so admin/companies, admin/dashboard, and cron/alerts stay in sync.
 */
export const approvedCompanyFilter = {
  AND: [
    { NOT: { createdBy: { status: "PENDING", approvalToken: null } } },
    { NOT: { stage: "DILIGENCE" } },
  ],
} as const;
```

Update `src/app/api/admin/companies/route.ts`, `src/app/api/admin/dashboard/route.ts`, and `src/app/api/cron/alerts/route.ts` to `import { approvedCompanyFilter } from "@/lib/company-filters"` in place of their inline copies — response shapes unchanged, this is a pure refactor plus the one new `stage` condition.

**WS38 acceptance checklist**
- [ ] `npx prisma db push` clean against prod (additive: 1 new defaulted `Company` column + 1 new table) — verify no drop statements in the diff preview
- [ ] Existing companies read `stage: "ACTIVE"` with zero manual backfill
- [ ] All three call sites import the shared filter; a company manually set to `stage: "DILIGENCE"` in a test disappears from `/admin/companies`, the admin dashboard's KPI counts/company list, and a manual metric-alerts cron dry run — and reappears once flipped back
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `src/lib/auth.ts`, `auth-guard.ts`, `route-access.ts`, `set-password/route.ts`

**UX impact:** none — no surface reads `stage`/`CompanyDiligence` yet. **Cost impact:** none. **Schema:** 1 new defaulted `Company` column + 1 new table, additive.

## WS39 — Repaired admin-initiated DD invite flow (F32, Q56, Q60) (~1–1.25 day)

**Goal:** fix `/admin/companies/new`'s broken "Assign User" flow in place; extend it so an admin can create a DD-stage company, invite its founder with real DD-invite email copy, and tick the Stellar checkbox — all from the one page.

### WS39.1 `POST /api/companies` — field-name fix + DD branch

```ts
// existing signature: { name, description, website, sector, geography, fundingStage, userEmail?, userName? }
// unchanged for the plain-company path; adds one new optional block:
const { name, description, website, sector, geography, fundingStage, userEmail, userName, dueDiligence } = body;
// dueDiligence?: { isStellarEcosystem: boolean }

if (user!.roles.includes("ADMIN")) {
  const company = await db.$transaction(async (tx) => {
    let assignUserId = user!.id;
    let setupToken: string | null = null;

    if (userEmail) {
      let founderUser = await tx.user.findUnique({ where: { email: userEmail } });
      if (!founderUser) {
        const { token, tokenExpiresAt } = generateSetupToken();
        founderUser = await tx.user.create({
          data: {
            email: userEmail,
            name: userName || null,
            roles: ["FOUNDER"],
            status: "APPROVED", // matches the working members/invite pattern, not PENDING
            approvalToken: token,
            tokenExpiresAt,
          },
        });
        setupToken = token;
      }
      assignUserId = founderUser.id;
    }

    const newCompany = await tx.company.create({
      data: {
        name: name.trim(), description: description || null, website: website || null,
        sector: sector || null, geography: geography || null, fundingStage: fundingStage || null,
        createdById: user!.id, // unchanged convention — always the admin, matches today's precedent
        stage: dueDiligence ? "DILIGENCE" : "ACTIVE",
      },
    });

    if (dueDiligence) {
      await tx.companyDiligence.create({
        data: { companyId: newCompany.id, isStellarEcosystem: dueDiligence.isStellarEcosystem ?? false },
      });
    }

    await tx.userCompanyMembership.create({
      data: { userId: assignUserId, companyId: newCompany.id, role: "OWNER" },
    });

    return { newCompany, setupToken, founderEmail: userEmail || null };
  });

  if (dueDiligence && company.setupToken && company.founderEmail) {
    sendDiligenceInviteEmail({
      toEmail: company.founderEmail,
      companyName: company.newCompany.name,
      token: company.setupToken,
    }).catch((err) => console.error("Failed to send diligence-invite email:", err));
  }

  await logAdminAction(user!, "COMPANY_CREATED", {
    targetType: "Company", targetId: company.newCompany.id,
    metadata: { name: company.newCompany.name, dueDiligence: !!dueDiligence },
  });
  return NextResponse.json(company.newCompany, { status: 201 });
}
```

Fixing the field-name bug (`userEmail`/`userName` were already the route's names — the client was wrong) means: **WS39.2 changes the client**, not the route's existing field names, so the plain (non-DD) "assign existing/new user" path — which was silently broken — starts working correctly for the first time as a side effect, exactly the F32 fix.

### WS39.2 `src/app/admin/companies/new/page.tsx` — client fix + DD fields

- Rename the payload keys the form sends: `existingUserEmail` → `userEmail` (existing-user case), `newUser: {name, email}` → `userEmail`/`userName` directly (new-user case) — matching the route's real field names.
- Add a "This is a due-diligence intake" toggle, shown alongside the existing "Assign User" picker (only meaningful once `assignUser !== "none"`). When on: reveal the Stellar checkbox ("This deal involves the Stellar ecosystem") and submit `dueDiligence: { isStellarEcosystem }` in the payload.
- On success, route to `/admin/diligence` (WS41) instead of `/admin/companies/${id}` when `dueDiligence` was set, since the new company won't appear on `/admin/companies` (WS38's filter) until promoted.

### WS39.3 `sendDiligenceInviteEmail()` — new template in `src/lib/email.ts`

Matches the existing helpers' structure (`emailWrapper`/`eyebrow`/`heading`/`primaryButton`/`linkFallback`) but with copy in the register of the real Lantern example — a warm "you're in, DD is next" note, not "join your team":

```ts
export async function sendDiligenceInviteEmail(opts: {
  toEmail: string;
  companyName: string;
  token: string;
}) {
  const link = `${BASE_URL}/set-password?token=${opts.token}`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `${opts.companyName} — next step: due diligence`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("We're moving forward")}
      <p style="margin: 0 0 16px;">Good news — we'd like to move ahead with an investment in <strong>${opts.companyName}</strong>. The next step is diligence: a handful of documents and a couple of quick questions, all in one place.</p>
      <p style="margin: 0 0 24px;">We've set up ${opts.companyName}'s account on Molly &mdash; the same platform you'll use to share updates with us for as long as we're working together. Set a password and you can get started right away.</p>

      <p>${primaryButton(link, "Get Started →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        This link expires in <strong>${SETUP_TOKEN_TTL_DAYS} days</strong>. Questions any time — just reply to this email.
      </p>
      ${linkFallback(link)}
    `),
  });
  assertSent(result, "diligence-invite");
}
```

**WS39 acceptance checklist**
- [ ] Ordinary "Add Company" (no `dueDiligence`) with an existing-user email assigns OWNER membership to *that user*, not the admin — confirms F32 fixed for the plain path too
- [ ] "Add Company" with a new-user email + DD toggle on → creates `Company{stage: "DILIGENCE"}`, `CompanyDiligence{isStellarEcosystem}`, `User{status: APPROVED, approvalToken, tokenExpiresAt}`, OWNER membership, sends `sendDiligenceInviteEmail`, and an audit row (`COMPANY_CREATED`, `metadata.dueDiligence: true`)
- [ ] Stellar checkbox only renders once DD mode is on; unticked by default; round-trips into `CompanyDiligence.isStellarEcosystem`
- [ ] The new founder's set-password link behaves exactly like a team-invite link — same 7-day TTL, same `canResendSetupLink()`/resend eligibility, no new code needed there
- [ ] Setting the password lands the founder on `/dashboard` with full access immediately (Q55) — confirms no new redirect/gating logic was needed
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `set-password/route.ts`, `auth.ts`, `auth-guard.ts`, `route-access.ts`

**UX impact:** admin-only. A previously-broken capability now works correctly (plain assign-user path), plus a genuinely new DD-invite capability — zero change for any existing founder, whose account-creation path is untouched. **Cost impact:** none, reuses Resend. **Schema:** none new (WS38's).

## WS40 — Founder-facing DD checklist (extended Document Types + non-blocking banner) (~1.25–1.5 day)

**Goal:** extend `DOC_TYPES` with the five new document types; build a purpose-built checklist page (not a `/setup-wizard` extension, per F31) plus a persistent, non-blocking dashboard card (Q55).

### WS40.1 `src/lib/constants.ts` — extend `DOC_TYPES`

```ts
export const DOC_TYPES = [
  { value: "pitch_deck", label: "Pitch Deck" },
  { value: "financials", label: "Financials" },
  { value: "legal", label: "Legal" },
  { value: "product", label: "Product / Demo" },
  { value: "cap_table", label: "Cap Table / Investor Docs" },
  { value: "bank_statements", label: "Bank Statements" },
  { value: "certificate_of_incorporation", label: "Certificate of Incorporation" },
  { value: "business_license", label: "Business License" },
  { value: "passport", label: "Founder Passport" },
  { value: "other", label: "Other" },
] as const;
```

No migration — `Document.docType` is already a free nullable string. Every existing document with the 5 original values renders unchanged.

### WS40.2 `GET`/`PATCH /api/companies/[id]/diligence` (new route)

`requireCompanyAccess(id)`. `GET` recomputes `completedAt` (JC-DD-F: non-null once `isUsIncorporated !== null`, at least one non-archived `passport`-typed document exists, and — when `isStellarEcosystem` — both essay fields are non-empty) and persists the recomputed value before returning the row, alongside `company.stage` for the client's own gating. `PATCH` accepts `{ isUsIncorporated?: boolean; stellarWhyText?: string; stellarTimelineText?: string }`; `completedAt`/`closedAt`/`isStellarEcosystem` are never client-writable through this route.

### WS40.3 `/diligence` founder page (new)

Standard `AppShell`/`PageHeader`/`Card` composition. Sections: the Yes/No incorporation question; the two Stellar essay `Textarea`s (rendered only when `diligence.isStellarEcosystem`); five upload rows (one per new `DOC_TYPES` value, reusing the existing two-step presigned `POST /api/documents/upload` → S3 PUT flow already used by the admin company page and the rich editor) — `passport` and `bank_statements` uploads set `isInternal: true` automatically (no founder-facing toggle; ties into WS42's enforcement), the other three default `false`. Reachable in the sidebar only while `company.stage === "DILIGENCE"` (the `useCompany()` context already spreads every `Company` field from `GET /api/companies`, so `stage` needs only a type-interface addition, no new fetch).

### WS40.4 Dashboard banner (`src/app/dashboard/page.tsx`, Q55)

A `Card` above the existing dashboard content, same conditional-render idiom as the admin Metric Alerts card — rendered only when `company.stage === "DILIGENCE"`:

```tsx
{company.stage === "DILIGENCE" && (
  <Card className="mb-6">
    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <p className="font-medium">Due diligence — a few more steps</p>
        <p className="text-sm text-muted-foreground">
          {diligenceProgress} of {diligenceTotal} required items done
        </p>
      </div>
      <Button onClick={() => router.push("/diligence")}>Continue</Button>
    </CardContent>
  </Card>
)}
```

Every other dashboard section (updates, metrics, engagement) renders completely unchanged beneath it — no gating, matching Q55.

**WS40 acceptance checklist**
- [ ] `DOC_TYPES` extended; the 5 existing values/labels and their order are unchanged (no relabeling of existing documents)
- [ ] `/diligence` reachable only while `stage === "DILIGENCE"`; sidebar item hidden otherwise
- [ ] Yes/No + Stellar essays (when applicable) PATCH and persist; reload shows saved values
- [ ] All 5 new document types upload successfully via the existing presigned-URL flow and are tagged correctly; `passport`/`bank_statements` are `isInternal: true` without any founder-visible toggle
- [ ] Dashboard banner renders only for `DILIGENCE`-stage companies, disappears on the next load once WS41 promotes the company, and every other dashboard section is pixel-identical to today beneath it
- [ ] 375px check on the new page (Pattern D wrapping form rows) and the banner (Pattern C stacking)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `set-password/route.ts`, `auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/app/lp/**`, `src/app/share/**`

**UX impact:** net-new, additive surface; zero change to any existing (non-DD) founder's dashboard — the new banner code path is a no-op for `stage !== "DILIGENCE"`, which is every company that exists today. **Cost impact:** none. **Schema:** none new (WS38's).

## WS41 — Admin DD review queue + explicit promote action (Q54, JC-DD-G) (~1–1.25 day)

**Goal:** a new admin queue (pattern-parallel to Approvals/Awaiting-setup, its own page per JC-DD-G) surfaces DD companies once the founder's checklist is complete; an explicit admin action promotes to `ACTIVE`. The decline/delete path is wired here using the existing generic confirm copy — WS43 later swaps in DD-specific wording.

### WS41.1 `GET /api/admin/diligence`

`requireAdmin`. Returns every `Company{stage: "DILIGENCE"}` with its `diligence` row and founder (name/email via `memberships`), split client-side into "Awaiting founder" (`completedAt === null`) and "Ready for review" (`completedAt !== null`) — same split idiom as the existing Approvals/Awaiting-setup page.

### WS41.2 `/admin/diligence` page (new)

Sidebar entry in the "Company Operations" group, next to Approvals (matches the existing `adminNavGroups` shape in `src/components/layout/sidebar.tsx`). Card-per-company (Pattern B wrap-row), each showing founder name/email/company name/created date and a compact "what's done" readout (incorporation answer, doc counts by type, Stellar fields present/absent); "Ready for review" cards get a "Promote" button, both sections get a "Decline" button (WS41.3 below).

### WS41.3 `POST /api/admin/diligence/[id]/promote`

`requireAdmin`. Sets `Company.stage = "ACTIVE"`, `CompanyDiligence.closedAt = new Date()`, in one transaction. Logs a new audit action `COMPANY_DILIGENCE_PROMOTED` (`metadata: { companyName, founderEmail }`). Deliberately writes nothing to `Fund`/`Deal`/`PortfolioCompany` (JC-DD-E/Q54).

### WS41.4 Decline path — reuse `DELETE /api/companies/[id]`

No new endpoint. The "Decline" button on `/admin/diligence` calls the existing `DELETE /api/companies/[id]` verbatim, with the page's existing generic confirm dialog (same component/copy as `admin/companies/[id]`'s delete). WS43 replaces this with DD-aware copy once this page exists to host it.

**WS41 acceptance checklist**
- [ ] A DD company with an incomplete checklist appears under "Awaiting founder"; once complete (per WS40's recompute-on-read), it appears under "Ready for review" with no admin action required to move it
- [ ] Promote flips `stage` to `"ACTIVE"`, sets `closedAt`, logs `COMPANY_DILIGENCE_PROMOTED`; the company appears in `/admin/companies`, the admin dashboard KPI counts, and a manual metric-alerts cron run on the very next load (proves WS38's shared filter is live end-to-end)
- [ ] The promoted company's founder dashboard banner (WS40.4) disappears on next load
- [ ] Decline deletes the company + founder account (existing cascade behavior, re-verified for this case) using the existing generic confirm copy
- [ ] Fund/Deal/PortfolioCompany rows are untouched by promote — grep + live check confirms no writes to those models anywhere in this WS's code
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `set-password/route.ts`, `auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/app/admin/approvals/**` (this queue is deliberately separate, JC-DD-G)

**UX impact:** new admin-only page; zero change to `/admin/approvals` or `/admin/companies` beyond the filter already shipped in WS38. **Cost impact:** none. **Schema:** none new.

## WS42 — `isInternal` read enforcement (F33, Q59) (~0.5 day)

**Goal:** close the pre-existing gap identified in F33 — internal-only documents are actually filtered out of founder reads — scoped exactly to the two routes identified, no broader access-model change (Q59 explicitly declined the stricter "uploader + admin only" option).

### WS42.1 `GET /api/companies/[id]/documents/route.ts`

```ts
const { user, error } = await requireCompanyAccess(id);
if (error) return error;
const isAdmin = user!.roles.includes("ADMIN");
// ...
const documents = await db.document.findMany({
  where: {
    companyId: id,
    ...(isAdmin ? {} : { isInternal: false }),
    archivedAt: archived ? { not: null } : null,
    ...(docType ? { docType } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  },
  // ...unchanged select/order
});
```

### WS42.2 `GET /api/documents/[id]/route.ts`

```ts
const { user, error } = await requireCompanyAccess(document.companyId);
if (error) return error;
if (document.isInternal && !user!.roles.includes("ADMIN")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
const downloadUrl = await getDownloadUrl(document.s3Key);
```

`PATCH` (archive/docType edit) is left exactly as-is, per Q59's explicit narrow scope — only the two read paths change.

**WS42 acceptance checklist**
- [ ] A founder `GET` on `/api/companies/[id]/documents` no longer includes `isInternal: true` rows; an admin `GET` is unchanged (all rows, including internal, still returned)
- [ ] A founder `GET` on `/api/documents/[id]` for an `isInternal: true` doc → 403; the same request from an admin session → 200 with `downloadUrl`, unchanged
- [ ] A founder `GET` on `/api/documents/[id]` for a document *they themselves uploaded* but later marked internal by an admin → still 403 (confirms this is a role check, not an uploader exception, per Q59)
- [ ] Existing non-internal document flows are unaffected — spot-check update-attachment inline images, the admin company page, and the `/api/share/[token]/doc/[docId]` proxy
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `set-password/route.ts`, `auth.ts`, `auth-guard.ts`, `route-access.ts`

**UX impact:** a real but narrow new access restriction for founders — zero visible regression today, since there is currently no founder document browser UI at all outside this Part's own WS40.3 checklist page (which only ever uploads the two most sensitive types as internal, and never lists another founder's internal uploads). **Cost impact:** none. **Schema:** none.

## WS43 — Delete-confirmation copy differentiation for DD companies (Q57 polish) (~0.25 day)

> **Corrected during implementation (F34, full detail in Part 17) — this section is the original plan, not what shipped.** The premise below ("No endpoint change") turned out to be false: `Company` deletion never cascaded to `User` in the schema, so `DELETE /api/companies/[id]` alone left a declined DD founder's account live. Flagged as a plan conflict and confirmed directly with the user before implementing (irreversible account deletion warranted explicit sign-off, not just a relayed instruction) — shipped instead as a real endpoint change in commit `6f144dd`. The acceptance checklist below reflects what actually shipped.

**Goal:** replace WS41.4's reused generic delete-confirm copy with wording specific to a non-close, since this action also deletes a real, if brand-new, founder account — not just a data row.

`/admin/diligence`'s "Decline" confirm dialog copy changes from the generic company-delete text to, e.g.: *"This deal didn't close. Deleting will permanently remove {companyName} and {founderName}'s account from Molly — this cannot be undone."* **As shipped** (not "no endpoint change" as originally planned): `DELETE /api/companies/[id]` gained a narrowly-scoped (DILIGENCE-stage only) best-effort founder-account cleanup step — see Part 17 for the full mechanism and F35, a known gap in that cleanup found during the 2026-08-03 audit. `admin/companies/[id]`'s own generic delete copy (for ordinary, non-DD companies) is untouched, confirmed by test.

**WS43 acceptance checklist (updated to reflect what actually shipped — F34)**
- [x] `/admin/diligence`'s decline confirm shows the DD-specific copy, naming both the company and the founder
- [x] `admin/companies/[id]`'s existing delete confirm copy is byte-identical to before this WS
- [x] `DELETE /api/companies/[id]` deletes the founder's `User` row too, when the company is `stage: "DILIGENCE"` and the founder has zero remaining `UserCompanyMembership` rows after the company delete (never an admin account) — regression-tested in `src/lib/__tests__/companies-delete-diligence.test.ts`
- [x] An ordinary `stage: "ACTIVE"` company delete is byte-identical to before this change (same test file, same suite)
- [ ] **Not covered by any test or explicit handling (F35, found 2026-08-03):** the founder-cleanup step's own failure mode — a `ShareableLink` (or any other required, non-cascading FK to `User`) created by the founder before decline — is caught and silently swallowed, with no signal in the `DELETE` response or the confirm copy that the account survived. See "Open findings" in Part 17.
- [x] `npm run typecheck && npm run lint && npm test` green

**UX impact:** the confirm copy is admin-facing only, as planned; the founder-cleanup addition is a real (if narrow, best-effort) new deletion behavior on an admin-only, DD-scoped path — no existing founder/admin/investor-link surface outside `/admin/diligence`'s decline action is touched. **Cost impact:** none. **Schema:** none.

---

## Part 16 sequencing, batch split & effort

**Dependency order (as requested): WS38 → WS39 → WS40 → WS41 → WS42 → WS43.** WS38 is a hard blocker for everything else (schema). WS39 and WS40 could in principle run in parallel once WS38 lands (WS39 doesn't depend on WS40, and vice versa), but WS39 first keeps the "how does a DD company come to exist at all" path verified before building the founder-facing surface that depends on it existing. WS41 needs WS40's `completedAt` recompute to have real data to queue. WS42 is fully independent of WS39–WS41 (it's a fix to existing routes) but is sequenced after the founder checklist ships since that's what makes the gap acute. WS43 needs WS41's page to exist first.

| WS | Item | Effort | Schema push | Gated on |
|---|---|---|---|---|
| WS38 | `Company.stage` + `CompanyDiligence` + shared filter | 0.5–0.75d | 1 defaulted column + 1 table | — |
| WS39 | Repaired admin invite flow (F32) + DD email | 1–1.25d | — | WS38 |
| WS40 | Founder DD checklist + extended doc types + banner | 1.25–1.5d | — | WS38, WS39 |
| WS41 | Admin review queue + promote | 1–1.25d | — | WS38, WS40 |
| WS42 | `isInternal` enforcement fix | 0.5d | — | — (independent; sequenced after WS40 by relevance) |
| WS43 | Delete-copy polish | 0.25d | — | WS41 |

**Total: ~4.5–5.5 junior-engineer days.**

**Flagged for a dedicated implementation pass rather than bundling:**
- **WS39** — touches account creation + a new transactional email path; it's also the direct fix for a real (if latent) production bug (F32), so it deserves focused review on its own rather than being folded into a larger commit.
- **WS40** — the largest single surface in this Part (new page, new route, extended doc types, dashboard banner) and the one genuinely new judgment call worth scrutiny in isolation (JC-DD-F's recompute-on-read completion logic).
- **WS42** — small diff, but it's a document-access-control change; exactly the kind of small/high-consequence change worth its own careful pass rather than being bundled where a sign-off might skim it (e.g., verifying it doesn't accidentally block the share-link doc proxy or an uploader's own document).

WS38, WS41, and WS43 are low-risk enough to bundle with an adjacent workstream if that's more efficient.

## Part 16 roadmap bookkeeping

**Done, 2026-08-03 (as part of this same audit).** All six workstreams (WS38–WS43) shipped the same day, verified against the working tree, not just the plan doc. `ROADMAP.md`'s "Planned — Part 16" blockquote has been replaced with a shipped one, folded into "Existing Features" under both Founder Features (the `/diligence` checklist + dashboard banner) and Admin Features (`/admin/diligence`, the repaired `/admin/companies/new` invite flow, the `isInternal` fix), and the top `_Last updated_` line updated — see Part 17 for the full audit note, including F34 (a mid-flight plan correction, already fixed) and F35 (a new, still-open, low-severity finding in the founder-cleanup path).

---

# Part 17 — Platform Audit (2026-08-03)

_Requested by the user: "have Felix do an audit of all we've built, point out any issues and update relevant docs." Scope, per the request: prioritize Parts 14–16 (the newest, least field-tested work) first, verified against the actual working tree — not the plan docs' own claims — then a broader pass for two specific recurring bug shapes this codebase has hit before ("sessionless client hits auth middleware," "client/API field-name mismatch"), then a docs-accuracy pass on `ROADMAP.md` and this file. This Part is the audit's paper trail; the findings below (continuing the numbering — Part 16 ended at F33) are also cross-referenced from Part 16 where they're most relevant (F34/F35) and from `ROADMAP.md`._

## Method

Every claim below was checked against the actual code (`git show`, `git log`, `Read`, `grep`), not assumed from a prior plan doc or commit message. `npm run typecheck`, `npm test` (24 files / 234 tests) run clean at audit time. No source files were changed — this Part is documentation-only, per the audit's own scope limits; two findings (F34 already-fixed, F35 open) are flagged for a future implementation pass rather than fixed here.

## Findings

**F34 — WS41/WS43's original Part 16 plan assumed `DELETE /api/companies/[id]` already deleted a declined DD founder's account. It didn't, and this was caught and corrected the same implementation session, not by this audit.** `Company` deletion has no cascading relation to `User` anywhere in `prisma/schema.prisma` — the cascade only runs from `Company` to its own child rows (`UserCompanyMembership.company onDelete: Cascade`, etc.), never onward to the `User` rows those memberships point at. An admin declining a DD deal would therefore delete the `Company` and leave a live, fully-`APPROVED` founder account behind — one that could still set a password (or already had one), log in, and self-serve-create a brand-new company via `/setup-wizard` (`POST /api/companies`'s non-admin branch has no membership-count gate — any logged-in founder can always do this, DD-declined or not). Flagged as a plan-vs-schema conflict and confirmed directly with the user before implementing, since irreversible account deletion warranted explicit sign-off rather than a silently-expanded scope. Shipped in commit `6f144dd`: `DELETE /api/companies/[id]` now additionally deletes each `DILIGENCE`-stage company's former members' `User` rows, but only when (a) the company being deleted was `stage: "DILIGENCE"` (an ordinary `ACTIVE`-company delete is byte-identical to before), (b) the member has zero remaining `UserCompanyMembership` rows after this company's own memberships cascade away (never touches someone who belongs to a real company too), and (c) the account isn't an admin's. Regression-tested in `src/lib/__tests__/companies-delete-diligence.test.ts` (both branches: cleanup fires, and cleanup correctly skips a still-elsewhere-employed founder). Verified live in the code: `prisma/schema.prisma:144-145` (`UserCompanyMembership`'s two FKs, both `onDelete: Cascade` — to `Company` and `User` respectively, which is *why* the membership row itself disappears but never triggers a `User` delete on its own).

**F35 — the F34 fix is best-effort and silently no-ops when the founder owns a row with a required, non-cascading foreign key to `User` — most reachably, a `ShareableLink` they created themselves.** `ShareableLink.createdById` (`prisma/schema.prisma:261,268`) is a required FK with no `onDelete` clause (Postgres default: the delete is rejected, not cascaded or nulled), and a `ShareableLink` is not owned 1:1 by any `Company` — it only *references* companies through the `ShareableLinkCompany` join table, whose rows do cascade away with the company, but the parent `ShareableLink` row survives with a now-dangling `createdById`. Since Part 16/Q55 gives a DD founder full, non-blocking dashboard access from day one — Investor Links included — a DD founder creating a share link for their own in-progress company before the deal falls through is a completely ordinary, expected use of the product, not an edge case. When that happens, `DELETE /api/companies/[id]`'s founder-cleanup step (`src/app/api/companies/[id]/route.ts:179-197`) throws on `db.user.delete()`, the `catch` block logs it to the server console only, and the loop moves on — the company is still deleted, the API still returns `{ success: true }`, and `logAdminAction`'s `metadata.founderAccountsDeleted` simply omits that founder's email (there is no `metadata.founderAccountCleanupFailed` or equivalent signal). Meanwhile `/admin/diligence`'s confirm dialog (`src/app/admin/diligence/page.tsx:186-189`) unconditionally states *"Deleting will permanently remove {companyName} and {founderName}'s account from Molly — this cannot be undone,"* which is not true in this case: the founder's account survives, indefinitely, with no admin-visible indication that it did. This is exactly the failure mode F34's fix set out to close (a live, orphaned, self-serve-capable founder account after a decline) — reopened in one specific, product-legitimate, non-adversarial path. Severity: low (requires an admin to decline a deal *after* its founder has already used Investor Links, a narrow window; no data exposure, no privilege escalation, just an account that outlives its company) but real and easy to hit in DFS Lab's actual usage pattern once DD founders start using Molly day-to-day per this Part's whole premise. Not fixed by this audit (documentation-only scope) — flagged as a candidate for a small follow-up workstream:
- Cheapest fix: have the `DELETE` route return which founder emails were *not* cleanably removed (e.g. `{ success: true, founderAccountsDeleted: [...], founderAccountsRetained: [...] }`) and have `/admin/diligence` show a second, honest message when that array is non-empty ("{company} was deleted. {founder}'s account could not be automatically removed — it still has other data attached (e.g. an investor link they created) and needs manual cleanup.") rather than silently degrading.
- A more complete fix would delete or reassign the founder's dangling `ShareableLink`(s) as part of the same cleanup pass before attempting the `User` delete, but that has its own product question (do the link's views/history matter to anyone once its only company is gone?) worth a quick discuss-first round, not a silent auto-delete.
- No schema change needed either way.

## Verification against Parts 14–16's own claims (not just this session's new findings)

Read the real code for every major claim in Parts 14–16, not just the plan text:
- **Part 14 (Fund Performance Snapshot):** `computeFundPerformance()`/`buildFundReportSnapshot()` exist in `src/lib/portfolio-metrics.ts` exactly as WS33 describes; the admin-only-wall grep guard holds (`src/app/lp/reports/[id]/page.tsx` imports only the `FundSnapshotPayload` *type*, never the compute functions, and only ever reads the already-frozen `fundSnapshot` relation scoped to `report.fundId`); the three live, already-shipped fixes referenced in `ROADMAP.md` (leftover placeholder text surviving the portal — commit `d0d06fa`; draft reports always showing "0 mentions" — commit `602bae5`; the admin-only methodology caveat leaking to LPs — commit `bf8c537`) are all real, verified fixes matching their commit messages, not just claimed ones.
- **Part 15 (per-fund override):** `Fund.grossMoicOverride`/`netTvpiOverride`/`netDpiOverride` are live in `prisma/schema.prisma`; `FundPerformanceCard`'s override branch (`src/components/fund-performance-card.tsx`) matches the JC-B "at least one field" contract exactly; the publish route, the preview route, and `fund-snapshot-block.tsx` all thread the override through as documented; `computeFundPerformance()`'s own signature is untouched (grep-confirmed — the override never reaches the pure metrics engine).
- **Part 16 (DD intake):** all six workstreams (WS38–WS43) are shipped, each in its own commit, all dated 2026-08-03. `Company.stage`/`CompanyDiligence` are live in the schema; the shared `approvedCompanyFilter` (`src/lib/company-filters.ts`) is used in all three call sites the plan named, with its own test file; the F32 field-name fix has a dedicated regression test (`companies-post-diligence.test.ts`, "an existing-user email assigns OWNER membership to that user, not the admin"); the F33 `isInternal` enforcement is live and well-tested (`document-internal-access.test.ts`, 7 cases including the "still 403s the uploader" role-check distinction Q59 asked for); `/diligence`, `/admin/diligence`, and the dashboard banner are all wired to `company.stage === "DILIGENCE"` correctly, including the sidebar entries in both nav lists.

No discrepancy was found between what Parts 14–16 claim shipped and what the working tree actually contains, other than the F34/F35 pair above (which is itself a *plan* discrepancy, already substantially self-corrected before this audit ran).

## Bug-pattern sweep (per the audit's specific request)

Two bug shapes have recurred repeatedly in this codebase's history: **"a sessionless client hits session-gated auth middleware"** (`/api/cron`, `/brand`, `/api/share`, inline update images, `/lp`) and **"the client posts field names the API doesn't read"** (F32, this Part). Both were checked for new instances:

- **Sessionless-client pattern:** `src/lib/route-access.ts`'s `PUBLIC_PREFIXES` list and its own extensive inline comments already document every known instance and the reasoning for each. Parts 14–16 introduce no new public/no-session surface — `/diligence` and `/admin/diligence` are both ordinary authenticated founder/admin routes gated the normal way (`requireCompanyAccess`/`requireAdmin`), and the LP/share surfaces are untouched (grep-confirmed: `computeFundPerformance`/`buildFundReportSnapshot` never imported under `src/app/lp/**` or `src/app/api/share/**`, per Part 14's own ground rule 1). No new instance found.
- **Field-name-mismatch pattern:** besides the already-fixed F32, spot-checked the closest-shaped call sites across the app — `POST /api/companies/[id]/members/invite` (both callers, `team/page.tsx` and `admin/companies/[id]/page.tsx`, send `{email, role}` matching the route exactly), `POST /api/admin/lps/[id]/funds` (`{fundId}` matches on both sides) — no mismatch found. This was a targeted spot-check of the highest-risk-shaped call sites (admin-initiated create/assign flows, the same shape as F32), not an exhaustive sweep of all ~28 `fetch(...)` call sites in the app; a genuinely exhaustive sweep would be its own small workstream if ever wanted.

## Documentation staleness found and corrected in this same edit

- **`ROADMAP.md`'s "Planned — Part 16" blockquote** replaced with a shipped one (Part 16 is fully shipped as of 2026-08-03), matching the pattern used for every prior Part; Founder Features and Admin Features both gained a bullet for the new surfaces; the top `_Last updated_` line updated.
- **`ROADMAP.md`'s Setup Wizard bullet claimed a working 3-step flow** ("company profile → metric definitions → document upload") without ever surfacing F31 (found 2026-08-02, during Part 16's own discovery pass, but never folded into `ROADMAP.md` itself) — step 3's file input has no `onChange` handler and silently uploads nothing. Annotated in place; this affects every self-signup founder, not just the DD population, and is flagged above as a small candidate fix (reuse the same presigned-upload flow WS40 already built for the DD checklist).
- **`ROADMAP.md`'s "Test coverage remains narrow..." line**, written 2026-07-03 to describe that day's state, read as a present-tense claim to anyone reading it today. The suite has grown from the 3 files it described then to 24 files / 234 tests (portfolio metrics, sheet sync, LP auth, document access control, the full DD-flow regression suite, and more) as of this Part. Annotated in place rather than rewritten, matching this doc's own convention (e.g. F21's annotation of a stale `ROADMAP.md` claim) — the underlying caveat (still not whole-app/component/e2e coverage) remains true even though the specific historical numbers are now stale.
- No other false "shipped" or false "planned" claims were found in `ROADMAP.md`'s "Existing Features" or "Roadmap" sections during this pass — every other Part's shipped-date and scope claims matched a real, dated commit.

## What's next

F35 is the only unresolved item from this audit — a candidate for a small (~0.25–0.5 day) follow-up workstream per the sketch above, not urgent (low severity, narrow trigger condition) but cheap to fix and worth doing before DD-founder volume grows. Nothing else in this audit rose to the level of a recommended workstream; Parts 14–16 are solid, well-tested, and match their own documentation once the corrections above are applied.

---

# Part 18 — Due Diligence Completion Signal (F36, WS44)

_Added 2026-08-04, from a real founder hitting exactly this gap: their `/diligence` checklist showed 4 of 4 required items done, but the dashboard banner still read "a few more steps," `/diligence` itself never distinguished a complete state, and no notification of any kind reached anyone — Joseph found out only because the founder emailed asking if it was a bug. Diagnosed by Joseph and verified line-by-line by Felix against the working tree before any recommendation was made. Decisions Q61–Q64 answered by the user 2026-08-04, every Felix recommendation accepted. **This Part is planning only — no code has shipped.** Same hard constraints as every prior Part: no new cost lines (Resend only, already in use for every other transactional email), no UX regressions, additive-only changes — this Part touches zero schema._

## What this Part is

Three linked gaps in Part 16's DD intake flow (WS38–43), all confirmed against the live code:

1. **No completion-state branch anywhere.** The dashboard banner (`src/app/dashboard/page.tsx:194-207`) and `/diligence`'s status line (`src/app/diligence/page.tsx:219-222`) both render the exact same copy at 0-of-N and N-of-N done — neither reads `diligence.progress.done === diligence.progress.total` nor `completedAt`.
2. **No closure moment.** By WS40's own design (JC-DD-F — recompute-on-read completion, no explicit founder submit step), there has never been a Submit button in this flow. The founder came from DFS's old Google Form, which did have one, so "I don't see a submit button" wasn't user confusion — the affordance genuinely doesn't exist here, and no equivalent closure moment was ever added in its place.
3. **No notification fires to anyone.** The only email anywhere in this flow is the one-time `sendDiligenceInviteEmail` (WS39), sent once at invite time. `/admin/diligence` already segments "Ready for review" from "Awaiting founder" (`src/app/admin/diligence/page.tsx:143-144, 270-296`) — so a completed item doesn't blend into an undifferentiated list, contrary to how this was first described — but the page is still pull-based: nothing prompts an admin to go check it.

## Decisions Q61–Q64 — all answered by the user 2026-08-04 (every recommendation accepted)

> **Q61 (copy)** — the user's own wording, not Felix's first draft: banner headline **"All done!"** / subtext **"We are reviewing your documents and will be in touch soon."** The same full line doubles as `/diligence`'s complete-state message.
> **Q62 (banner button)** — relabel "Continue" → **"View"** once complete; still navigates to `/diligence` (documents and answers stay editable after completion, unchanged from today — no new lock-out behavior).
> **Q63 (founder confirmation email)** — **send it.** Felix's strongest recommendation, confirmed: since there is no Submit button, an email fired at the exact moment the system detects completion is the only confirmation surface that doesn't depend on the founder ever returning to the page — which is the most likely explanation for how this founder finished and saw nothing at all.
> **Q64 (admin notification recipient)** — **`TEAM_EMAIL`**, matching the existing `sendNewSignupNotification`/`sendUpdatePublishedEmail` pattern exactly, not the specific admin from `Company.createdById`. Cheap to change later (a single `to:` line) if DFS Lab ever wants per-admin routing.

## Part 18 technical judgment calls (flagged per protocol — each with a cheap reversal)

- **JC-DD-H — the notification fires on the DB-persisted `completedAt` null→non-null transition, detected in the route handler, not inside `recomputeDiligenceCompletion` itself.** Both `GET` and `PATCH` in `src/app/api/companies/[id]/diligence/route.ts` already fetch the pre-recompute `completedAt` (`company.diligence.completedAt` in `GET`, `existing.completedAt` in `PATCH`) before calling `recomputeDiligenceCompletion` — comparing that value to the freshly recomputed one is a two-line addition per handler with **zero change to `recomputeDiligenceCompletion`'s signature, behavior, or existing tests** in `src/lib/diligence.ts`. This also settles the double-notify question raised during discussion: `recomputeDiligenceCompletion` (`src/lib/diligence.ts:106-137`) already resets `completedAt` to `null` on any incomplete recompute and assigns a *fresh* timestamp on re-completion, so a founder who flips complete → incomplete → complete (e.g., archiving and re-uploading a passport) produces a genuine second null→non-null transition — correctly notifying again, not a bug to guard against. A same-state reload (the common case — revisiting `/diligence` or `/dashboard` after completion) never re-fires, since the pre-recompute value already equals the post-recompute value. Reversal: trivial, it's an `if` guard around two `.catch()`'d email calls.
- **JC-DD-I — the founder confirmation targets whichever non-admin user's request actually triggered the transition** (`user.email`/`user.name`, already returned by `requireCompanyAccess`), not a stored "founder" field resolved via the company's `OWNER` membership. Correctly attributes a teammate's completing action too (Q55 already gives every DD-stage company normal team-invite access), and suppresses the email outright when an admin session is what triggered the recompute (an admin manually exercising the API — e.g. during testing — shouldn't generate a "you're all set" email to themselves). Reversal: swap to an explicit `OWNER`-membership lookup later if this guard ever proves wrong in practice.
- **JC-DD-F is reaffirmed, not reopened.** Recompute-on-read completion stays exactly as WS40 built it — this Part adds copy and notifications on top of the existing signal, it does not add a Submit step. The reasoning from Part 16 still holds and is stronger now: an explicit Submit button doesn't fix the failure mode this founder actually hit (closing the tab immediately after their last upload, before ever seeing any post-completion UI) — it just relocates the same problem to a button the founder still has to notice and return to click. An email fired the instant the system detects completion is unconditional on the founder ever revisiting the page, which a Submit button is not.

## WS44 — Due diligence completion: copy, banner, and email notifications (F36, Q61–Q64) (~0.5–0.75 day)

**Goal:** close all three gaps above without reopening JC-DD-F — honest completion-state copy on both existing surfaces, and two new transactional emails fired exactly once per real completion event.

### WS44.1 `src/app/api/companies/[id]/diligence/route.ts` — completion-transition notification hook

Both `GET` and `PATCH` already call `recomputeDiligenceCompletion` and already discard the `user` half of `requireCompanyAccess`'s return — start keeping it, and add one small shared helper plus a two-line call at each existing recompute site:

```ts
import {
  sendDiligenceCompletedAdminNotification,
  sendDiligenceCompletedFounderEmail,
} from "@/lib/email";

// F36/WS44 (JC-DD-H/I) — fires the two completion emails exactly once, at
// the DB write that flips completedAt from null to non-null. Never
// awaited on the response — same fire-and-forget convention as
// sendDiligenceInviteEmail (WS39).
function notifyIfJustCompleted(opts: {
  wasComplete: boolean;
  completedAt: Date | null;
  companyId: string;
  companyName: string;
  user: { email: string; name: string | null; roles: string[] };
}) {
  if (opts.wasComplete || !opts.completedAt) return; // not a fresh completion
  if (opts.user.roles.includes("ADMIN")) return; // JC-DD-I

  sendDiligenceCompletedFounderEmail({
    toEmail: opts.user.email,
    founderName: opts.user.name,
    companyName: opts.companyName,
  }).catch((err) => console.error("Failed to send diligence-completed founder email:", err));

  sendDiligenceCompletedAdminNotification({
    companyName: opts.companyName,
    founderName: opts.user.name,
    founderEmail: opts.user.email,
  }).catch((err) => console.error("Failed to send diligence-completed admin notification:", err));
}
```

`GET` — keep `user`, add `name: true` to the existing `company` select, capture the pre-recompute value, call the helper after recompute:

```ts
const { user, error } = await requireCompanyAccess(id);
if (error) return error;

const company = await db.company.findUnique({
  where: { id },
  select: { name: true, stage: true, diligence: true },
});
if (!company || !company.diligence) return NextResponse.json({ error: "Not found" }, { status: 404 });

const hasPassportDocument = await hasActivePassportDocument(id);
const wasComplete = !!company.diligence.completedAt;
const completedAt = await recomputeDiligenceCompletion(id, company.diligence, hasPassportDocument);
notifyIfJustCompleted({ wasComplete, completedAt, companyId: id, companyName: company.name, user: user! });
```

`PATCH` — same shape; `existing` needs the parent company's name, so its query grows one `include`:

```ts
const { user, error } = await requireCompanyAccess(id);
if (error) return error;

const existing = await db.companyDiligence.findUnique({
  where: { companyId: id },
  include: { company: { select: { name: true } } },
});
if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

// ...unchanged body parsing / db.companyDiligence.update...

const hasPassportDocument = await hasActivePassportDocument(id);
const wasComplete = !!existing.completedAt;
const completedAt = await recomputeDiligenceCompletion(id, updated, hasPassportDocument);
notifyIfJustCompleted({ wasComplete, completedAt, companyId: id, companyName: existing.company.name, user: user! });
```

No change to either route's response shape — `completedAt`/`progress`/`documents` are returned exactly as today.

### WS44.2 `src/lib/email.ts` — two new templates

Same structural conventions as every existing helper (`emailWrapper`/`eyebrow`/`heading`/`fieldRow`/`primaryButton`/`assertSent`), copy built around the user's confirmed wording (Q61):

```ts
export async function sendDiligenceCompletedFounderEmail(opts: {
  toEmail: string;
  founderName: string | null;
  companyName: string;
}) {
  const link = `${BASE_URL}/diligence`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `${opts.companyName} — all done!`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("All done!")}
      <p style="margin: 0 0 16px;">Hi${opts.founderName ? ` ${opts.founderName.split(" ")[0]}` : ""},</p>
      <p style="margin: 0 0 24px;">We are reviewing your documents and will be in touch soon. Thanks for getting everything in for <strong>${opts.companyName}</strong> &mdash; your documents and questionnaire are both complete.</p>

      <p>${primaryButton(link, "Review Your Submission →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        Need to change something? You can still update your answers or replace a document any time before we're done reviewing.
      </p>
    `),
  });
  assertSent(result, "diligence-completed-founder");
}

export async function sendDiligenceCompletedAdminNotification(opts: {
  companyName: string;
  founderName: string | null;
  founderEmail: string;
}) {
  const link = `${BASE_URL}/admin/diligence`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: TEAM_EMAIL,
    subject: `Diligence complete: ${opts.companyName}`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("Ready for review")}
      <p style="margin: 0 0 24px;">${opts.founderName || opts.founderEmail} has finished ${opts.companyName}'s diligence checklist &mdash; documents and questionnaire are both in.</p>

      <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px; width: 100%;">
        ${fieldRow("Company", opts.companyName)}
        ${fieldRow("Founder", opts.founderName ? `${opts.founderName} (${opts.founderEmail})` : opts.founderEmail)}
      </table>

      ${primaryButton(link, "Review Diligence →")}
    `),
  });
  assertSent(result, "diligence-completed-admin");
}
```

### WS44.3 Dashboard banner (`src/app/dashboard/page.tsx`, Q61/Q62)

`DiligenceSummary` (line 35-37) gains `completedAt: string | null` — already returned by the API today, just untyped client-side. The banner branches on it:

```tsx
{company.stage === "DILIGENCE" && (
  <Card className="mb-6">
    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <p className="font-medium">
          {diligence?.completedAt ? "All done!" : "Due diligence — a few more steps"}
        </p>
        <p className="text-sm text-muted-foreground">
          {diligence?.completedAt
            ? "We are reviewing your documents and will be in touch soon."
            : diligence
              ? `${diligence.progress.done} of ${diligence.progress.total} required items done`
              : "Documents and a couple of quick questions before we close."}
        </p>
      </div>
      <Button onClick={() => router.push("/diligence")}>
        {diligence?.completedAt ? "View" : "Continue"}
      </Button>
    </CardContent>
  </Card>
)}
```

### WS44.4 `/diligence` page (`src/app/diligence/page.tsx`, Q61)

The status line (219-222) branches the same way, reusing the already-imported `CheckCircle2`/`ClipboardCheck` and the same `text-acacia` success color already used by this page's own save-confirmation banner (232-233):

```tsx
<div className="mb-6 flex items-center gap-2 text-sm">
  {diligence.completedAt ? (
    <>
      <CheckCircle2 className="h-4 w-4 text-acacia" />
      <span className="text-acacia">All done! We are reviewing your documents and will be in touch soon.</span>
    </>
  ) : (
    <>
      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">
        {diligence.progress.done} of {diligence.progress.total} required items done
      </span>
    </>
  )}
</div>
```

Every section below (the answers form, the document list) is unchanged and stays fully editable post-completion, per Q62.

**WS44 acceptance checklist**
- [ ] Completing the last required item (via `PATCH`, e.g. the incorporation answer) fires both new emails exactly once; the response shape is otherwise byte-identical to today
- [ ] Completing the last required item via a document upload (which reloads through `GET`) also fires both emails exactly once — confirms both trigger paths are covered, not just one
- [ ] Reloading `/diligence` or `/dashboard` any number of times after completion fires no further emails (same-state `GET`s are a no-op)
- [ ] Archiving/re-uploading a passport so the checklist genuinely goes incomplete → complete again fires both emails a second time — confirmed intentional per JC-DD-H, not treated as a bug
- [ ] An admin session hitting either route (e.g. manual testing) never sends the founder confirmation email, per the JC-DD-I guard
- [ ] Dashboard banner and `/diligence`'s status line both show the confirmed Q61 copy once `completedAt` is set, and the pre-completion copy is pixel-identical to today otherwise
- [ ] Banner button reads "View" once complete (Q62), still routes to `/diligence`, and every field on that page remains editable post-completion
- [ ] 375px check on both surfaces (Pattern C stacking for the banner, existing layout for the status line — no new wrapping risk introduced)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `set-password/route.ts`, `auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/app/lp/**`, `src/app/share/**`; `recomputeDiligenceCompletion`'s exported signature in `src/lib/diligence.ts` is unchanged (JC-DD-H)

**UX impact:** additive/corrective only. Every existing non-DD founder's dashboard is untouched (the branch is a no-op for `stage !== "DILIGENCE"`, unchanged from WS40). For DD-stage founders specifically, this replaces confusing/stale copy with an honest one and adds two emails that fire at most once per real completion event — no new gate, no new required action, nothing that can block or slow down an existing flow. **Cost impact:** none — reuses Resend, the same provider already sending 12 other templates; volume is at most 2 emails per DD company, once, ever (barring a genuine re-completion after an incomplete gap). **Schema:** none.

## Part 18 roadmap bookkeeping

Once WS44 ships: fold it into `ROADMAP.md`'s existing "Due Diligence checklist" bullet under Founder Features (the completion copy) and "Pre-Investment Due Diligence Intake" bullet under Admin Features (the admin notification) rather than adding new bullets, since this is a fix to an already-shipped Part 16 surface, not a new feature; update the top `_Last updated_` line. Until then, `ROADMAP.md` carries a `Planned` forward-pointer blockquote (added in this same edit) rather than a shipped claim, matching the exact convention used for Part 16 before it shipped.

---

# Part 19 — Inline Document Viewing (F37, F38, WS45)

_Requested by Joseph 2026-08-04: founders/admins can't view an uploaded document inline in the app — every document click forces a browser Save-As dialog, even for PDFs/images the browser could render natively. Joseph diagnosed the root cause himself (no code) and asked for a plan that **adds** inline viewing without removing the existing download capability: "The idea is to be both able to view and download the docs." Diagnosis re-verified line-by-line against the working tree before any of it was trusted — two real gaps beyond Joseph's own diagnosis surfaced during that re-verification (F37, F38 below). **This Part is planning only — no code has shipped.**_

## Method

Every claim in Joseph's diagnosis was re-checked against the actual code, not assumed:

- **Confirmed exactly as diagnosed:** `src/app/admin/companies/[id]/page.tsx`'s `handleDownload` (lines 528–543) is the only forced-download call site in the app — grepped `handleDownload`, `\.download = `, and `createElement("a")` across `src/app` and `src/components`; nothing else matches. It fetches `GET /api/documents/{id}`, then builds a synthetic `<a>` with a `download` attribute and calls `.click()`. The HTML `download` attribute unconditionally forces Save-As regardless of content type.
- **Confirmed exactly as diagnosed:** `src/lib/s3.ts`'s `getDownloadUrl()` (lines 40–47) sets no `ResponseContentDisposition` on the `GetObjectCommand`, and `getUploadUrl()` sets no `ContentDisposition` on the `PutObjectCommand` either — nothing at the storage layer forces a download. Grepped `Content-Disposition`/`ResponseContentDisposition` across `src/app/api/documents` and `src/lib`: zero matches. This is purely a client-side `download` attribute problem.
- **Confirmed exactly as diagnosed:** `src/app/api/documents/[id]/view/route.ts` already exists, already does `requireCompanyAccess`, and already 302-redirects to the same kind of presigned URL — built for inline `<img>` rendering in the rich-text editor (its own comment says so), reachable and reusable as-is for a "View" action.
- **Confirmed as flagged, and it is real: `/view` has no `isInternal` enforcement** (Joseph's point 3). `src/app/api/documents/[id]/route.ts` (the download-metadata route) got this fix in Part 16/WS42 (F33) — `document.isInternal && !user!.roles.includes("ADMIN")` → 403 — but `/view` was never touched. Today this is low-severity (nothing links to `/view` for arbitrary documents yet, only embedded `<img>` tags the founder/admin already has legitimate access to render), but it becomes a real, this-workstream-created hole the moment a "View" button is wired to it — **fixed as part of WS45, not deferred**, exactly like WS42 bundled the fix with the feature it would otherwise have widened. This is **F37**, continuing the numbering from Part 18 (F36).
- **Founder document surfaces, checked, not assumed:**
  - `src/app/company/profile/page.tsx` — grepped for `document`/`Document`/`s3Key`/`download`: zero matches. Confirmed founders have no company-level document browser at all (only admins do, via `/admin/companies/[id]`'s Documents tab).
  - `src/lib/diligence.ts`'s `getDdDocumentSummary()` (lines 60–96) — confirmed by reading the code and its own comment: name + upload date only, no `s3Key`, no download link, by deliberate WS42-era design (a founder's own DD-checklist page reads a narrower, admin-`isInternal`-filter-safe summary, not the general document browser). Out of scope for this Part — nothing to view/download there because nothing links to a file at all, and widening that surface is a separate product decision, not implied by "add viewing to what already has downloading."
  - LP/share surfaces (`src/app/share/[token]/page.tsx`, `src/app/lp/reports/[id]/page.tsx`, `src/components/report-view.tsx`) — grepped for `documents`/`Attachments`/`Paperclip`/`s3Key`: zero matches outside the already-shipped `rewriteDocumentUrls()` inline-image-in-update-body proxy (`src/app/api/share/[token]/doc/[docId]/route.ts`, F16). Confirmed: no LP-facing surface renders a document list or a download/view link of any kind. Nothing to change here.
- **New finding, not in Joseph's diagnosis — F38: a second, previously-unnoticed forced-download-adjacent surface exists, and it has its own `isInternal` gap.** `src/app/updates/[id]/page.tsx` (the shared founder+admin update-detail page — not under `/admin`, reachable by whichever role has `requireCompanyAccess` to that update's company) renders an "Attachments" list (lines 665–699) with document name, type badge, and size — but **no `href`, no `onClick`, nothing clickable at all.** It's not a forced-download bug like the admin company page; it's worse — completely inert. Separately, `GET /api/updates/[id]/route.ts`'s `documents` include (lines 83–94) selects `isInternal: true` from the DB, but the `GET` handler discards the `user` half of `requireCompanyAccess`'s return (`const { error } = await requireCompanyAccess(...)`, line 55) and the list is never filtered by it — the exact WS42/F33 gap shape, on a route WS42 never touched. Today this leaks only metadata (name/type/size of an internal-only document, if one is ever attached to an update — reachable, since `POST /api/documents/upload` accepts both `updateId` and `isInternal` from any caller with `requireCompanyAccess`, not just admins) to a non-admin founder viewing that update — no file content, since nothing is clickable yet. It becomes a real content-access hole the instant this Part adds View/Download links to that list, so **it must be fixed in the same workstream**, exactly like F37. Aside: the client-side `UpdateDetail.documents` TypeScript interface (line 69) also declares a `s3Key: string` field the API never actually selects or returns — dead type noise, not a real leak (worth deleting while touching this file, not worth its own finding).

## Decisions made without a Joseph fork (small technical judgment calls, each cheaply reversible)

Per house protocol, these are calls a competent implementer can make directly rather than product forks — flagged here so they're visible, with the reversal path if wrong:

- **JC-VD-A — "View" is conditional on MIME type, not always shown.** Joseph's own framing ("does the View action need to be conditional... or is it fine to gracefully degrade") plus the real data (`mimeType` is a required, lowercased field on every upload since `POST /api/documents/upload` was built — `src/app/api/documents/upload/route.ts:28-33`; only pre-that-era rows could have `mimeType: null`) makes conditional the obvious answer: showing a "View" button that opens a blank tab or force-downloads anyway for a `.docx`/`.zip`/`.pptx` is worse than not showing it, and Joseph explicitly said browsers "will just try to download it anyway or show a blank tab" for those types. **Reversal:** the allowlist is a single exported array in one new file — trivially widened.
- **JC-VD-B — the inline-viewable allowlist ships as PDF + the four raster image types only** (`application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`), matching Joseph's own "PDF/image at minimum" framing exactly and `ALLOWED_UPLOAD_TYPES`'s (`src/lib/constants.ts:26-43`) existing image subset. `text/plain` and `video/mp4`/`video/quicktime` render inline in most browsers too but weren't asked for and have less consistent cross-browser behavior (Safari-only reliable `.mov` playback) — left out of v1 rather than guessed at. **Reversal:** add entries to the same array; zero other code changes.
- **JC-VD-C — "View" opens the existing `/view` redirect in a new tab via a plain `<a target="_blank" rel="noopener noreferrer">`, not a new in-app modal/lightbox.** No new UI component, no new client-side state, and it's exactly what `/view` already does today for the rich-editor `<img>` case (redirect straight to the presigned URL, browser renders natively) — reusing rather than reimplementing. The codebase's one other "Eye = view" icon precedent (`admin/reports/[id]/page.tsx`'s Preview button) navigates same-tab to an in-app preview *page*, which doesn't apply here (there's no equivalent in-app document-preview page, and building one is a materially bigger, unrequested feature). **Reversal:** swap the anchor for a modal later without touching the `/view` route or the access-control fix.
- **JC-VD-D — the update-detail Attachments list (F38's surface) does not grow an "Internal"/"Shared" visibility badge in this Part**, even though admins viewing that list can now see `isInternal` docs (the standalone admin document browser already has this badge). Not asked for, and the server-side filter already makes it safe for non-admins (they never receive internal rows at all) — the badge is a pure nice-to-have. **Reversal:** cheap follow-up, same pattern as the existing badge in `admin/companies/[id]/page.tsx`.

## WS45 — Inline document viewing, plus the `isInternal` gaps it would otherwise widen (F37, F38) (~0.75–1 day)

**Goal:** add a "View" action (opens inline in a new tab, conditional on a known-renderable MIME type) alongside the existing "Download" action everywhere a document row is already clickable-or-should-be, without changing existing download behavior — and close F37/F38 first, so this Part doesn't ship a new way to leak internal-only document content to non-admins.

### WS45.1 `src/lib/documents.ts` (new) — the shared, testable viewability rule

```ts
// Part 19, WS45 — single source of truth for "can a browser render this
// inline," so the admin company page and the update-detail attachments
// list can't drift. Deliberately narrower than ALLOWED_UPLOAD_TYPES
// (src/lib/constants.ts) — every uploadable type is accepted, not every
// uploadable type renders inline. See Part 19 JC-VD-B for what's excluded
// and why (text/plain, video) — cheap to widen later.
const INLINE_VIEWABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isInlineViewable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return INLINE_VIEWABLE_MIME_TYPES.has(mimeType.toLowerCase());
}
```

Unit test (`src/lib/__tests__/documents.test.ts`, new): PDF/PNG/JPEG/GIF/WebP → true; `.docx`/`.zip`/`.pptx`/`video/mp4` → false; `null`/`undefined`/empty string → false; case-insensitivity (`"IMAGE/PNG"` → true, matching the existing lowercasing convention in `POST /api/documents/upload`).

### WS45.2 `src/app/api/documents/[id]/view/route.ts` — close F37

```ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      select: { s3Key: true, companyId: true, isInternal: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { user, error } = await requireCompanyAccess(document.companyId);
    if (error) return error;

    // Part 19, WS45 (F37) — same role check WS42/F33 gave the metadata
    // route; /view had never gotten it. A role check, not an uploader
    // exception, matching that precedent exactly.
    if (document.isInternal && !user!.roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = await getDownloadUrl(document.s3Key);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("GET /api/documents/[id]/view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### WS45.3 `src/app/api/updates/[id]/route.ts` — close F38

`GET` handler: keep `user` (currently discarded), filter the `documents` include exactly like WS42.1 filtered `GET /api/companies/[id]/documents`:

```ts
const { user, error } = await requireCompanyAccess(update.companyId);
if (error) return error;

const isAdmin = user!.roles.includes("ADMIN");

const fullUpdate = await db.update.findUnique({
  where: { id },
  include: {
    // ...company, comments unchanged...
    documents: {
      where: isAdmin ? {} : { isInternal: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        isInternal: true,
        docType: true,
        createdAt: true,
      },
    },
    // ...metricValues, createdBy unchanged...
  },
});
```

No route response-shape change for the common case (no internal docs attached) — purely additive filtering, matching WS42.1's own framing.

### WS45.4 `src/app/admin/companies/[id]/page.tsx` — View action on the existing document row

Add `Eye` to the `lucide-react` import list, add `isInlineViewable` import, add a View link before the existing Download button in the row's action cell (lines 1276–1298 today):

```tsx
<div className="flex items-center gap-2">
  {isInlineViewable(doc.mimeType) && (
    <a
      href={`/api/documents/${doc.id}/view`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-primary"
      title="View"
    >
      <Eye className="h-4 w-4" />
    </a>
  )}
  <button
    onClick={() => handleDownload(doc.id, doc.name)}
    className="text-muted-foreground hover:text-primary"
    title="Download"
  >
    <Download className="h-4 w-4" />
  </button>
  {/* existing Archive/Unarchive button, unchanged */}
</div>
```

`doc.mimeType` is already fetched into the `documents` state (`interface` at line ~94 already has `mimeType: string | null`) — no API/type change needed on this page. `handleDownload` (lines 528–543) is untouched.

### WS45.5 `src/app/updates/[id]/page.tsx` — make the Attachments list actually clickable (F38's UI half)

Add `Eye` to the `lucide-react` import list, import `isInlineViewable`, add a `handleDownloadDoc` function (same fetch-then-synthetic-`<a>` pattern as the admin page's `handleDownload`, reusing the existing `message`/`setMessage` state already on this page), remove the dead `s3Key: string` line from the `UpdateDetail.documents` client interface, and wire both actions onto each `<li>`:

```tsx
async function handleDownloadDoc(docId: string, docName: string) {
  try {
    const res = await fetch(`/api/documents/${docId}`);
    if (!res.ok) throw new Error("Failed to get download link");
    const data = await res.json();
    const a = document.createElement("a");
    a.href = data.downloadUrl;
    a.download = docName;
    a.click();
  } catch (err) {
    setMessage({
      type: "error",
      text: err instanceof Error ? err.message : "Download failed.",
    });
  }
}
```

```tsx
<li key={doc.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
  <FileText className="h-4 w-4 text-muted-foreground" />
  <div className="min-w-0 flex-1">
    {/* ...existing name/badge/size markup, unchanged... */}
  </div>
  <div className="flex items-center gap-2">
    {isInlineViewable(doc.mimeType) && (
      <a
        href={`/api/documents/${doc.id}/view`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-primary"
        title="View"
      >
        <Eye className="h-4 w-4" />
      </a>
    )}
    <button
      onClick={() => handleDownloadDoc(doc.id, doc.name)}
      className="text-muted-foreground hover:text-primary"
      title="Download"
    >
      <Download className="h-4 w-4" />
    </button>
  </div>
</li>
```

`Download` is already imported on this page (used by the "Download PDF" whole-update button) — reused, not re-imported.

### WS45.6 Tests

- `src/lib/__tests__/documents.test.ts` (new) — `isInlineViewable`, per WS45.1.
- Extend `src/lib/__tests__/document-internal-access.test.ts` (or a new sibling file — Alvin's call) with F37/F38 cases, mirroring the existing suite's exact style:
  - `GET /api/documents/[id]/view` 403s a non-admin on an `isInternal` document, 200s (redirects) for an admin, 200s for a non-admin on a non-internal document, still 404s a missing document before the check runs.
  - `GET /api/updates/[id]` — a founder's `documents` include has `isInternal: false` in its `where`; an admin's has no `isInternal` filter at all (same assertion shape as the existing `GET /api/companies/[id]/documents` test).

## WS45 acceptance checklist

- [ ] `isInlineViewable()` unit tests pass for the full allowlist plus the negative cases (unknown type, null, case-insensitivity)
- [ ] Admin company page: a PDF/PNG/JPEG/GIF/WebP document row shows both View and Download icons; a `.docx`/`.zip`/other row shows Download only
- [ ] Update-detail Attachments list (both a founder's own update and an admin viewing it): same View/Download behavior as above — previously fully inert, now both actions work
- [ ] Clicking View opens the document in a new tab, rendered inline (not a Save-As prompt) for every allowlisted type
- [ ] Clicking Download still forces Save-As exactly as before on both pages — zero regression to existing behavior
- [ ] `GET /api/documents/[id]/view` 403s a non-admin requesting an `isInternal` document; still 302-redirects correctly for the rich-editor `<img>` case and for admins
- [ ] `GET /api/updates/[id]`'s `documents` list excludes `isInternal` rows for a non-admin, includes them for an admin — confirmed via the new test, not just code review
- [ ] A DD-stage company's internal-only document (e.g., a passport tagged `isInternal: true` and hypothetically attached to an update) never appears in a non-admin founder's Attachments list, and its `/view`/`/documents/[id]` endpoints both 403 for that founder even with a guessed/known document id
- [ ] Founder-side surfaces confirmed untouched and out of scope: `company/profile`, `/diligence` (`getDdDocumentSummary` still returns name/date only, no link), all LP/share pages (no document list exists there to change)
- [ ] 375px check on both rows (Pattern A/B house conventions — the admin table already scrolls horizontally per Pattern A; the update-detail `<li>` row needs a quick check that two extra icons don't crowd the existing badge/size text at narrow widths — likely fine given the row already has `flex items-center gap-3`, but verify, don't assume)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `src/lib/auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/app/lp/**`, `src/app/share/**`, `src/lib/share-docs.ts` — this Part touches only the admin company page, the update-detail page, `/api/documents/[id]/view`, and `/api/updates/[id]`

**UX impact:** additive only for the two touched surfaces — existing Download behavior is byte-identical; View is a new, purely-additive action that's hidden (not disabled/greyed) for non-renderable types, so no user ever sees a button that doesn't work. The update-detail Attachments list goes from fully inert to functional, which is a fix, not a behavior change anyone could be relying on (there was nothing to click before). No other page, role, or flow is touched. **Cost impact:** none — reuses the existing S3/R2 presigned-URL mechanism and the already-shipped `/view` route; zero new services, zero new dependencies. **Schema:** none — `mimeType` and `isInternal` already exist on `Document`.

## Part 19 roadmap bookkeeping

Until WS45 ships: `ROADMAP.md` carries a `Planned` forward-pointer blockquote (added in this same edit) at the top of the Roadmap section, plus a short annotation on the existing "Document Management" bullet list noting the known forced-download gap and F37/F38, matching the F31/Setup-Wizard annotation convention used before that gap was fixed. Once WS45 ships: fold "View" into the existing Document Management bullets (it's an enhancement to an already-listed feature, not a new one), remove the `Planned` blockquote, and update the top `_Last updated_` line.

---

# Part 20 — Founder Document Upload for Active Companies (F39, WS46–WS47)

_Requested by Joseph 2026-08-04, from a real incident: a founder ("Acme," now `Company.stage: "ACTIVE"`) went through the `/diligence` checklist and uploaded 5 documents (cap table, bank statements, certificate of incorporation, business license, passport) that never actually saved, because of a since-fixed R2 storage-credentials bug. Now that the company is promoted out of `DILIGENCE`, the founder has no way to re-upload anything — `/diligence` renders `null` the instant `stage !== "DILIGENCE"`, no founder-facing document UI exists anywhere else, and there is no admin action to revert a company's stage. Joseph explicitly chose the broader fix over a narrow one-off ("give founders a real document upload page for active companies... this exact gap will recur regardless of this specific incident") and asked for this to be scoped properly before Alvin builds it. **Q65 (the one genuine product fork below) confirmed by Joseph 2026-08-04: Option A — upload/view/download only, no archive/delete on the founder page, matching Felix's recommendation exactly.** **WS46 and WS47 shipped 2026-08-04 — see ROADMAP.md for the live-verified summary.**_

## Method

Every claim in the request was re-verified against the working tree, not assumed:

- **Confirmed:** `src/app/diligence/page.tsx:208–210` — `if (diligence.stage !== "DILIGENCE") { return null; }` — the DD checklist page is a dead end for any promoted company, exactly as reported.
- **Confirmed, no founder document UI exists elsewhere:** grepped `document`/`Document`/`s3Key`/`download` across `src/app/company/profile/page.tsx` (zero matches — same finding Part 19 already made) and across all of `src/app/dashboard` and `src/app/updates` for any `documents/upload` POST call — nothing besides the update-composer's own per-update attachment picker, which is scoped to a single update, not a general company document library.
- **Confirmed, no admin stage-revert action exists:** `src/app/api/companies/[id]/route.ts`'s `PATCH` handler never reads or writes `stage` (grepped the whole file — the only `stage` reference is an unrelated comment on the `DELETE` handler's DD-founder-cleanup branch); `src/app/admin/companies/[id]/page.tsx`'s edit form has no `stage` field, only `fundingStage` (a different, funding-round field — confirmed by reading the edit form's `Select` block, `FUNDING_STAGES` is `["Pre-seed", "Seed", "Series A", "Series B+"]`). Building that admin action was explicitly *not* what Joseph asked for — noted here only to confirm the premise, not proposed as a workstream.
- **Confirmed the reusable upload machinery is exactly as described:** `POST /api/documents/upload` (`src/app/api/documents/upload/route.ts`) is a generic, company-scoped, presigned-URL endpoint gated only by `requireCompanyAccess` — nothing about it is DD-specific or admin-specific. It already accepts `docType`/`isInternal` on create and enforces the MIME/extension allowlist server-side.
- **Confirmed `GET /api/companies/[id]/documents` needs no new logic for founder use:** `src/app/api/companies/[id]/documents/route.ts` already filters `isInternal` rows out for any non-admin caller (Part 16/WS42, F33) — a founder-facing list built directly on this route inherits that protection automatically. Verified by reading the route, not assumed from the ROADMAP claim.
- **Confirmed the View/Download pattern (Part 19/WS45) is not yet a shared component** — `grep -rl isInlineViewable src` returns exactly `src/lib/documents.ts`, `src/app/admin/companies/[id]/page.tsx`, and `src/app/updates/[id]/page.tsx`. The admin table's per-row action cell (`src/app/admin/companies/[id]/page.tsx:1278–1310`) is View (conditional) + Download + Archive/Unarchive — not tangled with any docType-edit control (docType is set once at upload time; there is no per-row docType dropdown, contrary to what a skim of the surrounding filter-bar `Select` might suggest). Archive is the only admin-only piece, and it's a single, cleanly separable button. See JC-FD-E below for the call on whether to extract a shared component now that this would be a 3rd call site.
- **Confirmed `PATCH /api/documents/[id]` has no role or ownership check today — new finding, not in Joseph's framing.** Read `src/app/api/documents/[id]/route.ts`'s `PATCH` handler in full: it calls `requireCompanyAccess(document.companyId)` (any company member, any role) and then accepts `docType` and `archive` from the request body with no further authorization check — no `roles.includes("ADMIN")`, no ownership (`uploadedById`) check, and critically, **no `isInternal` check**. Contrast with the same file's `GET` handler four lines above, which does 403 a non-admin on an `isInternal` document (the WS42/F33 fix). Concretely: today, any founder member of a company — using nothing but the browser devtools or `curl`, no UI needed, since the admin UI is the only front door that calls this route — can archive, unarchive, or retype *any* document belonging to their company, including `isInternal: true` rows like a fellow member's passport or bank statements. This is **F39**, continuing the numbering from Part 19 (F38). It predates this Part and was never contingent on Q65's answer — a founder gets zero archive/delete affordance in the new UI either way (Q65 = A, confirmed below), but that's a UI-layer decision; the endpoint itself was directly callable all along, with no UI required, so it needs closing regardless of what the founder page does or doesn't render. The natural place to close it is this same workstream, since Alvin will already be touching this exact file and this exact access-control shape (matching the WS42/WS45 house convention of fixing a gap in the same pass that would otherwise widen it — except here the gap already exists today, pre-dating any UI change).
- **Confirmed this resolves the Acme situation with no other blocker.** `requireCompanyAccess` only requires an `APPROVED` session user with an active `UserCompanyMembership` row — it has no dependency on `Company.stage`. A founder on an `ACTIVE` company has exactly the same access to `POST /api/documents/upload` as one on a `DILIGENCE` company; the only thing that changed was the *page* to reach it (`/diligence` self-disables). Once WS47 ships, the resolution really is "log into Molly and use the new page" — whether to hold the interim founder-facing email until then or send it now is a timing call for Joseph, noted in the handoff summary rather than as its own Q, since it doesn't change anything about how this Part is built.
- **Confirmed no conflict with the DD checklist's own completion tracking.** `src/lib/diligence.ts`'s `getDdDocumentSummary()` (lines 77–96) queries `Document` by `companyId` + `docType ∈ DD_DOC_TYPES`, not by which page uploaded it. A `DILIGENCE`-stage founder who uploads a `passport` via the new general page (see JC-FD-B — it isn't stage-gated) satisfies the DD checklist's own tracking exactly as if they'd uploaded it via `/diligence` itself; recompute is still on-read (the existing, unchanged behavior — visiting `/diligence` or an admin loading `/admin/diligence` recomputes and persists `completedAt`), so this is additive, not a new interaction to design around.

## Decisions made without a Joseph fork (small technical judgment calls, each cheaply reversible)

- **JC-FD-A — new page at `/company/documents`, own sidebar entry, not folded into `/company/profile`.** Read `src/app/company/profile/page.tsx` in full: it's already a complete edit-mode/view-mode form (logo, name, description, website, sector, geography, funding stage) with no natural slot for a document list, and the codebase's own precedent (`/company/metrics` is already a sibling page to `/company/profile`, not a section within it) argues for a sibling page here too. **Reversal:** moving JSX between two client pages later is mechanical, not risky.
- **JC-FD-B — the "Documents" nav item is NOT gated by `Company.stage`, unlike the "Diligence" item.** Initially assumed the opposite (matching Joseph's own "active, non-DD companies" framing), but Part 16/Q55's actual, confirmed precedent is that a DD-stage founder gets *full, non-blocking Molly access from day one* — Updates, Metrics, Team, and Investor Links are all already ungated by `stage`; only `/diligence` itself (the DD-specific questionnaire) is stage-scoped. Gating "Documents" would be the one inconsistent exception, and — per the Method section above — a DD founder uploading via this page doesn't fight the DD checklist's own tracking, it feeds it. So: shown in the founder nav unconditionally, exactly like Company Profile/Team. **Reversal:** one added `selectedCompany?.stage !== "DILIGENCE" &&` condition in `sidebar.tsx`, same one-line pattern already used for the Diligence item, if this turns out confusing in practice.
- **JC-FD-C — all 10 `DOC_TYPES` are uploadable/visible here, including the 5 DD-specific ones.** Not really a fork: restricting the founder page to the original 5 (Pitch Deck/Financials/Legal/Product/Other) would silently fail to fix the actual incident this Part exists to fix — Acme's 5 missing documents are cap table, bank statements, certificate of incorporation, business license, and passport, all DD-only types. **Reversal:** the dropdown is one array reference; trivially narrowed later.
- **JC-FD-D — `passport`/`bank_statements` auto-tag `isInternal: true` on this page too, with no founder-facing toggle, matching `/diligence`'s exact precedent.** No product reason this sensitivity judgment should differ by which page the same file type is uploaded from. The founder gets no manual internal/shared toggle at all (matching `/diligence`, diverging from the admin upload control, which does expose one) — introducing founder-controlled visibility on sensitive-by-default types wasn't asked for and would be a real, separate product decision if ever wanted. **Reversal:** promote the constant to a per-type-configurable map later; today it's a 2-value `Set`.
- **JC-FD-E — the founder page duplicates the View/Download action-pair JSX a third time rather than extracting a shared component.** This *is* cleanly extractable (Method section above — Archive is the only non-shared piece, and it's separable), so the "don't assume, read the JSX" question resolves in favor of "could extract." But Part 19's own judgment calls (JC-VD-C) deliberately kept that pattern minimal and un-componentized when it was duplicated a 2nd time, and touching two already-shipped, stable pages purely to shave duplication for a 3rd caller is churn with no user-facing benefit and non-zero regression risk for pages outside this Part's actual goal. Staying consistent with the established precedent: **copy, don't extract, this time too.** **Reversal:** if a 4th caller or a future inline-viewable-type change ever needs all three call sites to move in lockstep, that's the natural trigger to extract `src/components/document-actions.tsx` (View + Download only; Archive stays inline where it's used) touching all three sites in one pass.
- **JC-FD-F — `formatFileSize()` moves from a local function in `src/app/admin/companies/[id]/page.tsx` to `src/lib/utils.ts`, alongside `formatDate`/`normalizeUrl`.** Unlike JC-FD-E, this one is a pure, byte-identical, zero-JSX one-liner being duplicated a 2nd time — no styling/markup coupling, no drift risk, and it's exactly the kind of helper `utils.ts` already exists for. **Reversal:** trivial either direction.
- **F39's fix is `requireAdmin()` on `PATCH /api/documents/[id]`,** per Q65 = A below (confirmed, not just recommended) — no founder-side archive/retype in v1, so the endpoint itself is admin-only, full stop. See WS46.3.

## Product decision (Q65) — confirmed by Joseph 2026-08-04

**Q65 — Can founders archive their own uploads on this new page, or is it upload + view + download only (no undo), leaving archive entirely admin-only as it is today?**

This was a genuine product fork, not a technical call — it traded off a real failure mode (a founder accidentally hiding a document DFS is waiting on, e.g. mis-clicking archive on the very passport a compliance reviewer needs) against a real UX cost (a founder who fat-fingers an upload — wrong file, wrong type — has no self-serve way to fix it, and has to email DFS to ask for a manual archive).

- **Option A — upload, view, download only. No archive/delete anywhere on this page.** Matches `/diligence`'s own precedent exactly (that page has never had archive/delete either, through two full Parts of iteration). Founders correcting a mistake ask an admin, same as today. Closes F39 with the simplest possible fix: `PATCH /api/documents/[id]` becomes admin-only (`requireAdmin()`), a strict tightening with no legitimate caller broken (only the admin UI calls this route today).
- **Option B (not chosen) — founders may archive (never unarchive, never hard-delete) only documents where `uploadedById` is their own user id and `isInternal` is `false`.** Documented here for the record in case self-serve correction is ever revisited; not built.

**Decided: Option A**, matching Felix's recommendation exactly — the smaller, safer slice, matching the one directly-comparable precedent in this codebase, with the downside (an admin has to manually fix a founder's mis-upload) being a rare, low-cost email away. This is now locked in throughout WS46/WS47 below: no conditional branches, no "if Q65 = B" alternates — the founder page ships with zero archive/delete affordance, and the endpoint is admin-only regardless of which page calls it.

## WS46 — Prep: shared constants, shared helper, and closing F39 (~0.25–0.5 day)

**Goal:** land the small, low-risk groundwork this Part depends on.

### WS46.1 `src/lib/constants.ts` — export `AUTO_INTERNAL_DOC_TYPES`

```ts
// Part 20, WS46 — hoisted out of src/app/diligence/page.tsx so the new
// founder documents page (WS47) can apply the identical auto-tagging
// rule without a second, driftable copy of this set.
export const AUTO_INTERNAL_DOC_TYPES = new Set(["passport", "bank_statements"]);
```

`src/app/diligence/page.tsx` drops its local `const AUTO_INTERNAL_DOC_TYPES = new Set([...])` (line 49) and imports it from `@/lib/constants` instead — its own `handleUpload` call site (line 152) is otherwise untouched, byte-identical behavior.

### WS46.2 `src/lib/utils.ts` — add `formatFileSize`

```ts
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

`src/app/admin/companies/[id]/page.tsx` deletes its local copy (lines 583–588) and imports this instead — same output for every existing call. `src/app/company/documents/page.tsx` (WS47) imports the same function rather than a 3rd copy.

### WS46.3 `src/app/api/documents/[id]/route.ts` — close F39

Per Q65 = A (confirmed): the route becomes admin-only, full stop — no branch, no founder path at all, whether or not they're the uploader.

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      select: { companyId: true, archivedAt: true },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Part 20, WS46 (F39) — this route previously ran requireCompanyAccess
    // only, meaning any founder member of the company (not just admins)
    // could archive/unarchive/retype ANY document, including isInternal
    // ones, via direct API calls — the admin UI was the only front door,
    // but never the only caller this route allowed. Per Q65 (confirmed
    // 2026-08-04, Option A): the founder documents page (WS47) ships with
    // no archive/delete affordance at all, so this endpoint has no
    // legitimate non-admin caller — admin-only, not just UI-hidden.
    const { error } = await requireAdmin();
    if (error) return error;

    // ...body validation, db.document.update... unchanged
```

`GET /api/documents/[id]` (the download-metadata route, already role-gated by isInternal since F33) is untouched — this fix only touches `PATCH`.

**WS46 acceptance checklist**
- [ ] `/diligence` uploads still auto-tag `passport`/`bank_statements` as `isInternal: true`, now via the shared constant — no behavior change
- [ ] Admin company page's file-size column renders identically after switching to the shared `formatFileSize`
- [ ] `PATCH /api/documents/[id]` 403s any non-admin caller outright — including a founder attempting to archive/retype their *own* upload, confirming F39 is closed at the endpoint, not just hidden from the UI (new regression test); admin archive/unarchive/retype from `/admin/companies/[id]` still works exactly as before
- [ ] `npm run typecheck && npm run lint && npm test` green

## WS47 — Founder-facing Company Documents page (~0.75–1 day)

**Goal:** `/company/documents` — a general, freeform document library for the founder's own company: upload (any `DOC_TYPES` value), search/filter by type, and view/download every non-`isInternal` document the company has (whether uploaded by a founder, a teammate, or an admin), reusing `POST /api/documents/upload` and `GET /api/companies/[id]/documents` as-is.

### WS47.1 `src/app/company/documents/page.tsx` (new)

Standard `AppShell`/`PageHeader` composition, structurally modeled on the admin company page's Documents tab (upload control + filter bar + table) minus the admin-only pieces (no "Internal only" checkbox, no per-row Archive button — per Q65 = A, confirmed, this page never renders one):

```tsx
"use client";
// Part 20, WS47 — general company document library for founders.
// Resolves the gap /diligence left behind once a company is promoted
// out of DILIGENCE (that page returns null for any non-DD company) and
// gives every founder — DD or ACTIVE alike, per JC-FD-B — a real place
// to upload/view/download company documents outside the update composer.

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Search, Eye, Download, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCompany } from "@/context/company-context";
import { DOC_TYPES, AUTO_INTERNAL_DOC_TYPES } from "@/lib/constants";
import { isInlineViewable } from "@/lib/documents";
import { formatDate, formatFileSize } from "@/lib/utils";

interface Document {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  docType: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

export default function CompanyDocumentsPage() {
  const { selectedCompany, loading: companyLoading } = useCompany();
  const companyId = selectedCompany?.id;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(
    async (id: string, opts?: { search?: string; docType?: string }) => {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.docType) params.set("docType", opts.docType);
      const res = await fetch(`/api/companies/${id}/documents?${params}`);
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.data ?? data ?? []);
    },
    []
  );

  useEffect(() => {
    if (companyLoading || !companyId) {
      setLoading(false);
      return;
    }
    loadDocuments(companyId).catch(() =>
      setMessage({ type: "error", text: "Failed to load documents." })
    ).finally(() => setLoading(false));
  }, [companyId, companyLoading, loadDocuments]);

  async function handleUpload(file: File) {
    if (!companyId) return;
    setUploading(true);
    try {
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          docType: uploadDocType || null,
          isInternal: AUTO_INTERNAL_DOC_TYPES.has(uploadDocType),
        }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to initiate upload");
      }
      const { uploadUrl } = await initRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      await loadDocuments(companyId, { search: docSearch, docType: docTypeFilter });
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully.` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(docId: string, docName: string) {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error("Failed to get download link");
      const data = await res.json();
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = docName;
      a.click();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Download failed." });
    }
  }

  // ...loading/no-company guard states, same idiom as company/profile...

  return (
    <AppShell>
      <PageHeader
        title="Documents"
        description="Files shared with the Molly team — cap tables, financials, legal documents, and more."
      />
      {/* message banner — same pattern as company/profile */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className="w-auto">
          <option value="">No type</option>
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-3.5 w-3.5" />
          {uploading ? "Uploading..." : "Upload"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>
      {/* search + type filter bar, table with Name/Type/Date/Uploaded By/Size/Actions
          columns — same table shell, EmptyState, and View/Download action-pair JSX
          as admin/companies/[id]/page.tsx's Documents tab (Pattern A: overflow-x-auto,
          min-w table), minus the Visibility column and Archive button per Q65=A */}
    </AppShell>
  );
}
```

No `isInternal` display badge on this page (nothing in the returned list is ever internal — the API already filters it out for non-admins, so a "Shared"-only badge would be pure noise, unlike the admin table where both states can appear).

### WS47.2 `src/components/layout/sidebar.tsx` — nav entry

```tsx
import { FolderOpen } from "lucide-react"; // add to existing lucide-react import

const founderNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Updates", href: "/updates", icon: FileText },
  { label: "Metrics", href: "/company/metrics", icon: BarChart3 },
  { label: "Investor Links", href: "/links", icon: Link2 },
  { label: "Company Profile", href: "/company/profile", icon: Building2 },
  // Part 20, WS47 — sits with Company Profile in the "manage your
  // company's records" cluster, not with Team/Service Providers.
  // Ungated by stage (JC-FD-B) — matches the FolderOpen icon already
  // used for the equivalent admin Documents tab.
  { label: "Documents", href: "/company/documents", icon: FolderOpen },
  { label: "Team", href: "/team", icon: Users },
  { label: "Service Providers", href: "/providers", icon: Wrench },
];
```

No conditional wrapper needed (unlike the Diligence item) — renders for every founder unconditionally, so the existing `founderNav.slice(1).map(renderItem)` line in the nav render picks it up with zero other changes.

### WS47.3 Tests

- Extend `src/lib/__tests__/document-internal-access.test.ts` (or add a sibling) with F39's regression cases per WS46.3's checklist above.
- No new pure-logic module is introduced by WS47 itself (the page reuses existing, already-tested routes) — no new unit-test file required, matching the "route/page glue doesn't need its own unit test" convention already used for `/diligence` and `company/profile`.

## WS47 acceptance checklist

- [ ] `/company/documents` reachable from the founder sidebar for every founder, regardless of `Company.stage`
- [ ] Upload works for all 10 `DOC_TYPES` values (including the 5 DD-specific ones) via the existing presigned-upload flow; `passport`/`bank_statements` are tagged `isInternal: true` automatically, with no visible toggle
- [ ] The list shows every non-`isInternal` document for the company — including ones uploaded by an admin via `/admin/companies/[id]` before this page existed — confirmed live against a real company with admin-uploaded documents
- [ ] An `isInternal` document (e.g. a passport) never appears in this list for a non-admin founder, and its `/api/documents/[id]`/`/view` endpoints still 403 for that founder even with a guessed id (regression, not new — confirming WS42/WS45's existing fix still holds through this new caller)
- [ ] View (conditional on `isInlineViewable`) and Download both work per document row, matching Part 19's behavior exactly
- [ ] No archive/delete control appears anywhere on this page (Q65 = A, confirmed) — upload, view, and download are the only three actions a founder can take
- [ ] `PATCH /api/documents/[id]` rejects any non-admin caller outright, including a founder attempting to archive/retype their own upload directly against the endpoint with no UI involved (F39 closed at the endpoint, not just hidden from the UI) — verified via the new test, not just code review
- [ ] Acme (or any real founder on an `ACTIVE` company) can log in and successfully re-upload cap table / bank statements / certificate of incorporation / business license / passport through this page — the actual incident this Part exists to resolve
- [ ] 375px check (Pattern A table scroll, same shell as the admin Documents tab)
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] Grep guard: no diffs under `src/lib/auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/app/lp/**`, `src/app/share/**`, `/diligence`'s own upload flow (untouched, still calls the same route directly, not through this page)

**UX impact:** purely additive — a new page and a new (always-visible) sidebar item for founders; no existing founder or admin surface changes behavior. `/diligence` is completely untouched (still the DD-specific 5-slot checklist it always was); this is a separate, general-purpose surface. The one behavior *change* anywhere in this Part is F39's tightening of `PATCH /api/documents/[id]` — which only removes an access path that was never exposed through any UI, so no real user or workflow is affected. **Cost impact:** none — reuses the existing S3/R2 presigned-upload flow, `GET /api/companies/[id]/documents`, and the Part 19 `isInlineViewable`/View-Download pattern; zero new services, zero new dependencies. **Schema:** none — no new fields, no new model.

## Part 20 sequencing

WS46 first (small, mostly mechanical, and F39 should close before a second UI surface can call the now-more-exposed route). WS47 depends on WS46.1/WS46.2 (the shared constant and helper). Q65 is confirmed (Option A), so both workstreams below are final — no conditional branches left to resolve before Alvin starts. Total ~1–1.5 days.

## Part 20 roadmap bookkeeping

Until WS46/WS47 ship: `ROADMAP.md` gets a `Planned` forward-pointer blockquote at the top of the Roadmap section (matching the WS45 convention) summarizing the gap and pointing here, plus a short annotation on the Founder Features' "Due Diligence checklist" bullet noting that promoted (`ACTIVE`) companies now have a separate, general document page rather than a dead end. Once shipped: fold "Documents" into Founder Features as its own bullet (new nav surface, not an enhancement to an existing one), remove the `Planned` blockquote, and update the top `_Last updated_` line.

---

# Part 21 — Awaiting-Setup Queue Hygiene (F40, F41, WS48)

_Requested by Joseph 2026-08-04, from `/admin/approvals`'s "Awaiting password setup" section (shipped Part 9/WS22): several rows have been sitting there, still "link expired," since February — with no way to clear them. Verbatim: "I want these to disappear after a certain number of days or have the option to delete them." Both options are his own suggestions, offered together, not a single committed choice — treated below as a real fork (Q66). **Q66 confirmed by Joseph 2026-08-04: Option B — ship both Dismiss/Undismiss and the guarded hard Delete together, matching Felix's recommendation exactly.** **This Part is planning only — no code has shipped.**_

## Method

Every claim below was verified against the working tree, not assumed from the Part 9 plan or from framing in the request.

- **Confirmed what "awaiting password setup" means today.** `GET /api/admin/approvals/awaiting/route.ts:18-23` — `passwordHash: null`, `status: { not: "REJECTED" }`, `OR: [{ status: "APPROVED" }, { approvalToken: { not: null } }]`. This is exactly Part 9's F19 state machine: a self-signup founder an admin approved is `PENDING` + token; an admin-invited user is `APPROVED` + token. `src/app/admin/approvals/page.tsx:301-356` renders it as a second, always-fetched section below the main pending queue, one wrap-row `Card` per user with a single "Resend link" action (`POST /api/admin/approvals/[id]/resend`).
- **Confirmed there is no existing cleanup mechanism — these rows genuinely accumulate forever.** No cron touches `User` rows in this state (grepped `src/app/api/cron/` — reminders and sheets-sync only); the only two mutating endpoints scoped to a single awaiting-setup user are `resend` (refreshes the token, does not remove the row from the query) and the ordinary `approve`/`reject` siblings. Reject (`src/app/api/admin/approvals/[id]/reject/route.ts:25-30`) 400s outright unless `status === "PENDING"` — meaning it flatly refuses on the `APPROVED` half of this population (every admin-invited user, whether invited via `/admin/companies/new` or `POST /api/companies/[id]/members/invite`). And even for the `PENDING`+token half where it *would* succeed, no UI button ever calls it against these rows: the only "Reject" button on the page lives in the main pending-queue card list, which is fed by `GET /api/admin/approvals` — filtered to `{ status: "PENDING", approvalToken: null }` (`src/app/api/admin/approvals/route.ts:11-12`), which by construction excludes every row that also appears in the awaiting-setup section. **F40 — reject is real, but unreachable for this population, and it's the wrong tool anyway:** both the reject route and `src/lib/email.ts`'s `sendRejectionEmail` fire a real "you were rejected" email. Reusing it to silently clear an admin-hygiene queue would misinform a founder or teammate DFS already explicitly approved/invited — worse than doing nothing. This rules out extending "Reject" as the answer to Joseph's ask.
- **Confirmed these users are structurally different from the DD-decline population the Part 16/WS43 founder-cleanup precedent (F34/F35) was built for.** Every creation path that produces an "awaiting setup" row also creates a real `UserCompanyMembership` in the same transaction — there is no "brand-new, still-orphaned account" case here, unlike DD-decline's starting point:
  - Self-signup (`src/app/api/auth/signup/route.ts:76-100`) creates the `User`, a **new `Company`** with `createdById: user.id`, and an `OWNER` membership, all in one `$transaction`. The founder is the company's creator.
  - Admin-created company with a founder invite (`src/app/api/companies/route.ts:114-165`) creates the `User` (`status: "APPROVED"`) and an `OWNER` membership on a company whose `createdById` is **the admin** (`companies/route.ts:145`, explicit comment: "unchanged convention — always the admin").
  - Team-member invite into an existing company (`src/app/api/companies/[id]/members/invite/route.ts:186-216`) creates the `User` and a `MEMBER`/`VIEWER` membership on a company they didn't create and don't own.
  So every awaiting-setup row already has ≥1 real membership on day one — the F34/F35 "zero remaining memberships ⇒ safe to delete" predicate doesn't even apply here; the question is never "are they orphaned," it's "would deleting them orphan or damage a real company."
- **Confirmed the FK hazard is narrower here than F35's, but real and different in shape — F41.** `prisma/schema.prisma:97-98` — `Company.createdById` is a required FK to `User` with no `onDelete` clause (Postgres default: `RESTRICT`). For the **self-signup** sub-case, the awaiting-setup user *is* that FK's target — `db.user.delete({ where: { id } })` on that row would throw a raw FK-violation error today, not silently no-op like F35 (there's no join-table indirection to unwind first, unlike `ShareableLink`/`ShareableLinkCompany`). For the **admin-invited** sub-case (both company-creation paths above), the user is never `createdById` of anything — deleting them is clean, and only their `UserCompanyMembership` row(s) cascade away (`onDelete: Cascade`, `prisma/schema.prisma:144-145`), exactly like removing an ordinary team member. Unlike F35, there is **no `ShareableLink`-style risk to check for at all**: every row in this queue has `passwordHash: null`, meaning they have never logged in, and every other `createdById`-style relation on `User` (`ShareableLink`, `CompanyNote`, `UpdateTemplate`, `FundReport`) can only be created from a route behind `requireCompanyAccess`/`requireAdmin` — i.e. a real session, which these accounts have never had (verified by reading each creation route's auth guard). So the *only* FK a hard-delete needs to guard against here is `Company.createdById`, and it's cleanly checkable in advance (no try/catch-and-hope needed, unlike F35's best-effort loop).
- **Confirmed what "disappear after N days" would mean today, and that it's a genuinely separate concept from token expiry.** `SETUP_TOKEN_TTL_DAYS = 7` (`src/lib/setup-token.ts:4`) governs whether the *link itself* still works — unrelated to whether the *row* should still be in an admin's face. A row already reads `link expired {date}` in `text-laterite` once its token ages out (`page.tsx:337-343`), so "expired" is already visible; what's missing is a way to stop seeing it.
- **Confirmed the self-serve resend path still works after any soft removal from this list.** `src/app/api/auth/signup/route.ts:37-73` — re-submitting the public signup form with the same email hits `canResendSetupLink(existing)` and auto-resends, regardless of whether an admin has taken any action on the row. This means a soft "get this off my screen" action never actually locks a real founder out — they have a working, independent path back in.

## Decisions made without a Joseph fork (small technical judgment calls, each cheaply reversible)

- **JC-AQ-A — "get out of my sightline" ships as a new, dedicated soft action ("Dismiss"), not by repurposing status/token fields.** A new nullable `User.setupQueueDismissedAt` column is the only schema change; it never touches `status`, `approvalToken`, or `tokenExpiresAt`, so nothing about login eligibility, resend eligibility, or the self-serve path above changes — this is purely a queue-visibility flag. **Reversal:** drop the column later if a different mechanism wins; nothing else references it.
- **JC-AQ-B — dismiss/undismiss are two `POST` sub-routes (`.../[id]/dismiss`, `.../[id]/undismiss`), not one `PATCH` with a body.** The alerts feature (`PATCH /api/admin/alerts/[id]` with `{ resolved: true }`) is the closest analog elsewhere in the app, but the three existing siblings *in this exact folder* (`approve`, `reject`, `resend`) are all id-only `POST` routes — matching the closer, local convention. **Reversal:** collapsing to one `PATCH` later is a mechanical route-file merge.
- **JC-AQ-C — the auto-hide-after-N-days threshold is a display-only grouping, computed client-side, not a second schema column or a WHERE-clause filter.** `GET /api/admin/approvals/awaiting` keeps returning every non-`REJECTED`, no-password row unfiltered (dismissed or not, stale or not) — the page groups them into "Awaiting password setup" (active) and a collapsed "Dismissed / stale" section, mirroring the page's own pre-existing `processedApprovals` collapsed-section pattern one screen up. This keeps the feature reversible and inspectable (an admin can always see everything that's there, just deprioritized) rather than truly hidden with no trace, matching the "additive, not surprising" bar. Threshold recommended at **30 days past the token's own expiry** (i.e. `tokenExpiresAt + 30d < now`) — deliberately distinct from and longer than `SETUP_TOKEN_TTL_DAYS` (7d), so a resend (which refreshes `tokenExpiresAt`) automatically pushes a row back out of "stale" with no extra bookkeeping. **Reversal:** one constant.
- **JC-AQ-D — the stale-threshold constant and its predicate stay out of `src/lib/setup-token.ts` and live directly in the page component.** `setup-token.ts` does `import crypto from "crypto"` for `generateSetupToken()` — a Node core module. Importing anything from that file into a `"use client"` page risks pulling that import into the client bundle (Next/webpack's tree-shaking of an unused named export through a `crypto`-importing sibling function is not something to rely on). The existing page already computes `expired` inline (`page.tsx:339`) rather than importing `isSetupTokenExpired` from that file for the same reason — this follows the same, already-established pattern. **Reversal:** if `setup-token.ts` is ever split into a pure sub-module, the constant can move there.
- **JC-AQ-E — hard delete is guarded by a new pure predicate, `canHardDeleteFromQueue()`, added to `setup-token.ts` (server-only usage, no client-import conflict) and unit-tested,** matching the house convention of extracting security-relevant predicates (`canResendSetupLink`) rather than inlining them in a route handler.

## Product decision (Q66) — confirmed by Joseph 2026-08-04

**Q66 — Should a hard "delete this account" action ship at all in v1, alongside Dismiss, or is Dismiss (+ the auto-stale grouping) enough for now?**

This was the one genuine fork. Dismiss alone fully answers "I want these to disappear" — it's safe, reversible, has zero email side effects, and directly clears the exact rows in the screenshot. Delete is the literal reading of "or have the option to delete them," but F41 above means it can't be a single uniform action:

- **Option A (not chosen) — Dismiss only.** Ship WS48 minus the `DELETE` endpoint and the "Delete account" button. Simplest, safest, smallest. Documented here for the record; not built.
- **Option B (chosen) — Dismiss, plus a guarded Delete that's only offered when it's actually safe.** Per F41, a hard delete is clean and safe whenever the account is **not** the creator of any company it belongs to (the admin-invited-founder and team-member sub-cases — likely the majority of what's been sitting since February, since DFS-initiated invites are the normal path here, not self-signup). For that population, "Delete account" fully removes the `User` row (membership cascades away automatically); it's blocked with a clear inline reason for the self-signup/company-creator sub-case, where deleting the account would either crash on the `Company.createdById` FK or require deciding to delete a real, possibly-named company as a side effect — which this workstream deliberately does not do silently. Re-invite after a delete is a normal "invite this email again" from `/admin/companies/[id]` → Members (or `/admin/companies/new` if the company doesn't exist anymore either) — a fresh `User` row, no special recovery path needed, confirmed against `members/invite/route.ts`'s "no user found" branch (`invite/route.ts:186-216`).
- **Option C (not chosen) — Delete that also silently deletes the self-created `Company` when the account is its creator,** mirroring the DD-decline precedent exactly. Rejected: DD-decline already has an explicit, deliberate admin action ("Decline this deal") authorizing company deletion; there's no equivalent intent here — a stale awaiting-setup row is not evidence the company itself should be destroyed, and doing so as a side effect of an admin-hygiene click is a materially bigger, easier-to-regret action than what was asked for.

**Decided: Option B**, matching Felix's recommendation exactly — it answers both halves of Joseph's message, costs about the same as Option A once the pure `canHardDeleteFromQueue()` guard exists (no extra UI complexity beyond one more button and one more blocked-state message), and never puts a real company at risk. This is now locked in throughout WS48 below: no conditional branches, no "if Q66 = A" alternates — Dismiss/Undismiss and the guarded hard Delete both ship in the same batch.

## WS48 — Dismiss + guarded delete for the awaiting-setup queue (~0.75–1 day)

**Goal:** give the admin a way to get resolved/unwanted rows out of "Awaiting password setup" — always via Dismiss (safe, reversible, no email); optionally via a guarded hard Delete where F41 confirms it's safe. Stale rows (30+ days past their own token expiry) auto-group with dismissed ones. No change to login, resend, or self-serve recovery behavior for any row that isn't explicitly deleted.

### WS48.1 Schema — additive, one nullable column

```prisma
model User {
  id             String     @id @default(cuid())
  email          String     @unique
  name           String?
  passwordHash   String?
  roles          UserRole[] @default([FOUNDER])
  status         UserStatus @default(PENDING)
  approvalToken  String?    @unique
  tokenExpiresAt DateTime?
  setupQueueDismissedAt DateTime? // WS48 — admin-hygiene only; never affects login/token/resend eligibility
  googleId       String?    @unique
  ...
}
```

`prisma db push` against production per the house procedure (Vercel env, `--environment=production`). Zero backfill — existing rows read `null` (not dismissed), byte-identical to today.

### WS48.2 `src/lib/setup-token.ts` — one new constant, one new predicate (server-only)

```ts
/**
 * Safe to hard-delete from the awaiting-setup queue (WS48/F41): never an
 * admin, never someone who already finished setup, and never the creator
 * of a company — Company.createdById is a required FK with no cascade
 * (Postgres RESTRICT), so deleting a company-creator's User row would
 * either throw outright or require silently deleting a real company.
 */
export function canHardDeleteFromQueue(
  u: { roles: string[]; passwordHash: string | null },
  ownedCompanyCount: number
): boolean {
  if (u.passwordHash) return false;
  if (u.roles.includes("ADMIN")) return false;
  return ownedCompanyCount === 0;
}
```

Extend `src/lib/__tests__/setup-token.test.ts` with the truth table: admin ✗ regardless of `ownedCompanyCount`; has-password ✗; `ownedCompanyCount > 0` ✗; plain invited/team-member row with `ownedCompanyCount === 0` ✓.

### WS48.3 `GET api/admin/approvals/awaiting/route.ts` — no filter change, two extra fields

Same `where` as today (Part 9/WS22.1) — dismissed rows must still come back so the collapsed section and any "Undismiss" action have data to work with. Add `setupQueueDismissedAt` and `createdById` on the nested company select:

```ts
select: {
  id: true, email: true, name: true, status: true, roles: true,
  tokenExpiresAt: true, createdAt: true, setupQueueDismissedAt: true,
  memberships: {
    include: { company: { select: { id: true, name: true, createdById: true } } },
  },
},
```

(`roles` is new here too — the client needs it to hide the Delete button for the admin-account edge case, mirroring the server-side guard; today's response doesn't select it.)

### WS48.4 `POST api/admin/approvals/[id]/dismiss/route.ts` (new) and `.../undismiss/route.ts` (new)

Siblings of `resend`, same skeleton (`requireAdmin` → 404 if missing → update → audit log → return updated user):

```ts
// dismiss
const updated = await db.user.update({
  where: { id },
  data: { setupQueueDismissedAt: new Date() },
  select: { id: true, email: true, setupQueueDismissedAt: true },
});
await logAdminAction(actor!, "SETUP_QUEUE_DISMISSED", {
  targetType: "User",
  targetId: id,
  metadata: { email: updated.email },
});
```

`undismiss` is the same shape with `setupQueueDismissedAt: null` and `"SETUP_QUEUE_UNDISMISSED"`. No eligibility guard needed beyond "user exists" — dismissing/undismissing a row that's since completed setup (or been rejected) is inert, and the GET query already stops returning REJECTED/passworded rows regardless.

### WS48.5 `DELETE api/admin/approvals/[id]/route.ts` (new)

```ts
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;
    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: { company: { select: { id: true, name: true, createdById: true } } },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ownedCompanies = target.memberships
      .map((m) => m.company)
      .filter((c) => c.createdById === id);

    if (!canHardDeleteFromQueue(target, ownedCompanies.length)) {
      const reason = target.passwordHash
        ? "This account has already completed setup."
        : target.roles.includes("ADMIN")
          ? "Admin accounts can't be deleted from this queue."
          : `This account created ${ownedCompanies.map((c) => c.name).join(", ")} — deleting it here would either fail or require deleting that company too, which this action doesn't do. Use "Dismiss" instead, or delete the company from Admin → Companies if you want to remove it entirely.`;
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    await db.user.delete({ where: { id } }); // memberships cascade — prisma/schema.prisma:144-145

    await logAdminAction(actor!, "SETUP_QUEUE_USER_DELETED", {
      targetType: "User",
      targetId: id,
      metadata: { email: target.email, companyNames: target.memberships.map((m) => m.company.name) },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/approvals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

The 409 message is defense-in-depth — WS48.6's UI already hides/disables the button in the blocked case, but the endpoint must refuse safely even if called directly.

### WS48.6 `src/app/admin/approvals/page.tsx` — Dismiss/Delete UI, stale grouping

- Local, page-only constant (per JC-AQ-D): `const STALE_AFTER_DAYS = 30;` and a small inline predicate mirroring the existing `expired` calc at line 339: `const isStale = (u) => !u.tokenExpiresAt || new Date(u.tokenExpiresAt).getTime() + STALE_AFTER_DAYS * 86400000 < Date.now();`.
- Split the fetched `awaitingUsers` into `activeAwaiting = awaitingUsers.filter(u => !u.setupQueueDismissedAt && !isStale(u))` and `dismissedOrStale = awaitingUsers.filter(u => u.setupQueueDismissedAt || isStale(u))`.
- `activeAwaiting` renders exactly as today, plus one new secondary-variant button per row, `Dismiss` (`EyeOff` icon, `POST .../dismiss`), next to the existing `Resend link` button — same `resendStates`-style per-id loading/result local state, new sibling state object (`dismissStates`) so the two actions don't fight over the same key.
- Compute `const isCompanyCreator = u.memberships.some(m => m.company.createdById === u.id);` per row. Render a `Trash2`-icon `Delete account` button using the exact two-step "click to arm → Confirm Delete / Cancel" inline pattern already used on `admin/companies/[id]/page.tsx:630-659` (own local `confirmDeleteId` state, not a modal) — but only when `!isCompanyCreator`; when `isCompanyCreator`, render a muted inline note instead ("Created a company — use Dismiss") rather than a disabled button with no explanation.
- New collapsed section below, mirroring the page's existing `processedApprovals` block (`opacity-60` cards, same shape): heading "Dismissed / stale ({count})", each row keeps `Resend link` (still fully functional — dismissal never touched `approvalToken`) and gains `Undismiss` (only shown when `setupQueueDismissedAt` is actually set — a purely-stale-but-never-dismissed row has nothing to "undismiss," it'll just drop out of this group on its own once resent).
- Section-visibility rule stays additive: if both `activeAwaiting` and `dismissedOrStale` are empty, the whole "Awaiting password setup" heading disappears exactly as it does today.

### WS48.7 Bookkeeping

- `ROADMAP.md`: short annotation on the existing Approvals bullet (Admin Features) once shipped — "Awaiting password setup" rows can be dismissed, or deleted outright when safe (F41's guard), instead of accumulating indefinitely; fold into "Existing Features."
- No `route-access.ts`/middleware change — these are all authenticated `/api/admin/*` routes, same shape as every sibling in this folder.

## WS48 acceptance checklist

- [ ] `npm run typecheck && npm run lint && npm test` green; `setup-token.test.ts` covers `canHardDeleteFromQueue`'s truth table
- [ ] Dismiss a row → disappears from "Awaiting password setup," reappears under "Dismissed / stale"; `SETUP_QUEUE_DISMISSED` audit row with the email in metadata
- [ ] Undismiss → row returns to the active section; `SETUP_QUEUE_UNDISMISSED` audit row
- [ ] A row whose `tokenExpiresAt` is >30 days in the past auto-appears under "Dismissed / stale" with no admin action taken; resending it (refreshing `tokenExpiresAt`) moves it back to the active section on next load
- [ ] Delete on an admin-invited/team-member row (not a company creator) → row and its `UserCompanyMembership` are gone; the company it belonged to is untouched, still has its other members; `SETUP_QUEUE_USER_DELETED` audit row with `companyNames` in metadata
- [ ] Delete on a self-signup row (company creator) → button doesn't render; a direct `curl -X DELETE` against the endpoint 409s with the explanatory message, company and account both untouched
- [ ] Re-inviting a deleted account's email via `/admin/companies/[id]` → Members creates a fresh `User` row and membership, no dead end
- [ ] Reject/Approve on the main pending queue, and Resend on any awaiting-setup row, remain byte-identical to today
- [ ] 375px check: new buttons wrap per the page's existing Pattern B card row, no horizontal scroll
- [ ] Grep guard: no diffs under `src/lib/auth.ts`, `auth-guard.ts`, `route-access.ts`, `src/lib/setup-token.ts`'s existing exports (`generateSetupToken`, `isSetupTokenExpired`, `canResendSetupLink` unchanged), or the DD-decline cleanup path (`src/app/api/companies/[id]/route.ts`)

**UX impact:** additive — new "Dismiss"/"Undismiss" and (where F41's guard allows it) "Delete account" affordances plus a collapsed section on an admin-only page; no founder, investor, or LP surface is touched; no existing row's Resend/Approve/Reject behavior changes for any row that isn't explicitly deleted. Delete itself is the one genuinely destructive action in this workstream — irreversible by design, but narrowly scoped (never a company creator, never an admin, never a completed account) and gated behind an explicit two-step confirm, matching the existing company-delete UI pattern. **Cost impact:** none — one nullable Postgres column, no new services, no new dependencies. **Schema:** additive only (`User.setupQueueDismissedAt`), per the house `db push` convention.

## Part 21 sequencing

Single workstream, no conditional branches (Q66 confirmed = Option B). WS48.1 (schema) first, then WS48.2/.3 (server predicate + GET fields) in parallel with nothing blocking them, then WS48.4 (dismiss/undismiss) and WS48.5 (delete) in either order — both are unconditional and independent of each other — then WS48.6 (UI) last since it depends on all four routes existing. Total ~0.75–1 day.

## Part 21 roadmap bookkeeping

Until WS48 ships: `ROADMAP.md` gets a short `Planned` forward-pointer blockquote at the top of the Roadmap section (see below) plus a one-line annotation on the existing Approvals bullet. Once shipped: fold into "Existing Features" (Admin Features → Approvals), remove the blockquote, update the top `_Last updated_` line.

---

# Part 22 — Platform Audit (2026-08-04)

_Requested by the user: a second full audit, same exercise as Part 17, prompted by a fast-moving session that shipped Parts 18–21 (WS44–WS48) plus a batch of same-day, non-workstream commits outside the usual Felix-plans/Alvin-builds cycle: a real production incident (R2 storage credentials invalid for 167 days, plus a separately-diagnosed missing CORS policy on the replacement bucket), a founder-visibility fix for the founder's own `isInternal` uploads, branding changes (`ORG_NAME` default, email sender name, LP email copy), and an app-wide `text-muted`→`text-muted-foreground` contrast fix that had been repeated four times within the LP portal alone. None of the same-day commits had been folded into either doc yet. Scope, per the request: verify the same-day fixes are actually correct and complete; sweep the whole app (not just the LP portal) for the `text-muted` mistake; review Parts 18–21 end to end against the working tree; check both docs for staleness; re-run the two known recurring bug-shape sweeps; and specifically ask whether anything else in the app could be silently broken the way the R2 credentials were — exercised by no one, never verified, invisible until a user hits it._

## Method

Every claim below was checked against the actual code (`git log`, `git show`, `Read`, `grep`), not assumed from a commit message or this doc's own prior claims. `npm run typecheck`, `npx eslint src`, and `npm test` all run clean at audit time (0 type errors; 10 pre-existing warnings, same ones as Part 17, no new ones; **25 test files / 273 tests**, up from the 24/234 Part 17 recorded — see the staleness note below). No source files were changed — this Part is documentation-only, per the audit's own scope limits.

## Findings

**F42 — Document upload is non-atomic: the `Document` DB row is created before the client's S3/R2 `PUT` ever happens, with no confirmation step and no reconciliation for the orphaned row this leaves behind on any interruption.** `POST /api/documents/upload` (`src/app/api/documents/upload/route.ts:69-85`) calls `getUploadUrl()` then immediately `db.document.create(...)` and returns `{ uploadUrl, document }` — the row exists, fully formed (name, `isInternal`, `docType`, `s3Key`), before the browser has sent a single byte to storage. The actual `PUT` happens client-side afterward (`src/app/company/documents/page.tsx:98-103`, same shape on every other upload surface — `/diligence`, the admin company page, the setup wizard); if it fails for *any* reason — the exact R2-credential/CORS breakage from this session, but equally an expired presigned URL (1hr TTL, already a known low-severity item in `ROADMAP.md`), a dropped connection, or a closed tab before the `await` resolves — the client shows an error toast, but the `Document` row it already created stays in the database forever, looking exactly like a successful upload to anything that queries it. This is the root cause of the 16 "duplicate/phantom" `Document` rows manually deleted against production for one company this session: they weren't duplicates so much as retries against a broken upload path, each one leaving a fresh orphaned row. The fix that session was a one-off, unaudited script (see F43 below) — there is no reusable mechanism (an admin view, a cron reconciliation job, or a client-side "mark complete" callback with a server-side existence check) to find or clean up orphaned rows the next time this happens, and given the failure mode is "any transient upload interruption," it will happen again. Verified structurally safe to delete such rows when found: `prisma/schema.prisma` has no foreign key from any other model into `Document.id` (only `Document`'s own outgoing FKs to `Company`/`Update`/`User`), so a hard delete of an orphaned row leaves no dangling reference elsewhere in the schema. Not fixed here (code change, out of this audit's scope) — candidate for a small workstream: either (a) have the client call a lightweight `PATCH .../upload/[id]/confirm` after a successful `PUT` and only show "uploaded" once that round-trip completes (still doesn't retroactively clean up rows from *before* the fix), or (b) a cheap admin-facing "check for orphaned documents" tool that does a `HeadObjectCommand` against each `Document.s3Key` and flags/offers-to-delete any that 404 in storage — probably the more valuable of the two since it also gives an operator a way to self-diagnose a future credential/CORS-style outage instead of waiting for a founder to report it.

**F43 — No credential/CORS health-check exists for storage, which is exactly the blind spot that let the R2 credentials sit broken for 167 days.** `/admin/settings` has a "Send Test Email" button (`src/app/admin/settings/email-settings-panel.tsx`, backed by `POST /api/admin/test-email`) that gives an admin a one-click, low-stakes way to confirm Resend is actually working end-to-end — exactly the diagnostic that would have caught the storage breakage months earlier had an equivalent existed for S3/R2. `src/lib/s3.ts` has no test/health-check helper, and `/admin/settings`'s email panel is the only "diagnostics" surface in the app. This is the most direct answer to "is there anything else that could be silently broken the same way" — everything else with an external credential (Resend, Google OAuth, Anthropic) gets exercised constantly through ordinary product usage and fails loudly and immediately when it's broken (a login attempt errors visibly; a digest-generation click 500s in the admin's face); storage upload failures, by contrast, degrade to a toast a founder might not report, while the underlying `Document` row still gets created either way (F42), masking the failure from anyone who isn't specifically looking. Recommend a small "Send Test Upload" mirroring the existing email diagnostic: presign a tiny test object, `PUT` it client-side from the same `/admin/settings` page (which naturally also exercises CORS, the other half of this session's incident), then presign a `GET` and confirm it round-trips, deleting the test object after. Cheap, reuses `getUploadUrl`/`getDownloadUrl` as-is, no new dependency.

**F44 — Two independently-duplicated `EMAIL_FROM` fallback strings went out of sync during today's branding pass.** `src/lib/email.ts:7` (the value actually used to send every email) was updated from `` process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>" `` to `` process.env.EMAIL_FROM || \`Molly from ${ORG_NAME} <noreply@dfs.vc>\` `` (commit `f592db9`), but `src/app/admin/settings/page.tsx:17` — a second, separate copy of the same fallback, used only for the settings page's read-only "FROM address display" — was not touched and still reads `` process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>" ``. In production this is invisible either way, since `EMAIL_FROM` is set (currently `DFS <updates@dfslab.net>` per this session's own branding commits) and both expressions short-circuit to the real env value. It would only surface if `EMAIL_FROM` were ever unset: the settings page would then display a stale string that no longer matches what `email.ts` would actually send from, which is a second-order bug an admin debugging a real email problem could waste time chasing. Independently worth flagging: the fallback for *both* copies is still the `noreply@dfs.vc` domain, not `dfslab.net` — if `EMAIL_FROM` is ever unset (a misconfigured redeploy, a Vercel env-var scope mistake), every transactional email would silently start sending from a different domain than the one this session's branding work just moved to. Whether `dfs.vc`'s sending domain is still verified in Resend (separately from `dfslab.net`) isn't something code-reading can confirm — worth a manual check, since if it isn't, an unset `EMAIL_FROM` would mean Resend rejecting every send outright rather than merely displaying wrong branding. Cheap fix either way: have `admin/settings/page.tsx` import the same `FROM` constant from `email.ts` (already exported? — currently it isn't; a one-line `export` would do it) instead of re-deriving its own copy, closing the drift permanently rather than just this once.

**F45 — `PATCH /api/documents/[id]` (archive/unarchive/retype) is not audit-logged, despite being exclusively an admin action as of this session's own F39 fix (WS46).** Every other admin mutation route in the app calls `logAdminAction()` (verified by grep: 45 route files under `src/app/api/**` do) — approvals, provider/digest/note/sector/template CRUD, member adds, manual reminders, test emails, and now the WS48 dismiss/undismiss/delete actions on the awaiting-setup queue, per `ROADMAP.md`'s own description of what `/admin/audit` covers. `PATCH /api/documents/[id]` (`src/app/api/documents/[id]/route.ts`) is not among them, and it's the one route in the app where this gap changed character this session: before F39 it was reachable by any founder (an oversight, not a designed admin action, so its absence from the audit log was arguably consistent with "founder actions aren't audited"); after F39 it's `requireAdmin()`-gated exclusively, making it — structurally — indistinguishable from every sibling admin-CRUD route that *is* logged. An admin archiving, unarchiving, or retyping any document (including an `isInternal`-flagged one like a founder's passport) now leaves zero trace in `/admin/audit`. Low-to-moderate severity (archive/retype is reversible and not itself a disclosure risk), but worth closing given the pattern this session already established for exactly this shape of gap (F39 itself, and WS48's own audit-logged Dismiss/Delete). Cheap fix: one `logAdminAction()` call added to the existing `PATCH` handler, same shape as any of the 45 existing call sites.

**F46 — `SETUP.md`'s Cloudflare R2 setup instructions have no CORS-configuration step, which is exactly the gap that caused half of this session's real incident** (valid credentials, but the browser was still blocked from completing the `PUT` because the bucket had no CORS policy at all). `SETUP.md:73-79` walks a fork operator through creating the bucket, an API token, and filling in the four `S3_*` env vars — nothing about CORS. A new fork following this doc today would hit the identical silent failure mode DFS Lab's own instance did: credentials valid, uploads still failing at the browser, with no error message pointing at the real cause (S3/R2 access-denied-style errors and CORS preflight failures both surface to the browser as a generic failed fetch). This is a documentation-only fix and squarely in scope for a future doc pass, but `SETUP.md` is not one of the files this agent is permitted to edit directly (scope is `ROADMAP.md`/`README.md`/`docs/**`) — flagged here rather than fixed, for whoever next touches `SETUP.md` (recommended addition: a short step after bucket creation — "Settings → CORS Policy → allow your app's origin(s) for GET/PUT/HEAD" — plus a one-line pointer at F43's proposed test-upload diagnostic once it exists, as the way to confirm both credentials and CORS are actually working before relying on it).

## Verification of this session's same-day (non-workstream) commits

Read the actual diffs for each, not just the commit messages:

- **R2 credential rotation + CORS fix (`src/lib/s3.ts`)** — no code change was needed or made; the bug was purely infrastructure (invalid credentials, then a missing bucket-level CORS policy), both fixed outside the repo. `src/lib/s3.ts` was read in full: presigned-URL generation, bucket/region/endpoint all correctly env-driven, nothing hardcoded that could reintroduce the same failure. See F43 above for the real gap this incident exposes — no way to verify this class of fix without a real end-to-end upload attempt, which is exactly what's missing as a standing diagnostic.
- **Founder's-own-`isInternal`-doc visibility fix (commit `53c82ed`)** — verified correct and complete. `GET /api/companies/[id]/documents` (`src/app/api/companies/[id]/documents/route.ts:37`) now filters `isInternal: false OR uploadedById: me` for non-admins (was a blanket `isInternal: false`); `/company/documents` (`src/app/company/documents/page.tsx:279-288`) renders a "Received" badge with no View/Download affordance for any row where `doc.isInternal` is true, which — given the server-side filter — can now only ever be the viewer's *own* internal upload, never a teammate's (the server query itself excludes a teammate's `isInternal` row entirely; the client-side suppression is defense-in-depth, not the real gate). Confirmed the two content-serving routes are untouched and still block: `GET /api/documents/[id]` (`src/app/api/documents/[id]/route.ts:33-35`) and `GET /api/documents/[id]/view` (`src/app/api/documents/[id]/view/route.ts:29-31`) both still 403 a non-admin on any `isInternal` document regardless of `uploadedById` — a founder can see that their own passport exists, but still can't open it, matching the commit message's claim exactly.
- **Branding changes (`ORG_NAME` "DFS Lab"→"DFS", email sender name, LP email copy, `src/app/admin/funds/page.tsx` literal-string replacements)** — verified as described (see F44 above for the one real gap this pass left behind: the duplicated, now-stale `admin/settings/page.tsx` fallback). `ORG_NAME`'s single source of truth (`src/lib/org.ts`) is correctly the only place the default lives; the two `/admin/funds` literal "DFS Lab" strings now correctly reference `ORG_NAME`; the LP report-published email's `fundName`-mention clause and its reply-to (`TEAM_EMAIL` instead of `SUPPORT_EMAIL`) both match the commit messages.
- **`text-muted` → `text-muted-foreground` app-wide sweep** — see its own section below; the LP portal fix (commit `d8bf3b3`) is complete for the 4 files it touched, and a full app-wide grep found **no other instance of the mistake anywhere else in the app** (see below).
- **16 duplicate/phantom `Document` rows deleted for one company ("Acme")** — confirmed structurally safe (no dangling FK per F42's schema check above), but this ran as an ad hoc script against production, not through any UI or audited endpoint, so — unlike literally every other admin deletion in this app — it left no `AuditLog` row. Not a code bug (nothing in the repo needed to change for this to have happened safely), but worth naming as a process gap: the app has no self-service way for an admin to find and clean up this exact failure mode (see F42/F43's proposed tooling) without a human running a one-off script directly against the production database.

## Review of Parts 18–21 against the working tree

- **Part 18 (WS44, DD completion signal):** `recomputeDiligenceCompletion()` (`src/lib/diligence.ts:106-137`) and `notifyIfJustCompleted()` (`src/app/api/companies/[id]/diligence/route.ts:23-46`) both verified: the null→non-null `completedAt` transition is the sole trigger, the admin-session suppression (`if (opts.user.roles.includes("ADMIN")) return;`) is real, and the founder-facing checklist page (`src/app/diligence/page.tsx:162`) re-fetches (`loadDiligence`) immediately after every successful document upload, so the completing upload's own request is guaranteed to observe and fire the transition in the same session — no dependency on the founder happening to reload the page later. The admin queue route (`src/app/api/admin/diligence/route.ts`) recomputes `completedAt` too (keeping `/admin/diligence`'s "Ready for review" split live) but correctly never imports or calls the notification helper at all, rather than relying on the role check alone — belt-and-suspenders, no double-fire or missed-fire risk either way.
- **Part 19 (WS45, inline viewing, F37/F38):** `isInlineViewable()` (`src/lib/documents.ts`) matches its documented PDF/PNG/JPEG/GIF/WebP allowlist exactly. Both `GET /api/documents/[id]/view` and the update-detail attachments route now carry the `isInternal` role check verified above and in F37/F38's own description — confirmed by reading the actual route code, not just the plan doc.
- **Part 20 (WS46–WS47, founder document upload, F39):** `PATCH /api/documents/[id]` verified `requireAdmin()`-gated with the client-side archive/retype UI removed from `/company/documents` entirely (Q65 = A) — matches. See F42/F45 above for two gaps this Part's own review surfaced that weren't part of its original scope.
- **Part 21 (WS48, awaiting-setup queue hygiene, F40/F41):** every route (`dismiss`, `undismiss`, `DELETE`, `awaiting`) read in full and matches the plan precisely, including `canHardDeleteFromQueue()`'s truth table (`src/lib/setup-token.ts:40-47`) and the `admin/approvals/page.tsx` UI's stale-grouping/confirm-to-delete pattern. One additional check this audit ran that the original plan didn't explicitly call out: whether any *other* required, non-cascading FK into `User` (beyond `Company.createdById`, which the predicate already guards) could make a "safe" delete throw anyway — `ShareableLink.createdById`, `Document.uploadedById`, `Comment.authorId`, `CompanyNote.createdById`, `UpdateTemplate.createdById`, and `FundReport.createdById` are all such FKs, but every one of them requires an authenticated session to create (`requireAuth`/`requireCompanyAccess`/`requireAdmin`), and `canHardDeleteFromQueue()` already excludes anyone with `passwordHash` set — i.e., anyone who has ever actually logged in. A user still sitting in the awaiting-setup queue has never authenticated, so cannot own any of these rows; the predicate is safe without needing to check them explicitly. Confirmed, not merely assumed.

## `text-muted` vs `text-muted-foreground` — app-wide sweep

Confirmed the root cause first: `tailwind.config.ts:26-28` defines `muted.DEFAULT` from `--color-muted-rgb` (Bone, `#D8D6CB`, the same token used for backgrounds/borders) and `muted.foreground` from `--color-text-muted` (`#66645A`, the actual WCAG-checked muted-text color) — so `text-muted` renders text in the Bone background color, nearly invisible against the Paper canvas or a white input field, while `text-muted-foreground` is correct. Two independent greps across the whole `src` tree (`text-muted\b` excluding `-foreground` matches, and separately `className="[^"]*\btext-muted\b"`) found **zero remaining instances of the mistake anywhere in the app outside the four LP-portal files already fixed in commit `d8bf3b3`** (`src/app/lp/layout.tsx`, `src/app/lp/page.tsx`, `src/app/lp/reports/[id]/page.tsx`, `src/components/lp/lp-login-form.tsx`). The only other `text-muted`-adjacent matches in the codebase are the CSS custom-property name `--color-text-muted` itself (a real, correctly-used token, not the buggy Tailwind class) and code comments referencing it. This looks like it really was scoped to the LP portal's own original build, not a codebase-wide habit — no further action needed.

## Bug-pattern sweep (per the audit's standing request)

- **"Sessionless client hits session-gated auth middleware"**: Parts 18–21 introduce no new public/no-session surface — `/company/documents`, `/diligence`, `/admin/diligence`, and `/admin/approvals`'s new dismiss/delete routes are all ordinary authenticated founder/admin routes gated the normal way, and `src/lib/route-access.ts`'s `PUBLIC_PREFIXES` list is unchanged this session. No new instance found.
- **"Client posts field names the API doesn't read"**: spot-checked every new/changed client→API call site from Parts 18–21 — `/diligence`'s `PATCH` body (`isUsIncorporated`/`stellarWhyText`/`stellarTimelineText`) matches the API's destructured fields exactly; `/company/documents`'s upload-init body (`companyId`/`name`/`mimeType`/`docType`/`isInternal`) matches `POST /api/documents/upload`'s destructured fields exactly; WS48's dismiss/undismiss/delete routes take no client body at all (id is a route param). No mismatch found.

## Documentation staleness found and corrected in this same edit

- **`ROADMAP.md` and this file had zero mention of any of this session's same-day, non-workstream fixes** (R2/CORS incident, the founder-own-doc visibility fix, the branding pass, the `text-muted` sweep) — all now folded into `ROADMAP.md`'s "Existing Features" and this Part, continuing the F-numbering from Part 16/17's last-used F41.
- **`ROADMAP.md`'s test-count annotation** (added in Part 17, "24 test files / 234 tests") is now further stale — the suite has grown to 25 files / 273 tests. Annotated in place rather than rewritten, matching this doc's own established convention for exactly this kind of drift (Part 17 did the same to its own predecessor's numbers).
- No other false "shipped" or "planned" claims were found in either doc's existing sections during this pass — every Part 18–21 claim checked against the working tree matched.

## What's next

Five findings (F42–F46), none blocking, all cheap: F43 (storage test-upload diagnostic) and F42 (upload-confirmation / orphan-detection) are the two most valuable given this session's real incident and are natural companions — worth scoping together as a small follow-up workstream. F45 (audit-log the now-admin-only document PATCH) is a one-line addition. F44 (fallback-string drift) is a trivial dedup. F46 (SETUP.md CORS step) needs a human or a differently-scoped agent to actually touch `SETUP.md`, which is outside this audit's edit permissions.

---

# Part 23 — Platform Audit Follow-Up: Storage Integrity, Audit-Log Coverage & Docs (F42–F46, WS49–WS53)

_Requested by Joseph 2026-08-04: turn Part 22's five findings (F42–F46) into a proper implementation plan — decision banner, findings recap, goal/code-sketch/acceptance-checklist per workstream, matching every prior Part's convention. **Q67 and Q68 confirmed by Joseph 2026-08-04, both per Felix's recommendation exactly: Q67 = Option B (admin-reviewed list before delete, scan-only for v1 — no write-path confirm signal) and Q68 = fold the new diagnostics into the existing `/admin/settings` page, beside the existing Email section.** This is now locked in throughout WS49/WS50 below: no conditional branches, no "if Q67 = A/C" or "if Q68 = B" alternates. **Planning only. No code has been written or changed as part of this Part, and Alvin has not been engaged — Joseph confirmed the two open decisions but has not green-lit implementation; that is a separate, later step.**_

## Method

Every claim in Part 22's own write-up for F42–F46 was re-verified against the current working tree before scoping anything, per house convention — not re-derived, but not trusted either:

- **F42 re-confirmed exactly as described, plus one additional call site Part 22's own write-up didn't enumerate.** `POST /api/documents/upload` (`src/app/api/documents/upload/route.ts:69–85`) still calls `getUploadUrl()` then `db.document.create(...)` and returns before any `PUT` happens — unchanged. Four client call sites all follow the same init→PUT shape: `src/app/company/documents/page.tsx:81–103`, `src/app/admin/companies/[id]/page.tsx` (`~507–511`), `src/app/setup-wizard/page.tsx` (`~199–210`), and `src/components/ui/rich-editor.tsx:142–165` (the update composer's inline-image picker). The first three all check the PUT's response (`if (!putRes.ok) throw new Error(...)`) and surface a toast — matching Part 22's "the client shows an error toast" framing. **`rich-editor.tsx` does not** — read in full: line 157's `PUT` result is never assigned or checked at all (`await fetch(uploadUrl, { method: "PUT", ... })` with no `if (!res.ok)` guard), and the very next line unconditionally inserts `<img src="/api/documents/{document.id}/view">` into the update body regardless of whether the upload actually landed. This is the same root cause as F42 (no confirmation step), just with no client-side error surfaced at all — a founder gets a permanently broken inline image in a published update with zero indication anything failed. Folded into F42 below (WS50) as additional verification detail, not a new finding number — it's the same root cause Part 22 already identified, on a call site the original audit's grep pass over the three form-based upload pages missed. Schema re-check holds: `prisma/schema.prisma:210–228`'s `Document` model has exactly three outgoing FKs (`company`, `update`, `uploadedBy`) and, confirmed by grepping every other model, zero incoming FKs — a hard `db.document.delete()` on an orphaned row is still safe.
- **F43 re-confirmed.** `src/lib/s3.ts` (48 lines, read in full) exports only `getUploadUrl`/`getDownloadUrl` — no `HeadObjectCommand`/`DeleteObjectCommand` import anywhere in the file or the codebase (`grep -rln "HeadObjectCommand\|DeleteObjectCommand" src` — zero matches). `@aws-sdk/client-s3` (already a dependency, `package.json:30`, `^3.990.0`) exports both, so adding either needs no new package. `/admin/settings`'s Email section (`src/app/admin/settings/email-settings-panel.tsx` + `POST /api/admin/test-email/route.ts`) is confirmed as the pattern to mirror: a `requireAdmin()`-gated route, a `logAdminAction()` call (`"TEST_EMAIL_SENT"`), and a small client panel with idle/sending/success/error states rendering a `Button` + inline status text.
- **F44 re-confirmed.** `src/lib/email.ts:7` — `` const FROM = process.env.EMAIL_FROM || `Molly from ${ORG_NAME} <noreply@dfs.vc>`; `` — not exported (confirmed: `grep -n "^export" src/lib/email.ts` lists 15 `send*` functions, no `FROM`). `src/app/admin/settings/page.tsx:17` — `` const emailFrom = process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>"; `` — an independent, now-stale copy, used only to render the "Sending from:" line in `EmailSettingsPanel`. Both still short-circuit to the same real `EMAIL_FROM` env value in production, so this remains invisible today, exactly as Part 22 described.
- **F45 re-confirmed.** `src/app/api/documents/[id]/route.ts`'s `PATCH` handler (lines 53–106) calls `const { error } = await requireAdmin();` — no `user` destructured, no `logAdminAction` import, no call anywhere in the file. Confirmed the house pattern to mirror lives one directory over: `src/app/api/admin/templates/[id]/route.ts`'s own `PATCH` derives its audit action name from a ternary on the archive flag (`body.archived === true ? "TEMPLATE_ARCHIVED" : body.archived === false ? "TEMPLATE_UNARCHIVED" : "TEMPLATE_UPDATED"`) — the exact shape this workstream reuses for `docType`/`archive`. Confirmed the only real caller today (`src/app/admin/companies/[id]/page.tsx:550–554`) sends `{ archive }` only, never `docType` (docType is set once at upload time, per Part 20's own Method section) — so the "retyped" branch is defensive/future-proof today, not dead weight added for no reason.
- **F46 re-confirmed.** `SETUP.md:73–79`'s Cloudflare R2 steps (create bucket → API token → fill in four `S3_*` vars) have no CORS step, confirmed by reading the full section. Separately noticed, out of scope for this Part: `SETUP.md`'s prerequisites still mention `pgvector` (removed from the codebase with the OpenAI RAG chatbot, per `MEMORY.md`) — a real doc-staleness item, but a distinct one from F46 and not part of the five findings Joseph asked to be scoped here; flagging it here only so it isn't lost, not proposing a workstream for it.

## Product decisions (Q67–Q68) — confirmed by Joseph 2026-08-04

Both questions below were genuine forks, not technical calls — per protocol, neither was silently decided. Both are now confirmed, each matching Felix's recommendation exactly.

### Q67 — How aggressive should orphaned-`Document`-row reconciliation be?

Three shapes were possible for what happens once a scan finds a `Document` row whose `s3Key` doesn't exist in storage:

- **Option A — fully automatic delete.** The scan itself deletes any row it finds orphaned, no human in the loop. Fastest to use, zero admin effort, but the riskiest: a `HeadObjectCommand` false negative (a transient credentials/network blip *during the scan itself*, a bucket/region misconfiguration, or any bug in the check) would silently and permanently destroy a real, legitimate document row with no recovery path — the exact opposite of what this workstream should do, given the incident that prompted it was itself a credentials problem.
- **Option B — admin-visible review list, manual delete per row.** The scan is read-only and lists candidates (name, company, uploader, upload date); an admin reviews and deletes individually, each delete re-verified server-side (a second `HeadObjectCommand` at delete time, not just trusting the earlier scan result) and audit-logged. Matches this codebase's own established precedent for exactly this shape of decision — Part 21/Q66 deliberately chose a guarded manual delete over silent automatic cleanup for the awaiting-setup queue, for the same reason (irreversible action, real user data, low but non-zero false-positive risk).
- **Option C — read-only report only, no delete affordance in-app at all.** The scan lists candidates but offers no delete button; an admin who wants to clean up still runs a one-off script against production, same as this session's own manual cleanup of the 16 Acme rows. Safest, but doesn't actually close the gap Part 22 flagged — "no self-service way to fix this without a human running a script directly against the production database" is the problem statement, not an acceptable end state.

**Decided: Option B**, matching Felix's recommendation exactly — the one that actually gives an admin standing, repeatable, self-service tooling (closing the real gap) without the destructive blast radius of Option A, and it costs about the same to build as Option C once the scan-and-list UI exists anyway. This is now locked in throughout WS50 below: no conditional branches, no "if Q67 = A/C" alternates — the scan is read-only and every delete is a guarded, individually-reviewed, audit-logged admin action.

**Also confirmed as part of this same question: no write-path "confirm" signal in v1** (Part 22's option (a) — the client calling a lightweight endpoint after a successful `PUT`, so future orphans are prevented rather than only detected later). Scan-only, matching Felix's recommendation: the scan tool (Option B above) checks ground truth directly (does the object exist in the bucket), so it's a complete, self-sufficient answer to F42 on its own; it doesn't depend on any client ever calling back, so it also catches the "tab closed before any confirm request could fire" case that a confirm-step alone would still miss. A confirm-step would touch five client call sites (`company/documents`, `admin/companies/[id]`, `setup-wizard`, `diligence`, `rich-editor`) plus a new schema column, for a benefit (faster detection) that a periodically-run scan already delivers at a fraction of the cost. Deferred, not built here — cheaply reversible: adding a confirm step later is a small, additive follow-on, not a rework of anything WS50 builds.

### Q68 — Does the storage health-check (and the orphan-scan tool) need its own page, or fold into `/admin/settings`?

- **Option A — fold both into `/admin/settings`, as new sections beside Email/Reminders/Digest Recipients.** The page's own description (`src/app/admin/settings/page.tsx:24`, "Platform configuration and diagnostics") already frames it as exactly this kind of surface, and the Email section is a byte-for-byte precedent for the test-upload panel (button + status, `requireAdmin`-gated route, `logAdminAction` call). No new sidebar entry, no new route-access consideration, no new page shell to build.
- **Option B — a dedicated `/admin/storage` (or `/admin/documents`) page.** Justifiable if the orphan-review list ever grows into something that needs its own real estate (pagination, filters, bulk actions) — but nothing about F42/F43 as scoped needs that; the scan is a single on-demand action and the review list is expected to be small (this session's own incident produced 16 rows for one company, not thousands).

**Decided: Option A**, matching Felix's recommendation exactly — matches the page's own stated purpose, costs less to build, and is trivially reversible — extracting a panel into its own page later is a mechanical move, not a rework, if the orphan list ever does grow large enough to need one. This is now locked in throughout WS49/WS50 below: both new panels live on `/admin/settings`, beside the existing Email section, no separate page.

## WS49 — Storage Test-Upload Diagnostic (F43) — ~0.25–0.5 day

**Goal:** give an admin a one-click way to confirm S3/R2 credentials *and* CORS are actually working end-to-end, mirroring the existing "Send Test Email" pattern — the diagnostic that would have caught the 167-day R2 outage immediately instead of only surfacing when a real founder hit it.

Per Q68 (confirmed = Option A): both new panels live on `/admin/settings`, beside the existing Email section — no new page, no new sidebar entry.

### WS49.1 `src/lib/s3.ts` — add `objectExists` and `deleteObject`

```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
// ...existing getClient()/BUCKET/getUploadUrl()/getDownloadUrl() unchanged...

/**
 * Check whether an object actually exists in the bucket. Used by the
 * storage test-upload diagnostic (Part 23, WS49) and the orphaned-document
 * scan (Part 23, WS50) — both need to answer "is this key really there?"
 * rather than trust anything client-reported.
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw err; // a real credentials/permission/network error should surface, not be swallowed as "missing"
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

### WS49.2 `src/app/api/admin/storage/test-upload/route.ts` (new) — issue a presigned URL for a throwaway key

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth-guard";
import { getUploadUrl } from "@/lib/s3";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const key = `_health-check/${randomUUID()}.txt`;
  const uploadUrl = await getUploadUrl(key, "text/plain");
  return NextResponse.json({ uploadUrl, key });
}
```

### WS49.3 `src/app/api/admin/storage/test-upload/confirm/route.ts` (new) — verify + clean up

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists, deleteObject } from "@/lib/s3";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { key } = await request.json();
  if (typeof key !== "string" || !key.startsWith("_health-check/")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  try {
    const exists = await objectExists(key);
    if (!exists) {
      await logAdminAction(user!, "STORAGE_TEST_UPLOAD_FAILED", {
        metadata: { key, reason: "object not found after PUT" },
      });
      return NextResponse.json(
        { error: "The browser's upload never reached storage — check S3/R2 credentials and CORS policy." },
        { status: 502 }
      );
    }
    await deleteObject(key);
    await logAdminAction(user!, "STORAGE_TEST_UPLOAD_SUCCEEDED", { metadata: { key } });
    return NextResponse.json({ success: true });
  } catch (err) {
    await logAdminAction(user!, "STORAGE_TEST_UPLOAD_FAILED", {
      metadata: { key, reason: err instanceof Error ? err.message : "unknown" },
    });
    return NextResponse.json({ error: "Could not verify or clean up the test object." }, { status: 500 });
  }
}
```

### WS49.4 `src/app/admin/settings/storage-settings-panel.tsx` (new) — mirrors `email-settings-panel.tsx` exactly

```tsx
"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "uploading" | "verifying" | "success" | "error";

export function StorageSettingsPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleTestUpload() {
    setStatus("uploading");
    setMessage(null);
    try {
      const initRes = await fetch("/api/admin/storage/test-upload", { method: "POST" });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Could not get a presigned URL.");

      // Same code path a real document upload takes — this exercises the
      // browser-side CORS preflight, not just the server-side credentials.
      const putRes = await fetch(initData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "molly-storage-health-check",
      });
      if (!putRes.ok) throw new Error("The browser could not PUT to storage — likely a CORS policy issue.");

      setStatus("verifying");
      const confirmRes = await fetch("/api/admin/storage/test-upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: initData.key }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "Verification failed.");

      setStatus("success");
      setMessage("Upload, verification, and cleanup all succeeded.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Test upload failed.");
    }
  }

  const busy = status === "uploading" || status === "verifying";

  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleTestUpload} disabled={busy}>
          <Send className="mr-2 h-3.5 w-3.5" />
          {status === "uploading" ? "Uploading..." : status === "verifying" ? "Verifying..." : "Send Test Upload"}
        </Button>
        {status === "success" && (
          <span className="flex items-center gap-1.5 text-sm text-acacia">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-laterite">
            <XCircle className="h-4 w-4" />
            {message}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Uploads a small file directly from your browser — the same path a real document upload takes — verifies it
        landed in storage, then deletes it. Exercises credentials and CORS together.
      </p>
    </>
  );
}
```

### WS49.5 `src/app/admin/settings/page.tsx` — new "Storage" section

```tsx
import { HardDrive } from "lucide-react"; // add to existing lucide-react import
import { StorageSettingsPanel } from "./storage-settings-panel";
// ...

<section className="mt-6 rounded-xl border border-border bg-card p-6">
  <div className="mb-5 flex items-center gap-3">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
      <HardDrive className="h-5 w-5 text-primary" />
    </div>
    <div>
      <h2 className="text-sm font-semibold text-foreground">Storage</h2>
      <p className="text-xs text-muted-foreground">Document uploads via S3-compatible storage</p>
    </div>
  </div>
  <StorageSettingsPanel />
</section>
```

Placed after the Email section (same "external credential" category), before Reminders.

**WS49 acceptance checklist**
- [ ] "Send Test Upload" succeeds on a correctly-configured environment (real click-through against production, not just code review)
- [ ] Deliberately breaking `S3_ACCESS_KEY_ID` (or simulating via a bad bucket name) makes the button fail with a clear, actionable message, not a raw stack trace
- [ ] The test object never persists — confirmed by checking the bucket after a successful run (nothing under `_health-check/`)
- [ ] Both success and failure paths write an `AuditLog` row (`STORAGE_TEST_UPLOAD_SUCCEEDED` / `STORAGE_TEST_UPLOAD_FAILED`), visible on `/admin/audit`
- [ ] No new dependency added — `HeadObjectCommand`/`DeleteObjectCommand` come from the already-installed `@aws-sdk/client-s3`
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive only — a new section on `/admin/settings`, admin-only, no founder/investor-facing change. **Cost impact:** none — reuses the existing S3/R2 credentials and the already-installed AWS SDK; the test object is bytes, not a billable event beyond what any single real upload already costs.

## WS50 — Orphaned Document Detection & Reconciliation (F42) — ~0.75–1.25 day

**Goal:** give an admin a repeatable, self-service way to find and clean up `Document` rows whose S3/R2 object doesn't actually exist — closing the gap that made this session's 16-row cleanup a one-off, unaudited script — and fix the one call site (`rich-editor.tsx`) that doesn't even surface an error today.

Per Q67 (confirmed = Option B): the scan is read-only, and every deletion is a guarded, individually-reviewed, audit-logged admin action — no automatic cleanup, and no write-path confirm step in v1 (scan-only, also confirmed under Q67 above).

### WS50.1 `src/lib/s3.ts`

Reuses `objectExists` from WS49.1 — no additional changes needed here.

### WS50.2 `src/app/api/admin/documents/orphan-scan/route.ts` (new) — read-only scan

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists } from "@/lib/s3";

// Caps concurrent HeadObject calls so a large Document table doesn't open
// hundreds of simultaneous requests against S3/R2 in one scan.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const documents = await db.document.findMany({
    select: {
      id: true,
      name: true,
      s3Key: true,
      createdAt: true,
      archivedAt: true,
      company: { select: { name: true } },
      uploadedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const checked = await mapWithConcurrency(documents, 10, async (doc) => ({
    doc,
    exists: await objectExists(doc.s3Key),
  }));

  const orphaned = checked.filter((c) => !c.exists).map((c) => c.doc);
  return NextResponse.json({ scanned: documents.length, orphaned });
}
```

No DB writes here — safe to run any time, same low-stakes ethos as "Send Test Email."

### WS50.3 `src/app/api/admin/documents/[id]/orphan/route.ts` (new) — guarded delete (Q67 confirmed = Option B)

```ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists } from "@/lib/s3";
import { logAdminAction } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const document = await db.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Re-verify at delete time, not just trusting the earlier scan result —
  // cheap, and guards against acting on a stale list (e.g. this exact
  // row's upload was retried and actually landed in the interim).
  const exists = await objectExists(document.s3Key);
  if (exists) {
    return NextResponse.json(
      { error: "This document's file now exists in storage — refusing to delete. Re-run the scan." },
      { status: 409 }
    );
  }

  await db.document.delete({ where: { id } });
  await logAdminAction(user!, "DOCUMENT_ORPHAN_DELETED", {
    targetType: "Document",
    targetId: id,
    metadata: { name: document.name, companyId: document.companyId, s3Key: document.s3Key },
  });
  return NextResponse.json({ success: true });
}
```

`Document` has no incoming FKs (confirmed in Method above), so this is a plain `delete`, no cascade concerns.

### WS50.4 `src/app/admin/settings/orphaned-documents-panel.tsx` (new) — scan + review-list UI

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface OrphanedDoc {
  id: string;
  name: string;
  createdAt: string;
  company: { name: string };
  uploadedBy: { email: string };
}

export function OrphanedDocumentsPanel() {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);
  const [orphaned, setOrphaned] = useState<OrphanedDoc[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/documents/orphan-scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");
      setScanned(data.scanned);
      setOrphaned(data.orphaned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Permanently delete this document row? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}/orphan`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      setOrphaned((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleScan} disabled={scanning}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {scanning ? "Scanning..." : "Scan for orphaned documents"}
        </Button>
        {scanned !== null && (
          <span className="text-xs text-muted-foreground">
            {scanned} document{scanned === 1 ? "" : "s"} checked, {orphaned.length} orphaned
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-laterite">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      {orphaned.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Uploaded by</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orphaned.map((doc) => (
                <tr key={doc.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{doc.name}</td>
                  <td className="px-3 py-2">{doc.company.name}</td>
                  <td className="px-3 py-2">{doc.uploadedBy.email}</td>
                  <td className="px-3 py-2">{formatDate(doc.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {deletingId === doc.id ? "Deleting..." : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Checks every document's file against storage and lists any row whose file is missing (most often caused by
        an interrupted upload — a dropped connection, an expired link, or a storage outage). Nothing is deleted
        automatically; review each row before removing it.
      </p>
    </>
  );
}
```

Rendered inside the same "Storage" `<section>` as `StorageSettingsPanel` (WS49.5), beneath it, separated by a divider — both are storage diagnostics, and per Q68 (confirmed = Option A) this is the natural single home for the whole class.

### WS50.5 `src/components/ui/rich-editor.tsx` — check the PUT result before inserting the image

```tsx
const handleImageUpload = useCallback(
  async (file: File) => {
    if (!editor || !companyId) return;

    const res = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, name: file.name, mimeType: file.type, isInternal: false }),
    });
    if (!res.ok) return;
    const { uploadUrl, document } = await res.json();

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    // Part 23, WS50 (F42) — previously unchecked: the image was inserted
    // into the editor unconditionally, even when the PUT never reached
    // storage, leaving a silently-broken image reference in the update
    // body with no indication to the founder that anything failed.
    if (!putRes.ok) {
      window.alert("Image upload failed. Please try again.");
      return;
    }

    const imageUrl = `/api/documents/${document.id}/view`;
    editor.chain().focus().setImage({ src: imageUrl, alt: file.name }).run();
  },
  [editor, companyId]
);
```

`window.alert` matches this same file's existing pattern (`setLink`, a few lines above, already uses `window.prompt`) — no new UI idiom introduced. The now-orphaned `Document` row this failure path still creates is exactly what WS50.2–.4's scan/review tool exists to catch later.

### WS50.6 Tests

- New `src/lib/__tests__/s3-object-exists.test.ts` (or co-located with an existing s3 test if one exists) — mock the S3 client, assert `objectExists` returns `false` on a 404 and re-throws on any other error status (the "don't swallow a real credentials error as if the file were just missing" behavior called out in WS49.1's comment).
- New route-level test or manual-verification checklist item for `DELETE /api/admin/documents/[id]/orphan` confirming the re-verify-before-delete guard (409 when the object does exist) — matches the codebase's existing convention of testing pure/guard logic over full route integration where feasible.

**WS50 acceptance checklist**
- [ ] Scan correctly flags a document whose S3 key doesn't exist (verified against a deliberately-orphaned test row, not just code review) and does *not* flag any real, existing document
- [ ] Delete only succeeds when the object is confirmed still missing at delete time; re-uploading to the same key (or any other change that makes the object exist again) makes the delete request 409 instead of removing the row
- [ ] Every delete writes a `DOCUMENT_ORPHAN_DELETED` audit row with the document's name/company/key, visible on `/admin/audit`
- [ ] `rich-editor.tsx`'s image upload surfaces a clear failure to the founder and does not insert a broken image reference when the PUT fails (regression test or manual repro against a deliberately-broken upload URL)
- [ ] Scan performance is reasonable at the app's real document volume (concurrency-limited, not fully sequential) — spot-checked against production's real document count, not just a small local sample
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** additive only — a new review tool on `/admin/settings`, admin-only. The one behavior *change* is `rich-editor.tsx`'s new failure path, which only replaces "silently insert a broken image" with "show an alert and don't insert anything" — a strict improvement, no legitimate workflow regresses. **Cost impact:** none — reuses existing S3/R2 credentials and Prisma; `HeadObjectCommand` calls are billed identically to the `GetObjectCommand`/`PutObjectCommand` calls already happening on every normal upload/download.

## WS51 — Audit-Log the Document PATCH Route (F45) — ~0.1–0.25 day

**Goal:** close the one gap Part 22 found where an admin mutation route (`PATCH /api/documents/[id]`, admin-only since Part 20/F39) doesn't call `logAdminAction()`, unlike the other 45 admin mutation routes in the app.

### WS51.1 `src/app/api/documents/[id]/route.ts`

```ts
import { logAdminAction } from "@/lib/audit"; // add to imports

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      select: { companyId: true, archivedAt: true },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { user, error } = await requireAdmin(); // was: const { error } = ...
    if (error) return error;

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.docType !== undefined) {
      if (body.docType !== null && !VALID_DOC_TYPES.includes(body.docType)) {
        return NextResponse.json({ error: "Invalid docType" }, { status: 400 });
      }
      data.docType = body.docType;
    }
    if (body.archive === true) {
      data.archivedAt = new Date();
    } else if (body.archive === false) {
      data.archivedAt = null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.document.update({ where: { id }, data });

    // Part 23, WS51 (F45) — mirrors admin/templates/[id]/route.ts's exact
    // pattern: derive the action name from the archive flag, falling back
    // to "retyped" for a docType-only change (not reachable from any UI
    // today, per Method above, but the route accepts docType generically
    // so the log should describe it accurately if that ever changes).
    const action =
      body.archive === true ? "DOCUMENT_ARCHIVED" : body.archive === false ? "DOCUMENT_UNARCHIVED" : "DOCUMENT_RETYPED";
    await logAdminAction(user!, action, { targetType: "Document", targetId: id, metadata: { companyId: document.companyId } });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/documents/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**WS51 acceptance checklist**
- [ ] Archiving a document from `/admin/companies/[id]` writes a `DOCUMENT_ARCHIVED` row to `/admin/audit`; unarchiving writes `DOCUMENT_UNARCHIVED`
- [ ] `GET /api/documents/[id]` (the download-metadata route) is untouched — this fix only touches `PATCH`
- [ ] No behavior change to the actual archive/unarchive/retype functionality — this is logging-only
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** none visible to any founder or admin workflow — purely an internal audit-trail addition. **Cost impact:** none — one more `AuditLog` row per document mutation, same table already used by 45 other routes.

## WS52 — Dedup the `EMAIL_FROM` Fallback (F44) — ~0.1 day

**Goal:** close the duplicate-source-of-truth bug before it's forgotten — `admin/settings/page.tsx` should display whatever `email.ts` would actually send from, guaranteed, not an independently-maintained copy of the same literal.

### WS52.1 `src/lib/email.ts` — export the existing constant

```ts
export const FROM = process.env.EMAIL_FROM || `Molly from ${ORG_NAME} <noreply@dfs.vc>`;
```

(Was `const FROM = ...`, un-exported — this is the only change to this file. No other line in `email.ts` changes.)

### WS52.2 `src/app/admin/settings/page.tsx` — import instead of re-deriving

```ts
import { FROM as emailFrom } from "@/lib/email";
// delete: const emailFrom = process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>";
```

The rest of the file is unchanged — `emailFrom` is still passed to `<EmailSettingsPanel emailFrom={emailFrom} />` exactly as before, just sourced from one place instead of two.

**Deliberately not changed in this workstream:** the fallback literal's domain (`dfs.vc`, not `dfslab.net`). Part 22 flagged that this domain may not match `dfslab.net`'s actual verified-in-Resend status, but confirming that requires checking the Resend dashboard, not the code — out of scope for a dedup fix, and changing a fallback value that's never actually hit in production (since `EMAIL_FROM` is set) isn't something to bundle into a "remove duplication" workstream. **Flagged for Joseph:** worth a two-minute check in the Resend dashboard next time you're in there — if `dfslab.net` is verified and `dfs.vc` isn't, updating this one literal (now single-sourced, so a one-line change fixes both display and actual send behavior at once) closes the "every transactional email silently sends from an unverified domain if `EMAIL_FROM` is ever unset" risk Part 22 called out. Not blocking this workstream either way.

**WS52 acceptance checklist**
- [ ] `/admin/settings`'s "Sending from:" line renders identically to today (since `EMAIL_FROM` is set in production, this is a no-op in practice — confirm via a diff of the rendered page, not just code review)
- [ ] Grep confirms exactly one definition of the fallback string left in the codebase (`grep -rn "noreply@dfs.vc" src` → one hit, in `email.ts`)
- [ ] `npm run typecheck && npm run lint && npm test` green

**UX impact:** none in production today (both expressions already resolve to the real `EMAIL_FROM` env value); prevents a future silent-drift bug an admin could otherwise waste time chasing. **Cost impact:** none.

## WS53 — `SETUP.md` R2/S3 CORS Step (F46) — docs-only, ~0.1 day once someone with edit access applies it

**Goal:** close the gap where a new fork following `SETUP.md` today would hit this session's exact incident (valid credentials, silently-blocked browser uploads from a missing CORS policy). **This agent cannot apply this change** — `SETUP.md` is outside Felix's edit scope (`ROADMAP.md`/`README.md`/`docs/**` only) — so this workstream is the exact text to insert, for a human or a differently-scoped agent to apply.

### WS53.1 Recommended insertion into `SETUP.md`, immediately after the existing R2/S3 steps (currently ending at line 79)

```markdown
### Configure CORS (required — browser uploads will silently fail without this)

Document uploads happen directly from the browser to your bucket via a presigned URL. Without a CORS policy, the
browser blocks the upload with a generic network error that gives no indication CORS is the cause — credentials can
be completely valid and uploads will still fail.

**Cloudflare R2:**
1. In the bucket's Settings, find **CORS Policy** and add a rule allowing `GET`, `PUT`, and `HEAD` from your app's
   origin(s) — both your local dev URL (e.g. `http://localhost:3000`) and your production domain.

**AWS S3:**
1. In the bucket's **Permissions** tab, edit **Cross-origin resource sharing (CORS)** and add an equivalent policy
   allowing `GET`/`PUT`/`HEAD` from the same origin(s).

Once your app is deployed, use the **"Send Test Upload"** button on `/admin/settings` (Storage section) to confirm
credentials and CORS are both actually working — it exercises the exact same browser→bucket path a real document
upload takes.
```

The last paragraph's cross-reference to "Send Test Upload" should only be added once WS49 has actually shipped — if `SETUP.md` gets this fix before WS49 exists, drop that sentence for now and add it back later.

**WS53 acceptance checklist**
- [ ] A fresh fork following the updated `SETUP.md` end-to-end (R2 or S3) successfully completes a browser upload on the first try, with no CORS error
- [ ] No other section of `SETUP.md` is touched by this change

**UX impact:** none to the running app — documentation only, read by whoever sets up a new fork. **Cost impact:** none.

## Sequencing

Q67 and Q68 are both confirmed (Option B and Option A respectively), so every workstream below is final — no conditional branches left to resolve. Recommended build order, whenever implementation is green-lit: WS49 first (small, self-contained, and WS50's UI panel sits in the same "Storage" section WS49 creates — building WS50 first would mean placing its panel somewhere temporary). WS50 next (shares `objectExists` from WS49.1). WS51 and WS52 are both fully independent of WS49/WS50 and of each other — either order, or in parallel. WS53 is docs-only and has no code dependency on anything else, but its own text references WS49's "Send Test Upload" button by name, so it reads best applied after WS49 ships (not a hard blocker, just better sequencing). Total estimated effort: ~1.5–2.5 days across all five workstreams. **Still not handed to Alvin** — Joseph has confirmed the two open decisions, so this plan is final and ready, but implementation itself has not been green-lit; that remains a separate, later step.

## Roadmap bookkeeping

`ROADMAP.md`'s `Planned` forward-pointer blockquote (at the top of the Roadmap section, above the existing Part 22 audit blockquote, matching the "newest first" convention already used there) now states Q67/Q68 as confirmed rather than open, and that the plan is final and awaiting a separate implementation green light. The existing F44 annotation on the Fork Configuration bullet points at this Part's WS52. No other "Existing Features" bullet changes — nothing in this Part has shipped, so no shipped-feature language is added anywhere. Once WS49–WS53 actually ship (a future session, once Joseph green-lights Alvin), this section gets replaced with the usual shipped summary and folded into the relevant "Existing Features" bullets (Settings → new Storage section; Document Management → orphan reconciliation; Audit Log → document PATCH now covered).

---

# Part 24 — Optional Admin Note on LP Report-Published Email (WS54, F47)

_Requested by Joseph 2026-08-05, after a full design back-and-forth in which the feature and its copy were settled with an approved mockup — treated here as **decided**, then verified against the current working tree per house convention (claims re-read against real code, not trusted). **Confirmed feature:** an optional free-text note on the report-publish flow that renders as its own paragraph in the LP report-published email — after the "We've just published…" paragraph, before the "Read the Report" button — and, when left blank (the default), produces byte-identical output to today's email. **Also confirmed, independent of the note:** permanently remove "It's a short read." from the "We've just published…" paragraph. **Planning only — no code written; Alvin not engaged.** Joseph has said he is ready to hand to Alvin once this plan is written, but the implementation itself is a separate, later step._

## Method — what was verified

Every claim in the request was re-read against the working tree before scoping:

- **`sendLpReportPublishedEmail` is a fully-fixed template today.** `src/lib/email.ts:555–578`, read in full. Its opts are exactly `{ email, lpName?, fundName, reportTitle }` — no per-send customization surface exists. The body paragraph at line 567 ends with the literal "It's a short read." The button follows at line 569 as `<p>${primaryButton(link, "Read the Report →")}</p>`. So the note's insertion point (between lines 567 and 569) and the copy deletion are both exactly where the request describes.
- **The publish route is the only caller.** `grep` for `sendLpReportPublishedEmail` across `src/` returns exactly one call site: `POST /api/admin/reports/[id]/publish` (`src/app/api/admin/reports/[id]/publish/route.ts:135–140`), inside the opt-in `if (notify)` loop over `lpFundMembership` rows (best-effort per recipient, F12 lesson intact). No other production caller; two test files mock it (`report-publish-notify.test.ts`, `report-publish-fund-snapshot.test.ts`).
- **The publish route already audit-logs.** Line 150–154: `logAdminAction(user!, "REPORT_PUBLISHED", { targetType: "FundReport", targetId: id, metadata: { mentionCount, notify, ...(notifyResult ? { notifyResult } : {}) } })`. So capturing the note is a metadata addition to an existing call, not a new audit surface (settles the request's Q2 concern — JC-A below).
- **The confirm-publish dialog is client state on the report editor page.** `src/app/admin/reports/[id]/page.tsx` — `confirmPublish`/`notifyLps` are plain `useState` (lines 45–46); the dialog block is lines 307–342; the `notify` flag is sent from `handlePublish` at line 193 as `JSON.stringify({ notify: notifyLps })`. `notifyLps` has no reset logic anywhere — it simply persists in component state for the page's lifetime and resets on unmount/navigation. The note field will mirror this exactly (JC-D below).
- **No shared HTML-escape helper is imported by `email.ts`.** The codebase's only `escapeHtml` lives in `src/lib/pdf.ts:140–146` (escapes `&`, `<`, `>`, `"`) and is module-private — not exported, not imported anywhere else. `email.ts` interpolates its dynamic values raw. The one existing raw-HTML interpolation into an email body (`sendUpdatePublishedEmail`, `opts.body` at line 224) is deliberate — that value is trusted TipTap-generated markup — which is *not* the trust model for a plain-text note (see F47 and WS54.1).

## F47 — `sendLpReportPublishedEmail` interpolates admin/LP-authored text into the email HTML unescaped (pre-existing, low severity)

Found while verifying the sanitization question. The current template interpolates three dynamic values raw into HTML:

- `${opts.reportTitle}` inside `<strong>…</strong>` (line 567) — admin-authored (`FundReport.title`, validated only for length ≤200 and non-empty in `PATCH /api/admin/reports/[id]`, never HTML-escaped).
- `${firstName}` inside `heading(...)` (line 566) — derived from `opts.lpName`, which an admin sets on the LP record.
- `${opts.fundName}` in the **subject** line (line 563) — harmless: email subjects are plain text, not HTML, so no escaping is needed or wanted there.

A report title or LP name containing `<`, `>`, `&`, or `"` would break the email's markup today (e.g. a title like `Q1 & Q2 <SPV>` renders wrong or drops content). This is not a new issue this Part introduces — it is the *same* class of issue the new note field must avoid, so the cheapest correct move is to add the escape helper once and apply it to the note **and** to `reportTitle`/`firstName` in the same edit, closing F47 as a side effect. Severity is low (admin/LP-authored input, not attacker-controlled, and the blast radius is a single transactional email's own markup — no session, no stored XSS surface), which is why it went unnoticed; but it is a real correctness bug on the exact function being touched, so it is fixed here rather than left as a known raw interpolation next to a newly-escaped one.

## Judgment calls made (flagged per decision protocol, all cheaply reversible)

- **JC-A — the note is captured in the existing `REPORT_PUBLISHED` audit metadata, and nowhere else (no persistence, no visibility on the report later).** This matches the confirmed design (transient, per-publish, email-only). Two keys are added to the existing `metadata` object: `noteIncluded: boolean` and, when present, `note: <trimmed text>` (the verbatim note that went to LPs — audit rows live in the DB, never the repo, so no confidentiality concern with the public repo). No schema change. **Reversal:** delete the two keys. **Not escalated** because the confirmed spec already fixes the note as transient; if Joseph later wants the note *persisted and shown on the report itself or in a per-report send history*, that is a separate additive change (one nullable `FundReport` column) — noted here as available on request, not built, and not a blocker for this Part.
- **JC-B — a single local `escapeHtml` helper is added to `email.ts` (mirroring `pdf.ts`'s exactly) rather than exporting `pdf.ts`'s.** Importing an escape helper from the PDF module into the email module would be odd cross-module coupling; a private helper co-located in `email.ts` matches how `pdf.ts` already keeps its own. The note is treated as **plain text**: escape first, then convert `\n` → `<br>` so multi-line notes keep their line breaks without opening any raw-HTML/injection surface. **Reversal:** trivial (delete the helper + its call sites).
- **JC-C — the note is capped at 500 characters**, enforced both client-side (`maxLength={500}` on the textarea) and server-side (trim, then 400 if `>500`), mirroring the existing title-length validation pattern in `PATCH /api/admin/reports/[id]` (`length > 200` → 400). 500 comfortably fits the "short paragraph" the mockup shows. **Reversal:** change one constant. (This is the one spot closest to a product choice; flagged explicitly. If Joseph wants a different ceiling, it is a one-line change — not worth blocking the handoff.)
- **JC-D — the note field is plain component state with no special reset logic, matching `notifyLps` exactly.** It initializes empty, persists while the editor page stays mounted (so an unpublish → edit → republish within the same session re-shows the last-typed note — convenient, and consistent with how `notifyLps` already behaves for the checkbox beside it), and resets naturally on navigation or reload. No stale note survives leaving the page. This is the least-surprising behavior and adds zero code beyond the `useState`. **Reversal:** add a one-line reset in the publish/cancel handler if a fresh-every-time field is later preferred.

## WS54 — Optional admin note + "short read" copy removal + F47 escaping — ~0.5 day

**Goal:** add an optional, transient, per-publish free-text note to the LP report-published email, rendered only when non-empty and byte-identical to today when empty; permanently drop "It's a short read."; and escape the note plus the pre-existing raw `reportTitle`/`firstName` interpolations (F47) in the same edit.

### WS54.1 `src/lib/email.ts` — escape helper, new opt, conditional note paragraph, copy removal

Add a module-private helper near the other shared helpers (after `assertSent`, mirroring `pdf.ts:140–146` exactly plus a newline→`<br>` step for the multi-line note case):

```ts
/** Escapes plain-text values before interpolation into email HTML. Mirrors src/lib/pdf.ts. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

Then update `sendLpReportPublishedEmail`'s signature and body (note the new optional `note`, the escaped `reportTitle`/`firstName`, the dropped "It's a short read.", and the conditional paragraph slotted exactly between the intro paragraph and the button):

```ts
export async function sendLpReportPublishedEmail(opts: {
  email: string;
  lpName?: string | null;
  fundName: string;
  reportTitle: string;
  note?: string | null; // WS54: optional per-publish admin note; absent/blank → no paragraph
}) {
  const link = `${BASE_URL}/lp`;
  const firstName = opts.lpName?.trim() ? opts.lpName.trim().split(" ")[0] : null;

  // WS54: plain-text note — escape, then preserve author line breaks. Empty/blank
  // yields no markup at all, so the email is byte-identical to today when omitted.
  const noteTrimmed = opts.note?.trim();
  const noteParagraph = noteTrimmed
    ? `\n      <p style="margin: 0 0 24px;">${escapeHtml(noteTrimmed).replace(/\n/g, "<br>")}</p>`
    : "";

  const result = await resend.emails.send({
    from: FROM,
    replyTo: TEAM_EMAIL,
    to: opts.email,
    subject: `Your ${opts.fundName} report is here`,
    html: emailWrapper(`
      ${eyebrow("Fund Report")}
      ${heading(firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,")}
      <p style="margin: 0 0 24px;">We've just published <strong>${escapeHtml(opts.reportTitle)}</strong>, our latest letter on how the fund is doing, plus a look at the portfolio companies behind the numbers.</p>${noteParagraph}

      <p>${primaryButton(link, "Read the Report →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        If you have a question, or even a disagreement, just hit reply.
      </p>
      <p style="margin: 16px 0 0; color: ${C.tide};">The ${ORG_NAME} team</p>
    `),
  });
  assertSent(result, "lp-report-published");
}
```

Note: `subject` keeps `${opts.fundName}` raw — subjects are plain text (F47). The empty-note branch emits the exact same character sequence as today around the button (the intro `<p>` is immediately followed by the blank line + button `<p>`), satisfying the byte-identical requirement.

### WS54.2 `src/app/api/admin/reports/[id]/publish/route.ts` — accept, validate, forward, audit the note

Read and length-validate the note alongside the existing `notify` flag near the top of the handler (after `const notify = body?.notify === true;`, ~line 17):

```ts
const noteRaw = typeof body?.note === "string" ? body.note.trim() : "";
if (noteRaw.length > 500) {
  return NextResponse.json({ error: "Note must be 500 characters or fewer." }, { status: 400 });
}
const note = noteRaw || null;
```

Forward it into the per-recipient send (inside the `if (notify)` loop, ~line 135):

```ts
await sendLpReportPublishedEmail({
  email: m.lp.email,
  lpName: m.lp.name,
  fundName: report.fund.name,
  reportTitle: report.title,
  note, // WS54
});
```

Add it to the existing audit metadata (JC-A) — the `REPORT_PUBLISHED` call at ~line 150:

```ts
await logAdminAction(user!, "REPORT_PUBLISHED", {
  targetType: "FundReport",
  targetId: id,
  metadata: {
    mentionCount: mentionedIds.length,
    notify,
    noteIncluded: note !== null,
    ...(note ? { note } : {}),
    ...(notifyResult ? { notifyResult } : {}),
  },
});
```

Design note: the note is validated and audit-logged **regardless of `notify`**, but only *sent* when `notify` is true (it can only reach an email through the `if (notify)` loop). A note typed with the checkbox unchecked goes nowhere and is recorded as `noteIncluded: true` in the audit row but produces no email — acceptable, and the UI (WS54.3) will naturally only make the field meaningful alongside the checkbox. Keeping validation unconditional avoids a silent "your 600-char note was ignored because notify was off" surprise.

### WS54.3 `src/app/admin/reports/[id]/page.tsx` — note textarea in the confirm-publish dialog

Add state beside `notifyLps` (line 46):

```ts
const [lpNote, setLpNote] = useState("");
```

Send it from `handlePublish` (line 193):

```ts
body: JSON.stringify({ notify: notifyLps, note: lpNote.trim() || undefined }),
```

Render an optional textarea inside the confirm-publish block (lines 307–342), below the notify checkbox — shown only as a natural companion to it, matching the dialog's existing ochre styling and the app's native-control convention (no new UI library idiom). Sketch, placed after the `notifyLps` `<label>` and before the Cancel/Confirm buttons (or, for layout, as a full-width row beneath the existing `flex` row):

```tsx
{notifyLps && (
  <div className="mt-2 w-full">
    <label htmlFor="lp-note" className="mb-1 block text-xs text-ochre">
      Add a note to the email (optional)
    </label>
    <textarea
      id="lp-note"
      value={lpNote}
      onChange={(e) => setLpNote(e.target.value)}
      maxLength={500}
      rows={3}
      placeholder="A short personal note — appears above the “Read the Report” button. Leave blank to send the standard email."
      className="w-full rounded-sm border border-ochre/40 bg-white/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ochre/50"
    />
    <p className="mt-1 text-right text-xs text-muted-foreground">{lpNote.length}/500</p>
  </div>
)}
```

Gating the textarea behind `notifyLps` keeps the field from implying it does anything when no email is being sent (mirrors the server design note in WS54.2). JC-D: `lpNote` is never explicitly reset — it persists with the page like `notifyLps`.

### WS54.4 Tests — extend `src/lib/__tests__/report-publish-notify.test.ts`

The existing suite mocks the email fn and asserts the notify loop. Add cases (no new file needed):

- **note forwarded when present:** `POST(req({ notify: true, note: "See you at the AGM." }))` with two LP memberships → `mockSendLpReportPublishedEmail` called with an object whose `note === "See you at the AGM."` for each recipient.
- **note omitted → `note` is `null`/absent in the send call** (byte-identical-when-empty contract at the route boundary): `POST(req({ notify: true }))` → each call's `note` is `null`.
- **over-limit note → 400, no publish, no send:** `POST(req({ notify: true, note: "x".repeat(501) }))` → `res.status === 400`, `mockFundReportUpdate` not called, `mockSendLpReportPublishedEmail` not called.
- (Optional, if worth a unit-level pin) a direct `email.ts` test is not currently the house pattern for this function — the route-level assertions above are the established coverage shape (`report-publish-notify.test.ts` mocks the email fn rather than exercising its HTML), so the byte-identical-when-empty guarantee is documented and reviewed rather than snapshot-tested. Flagged as a JC: if Joseph wants a rendered-HTML snapshot test proving the empty-note output equals a stored golden, that is an easy additive test but a new pattern for this module.

**WS54 acceptance checklist**
- [ ] With the note blank, the sent email is byte-identical to today's except that "It's a short read." is gone (verified by comparing the `emailWrapper(...)` content string, or a live send to a test address).
- [ ] With a note filled in, it renders as its own paragraph after the intro and before the button, with author line breaks preserved.
- [ ] A note containing `<`, `>`, `&`, `"` renders as literal text, not markup (F47) — and a report title / LP name with the same characters now also renders correctly.
- [ ] "It's a short read." appears nowhere in the codebase.
- [ ] Server rejects a >500-char note with 400 and does not publish or send.
- [ ] `REPORT_PUBLISHED` audit rows carry `noteIncluded` (and `note` when present).
- [ ] The textarea appears in the confirm-publish dialog only when "Notify this fund's LPs by email" is checked; character counter works; existing publish/notify behavior is otherwise unchanged.
- [ ] `report-publish-notify.test.ts` extended and green.

**UX impact:** Additive and admin-only. The confirm-publish dialog gains an optional textarea that appears only when an admin has already opted into notifying LPs; leaving it blank changes nothing an LP sees versus today (aside from the one-line "It's a short read." copy removal, a deliberate improvement). No founder, LP-portal, or investor-link surface changes. No existing admin flow is blocked or reordered.

**Cost impact:** None. No new dependency, no schema change, no new env var, no new service — one email template edit, one route edit, one client edit, and a test extension, all on the existing Resend/Postgres stack.

**Effort:** ~0.5 day.

## Roadmap bookkeeping

`ROADMAP.md` gets a new `Planned` forward-pointer blockquote at the top of the Roadmap section (above the Part 23 blockquote, newest-first), describing Part 24 / WS54 / F47 as scoped-not-built. The LP portal "Existing Features" bullet (which already documents the "Notify this fund's LPs by email" checkbox and template #12) gets no shipped-language change yet — nothing has shipped. When WS54 ships, that bullet absorbs the optional-note detail and the "short read" copy change, and this section is replaced with the usual shipped summary.

---

# Part 25 — Dedicated Security Audit (F48–F50, WS55–WS57)

_Requested by Joseph 2026-08-06: a real, systematic **security** review, distinct from the general platform-quality audits (Parts 17, 22). Scope followed the eight areas Joseph enumerated: (1) every document route, (2) every admin route's guard, (3) the DD/diligence surface, (4) session/auth core, (5) the "sessionless client hits middleware" family, (6) secrets/credentials handling, (7) rate-limiting coverage, (8) injection/XSS beyond F47. **Audit-and-report only — no product code changed as part of this Part.** Every claim below was verified by reading the cited file at the cited lines against the current working tree, not trusted from a prior commit message or write-up. F-numbering continues from F47 (Part 24). Two real findings (F48, F49) and one low-severity gap (F50); the rest of the surface is documented as verified-clean so Joseph knows what was actually checked._

## Severity summary (read this first)

| # | Severity | One-line | Location |
|---|----------|----------|----------|
| **F48** | **HIGH** | Broken object-level authorization (IDOR): any approved user can read **any** company's full investor update (body, metrics, documents) as HTML | `src/app/api/updates/[id]/pdf/route.ts:12` |
| **F49** | **MEDIUM** | HTML/link injection into transactional emails — the F47/WS54 `escapeHtml` fix reached only **one** of ~8 email functions; founder- and even **unauthenticated**-controlled text still lands raw in admin- and invitee-facing emails | `src/lib/email.ts` (multiple `send*`) |
| **F50** | **LOW** | No rate limit on the team-invite endpoint — an authenticated OWNER/admin can drive unbounded Resend sends to arbitrary addresses | `src/app/api/companies/[id]/members/invite/route.ts` |

Everything else checked out — see "Verified clean" at the end. **This is the first real object-level-authz bug found in the update surface; every _document_ route (the historically buggy area) is clean this pass — the gap had migrated one resource over, to the update PDF route, which never got the company-scoping every sibling update route has.**

---

## F48 — IDOR in `GET /api/updates/[id]/pdf`: no company scoping (HIGH)

**Evidence.** `src/app/api/updates/[id]/pdf/route.ts:12` guards with `requireAuth()` **only** — it confirms the caller is *some* approved user, then at line 17 loads the update by the path `id`, at line 25 calls `generateUpdateHTML(id)`, and returns the rendered HTML. It never checks that the caller has access to `update.companyId`. `generateUpdateHTML` (`src/lib/pdf.ts:9–22`) loads the update with `company`, all `metricValues` (+definitions), and `documents`, and renders the full confidential investor update.

**Why it's a real vulnerability.** Every *other* route in the update family derives the company from the resource and calls `requireCompanyAccess(update.companyId)`:
- `src/app/api/updates/[id]/route.ts:14-24` (DELETE/GET) — `findUnique → requireCompanyAccess(existing.companyId)`
- `src/app/api/updates/[id]/comments/route.ts:14-24` (GET/POST) — same pattern

The PDF route is the lone exception. `requireAuth()` returns success for *any* `APPROVED` user (`src/lib/auth-guard.ts:9-25`), so a founder who is a member of Company A can call `GET /api/updates/{an-update-id-belonging-to-Company-B}/pdf` and receive Company B's full update — metrics, narrative body, and document list. This is exactly the June documents-IDOR class (broken object-level authorization / horizontal privilege escalation), on the update resource.

**Exploitability caveat (does not downgrade the finding).** Update IDs are cuids, not sequential integers, so this is not trivially mass-enumerable — an attacker needs to obtain a target update's ID (they leak through URLs, the `/updates/[id]/download` path, forwarded links, logs, etc.). Broken object-level authz is a vulnerability regardless of ID guessability; ranked HIGH because the exposed data is the platform's most confidential (portfolio metrics + investor narrative) and the fix is one line with zero UX cost.

**No legitimate caller is affected by fixing it.** The only client caller is `src/app/updates/[id]/download/page.tsx:12` (`window.open('/api/updates/${id}/pdf')`), always for an update the founder already has access to; admins pass `requireCompanyAccess` too (it short-circuits `true` for admins). So swapping `requireAuth()` for the sibling pattern is invisible to every real user.

## WS55 — Scope the update-PDF route to the update's company (F48) — ~0.1 day

**Goal:** close the IDOR by matching the exact pattern the sibling update routes already use.

**File:** `src/app/api/updates/[id]/pdf/route.ts`

**Step — replace the guard (lines 12–23 region):**
```ts
// BEFORE
const { error } = await requireAuth();
if (error) return error;

const { id } = await params;

const update = await db.update.findUnique({
  where: { id },
  select: { companyId: true },
});
if (!update) {
  return NextResponse.json({ error: "Update not found" }, { status: 404 });
}

// AFTER — mirror src/app/api/updates/[id]/route.ts:14-24 exactly
const { id } = await params;

const update = await db.update.findUnique({
  where: { id },
  select: { companyId: true },
});
if (!update) {
  return NextResponse.json({ error: "Update not found" }, { status: 404 });
}

const { error } = await requireCompanyAccess(update.companyId);
if (error) return error;
```
Swap the import on line 3 from `requireAuth` to `requireCompanyAccess` (from `@/lib/auth-guard`). Everything below (the `generateUpdateHTML` call, the `text/html` response) is unchanged.

**Acceptance checklist:**
- [ ] A founder member of Company A gets 403 from `GET /api/updates/{Company-B-update-id}/pdf` (was 200 + full HTML).
- [ ] A founder still gets their own update's PDF from `/updates/[id]/download`.
- [ ] An admin still gets any update's PDF (admin short-circuit in `requireCompanyAccess`).
- [ ] 404 (not 403) still returned for a nonexistent update id — order preserved: existence check derives `companyId`, then access check runs (same as the sibling route; a caller can already learn existence of arbitrary update ids via the 404-vs-403 split, matching the established house behavior — acceptable, not worsened here).
- [ ] Consider a regression test alongside the existing auth-guard tests asserting a non-member is refused.

**UX impact:** none — the only front door is the founder's own download page and the admin view, both unaffected.
**Cost impact:** none.
**Effort:** ~0.1 day (one-line-equivalent guard swap + optional test).

---

## F49 — Unescaped user text in transactional emails: F47's fix reached only one of ~8 email functions (MEDIUM)

**Evidence.** Part 24/WS54 added `escapeHtml` to `src/lib/email.ts:46-52` and applied it **only inside `sendLpReportPublishedEmail`** (`escapeHtml` used at lines 578, 588, 589 — the note, `firstName`, and `reportTitle`). Every other `send*` function still interpolates dynamic, user-controlled values raw into the HTML body. Confirmed by reading each function:

| Function | Raw-interpolated user value(s) | Recipient | Who controls the value |
|----------|-------------------------------|-----------|------------------------|
| `sendNewSignupNotification` (`:244-265`, via `fieldRow` `:122-130`) | `founderName`, `founderEmail` | **Admins** (`TEAM_EMAIL`) | **Unauthenticated** — straight from the `/api/auth/signup` body (`src/app/api/auth/signup/route.ts:16`), `name` is any string, only email-format-validated |
| `sendCommentNotificationEmail` (`:528`) | `commenterName`, `updateTitle`, `updatePeriod`, `companyName` | Admins + company members | Founder (comment author, update title, company name) |
| `sendDiligenceCompletedAdminNotification` (`:404-407`) | `founderName`, `founderEmail`, `companyName` | **Admins** | Founder |
| `sendTeamInviteEmail` (`:312`) | `inviterName`, `companyName` | Invitee (arbitrary third-party email) | Founder |
| `sendMemberAddedEmail` (`:433`) | `inviterName`, `companyName` | Invitee | Founder |
| `sendUpdatePublishedEmail` (`:226-233` region) | `companyName` (body is trusted TipTap by design — leave it) | Admin team | Founder |
| `sendUpdateReminderEmail` (`:284,289`) | `companyName` | Founder (self) | Founder |
| `sendDiligenceInviteEmail` (`:340-341`) | `companyName` | Founder | Admin (company created admin-side) — lower |

`companyName` is fully founder-controlled and unsanitized: set at self-service signup (`src/app/api/auth/signup/route.ts:86-91`, raw `companyName`) and editable via `PATCH /api/companies/[id]` (`name` in `allowedFields`, `src/app/api/companies/[id]/route.ts:89-104`, no sanitization). `founderName` in `sendNewSignupNotification` is **unauthenticated** input.

**Impact & severity.** This is HTML injection into email markup, not stored browser XSS: mainstream email clients strip `<script>`, so the realistic blast radius is (a) **link injection / content spoofing** — e.g. a signup `name` of `Acme <a href="https://evil.example">click to approve</a>` renders a live attacker link inside the DFS admin approval email, an unauthenticated → admin-inbox phishing primitive; and (b) broken/garbled rendering from stray `<`, `>`, `&`, `"`. No session, no cookie theft, no script execution. Ranked **MEDIUM** (not LOW like F47) precisely because — unlike F47's admin/LP-authored `reportTitle` — several of these values are **founder-controlled or outright unauthenticated** and cross a trust boundary into **admin** and **third-party-invitee** inboxes. The escape helper already exists in the file; this is applying it consistently, exactly the remediation F47 established.

**Scope note (do NOT over-escape):** `subject:` lines stay raw — subjects are plain text, not HTML (the F47/WS54 write-up already settled this, `IMPLEMENTATION_PLAN.md:6409`). `sendUpdatePublishedEmail`'s `opts.body` stays raw — it is trusted TipTap-generated markup by design (the one deliberate raw-HTML interpolation, same rationale as the report body's `dangerouslySetInnerHTML`). Only *plain-text* dynamic values interpolated into the HTML *body* get wrapped.

## WS56 — Apply `escapeHtml` to the remaining email templates (F49) — ~0.5 day

**Goal:** wrap every plain-text, user-controlled value interpolated into an email HTML body in the existing `escapeHtml` (`src/lib/email.ts:46`), matching what WS54 already did for `sendLpReportPublishedEmail`. No new dependency, no new helper — the function is right there.

**File:** `src/lib/email.ts` only.

**Steps (per function — wrap the value, leave everything else byte-identical):**
- `fieldRow(label, value)` (`:122`) — the cleanest single fix: escape `value` **inside the helper** (`...color: ${C.obsidian};">${escapeHtml(value)}</p>`). This covers `sendNewSignupNotification`'s `founderName`/`founderEmail` and `sendDiligenceCompletedAdminNotification`'s `fieldRow` fields in one edit. Verify no caller passes intentional markup through `fieldRow` (grep shows only plain labels/values — safe).
- `sendTeamInviteEmail` (`:312`) — `${escapeHtml(opts.inviterName ?? "A teammate")}` and `<strong>${escapeHtml(opts.companyName)}</strong>`.
- `sendMemberAddedEmail` (`:433`) — same two.
- `sendCommentNotificationEmail` (`:528`) — escape `commenterName`, `updateTitle`, `updatePeriod`, `companyName`.
- `sendDiligenceInviteEmail` (`:340-341`) — escape `companyName` (both occurrences).
- `sendDiligenceCompletedAdminNotification` (`:404`) — escape the inline `${opts.founderName || opts.founderEmail}` and `${opts.companyName}` (the `fieldRow` ones are covered by the helper fix above).
- `sendUpdateReminderEmail` (`:284,289`) — escape `companyName`.
- `sendUpdatePublishedEmail` — escape any plain-text `companyName`/title interpolation in the body; **leave `opts.body` raw** (trusted TipTap).

Leave all `subject:` lines untouched.

**Acceptance checklist:**
- [ ] A company named `Q1 & <SPV> "Special"` renders as literal text in every email that names it (team invite, member added, comment notification, reminder, published, DD notifications), not as broken/garbled markup.
- [ ] A signup submitted with `name` = `Acme <a href="https://evil.example">x</a>` produces an admin notification email where that string appears as literal text, not a live link.
- [ ] `sendLpReportPublishedEmail` is unchanged (already escaped in WS54).
- [ ] `opts.body` in `sendUpdatePublishedEmail` still renders as rich HTML (regression: don't double-escape the trusted body).
- [ ] Subjects unchanged.

**UX impact:** invisible for all normal inputs (plain company/person names contain no HTML metacharacters); the only visible change is that pathological inputs now render correctly instead of breaking. No UX regression.
**Cost impact:** none.
**Effort:** ~0.5 day (8 functions, mechanical, plus a couple of assertion tests).

---

## F50 — No rate limit on the team-invite endpoint (LOW)

**Evidence.** `POST /api/companies/[id]/members/invite` (`src/app/api/companies/[id]/members/invite/route.ts`) is gated to an OWNER of the company or an admin (`:18-26`) but has **no `checkRateLimit` call**. Each successful call fires a Resend email (`sendTeamInviteEmail`/`sendMemberAddedEmail`) to a client-supplied address (`:29`). An authenticated OWNER founder can therefore drive unbounded outbound email to arbitrary addresses — a spam-relay / Resend-cost amplification vector. Contrast the unauthenticated email paths, which are all rate-limited: signup (`signup`, 10/hr/IP), set-password + resend, LP OTP request (`lp-otp-ip` 10 + `lp-otp-email` 5), LP verify. The company-creation admin path (`POST /api/companies`, which can also send a DD invite email) has the same gap but is admin-only, so lower still.

**Why LOW, not higher:** requires an authenticated, admin-**approved** founder-owner (not an anonymous attacker), and abuse is audit-adjacent (memberships/users get created). It is genuine outbound-email-abuse surface the task explicitly asked about (item 7), just behind an auth wall.

## WS57 — Rate-limit the invite endpoint (F50) — ~0.25 day

**Goal:** cap invite-email volume per inviter, reusing the existing Postgres rate limiter (no Redis, no new cost line).

**File:** `src/app/api/companies/[id]/members/invite/route.ts`

**Step — after the OWNER/admin check (~:26), before creating anything:**
```ts
import { checkRateLimit } from "@/lib/rate-limit";
// keyed by inviter user id, not IP — the abuse unit is "one account blasting invites"
if (!(await checkRateLimit("member-invite", user.id, 20))) {
  return NextResponse.json(
    { error: "Too many invitations. Try again in an hour." },
    { status: 429 }
  );
}
```
Pick the cap to sit comfortably above any real team-building session (20/hr/inviter suggested; confirm with Joseph — see decision note). Optionally apply the same guard to the admin DD-invite branch in `POST /api/companies` keyed on the admin's id.

**Decision for Joseph (product):** the limit value. Recommendation: **20/hour/inviter** — well past a realistic onboarding burst, tight enough to blunt scripted abuse. Cheaply reversible (one integer). Not choosing silently since it's a UX-facing threshold.

**Acceptance checklist:**
- [ ] 21st invite within an hour from the same inviter returns 429.
- [ ] Normal team setup (a handful of invites) is unaffected.
- [ ] Limit is per inviter id, so one abusive owner can't rate-limit another company's owner.

**UX impact:** invisible under normal use; a hard cap only a scripted abuser would hit.
**Cost impact:** none (existing `RateLimit` table); *reduces* worst-case Resend spend.
**Effort:** ~0.25 day.

---

## Verified clean (what was actually checked and found correct)

So Joseph knows the scope was covered, not just where bugs were found:

- **Every `src/app/api/admin/**` route calls `requireAdmin()`.** Enumerated all 55 admin route files; each imports and calls `requireAdmin` (grep-verified guard-per-file table). No admin route falls back to `requireCompanyAccess` or nothing. `companies/[id]/notes*` and `companies/[id]/remind` correctly use `requireAdmin` too (company notes are admin-only by design; an admin legitimately reaches any company's notes).
- **Document routes — the historically buggy area — are clean this pass.** `GET/PATCH /api/documents/[id]` (`:29-37` role+company check on GET; `:78` `requireAdmin` on PATCH, F45 audit log present `:108-110`), `GET /api/documents/[id]/view` (`:24-32`, isInternal role check present), `POST /api/documents/upload` (`:62` company access), `GET /api/companies/[id]/documents` (`:12` company access + the documented own-upload isInternal carve-out `:37`), and the WS50 admin orphan routes (`orphan-scan` `:28` and `[id]/orphan` DELETE `:13`, both `requireAdmin`, delete re-verifies non-existence at `:25` before acting) — all correctly guarded, company-scoped, and isInternal-aware. The cross-company reachability test (Company A → Company B by document id) fails closed at every route: each loads the doc, then runs `requireCompanyAccess(document.companyId)`.
- **The token-scoped share doc proxy** (`GET /api/share/[token]/doc/[docId]`, `:36-49`) correctly rejects (as 404, no existence oracle) any doc that is `isInternal` or not covered by the link's companies — the June-IDOR containment holds; it is not a general public documents endpoint.
- **Diligence surface.** Founder A cannot read/write Company B's diligence: both `GET` and `PATCH /api/companies/[id]/diligence` gate on `requireCompanyAccess(id)` (`:54`, `:98`). `PATCH` accepts only `isUsIncorporated`/`stellarWhyText`/`stellarTimelineText` (`:115-123`) — never `completedAt`/`closedAt`/`isStellarEcosystem` (recomputed/admin-only). Promote (`POST /api/admin/diligence/[id]/promote`) is `requireAdmin` + guarded to `stage === "DILIGENCE"` (`:34`) inside a transaction (`:38-41`). The account-deletion-on-company-delete cleanup (`DELETE /api/companies/[id]`, `:161-224`) is still correctly narrowed: only `stage === "DILIGENCE"` companies (`:162`), only zero-remaining-membership users (`:194-197`), never an admin (`:203`), with F35's ShareableLink handling and reported-not-swallowed failures intact.
- **Session/auth core.** `requireAuth` enforces `status === "APPROVED"` (`auth-guard.ts:16-18`) before any role check. `route-access.ts`'s `PUBLIC_PREFIXES` (`:41`) is unchanged from its documented set — the `"/" ` entry is an **exact** match (`:47` `pathname === "/"`), so the Feb prefix-match bypass cannot recur (and is regression-tested). No new session-bypassing pattern was added this session. `set-password` handles REJECTED tokens and expiry (`:48-61`) and is rate-limited.
- **The "sessionless client hits middleware" family.** No route needing a public exemption is missing one, and — checking the *converse* over-exemption risk — nothing on `PUBLIC_PREFIXES` is over-broad: `/api/share`, `/api/cron`, `/api/lp`, `/brand`, `/share`, `/lp`, `/investors`, `/login`, `/signup`, `/set-password`, `/api/auth`, `/api/dev` each has its own in-route gate (token, `CRON_SECRET`, `lp_session` cookie, or is genuinely public). `/api/dev/bootstrap` is additionally hard-disabled unless `NODE_ENV !== production` **and** `ALLOW_DEV_BOOTSTRAP === "true"` (`dev/bootstrap/route.ts:11`) — safe in production.
- **Secrets/credentials handling.** The WS49 storage diagnostics leak nothing sensitive: `test-upload` returns only a presigned URL + a `_health-check/`-prefixed key (`test-upload/route.ts:12-14`); `confirm` validates the key is `_health-check/`-prefixed before touching it (`:13-15`) and returns only success/generic-error text — no bucket name, no credentials, no object listing. `orphan-scan` returns document metadata (name/company/uploader-email/s3Key) to **admins only** — s3Key is an internal path, not a credential, and the audience is admin. No API response, log line, or client payload was found returning `S3_*`/`RESEND_API_KEY`/`CRON_SECRET`/session secrets. (`admin/settings` was already hardened in the Jul security pass to expose only booleans.)
- **Rate-limiting coverage.** All unauthenticated email/credential paths are limited: signup, set-password (+resend, +token-status GET), LP OTP request (IP+email buckets), LP verify (IP+email). LP OTP additionally has a fail-closed per-row attempt cap and timing-safe compare (`lp/auth/verify/route.ts:45-57`). The gap is F50 (authenticated invite path).
- **LP auth.** OTP request returns a constant generic response regardless of LP existence (`request/route.ts:11-14`), verify returns one generic error for every failure mode, increments attempts before comparing, uses `crypto.timingSafeEqual`, and sets an httpOnly/secure/sameSite cookie (`verify/route.ts:71-78`). Solid.
- **Investor-link ownership.** `GET/DELETE /api/links/[id]` scope to `createdById` for non-admins (`links/[id]/route.ts:21-23, 53-55`).

## ROADMAP bookkeeping

`ROADMAP.md`'s `_Last updated_` line gains a Part 25 entry, and a `Planned`/audit forward-pointer blockquote is added at the top of the roadmap describing F48–F50 / WS55–WS57 as **found, scoped, not yet built** (newest-first, above the Part 24 pointer). The "Transactional emails" bullet under Authentication & Access gets an inline F49 annotation (the escape helper exists but is applied to only one of the email functions). No "Existing Features" bullet gains shipped-language — nothing in this Part has shipped. F48's fix, when it ships, is a security correction with no user-facing feature to describe; F49/F50 likewise fold into their existing bullets on ship.

---

# Part 26 — Multiple Email Addresses per LP (WS58–WS61, F51)

_Requested by Joseph 2026-08-06, following a Felix feasibility investigation that was **deliberately stopped before a plan was written**, pending his direction. Joseph has now confirmed the direction — his exact answers are the locked-in decision banner below. This Part turns that into the real, file-by-file plan, re-verified against the working tree (every claim re-read against live code, not the stale scoping notes). **Planning only — no product code written; Alvin not engaged.**_

## Confirmed decisions (Joseph, 2026-08-06 — locked, not to be re-litigated)

- **D1 — Interpretation A: any of an LP's addresses logs into the same account with the same fund access.** Login is not restricted to a single "primary" address. All of an LP's addresses are equal for authentication purposes.
- **D2 — Report-published notification fans out to ALL of an LP's addresses**, not just a primary, while never double-mailing the same person for the same fund.
- **D3 — Session-revocation semantics ("the later" option): removing ONE of an LP's addresses does NOT log them out.** Only removing their **last remaining** address (i.e., the address count would drop to **zero**) revokes sessions. This is a behavior change from today, where `PATCH /api/admin/lps/[id]` nukes all sessions on **any** email edit.

## Method — what was verified against the working tree

Every load-bearing claim was re-read against live code before scoping:

- **`LimitedPartner` today** (`prisma/schema.prisma:671–683`): `email String @unique // stored lowercased/trimmed`, `name String?`, plus relations `funds LpFundMembership[]`, `sessions LpSession[]`, `otpCodes LpOtpCode[]`. `LpOtpCode` (`:698–711`) and `LpSession` (`:713–725`) are **both `lpId`-keyed**, not email-keyed — confirming the scoping finding that sessions/OTP codes need **no change** for multi-email. `@@unique([lpId, fundId])` on `LpFundMembership` (`:694`) is the load-bearing fact behind F51 below.
- **OTP request** (`src/app/api/lp/auth/request/route.ts:32`): `const lp = await db.limitedPartner.findUnique({ where: { email } });` — the single lookup to re-point. The code is emailed to the **requesting** address (`sendLpOtpEmail(email, code)` at `:39`), not fanned out — correct and unchanged under D1.
- **OTP verify** (`src/app/api/lp/auth/verify/route.ts:29`): same `findUnique({ where: { email } })`, then `db.lpOtpCode.findFirst({ where: { lpId: lp.id, consumedAt: null } })` (`:34`). Since the OTP is looked up by `lpId`, a code requested from address X is verifiable from address Y of the same LP with zero extra work — exactly D1's intent, for free.
- **Admin create** (`src/app/api/admin/lps/route.ts:47–49`): clash-check is `db.limitedPartner.findUnique({ where: { email } })` — misses any address held only as a **secondary** `LpEmail` once that table exists, so it must be re-pointed (WS60).
- **Admin edit** (`src/app/api/admin/lps/[id]/route.ts:29–45`): on email change it clash-checks `LimitedPartner.email`, sets `data.email`, and `deleteMany({ where: { lpId: id } })` **all sessions** inside the transaction (the D3 behavior being replaced). Name-only edits skip the revocation (`:65–73` of the test confirm this).
- **Admin UI** (`src/app/admin/lps/page.tsx`): single `Email *` `<Input>` (`:203–216`) with an `emailChangeWarning` banner (`:217–219`) whose copy ("Changing this email signs the LP out everywhere") becomes **false** under D3 and must change. Fund membership is already reconciled via a **separate** sub-route (`/api/admin/lps/[id]/funds`, `:98–111`) — the exact pattern the new address sub-routes should mirror.
- **Fund sub-route precedent** (`src/app/api/admin/lps/[id]/funds/route.ts`): `POST` upserts a membership, `DELETE` removes one, each `requireAdmin`-gated and audit-logged (`LP_FUND_ASSIGNED` / `LP_FUND_UNASSIGNED`, `:27`, `:50`). The address sub-route copies this shape exactly.
- **Publish notification loop** (`src/app/api/admin/reports/[id]/publish/route.ts:134–157`): `db.lpFundMembership.findMany({ where: { fundId: report.fundId }, include: { lp: { select: { email, name } } } })`, then one `sendLpReportPublishedEmail` per membership, best-effort (`try/catch`, `notified`/`failed` counters — the F12 "one bad address never blocks the rest" lesson). **A publish is scoped to exactly one report → one `report.fundId`.** See F51.
- **All `LimitedPartner.email` / `limitedPartner` read sites** (full `grep` across `src/`): the auth routes above, the three admin routes above, the publish loop, and one **test** (`src/lib/__tests__/lp-email-change.test.ts`) that exercises the `PATCH` session-revocation — no others. **`getLp()` returns `lp.email`** (`src/lib/lp-auth.ts:92`) in its `LpContext`, but a `grep` of `src/app/lp/**` confirms **no LP-portal page ever renders `ctx.lp.email`** (the layout shows only a sign-out button; the page shows a report library). So there is **no "signed in as X" surface** to confuse when an LP logs in via a secondary address — a genuine, verified non-regression, not an assumption.

## F51 — the "double-mail an LP on multiple funds" dedup concern does NOT exist in the current loop shape (assumption corrected)

The task brief asked to verify, not assume, whether the publish fan-out needs dedup so "a person on multiple funds within the same publish batch isn't double-mailed for the same fund." **Verified against the code: it does not, and cannot in the current shape.** Two independent facts guarantee it:

1. **A publish is single-fund.** The loop is `where: { fundId: report.fundId }` — one report belongs to exactly one fund. There is no "publish batch" spanning multiple funds; an LP on funds A and B who both publish gets two *separate* publish actions, each its own opt-in decision. Cross-fund double-mailing is structurally impossible within one publish.
2. **`@@unique([lpId, fundId])`** means each LP has **at most one** membership row per fund, so the loop already visits each LP **exactly once**.

Fanning out to that LP's addresses (WS61) sends to each of its `LpEmail` rows, and because **`LpEmail.email` is globally `@unique`**, no address can appear twice across the whole loop. **Therefore no dedup logic (no `Set`, no distinct) is required** — the fan-out is a clean nested loop. This is recorded as a finding (per the "correct assumptions you find" rule) so a future reader doesn't add defensive dedup that the invariant already makes dead code. (If a future feature ever introduces a genuinely multi-fund publish, this finding is the flag to revisit.)

## Schema shape (WS58) and the `LimitedPartner.email` judgment call

New additive table, mirroring the existing LP-model conventions (cuid ids, `@@map` snake_case, `onDelete: Cascade` from the parent LP, lowercased/trimmed emails):

```prisma
model LpEmail {
  id        String   @id @default(cuid())
  lpId      String
  email     String   @unique // stored lowercased/trimmed; GLOBALLY unique across all LPs — preserves "two LPs can't claim the same address"
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())

  lp LimitedPartner @relation(fields: [lpId], references: [id], onDelete: Cascade)

  @@index([lpId])
  @@map("lp_emails")
}
```

`LimitedPartner` gains the back-relation `emails LpEmail[]`.

- **JC1 — keep `LimitedPartner.email` as a synced mirror of the primary address, NOT deprecated in this Part.** The real global-uniqueness guarantee moves to `LpEmail.email @unique`; `LimitedPartner.email` becomes a denormalized convenience mirror always equal to whichever `LpEmail` has `isPrimary = true`. Rationale: `getLp()`, the admin GET, and any future display code can keep reading one scalar without a join, and the many-small-reads churn is avoided. Fully dropping the column is a later, **destructive** change needing explicit sign-off — out of scope here. **Reversal:** cheap — a follow-up WS can switch the remaining readers to `emails` and then drop the column with Joseph's approval.
- **JC2 — `LimitedPartner.email` is made NULLABLE in this Part.** This is required, not cosmetic: D3 permits an LP to reach **zero** addresses (last one removed), and a mirror in a **`@unique` NOT NULL** column cannot represent that — worse, leaving a stale value in a unique column would **falsely occupy that address in the unique index and block re-adding it to a different LP** (a real bug, not hypothetical). Nullable-mirror = null when zero addresses; Postgres permits multiple NULLs under a unique constraint, so multiple zero-address LPs coexist cleanly. **NOT NULL → NULL is a non-destructive relaxation (no row loses data), so it stays inside the "additive-only" guardrail** — but it is flagged prominently here so Joseph can veto. **Reversal:** re-tighten to NOT NULL only after the mirror is fully retired. All three current mirror-readers already tolerate the value being absent for a logged-out LP (see WS59/WS61 notes), and after backfill every existing LP has a non-null mirror, so the relaxation changes nothing for today's data.
- **Primary invariant** is app-enforced (in the same transactions that mutate addresses), not a DB partial-unique index — Prisma can't cleanly express "exactly one `isPrimary` per `lpId`," and the app already enforces comparable invariants elsewhere. Invariant: **for a given LP, `LimitedPartner.email` equals the `LpEmail` row with `isPrimary = true`, or is `null` iff the LP has zero addresses.**

## Backfill (WS58)

One `LpEmail` row per existing `LimitedPartner`, marked primary, mirroring the current `email`. Idempotent, reversible, matches the `scripts/*.sql` precedent (`migrate-roles.sql` etc., run via `psql $DATABASE_URL -f`). Per MEMORY, additive `prisma db push` against prod is the confirmed-safe workflow; the data backfill is a separate one-shot SQL step run once, after the push:

```sql
-- scripts/backfill-lp-emails.sql — run AFTER `prisma db push` adds lp_emails.
-- Idempotent: ON CONFLICT (email) DO NOTHING means a re-run is a no-op.
BEGIN;
INSERT INTO "lp_emails" ("id", "lpId", "email", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, "id", "email", true, now()
FROM "limited_partners"
WHERE "email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;
COMMIT;
```

(cuid vs `gen_random_uuid()` — the backfilled id format doesn't matter; only app-created rows need cuids for consistency, and nothing parses the id. Reversal: `DELETE FROM "lp_emails";` then re-tighten the column — the mirror is untouched by the backfill.)

---

## WS58 — `LpEmail` schema + backfill — ~0.25–0.5 day

**Goal:** land the additive `LpEmail` table, the `emails` back-relation, the nullable-mirror relaxation (JC2), and a one-shot idempotent backfill so every existing LP owns exactly one primary `LpEmail` — with zero behavior change until WS59–WS61 read from it.

**Steps**
1. `prisma/schema.prisma` — add the `LpEmail` model above; add `emails LpEmail[]` to `LimitedPartner`; change `email String @unique` → `email String? @unique` (JC2). Keep `@unique` on the mirror.
2. `scripts/backfill-lp-emails.sql` (new) — the idempotent `INSERT … ON CONFLICT DO NOTHING` above, with a header comment matching `migrate-roles.sql`'s usage/what-it-does style.
3. Apply: `prisma db push` (additive + the nullable relaxation), then `psql $DATABASE_URL -f scripts/backfill-lp-emails.sql`. **Order matters** — push first (creates the table), backfill second.

**Acceptance checklist**
- [ ] `npx prisma validate` passes; `prisma db push` reports only additive changes + the `email` nullability relaxation (no column drops, no data loss warnings).
- [ ] After backfill, `SELECT count(*) FROM limited_partners` equals `SELECT count(*) FROM lp_emails WHERE "isPrimary"`; every `lp_emails.email` matches its LP's `limited_partners.email`.
- [ ] Re-running the backfill SQL is a no-op (0 rows inserted).
- [ ] No `src/**` change in this WS — the app still reads `LimitedPartner.email` everywhere and behaves identically.

**UX impact:** none (invisible schema + data step).
**Cost impact:** none (one Neon table, no new service).

## WS59 — Resolve OTP request/verify through `LpEmail` — ~0.25 day

**Goal:** any of an LP's addresses can request and verify a code (D1), by swapping the two `LimitedPartner.findUnique({ where: { email } })` lookups for a resolution through `LpEmail` → owning LP. Sessions/OTP rows stay `lpId`-keyed (no change — verified).

**Steps**
1. `src/app/api/lp/auth/request/route.ts:32` — replace with a lookup through the address table, resolving to the owning LP:
   ```ts
   const match = await db.lpEmail.findUnique({ where: { email }, select: { lpId: true } });
   if (match) {
     const code = newOtpCode();
     await db.lpOtpCode.create({ data: { lpId: match.lpId, /* …unchanged… */ } });
     // …sendLpOtpEmail(email, code) unchanged — code goes to the requesting address
   }
   ```
   The generic-response / no-existence-oracle behavior (JC7) is untouched — still one constant response whether or not `match` exists.
2. `src/app/api/lp/auth/verify/route.ts:29` — same swap: `const match = await db.lpEmail.findUnique({ where: { email }, select: { lpId: true } });` then guard `if (!match)` with the existing generic error, and use `match.lpId` in the existing `lpOtpCode.findFirst({ where: { lpId: match.lpId, consumedAt: null } })`. Everything downstream (attempt increment, timing-safe compare, session create keyed by `lpId`, cookie) is unchanged.

**Acceptance checklist**
- [ ] Requesting a code from a **secondary** address of an LP creates an `LpOtpCode` for that LP and emails the code to that secondary address.
- [ ] Verifying with a secondary address (code + that address) mints a session for the same `lpId` and lands on the same funds as the primary would.
- [ ] Request/verify from a non-existent address still returns the identical generic response/error (no oracle) — re-verify the JC7 property holds after the swap.
- [ ] No change to `LpSession`/`LpOtpCode` shape or keys; existing LP-auth tests still pass (extend them for the secondary-address path).

**UX impact:** additive — LPs with one address see no difference; LPs with several can now use any of them. No "signed in as" surface exists to show the wrong address (verified).
**Cost impact:** none.

## WS60 — Admin address management: sub-routes, `[id]` PATCH change, UI, audit — ~0.75–1.25 day

**Goal:** turn the single `Email *` input into a manage-addresses list (add / remove / set-primary), re-point the create/edit clash-check at `LpEmail`'s global uniqueness, implement the D3 "revoke only when count hits zero" rule, and audit-log each address mutation matching the existing `LP_FUND_ASSIGNED`/`LP_FUND_UNASSIGNED` convention.

**Steps**
1. **`src/app/api/admin/lps/[id]/emails/route.ts` (new)** — mirrors the `/funds` sub-route shape (`requireAdmin`, load LP, mutate, audit, best-effort). Three methods:
   - `POST` `{ email, isPrimary? }` — validate format (reuse the in-file `EMAIL_REGEX`), lowercase/trim, **clash-check against `LpEmail` globally** (`db.lpEmail.findUnique({ where: { email } })` → "Another LP already uses this email."). Create the `LpEmail` in a transaction; if it's the LP's **first** address or `isPrimary` was requested, set it primary (clear any prior primary) and sync `LimitedPartner.email`. Audit `LP_EMAIL_ADDED` (`metadata: { email, isPrimary }`).
   - `DELETE` `{ email }` — delete that `LpEmail`. Then, in the same transaction, apply the **D3 rule**:
     ```ts
     const remaining = await tx.lpEmail.findMany({ where: { lpId: id } });
     if (remaining.length === 0) {
       await tx.limitedPartner.update({ where: { id }, data: { email: null } });
       await tx.lpSession.deleteMany({ where: { lpId: id } }); // ONLY here — count hit zero
     } else if (wasPrimary) {
       const next = remaining[0]; // oldest remaining, deterministic
       await tx.lpEmail.update({ where: { id: next.id }, data: { isPrimary: true } });
       await tx.limitedPartner.update({ where: { id }, data: { email: next.email } });
     }
     ```
     Audit `LP_EMAIL_REMOVED` (`metadata: { email, sessionsRevoked: remaining.length === 0 }`).
   - `PATCH` `{ email }` (set-primary) — mark that address primary, clear the old primary, sync the mirror. **Does not touch sessions** (not a removal). Audit `LP_EMAIL_PRIMARY_CHANGED` (`metadata: { email }`).
2. **`src/app/api/admin/lps/route.ts`** — the create path (`POST`): re-point the clash-check from `limitedPartner.findUnique` to `lpEmail.findUnique({ where: { email } })`; create the LP **and** its first `LpEmail` (primary) in a transaction, keeping the mirror in sync. `GET` gains `emails` in the response (`include: { emails: { orderBy: { createdAt: "asc" } } }`, map to `{ email, isPrimary }[]`) so the list UI can render the address column and counts.
3. **`src/app/api/admin/lps/[id]/route.ts`** — **strip email handling from `PATCH`**: it becomes **name-only** (email is now managed exclusively via the sub-route). Delete the `emailChanged` branch and its `deleteMany` session-revocation (the D3 change lives in the sub-route now). This removes the "revoke on any email edit" behavior at its source.
4. **`src/app/admin/lps/page.tsx`** — replace the single `Email *` `<Input>` (and the now-false `emailChangeWarning` banner) with a **manage-addresses list** inside the edit modal: each row shows the address, a "Primary" badge / "Make primary" action, and a remove (×) control; an add-address input + button appends. New LP creation still takes one initial address (required). Wire the add/remove/set-primary controls to the WS60.1 sub-routes, reconciling like the existing fund-membership diff loop (`:96–111`) — or call the sub-routes directly on each control click (simpler; matches `/funds`). The table's "Email" column (`:169`) renders the primary + a "+N" count when an LP has multiple; a zero-address LP shows "No address" (JC2's null mirror). **JC3 (below)** governs the remove-last-address confirm copy.
5. **`src/lib/__tests__/lp-email-change.test.ts`** — this test asserts the **old** revoke-on-any-email-edit behavior on `PATCH /api/admin/lps/[id]`; that behavior is being removed. **Replace it** with tests for the new sub-route: (a) removing a non-last address does **not** revoke sessions; (b) removing the **last** address sets the mirror null **and** revokes sessions in one transaction; (c) removing the primary (with others remaining) promotes the oldest remaining and re-syncs the mirror, no revocation; (d) adding an address already owned by another LP is rejected against `LpEmail`. Keep the name-only PATCH test (name changes still never touch sessions).

- **JC3 — the UI warns but does not block removing the last address.** Removing the last address is allowed per D3 (it revokes sessions and nulls the mirror; the LP survives with name/funds intact and can be given a new address later), but the remove control shows a confirm dialog when it's the final address: "This is their only address — removing it signs them out and they won't be able to log in until you add another. Continue?" Non-last removals need no confirm. **Reversal:** trivial copy/guard change if Joseph later wants last-address removal blocked outright or routed to "delete LP instead."

**Acceptance checklist**
- [ ] Adding a second address to an LP succeeds; it appears in the list and (WS59) can log in.
- [ ] Adding an address already held by **another** LP (as primary **or** secondary) is rejected with the clash message — verify against a secondary, the case the old `limitedPartner.findUnique` check missed.
- [ ] Removing a non-primary or non-last address leaves the LP logged in (no `LpSession` rows deleted).
- [ ] Removing the **primary** while others remain promotes the oldest remaining to primary and updates `LimitedPartner.email` to match; sessions untouched.
- [ ] Removing the **last** address deletes all `LpSession` rows for that LP and sets `LimitedPartner.email = null`; the freed address can immediately be added to a different LP.
- [ ] `PATCH /api/admin/lps/[id]` with a `name` change never deletes sessions; it no longer accepts `email`.
- [ ] Each of add / remove / set-primary writes exactly one audit row (`LP_EMAIL_ADDED` / `LP_EMAIL_REMOVED` / `LP_EMAIL_PRIMARY_CHANGED`) with the address in `metadata`, and remove records `sessionsRevoked`.
- [ ] The `/admin/lps` table shows the primary + "+N" for multi-address LPs and "No address" for a zero-address LP.
- [ ] `lp-email-change.test.ts` replaced per WS60.5; full Vitest suite green.

**UX impact:** admin-facing only. The single-email field becomes an address list (additive capability). The old, now-inaccurate "changing this email signs the LP out everywhere" warning is removed; a narrower last-address warning replaces it (JC3). No founder/LP/investor surface changes. LPs gain the ability to log in from any of their addresses.
**Cost impact:** none (Neon + existing routes only).

## WS61 — Report-published notification fan-out to all addresses — ~0.25 day

**Goal:** the opt-in publish notification reaches **every** address of each LP on the fund (D2), keeping the F12 best-effort per-recipient guarantee, and — per F51 — **without** dedup logic, because the single-fund + `@@unique([lpId, fundId])` + globally-unique-`LpEmail` invariants already guarantee each address is mailed at most once.

**Steps**
1. `src/app/api/admin/reports/[id]/publish/route.ts:135–157` — include the LP's addresses and nest the send:
   ```ts
   const memberships = await db.lpFundMembership.findMany({
     where: { fundId: report.fundId },
     include: { lp: { select: { name: true, emails: { select: { email: true } } } } },
   });
   let notified = 0, failed = 0;
   for (const m of memberships) {
     for (const addr of m.lp.emails) {           // F51: no dedup needed — see the finding
       try {
         await sendLpReportPublishedEmail({ email: addr.email, lpName: m.lp.name, fundName: report.fund.name, reportTitle: report.title, note });
         notified++;
       } catch (emailError) {
         console.error(`Failed to send LP report-published email to ${addr.email}:`, emailError);
         failed++;
       }
     }
   }
   ```
   `notified`/`failed` now count **addresses**, not LPs — a harmless, more-accurate semantic; the `notifyResult` in the response and the `REPORT_PUBLISHED` audit metadata carry the address-level counts. (An LP with zero addresses — WS60's edge case — contributes nothing to the loop, correctly: they can't receive anything.)
2. Tests — extend `src/lib/__tests__/report-publish-notify.test.ts` (the existing notify test) for an LP with two addresses receiving two sends, and confirm no address is mailed twice across a multi-LP fund.

**Acceptance checklist**
- [ ] Publishing with notify on, for a fund whose LP has two addresses, sends the report-published email to **both**.
- [ ] A failing send to one address still delivers to the LP's other addresses and to other LPs (best-effort intact); `failed` increments, publish succeeds.
- [ ] No address is mailed twice within one publish (verified structurally by F51; asserted by the test).
- [ ] An LP with zero addresses is silently skipped (no throw, no send).

**UX impact:** LPs with multiple addresses now receive publish notifications at each — the intended behavior (D2). Single-address LPs see no change. No change to the opt-in nature of the notification.
**Cost impact:** none new. More Resend sends **only** when an LP genuinely has multiple addresses (a handful of extra transactional emails, well within existing Resend usage) — no new cost line.

## Dependency order & handoff

WS58 (schema + backfill) is the hard prerequisite for all three. WS59 (auth lookup) and WS61 (fan-out) each depend only on WS58 and are independent of each other. WS60 (admin management) depends on WS58 and should land before or with WS59 so there is a UI to create second addresses to test WS59/WS61 against. Suggested sequence: **WS58 → WS60 → WS59 → WS61**.

## ROADMAP bookkeeping (Part 26)

`ROADMAP.md` gets a newest-first `Planned — Part 26` blockquote at the top of the Roadmap section (above the Part 24 pointer) describing WS58–WS61 / F51 as **scoped, decisions locked, not yet built** — no "Existing Features" bullet gains shipped-language (nothing has shipped). On ship, the multi-email capability folds into the existing **LP portal** bullet under Authentication & Access. No new P2/P3 table row is warranted — this is an enhancement to a shipped feature, not a new roadmap item.

---

# Part 27 — Confidentiality Audit of the Public Repo (F52–F57, 2026-08-06)

_Requested by Joseph 2026-08-06: "Duluth is a public repo on GitHub and people can fork it — make sure we are not sharing any sensitive data or anything that should be internal to DFS." This is an audit-and-report Part, not an implementation plan. It deliberately describes every finding by **file + line + category**, never by restating the confidential content itself, so this section does not become a fresh copy of the leak it documents. All findings are ranked by severity. The single most important structural fact governs remediation for every one of them and is stated up front below._

## The one fact that governs all remediation

**Every finding below (F52–F57) is in a file that is already committed and pushed.** The doc/narrative leaks live in `docs/IMPLEMENTATION_PLAN.md` and `ROADMAP.md`; the code/data leaks live in `src/**`, `prisma/seed.ts`, and `scripts/`. All of them are therefore in **public git history**, not just the working tree. That means:

- **Editing the text forward (redacting the current file) does NOT remove the leak.** Anyone can `git log -p` / view an older commit on GitHub and recover the original strings. The `Acme` narrative, for example, entered history in commit `24b7617` (Part 20) and appears again in `63db0ff`/`52e8789` — a forward edit to today's `HEAD` leaves all three intact.
- **Real remediation is a decision only Joseph can make**, and it is one of: **(a)** rewrite history (`git filter-repo` to strip the strings from every commit) followed by a force-push and re-clone by every collaborator; **(b)** make the repository private (removes public exposure without a history rewrite; forfeits the fork-friendly intent); or **(c)** accept the exposure as low-consequence for some/all findings. Felix does not choose between these and — per role and per the destructive-operation guardrail — will **not** run a history rewrite, a force-push, or a visibility change. Those are the user's calls with a human at the keyboard.
- **Good news, stated as plainly as the bad:** the audit found **no leaked secrets or credentials of any kind** (see the "Verified clean" section). So **no credential rotation is required.** The findings are about *identifying/operational information* (real company and fund names, a real personal-data incident narrative, a real vendor list), not about anything that grants access to a system.

Because forward edits don't remediate and a coordinated history decision is pending, Felix has **not** piecemeal-scrubbed the historical narrative in this pass — doing so would give false comfort while leaving history untouched, and a single coordinated scrub (once Joseph picks a, b, or c) is cleaner and less error-prone than scattering redactions across a 6.9k-line file now. This Part is the manifest that scrub would work from.

## F52 (HIGH) — A real, named portfolio company tied to a real personal-data (DD document) incident

`docs/IMPLEMENTATION_PLAN.md`, Part 20 / Part 22–23 narrative: lines **5030, 5043, 5050, 5343, 5602, 5656** name a specific real DFS Lab portfolio company (now an `ACTIVE`-stage `Company`) and narrate, as documented fact, that its founder submitted a set of **sensitive personal due-diligence documents** (government identity document + personal financial statements, among others) which a storage bug silently failed to save, and that duplicate/phantom rows for that same named company were later hand-deleted from production. This is the highest-severity finding: it associates a **named real company** with (a) the fact that its founder handed over personal identity/financial documents during diligence and (b) an operational mishandling of those documents. The founder's own personal name is **not** present anywhere in the repo (verified — the name flagged in the audit brief returns zero hits outside `package-lock.json` hash false-positives), which caps the blast radius, but the company↔personal-document association is itself confidential and is exactly the class of thing a public fork template must never carry. **In git history** (entered `24b7617`).

## F53 (HIGH) — ~15 real portfolio-company names with deal/valuation detail, several tagged as written-off

`docs/IMPLEMENTATION_PLAN.md`, Part 7 LP-portal narrative and its verification notes: lines **1718, 1723, 1728, 1751, 1946, 1976, 2060, 2265-2267, 2594, 2715, 2905, 4265**. These enumerate roughly fifteen real portfolio-company names alongside per-fund deal counts, tranche/follow-on structure, near-duplicate-round specifics, and instrument details lifted from the real investment tracker. Most damaging: **line 2060** names three specific companies as real **"written off"** cases (current valuation 0). Naming particular portfolio companies as failed investments is reputationally sensitive for both DFS and those founders and is not something that belongs in any public file. Severity is HIGH for the written-off naming, MEDIUM for the rest (names + relative deal structure, but no absolute dollar figures — see the "Verified clean" note on the importer). **In git history** (Part 7 commits, ~`6b7747` onward).

## F54 (MEDIUM) — DFS Lab's real fund-vehicle structure baked into code, README, and docs

Real fund-vehicle labels (the seven-vehicle set and the `MISC`/aggregate buckets) and the exact portfolio shape (76 deals / 50 companies / 7 funds) appear in: `README.md:42`; `scripts/import-investment-tracker.ts:29,111` (the `KNOWN_VEHICLES` constant + a hard-fail message); `prisma/schema.prisma:512`; `src/lib/portfolio-metrics.ts:352`; `src/components/fund-performance-card.tsx:33`; plus many lines in `docs/IMPLEMENTATION_PLAN.md` and `ROADMAP.md`. No dollar amounts, AUM, or IRR values are hardcoded (those stay external — verified). Sensitivity is moderate: these are internal operational labels a fork template should carry as generic examples (or read from config), not DFS's actual vehicle names. Note the code hits (`src/**`, `prisma/**`, `scripts/**`) are **outside Felix's edit scope** — genericizing `KNOWN_VEHICLES` to be data-driven from the imported sheet, and the schema/component comments, is an Alvin task if Joseph wants it. **In git history.**

## F55 (MEDIUM) — A DFS team member named alongside a specific fund's internal performance-reporting request

`docs/IMPLEMENTATION_PLAN.md:3742, 3744, 3748, 3767, 3768` and `ROADMAP.md:156` name a DFS Lab team member (first name) and narrate, as the origin story of Part 15, that a specific fund's internal tracker now carries net-of-fee figures and that Gross IRR was to be dropped "for now." No actual figures are present (the override schema is generic and unpopulated in-repo — verified), so this is internal-process/personnel detail rather than financial data. Reads as written for a private audience. **In git history.**

## F56 (MEDIUM) — DFS's curated vendor directory, with real contact emails, committed as seed data

`prisma/seed.ts` contains DFS Lab's real vetted service-provider directory: ~20+ named third-party firms with real websites and real contact email addresses (roughly 20 distinct external business addresses surfaced by the email scan — e.g. legal, dev-talent, PR, market-research, and design vendors, largely African-market businesses matching DFS's footprint). The individual addresses are public business inboxes (`info@`/`hello@`/`sales@`/`contact@`), which lowers severity, but the *curated list itself* — who DFS vets and recommends to portfolio companies — is internal know-how being shipped in a fork template. A fork should seed with obviously-synthetic example providers. `prisma/**` is **outside Felix's edit scope**; replacing the seed with placeholder providers is an Alvin task. **In git history.**

## F57 (LOW) — Real company names used as UI placeholder text in source

`src/app/admin/companies/[id]/page.tsx:767` uses two real portfolio-company names as the `placeholder="e.g. …"` example in the company-aliases field — visible both in the running admin UI and to anyone reading the source. Trivial to fix (swap for a generic `e.g. Acme, AcmeHQ`), but `src/**` is **outside Felix's edit scope** — Alvin task. **In git history.**

## Verified clean (stated explicitly, not by omission)

- **No secrets or credentials anywhere — working tree or full git history.** A pattern scan across every `*.ts/tsx/js/json/md/env*` diff in all of history for AWS keys (`AKIA…`), PEM blocks, Resend keys (`re_…`), OpenAI/Anthropic keys (`sk-…`), Google OAuth secrets (`GOCSPX-`), credential-bearing Postgres URLs, `AUTH_SECRET`/`NEXTAUTH_SECRET`/`CRON_SECRET` values, and Cloudflare-account-ID R2 endpoints returned **only** the placeholder examples in `.env.example` and `SETUP.md` (`user:password@localhost`, empty `""` values, the `-----BEGIN PRIVATE KEY-----\nMII…` comment template). **No credential rotation is required.**
- **`.env` hygiene is correct.** `.gitignore` excludes `.env`, `.env*`, `.env*.local`, `.env.vercel`, and `.claude/` (incl. `.claude/settings.local.json`). `git log --all --full-history -- '*.env*'` shows no real env file was ever committed and later removed. `.next/` build output is untracked (0 files). The only tracked env file is `.env.example`, which is all placeholders.
- **The LP/financial-data ground rule still holds.** `scripts/import-investment-tracker.ts` and `scripts/backfill-rounds.ts` both read real deal amounts/valuations from an **external xlsx path passed as a CLI argument** (`XLSX.readFile(path)`, `process.argv`), and both carry explicit confidentiality headers ("company names, deal amounts, valuations … must never enter this repository"). No dollar figure, cap-table percentage, valuation, or LP name is hardcoded in either. `scripts/backfill-lp-emails.sql` is a pure `INSERT … SELECT` template with no literal data.
- **No real LP or founder email addresses are committed.** The email scan surfaced only (a) synthetic test fixtures (`@example.com`, `@acme.com`, etc. across `src/**/__tests__`), (b) DFS's own role addresses that are already public product config (`admin@dfs.vc`, `support@dfs.vc`, `noreply@dfs.vc`, `%@dfslab.net`), and (c) the F56 vendor addresses. No `joebaruna@gmail.com` in any committed working-tree file — it appears only in git commit-author metadata (unavoidable, and already public on every commit) and in the local, gitignored `.claude/settings.local.json` (a recorded test-email Bash invocation that was correctly never committed).
- **Test fixtures are synthetic.** Every `src/lib/__tests__/*.ts` fixture uses obvious placeholder data (`acme.com`, `example.com`, `Acme`), not copy-pasted real portfolio data.

## What Felix is NOT doing here (and why)

- Not rewriting git history, not force-pushing, not changing repo visibility — destructive/irreversible operations reserved for Joseph with a human at the keyboard.
- Not piecemeal-redacting the historical narrative in `docs/IMPLEMENTATION_PLAN.md`/`ROADMAP.md` forward — because forward edits don't remediate a public-history leak and would falsely imply the exposure is closed. The single coordinated scrub happens once Joseph picks a remediation path.
- Not editing `src/**`, `prisma/**`, or `scripts/**` (F54/F56/F57's code-side fixes) — outside Felix's docs-only scope; those are Alvin tasks if Joseph greenlights genericizing the vehicle constant, the seed data, and the placeholder text for fork-friendliness.

## Recommended remediation path (Joseph decides)

1. **Decide the history question first** (the only thing that actually removes the exposure): **(a)** `git filter-repo`-based scrub of the F52/F53/F55 strings across all history + force-push + collaborator re-clone; **(b)** make the repo private and keep it that way; or **(c)** accept. Felix's recommendation: given F52 (a named company tied to a personal-data incident) and F53's written-off naming, **(a) or (b)** — this is more than fork-template hygiene; it is real-company/real-person confidential info. Between them, (b) is the faster, lower-risk stop-gap (one setting, reversible) and (a) is the durable fix if the public/fork-friendly intent is to be preserved; they are not mutually exclusive (private now, scrub-then-reopen later).
2. **Separately, for fork-friendliness regardless of the history decision**, have Alvin genericize the forward-facing code/data: `KNOWN_VEHICLES` → data-driven or example labels (F54), `prisma/seed.ts` → synthetic providers (F56), the F57 placeholder → generic. These are additive/cosmetic, safe, and make future forks clean even if history is left as-is.
3. **No credential action.** Nothing leaked; nothing to rotate.

**UX impact:** none — this is an audit; no runtime behavior changes. The optional Alvin follow-ups (F54/F56/F57 genericization) are invisible to founders, admins, and LPs (placeholder text and seed data only). **Cost impact:** none. **Effort estimate:** the history/visibility decision is minutes of Joseph's judgment plus, if (a), ~1–2 hours for a careful `filter-repo` + force-push + collaborator coordination (a human-run operation, not an agent task); the optional fork-hygiene code edits are ~0.5 day for Alvin.

## ROADMAP bookkeeping (Part 27)

`ROADMAP.md` gets a short newest-first pointer at the top of the Roadmap section noting the confidentiality audit (F52–F57) and that remediation is a pending Joseph decision (history rewrite vs. private vs. accept), with no "Existing Features" change. The `_Last updated_` line gains a Part 27 clause. Deliberately **not** restating any of the leaked strings in `ROADMAP.md` — same file:line/category discipline as this Part.

---

# Part 28 — Confidentiality Remediation (Lower-Severity F54/F56/F57) + Standing Guardrail (WS62–WS65, 2026-08-06)

_Planned 2026-08-06 as the follow-up to Part 27; both open decisions (Q69, Q70) confirmed by Joseph the same day — WS62–WS65 are ready to hand to Alvin. **Context that scopes this Part:** the two HIGH findings (F52, F53) have already been fully remediated **out of band** by Joseph via a `git filter-repo` history rewrite (file content **and** commit messages scrubbed, verified clean from a fresh GitHub clone, force-pushed). That work is done and is **not** in scope here — this Part does not touch it or re-audit it. Separately, Joseph is running another `filter-repo` pass himself to scrub the docs-narrative vehicle mentions (F54's "plus mentions in the docs") from history — also out of scope for these workstreams. What remains for this Part are the three lower-severity code/data findings (F54 MEDIUM, F56 MEDIUM, F57 LOW) and a standing guardrail so this class of leak stops recurring._

**Verification pass (2026-08-06, current post-rewrite working tree).** All three lower-severity findings were re-confirmed present before planning — the history rewrite only scrubbed F52/F53's specific company names, not these:

- **F54** — `scripts/import-investment-tracker.ts:29` still hardcodes the real vehicle set in `KNOWN_VEHICLES` (7 real slugs), re-enumerated in the hard-fail message at `:111` and used as anchors/labels at `:105, :150, :191, :348, :444`. Real vehicle labels also in `README.md:42`, `prisma/schema.prisma:512` (`populated for <VEHICLE> only today`) and `:505` (a real group-label example), `src/lib/portfolio-metrics.ts:352` (`null for every fund but <VEHICLE> today`), and `src/components/fund-performance-card.tsx:33` (`for every fund except <VEHICLE> today`). Confirmed present.
- **F56** — `prisma/seed.ts` still ships DFS's real vetted/community provider directory: `VETTED_PROVIDERS` (7 entries) + `COMMUNITY_PROVIDERS` (~20 entries), with real firm names, real websites, and ~20 real business contact emails. Confirmed present.
- **F57** — `src/app/admin/companies/[id]/page.tsx:767` placeholder is currently `"e.g. Initech, HashrailsHQ"`. `Initech` is a synthetic value (the rewrite's incidental replacement of one original real name); `HashrailsHQ` is the second slot and its provenance is ambiguous from the working tree alone. Per the brief, **both** slots get an unambiguously-synthetic value regardless. Confirmed present.

**Scope note.** All three code/data fixes live in `src/**`, `prisma/**`, and `scripts/**` — **outside Felix's docs-only edit scope**. They are specified here for **Alvin** to implement. The standing-convention artifact (the header section above, "Confidentiality & synthetic-data convention") **was written by Felix in this pass** (it is docs). The hook script (WS65) is tooling, specified below as a code sketch for Alvin to create.

---

## WS62 — Genericize the real fund-vehicle labels (F54)

**Goal.** Remove DFS's real vehicle names from committed code/docs while keeping the importer functional for both DFS's real sheet and any fork's sheet. Fork-hygiene only; no runtime behavior change for the running app.

**Confirmed decision (Q69 — Joseph, 2026-08-06): pass the expected vehicle set as a CLI argument.** The importer currently uses `KNOWN_VEHICLES` for four jobs: (1) locating the vehicle-header row by matching known slugs, (2) validating each deal's vehicle, (3) fund `sortOrder` via `indexOf`, and (4) a **hard-fail drift guard** (`:443–446`) that refuses the import if the sheet's vehicle set differs from the expected set — a deliberate safety feature Joseph relies on. The vehicle set moves from the committed constant to a CLI argument, exactly as the xlsx path is already passed: the real slugs live only in Joseph's shell invocation (or a gitignored `.xlsx`-adjacent notes file), never in committed code; the drift guard is preserved (it validates the sheet against the passed set); the committed default is a generic illustrative set used only when no arg is given. This matches the established "real data external via CLI arg" ground rule byte-for-byte and keeps the safety guard. (A straight rename of the constant to `FUND1…` was rejected: it would break DFS's own re-import when the sheet's real column headers no longer match, forcing a local re-edit back to real names each run and reintroducing the strings in the working tree.) **Cheap reversal:** the whole change is localized to `import-investment-tracker.ts`.

**File-by-file steps:**

`scripts/import-investment-tracker.ts`
- Replace the hardcoded `const KNOWN_VEHICLES = [...] as const;` with a runtime-resolved list. Read from a second CLI positional arg or `--vehicles=`, split on commas, trim; fall back to a generic committed default when absent:
  ```ts
  // Vehicle slugs are deployment-specific data — never commit the real set.
  // Pass them at run time:  tsx import-investment-tracker.ts <path.xlsx> --vehicles=A,B,C
  const DEFAULT_VEHICLES = ["FUND1", "FUND2", "FUND3", "MISC"] as const; // illustrative only
  const vehArg = process.argv.find((a) => a.startsWith("--vehicles="));
  const KNOWN_VEHICLES = vehArg
    ? vehArg.slice("--vehicles=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_VEHICLES];
  ```
  `VehicleSlug` becomes `string` (drop the `as const` tuple type; the runtime set is the source of truth). All existing `.includes(...)`, `.indexOf(...)`, `.map(...)`, and the `expectedVehicles` drift check keep working unchanged against the resolved array.
- Rewrite the hard-fail message at `:111` to not enumerate real names: `"Could not find the vehicle-slug header row (expected the slugs passed via --vehicles)."`
- Update the script's top-of-file usage comment / any `--help` text to document `--vehicles`.

`README.md:42` — replace the parenthetical real-vehicle enumeration with a generic description, e.g. *"limited partners of the funds an admin has configured"* — drop the parenthetical list of real vehicle names entirely (it adds nothing a fork needs).

`prisma/schema.prisma` — `:512` comment `populated for <VEHICLE> only today` → `populated for a single fund today (deployment-specific)`; `:505` group-label example → a generic one (`e.g. "Multi-Asset Cohort Funds"`).

`src/lib/portfolio-metrics.ts:352` — comment `null for every fund but <VEHICLE> today` → `null for every fund without an override today`.

`src/components/fund-performance-card.tsx:33` — comment `for every fund except <VEHICLE> today` → `for funds without a manual override`.

**Out of WS62's scope — the docs-narrative vehicle mentions (F54's "plus mentions in the docs") are being scrubbed separately by Joseph.** The Part 7 and Part 15 narrative in *this file* (~30+ lines, e.g. the `1700s`, `1960s`, `2780s`, `3760s–4070s` ranges) and a line in `ROADMAP.md` still use the real vehicle labels as load-bearing technical detail. These are the same class as F52/F53 — narrative already in **git history**, where a forward edit doesn't remediate the history — so Joseph is folding the real vehicle slugs into another `git filter-repo` pass himself (the same process he ran for F52/F53), not Alvin. WS62 therefore does **not** touch the docs narrative; Alvin's scope is only the code/README/schema/component genericization above.

**Acceptance checklist:**
- [ ] `grep -ri` for each of the 7 real vehicle slugs across `src/**`, `prisma/**`, `scripts/**`, `README.md` returns zero hits (Alvin runs against the real list; do not paste the list into any committed file or CI log). (The docs-narrative mentions are handled separately per the note above, not by this checklist item.)
- [ ] `import-investment-tracker.ts` type-checks and, run with `--vehicles=<real set>` against the real sheet, produces the identical import result it did before (Joseph verifies locally — external sheet).
- [ ] Drift guard still fires when the passed set mismatches the sheet.
- [ ] App builds; no runtime change to LP/fund pages (comments-only edits in `src/`/`prisma/`).

**UX impact:** none — comments, a README sentence, and a CLI-invocation change to a one-time script. No founder/admin/LP-visible change. **Cost impact:** none. **Effort:** ~1.5–2 h (Alvin), plus a few minutes of Joseph re-running the importer to confirm.

---

## WS63 — Replace the real vendor directory in seed data with synthetic providers (F56)

**Goal.** `prisma/seed.ts` ships obviously-synthetic example providers instead of DFS's real vetted-vendor list, so a fork's seed carries no DFS internal know-how or real contact emails.

**File-by-file steps:**

`prisma/seed.ts`
- Replace the contents of `VETTED_PROVIDERS` and `COMMUNITY_PROVIDERS` with a small set (keep ~3–4 vetted + ~4–5 community so the seed still demonstrates both statuses and several `CATEGORIES`) of clearly-fictional entries using the app's established placeholder convention. Keep the `CATEGORIES` array and the `main()` upsert loops **unchanged** — only the data literals change. Example entry shape:
  ```ts
  {
    type: "FIRM",
    name: "Acme Advisory",
    website: "https://example.com",
    category: "Advisory & Finance",
    description: "Example vetted provider — replace with your own directory.",
    contactEmail: "hello@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  ```
- Use only `example.com` / `acme.com`-style domains and emails; no real firm names, sites, LinkedIn URLs, or personal names (the two `INDIVIDUAL`-type entries with real people's LinkedIn profiles must go too). Cover a handful of distinct `CATEGORIES` so the directory UI still looks populated in a fresh fork.
- Update the closing `console.log` counts automatically follow from array length — no change needed.

**Acceptance checklist:**
- [ ] `grep` for each real vendor name / domain / contact email (Alvin runs against the real list from the working tree's prior content — but note: after the WS62/WS63 commit, the real values remain in git history; this Part does **not** rewrite history. If Joseph wants seed.ts's real vendor list scrubbed from history too, that folds into the same `filter-repo` decision he already exercised for F52/F53 — flagged, his call, not part of this WS).
- [ ] Fresh `prisma db seed` against a scratch DB creates providers with only synthetic data.
- [ ] Provider directory UI renders the synthetic entries across multiple categories with no empty-state.

**UX impact:** none for DFS's production DB (seed is idempotent `findFirst`-guarded and only ever adds; existing real rows in prod are untouched — the seed is for fresh forks). A fork now sees example providers instead of DFS's real ones. **Cost impact:** none. **Effort:** ~1 h (Alvin).

**Scope boundary:** the seed's real vendor list, like all Part 27 findings, is also in **git history**. WS63 cleans the working tree forward; the history side is Joseph's own `filter-repo` work (he is already running another pass for the vehicle-name narrative — the seed vendor strings are a clean, well-bounded set he can fold into it). Out of Alvin's scope either way.

---

## WS64 — Genericize the company-aliases placeholder text (F57)

**Goal.** Both example values in the aliases-field placeholder are unambiguously synthetic.

**File-by-file steps:**

`src/app/admin/companies/[id]/page.tsx:767`
- Change `placeholder="e.g. Initech, HashrailsHQ"` → `placeholder="e.g. Acme, AcmeHQ"` (the app's own test-fixture convention). This normalizes both slots regardless of which was real.

**Acceptance checklist:**
- [ ] Placeholder reads `e.g. Acme, AcmeHQ`; neither real company name (nor the ambiguous `HashrailsHQ`) remains.
- [ ] `grep -ri` for the two names across `src/**` returns zero hits.

**UX impact:** the greyed placeholder example in one admin-only field changes wording; no functional change. **Cost impact:** none. **Effort:** ~5 min (Alvin).

---

## WS65 — Standing confidentiality guardrail: convention doc (done) + pre-commit blocklist hook (Part B)

**Goal.** Prevent *future* real-company/founder/deal/vendor leaks from entering committed files, so the valuable practice of writing detailed plan/audit narratives into this file can continue safely.

### Part B.1 — Written convention (DONE in this pass)

Felix added the **"Confidentiality & synthetic-data convention"** section to the header of this file (above Part 1). Rationale for placement: this is the file future Felix/Alvin dispatches read before appending narrative, and it's where the leaks historically accumulated, so an inline, top-of-file rule is the highest-leverage location and will concretely change what a future dispatch writes. `README.md`'s Fork Configuration area gets a one-line pointer to it (WS62 already edits README; add the pointer in the same commit) so forkers see it too. No separate `CONTRIBUTING.md` — a root file outside `docs/` would fragment the rule away from where it's actually consulted; one canonical block, referenced from README, is better than two that drift.

### Part B.2 — Automated backstop: local pre-commit hook (specified for Alvin)

**Design decisions, resolved:**

- **Where the sensitive-terms list lives:** a **gitignored** file `.confidential-terms` at repo root, one term per line, `#` comments allowed. It is **never committed** — committing the blocklist would just relocate the leak into a tidy manifest of exactly what's sensitive. A committed **`.confidential-terms.example`** documents the format with **synthetic** entries only (`Acme`, `example.com`, `FUND1`). `.gitignore` gains `.confidential-terms` (next to the existing `*.xlsx` "must never enter git" block, which is the same posture).
- **Hook mechanism:** a committed hook script activated via `git config core.hooksPath scripts/hooks` (a documented one-time setup step) — **no new dependency** (no husky; `package.json` is off-limits and adding a dep violates the no-new-tooling posture). The script is plain POSIX `sh` + `grep`, already present everywhere.
- **What it scans:** **added lines only** of the staged diff (`git diff --cached --unified=0 | grep '^+'`), case-insensitive, against each blocklist term. Scanning only additions avoids flagging a term that appears in an unchanged context and lets a removal-commit through.
- **Exceptions:** none needed. Per the established ground rule, there is **no legitimate reason for a real term to appear in a committed file** — real data stays external via CLI args. The deliberate human override is `git commit --no-verify`, documented as the escape hatch for the rare false positive (e.g. a synthetic term that happens to collide). No allowlist to maintain.
- **Posture — strict-block (confirmed Q70, Joseph, 2026-08-06):** a match aborts the commit (non-zero exit). In an agent-driven workflow a warning is noise that gets scrolled past; a hard block with a `--no-verify` escape is the only version that actually changes behavior. The occasional false positive is cheaply escaped via `--no-verify` (the documented human override). The hook still supports a `CONFIDENTIAL_WARN_ONLY=1` env flip to downgrade to warn for one-off situations, but **the default is block**. **Cheap reversal:** it's one `exit 1` vs `exit 0` line.
- **The hook must not leak the term into shareable logs.** On a local pre-commit hook the output is the developer's own ephemeral terminal (fine to show the matched term to help them). The hook prints `file + line-number + matched term` locally only. It does **not** run in CI, so no risk of a term landing in a public Actions log. (A CI variant would have to redact — see the optional escalation below.)

**Deliverable — `scripts/hooks/pre-commit` (code sketch for Alvin to create, `chmod +x`):**
```sh
#!/bin/sh
# Confidentiality guardrail (Part 28, WS65). Blocks a commit whose staged
# additions contain a known-real-sensitive term. Terms live in a gitignored
# .confidential-terms (never committed). Override a false positive with
# `git commit --no-verify`. Set CONFIDENTIAL_WARN_ONLY=1 to warn instead of block.
set -eu
ROOT="$(git rev-parse --show-toplevel)"
TERMS="$ROOT/.confidential-terms"

if [ ! -f "$TERMS" ]; then
  echo "note: .confidential-terms not found — confidentiality scan skipped."
  echo "      copy .confidential-terms.example to .confidential-terms and fill in real terms."
  exit 0
fi

# staged additions only (drop the leading '+'), excluding the diff's +++ header lines
ADDED="$(git diff --cached --unified=0 --no-color | grep '^+' | grep -v '^+++' || true)"
[ -n "$ADDED" ] || exit 0

HIT=0
while IFS= read -r term; do
  case "$term" in ''|\#*) continue ;; esac      # skip blanks and comments
  if printf '%s\n' "$ADDED" | grep -iqF -- "$term"; then
    echo "BLOCKED: staged change adds a confidential term: \"$term\""
    HIT=1
  fi
done < "$TERMS"

if [ "$HIT" -eq 1 ]; then
  echo ""
  echo "This commit adds one or more terms from your local .confidential-terms list."
  echo "Use a synthetic placeholder (Acme / example.com / FUND1) — see the"
  echo "'Confidentiality & synthetic-data convention' section in docs/IMPLEMENTATION_PLAN.md."
  [ "${CONFIDENTIAL_WARN_ONLY:-0}" = "1" ] && { echo "(warn-only: allowing commit)"; exit 0; }
  echo "Override a genuine false positive with:  git commit --no-verify"
  exit 1
fi
exit 0
```

**Deliverable — `.confidential-terms.example` (committed; synthetic content only):**
```
# Copy this file to .confidential-terms (gitignored) and add the REAL terms,
# one per line. The pre-commit hook (scripts/hooks/pre-commit) blocks any commit
# whose staged additions contain one. This .example is committed; .confidential-terms
# is NEVER committed. Matching is case-insensitive, substring, additions-only.
#
# Categories to populate with your real values:
#   - portfolio company names and their known aliases
#   - fund / vehicle names / labels
#   - founder and LP personal names
#   - vetted-vendor firm names and contact emails
#
# Example entries (synthetic — replace, do not commit real ones here):
Acme
AcmeHQ
example.com
FUND1
```

**Setup step (documented in README + SETUP.md by Alvin):**
```sh
git config core.hooksPath scripts/hooks
cp .confidential-terms.example .confidential-terms   # then edit in the real terms
```
Because `core.hooksPath` is local repo config (not committed), each clone runs the one-liner once; the README note makes it part of the standard setup. `.confidential-terms` being gitignored means the real list never ships.

**Optional escalation (NOT built now — flagged for Joseph if the local hook feels too bypassable):** a GitHub Actions job that scans the PR diff against the term list stored as a **repo Actions secret** (so it's never committed and is auto-masked in logs), failing the check on a match. This is un-bypassable by `--no-verify` and free (Actions already in use), but adds maintenance (the secret must be kept in sync with the local list) and risks the term appearing un-masked if the workflow echoes it wrong. Recommend shipping the local hook first; add CI only if a real bypass happens.

**Acceptance checklist:**
- [ ] `scripts/hooks/pre-commit` exists, is executable, and blocks a test commit that adds a term from a local `.confidential-terms`, while allowing one that doesn't.
- [ ] `git commit --no-verify` bypasses (documented escape).
- [ ] `.confidential-terms` is in `.gitignore`; `.confidential-terms.example` is committed and contains only synthetic terms.
- [ ] README + SETUP.md document the two-line setup and reference the convention section.
- [ ] Hook no-ops with a helpful note when `.confidential-terms` is absent (fresh clone before setup) — does not hard-fail every commit.

**UX impact:** none — developer/agent tooling only; invisible to founders, admins, and LPs. **Cost impact:** none (plain `sh`/`grep`, no dependency, no service). **Effort:** ~1–1.5 h (Alvin), including README/SETUP notes.

---

## Part 28 — confirmed decisions summary

- **Q69 (WS62) — CONFIRMED (Joseph, 2026-08-06): pass the vehicle set as a CLI argument.** Matches the existing real-data-external-via-CLI-arg pattern; keeps the hard-fail drift guard. (Data-driven discovery not taken.)
- **Q70 (WS65) — CONFIRMED (Joseph, 2026-08-06): strict block.** A match aborts the commit; `--no-verify` is the documented escape hatch. (Warn-only available via `CONFIDENTIAL_WARN_ONLY=1`, but block is the default.)
- **Git-history scrub (handled by Joseph, out of scope):** WS62/WS63 clean the working tree forward; the *old* vehicle/vendor strings remain in git history. Joseph is running another `git filter-repo` pass himself (same process as F52/F53) to scrub the docs-narrative vehicle mentions from history — not part of WS62–WS65 and not an Alvin task.

**Part 28 UX impact:** none across all four workstreams. **Part 28 cost impact:** none. **Part 28 total effort:** ~4–5 h Alvin + a few minutes Joseph (importer re-run). Both decisions confirmed; WS62–WS65 are ready to hand to Alvin.

---

# Part 29 — Founder Equity Dilution / Cap-Table Scenario Planner (WS66–WS68, 2026-08-06)

> **Status: PLANNED, not built. Confirmed shape (discussed with Joseph before Felix was engaged).** A new **founder-facing** modeling tool: a founder types their own hypothetical financing assumptions from scratch and sees a stage-by-stage ownership breakdown. Original implementation of standard, well-documented SAFE-note/venture-dilution mechanics — **no external reference tool's code is copied**. Persisted to real schema (unlike the pure live-calculator that inspired it).
>
> **Q71 CONFIRMED (Joseph, 2026-08-06): Option B — multiple named scenarios, mirroring the `/updates` → `/updates/[id]` list-plus-editor split.** A founder holds several named scenarios ("Base case", "Optimistic seed") and switches between them. All A/B branching below is resolved to B; the engine (WS67) was never affected either way, and WS66's schema is the B shape (no `@@unique([companyId])`).

## Confirmed scope boundaries (from the pre-engagement discussion — do NOT re-litigate)

1. **Standalone, self-contained.** Never reads Molly's real `Deal`/`Fund`/`PortfolioCompany` ledger (that data is admin-only and founders have zero visibility into it — deliberate, unchanged here). The founder supplies every input by hand.
2. **Fixed three-stage structure, not arbitrary rounds.** (a) optional accelerator investment (YC-shaped: a fixed-% first tranche + an optional second tranche that converts as new money at the next round's valuation); (b) optional seed (raise amount + post-money valuation); (c) optional Series A (% sold + post-money valuation). No support for an arbitrary number of custom rounds.
3. **Persisted, not ephemeral** — real schema, autosaved like a draft.
4. **Full parity with the reference tool's sophistication:** multiple equal-split founders; an ESOP pool taken as a fixed % before external money; a "friends & family" SAFE group *distinct from* the pre-seed/angel SAFE group; a per-investor **MFN** toggle (an MFN investor's effective cap = the lowest cap among all **non-MFN** investors **in the same group**, computed dynamically); proportional dilution of the accelerator tranches, ESOP, and all SAFEs at each priced round; validation warnings for mathematically impossible models; and a stage-by-stage per-stakeholder breakdown.

## No new F-findings

This is a green-field feature; the codebase-vs-brief review turned up **no roadmap drift or contradiction to record** (the F-sequence stays at F57). Every convention the brief asked Felix to verify was confirmed by reading the code:

- **Pure derived-data engine convention** — `src/lib/portfolio-metrics.ts`, `src/lib/diligence.ts`, `src/lib/share-metrics.ts`, `src/lib/report-snapshot.ts` are all no-DB, no-browser, unit-tested pure modules. The cap-table engine follows this exactly.
- **Computed data is NOT persisted** — `portfolio-metrics.ts`'s position values are recomputed on read, never stored (only *frozen-at-publish* report snapshots are stored, which does not apply here — a scenario is always live). The engine's stage breakdown is likewise derived-on-read; only the **inputs** persist.
- **Variable-length structured content → JSON column** — `WeeklyDigest.sections Json // DigestSection[]` is the standing precedent (also `AuditLog.metadata`, `MetricAlert.metadata`, `FundReportMention.snapshot`, `SheetSyncRun.summary`). Normalized child tables (`MetricValue`, `DigestTodo`) are used only where rows are queried/mutated independently — which a scenario's founder/investor lists never are.
- **One-row-per-company (`CompanyDiligence`, `@@unique companyId`, explicit Save) vs. multi-row drafts (`Update`, autosave)** — the app genuinely has both; Joseph confirmed the multi-row draft pattern (Q71-B) for this feature.
- **Multi-section founder form** — `src/app/diligence/page.tsx` (stacked `Card`s, `AppShell`+`PageHeader`, a success/error banner, conditional sections) is the structural model; the setup wizard (stepped) and report composer (chromeless) are not fits.
- **Founder company-scoping** — `requireCompanyAccess(companyId)` in `src/lib/auth-guard.ts` is the uniform gate (metrics, diligence, documents all use it).

## Q71 — CONFIRMED: multiple named scenarios (Joseph, 2026-08-06)

**Decision: Option B — multiple named scenarios per company**, mirroring the `/updates` list → `/updates/[id]` editor split the app already ships. The `CapTableScenario` model carries a `name` field and **no** `@@unique([companyId])`; the founder creates/names/switches/deletes scenarios, with autosave-on-existing exactly like the WS20 update-draft composer (a brand-new scenario needs an explicit first save, same as `/updates/new`). This matches the feature's inherently comparative nature — Joseph's own "Base case vs. Optimistic seed" framing. The one-row `CompanyDiligence` alternative was declined. WS66/WS67 are unaffected by the fork (the engine is identical regardless); WS68 is authored below for the two-page list-plus-editor structure this decision requires.

## Confirmed judgment calls (Felix's to make; each with a cheap reversal)

- **JC-CT-A — Storage shape: a single `inputs Json` blob (typed `ScenarioInput` in TS), plus a `schemaVersion Int` column.** Not per-field columns. The whole input is one form document always read/written atomically; splitting the three variable-length lists into child tables buys nothing (they're never queried across scenarios) and costs three cascade-delete relations. This is the `WeeklyDigest.sections` precedent. `schemaVersion` (start at `1`) is the cheap forward-compat hedge a JSON blob needs — a future field addition reads old rows by version. *Reversal:* additive columns can always be promoted out of the blob later; nothing is lost.
- **JC-CT-B — Computed breakdown is never stored.** The API persists/returns only `inputs`; the stage-by-stage result is computed by the pure engine, client-side for live feedback as the founder types. This matches `portfolio-metrics.ts` (compute-on-read) and keeps stored data honest (no stale numbers). Because the engine is framework-free it imports cleanly into both the client and — if a server-side read/admin view/export is ever wanted — a route handler. *Reversal:* server-side recompute is a one-line import of the same function; add whenever needed.
- **JC-CT-C — Name + icon + placement: "Dilution Planner", `Calculator` icon, in `founderNav` immediately after Metrics** (the analytical/modeling cluster, not the "manage your records" cluster with Profile/Documents). **Confirmed by Joseph 2026-08-06** ("Dilution Planner" + `Calculator` kept as proposed). Deliberately **not** called "Cap Table" — this is hypothetical, self-declared modeling, not the founder's authoritative cap table, and the honest name avoids implying Molly now holds their real equity ledger. *Reversal:* label/icon are one line in `sidebar.tsx`.
- **JC-CT-D — Founder-private, no admin UI in v1.** `requireCompanyAccess` already lets an admin read any company's data if a route is hit, but no admin-facing planner surface is built — this is self-declared hypothetical data, no more sensitive than a founder's own metrics, and nothing in the brief asks to surface it to admins or LPs. *Reversal:* an admin read view is purely additive later.
- **JC-CT-E — Confidentiality (Part 27/28):** all engine tests and any UI placeholder/example values use synthetic data only — `Acme` / `Jane Founder` / `FUND1`, `example.com`. No real founder cap table, investor name, or valuation enters the repo. (The founder's *own runtime* inputs live in the DB like their metrics; that's fine — the rule is about *committed* files.)

---

## WS66 — Schema + persistence API (`CapTableScenario`) — ~0.75–1.25 day

**Goal.** An additive model that stores a founder's scenario inputs as a JSON document, plus company-scoped CRUD routes. Independent of the engine (WS67) — this WS persists and returns raw `inputs` only.

**File-by-file steps:**

`prisma/schema.prisma` — new model (additive; `prisma db push`, additive-only, safe against prod per the established `--environment=production` pull convention):
```prisma
// Part 29, WS66 — founder equity-dilution scenario planner. Self-declared
// hypothetical inputs only; never reads Deal/Fund/PortfolioCompany.
// `inputs` is a ScenarioInput JSON document (see src/lib/cap-table.ts),
// same variable-length-structured-content-as-JSON precedent as
// WeeklyDigest.sections. Computed breakdown is NEVER stored (JC-CT-B).
model CapTableScenario {
  id            String   @id @default(cuid())
  companyId     String
  name          String   @default("Base case")   // Q71-B: multiple named scenarios per company
  inputs        Json                              // ScenarioInput
  schemaVersion Int      @default(1)              // JC-CT-A forward-compat
  createdById   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdBy User    @relation(fields: [createdById], references: [id])

  @@index([companyId])
  @@map("cap_table_scenarios")
}
```
Add the back-relations on `Company` (`capTableScenarios CapTableScenario[]`) and `User` (`capTableScenarios CapTableScenario[]`), matching how `diligence`/`memberships`/etc. are declared.

`src/app/api/companies/[id]/scenarios/route.ts` (new) — `GET` (list scenarios for the company) + `POST` (create a new named scenario). Both open with `requireCompanyAccess(id)` and mirror the diligence route's error handling (`export const dynamic = "force-dynamic"`, try/catch, 403 via the guard). `POST` sets `createdById: user.id`, `companyId: id`, a `name` (default "Base case"), and stores the client `inputs` after **server-side shape validation** — hand-validated the same way `PATCH .../diligence` allowlists fields (do not trust the blob wholesale): assert `founders` is an array, `esopPct` a finite number in `[0,100]`, each SAFE `{amount, cap, mfn}` well-typed, optional stages well-shaped. Reject with `400` on malformed input.

`src/app/api/companies/[id]/scenarios/[scenarioId]/route.ts` (new) — `GET` (one), `PATCH` (autosave — replace `inputs` and/or `name`, re-validated), `DELETE`. Every handler re-checks `requireCompanyAccess(id)` **and** that the scenario's `companyId === id` (defense-in-depth against an IDOR of the WS55/F48 shape — never trust the `[scenarioId]` alone).

**Judgment calls in this WS:** JC-CT-A (JSON blob + `schemaVersion`), JC-CT-B (no stored compute).

**Acceptance checklist:**
- [ ] `prisma db push` applies additively; no existing table altered destructively; existing companies unaffected (zero rows to backfill).
- [ ] `GET`/`POST`/`PATCH`/`DELETE` all 403 a founder who isn't a member of `[id]` and a cross-company `[scenarioId]` (companyId mismatch → 404/403).
- [ ] Malformed `inputs` (non-array founders, `esopPct` out of range, a SAFE missing `cap`) is rejected `400`, not stored.
- [ ] Round-trip: `POST` then `GET` returns byte-identical `inputs`.
- [ ] Route-handler unit tests in the `src/lib/__tests__/*-route.test.ts` style (synthetic data per JC-CT-E).

**UX impact:** none yet — no surface renders these routes until WS68; purely additive schema + endpoints. **Cost impact:** none (one Postgres table, no new service). **Effort:** ~0.75–1.25 day (Alvin).

---

## WS67 — Pure calculation engine `src/lib/cap-table.ts` + tests — ~1–1.5 day

**Goal.** A framework-independent, DB-free, fully unit-tested function that turns a `ScenarioInput` into the stage-by-stage ownership breakdown plus validation issues. Same posture as `portfolio-metrics.ts`/`share-metrics.ts`. **Interface + math described here; Alvin writes the implementation.**

**Interface sketch (`src/lib/cap-table.ts`):**
```ts
export interface Founder { name: string; }          // equal split of starting equity
export interface SafeInvestor {
  name: string;
  amount: number;                                    // dollars invested
  cap: number;                                       // stated valuation cap (dollars)
  mfn: boolean;                                       // most-favored-nation
}
export interface AcceleratorConfig {
  tranche1Pct: number;                               // fixed % taken as first tranche
  tranche2Amount?: number;                           // optional; converts as NEW money at seed post-money
}
export interface PricedRound { }                      // marker; see seed/seriesA below
export interface ScenarioInput {
  companyNameOverride?: string;
  founders: Founder[];
  esopPct: number;                                   // taken before external money
  accelerator?: AcceleratorConfig;                   // stage (a), optional
  friendsAndFamily: SafeInvestor[];                  // SAFE group #1 (own MFN scope)
  preSeed: SafeInvestor[];                           // SAFE group #2 (own MFN scope)
  seed?: { raiseAmount: number; postMoneyValuation: number };      // stage (b), optional
  seriesA?: { pctSold: number; postMoneyValuation: number };       // stage (c), optional
}

export type StageId = "start" | "preRound" | "afterSeed" | "afterSeriesA";
export type StakeholderGroup =
  | "founder" | "esop" | "accelerator" | "ff" | "preseed" | "seed" | "seriesA";

export interface StakeholderStake {
  id: string;                                        // stable key for React
  label: string;                                     // e.g. "Jane Founder", "ESOP", "Accelerator"
  group: StakeholderGroup;
  pct: number;                                       // 0–100 ownership at this stage
}
export interface ScenarioStage {
  id: StageId;
  label: string;                                     // "Starting", "After F&F + Pre-seed + ESOP + Accelerator", ...
  enabled: boolean;                                  // false stages pass the prior stage through unchanged
  stakeholders: StakeholderStake[];
  total: number;                                     // Σ pct — should be ~100 (guarded)
}
export interface ValidationIssue {
  level: "error" | "warning";
  code: string;                                      // e.g. "FF_EXCEEDS_100", "PRE_ROUND_OVER_ALLOCATED"
  message: string;
}
export interface ScenarioResult {
  companyName: string;
  stages: ScenarioStage[];
  issues: ValidationIssue[];
}

export function computeCapTable(input: ScenarioInput): ScenarioResult;
```

**What it must compute (the mechanics — standard SAFE/venture dilution):**

1. **Effective cap + MFN (compute first, per group independently).** For each SAFE group (`friendsAndFamily`, `preSeed`) **separately**: an MFN investor's effective cap = the **lowest `cap` among the non-MFN investors in that same group**; a non-MFN investor's effective cap = their own stated cap. MFN is scoped to the group — an MFN F&F investor never sees pre-seed caps and vice versa. Edge case: if a group has *no* non-MFN investor, an MFN investor falls back to their own stated cap (document this; it's the only sane definition when there's no reference floor). SAFE ownership fraction = `amount / effectiveCap`.

2. **Stage `start` — founders only, equal split.** Each founder = `100 / founders.length`.

3. **Stage `preRound` — after F&F + pre-seed + ESOP + accelerator tranche 1.** Allocate, as % of the company: ESOP = `esopPct`; each SAFE = `amount / effectiveCap × 100`; accelerator tranche 1 = `accelerator.tranche1Pct`. Founders share the **remainder** = `100 − (esop + acceleratorT1 + Σ all SAFE%)`, split equally. (No priced round yet, so these SAFE fractions are treated as direct pre-round ownership — the reference tool's convention.)

4. **Stage `afterSeed` — seed raise (+ accelerator tranche 2 converting).** New issuance: `seedInvestorPct = seed.raiseAmount / seed.postMoneyValuation × 100`; `acceleratorT2Pct = (accelerator.tranche2Amount ?? 0) / seed.postMoneyValuation × 100`. Dilution factor `d = 1 − (seedInvestorPct + acceleratorT2Pct)/100`. Every `preRound` stakeholder's pct ×= `d`; then add a `seed` stakeholder at `seedInvestorPct`, and **add** `acceleratorT2Pct` onto the accelerator's (already-diluted) line (tranche 2 is new money, new shares — not a re-slice of tranche 1).

5. **Stage `afterSeriesA` — % sold.** Every remaining stakeholder ×= `(1 − seriesA.pctSold/100)`; add a `seriesA` stakeholder at `seriesA.pctSold`. `seriesA.postMoneyValuation` is informational (drives an optional implied-$ column in the UI), not the dilution driver — the stated % sold is.

6. **Disabled stages pass through.** If `accelerator`/`seed`/`seriesA` is absent, that stage carries the prior stage's stakeholders forward unchanged with `enabled: false`.

**Validation issues to emit (at minimum):**
- `error` **`FF_EXCEEDS_100`** — Σ F&F SAFE fractions alone > 100%.
- `error` **`PRE_ROUND_OVER_ALLOCATED`** — `esop + acceleratorT1 + Σ all SAFE% > 100` (founders would go negative before any priced round).
- `error` **`SEED_ISSUANCE_INVALID`** — `seedInvestorPct + acceleratorT2Pct ≥ 100` (seed issues ≥ the whole company).
- `error` / guard — any negative resulting pct at any stage, `cap ≤ 0`, `amount < 0`, `postMoneyValuation ≤ 0`, `pctSold` outside `[0,100]`, `founders.length === 0`.
- `warning` — Σ of a stage's stakeholders departs from 100 by more than a rounding epsilon (numeric-safety net).

Never throw on bad input — return the issues and a best-effort (clamped) breakdown, so the UI can show *both* the partial table and the warnings, matching how `xirr` returns `null` rather than `NaN`/throwing.

**Tests — `src/lib/__tests__/cap-table.test.ts` (synthetic data only, JC-CT-E):**
- [ ] Equal founder split (2 and 3 founders).
- [ ] ESOP-only reduces founders by exactly `esopPct`.
- [ ] Single SAFE ownership = `amount / cap`.
- [ ] MFN picks the lowest non-MFN cap **within its group**; a second test proves F&F-MFN ignores a lower pre-seed cap (group isolation).
- [ ] MFN with no non-MFN peer falls back to own cap.
- [ ] Accelerator tranche 1 only; then tranche 2 converting at seed post-money (added, not re-sliced).
- [ ] Seed dilution factor applied to every prior stakeholder; seed line = `raise/post`.
- [ ] Series A dilutes everyone remaining by exactly `pctSold`.
- [ ] Every enabled stage sums to ~100 (within epsilon).
- [ ] `FF_EXCEEDS_100`, `PRE_ROUND_OVER_ALLOCATED`, `SEED_ISSUANCE_INVALID` each fire on a crafted impossible input; a valid input yields zero `error` issues.
- [ ] Disabled stages pass the prior stage through unchanged.

**UX impact:** none (pure module, no surface). **Cost impact:** none. **Effort:** ~1–1.5 day (Alvin), most of it the test matrix.

---

## WS68 — Founder UI: scenario form + stage-by-stage results + sidebar entry — ~2–3 days

**Goal.** A founder page to enter a scenario and see the live breakdown, in Molly's own design system (Paper/Bone/Obsidian tokens, existing `Card`/`Input`/`Button`/`Table`/`Select` components) — **not** the reference tool's styling. Structural model: `src/app/diligence/page.tsx` (stacked `Card`s, `AppShell`+`PageHeader`, success/error banner, conditional sections).

**File-by-file steps:**

`src/components/layout/sidebar.tsx` — add to `founderNav` after Metrics (JC-CT-C):
```ts
import { Calculator } from "lucide-react";
// ...
{ label: "Metrics", href: "/company/metrics", icon: BarChart3 },
{ label: "Dilution Planner", href: "/planner", icon: Calculator },
```

`src/app/planner/page.tsx` (new) — the list page, mirroring `/updates/page.tsx`: the company's scenarios (name + updated date), a "New scenario" button → creates via `POST` and routes to `/planner/[id]`, per-row delete-with-confirm (the app's existing draft-delete confirm idiom).

`src/app/planner/[id]/page.tsx` (new) — the editor. `"use client"`, `useCompany()` for `selectedCompany.id` (same as `/diligence`). Loads inputs via `GET`, holds them in React state, **computes the breakdown live client-side by importing `computeCapTable` from `src/lib/cap-table.ts`** (JC-CT-B — instant feedback, no round-trip). Sections, each a `Card`:
  - **Founders** — add/remove rows (name input each); equal-split is implicit (show the resulting per-founder % as a read-only hint).
  - **ESOP** — a single `Input` (number, %, labelled "taken before external money").
  - **Accelerator** — a checkbox "Include an accelerator investment" (the diligence conditional-card / WS11 "schedule for later" disclosure idiom) revealing `tranche1Pct` + optional `tranche2Amount`.
  - **Friends & Family** and **Pre-seed** — two separate SAFE-list sections, each: add/remove investor rows of `{name, amount, cap, MFN checkbox}`, with the **computed effective cap shown read-only** beside the MFN toggle (recomputed live from the group's other rows).
  - **Seed** — checkbox-gated `raiseAmount` + `postMoneyValuation`.
  - **Series A** — checkbox-gated `pctSold` + `postMoneyValuation`.
  - **Results** — a `Table` (the `src/components/ui/table.tsx` primitive) with one row per stakeholder and one column per **enabled** stage (Starting → After F&F+Pre-seed+ESOP+Accelerator → After Seed → After Series A), each cell an ownership %. Validation `issues` render above it as banners using the brand tokens the diligence page already uses (`border-laterite/30 bg-laterite/10 text-laterite` for `error`, the `ochre` equivalents for `warning`).
  - **Autosave** — debounced `PATCH` on the existing scenario, matching the WS20 update-draft convention (~30s, suppressed while a manual save is in flight, ambient "Saved · time" indicator). A brand-new scenario is created via the list page's "New scenario" button (explicit first save), exactly like `/updates/new`.

**Reused as-is (no new endpoints beyond WS66):** `AppShell`, `PageHeader`, `Card*`, `Input`, `Button`, `Select`, `Table*`, `useCompany`, the confirm-dialog and "Saved ·" patterns.

**Judgment calls:** JC-CT-C (name/icon/placement), JC-CT-B (client-side compute).

**Acceptance checklist:**
- [ ] "Dilution Planner" appears in the founder sidebar after Metrics; active-state highlight works via the existing `isActive` logic.
- [ ] A founder can enter all four scope-4 capabilities (multi-founder, ESOP, two distinct SAFE groups with per-investor MFN, accelerator two-tranche, seed, Series A) and see the stage-by-stage table update live.
- [ ] The MFN read-out beside a toggled investor shows the correct lowest-non-MFN-cap-in-group value and updates when a peer's cap changes.
- [ ] Impossible inputs surface the WS67 validation banners without crashing the table.
- [ ] The `/planner` list shows the company's scenarios; "New scenario" creates and opens one; per-row delete-with-confirm works.
- [ ] Autosave persists edits to an open scenario (reload restores them); a new scenario is created explicitly from the list, never auto-created on the editor route.
- [ ] Renders correctly at 375px per the Part 6 house patterns (scrollable results table = Pattern A; wrapping investor/founder rows = Pattern D; base `grid-cols-1` if any grid is used — the WS14.7 gotcha).
- [ ] Founder-company-scoped: another company's scenarios are unreachable (server-enforced by WS66; the client only ever passes `selectedCompany.id`).

**UX impact:** purely additive — one new founder sidebar item and its two pages (list + editor); nothing existing changes for founders, admins, or investor-link/LP recipients. Admins gain nothing here (JC-CT-D). **Cost impact:** none (existing Postgres + Vercel; no Anthropic/Resend/S3 calls — it's arithmetic). **Effort:** ~2.5–3 days (Alvin) — the list page + new-scenario flow + editor + live results table.

---

## Part 29 — confirmed decisions summary

- **Q71 — CONFIRMED (Joseph, 2026-08-06): Option B, multiple named scenarios** per company, mirroring `/updates` → `/updates/[id]`. WS66's schema is the B shape (no `@@unique([companyId])`, a `name` field); WS68 is the two-page list-plus-editor structure. The declined alternative (one auto-saved scenario) is not built.
- **Naming — CONFIRMED (JC-CT-C):** **"Dilution Planner"** + `Calculator` icon, in `founderNav` after Metrics.
- **Confirmed judgment calls:** JSON-blob storage + `schemaVersion` (JC-CT-A), compute-never-stored (JC-CT-B), founder-private/no-admin-UI (JC-CT-D), synthetic-only test/placeholder data (JC-CT-E). All cheaply reversible.
- **Dependency order:** WS66 (schema + routes) ∥ WS67 (engine + tests) are independent and can start in parallel; WS68 (UI) depends on both. No open decisions remain — Part 29 is ready to hand to Alvin.
- **Constraints honored:** additive-only schema, no new cost line, no UX regression (net-new surface only), synthetic data throughout committed files.
- **Part 29 total effort:** ~4.5–5.5 days Alvin (WS66 ~1d + WS67 ~1.25d + WS68 ~2.5–3d).

---


# Part 30 — Admin Email Broadcast to Portfolio Companies (WS69–WS74, F58–F62, 2026-09-01)

> **Status: PLANNED, not built. All product decisions CONFIRMED (Joseph, 2026-09-01) — nothing open.** The founder-side counterpart to the LP fund-report publish flow. Today an admin composes a `FundReport` and, on publish, can email every LP address across that fund (`src/app/api/admin/reports/[id]/publish/route.ts`); there is **no equivalent aimed at portfolio companies** — verified, every company-directed email in `src/lib/email.ts` is transactional (approval, invite, reminder, comment, DD). Part 30 adds an admin-composed **broadcast** with the same draft→publish lifecycle.
>
> Joseph's framing: *"I want to send our emails to portfolio companies just the way I send emails to LPs."*
>
> **This Part was revised on 2026-09-01 after Joseph reviewed the first draft.** The original draft targeted `Company` + `UserCompanyMembership` (real Molly logins). Joseph corrected it: **many portfolio companies are not active Molly users at all**, so routing recipients through app accounts would miss most of the actual portfolio. Targeting moved to `PortfolioCompany` plus a **new, admin-maintained contact list**. The superseded design is not preserved below — this Part reads as the corrected design throughout.

## Confirmed decisions (D1–D9 — locked, do NOT re-litigate)

1. **D1 — New feature, not a repurposing.** A new broadcast model with its own draft→publish lifecycle. Neither `Update` (founder-authored) nor `FundReport` (fund-scoped, LP-facing, mention/snapshot machinery) is reused as the persistence model.
2. **D2 — Audience unit is `PortfolioCompany`** — the ~50-row cap-table entity already used for LP report mentions (`FundReportMention.portfolioCompanyId`) — **not `Company`**. *(Corrected 2026-09-01; this reverses the first draft's decision.)*
3. **D3 — Recipients come from a new admin-maintained contact list** (`PortfolioCompanyContact`: name + email, many per company), attached to `PortfolioCompany` by FK. Structurally the `LimitedPartner`/`LpEmail` pattern, with one deliberate divergence (see JC-BC-B).
4. **D4 — One mechanism for every company, no branching.** Even where a `PortfolioCompany` has a linked `Company` with active founder logins, the broadcast goes to the **contact list**, never to `UserCompanyMembership` users. Joseph chose this explicitly over the alternative (auto-pull founder accounts when the company is active, fall back to contacts otherwise): one path, no dual logic, no "why did this person get it / not get it" ambiguity. **Consequence to state plainly:** contact rows are the single source of truth and must be maintained by an admin — an active founder with a Molly login who is *not* on the contact list receives nothing. WS70 exists to make maintaining that list easy, and WS74's preview makes the consequence visible before every send.
5. **D5 — Per-broadcast targeting.** The admin picks a subset of portfolio companies with a multi-select audience picker. Not "always the whole portfolio."
6. **D6 — Draft → publish lifecycle with history.** Write, save, review, later publish (which sends), and see a list of past broadcasts.
7. **D7 — Dedup by email address.** One address receives one email per broadcast, no matter how many targeted companies list it. Since recipients are plain contact rows (no `User`, no roles, no `UserStatus`), dedup is purely "same normalized email" — there is no APPROVED/FOUNDER-role check anywhere in this feature.
8. **D8 — The email carries the full body** (no link-out), **there is no founder-facing in-app archive** (inbox only in v1), **no unpublish/undo** (email cannot be unsent) but **retry-unsent and duplicate-as-draft are both built**, and **there is no opt-out control in v1**.
9. **D9 — Sending domain is already handled.** `EMAIL_FROM` is set on Vercel; `src/lib/email.ts:7` falls back to `` `Molly from ${ORG_NAME} <hello@dfs.vc>` ``. The new template uses the existing module-level `FROM` like every other template.

## Method — what was verified against the working tree (not assumed)

- **The LP publish flow** — `src/app/api/admin/reports/[id]/publish/route.ts`: `requireAdmin()` → `DRAFT`-only guard → snapshot freeze in `db.$transaction` → status flip to `PUBLISHED` → **then** the opt-in notify loop (plain `for…of`, per-recipient `try/catch`, `notified`/`failed` counters, never rethrows — the F12 lesson) → `logAdminAction(user!, "REPORT_PUBLISHED", …)` → response carrying `notifyResult`. **Publish happens before sending**; Part 30 keeps that ordering.
- **Dedup in the LP loop (F51 revisited).** The brief asked to mirror "the F51 dedup logic." Verified: **there is none to mirror.** F51 concluded dedup was unnecessary *structurally* (single-fund publish + `@@unique([lpId, fundId])` + globally-unique `LpEmail.email`). Part 30's shape defeats all three of those guarantees at once — multi-company targeting, and (per JC-BC-B) contact emails that are **not** globally unique — so it needs real dedup, in WS71.
- **`PortfolioCompany`** (`prisma/schema.prisma:556`) — `id`, `name @unique`, `country?`, `companyId? @unique` (optional link to an operational `Company`), timestamps; relations `company`, `deals`, `mentions`, `rounds`, `marks`, `cashflows`. **It has no `stage`, `status`, or `active` column of any kind** — see F62.
- **The LP contact pattern** — `LimitedPartner` (`:695`) holds `name` + a denormalized nullable `email` mirror; `LpEmail` (`:714`) holds `lpId`, `email @unique` (**globally** unique), `isPrimary`, cascade delete, `@@index([lpId])`. `LpFundMembership` (`:727`) is the join with `@@unique([lpId, fundId])`.
- **LP contact CRUD to mirror** — `src/app/api/admin/lps/[id]/emails/route.ts`: `POST` (add: trim+lowercase, `EMAIL_REGEX` validate, clash check, first-address-is-primary rule, audit `LP_EMAIL_ADDED`), `DELETE` (remove by email in the JSON body, re-promote a new primary, audit `LP_EMAIL_REMOVED`), `PATCH` (set primary, audit `LP_EMAIL_PRIMARY_CHANGED`). The `EMAIL_REGEX` is **duplicated per file by house convention, not centralized** (the file says so explicitly) — WS70 follows that convention rather than "fixing" it.
- **LP contact UI to mirror** — `src/app/admin/lps/page.tsx:320-370`: inside the edit `Modal`, an "Addresses" block of `rounded-sm border border-border px-2.5 py-1.5` rows, each showing a `Star` for primary plus "Make primary" / `X` remove buttons, with an `input-field` + "Add" `Button` beneath and an inline `text-laterite` error line.
- **Portfolio-company admin API that already exists** — `GET`/`POST /api/admin/portfolio-companies` (list returns `{ id, name, country, companyId, company, dealCount, mentionCount }`, supports `?fundId=` and `?q=`; create validates a ≤200-char unique name, audits `PORTCO_CREATED`), `PATCH`/`DELETE /api/admin/portfolio-companies/[id]` (delete 409s while deals or mentions exist), and the **sub-route precedent** `/api/admin/portfolio-companies/[id]/marks`. The list endpoint is exactly what the audience picker needs.
- **Portfolio-company admin UI that already exists** — `/admin/portfolio` is the cross-fund **deal ledger**; its rows link to `/admin/portfolio/[id]`, a per-portfolio-company page (`src/app/admin/portfolio/[id]/page.tsx`, 547 lines) laid out as stacked sections with the `<h3 className="mb-3 flex items-center gap-2 font-semibold">` + icon idiom: header card → "Positions by fund" → "Deals across funds" → rounds → valuation marks. **There is no dedicated portfolio-company list page; creation happens on `/admin/funds/[id]`.** There is **no contact UI anywhere** — hence WS70.
- **`RichEditor`** (`src/components/ui/rich-editor.tsx:38-66`) — the image toolbar button renders only when `companyId` is passed (`:390`) and `handleImageUpload` no-ops without it (`:139`). The report composer passes none; the broadcast composer won't either. Text, links, lists, headings only.
- **Composer shell** — `<ComposerTopBar>` (`src/components/composer/composer-top-bar.tsx`: `draftLabel`, `secondaryActions`, `publishLabel`, `onPublishClick`, `publishDisabled`, `publishing`, `overflowItems`) plus the ochre `border-ochre/30 bg-ochre/10` inline confirm panel from `src/app/admin/reports/[id]/page.tsx:308-360`.
- **Multi-select picker pattern** — `src/app/admin/links/page.tsx:288-380`: a `max-h-72 overflow-y-auto rounded-md border divide-y` scroll container of `<label>` rows with `<input type="checkbox" className="h-4 w-4 rounded border-border accent-primary">`, a running "N across M" summary, and Select-all/Clear buttons. **Inline JSX, not a component, and it selects updates** — copied as a pattern (JC-BC-H).
- **Email conventions** — module-level `FROM`/`TEAM_EMAIL`/`BASE_URL`, brand token object `C`, helpers `emailWrapper()`, `eyebrow()`, `heading()`, `primaryButton()`, `escapeHtml()`, and `assertSent(result, context)`. **Precedent for embedding rich-text HTML in an email exists**: `sendUpdatePublishedEmail` (`:185-240`) drops TipTap HTML raw into a styled `<div>`.
- **The existing CSV importer (the pattern WS70.3 mirrors)** — `src/app/api/admin/companies/import/route.ts` (62 lines) + its trigger in `src/app/admin/companies/page.tsx:80-240`. Confirmed conventions: **parsing happens client-side** (`parseCSV`, hand-rolled, no library) and the route receives **JSON rows**, never a file — so there is no multipart handling and no dependency anywhere in this path; header matching is lowercased/quote-stripped with alias sets and a BOM strip; the route is **create-only with skip-on-duplicate** (case-insensitive name match → `skipped++`, never an update); every row is wrapped in its own `try/catch` that pushes a string into `errors: string[]`; it **always returns 200** with `{ created, skipped, errors }` and only 400s an empty/non-array payload; it writes a single `COMPANIES_IMPORTED` audit row carrying counters and **no `targetType`/`targetId`**. The UI is a hidden `<input type="file" accept=".csv">` behind an `Upload`-icon secondary `Button` in the `PageHeader` action, with a dismissible acacia success banner (bulleted `text-laterite` error list) and a laterite failure banner. **One real defect inherited if copied blindly:** `parseCSV` splits on bare commas, so a quoted cell containing a comma shifts every later column — hence WS70.2.
- **`scripts/import-investment-tracker.ts` + `SheetSyncRun` — checked as prior art and ruled out for this purpose (verified, not assumed).** The script is an `xlsx`-reading, **CLI-only, one-time** importer: dry-run by default, run as `npx tsx … <path-to-xlsx> --write` with a production `DATABASE_URL` pasted in by hand, and its own header comment says the source file must live **outside the repo tree**. It is not admin-triggerable and never becomes a route. `SheetSyncRun` (`prisma/schema.prisma:682`) is the run-history table for the **Google-Sheets deal/valuation sync** (`trigger: "CRON" | "MANUAL" | "DRY_RUN"`), a global integration gated by `sheetsSyncEnabled()` — not a generic "import run" log, and nothing in Part 30 writes to it. **Dead end for contacts.** Two things from that neighborhood *are* genuinely useful, and both are cited where they're used: `src/lib/sheet-link.ts`'s stated doctrine — *"It never invents data and never guesses: anything ambiguous or unmatched is flagged, not forced"* (the basis for JC-BC-L) — and the contrast that `src/lib/sheet-sync-runner.ts:101` **does** auto-create a `PortfolioCompany` by name upsert, but only from the authoritative deal spreadsheet and only after the admin has previewed the diff's `newCompanies` list (JC19), which a contacts CSV is not and does not.
- **Resend SDK** — `resend@^6.9.2` exposes `resend.batch.send(payload, { batchValidation: "permissive" })` (`node_modules/resend/dist/index.d.mts:354-372, 1096-1101`), ≤100 messages per call, returning `data.data: {id}[]` and, in permissive mode, `data.errors: { index, message }[]`. `replyTo` is in `CreateEmailBaseOptions` (`:282`). No new dependency, no new cost line.
- **Audit** — `logAdminAction(actor, action, { targetType, targetId, metadata })` never throws; `/admin/audit` renders `log.action` as a raw mono string (`src/app/admin/audit/page.tsx:68`), so new action types need **zero** UI changes.
- **Timeout posture** — `grep -rn "maxDuration" src/ next.config.js` → **zero hits**; `vercel.json` holds only `crons`. Every route runs on the platform default (F59).

---

## F58 — ROADMAP's sidebar bullet describes a nav layout that no longer exists (LOW, docs-only)

`ROADMAP.md` line 108 states the "Company Operations" sidebar group is "(Approvals, Companies, Updates, Update Templates, Investor Links)". The real group in `src/components/layout/sidebar.tsx` is **Approvals, Diligence, Companies, Updates, Investor Links** — Diligence was added by Part 16, and Update Templates was removed from the sidebar entirely and became a tab on `/admin/updates` (`src/app/admin/templates/page.tsx` is now nothing but `redirect("/admin/updates?tab=templates")`, while ROADMAP line 90 still presented it as its own page). The founder-nav sentence in the same bullet predates Documents (Part 20) and Dilution Planner (Part 29). **Annotated in `ROADMAP.md` in this same pass.** No code change.

## F59 — The publish-time email fan-out has no duration or rate-limit guard (MEDIUM for the new feature, LOW/latent for the existing one)

The LP notify loop fans out with a serial `await` per address inside the request handler, and **no route in this repo sets `export const maxDuration`** (grep-verified). At LP scale this has never mattered. A portfolio broadcast is a different order of magnitude — every contact of every targeted company in one request — and two limits bite: **function duration** (N serial round-trips at ~150–400 ms each will outrun a short default, killing the request mid-loop with no record of who was actually reached) and **Resend request rate** (a tight serial loop outpaces the account's default request rate, turning late recipients into 429s that the existing pattern would silently bucket as failures). **Action here:** the new fan-out is designed around it (JC-BC-E). **The existing LP loop is deliberately NOT changed** — recorded as a latent instance to revisit only if LP counts grow or Joseph asks.

## F60 — Recipient-selection rules already differ between the existing email paths (LOW, informational)

The reminder cron (`src/app/api/cron/reminders/route.ts:29-33, 78-93`) selects `memberships: { role: { in: ["OWNER", "MEMBER"] } }` and mails `membership.user.email` **without checking `User.status` or `User.roles`**, so a never-activated invitee can receive update reminders today. Part 30 no longer overlaps with this population at all (D4: broadcasts never read `UserCompanyMembership`), but the finding stands as a recorded divergence. **No change to the reminder cron is proposed** — altering who receives reminders is a product decision nobody asked for.

## F61 — Portfolio-company endpoints live under two different API namespaces (LOW, a real trap for the implementer)

The same entity is served by two sibling paths: mutations and the list are at **`/api/admin/portfolio-companies`** and **`/api/admin/portfolio-companies/[id]`** (with the `…/[id]/marks` sub-route), while the **read** used by the detail page is at **`/api/admin/portfolio/companies/[id]`** (`src/app/admin/portfolio/[id]/page.tsx:104`). Nothing is broken; it is a naming inconsistency that will send a junior implementer to the wrong file. **Action in this Part:** WS70 puts the new contacts sub-route under the *hyphenated* namespace beside `marks` (`/api/admin/portfolio-companies/[id]/contacts`) and separately extends the detail-page read at `/api/admin/portfolio/companies/[id]` to include contacts. **No renaming or consolidation is proposed** — that would be a gratuitous refactor of shipped, working routes.

## F62 — `PortfolioCompany` has no lifecycle/stage column, so there is no "eligible companies" filter to apply (informational — states a non-existent thing plainly rather than force-fitting one)

The first draft of this Part proposed gating the audience picker with `approvedCompanyFilter` (`src/lib/company-filters.ts`). **That filter is now irrelevant**: it is a `Prisma.CompanyWhereInput` keyed on `Company.stage !== "DILIGENCE"` and `Company.createdBy.status`, and targeting has moved off `Company` entirely. Verified against `prisma/schema.prisma:556`: **`PortfolioCompany` carries no `stage`, `status`, `active`, or `exited` column** — the only lifecycle signal anywhere near it is derived data (`Deal.currentValuation` is documented as "0 = written off"). Therefore:

- The eligible set for the picker is simply **every `PortfolioCompany` row**, ordered by name — which is exactly what `GET /api/admin/portfolio-companies` already returns.
- No schema field is invented to model "active portfolio company." If that concept is ever wanted, it is its own decision on its own day.
- The two honest, purely-presentational filters WS74 offers instead are the ones the existing endpoint already supports (`?fundId=`, `?q=`) plus a client-side "hide companies with no contacts" toggle, since a zero-contact company contributes zero recipients and is only noise in the picker.

---

## Judgment calls (Felix's; each with its reversal path)

- **JC-BC-A — Four additive models.** `PortfolioCompanyContact` (the audience directory), `CompanyBroadcast` (the draft), `CompanyBroadcastTarget` (chosen companies), `CompanyBroadcastRecipient` (who was actually mailed, frozen at publish). The last is the direct analogue of `FundReportMention`'s freeze-at-publish: contact lists change, so "who received the January broadcast" is only answerable if it was recorded at send time — and it is what makes retry-unsent exact. *Reversal:* stop writing recipient rows; the table goes inert.
- **JC-BC-B — Contact emails are unique *per company*, NOT globally — the one deliberate divergence from `LpEmail`.** `LpEmail.email` is globally unique because it is a **login identity** (any address can request an OTP and must resolve to exactly one LP). A `PortfolioCompanyContact` is not an identity — nobody logs in with it — and the same person can legitimately be a contact at two portfolio companies (a serial founder, a shared operator, an advisor). A global unique constraint would make that unrepresentable and would reject a perfectly valid second row. So: `@@unique([portfolioCompanyId, email])`. **This is precisely why D7's send-time dedup is mandatory** rather than structurally free the way F51 found it to be on the LP side. *Reversal:* tightening to global uniqueness later is a migration; loosening a global constraint is not, so the loose-and-dedup direction is the safe default.
- **JC-BC-C — No `isPrimary` on contacts.** `LpEmail.isPrimary` exists to feed the `LimitedPartner.email` mirror and to pick a login identity. Broadcasts mail **every** contact of a targeted company, so there is no "primary" to choose and no mirror column to keep in sync. Contacts carry an optional free-text `role` label instead (e.g. "CEO", "Finance") purely for admin legibility. *Reversal:* adding `isPrimary` later is an additive boolean.
- **JC-BC-D — No unpublish route.** `PATCH`/`DELETE` refuse a `PUBLISHED` broadcast (mirroring `src/app/api/admin/reports/[id]/route.ts`); no unpublish endpoint exists, because it would falsely imply un-sending (D8).
- **JC-BC-E — Fan-out via `resend.batch.send` in chunks of 100 with `batchValidation: "permissive"`, plus `export const maxDuration = 60` on the publish route** (F59). Recipient rows are created **before** sending (status `PENDING`) and updated from the batch response, so a killed request still leaves an accurate record and retry-unsent is exact. Failure isolation survives batching through `errors[].index`. *Reversal:* swap in the LP route's serial `resend.emails.send` loop — recipient bookkeeping is identical either way, so it is a single-function change inside `src/lib/email.ts`.
- **JC-BC-F — "Send a test to myself" before publish.** `POST …/test` mails the draft to the acting admin's session email only, audit-logged `BROADCAST_TEST_SENT`; `sendTestEmail` (`src/lib/email.ts:602`) is the precedent. The safety valve for an irreversible action. *Reversal:* delete the route + button.
- **JC-BC-G — The email is per-person, never per-company.** Because of D7 dedup, one recipient can map to several targeted companies, so the template must **not** interpolate a company name into the subject or greeting. Greeting is first-name-or-"Hello,", exactly like `sendLpReportPublishedEmail`.
- **JC-BC-H — The audience picker is copied as a pattern, not extracted.** The bulk-link picker selects *updates* and is entangled with that page's state; extracting a generic multi-select would refactor a shipped, LP-critical surface for no user-visible gain. WS74 writes its own ~40-line picker with the identical class strings. *Reversal:* extract if a third caller appears (rule of three).
- **JC-BC-I — Nav: "Broadcasts", `Megaphone` icon.** Placed in the **"Funds & LPs" group after "Fund Reports"**, not in "Company Operations" — under the corrected design this feature is a cap-table/`PortfolioCompany`-side tool (same entity as Deal Ledger and report mentions), and every other `PortfolioCompany` surface already lives in that group. *(This moved as part of the D2 correction; the first draft placed it under Company Operations, which now no longer matches what it targets.)* `Megaphone` is confirmed present in the installed `lucide-react`. *Reversal:* one line.
- **JC-BC-J — Confidentiality (Parts 27/28).** All fixtures/placeholders synthetic: `Acme`, `Northwind`, `Jane Founder`, `founder@example.com`. No real company, founder, or address in a committed file — this Part touches the exact data class F52/F53 were about, so it matters here more than usual.
- **JC-BC-K — CSV import is an UPSERT on `(portfolioCompanyId, email)`, not create-only-skip.** This is a deliberate divergence from `companies/import`'s skip-on-duplicate, with a reason: creating a `Company` there is heavyweight (an owner, memberships, invite implications), so refusing to touch an existing one is right; a contact is a two-field record with a natural key, and the expected workflow is "fix the spreadsheet, re-upload." Create-only would make a typo unfixable by CSV, and duplicates are impossible anyway thanks to the unique constraint. Blank CSV cells never overwrite stored values. *Reversal:* flip the `update` branch to a `skipped++` — one branch in one route.
- **JC-BC-L — A CSV row naming an unknown company is skipped and reported; a `PortfolioCompany` is NEVER created by an import.** This follows `src/lib/sheet-link.ts`'s stated doctrine (never guess, flag instead) rather than `sheet-sync-runner.ts`'s auto-create, because a contacts spreadsheet is not authoritative for company *existence*: a typo would silently mint a ghost portfolio company that then shows up in the deal ledger, the report-mention picker and the broadcast audience list. Unmatched names come back as a **distinct** list so one bad name reads as one line, not thirty. *Reversal:* an "also create missing companies" checkbox is additive later, and would want the sync's preview-then-apply shape rather than a blind write.
- **JC-BC-M — One import endpoint, two entry points; the CSV is portfolio-wide by default.** Joseph will have one spreadsheet covering many portfolio companies, not one file per company, so the canonical form carries a `company` column and is uploaded from `/admin/portfolio`. The same endpoint accepts an optional `defaultPortfolioCompanyId` so the per-company page can take a two-column `name,email` file; a row naming a *different* company from there is a row-level error rather than a silent write elsewhere. *Reversal:* drop the portfolio-wide button and keep only the scoped one (or vice versa) — the route serves both unchanged.

---

## WS69 — Schema: contacts + broadcast + targets + recipients — ~0.5–0.75 day

**Goal.** Additive persistence for the contact directory, the draft, its audience, and its delivery record. Nothing renders yet.

**File-by-file steps:**

`prisma/schema.prisma` — four new models (additive; apply with `prisma db push` per the established `vercel env pull --environment=production` convention):

```prisma
// ─── Portfolio-company contacts (Part 30, WS69) ───────────
// The audience directory for admin broadcasts. Structurally the
// LimitedPartner/LpEmail pattern, with two deliberate divergences:
//  - email is unique PER COMPANY, not globally (JC-BC-B) — a contact is
//    not a login identity, and one person can be a contact at two
//    portfolio companies. Send-time dedup (WS71) handles the overlap.
//  - no isPrimary (JC-BC-C) — broadcasts mail every contact, and there is
//    no denormalized mirror column to keep in sync.
// D4: this list is the ONLY source of broadcast recipients, even for a
// PortfolioCompany linked to an active Company with real founder logins.
model PortfolioCompanyContact {
  id                 String   @id @default(cuid())
  portfolioCompanyId String
  name               String?
  email              String   // stored trimmed + lowercased
  role               String?  // free-text label, admin legibility only ("CEO", "Finance")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)

  @@unique([portfolioCompanyId, email])
  @@index([portfolioCompanyId])
  @@map("portfolio_company_contacts")
}

// ─── Company broadcasts (Part 30, WS69) ───────────────────
// The portfolio-side analogue of FundReport: an admin-composed message
// whose publish step emails the contacts of the targeted portfolio
// companies.
model CompanyBroadcast {
  id          String    @id @default(cuid())
  subject     String    // also the email subject line
  body        String    @db.Text // TipTap HTML, same as FundReport.body
  status      String    @default("DRAFT") // "DRAFT" | "PUBLISHED"
  publishedAt DateTime?
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  createdBy  User                       @relation("CreatedBroadcasts", fields: [createdById], references: [id])
  targets    CompanyBroadcastTarget[]
  recipients CompanyBroadcastRecipient[]

  @@index([status, createdAt])
  @@map("company_broadcasts")
}

// The chosen audience — one row per targeted PortfolioCompany (D2).
model CompanyBroadcastTarget {
  id                 String @id @default(cuid())
  broadcastId        String
  portfolioCompanyId String

  broadcast        CompanyBroadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  portfolioCompany PortfolioCompany @relation(fields: [portfolioCompanyId], references: [id], onDelete: Cascade)

  @@unique([broadcastId, portfolioCompanyId])
  @@index([portfolioCompanyId])
  @@map("company_broadcast_targets")
}

// Frozen-at-publish delivery record — the FundReportMention freeze
// precedent (JC-BC-A). Rows are created PENDING immediately before the
// fan-out, then flipped to SENT/FAILED, so a request killed mid-send
// still leaves an accurate record and "Retry unsent" is exact.
// email/name are denormalized on purpose: they answer "what address did
// we actually use in January" after the contact row has since changed.
model CompanyBroadcastRecipient {
  id                  String    @id @default(cuid())
  broadcastId         String
  contactId           String?   // nullable: keep the record if the contact row is later deleted
  email               String
  name                String?
  portfolioCompanyIds String[]  @default([]) // every targeted company this address was reached through (dedup provenance)
  status              String    @default("PENDING") // "PENDING" | "SENT" | "FAILED"
  error               String?   // provider message when FAILED
  sentAt              DateTime?

  broadcast CompanyBroadcast         @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  contact   PortfolioCompanyContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@unique([broadcastId, email])
  @@index([broadcastId, status])
  @@map("company_broadcast_recipients")
}
```

Back-relations, declared the way the existing ones are:
- `PortfolioCompany`: `contacts PortfolioCompanyContact[]` and `broadcastTargets CompanyBroadcastTarget[]`
- `PortfolioCompanyContact`: `broadcastRecipients CompanyBroadcastRecipient[]`
- `User`: `createdBroadcasts CompanyBroadcast[] @relation("CreatedBroadcasts")`

`@@unique([broadcastId, email])` is the database-level backstop for D7 — even a resolver bug cannot create two recipient rows for one address on one broadcast.

**Audit action types** (strings only; `/admin/audit` renders them raw): `PORTCO_CONTACT_ADDED`, `PORTCO_CONTACT_UPDATED`, `PORTCO_CONTACT_REMOVED`, `BROADCAST_CREATED`, `BROADCAST_UPDATED`, `BROADCAST_DELETED`, `BROADCAST_PUBLISHED`, `BROADCAST_TEST_SENT`, `BROADCAST_RETRIED`.

**Acceptance checklist:**
- [ ] `prisma db push` applies additively; no existing table altered; zero rows to backfill.
- [ ] The same email can exist as a contact on **two different** portfolio companies (JC-BC-B), but a duplicate on the **same** company is rejected.
- [ ] `@@unique([broadcastId, email])` rejects a duplicate recipient row on one broadcast.
- [ ] Deleting a `PortfolioCompany` cascades away its contacts and target rows, leaving published broadcasts and their recipient records intact.
- [ ] Deleting a contact nulls `CompanyBroadcastRecipient.contactId` and preserves the denormalized `email`.

**UX impact:** none (nothing reads these tables yet). **Cost impact:** none (four Postgres tables). **Effort:** ~0.5–0.75 day.

---

## WS70 — Contact management: API sub-routes, CSV import, admin UI (NEW workstream — no surface exists today) — ~1.75–2.25 days

**Goal.** Give admins somewhere to maintain the contact list that D4 makes the single source of truth, **by hand and by CSV upload**. **This workstream exists because verification found no contact UI anywhere in the app** — `PortfolioCompany` today has admin surfaces for deals, rounds, marks and the `Company` link, and none for people. Without WS70 the broadcast feature has an empty audience by construction.

### WS70.1 — Per-contact CRUD sub-route

`src/app/api/admin/portfolio-companies/[id]/contacts/route.ts` (new) — sits beside the existing `…/[id]/marks` sub-route (F61: use the **hyphenated** namespace). Mirrors `src/app/api/admin/lps/[id]/emails/route.ts` handler-for-handler, including its locally-declared `EMAIL_REGEX` (house convention — do not centralize):
- `POST` — add a contact. `email` trimmed + lowercased, regex-validated; optional `name`, `role` (trim, ≤200 chars each). 404 if the portfolio company doesn't exist. **Duplicate check scoped to this company** (`findUnique({ where: { portfolioCompanyId_email: { … } } })`) → 400 `"This company already has that contact."` — deliberately *not* a global lookup (JC-BC-B). Audit `PORTCO_CONTACT_ADDED` with `{ email }`.
- `PATCH` — edit `name`/`role` (and `email`, re-validated and re-checked against the same per-company constraint). Audit `PORTCO_CONTACT_UPDATED`.
- `DELETE` — remove by contact `id` in the JSON body; 404 if the row isn't on this company (defense-in-depth against a cross-company id, the WS55/F48 shape). Audit `PORTCO_CONTACT_REMOVED`. **No session/sessions-revoked logic** — unlike the LP route, a contact is not a login (JC-BC-C), so removing the last contact has no side effect beyond that company contributing no recipients.

`src/app/api/admin/portfolio/companies/[id]/route.ts` (existing, F61's *other* namespace) — extend the `findUnique` `include` with `contacts: { orderBy: { createdAt: "asc" } }` and add them to the JSON response. Purely additive; every existing field is untouched.

`src/app/api/admin/portfolio-companies/route.ts` (existing) — add `contacts: true` to the existing `_count` select and surface `contactCount` in the mapped list response. Additive; the audience picker (WS74) and the "hide companies with no contacts" toggle both read it.

### WS70.2 — Shared CSV line parser `src/lib/csv.ts` + tests

The existing importer's parser (`parseCSV` in `src/app/admin/companies/page.tsx:80-107`) splits on bare commas, so a quoted cell containing a comma — `"Doe, Jane"`, very likely in a real contacts sheet — silently shifts every column after it. Rather than copy that bug into a second importer:

```ts
// Part 30, WS70.2 — minimal RFC4180-ish field splitter: honors double-quoted
// fields, "" as an escaped quote, and commas inside quotes. Pure, no
// dependency (the `xlsx` package is for the one-off CLI importer only, never
// shipped to the browser). Same posture as share-metrics.ts/report-snapshot.ts.
export function splitCsvLine(line: string): string[];
/** Header normalizer: strip BOM, lowercase, trim, drop surrounding quotes. */
export function normalizeHeader(h: string): string;
```

Tests — `src/lib/__tests__/csv.test.ts`: bare fields; a quoted field containing a comma; a quoted field containing `""`; trailing empty field; a lone trailing `\r`; a leading BOM on the first header. **This Part does not change `src/app/admin/companies/page.tsx`** — adopting the helper there is a later one-line change, deliberately out of scope so this workstream can't regress a shipped importer.

### WS70.3 — CSV import endpoint (portfolio-wide, upsert)

`src/app/api/admin/portfolio-companies/contacts/import/route.ts` (new) — modeled directly on `src/app/api/admin/companies/import/route.ts` (62 lines), whose conventions are reused verbatim where they fit:

- **Parsing stays on the client, the route takes JSON rows** — exactly like the companies importer (`handleCSVFile` reads the file, `parseCSV` turns it into rows, then `POST`s `{ companies: [...] }`). **No multipart upload, no file ever hits the server, no new dependency.**
- **Payload:** `{ contacts: ContactRow[], defaultPortfolioCompanyId?: string }` where `ContactRow = { row: number; company?: string; name?: string; email: string; role?: string }`. `row` is the 1-based CSV line number, carried purely so errors can name it.
- **Guards:** `requireAdmin()`; 400 `"No contacts provided"` when the array is empty or not an array (the companies route's only 400); 400 when `contacts.length > 1000` (an unbounded per-row loop in a request handler is the F59 shape — though DB upserts are local millisecond calls, not third-party sends, so no `maxDuration` is needed here).
- **Company resolution:** load `db.portfolioCompany.findMany({ select: { id: true, name: true } })` once into a `Map` keyed on `name.trim().toLowerCase()`. A row's company comes from its `company` cell, or from `defaultPortfolioCompanyId` when the cell is blank. **Matching is case-insensitive and trimmed** — a deliberate divergence from `src/lib/sheet-sync.ts:202`, which matches portfolio-company names *exactly*; there exactness is right because a near-miss **auto-creates** a company, whereas here a near-miss creates nothing and lenient matching only reduces false "unmatched" noise.
- **Unmatched company → skip the row and report it. Never auto-create a `PortfolioCompany`** (JC-BC-L).
- **Upsert on the natural key** `@@unique([portfolioCompanyId, email])` (JC-BC-K): create when absent (`created++`), otherwise update `name`/`role` **only from non-empty CSV cells** (`updated++`) so a sparse re-upload never blanks good data. A row identical to what is already stored still counts as `updated` — no attempt to diff for a "no change" bucket.
- **Per-row isolation and partial success**, exactly the companies route's shape: a `try/catch` per row pushing a human-readable string into `errors: string[]`, and **always a 200** with the counters. Row-level failures never abort the batch.
- **Response:** `{ created, updated, skipped, errors, unmatchedCompanies }` — a superset of the companies route's `{ created, skipped, errors }`. `unmatchedCompanies` is the **distinct** list of company names that matched nothing, so "Acme Holdings" appearing on 30 rows reads as one line, not thirty. `skipped` counts rows dropped for any reason (unmatched company, blank/invalid email, no company resolvable).
- **Within-file duplicates:** two rows with the same company + normalized email collapse — later row wins (it is an upsert regardless) and counts once.
- **Normalization matches the manual write path:** `email` trimmed + lowercased, `name`/`role` trimmed, `EMAIL_REGEX`-validated with the same locally-declared regex convention. An invalid address is a row-level error, not a batch failure.
- **Audit:** one `PORTCO_CONTACTS_IMPORTED` row with `{ created, updated, skipped, errorCount, unmatchedCount, scope }` where `scope` is `"PORTFOLIO"` or `"COMPANY"`. Mirrors `COMPANIES_IMPORTED`, which likewise carries counters and no `targetType`/`targetId`.

**Scoping rule (JC-BC-M) — one endpoint, two entry points:**
- Called from the **portfolio-wide** page: no `defaultPortfolioCompanyId`. A row with a blank `company` cell is a row-level error (`Row 7: no company named`).
- Called from a **single company's** page: `defaultPortfolioCompanyId` is that company, so a two-column `name,email` CSV works. A row naming a **different** company is a row-level error (`Row 12: names "Northwind" — use the portfolio-wide import on the Deal Ledger page`) rather than being silently written elsewhere. The per-company page's contract stays honest: this file adds contacts to *this* company.

**Tests — `src/lib/__tests__/portfolio-contacts-import.test.ts`** (mocking `@/lib/db`, `@/lib/auth-guard`, `@/lib/audit` and importing the real `POST`, in the `admin-diligence-route.test.ts` style; synthetic data only, JC-BC-J):
- [ ] One CSV spanning **three** companies writes contacts to all three in a single call.
- [ ] Re-uploading the same rows yields `created: 0, updated: N` — no duplicates, no error (JC-BC-K).
- [ ] A row with a blank `role` cell leaves an existing `role` untouched (sparse re-upload never blanks data).
- [ ] An unmatched company name is skipped, reported once in `unmatchedCompanies`, and **no `PortfolioCompany` is created** (assert `portfolioCompany.create`/`upsert` are never called — JC-BC-L).
- [ ] An invalid email is a row-level error naming its row number; every other row still lands; status is 200.
- [ ] Company matching is case/whitespace-insensitive (`"  acme  "` resolves to `Acme`).
- [ ] With `defaultPortfolioCompanyId`, a blank company cell resolves to it; a row naming a different company is a row-level error.
- [ ] Without it, a blank company cell is a row-level error.
- [ ] Empty array → 400; >1000 rows → 400; neither writes anything.
- [ ] The `PORTCO_CONTACTS_IMPORTED` audit row carries all five metadata counters.

### WS70.4 — Admin UI

`src/app/admin/portfolio/[id]/page.tsx` (existing) — a new **"Contacts"** section placed **immediately after the header card and before "Positions by fund"** (people first, then numbers), using the page's own section idiom:
```tsx
<h3 className="mb-3 flex items-center gap-2 font-semibold">
  <Users className="h-4 w-4" />
  Contacts
</h3>
```
Body: the LP address-list block from `src/app/admin/lps/page.tsx:320-370`, adapted — one `rounded-sm border border-border px-2.5 py-1.5` row per contact showing name, mono email and the optional role, with an inline edit affordance and an `X` remove button (`window.confirm` first, matching this page's existing `handleDeleteMark` idiom); beneath it an add row (name / email / role `input-field`s + an "Add" `Button`) and an inline `text-laterite` error line. Empty state is an honest line, not a bare placeholder: **"No contacts yet — broadcasts to this company would reach nobody."** (D4's consequence, stated where it can be fixed.)

Alongside the "Add" row, the **CSV control copied from `src/app/admin/companies/page.tsx:180-200`**: a hidden `<input type="file" accept=".csv" className="hidden" ref={fileInputRef}>` plus a `variant="secondary"` `Button` with the `Upload` icon reading `{importing ? "Importing..." : "Import CSV"}`, and the same two dismissible result banners (acacia success with a `text-laterite` bulleted `errors` list; laterite failure), extended with the two new counters and the unmatched list. Posts with `defaultPortfolioCompanyId` set to this company. A one-line format hint in the companies page's voice: *"CSV columns: `name`, `email`, optional `role`. A `company` column is optional here — rows without one are added to this company."*

`src/app/admin/portfolio/page.tsx` (existing, the cross-fund Deal Ledger) — the **portfolio-wide** entry point: the identical hidden-input + "Import contacts (CSV)" `Button` pair in the existing `PageHeader` `action` slot, posting **without** `defaultPortfolioCompanyId`, with the same result/error banners and the hint *"CSV columns: `company`, `name`, `email`, optional `role`. `company` must match an existing portfolio company — unmatched rows are reported, never created."* This is the right home because it is the only portfolio-wide surface for these companies (**verified: there is no dedicated portfolio-company list page — creation happens on `/admin/funds/[id]`, and `/admin/portfolio`'s rows are what link to each company page**). *Reversal if it feels misplaced there:* move the control into a "Contacts" tab on the same page, one component move, no API change.

Both entry points call the same client parser: `splitCsvLine` from WS70.2 plus a `parseContactsCSV(text)` that mirrors `parseCSV`'s header handling (BOM strip, lowercase, quote strip, alias sets — `company`/`company name`/`portfolio company`; `name`/`contact`/`contact name`/`full name`; `email`/`email address`/`e-mail`; `role`/`title`/`position`), returns `{ row, company, name, email, role }[]`, and shows `"No valid rows found. CSV must have an \"email\" column."` when the header has no email column — the companies page's exact failure idiom.

**Acceptance checklist:**
- [ ] An admin can add, edit and remove contacts from `/admin/portfolio/[id]`; the list reloads without a full-page refresh.
- [ ] A duplicate email on the **same** company is rejected with the 400 message; the **same** email added to a **different** portfolio company succeeds (JC-BC-B, proven end-to-end).
- [ ] `email` is stored trimmed and lowercased; an invalid address is rejected before any write.
- [ ] A contact id belonging to another company cannot be deleted through this company's route (404).
- [ ] Uploading a multi-company CSV from `/admin/portfolio` populates contacts across several companies in one pass; the banner reports created / updated / skipped and lists unmatched company names once each.
- [ ] Uploading the same file twice produces no duplicates and reports the second run as updates (JC-BC-K).
- [ ] A CSV containing `"Doe, Jane"` in a quoted cell parses correctly (WS70.2 — the bug the existing splitter would have hit).
- [ ] Uploading from a single company's page with a two-column `name,email` CSV works; a row naming another company is reported, not silently written elsewhere.
- [ ] No `PortfolioCompany` is ever created by an import (JC-BC-L) — check `/admin/audit` shows `PORTCO_CONTACTS_IMPORTED` and **no** `PORTCO_CREATED` after an import containing an unmatched name.
- [ ] Each manual mutation writes its `PORTCO_CONTACT_*` audit row.
- [ ] The empty state names the consequence ("would reach nobody").
- [ ] Renders at 375px per the Part 6 house patterns (wrapping rows = Pattern D; the header's button pair wraps = Pattern C).

**UX impact:** additive, admin-only — one new section on an existing admin page, one new header button on another, one new count on an existing list response. No founder, LP, or investor-link surface changes; the existing companies CSV importer is untouched. **Cost impact:** none (no new dependency — parsing is hand-rolled client-side, as it already is for companies; `xlsx` stays confined to the CLI script). **Effort:** ~1.75–2.25 days (CRUD + routes ~0.6, `csv.ts` + tests ~0.3, import route + tests ~0.5, UI on both pages ~0.5).

---


## WS71 — Pure recipient resolver `src/lib/broadcast-recipients.ts` + tests — ~0.4 day

**Goal.** One tested, DB-free function that turns contact rows into the deduped recipient list. Same posture as `src/lib/share-metrics.ts` / `src/lib/report-snapshot.ts` (pure, no Prisma import, unit-tested), so D7 is provable without standing up a route.

**Interface sketch:**

```ts
// Part 30, WS71 — the dedup the LP path never needed. F51 found LP
// dedup structurally free (single-fund publish + @@unique([lpId,fundId])
// + globally-unique LpEmail.email). None of those hold here: a broadcast
// is multi-company by design, and contact emails are unique only PER
// COMPANY (JC-BC-B). So dedup is real, and it is dedup by EMAIL ALONE —
// there is no User, no role, and no UserStatus anywhere in this loop (D4).
export interface BroadcastContactRow {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  contact: { id: string; email: string; name: string | null };
}

export interface BroadcastRecipient {
  contactId: string;              // the FIRST contact row that claimed this address
  email: string;                  // normalized: trimmed + lowercased
  name: string | null;            // first non-empty name encountered
  portfolioCompanyIds: string[];  // sorted, deduped
  portfolioCompanyNames: string[]; // sorted, deduped — drives the "reached via" preview column
}

export function resolveBroadcastRecipients(rows: BroadcastContactRow[]): BroadcastRecipient[];
```

**Rules:**
1. Normalize `email` with `.trim().toLowerCase()`; drop any row whose normalized email is empty. (No regex re-validation here — WS70 validates on write; the resolver's job is grouping, not gatekeeping.)
2. **Dedup by normalized email.** Merge `portfolioCompanyIds` / `portfolioCompanyNames` across every row that carried it. Keep the first `contactId` seen (deterministic given rule 4) and the first non-empty `name`.
3. No role, status, or account filtering of any kind — there is no `User` in this path (D4).
4. Deterministic output: sort recipients by email; sort each recipient's company names alphabetically; make the merge order independent of input order.
5. Pure — no DB, no `Date.now()`, no environment reads.

**Tests — `src/lib/__tests__/broadcast-recipients.test.ts` (synthetic only, JC-BC-J):**
- [ ] The same address listed as a contact on **two** targeted companies yields exactly **one** recipient carrying both company names (D7 — the case JC-BC-B makes reachable).
- [ ] Case/whitespace variants (`" Founder@Example.com "` vs `founder@example.com`) collapse to one recipient with the normalized address.
- [ ] Two different addresses at one company yield two recipients.
- [ ] A company with no contacts contributes nothing and does not throw; empty input → `[]`.
- [ ] Name resolution: a row with a null name followed by one with a name yields the non-null name.
- [ ] Output ordering is byte-identical for two differently-ordered inputs (both recipient order and per-recipient company-name order).

**UX impact:** none (pure module). **Cost impact:** none. **Effort:** ~0.4 day.

---

## WS72 — Email template + fan-out helper in `src/lib/email.ts` + test — ~0.5–0.75 day

**Goal.** Template #13, following every convention in the file, plus the chunked sender WS73 calls.

**File-by-file steps:**

`src/lib/email.ts` — append after `sendLpReportPublishedEmail`, before `sendTestEmail`:

```ts
// Part 30, WS72 — admin broadcast to portfolio-company contacts.
// Person-scoped, never company-scoped (JC-BC-G): one address can be a
// contact at several targeted companies and gets ONE email (D7), so no
// company name may appear in the subject or greeting. `bodyHtml` is
// admin-authored TipTap HTML and is intentionally NOT escaped — the same
// trust boundary sendUpdatePublishedEmail already accepts; every
// plain-text field around it IS escaped (the F47 lesson).
export interface BroadcastMessage {
  email: string;
  recipientName?: string | null;
  subject: string;
  bodyHtml: string;
}

function broadcastHtml(msg: BroadcastMessage): string {
  const firstName = msg.recipientName?.trim() ? msg.recipientName.trim().split(" ")[0] : null;
  return emailWrapper(`
    ${eyebrow("From " + ORG_NAME)}
    ${heading(firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,")}
    <div style="font-size: 15px; line-height: 1.7; color: ${C.tide};">
      ${msg.bodyHtml}
    </div>
    <p style="margin: 32px 0 0; font-size: 13px; color: ${C.muted};">
      You're receiving this because ${ORG_NAME} works with your company. Just hit reply if you'd like to talk.
    </p>
  `);
}

/** One message, one recipient — the "send me a test copy" path (JC-BC-F). */
export async function sendCompanyBroadcastEmail(msg: BroadcastMessage) {
  const result = await resend.emails.send({
    from: FROM,
    replyTo: TEAM_EMAIL,
    to: msg.email,
    subject: msg.subject,
    html: broadcastHtml(msg),
  });
  assertSent(result, "company-broadcast");
}

/**
 * Chunked fan-out (JC-BC-E / F59). Batches of 100 via resend.batch.send
 * with permissive validation, so one bad address fails alone instead of
 * rejecting the whole batch — the F12 lesson, preserved at batch scale.
 * NEVER throws: returns one result per input message, in input order.
 */
export async function sendCompanyBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ email: string; ok: boolean; error?: string }[]> {
  const out: { email: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await resend.batch.send(
        chunk.map((m) => ({
          from: FROM,
          replyTo: TEAM_EMAIL,
          to: m.email,
          subject: m.subject,
          html: broadcastHtml(m),
        })),
        { batchValidation: "permissive" }
      );
      if (res.error) {
        // whole-chunk failure (auth, network, quota) — every message in it failed
        for (const m of chunk) out.push({ email: m.email, ok: false, error: String(res.error) });
        continue;
      }
      // Permissive mode reports per-message failures by their index in the
      // submitted chunk; every other index went out.
      const failed = new Map<number, string>(
        (res.data?.errors ?? []).map((e) => [e.index, e.message])
      );
      chunk.forEach((m, idx) =>
        failed.has(idx)
          ? out.push({ email: m.email, ok: false, error: failed.get(idx) })
          : out.push({ email: m.email, ok: true })
      );
    } catch (err) {
      for (const m of chunk) out.push({ email: m.email, ok: false, error: String(err) });
    }
  }
  return out;
}
```

**Before writing the mapping, re-read `node_modules/resend/dist/index.d.mts:354-372`** to confirm the installed SDK still exposes `errors: { index, message }[]` in permissive mode. If a future bump drops it, take JC-BC-E's stated reversal (the serial `resend.emails.send` loop) rather than inventing an index mapping.

**Tests — `src/lib/__tests__/company-broadcast-email.test.ts`** (mirrors `lp-report-published-email.test.ts`: mock only the `resend` SDK and exercise the real function — the mock class now needs a `batch` member alongside `emails`):
- [ ] The rendered HTML contains the body markup **verbatim** (a `<strong>`/`<ul>` survives; the body is not escaped).
- [ ] Plain-text fields are escaped: a contact named `<Bad> & "Name"` renders `Hi &lt;Bad&gt;`, not raw markup (the F47 contract).
- [ ] No company name appears anywhere in the output for a multi-company recipient (JC-BC-G).
- [ ] `from` is the module `FROM` constant; `replyTo` is `TEAM_EMAIL`.
- [ ] `sendCompanyBroadcastEmails` with 150 messages issues exactly **two** `batch.send` calls, of 100 and 50.
- [ ] A permissive `errors: [{ index: 1, message: "invalid" }]` response marks exactly that message `ok: false` and the rest `ok: true`, in input order.
- [ ] A thrown or `error`-bearing chunk marks every message in that chunk failed and **still returns results for the other chunks** (no throw escapes).
- [ ] A missing contact name falls back to "Hello,".

**UX impact:** none directly (new template, no caller until WS73). **Cost impact:** none — Resend is already in the stack, and batching *reduces* request count versus a serial loop. **Effort:** ~0.5–0.75 day.

---

## WS73 — Broadcast API: CRUD, recipient preview, test send, publish fan-out, retry, duplicate — ~1.25–1.5 day

**Goal.** The server half, mirroring `src/app/api/admin/reports/**` route-for-route. Every handler opens with `export const dynamic = "force-dynamic"`, `requireAdmin()`, and the file-level try/catch → `console.error` + 500.

**`src/app/api/admin/broadcasts/route.ts`** (new)
- `GET` — list newest-first with `_count: { select: { targets: true, recipients: true } }`; map to `{ id, subject, status, publishedAt, createdAt, targetCount, recipientCount }`. A `DRAFT` has no recipient rows by construction — report its `targetCount` ("N companies") and let the preview endpoint be the honest source for reach.
- `POST` — create. Validate `subject` non-empty, ≤200 chars (the `FundReport.title` convention); accept optional `portfolioCompanyIds: string[]`; `body: ""`, `status: "DRAFT"`, `createdById: user!.id`; create target rows in the same `db.$transaction`. Audit `BROADCAST_CREATED` with `{ subject, companyCount }`.

**`src/app/api/admin/broadcasts/[id]/route.ts`** (new)
- `GET` — the broadcast plus `targets: { include: { portfolioCompany: { select: { id: true, name: true } } } }` and, when `PUBLISHED`, its recipient rows (email, name, status, error, sentAt).
- `PATCH` — 400 `"Published broadcasts can't be edited. Duplicate it as a draft instead."` when `status === "PUBLISHED"` (JC-BC-D). Accept `subject`, `body`, and `portfolioCompanyIds` (full replacement: `deleteMany` then `createMany` in one transaction; verify every id exists — reject unknown ids with 400 rather than silently dropping them. **No eligibility filter is applied: per F62 there is no lifecycle field on `PortfolioCompany` to filter on.**). Audit `BROADCAST_UPDATED`.
- `DELETE` — 409 on a published broadcast (mirrors the report route); otherwise delete (targets cascade). Audit `BROADCAST_DELETED`.

**`src/app/api/admin/broadcasts/[id]/recipients/route.ts`** (new)
- `GET` — the live preview. For a `DRAFT`: load target ids, query contacts once, return `resolveBroadcastRecipients(rows)` plus `{ companyCount, recipientCount, companiesWithNoContacts }` — that last count is what makes D4's consequence visible before sending. For a `PUBLISHED` broadcast, return the **stored** `CompanyBroadcastRecipient` rows instead — the frozen truth, never a recomputation.

```ts
const contacts = await db.portfolioCompanyContact.findMany({
  where: { portfolioCompanyId: { in: portfolioCompanyIds } },
  include: { portfolioCompany: { select: { id: true, name: true } } },
});
const recipients = resolveBroadcastRecipients(
  contacts.map((c) => ({
    portfolioCompanyId: c.portfolioCompany.id,
    portfolioCompanyName: c.portfolioCompany.name,
    contact: { id: c.id, email: c.email, name: c.name },
  }))
);
```

**`src/app/api/admin/broadcasts/[id]/test/route.ts`** (new, JC-BC-F)
- `POST` — sends the current draft to `user!.email` only, via `sendCompanyBroadcastEmail`. Returns `{ ok: true, sentTo }`; audit `BROADCAST_TEST_SENT`. Never touches status or recipient rows.

**`src/app/api/admin/broadcasts/[id]/publish/route.ts`** (new — the heart of this WS)

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 60; // F59 — the fan-out is the one long request in this app
```

Order of operations, mirroring the report publish route (freeze → publish → best-effort send → audit → respond):
1. `requireAdmin()`; load the broadcast with targets; 404 if missing; 400 unless `status === "DRAFT"` (`"Only a draft broadcast can be published."`).
2. Validate non-empty `subject`, non-empty `body`, and at least one target — 400 with a specific message each.
3. Resolve recipients through WS71. **If zero → 400 `"None of the selected companies has a contact — nothing would be sent. Add contacts on the company's page first."` and do NOT publish.** (Publishing a broadcast that reached nobody is worse than an error, and under D4 this is the realistic failure mode.)
4. `db.$transaction`: `createMany` the `CompanyBroadcastRecipient` rows as `PENDING` (carrying `contactId`, `email`, `name`, `portfolioCompanyIds`), then update the broadcast to `{ status: "PUBLISHED", publishedAt: new Date() }`. **Publish before send**, exactly like the report route — a delivery failure must never leave the record unpublished.
5. Fan out with `sendCompanyBroadcastEmails(...)`, then write results back as `SENT` + `sentAt` or `FAILED` + `error`, grouped into two `updateMany` calls by outcome so the write-back is O(1) round-trips, not O(N).
6. `logAdminAction(user!, "BROADCAST_PUBLISHED", { targetType: "CompanyBroadcast", targetId: id, metadata: { companyCount, recipientCount, sent, failed } })`.
7. Respond `{ ...published, sendResult: { recipientCount, sent, failed } }` — the shape the report route's `notifyResult` established.

**`src/app/api/admin/broadcasts/[id]/retry/route.ts`** (new, D8)
- `POST` — 400 unless `PUBLISHED`; re-sends only recipient rows whose `status` is `PENDING` or `FAILED`, with the same helper and the same write-back; audit `BROADCAST_RETRIED` with `{ attempted, sent, failed }`. Idempotent: an already-`SENT` row is never re-sent, so a double-click cannot double-mail anyone.

**`src/app/api/admin/broadcasts/[id]/duplicate/route.ts`** (new, D8)
- `POST` — creates a new `DRAFT` copying `subject` (prefixed `"Copy of "`), `body`, and target rows; returns the new id for the client to route to. Audit `BROADCAST_CREATED` with `{ duplicatedFrom: id }`.

**Tests — `src/lib/__tests__/broadcast-publish.test.ts`** (mirrors `report-publish-notify.test.ts`: mock `@/lib/auth-guard`, `@/lib/audit`, `@/lib/email`, and `@/lib/db` including a `$transaction` that invokes the callback with a tx stub, then import the real `POST`):
- [ ] An address that is a contact at **two** targeted companies produces exactly one recipient row and exactly one message (D7, end-to-end through the real route).
- [ ] A per-recipient failure marks only that row `FAILED` and still returns 200 with the broadcast `PUBLISHED` (the F12 lesson at broadcast scale).
- [ ] Zero contacts across all targets → 400, no status change, no send call, and the error names the fix ("Add contacts on the company's page first").
- [ ] Publishing an already-`PUBLISHED` broadcast → 400 and no send call.
- [ ] Empty body or zero targets → 400 with the specific message, no send call.
- [ ] `BROADCAST_PUBLISHED` audit metadata carries `companyCount`, `recipientCount`, `sent`, `failed`.
- [ ] Retry re-sends only `PENDING`/`FAILED` rows and never an already-`SENT` one.
- [ ] **No test mocks or asserts on `userCompanyMembership` anywhere** — a standing guard that D4's single path stays single.

**UX impact:** none yet (no UI until WS74); no existing endpoint's behavior changes. **Cost impact:** none beyond Resend sends an admin explicitly triggers. **Effort:** ~1.25–1.5 day.

---

## WS74 — Admin UI: `/admin/broadcasts` list + composer with audience picker + sidebar entry — ~1.5–2 days

**Goal.** The admin half, structurally cloned from `/admin/reports` (list) and `/admin/reports/[id]` (composer), with the fund selector replaced by a portfolio-company multi-select and the notify checkbox replaced by an explicit recipient summary.

**File-by-file steps:**

`src/components/layout/sidebar.tsx` — in `adminNavGroups[1]` ("Funds & LPs"), after "Fund Reports" (JC-BC-I):
```ts
{ label: "Broadcasts", href: "/admin/broadcasts", icon: Megaphone },
```
(plus the `Megaphone` import alongside the existing lucide imports).

`src/app/admin/broadcasts/page.tsx` (new) — clone of `src/app/admin/reports/page.tsx`: `AppShell` + `PageHeader` (title "Broadcasts", description "Email your portfolio companies — write a draft, choose who gets it, then send.") + a "New Broadcast" `Button` opening the same local `Modal` component that page defines (subject + an optional first pass at the picker), the same `EmptyState`, and the same row list — `Badge variant={status === "PUBLISHED" ? "success" : "warning"}`, a meta line with `N companies`, `Sent to N contacts` (published only) and `formatDate(publishedAt)`, plus the `Trash2` delete affordance on drafts only.

`src/app/admin/broadcasts/[id]/page.tsx` (new) — clone of the report composer:
- Back button → `/admin/broadcasts`; `<ComposerTopBar draftLabel={isDraft ? "Draft" : `Sent ${formatDate(publishedAt)}`} …>` with `secondaryActions` = Save + "Send test to me" (JC-BC-F), `publishLabel="Send"`, `onPublishClick={() => setConfirmSend(true)}`, `publishDisabled` while subject/body/targets are incomplete, and `overflowItems` carrying "Delete draft" and "Duplicate as draft".
- Borderless subject input in the report title's `font-display text-3xl` style.
- `<RichEditor variant="chromeless" value={body} onChange={setBody} placeholder="Write to your portfolio…" />` — **no `companyId`, so no image button**, identical to the report composer (documented, not a defect).
- **Audience picker `Card`** (JC-BC-H — pattern from `src/app/admin/links/page.tsx:338-380`, copied not imported): a `max-h-72 overflow-y-auto rounded-md border divide-y` container of `<label>` rows fed by `GET /api/admin/portfolio-companies`, each with `<input type="checkbox" className="h-4 w-4 rounded border-border accent-primary">`, the company name, and its `contactCount` rendered as muted meta — with **`0 contacts` shown in `text-ochre`** so a company that would reach nobody is visible at selection time. A search `Input` filters client-side (or passes `?q=`), a "Hide companies with no contacts" checkbox filters the list (F62 — the only honest filters available), and "Select all" / "Clear" `Button`s mirror the bulk-link builder. A running summary in that builder's voice: **"N companies selected · M contacts will receive this"**, where M comes from `GET …/recipients` (debounced) — never a client-side guess.
- A collapsible "Who will receive this" list under the summary showing each recipient's name/email and the companies they were reached through — the surface that makes D7 dedup visible before anything sends — plus, when `companiesWithNoContacts > 0`, an ochre line: **"N selected companies have no contacts and will receive nothing."**
- **Send-confirm panel** — the ochre `border-ochre/30 bg-ochre/10` inline panel from the report composer, with copy honest about irreversibility: *"This sends the email immediately to N contacts across M companies. It can't be unsent."* Cancel + "Send now".
- On success, the existing success/error banner: `Sent to N contacts${failed ? ` (${failed} failed)` : ""}` — the report composer's `notifyText` pattern.
- Published state renders read-only (`dangerouslySetInnerHTML` prose block, same as the report page) plus a **delivery table** (`src/components/ui/table.tsx` primitives) of recipients with status badges, and a "Retry unsent" `Button` shown only when any row is `PENDING`/`FAILED`.

**Acceptance checklist:**
- [ ] "Broadcasts" appears in the admin sidebar under "Funds & LPs" after "Fund Reports"; the active-state highlight works through the existing `isActive` logic.
- [ ] A draft can be created, saved, reopened, duplicated and deleted; a published broadcast cannot be edited or deleted (buttons absent, and the API refuses a direct call).
- [ ] The picker lists portfolio companies with contact counts; search, hide-empty, select-all and clear all behave; the summary line comes from the server preview, not a local guess.
- [ ] An address that is a contact at two selected companies appears **once** in "Who will receive this", showing both company names.
- [ ] Selecting a company with zero contacts shows the ochre warning and, if it is the only selection, "Send" surfaces the API's 400 message rather than appearing to succeed.
- [ ] "Send test to me" delivers to the acting admin only and changes no status.
- [ ] Sending shows the confirm panel first; on success the banner reports sent/failed counts and the page flips to the read-only + delivery-table state.
- [ ] "Retry unsent" appears only when unsent/failed rows exist and never re-sends a `SENT` row.
- [ ] Renders at 375px per the Part 6 house patterns: delivery table = Pattern A (scrollable), picker rows and composer top bar = Pattern C/D (wrapping/stacking), any grid carries a base `grid-cols-1` (the WS14.7 gotcha).
- [ ] Nothing on any founder, investor-link, or LP surface changed (grep-verify no file under `src/app/(dashboard|updates|company|lp|share)/**` was touched).

**UX impact:** additive for admins only — one new sidebar item, its two pages, and (from WS70) one new section on an existing admin page. **Founders and LPs see no in-app change** (D8); the only external effect is an email an admin explicitly chose to send. **Cost impact:** none — existing Postgres and Resend account; volume is bounded by portfolio size and admin intent, and batching makes a whole-portfolio send 1–2 API requests. **Effort:** ~1.5–2 days.

---

## Sequencing & handoff (Part 30)

- **WS69 (schema) → WS70 (contacts CRUD + UI) ∥ WS71 (resolver) ∥ WS72 (email) → WS73 (broadcast API) → WS74 (broadcast UI).** WS70, WS71 and WS72 are mutually independent once WS69 lands; WS73 needs all three; WS74 needs WS73.
- **Nothing is blocked on a decision** — D1–D9 are confirmed and F62 removes the only remaining "which companies are eligible" question by establishing that no such field exists.
- **WS70 is worth shipping first even in isolation:** an accurate contact list is useful on its own (it is the portfolio's people directory), and under D4 the broadcast feature is inert without it. Its CSV import (WS70.3) is what makes populating ~50 companies' contacts a single upload instead of an afternoon of typing.
- **Total effort:** ~6–7 days (WS69 0.6 + WS70 2.0 + WS71 0.4 + WS72 0.6 + WS73 1.4 + WS74 1.8).

## Part 30 — confirmed decisions summary

- **D2/D3/D4 (corrected 2026-09-01, supersedes the first draft):** broadcasts target `PortfolioCompany` and mail a new admin-maintained `PortfolioCompanyContact` list — uniformly, even where an active `Company` with real founder logins is linked. `UserCompanyMembership` is never read by this feature. Joseph chose this single-path rule over auto-pulling founder accounts when available.
- **D7:** dedup by normalized email only; no `User`, role, or `UserStatus` filtering exists anywhere in the path.
- **D8:** full body in the email; no in-app founder archive; no unpublish; retry-unsent and duplicate-as-draft both built; no opt-out in v1. **Note:** the first draft's `User.receivesBroadcasts` escape hatch is void — recipients are not `User` rows. If an opt-out is ever wanted it belongs on `PortfolioCompanyContact` (e.g. a nullable `unsubscribedAt`), honored in WS71's resolver. Not built now.
- **The retired question about VIEWER memberships is moot** and has been removed: membership roles play no part in this design.
- **Contact list population (added 2026-09-01 at Joseph's request):** manual entry **plus CSV upload**. One spreadsheet covering many portfolio companies is the canonical form (`company, name, email, role`), uploaded from `/admin/portfolio`; a scoped two-column upload also works from a single company's page. Rows **upsert** on `(portfolioCompanyId, email)` so re-uploading a corrected file updates rather than duplicates or errors; rows naming an unknown company are **skipped and reported, never auto-created**; every row is isolated, so the response is always a 200 carrying `{ created, updated, skipped, errors, unmatchedCompanies }`. Parsing stays client-side with no new dependency, exactly like the existing companies importer — plus a new tested `splitCsvLine` helper so a quoted `"Doe, Jane"` cell doesn't shift the row (a bug the existing splitter has; it is left untouched here).
- **Confirmed judgment calls:** four additive models (JC-BC-A), per-company (not global) contact-email uniqueness (JC-BC-B), no `isPrimary` (JC-BC-C), no unpublish (JC-BC-D), batched fan-out + `maxDuration` (JC-BC-E), self-test send (JC-BC-F), person-scoped email (JC-BC-G), picker copied not extracted (JC-BC-H), sidebar under "Funds & LPs" (JC-BC-I), synthetic data only (JC-BC-J), CSV upsert (JC-BC-K), unmatched companies skipped-and-reported never created (JC-BC-L), one import endpoint with portfolio-wide and per-company entry points (JC-BC-M).
- **Constraints honored:** additive-only schema (four new tables, four back-relation fields, one additive `include` and one additive `_count` on existing routes); no new cost line (`resend.batch.send` ships in the installed SDK; CSV parsing is hand-rolled client-side, no library added); no UX regression (admin-only surfaces; the sole edits to existing files are one sidebar line, one section on `/admin/portfolio/[id]`, and two additive API response fields); synthetic data throughout committed files.

---

# Part 31 — Linking Founder Signups to Existing Portfolio Companies (WS75–WS79, F63–F67, 2026-09-01)

> **Status: PLANNED, not built. All six product decisions CONFIRMED (Joseph, 2026-09-01) — nothing open. Ready for Alvin.** The six were posed as Q72–Q77 and are recorded below as **D1–D6**; every one landed on the recommended option, none reversed. Part 30 introduced `PortfolioCompany` + `PortfolioCompanyContact` as the portfolio's people directory. It deliberately did not touch signup. The consequence, verified below: a founder who is *already* a contact on an existing `PortfolioCompany` can sign up at `/signup`, get a brand-new unlinked `Company`, and be approved by an admin who is never told the two records describe the same business. Part 31 closes that loop — **without** a schema change and **without** any founder-visible surface.

## The gap, verified line-by-line (not taken on trust)

- **`src/app/api/auth/signup/route.ts:16`** takes `{ name, email, companyName }` — `companyName` is freeform text the founder types (`src/app/signup/page.tsx:114-118`, a plain `Input` labelled "Company Name"; no autocomplete, no lookup).
- **`:76-100`** — one transaction creates `User` (`FOUNDER`, `PENDING`), `Company` (`name: companyName`, `createdById`), and a `UserCompanyMembership` (`OWNER`). **There is no read of `PortfolioCompany` or `PortfolioCompanyContact` anywhere in the file**, and no `Company` de-duplication of any kind (`Company.name` is not `@unique` — `prisma/schema.prisma:86`).
- **`src/app/api/admin/approvals/[id]/approve/route.ts`** — mints a setup token, mails it, audits `USER_APPROVED`. **No portfolio lookup, no linking, no mention of `PortfolioCompany`.**
- **`src/app/admin/approvals/page.tsx`** — the pending card renders name, email, "Signed up <date>", Reject/Approve. No match affordance. (And, per **F64** below, not even the company name.)
- **The link that exists:** `PortfolioCompany.companyId String? @unique` (`prisma/schema.prisma:563`) with `company Company? @relation(… onDelete: SetNull)` (`:567`). Writable through exactly two places: `POST /api/admin/portfolio-companies` (`route.ts:66`, `companyId: body.companyId || null`) and `PATCH /api/admin/portfolio-companies/[id]` (`[id]/route.ts:27`). **Confirmed API-only — see F65.**

**Net effect today:** silent duplication. One real business, two unrelated rows (`Company` for the operational product, `PortfolioCompany` for the cap table), and nothing anywhere that says so.

## Method — what was verified against the working tree

- **Every `.tsx` fetch of `portfolio-companies`** (`grep -rn "portfolio-companies" src --include="*.tsx"`): `/admin/broadcasts` and `/admin/broadcasts/[id]` (list, for the audience picker), `/admin/reports/[id]` (mention picker), `/admin/funds/[id]` (list + `POST` create-from-deal-form), `/admin/portfolio/[id]` (marks, contacts), `/admin/portfolio` (contacts import). **Not one of them sends `companyId`.** The create call at `src/app/admin/funds/[id]/page.tsx:287-291` posts `{ name, country }` only.
- **Every consumer of the link:** `GET /api/admin/portfolio-companies` returns `companyId` and `company` (`route.ts:22, 33-34`) — the broadcast pickers ignore both and read only `contactCount` (`src/app/admin/broadcasts/[id]/page.tsx:42, 155, 451`). `GET /api/admin/portfolio/companies/[id]` includes `company: { select: { id, name } }` (`route.ts:21`), consumed by exactly one thing: the "View operational company profile" link on `src/app/admin/portfolio/[id]/page.tsx:399-403`. **That is the entire behavioral footprint of `PortfolioCompany.companyId` — see F67.**
- **The reverse direction is completely unaware:** `grep -rn "portfolioCompany\|PortfolioCompany" src/app/admin/companies src/app/api/companies src/app/api/admin/companies` → **zero hits**. Nothing on the operational-company side knows the cap-table entity exists.
- **The admin company list filter** — `GET /api/admin/companies` applies `approvedCompanyFilter` (`src/lib/company-filters.ts:10-15`): `NOT { createdBy: { status: "PENDING", approvalToken: null } }` AND `NOT { stage: "DILIGENCE" }`. **A brand-new signup's `Company` matches the first exclusion exactly**, so it is invisible to that endpoint until approval. Any link picker built naively on it cannot see the very company that needs linking (handled in WS76 / JC-LK-F).
- **Available matching signals, all confirmed present:** `PortfolioCompanyContact.email` (stored trimmed + lowercased, `prisma/schema.prisma:593` and enforced at `src/app/api/admin/portfolio-companies/[id]/contacts/route.ts:24`), `PortfolioCompany.name` (`@unique`, `:561`), `Company.name` (not unique, `:86`), `Company.aliases String[] @default([])` (`:94` — admin-editable at `src/app/admin/companies/[id]/page.tsx:761-780` via `PATCH /api/companies/[id]`, and **read by nothing today**), and the signup email itself (lowercased at `signup/route.ts:79`).
- **House patterns to reuse:** pure-lib + unit tests (`src/lib/broadcast-recipients.ts`, `src/lib/share-metrics.ts`); the never-guess doctrine (`src/lib/sheet-link.ts`, quoted in Part 30's JC-BC-L); the tab shell (`src/app/admin/funds/page.tsx:140-161`, `border-b-2 … border-primary text-primary`); the ochre inline-confirm panel (`src/app/admin/reports/[id]/page.tsx:308-360`); `logAdminAction(actor, action, { targetType, targetId, metadata })` with free-string actions rendered raw at `/admin/audit`.
- **No schema change is required by any part of this plan.** Every column it needs already exists.

---

## F63 — ROADMAP (and this plan's own Part 30 header) still call Part 30 "PLANNED, NOT yet built" (LOW, docs-only)

Part 30 shipped: commits `e683e4a` (WS69) through `2c04ab7` (WS74), with `src/app/admin/broadcasts/**`, `src/app/api/admin/broadcasts/**`, `src/lib/broadcast-recipients.ts`, `src/lib/csv.ts` and four schema models all present in the working tree. `ROADMAP.md:3` and `:7` still describe it as planned. **Annotated in `ROADMAP.md` in this same pass** (Part 30's bullet flipped to SHIPPED; the header line updated). The Part 30 header in this file is left as the historical planning record, as with every earlier Part.

## F64 — `/admin/approvals` has never displayed the company name a founder typed (MEDIUM, real bug, directly in this Part's path)

`src/app/admin/approvals/page.tsx:36` declares `companyName: string | null` on the `Approval` interface and `:299-301` renders `{approval.companyName && <> &middot; {approval.companyName}</>}`. But `GET /api/admin/approvals` (`src/app/api/admin/approvals/route.ts:14-32`) selects `id, email, name, roles, status, createdAt, memberships { include: { company: { select: { id, name } } } }` — **there is no `companyName` key in the response**. The field is always `undefined`, so the branch never renders. An admin looking at a pending signup today sees the founder's name, email and date, and **not** the company they typed.

The same page derives it correctly ten lines further down for the awaiting-setup section (`:412`, `u.memberships?.[0]?.company?.name ?? null`), so the two halves of one page disagree. The fix is one line and is folded into WS77 — Part 31 cannot show *matches* on a card that does not even show the *name*.

## F65 — `PortfolioCompany.companyId` has no writer UI anywhere in the app (MEDIUM, the gap's proximate cause)

Confirmed by exhaustive grep (above): the field is settable only by hand-crafted API calls. The only *reader* is a nav link. In practice this means the link is almost certainly `null` on every production row, including for portfolio companies whose founders are active Molly users. WS78.1 adds the missing widget.

## F66 — the PATCH that sets the link returns a 500 for two ordinary user errors (LOW today, MEDIUM once a UI drives it)

`src/app/api/admin/portfolio-companies/[id]/route.ts:27` does `data.companyId = body.companyId || null` and hands it straight to `db.portfolioCompany.update`. Two reachable states both fall into the generic `catch` and surface as `{ error: "Internal server error" }` with status 500:

1. **`companyId` names a `Company` that does not exist** → Prisma foreign-key violation.
2. **`companyId` is already linked to a different `PortfolioCompany`** → `P2002` on the `@unique` constraint. This is not exotic: two co-founders of the same startup each signing up creates two `Company` rows, and `companyId` being `@unique` means only one can ever be linked (see D6).

Nobody has hit these because nothing writes the field (F65). WS76 turns them into a 404 and a 409 carrying the conflicting portfolio company's name.

## F67 — linking is behaviorally inert; it changes nothing about broadcasts, emails, or access (informational — stated so a future reader does not assume otherwise)

Setting `PortfolioCompany.companyId` today affects exactly one thing: whether `/admin/portfolio/[id]` shows a "View operational company profile" link. In particular:

- **Broadcasts are unaffected, by design.** Part 30 **D4** is explicit: recipients come from `PortfolioCompanyContact` and nothing else, *even where a linked `Company` has real founder logins*. `src/lib/broadcast-recipients.ts` takes contact rows only; `src/app/api/admin/broadcasts/[id]/publish/route.ts` and `…/recipients/route.ts` never touch `User` or `UserCompanyMembership`. **Linking a company does not add anyone to any broadcast.** That is exactly why **D3**'s "also add the founder as a contact" checkbox exists — the link is structural, the checkbox is the only thing in this Part that changes who receives mail, and it is an explicit admin choice on every link.
- No email, no share link, no metric, no reminder, no LP report reads the link.
- Access control is untouched: founder access flows through `UserCompanyMembership`, LP access through `LpSession`. Neither knows about `PortfolioCompany`.

So Part 31's value is **admin legibility and future optionality**, not an immediate behavior change. Worth saying out loud before spending 3–4 days on it.

---

## Confirmed decisions (D1–D6 — locked by Joseph 2026-09-01, do NOT re-litigate)

> These were posed as open questions Q72–Q77 in the first draft of this Part and are **all now decided — every one as recommended, none reversed.** The Q-numbers are kept in the headings because `ROADMAP.md` and the project memory reference them. **Disambiguation:** Part 30 also numbers its decisions D1–D9; wherever this Part cites one of those it says **"Part 30 D4"** in full, and a bare `D1`–`D6` always means Part 31's. The options tables and "alternative worth naming" notes are preserved deliberately: they are the record of what was considered and declined, so a future reader does not reopen a settled question by accident.

### D1 (was Q72) — Matching happens at approval time **and** in a standing "Links" view; **never** on the public signup form

| | Option | What it looks like | Outcome |
|---|---|---|---|
| **A** | **Signup-time**, founder-facing | As the founder types, `/signup` suggests existing portfolio companies to pick from | **REJECTED** |
| **B** | **Approval-time**, admin-facing | The `/admin/approvals` pending card shows suggested `PortfolioCompany` matches with a "Link & approve" button | **CHOSEN** |
| **C** | **Standing reconciliation view** | An admin surface listing unlinked portfolio companies with suggested operational companies, worked through whenever | **CHOSEN** |
| **D** | **B + C** | Both | **CHOSEN (D1)** |

**Decision: B + C. A is rejected outright and must not be built** — no matching, suggestion, autocomplete, or existence check of any kind is added to `/signup` or to any unauthenticated route. Every suggestion endpoint in this Part is `requireAdmin()`-guarded.

- **A is a confidentiality problem, not just a UX one.** `/signup` is unauthenticated (`src/lib/route-access.ts` public paths; rate-limited 10/hr/IP at `signup/route.ts:9`, which limits volume, not existence). Any suggest-as-you-type endpoint there is an oracle over the real portfolio-company roster — the exact data class Parts 27/28 spent two audits protecting, and the same reasoning that made the Part 9 self-serve resend take **no** email input (no enumeration oracle). It is also untrustworthy input: a founder can click any suggestion.
- **B is where the human already is.** An admin must act on every signup anyway; showing a match there costs them nothing and catches the case at the exact moment it arises.
- **C is the only thing that fixes the backlog** (every portfolio company already unlinked, F65) and the no-signup cases (an admin-created company; a company whose founders never signed up). Once WS75's matcher is a pure function, C is mostly UI.

### D2 (was Q73) — Four signals in three tiers, and **nothing ever auto-links**

Confirmed tiers (all four signals verified available above):

- **STRONG · `CONTACT_EMAIL`** — the signup email exactly equals some `PortfolioCompanyContact.email` on that company (both already normalized lowercase). The strongest evidence available, and stronger than any name string.
- **STRONG · `NAME_EXACT` / `ALIAS_EXACT`** — normalized-equal names: lowercase, trim, collapse whitespace, strip punctuation, strip a conservative trailing legal-suffix list (`inc, inc., llc, l.l.c., ltd, ltd., limited, plc, corp, co, gmbh, bv, pty, sarl, sas, ug`). Compared against `Company.name` **and** each `Company.aliases` entry.
- **MEDIUM · `EMAIL_DOMAIN`** — the signup email's domain matches the domain of some contact email on that company, **excluding a free-provider list** (`gmail.com, googlemail.com, yahoo.*, outlook.com, hotmail.*, live.*, icloud.com, me.com, proton.me, protonmail.com, aol.com, yandex.*, zoho.com, mail.com`). Without that exclusion this tier is pure noise in this portfolio, where founders commonly sign up from Gmail.
- **WEAK · `NAME_TOKENS`** — after normalization, one name's tokens (length ≥ 3, suffixes dropped) are a subset/prefix of the other's. Catches "Acme" ↔ "Acme Technologies"; also generates false positives.

**Decision: show STRONG and MEDIUM by default, put WEAK behind a "show weaker matches" toggle, and never auto-link anything — an admin always clicks to confirm, including on an exact contact-email match.** No code path in this Part may write `PortfolioCompany.companyId` without an explicit admin action. Rationale for no auto-link even on `CONTACT_EMAIL`: the contact list is admin-maintained and deliberately allows one address at several companies (Part 30 JC-BC-B — a serial founder, an advisor, a shared operator), so an exact hit is strong but not certain; and a wrong auto-link is silent and invisible to everyone. This follows `src/lib/sheet-link.ts`'s stated doctrine — *"never guesses: anything ambiguous or unmatched is flagged, not forced"* — which Part 30 already adopted as JC-BC-L.

*The alternative considered and declined:* auto-link on `CONTACT_EMAIL` alone, admin notified after the fact. Cheaper for the admin, and reversible via Unlink. **Declined for v1**; trivially adoptable later (it is one branch in WS76).

### D3 (was Q74) — Contact rows coexist untouched, **and** linking offers a default-checked "also add this founder as a contact"

**Decision, first half: matched `PortfolioCompanyContact` rows coexist, untouched. No merge, no delete, no rewrite.** A `PortfolioCompanyContact` is a *mailing directory entry*; a `User` is a *login identity*. They are different facts that happen to be about the same person. Deleting either on link is destructive and lossy (it would silently remove someone from future broadcasts), and Part 30's D4 depends on the contact list being the complete, self-contained audience.

**Restating F67 for the record: linking changes nothing about broadcast delivery.** Nobody is added to or removed from any broadcast by linking, now or later, unless that is separately decided.

**Decision, second half: yes — every link affordance carries a default-checked "Also add `jane@acme.com` as a contact on Acme" checkbox.** Under Part 30's D4 an approved founder with a live Molly login receives **no** broadcasts unless an admin has typed them into the contact list, which is the exact surprise that Part 30 D4 warned about; a newly linked active founder should actually receive future broadcasts. Implemented as a second call to the already-shipped, already-audited `POST /api/admin/portfolio-companies/[id]/contacts` (JC-LK-I), which validates, normalizes, dedupes and writes `PORTCO_CONTACT_ADDED` itself. **It is checked by default and always uncheckable** — the admin can decline it on any given link. Unchecking is the whole opt-out; removing the contact afterwards is the whole reversal.

**Scope note now that this is locked:** the checkbox appears in **both** link surfaces — the approvals card (WS77) and the portfolio-side link dialog (WS78.1) — and is hidden (not merely unchecked) when the address is already a contact on that company, so the admin is never offered a no-op. The contact's `name` comes from `User.name`; `role` is left null.

*Alternative considered and declined:* never touch contacts on link (link purely structural). Cleaner conceptually, but leaves the "why didn't our newest founder get the broadcast?" trap fully armed.

### D4 (was Q75) — Non-blocking: Approve stays one click, and linking can happen before, during, or after approval

**Decision: non-blocking.** Approve stays exactly one click and behaves exactly as it does today, even when a suggestion is showing. Linking is available **before** approval (from the standing Links view), **during** it (the "Link & approve" button), or **after** it (the portfolio-side widget) — the two actions are independent, and neither is ever a precondition of the other. When suggestions exist, a small block appears under the founder's details with the top match and its reason ("matched by contact email"), plus **Link & approve** alongside the unchanged **Approve**. When there are no suggestions — which will be the common case — the card is unchanged apart from F64's fix.

Blocking is rejected because approval is time-sensitive (the founder is waiting on a set-password email, the Part 9/WS21 population), because most signups will legitimately have no match, and because a mandatory confirm over an empty list is friction with no information in it.

*Sub-decision, deliberately deferred:* there is no persisted "not a match" dismissal in v1, so the standing view (WS78) will keep showing a pair an admin has already judged. If that becomes annoying the cheap fix is one additive nullable column modeled on `User.setupQueueDismissedAt` (Part 21, WS48) — named here, not built.

### D5 (was Q76) — Zero founder-visible change, anywhere

**Decision: the founder sees nothing.** No founder-facing surface mentions the link, the portfolio company, or the match; the founder's own `Company.name` stays exactly what they typed even when linked to a differently-spelled `PortfolioCompany`. **Acceptance rule for every workstream below: no file under a founder route (`/dashboard`, `/updates`, `/metrics`, `/company`, `/team`, `/documents`, `/planner`, `/links`) and no founder-reachable API response changes shape in this Part.** This is what keeps Part 31 inside the no-UX-regression constraint trivially.

*Alternative considered and declined:* an optional "also rename the operational company to `Acme Inc` (the portfolio spelling)" checkbox on link. **Declined** — renaming a founder's company under them is visible, surprising, and buys nothing (the link itself carries the association). Easy to add later; the reverse is not.

### D6 (was Q77) — Two co-founders producing two `Company` rows stays out of scope; the collision is made visible, not solved

Verified consequence: two `Company` rows (name is not unique), and `PortfolioCompany.companyId` is `@unique`, so **only one can ever be linked**. **Decision: out of scope for Part 31, but made visible rather than silent** — F66's new 409 means the admin attempting the second link is told *"Acme is already linked to the company created by jane@acme.com"* instead of getting a 500. Actually merging two operational `Company` rows is genuinely destructive (memberships, updates, metrics, documents, share links, diligence, scenarios all hang off `companyId`) and deserves its own Part with its own sign-off if it is ever wanted.

---

## Judgment calls (Felix's; each with its reversal path)

- **JC-LK-A — the matcher is a pure, DB-free, unit-tested lib** (`src/lib/portco-match.ts`), following `src/lib/broadcast-recipients.ts` and `src/lib/share-metrics.ts`. Routes fetch candidates and call it. *Reversal:* inline it into the one route that survives.
- **JC-LK-B — suggestions are computed on demand and never stored.** The candidate set is ~50 `PortfolioCompany` rows plus their contacts — one `findMany` and in-memory scoring, comfortably inside a request. No new table, no index, no cache, no cron. *Reversal:* if the portfolio ever grows 100×, add a Postgres `ILIKE` prefilter before scoring; the lib's signature does not change.
- **JC-LK-C — the free-email-provider list is a constant in the matcher lib**, not config or an env var. *Reversal:* it is one array.
- **JC-LK-D — two new audit actions, `PORTCO_LINKED` and `PORTCO_UNLINKED`**, written in addition to whatever `PORTCO_UPDATED` the PATCH already logs. `/admin/audit` renders `log.action` as a raw mono string (`src/app/admin/audit/page.tsx:68`), so no UI change is needed.
- **JC-LK-E — the write reuses the existing `PATCH /api/admin/portfolio-companies/[id]`** rather than inventing a `…/link` route; it already accepts `companyId`. WS76 hardens it in place. *Reversal:* split into a dedicated route if the PATCH ever gets crowded.
- **JC-LK-F — the "companies available to link" list is a new opt-in query param on the existing admin companies endpoint (`?linkable=1`), never a change to its default response.** `approvedCompanyFilter` hides pending-signup and diligence companies from `/admin/companies` and the admin dashboard *on purpose*; widening the default would be a UX regression on two shipped surfaces. The param bypasses the filter and is read by nothing else. *Reversal:* delete the param.
- **JC-LK-G — synthetic fixtures only** (`Acme`, `Northwind`, `founder@example.com`), Part 27/28 discipline. A name-matching test file is the single most tempting place in this repo to paste real portfolio names — it must not happen.
- **JC-LK-H — no schema change in this Part at all.** Every column already exists. This is the main reason the estimate is 3–4 days rather than a week.
- **JC-LK-I — D3's "add as contact" side effect is a second client call to the shipped contacts route**, not a new field on the PATCH. Reuses a route that already validates, normalizes, dedupes and audits (`PORTCO_CONTACT_ADDED`). *Reversal:* it is one `fetch` in one handler.

---

## WS75 — `src/lib/portco-match.ts`: the pure matcher + tests — ~0.5 day

**Goal.** One tested function that, given a typed company name (+ aliases + a signup email) and the portfolio-company candidate set, returns ranked, reason-annotated suggestions. No DB, no I/O.

**File-by-file steps:**

`src/lib/portco-match.ts` (new):

```ts
// Part 31, WS75 — pure suggestion engine for linking an operational Company
// to an existing PortfolioCompany. No DB access: callers fetch candidates
// and pass them in (the broadcast-recipients.ts / share-metrics.ts shape).
// It NEVER decides — it ranks. Every link is an explicit admin click
// (Part 31 D2), following sheet-link.ts's "never guesses: anything ambiguous or
// unmatched is flagged, not forced" doctrine.

export type MatchReason =
  | "CONTACT_EMAIL"   // signup email == a contact email on this company (STRONG)
  | "NAME_EXACT"      // normalized company names are equal            (STRONG)
  | "ALIAS_EXACT"     // a Company.aliases entry normalizes equal      (STRONG)
  | "EMAIL_DOMAIN"    // non-free email domain shared with a contact   (MEDIUM)
  | "NAME_TOKENS";    // token containment after normalization         (WEAK)

export type MatchTier = "STRONG" | "MEDIUM" | "WEAK";

export interface PortcoCandidate {
  id: string;
  name: string;
  companyId: string | null;      // already linked? still returned, flagged
  contactEmails: string[];       // normalized lowercase (Part 30 stores them that way)
}

export interface MatchInput {
  companyName: string;
  aliases?: string[];
  signupEmail?: string | null;
}

export interface PortcoMatch {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  tier: MatchTier;
  reasons: MatchReason[];        // sorted, deduped — drives the "why" copy in the UI
  alreadyLinked: boolean;        // true ⇒ UI shows it but disables Link (F66's 409 case)
}

// Free providers never imply a shared employer. Without this list the
// EMAIL_DOMAIN tier matches every Gmail founder to every Gmail contact.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com",
  "hotmail.com", "hotmail.co.uk", "live.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "aol.com", "yandex.com", "zoho.com", "mail.com",
]);

const LEGAL_SUFFIXES = new Set([
  "inc", "llc", "ltd", "limited", "plc", "corp", "co", "gmbh", "bv", "pty", "sarl", "sas", "ug",
]);

export function normalizeCompanyName(raw: string): string { /* lower, strip punctuation, collapse ws, drop trailing legal suffix */ }
export function emailDomain(email: string): string | null { /* null for blank/invalid/free */ }
export function matchPortfolioCompanies(input: MatchInput, candidates: PortcoCandidate[]): PortcoMatch[];
```

Ordering contract: `STRONG` before `MEDIUM` before `WEAK`; within a tier, more reasons first, then `portfolioCompanyName` ascending. Deterministic — the tests assert exact arrays.

`src/lib/__tests__/portco-match.test.ts` (new) — synthetic data only (JC-LK-G):
1. `"Acme, Inc."` ↔ `PortfolioCompany "Acme"` → STRONG / `NAME_EXACT`.
2. `jane@acme.com` signing up as `"Akme"` where Acme has contact `jane@acme.com` → STRONG / `CONTACT_EMAIL` (name mismatch does not demote).
3. `jane@gmail.com` where Northwind has contact `bob@gmail.com` → **no** `EMAIL_DOMAIN` match.
4. `jane@acme.com` where Acme has contact `bob@acme.com` → MEDIUM / `EMAIL_DOMAIN`.
5. `Company.aliases = ["Acme Technologies"]` → STRONG / `ALIAS_EXACT`.
6. `"Acme"` vs `"Acme Technologies"` with nothing else → WEAK / `NAME_TOKENS`.
7. A candidate with `companyId !== null` is returned with `alreadyLinked: true`, not filtered out.
8. Empty name + no email → `[]`.
9. Two reasons on one candidate → single entry, `reasons` deduped and sorted.
10. Ordering across all three tiers is exactly as specified.

**Acceptance checklist:** file imports nothing from `@/lib/db`; `npx vitest run src/lib/__tests__/portco-match.test.ts` green; every fixture name/address synthetic; `normalizeCompanyName` exported and separately tested.

**UX impact:** none — nothing renders. **Cost impact:** none (pure CPU, no dependency).

## WS76 — API: suggestion endpoints + hardened link write — ~0.75 day

**Goal.** Serve suggestions to both surfaces, and make the link write safe to drive from a UI.

**File-by-file steps:**

1. **`src/app/api/admin/approvals/[id]/matches/route.ts`** (new, `GET`). `requireAdmin()` → load the pending `User` with `memberships.company { id, name, aliases }` → load all `PortfolioCompany` with `{ id, name, companyId, contacts: { select: { email: true } } }` → call `matchPortfolioCompanies({ companyName, aliases, signupEmail: user.email }, candidates)` → return `{ companyId, companyName, signupEmail, matches }`. **Each match also carries `signupEmailIsAlreadyContact: boolean`** (computed from the same contact rows already loaded — no extra query), which is what drives D3's checkbox visibility in WS77 without a second round-trip. 404 if the user or their owned company is missing. Read-only; no audit row (the house does not audit reads).
2. **`src/app/api/admin/portfolio-companies/link-suggestions/route.ts`** (new, `GET`). Powers WS78.2. For every `PortfolioCompany` with `companyId === null`, run the matcher against **all** `Company` rows (no `approvedCompanyFilter` — JC-LK-F) and return `{ portfolioCompanyId, portfolioCompanyName, matches: [{ companyId, companyName, tier, reasons }] }`, plus a `companiesWithoutPortfolioCompany` list for the reverse-orphan panel. Note the inversion: here the *candidates* are companies and the *input* is a portfolio company, so the route builds `PortcoCandidate`-shaped rows from `Company` + the portfolio company's own contact emails. Keep both directions going through the one lib.
3. **`src/app/api/admin/companies/route.ts`** — add `?linkable=1` (JC-LK-F): when present, drop `approvedCompanyFilter` and return `{ id, name, createdAt, portfolioCompanyId }` for the manual-search fallback in the link dialog. Default response byte-identical to today.
4. **`src/app/api/admin/portfolio-companies/[id]/route.ts`** — harden the `companyId` branch (F66):

```ts
if (body.companyId !== undefined) {
  const next = body.companyId || null;
  if (next) {
    const target = await db.company.findUnique({
      where: { id: next },
      select: { id: true, name: true, portfolioCompany: { select: { id: true, name: true } } },
    });
    if (!target) return NextResponse.json({ error: "That company no longer exists." }, { status: 404 });
    if (target.portfolioCompany && target.portfolioCompany.id !== id) {
      return NextResponse.json(
        { error: `${target.name} is already linked to ${target.portfolioCompany.name}.` },
        { status: 409 }
      );
    }
  }
  data.companyId = next;
}
```

…then, after the update, write the link-specific audit row **in addition to** the existing `PORTCO_UPDATED`:

```ts
if (body.companyId !== undefined && existing.companyId !== data.companyId) {
  await logAdminAction(user!, data.companyId ? "PORTCO_LINKED" : "PORTCO_UNLINKED", {
    targetType: "PortfolioCompany",
    targetId: id,
    metadata: { companyId: data.companyId, previousCompanyId: existing.companyId },
  });
}
```

`Company.portfolioCompany` is the existing back-relation of `PortfolioCompany.company` — confirm the generated client exposes it before writing the query (it should; `PortfolioCompany.company` is declared at `prisma/schema.prisma:567`). If Prisma named it differently, use `db.portfolioCompany.findUnique({ where: { companyId: next } })` instead — same result, one extra query.

5. **`src/lib/__tests__/portco-link-route.test.ts`** (new, optional but cheap) — table-driven assertions on the guard logic extracted as a small pure helper, matching how `broadcast-publish.test.ts` tests route logic without a live DB.

**Acceptance checklist:** all four routes `requireAdmin()`-guarded; `GET /api/admin/companies` unchanged without the param (diff the JSON on a real row); linking a non-existent company → 404 with copy; linking an already-linked company → 409 naming the conflict; a successful link writes exactly one `PORTCO_LINKED` row visible at `/admin/audit`; unlink writes `PORTCO_UNLINKED`; suggestion endpoints return `[]` (not 500) for a company with no contacts and no name overlap.

**UX impact:** none yet (no UI calls these). The only change to a shipped endpoint is opt-in behind a query param. **Cost impact:** none — two extra `findMany`s against ~50-row and low-hundreds-row tables on admin-only pages.

## WS77 — `/admin/approvals`: fix F64, then suggest and link-and-approve — ~0.75 day

**Goal.** The approving admin sees the typed company name *and*, when one exists, the portfolio company it probably is.

**File-by-file steps:**

1. **`src/app/api/admin/approvals/route.ts`** — F64 fix, server side: add `companyName: u.memberships[0]?.company?.name ?? null` (and `companyId`) to a mapped response instead of returning the raw rows. Keep `memberships` in the payload so nothing else breaks.
2. **`src/app/admin/approvals/page.tsx`**:
   - The `Approval` interface gains `companyId: string | null`; `companyName` now actually arrives. The existing `:299-301` render starts working with no further change.
   - After `loadApprovals()`, fire one `GET /api/admin/approvals/[id]/matches` per pending row (there are single digits of these; a `Promise.all` over the loaded list is fine — no new endpoint shape needed). Store in `matchStates: Record<string, PortcoMatch[]>`. Failure is silent and the card degrades to today's behavior, exactly like `loadAwaiting()`'s catch at `:105-108`.
   - Render, only when `matches.length > 0`, a block under the founder details in the ochre-suggestion idiom (`rounded-md border border-ochre/30 bg-ochre/10 px-3 py-2 text-sm`), e.g. *"Looks like **Acme** in the portfolio — matched by contact email."* with a `<select>` when there is more than one candidate (native `<select>` is the house convention; `react-select` is an unused dep) and a "show weaker matches" toggle per **D2**. Beneath it, the **D3** default-checked checkbox — "Also add `jane@acme.com` as a contact on Acme" — rendered only when the signup email is not already a contact on the selected candidate (the `matches` payload carries that flag from WS76, so no extra fetch). It re-evaluates when the `<select>` changes candidate.
   - Buttons become **Link & approve** (primary) and **Approve** (secondary) when a match block is showing; unchanged single **Approve** otherwise. Per **D4** the plain **Approve** is always present and always one click — it must never be hidden, disabled, or gated behind dismissing the suggestion.
   - `handleAction(id, "approve")` is **untouched**. A new `handleLinkAndApprove(id, portfolioCompanyId, addContact)` runs strictly in this order, which matters now that both halves are confirmed:
     1. `PATCH /api/admin/portfolio-companies/[portfolioCompanyId] { companyId }`. On 4xx, surface the server's message inline (`text-destructive`, the existing `state.error` slot at `:306-310`) and **stop — do not approve.** The 409 copy from F66 is what makes D6's co-founder collision legible here.
     2. If `addContact`, `POST /api/admin/portfolio-companies/[portfolioCompanyId]/contacts { email, name }`. **Non-fatal** — a failure (other than the 400 "already has that contact", which counts as success) shows a secondary note and does **not** stop step 3. The link already succeeded and must not be rolled back.
     3. Call the existing `handleAction(id, "approve")` so the setup email and `USER_APPROVED` audit row go out through the exact shipped path. Approval must never be silently skipped or silently doubled — guard on the existing `actionStates[id].loading`.
3. Mobile: the new block (suggestion line, `<select>`, checkbox) is a full-width stacked child inside the existing `flex flex-wrap` card — Part 6 pattern C. Check at 375px.

**Acceptance checklist:** a pending signup now shows its company name (F64 — verify against a real pending row, this is the regression that has been live since the page was written); a signup whose email matches a contact shows a STRONG suggestion with the right reason copy; **Approve** alone still works, still sends the setup email, and is still one click with a suggestion on screen (**D4**); **Link & approve** with the box checked produces `PORTCO_LINKED` + `PORTCO_CONTACT_ADDED` + `USER_APPROVED` audit rows, in that order; with the box unchecked, the same minus `PORTCO_CONTACT_ADDED`; a 409 from the link leaves the user **un-approved** with a readable error naming the conflicting company; a failed contact-add still approves and still leaves the link in place; approving first and linking later from `/admin/portfolio/[id]` reaches the identical end state (**D4**); no suggestions ⇒ the card is visually identical to today plus the company name; 375px clean.

**UX impact:** admin-only, additive; the one behavioral change is that a previously-invisible field becomes visible (a fix, not a regression). **D5 check:** no founder-facing file is touched — the only signup-adjacent server change is the shape of an admin-only JSON response. **Cost impact:** none.

## WS78 — the standing reconciliation surface — ~1–1.25 day

**Goal.** Work the backlog: link portfolio companies independently of any single signup, and give `PortfolioCompany.companyId` its first writer UI (F65).

**File-by-file steps:**

**78.1 — the per-company link widget.** `src/app/admin/portfolio/[id]/page.tsx` header card (`:392-407`, where the read-only "View operational company profile" link lives today):
- Linked: `Molly account: Acme` + the existing profile link + a secondary **Unlink** with the ochre inline-confirm panel (`src/app/admin/reports/[id]/page.tsx:308-360` idiom).
- Unlinked: `Molly account: not linked` + a **Link…** button opening the existing `Modal` component used elsewhere on admin pages, containing (a) suggestions from `GET /api/admin/portfolio-companies/link-suggestions` filtered to this company (or a per-id variant), (b) a search box backed by `GET /api/admin/companies?linkable=1`, and (c) the **D3 default-checked** "Also add `<owner email>` as a contact on `<portfolio company>`" checkbox, rendered only when that address is not already a contact on this company (hidden, not disabled, when it is — never offer a no-op).
- `GET /api/admin/portfolio/companies/[id]` already returns `company` (`route.ts:21, 62`) — no change needed to feed the linked state.

**78.2 — the "Links" tab on `/admin/portfolio`.** Tab shell copied from `src/app/admin/funds/page.tsx:140-161` (`?tab=links`, `border-b-2 … border-primary text-primary`), the deal-ledger table staying as the default tab:
- **Unlinked portfolio companies** — one row each: name, contact count, top suggested `Company` with its reason, a **Link** button, and a "no suggestion" state that offers the search dialog.
- **Operational companies with no portfolio company** (the reverse orphans, from the same endpoint) — name, created date, owner email, and a link to `/admin/companies/[id]`. Read-only; its job is to make "this founder's company is not in the cap table at all" visible, which is currently invisible anywhere in the app.
- Empty state via the existing `EmptyState` component: "Every portfolio company is linked."

**Acceptance checklist:** `/admin/portfolio/[id]` can link and unlink, and the header reflects it without a reload; linking with the D3 checkbox left checked creates the contact and it appears in the same page's Contacts section on reload; unchecking it links without creating a contact; the checkbox does not render when the address is already a contact; `?tab=links` deep-links; the tab is the only nav change (no new sidebar item — JC placement note below); linking from the tab updates the row in place; both lists are correct against a hand-checked sample; the reverse-orphan list includes pending-signup companies (proving JC-LK-F's `linkable=1` path works); 375px clean per Part 6 patterns A (scrollable table) and B (wrap-row cards).

*No sidebar item is added* — this is reconciliation housekeeping inside an existing page, not a destination. One line if that turns out wrong.

**UX impact:** admin-only, purely additive; the deal ledger remains the default tab and is untouched. **Cost impact:** none.

## WS79 — link-aware affordances on the operational side — ~0.5 day

**Goal.** Make the link visible from the direction that currently has zero awareness of it (verified: no hit for `PortfolioCompany` anywhere under `src/app/admin/companies` or `src/app/api/companies`).

**File-by-file steps:**
1. `src/app/api/admin/companies/[id]`-equivalent read (or the page's existing loader) gains `portfolioCompany: { select: { id: true, name: true } }`.
2. `src/app/admin/companies/[id]/page.tsx` header shows `Portfolio: Acme →` linking to `/admin/portfolio/[id]`, or nothing when unlinked. Read-only — all linking stays on the portfolio side, one writer surface.
3. **The shared D3 contact-add handler** (used by WS77 and WS78.1, written once here or in a small shared client helper — implementer's call): after a successful link, if the checkbox is checked, `POST /api/admin/portfolio-companies/[portfolioCompanyId]/contacts { email, name }` with the owner's `User.email` / `User.name` and no `role`. A 400 "already has that contact" is treated as **success**, not an error (the desired end state is reached either way). A failure here **never** rolls back or reports failure on the link itself — the link is the primary action; surface the contact-add problem as a secondary inline note. Same non-fatal posture as the LP publish notify loop (the F12 lesson).

**Acceptance checklist:** an unlinked company's page is byte-identical to today; a linked one shows one new line; the contact-add is audited as `PORTCO_CONTACT_ADDED` (existing action, no new type) and shows up in the portfolio company's Contacts section; a contact-add failure leaves the link intact.

**UX impact:** admin-only, one additive line. **D5 check:** nothing here is founder-reachable — `/admin/companies/[id]` is admin-only. **Cost impact:** none.

---

## Sequencing & handoff (Part 31)

- **WS75 → WS76 → (WS77 ∥ WS78) → WS79.** WS77 and WS78 are independent once the API lands. **WS79's step 3 is the shared D3 contact-add handler** — whoever reaches it first writes it; the other calls it.
- **Nothing is blocked on a decision.** D1–D6 are confirmed and the Part requires no schema change, so WS75 can start immediately.
- **Ship-first order if the work is split across sessions:** WS77's F64 one-liner, then WS78.1's link widget (F65). Those two alone turn "impossible to see, impossible to do" into "visible and doable"; the matcher is the convenience layer on top.
- **Total effort:** ~3.5–4 days (WS75 0.5 + WS76 0.75 + WS77 0.75 + WS78 1.25 + WS79 0.5), with **no schema change** (JC-LK-H).

## Part 31 — confirmed decisions summary

| | Decision (locked 2026-09-01) | What it means for the implementer |
|---|---|---|
| **D1** (Q72) | Matching happens at **approval time** and in a **standing "Links" view**; **never** on `/signup` | Every suggestion endpoint is `requireAdmin()`-guarded. No unauthenticated route learns anything about the portfolio roster |
| **D2** (Q73) | Contact-email exact + normalized name/alias exact = STRONG; non-free shared email domain = MEDIUM; token containment = WEAK behind a toggle. **Never auto-link** | No code path writes `PortfolioCompany.companyId` without an explicit admin click — not even on an exact contact-email hit |
| **D3** (Q74) | Contact rows **coexist untouched**; every link affordance carries a **default-checked** "also add this founder as a contact" | Two surfaces (WS77, WS78.1), one shared handler (WS79.3). Non-fatal: a contact-add failure never undoes the link. Broadcasts are unaffected by the link itself (Part 30 D4 / F67) — the checkbox is the *only* thing that changes who gets mail |
| **D4** (Q75) | **Non-blocking.** Approve stays one click; linking can happen before, during, or after approval | Plain **Approve** is never hidden, disabled, or gated. All three orderings must reach the same end state |
| **D5** (Q76) | **Zero founder-visible change** | No founder route or founder-reachable API response changes shape. The founder's `Company.name` is never rewritten to the portfolio spelling |
| **D6** (Q77) | Two co-founders → two `Company` rows stays **out of scope**; the collision is made **visible** | F66's 409 names the conflicting company instead of returning a 500. No merge logic is written |

**Constraints honored:** **no schema change at all** (every column exists; trivially satisfies additive-only); **no new cost line** (pure in-memory matching over ~50 portfolio companies on admin-only pages — no service, no dependency, no cron); **no UX regression** (admin-only surfaces; the sole edits to shipped behavior are an opt-in query param, two error codes that are currently 500s, and F64's fix which makes a field that was supposed to render actually render). **Zero founder, LP, and investor-link impact.**

---

# Part 32 — UI/UX Review Triage: Brand Fidelity, Copy Discipline & the Behind-on-Updates Question (WS80–WS88, F68–F76, 2026-09-02)

> **Status: PLANNED, not built. All four product decisions CONFIRMED (Joseph, 2026-09-02) — nothing open. Every workstream WS80–WS88 is unblocked and ready for Alvin.** The four were posed as Q78–Q81 and are recorded below as **D1–D4**; every one landed on the recommended option, none reversed. This Part triages a 51-finding UI/UX review (Nisat, 2026-09-01, compiled from live production screenshots of the admin app plus a source read of the founder app, LP portal and investor share-link page) together with three copy findings (Nosa, same date, folded in below **verbatim as already-decided**, no further copy work needed on them). Every finding acted on below was **re-verified against the working tree** before being written down; where the review and the code disagree, the disagreement is recorded as a finding (F72, F73) rather than routed around.

## Numbering — read this before citing any finding in this Part

**Nisat's review uses its own `F01`–`F45` sequence, which collides head-on with this document's project-wide F-sequence.** The project already has an `F09`, `F14`, `F22`, `F41` and `F44` that mean entirely different things (Part 20's founder document upload, Part 21's awaiting-setup queue, Parts 23/24's storage and email work). To keep this unambiguous:

- **`N-Fxx` / `N-Cxx` / `N-FKx`** = a finding from **N**isat's review document. Used everywhere below.
- **`F68`+** = this project's own findings, continuing the sequence Part 31 ended at F67.
- Nosa's three copy fixes were handed over labelled with Nisat's numbers (`F22`, `F44`, `F09`); they appear below as **N-F22**, **N-F44**, **N-F09**.

The review artifact itself is **not committed to this repo** — see **F74**.

## Method — what was verified against the working tree

Every claim below was checked in source before being planned. Highlights of what that changed:

- **The raw-Tailwind-gray leak is real and is exactly one file.** `grep -rn "bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-\|bg-red-[0-9]\|bg-blue-[0-9]\|bg-green-[0-9]\|text-gray-[0-9]" src --include="*.tsx" --include="*.ts"` returns hits in **`src/app/share/[token]/page.tsx` only** (`:164`, `:172`, `:181`). N-F41 confirmed.
- **…but N-F43's "default borders" half is wrong.** `src/app/globals.css:47-52` has `@layer base { * { border-color: theme("colors.border"); } }`, and `tailwind.config.ts:44` maps `border` to `var(--color-border)` (Bone). So the bare `border` / `border-t` at `share/[token]/page.tsx:263, 288, 321, 356` **already render Bone**, not Tailwind's default. Only `bg-white` at `:185` bypasses a token — and `--color-surface` is `#FFFFFF` (`globals.css:20`), so it is **visually identical today**. N-F43 shrinks from "cards are off-brand" to a one-line fork-hygiene fix. Recorded as **F72**.
- **`bg-white` is *not* unique to the share page** (a second N-F43 overstatement): six other files use it — `src/app/admin/links/page.tsx:393`, `src/app/admin/reports/[id]/page.tsx:354`, `src/app/admin/companies/[id]/page.tsx:1691`, `src/app/links/page.tsx:304`, `src/components/ui/sector-combobox.tsx:173`, `src/components/lp/lp-login-form.tsx:87,122`. Same "identical today, wrong for a fork" status. **F72.**
- **The Sky stripe is exactly what N-F02 says.** `src/app/login/page.tsx:56` and `src/app/signup/page.tsx:57` are both `<div className="h-1 w-full bg-primary" />`, and login's is preceded by a stale `{/* Card with teal top accent */}` comment (teal is from a pre-DFS palette).
- **N-F03's scope is bigger than the review saw.** `bg-muted` (Bone) is the page canvas on `login/page.tsx:45,130`, `signup/page.tsx:47` **and `set-password/page.tsx:18, 26, 103, 299`** — four more instances in the same auth family, on the page a founder lands on from their activation email. **F72.**
- **N-F04 is contradicted by source.** The review says the card is "pinned near the top-left" at 1440px, but `login/page.tsx:45` and `signup/page.tsx:47` are both `flex min-h-screen flex-col items-center justify-center` — centred on both axes. What is actually true is that a `max-w-md` card sits alone on a large empty canvas, which is a composition judgment, not a bug. Q81.
- **N-F06 is a real rendering bug, and a worse one than the review suspected — this is the most valuable thing the review surfaced indirectly.** See **F69**. The fallback the review was told to look for *is* correct and present (`src/app/admin/page.tsx:305-306`), so the blank chart is not a copy gap.
- **N-F14 is one of three disagreeing definitions of the same fact**, not a badge-colour problem. See **F68**.
- **`"Molly team"` is two hits, not three.** `grep -rn "Molly team" src/` → `src/app/company/profile/page.tsx:173` and `src/app/company/documents/page.tsx:151`. The third spot (N-F22) is `<Badge variant="info">Molly</Badge>` at `src/app/updates/[id]/page.tsx:762`, which the literal-string grep does not catch. This matters for how WS81's guard is scoped. Also verified: `ORG_NAME` is **already imported** in `updates/[id]/page.tsx:35` (used correctly at `:286` and `:497`) and is **not** imported in either `company/` file. There are 44 `"Molly"` literals in `src/` and the overwhelming majority are correct product-name uses (`layout.tsx:30`, `email.ts` subject lines, `login/page.tsx:60`), so a blanket `"Molly"` lint would be unusable.
- **N-F40/N-FK3 already has an in-repo fix pattern.** `src/lib/email.ts:11` does `const EMAIL_LOGO_PATH = process.env.EMAIL_LOGO_PATH || "/brand/dfs-logo-primary.png";` with a documented `.env.example:35` entry. `src/app/lp/layout.tsx` is a **Server Component** (no `"use client"`; it exports `metadata`), so it can read a plain non-`NEXT_PUBLIC_` env var directly. This drops N-FK3 from "initiative" to a quarter-day.
- **N-F27's fix belongs in the shared primitive, not the audit page.** `overflow-x-auto` appears in **ten** files, one of which is `src/components/ui/table.tsx:18` — the shared `Table` wrapper. `src/app/admin/audit/page.tsx` does **not** import it (`:1-7`); it hand-rolls its own wrapper at `:50`. And no scroll affordance of any kind exists anywhere in the codebase (`grep -rn "scroll for more\|scrollLeft\|scroll-shadow"` → nothing but the `ScrollText` *icon*). So this is one shared fix plus one adopter, not a point patch.
- **N-F20's reversal is exact.** `src/app/admin/portfolio/[id]/page.tsx`: Contacts = `EmptyState` at `:513`, form at `:536`. Valuation history = form at `:757`, `EmptyState` at `:786`. Financing Rounds is a **third** pattern (`EmptyState` at `:720`, form in a modal at `:811`) and is fine as-is — the convention fix applies to Valuation history only.
- **N-C01 is exactly right.** `grep -c 'placeholder="Search'` per admin list page: Companies 1, Updates 1, Portfolio 1, Providers 1 · Funds 0, Fund Reports 0, LPs 0, Investor Links 0, Broadcasts 0.
- **N-C04 is right in substance, wrong on one line number, and understates the file.** See **F73**.
- **House patterns available for reuse:** `ComposerDisclosure` (`src/components/composer/composer-disclosure.tsx`) is already used **outside** the composer at `src/components/admin/sync-panel.tsx:265`, so N-F15/N-F17b have a precedent; `EmptyState` (`src/components/ui/empty-state.tsx`) takes `icon/title/description/action`; `ComposerTopBar` (`src/components/composer/composer-top-bar.tsx`) already has an `overflowItems` menu, which is the cheap answer to N-F35.
- **No schema change is required by any workstream in this Part.**

---

## F68 — three independent, disagreeing definitions of "behind on updates" (MEDIUM; this is the real N-F14/N-F07/N-C02 finding)

The review framed this as a badge-colour inconsistency between two screens. It is worse than that: **the codebase computes "behind on updates" three different ways, and the good answer already exists and is simply not shared.**

1. **`src/app/admin/companies/page.tsx:42-49`** — `getUpdateStatus(lastUpdateDate)`. Naive and calendar-only:
   ```ts
   if (!lastUpdateDate) return { label: "No updates", variant: "danger" as const };
   const days = daysSince(lastUpdateDate);
   if (days > 90) return { label: "Overdue", variant: "danger" as const };
   if (days > 30) return { label: "Aging", variant: "warning" as const };
   return { label: "Current", variant: "success" as const };
   ```
   No grace period, no cadence, no company age. A company created yesterday is `danger`.

2. **`src/app/api/admin/dashboard/route.ts:11-39`** — `isCompanyOverdue()`. Considered, documented, and **already shipped**: a `GRACE_PERIOD_DAYS = 30` rule whose own comment reads *"Rule 1: grace period — never flag a new company"*; then `MIN_UPDATES_FOR_CADENCE = 3`; then a learned cadence from the last `CADENCE_LOOKBACK = 5` published updates, flagging only when `timeSinceLastMs > avgGapMs`.

3. **`src/app/api/cron/reminders/route.ts:38-70`** — the reminder mailer, driven by the **per-company** `Company.reminderFrequencyDays` (`prisma/schema.prisma:95`), with a grace period of one full period and a `lastReminderSentAt` cooldown.

The consequences are concrete and admin-visible today: a company can be badged **red** on `/admin/companies`, **not counted** in the dashboard's "Companies Overdue" tile, and **not sent a reminder** — all at the same moment, all correct by their own rule. Definition (2) also ignores `reminderFrequencyDays` even though the founder-facing cadence setting exists. N-F07's "why is the dashboard number black and the list badge red" is a symptom; the numbers can also simply *disagree*.

**This is why Q78 is a product question and not a colour fix.** The engineering answer is obvious (one shared pure lib); what the badge should *say* is not.

## F69 — 15 references to CSS custom properties that do not exist; both Recharts surfaces render off-token (MEDIUM, real bug, and it reaches the founder app)

`grep -rn "hsl(var(" src` returns hits in exactly two files: `src/app/admin/page.tsx` (7) and `src/components/ui/metric-chart.tsx` (8). They reference `--primary`, `--border`, `--muted-foreground`, `--background`, `--foreground`.

**None of those variables is defined anywhere in the repo.** `src/app/globals.css` is the only stylesheet, and its `:root` block (`:10-45`) defines `--color-accent`, `--color-accent-hover`, `--color-accent-rgb`, `--color-accent-foreground`, `--color-powder`, `--color-bg`, `--color-surface`, `--color-border`, `--color-border-hover`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-muted-rgb`, `--color-primary-*` and `--color-destructive-*`. The `--primary` / `--border` / `--foreground` names are **shadcn-style leftovers from before the DFS token system landed**; `tailwind.config.ts` maps the *Tailwind* names onto the real `--color-*` variables, but a raw `hsl(var(--primary))` string in a Recharts prop never goes through Tailwind at all.

So every one of these resolves to an invalid colour:

- `src/app/admin/page.tsx:333` — `<Bar dataKey="count" fill="hsl(var(--primary))" />` ← **this is N-F06's "no visible bars"**
- `:310` `CartesianGrid stroke`, `:313` and `:319` axis tick `fill`, `:327-330` tooltip `border`/`background`/`color`
- `src/components/ui/metric-chart.tsx:45, 49, 55, 68, 69, 70, 76, 78` — the **founder-facing** metric chart's line `stroke`, dot `fill`, grid, axes and tooltip

The dashboard screenshot showing only y-axis numerals is consistent with this: SVG text falls back to the initial `fill` (black) when the specified value is invalid, so the tick labels survive while the styled elements do not. **The `updatesByMonth.every(count === 0)` fallback at `admin/page.tsx:305-306` is correct and is not the problem** — it was rightly ruled out.

Fix is mechanical (WS84) and, notably, this is the only finding in the Part that touches a founder-facing pixel — and strictly as a repair.

## F70 — ROADMAP drift: four Parts shipped while still described as "planned, NOT yet built" (LOW, docs-only; annotated in this pass)

`ROADMAP.md:3` and its status bullets were verified against `git log` and the working tree:

| Part | ROADMAP said | Reality |
|---|---|---|
| **23** (WS49–WS53) | "planned, not yet built" | **SHIPPED** — `cfabd9a`, `cb8ec30`, `2b79ece`, `b8ffc1b`, `ea579f1` |
| **28** (WS62–WS65) | "planned, NOT yet built" | **SHIPPED** — `9d30c43`, `edfbfbf`, `bba2ca4`, `d987d58`; `scripts/hooks/pre-commit` and `.confidential-terms.example` both present |
| **29** (WS66–WS68) | "PLANNED, NOT yet built" | **SHIPPED** — `c5793d1`, `fe2f4ae`, `731f09e`; `src/lib/cap-table.ts`, `src/app/planner/**`, `CapTableScenario` at `prisma/schema.prisma:144` |
| **31** (WS75–WS79) | "PLANNED, NOT yet built … ready for Alvin" | **SHIPPED** — `5549864`..`2396d8c`; `src/components/admin/portco-link-dialog.tsx` and the `/admin/portfolio` Links tab both live |

This is the same class as Part 30's F58 and Part 31's F63 — it recurs every time a plan ships without the ROADMAP bullet being flipped. All four bullets are annotated in `ROADMAP.md` in this same pass.

## F71 — Part 25's F48 (HIGH) — **FIXED 2026-09-02, standalone and outside Part 32** (commit `39003e3`)

Found live again during this Part's verification: `src/app/api/updates/[id]/pdf/route.ts` guards with `requireAuth()` only (`:3`, `:12`), then does `db.update.findUnique({ where: { id }, select: { companyId: true } })` at `:16-19`, uses `companyId` **for nothing**, and calls `generateUpdateHTML(id)` — so any approved user can read any company's full investor update. Part 25's WS55 planned the one-line fix (`requireCompanyAccess(update.companyId)`, mirroring the sibling update routes) on 2026-08-06 and it had not been built.

**Status: CLOSED.** Fixed by a separate agent, standalone and sequenced ahead of Part 32 — commit `39003e3`, verified in the working tree: `src/app/api/updates/[id]/pdf/route.ts:3` now imports `requireCompanyAccess` and `:22` calls `requireCompanyAccess(update.companyId)` after the 404 lookup, mirroring the sibling update routes. Recorded here because this Part is where it was re-verified, **not** because anything in Part 32 addressed it.

**Hard scope rule for Alvin: no workstream in this Part may touch `src/app/api/updates/[id]/pdf/route.ts` or `src/lib/pdf.ts`.** The security fix has landed there and must not be perturbed by a UI batch; `src/lib/pdf.ts` also carries its own deferred finding (F76). No workstream in WS80–WS88 needs either file — verified: the route renders a standalone HTML document (`src/lib/pdf.ts:52-58`) and imports none of the components, Tailwind classes, charts or tables this Part changes.

**This rule is load-bearing, not a formality — see F76.** `src/lib/pdf.ts` happens to contain the single largest concentration of the exact off-brand colours WS80 exists to remove, which makes it the most tempting file in the repo for a brand-fidelity pass to wander into. It is deliberately out of scope, and `pdf/route.ts` now carries a fresh security fix plus a new regression test (`src/lib/__tests__/update-pdf-route.test.ts`) that a UI pass has no reason to go near.

## F76 — the update-export HTML is a fourth off-brand surface the review never saw (LOW; deliberately NOT fixed in this Part)

Found while verifying F71's scope rule. `src/lib/pdf.ts` generates the standalone HTML an update exports to, and its full colour inventory is:

| Value | Count | What it is |
|---|---|---|
| `#64748B` | 8 | Tailwind slate-500 — body/meta/footer text |
| `#3BBFA0` | 6 | **the same orphan teal as the rich editor's blockquote (N-C04)** — header rule, links, "Key Metrics" heading, metrics-table border, blockquote border |
| `#E2E8F0` | 3 | Tailwind slate-200 — footer/divider borders |
| `#F1F5F9` | 2 | Tailwind slate-100 |
| `#E8F4F8` | 1 | a pale blue with no DFS relationship |
| `#1A1A2E` | 1 | near-black, but **not** Obsidian (`#14140F`) |

Not one DFS token. This is a genuinely new finding — Nisat's review could not have caught it, because it renders in an exported document rather than on any screen she could screenshot or any page component she read.

**Explicitly deferred, for two reasons.** (1) That file sits beside a just-landed security fix (F71, commit `39003e3`) and its new regression test; a cosmetic pass there earns nothing and puts noise on a security-relevant area of the diff. (2) The fix is **not** the same fix as WS80: `pdf.ts` emits a detached `<!DOCTYPE html>` document (`:52-58`), so `globals.css`'s `:root` custom properties are **not in scope there** — `var(--color-accent)` would resolve to nothing. It needs literal DFS hex values (Obsidian `#14140F`, Tide `#56544B`, Bone `#D8D6CB`, Paper `#EBE8DE`, accent `#44688E`), which is a different mechanical exercise with a different acceptance test (render an export and look at it) from WS80's token swap. Scoping it into WS80 would blur a clean, checkable workstream.

**Recommendation: a follow-up half-day, scheduled after Part 32 rather than inside it.** Worth doing — this document is emailed and forwarded, so it is a real brand touchpoint — but it is not urgent, and keeping it out of Part 32 leaves the just-landed F71 security fix and its regression test undisturbed.

## F72 — brand-token scope corrections to N-F03 / N-F41 / N-F43 (LOW; folded into WS80)

Three corrections, each verified above: (a) the auth-canvas `bg-muted` miss also covers `set-password/page.tsx:18, 26, 103, 299`; (b) bare `border`/`border-t` on the share page is **already Bone** via `globals.css:48-49`, so N-F43 is a one-line `bg-white` change, not a card restyle; (c) `bg-white` appears in six files besides the share page. Recorded so a future reader does not re-derive them, and so WS80's acceptance checklist is honest about what it does and does not change.

## F73 — the rich editor has two more bare-hex colours than N-C04 found, and N-C04's third line number is wrong (LOW; folded into WS80)

`grep -no "var(--color-[a-z-]*[^)]*)\|#[0-9A-Fa-f]\{6\}" src/components/ui/rich-editor.tsx`:

| Line | Value | Verdict |
|---|---|---|
| 442 | `#94a3b8` | **off-brand** (Tailwind slate-400) — placeholder text |
| 451 | `#3BBFA0` | **off-brand** (teal, no DFS relationship) — blockquote left border |
| 451 | `#64748B` | **off-brand** (Tailwind slate-500) — blockquote text |
| 459 | `#EBE8DE` | on-palette but **bare literal** (Paper) — not flagged by N-C04 |
| 466, 477, 481 | `var(--color-text-muted)` | correct |
| 469 | `#44688E` ×2 | on-palette but **bare literal** (accent) — `.portco-mention`; not flagged by N-C04 |
| 484, 485 | `var(--color-accent, #44688E)` | correct — this is the pattern to copy |

So N-C04 cites `442, 451, 469`, but `469` is a *correct-colour* hardcode, not an off-brand one, and it missed `459`. N-C04's claim that "every other color in this same file correctly falls back to `var(--color-accent, #44688E)`" is **inaccurate** — only `:484-485` do. Substance stands: `442`/`451` are the visible bugs (any blockquote in any update or fund report renders a teal border today); `459`/`469` are fork-hygiene.

## F74 — the review artifact contains real portfolio identifiers and must stay out of the repo (process)

Nisat's HTML review names a real portfolio company in a screenshot caption and states real portfolio/fund/deal counts. Under the **"Confidentiality & synthetic-data convention"** at the head of this file, those are exactly the class of identifier that may never enter a committed file (*"real portfolio-company or founder names … the exact portfolio shape (deal/company/fund counts)"*). **This Part deliberately paraphrases every such reference** — no company name, no counts, and the N-F14 example uses `Acme`. The artifact itself lives outside the repo and must not be copied into `docs/`.

## F75 — the Part 28 confidentiality guardrail is installed nowhere and is currently inert (MEDIUM, process)

`scripts/hooks/pre-commit` exists and is correct, but:
- `.git/hooks/pre-commit` does **not exist** and `git config core.hooksPath` is unset — the hook is **not wired up on this machine**, so it never runs.
- `.confidential-terms` does **not exist** locally. Even if wired, the hook's own first branch (`:10-14`) prints `note: .confidential-terms not found — confidentiality scan skipped.` and `exit 0`.

So the standing guardrail WS65 shipped to stop F52–F57 recurring is, in practice, doing nothing — which is precisely how F74's material could have been pasted in unnoticed. **Not fixed here** (it is a one-command install plus a local file Joseph must populate himself with real terms, which Felix must not author). Flagged as a two-minute action for Joseph:
```sh
git config core.hooksPath scripts/hooks    # or: ln -s ../../scripts/hooks/pre-commit .git/hooks/pre-commit
cp .confidential-terms.example .confidential-terms   # then fill in the real terms; it is gitignored
```

---

## Confirmed decisions (D1–D4 — locked by Joseph 2026-09-02, do NOT re-litigate)

> These were posed as open questions **Q78–Q81** in the first draft of this Part and are **all now decided — every one as recommended, none reversed.** The Q-numbers are kept in the headings because `ROADMAP.md` and the project memory reference them. **Disambiguation:** Parts 30 and 31 also number their decisions `D1`–`D9` / `D1`–`D6`; wherever this Part cites one of those it says **"Part 30 D4"** in full, and a bare `D1`–`D4` always means Part 32's. The options tables and declined alternatives are preserved deliberately: they are the record of what was considered and rejected, so a future reader does not reopen a settled question by accident.

### D1 (was Q78) — Extract the already-shipped grace + cadence rule into a shared lib; a never-yet-updated company gets a neutral badge (N-F14, N-F07, N-C02; drives WS85)

Today (`admin/companies/page.tsx:43`) a company that has **never** submitted an update gets the same `danger` badge as one 90+ days delinquent, so most of the current portfolio list renders red and the badge carries no information. F68 shows the app already contains a better rule that nothing shares.

| | Option | Behaviour | Effort | Verdict |
|---|---|---|---|---|
| **A** | **Colour-only fix** | `!lastUpdateDate` → `variant="info"`, label "No updates yet". Everything else unchanged | ~10 min | **REJECTED** — leaves the three definitions disagreeing (F68) |
| **B** | **Extract and share `isCompanyOverdue()`** | Move `dashboard/route.ts:11-39` verbatim into a pure, unit-tested `src/lib/update-cadence.ts`; both the dashboard and the companies list call it; badge becomes neutral (inside the 30-day grace) / `Current` / `Aging` / `Behind` (danger, only once the learned cadence is actually missed) | ~0.75–1 day | **CHOSEN (D1)** |
| **C** | **B, plus fold in `reminderFrequencyDays`** | As B, but a company with an explicit cadence set is judged against *that* rather than a learned average, aligning the badge with the reminder cron too | ~1.25 day | **DEFERRED** — most correct eventually, but the field is nullable on most rows today |

**Decision: B, and the brand-new-company badge is a neutral `info` "No updates yet" — never red.** B is the only option that makes the two admin screens agree, and it costs almost nothing beyond A because *the logic is already written, shipped and in production* — it just lives inside a route handler. It also matches the house convention of pure, unit-tested libs (`src/lib/share-metrics.ts`, `src/lib/broadcast-recipients.ts`, `src/lib/portco-match.ts`).

**The label is settled: `info` variant, text "No updates yet".** Not "New", not "Awaiting first update", and not a blank cell — an empty cell reads as a data-loading failure, and the admin genuinely wants to see the state, just not in red. WS85 step 5 implements exactly this; the implementer does not need to ask.

**C is deferred, not rejected.** B is a strict subset of C, so adopting B does not close the door: once `reminderFrequencyDays` is set on a real majority of companies, C is one branch inside `cadenceStatus()`.

**D1 also settles N-C02 as a written, citable rule** — added to the protected-patterns register by WS85 step 7: *danger/laterite is for a state that requires intervention; a brand-new, never-happened-yet state is neutral or info, never danger.*

### D2 (was Q79) — Every admin list page gets a search row, unconditionally (N-C01, N-F31, N-F31a, N-F31c; drives WS86)

Verified split: **have** search — Companies, Updates, Deal Ledger/Portfolio, Providers. **Don't** — Funds, Fund Reports, LPs, Investor Links, Broadcasts. There is no principle behind the split; it is the order the pages were built in.

| | Option | Rule | Effort |
|---|---|---|---|
| | Option | Rule | Effort | Verdict |
|---|---|---|---|---|
| **A** | **Universal** | Every admin list page gets the same client-side search row, unconditionally, even at 3 rows | ~1–1.25 day | **CHOSEN (D2)** |
| **B** | **Threshold** | Render the search row only when `rows.length > 10` | ~1.25 day | **REJECTED** — a control that appears and disappears is more code *and* less predictable |
| **C** | **Per-page** | Add it to LPs and Fund Reports only; leave the rest | ~0.5 day | **REJECTED** — recreates the arbitrary split this decision exists to remove |

**Decision: A, universal — all five missing pages get it, with no row-count threshold.** The four pages that already have search use an identical `<Input placeholder="Search…" />` + `filter()` idiom with no server round-trip, so the marginal cost per page is small and the consistency payoff is exactly what N-F18 asks for (converge on the Updates-page pattern).

**Because A is chosen, WS86 also standardises the placeholder wording and the row's position across all nine list pages** (directly above the list, below any page-level notice or stat block), so the five new ones land identically rather than five slightly different ways — and the existing four are brought into line if they diverge. That standardisation is part of the decision, not an optional extra.

### D3 (was Q80) — Pretty-print the Audit Log `Details` column in place, full object behind a native `<details>` (N-F28; drives WS87)

`src/app/admin/audit/page.tsx:72-74` renders `formatMetadata(log.metadata)` as raw JSON in a mono cell — correct, complete, and the least readable surface in the app. It is also the first column clipped on any narrow viewport, which is why it compounds N-F27.

| | Option | Behaviour | Effort | Verdict |
|---|---|---|---|---|
| **A** | **Accept it; move it behind an expand** | Column drops to a "Details ▸" toggle; raw JSON on demand | ~0.35 day | **REJECTED** — hides the common case too |
| **B** | **Pretty-print in place** | Same JSON, rendered as `key: value · key: value` pairs, truncated, with the full object on expand | ~0.5 day | **CHOSEN (D3)** |
| **C** | **Summarise per action type** | A `Record<action, (meta) => string>` map producing "Report published — 5 mentions" | ~0.75 day + ongoing upkeep | **REJECTED** |

**Decision: B — pretty-print in place, with the full object behind a native `<details>` disclosure.** It makes the common case readable without inventing a per-action vocabulary.

**C is rejected for a specific structural reason worth restating so nobody proposes it again:** the audit action is deliberately a **free string** — `logAdminAction` accepts any value and `src/app/admin/audit/page.tsx:70` renders it raw, which is exactly why Parts 30 and 31 could introduce `PORTCO_LINKED` / `PORTCO_UNLINKED` / `PORTCO_CONTACT_ADDED` with **zero** UI work. A per-action summary map would convert that free property into a permanent maintenance obligation on every future Part that logs anything new, and would silently render unmapped actions worse than today.

**Implementation constraint that comes with the decision:** the disclosure is a **native `<details>` element**, not a client component. `/admin/audit` is a Server Component (`page.tsx:1-7`, no `"use client"`) and must stay one — same reasoning as JC-UI-B.

### D4 (was Q81) — Nothing beyond WS80's token fixes for login/signup (N-F04)

**Verified first:** the review's premise is wrong. Both cards are `flex min-h-screen flex-col items-center justify-center` (`login/page.tsx:45`, `signup/page.tsx:47`) — they are centred, not pinned top-left. What is true is that a `max-w-md` card sits alone on a large empty canvas with no supporting content.

| | Option | | Effort | Verdict |
|---|---|---|---|---|
| **A** | **Nothing beyond WS80** | Remove the stripe, fix the canvas to Paper, ship. A quiet centred card on Paper is a legitimate, on-brand auth page | 0 | **CHOSEN (D4)** |
| **B** | **Add a Sky eyebrow** | The brand skill's sanctioned replacement for the stripe — a small mono uppercase label above the heading, matching `/investors` | ~0.15 day | **NOT taken** |
| **C** | **Two-panel layout** | Form left, a brand panel right, collapsing to today's single card below `lg:` | ~0.75 day + a design decision about what the panel says | **REJECTED** |

**Decision: A — no additional work. D4 produces no workstream of its own.** WS80 already removes the prohibited stripe and moves the canvas to Paper; that is the whole of the change to these pages. A quiet centred card on Paper is a legitimate, on-brand auth page.

**Explicit instruction to the implementer: do NOT add a Sky eyebrow, a right-hand panel, a quote, a stat, or any other composition element to `/login`, `/signup` or `/set-password` in this Part.** Option B was offered and not taken; adding it "while in there" during WS80 would be exactly the scope creep JC-UI-C exists to prevent. WS80's acceptance checklist covers these pages and asserts colour-only changes.

C is rejected: it is real design work with no user problem behind it (nobody is failing to log in), and it would also have had to cover `/set-password`, which shares the canvas (F72) and which N-F04 never considered.

---

## Deferred, with reasons

- **N-F33 — "0 contacts" rendered in ochre for every company in the broadcast audience list** (`src/app/admin/broadcasts/[id]/page.tsx:451`, verified: `c.contactCount === 0 ? "text-ochre" : "text-muted-foreground"`). **Deferred, deliberately.** The review's own judgment is that the rule is defensible and the problem is only that *every* row is currently zero. Parts 30 and 31 just shipped the contact-management and link-and-add-contact machinery that will populate this data; the amber wall is a transient symptom of an empty table, and re-tuning the threshold before the data exists would be guessing. **Revisit once contacts are populated on a real majority of portfolio companies** — at that point the question ("does partial amber read better than a wall of it?") can be answered by looking rather than by argument.

## Protected patterns register (the review's 20 "keep this" findings — no code change; recorded so they are not undone later)

These were called out as working well and are **not** to be "tidied" by a future pass. Cited here because a register nobody wrote down is a register nobody honours.

| Ref | Pattern | Where |
|---|---|---|
| N-F01 | The reference for "on brand, well composed": mono uppercase eyebrow, centred cover headline, single CTA | `src/app/investors/page.tsx` |
| N-F05 | KPI cards + chart on Paper, one accent, generous spacing | `src/app/admin/page.tsx` |
| N-F08 | Two-tier empty state: "No pending approvals" plus a separate awaiting-setup list with per-row actions | `src/app/admin/approvals/page.tsx` |
| N-F16 | Tabbed company detail (Updates/Metrics/Documents/Members/Notes) that holds up empty | `src/app/admin/companies/[id]/page.tsx` |
| N-F17 | Four-stat cross-fund header with a quiet "admin-only estimate" caption | `src/app/admin/portfolio/page.tsx` |
| N-F18 | The most complete list-page pattern in the app: search + filters + sort + tabs | `src/app/admin/updates/page.tsx` |
| N-F19 | **The best empty-state copy in the app** — ties the empty state to a real consequence: *"No contacts yet — broadcasts to this company would reach nobody."* Use as the model for every future empty state with a downstream cost | `src/app/admin/portfolio/[id]/page.tsx:513` |
| N-F21 | "N mentions" as plain metadata text, no badge, no colour | `src/app/admin/reports/page.tsx` |
| N-F23 | Quiet success badge for "Sent" | `src/app/admin/digest/**` |
| N-F24 | All/Pending/Vetted/Rejected segmented control with a live count badge | `src/app/admin/providers/page.tsx` |
| N-F29 | Card-per-subsystem admin ops page with inline diagnostic actions | `src/app/admin/settings/page.tsx` |
| N-F30 | **The strongest pattern in the codebase** — chromeless composer with progressive disclosure | `src/components/composer/**`, `src/app/updates/new/page.tsx` |
| N-F32 | Broadcast composer deliberately mirrors the founder update composer | `src/app/admin/broadcasts/[id]/page.tsx` |
| N-F34 | Mobile reflow holds (Part 6 / WS14–WS15 still good) | app-wide |
| N-F36 | Non-blocking banner: the diligence card never blocks or reflows the dashboard if its fetch fails | `src/app/dashboard/page.tsx` |
| N-F37 | Founder app consistency — message-banner / EmptyState / Card throughout | `src/app/company/**`, `src/app/team`, `src/app/providers` |
| N-F38 | Non-enumerating OTP copy: *"If this address receives fund reports from us, a code is on its way"* | `src/components/lp/lp-login-form.tsx` |
| N-F39 | LP report list/detail: grouped by fund, frozen snapshots, 404 for both "missing" and "not yours" | `src/app/lp/reports/**` |
| N-F45 | Share-page information hierarchy (snapshot strip → collapsible update cards → metric callouts) is right; **WS80 is a token pass only, not a redesign** | `src/app/share/[token]/page.tsx` |
| N-FK1 | `ORG_NAME` and the corner-radius mapping are genuinely fork-friendly already | `src/lib/org.ts`, `tailwind.config.ts:70-77` |

**One more worth adding to the register, found during verification rather than by the review:** `tailwind.config.ts:70-77` maps `rounded-sm/md/lg/xl/2xl` all to 1–2px, so a developer reaching for `rounded-xl` out of habit still renders flat. That is deliberate insurance against brand drift and must not be "corrected" by anyone who thinks the mapping looks like a mistake.

---

## Judgment calls (Felix's; each with its reversal path)

- **JC-UI-A — the scroll affordance goes into `src/components/ui/table.tsx` first**, so all current and future adopters get it, and `/admin/audit` adopts the primitive rather than getting a bespoke patch. *Reversal:* revert one component.
- **JC-UI-B — the scroll affordance is pure CSS, no JavaScript and no scroll listener.** A right-edge gradient overlay on the wrapper plus a mobile-only caption. This keeps `/admin/audit` (a Server Component, `page.tsx:1-7`) free of a client boundary it does not otherwise need. The cost is that the hint does not disappear when you reach the right edge. *Reversal:* if that static hint proves annoying, a `useRef` + `onScroll` client wrapper is a contained upgrade to the same component.
- **JC-UI-C — WS80 changes colour values only.** No spacing, no type scale, no layout, no component swaps on the share page. N-F45 is explicit that the structure is right; the risk in this Part is scope creep on the one public-facing page.
- **JC-UI-D — the `"Molly team"` guard is a Vitest test, not an ESLint rule.** The repo already runs Vitest in CI (`.github/workflows`), a test can assert over the whole `src/` tree in a few lines, and an ESLint rule for a string literal in JSX text is disproportionate. *Reversal:* delete one test file.
- **JC-UI-E — the guard matches the literal `"Molly team"` only**, not bare `"Molly"`. 44 legitimate product-name uses exist; a broader rule would be permanently suppressed and therefore worthless. The N-F22 badge case is fixed by hand and cannot be caught by this guard — stated in the test's own comment so nobody assumes otherwise.
- **JC-UI-F — the LP logo becomes a plain server-side env var (`ORG_LOGO_PATH`), mirroring `EMAIL_LOGO_PATH`** (`src/lib/email.ts:11`), **not** an admin-settings upload. An upload needs a settings row, an S3 write path, and a UI; the env var is three lines and matches a shipped precedent. *Reversal:* it is one constant in `src/lib/org.ts`; an upload path can replace it later without changing the call site.
- **JC-UI-G — WS84 replaces the dead variables with the real `--color-*` tokens directly in the two Recharts files**, rather than back-filling `--primary`/`--border`/`--foreground` aliases into `globals.css`. Adding the aliases would resurrect the shadcn naming the project deliberately left behind and give future code two correct ways to say the same thing. *Reversal:* the alias block is five lines if that judgment is ever reversed.
- **JC-UI-H — no schema change anywhere in this Part.**

---

## WS80 — Brand-token fidelity batch — ~0.5 day

**Goal.** Every remaining off-token colour in the app, in one pass. Colour values only (JC-UI-C).

**Covers:** N-F41, N-F43, N-F02, N-F03, N-C04 + the F72 and F73 scope corrections.

**File-by-file steps:**

1. **`src/app/share/[token]/page.tsx`** — the one public-facing surface, and the whole reason this workstream is first.
   - `:164`, `:172`, `:181` — `bg-gray-50` → `bg-background`. (Verify against `src/app/investors/page.tsx:10`, which is the same idiom done right.)
   - `:185` — `bg-white` → `bg-card`. Visually identical today (`--color-surface: #FFFFFF`); this is so a fork's palette propagates (F72).
   - **Do not touch** `:263`, `:288`, `:321`, `:356`. Those bare `border` / `border-t` classes already resolve to Bone via `globals.css:48-49` — N-F43's claim about them is wrong, and "fixing" them adds churn with no visual change.
   - **Do not restructure anything.** N-F45 stands: the layout is right.
2. **`src/app/login/page.tsx`** — delete `:56` `<div className="h-1 w-full bg-primary" />` **and** the stale `{/* Card with teal top accent */}` comment above it. Change `bg-muted` → `bg-background` at `:45` and `:130` (the `Suspense` fallback — easy to miss, and it flashes on every cold load).
3. **`src/app/signup/page.tsx`** — delete `:57`'s stripe; `bg-muted` → `bg-background` at `:47`.
4. **`src/app/set-password/page.tsx`** (F72 — not in the review) — `bg-muted` → `bg-background` at `:18`, `:26`, `:103`, `:299`. This is the page a founder reaches from their activation email; leaving it on Bone while login and signup move to Paper would *create* the inconsistency this workstream exists to remove.
5. **`src/components/ui/rich-editor.tsx`** — the only component where off-brand colour reaches published content:
   ```css
   /* :442 */  color: var(--color-text-muted);                      /* was #94a3b8 */
   /* :451 */  .ProseMirror blockquote {
                 border-left: 3px solid var(--color-accent, #44688E); /* was #3BBFA0 — teal, no DFS relationship */
                 padding-left: 1rem;
                 color: var(--color-text-secondary);                  /* was #64748B */
                 margin: 0.75rem 0;
               }
   ```
   Then the F73 riders: `:459` `#EBE8DE` → `var(--color-bg, #EBE8DE)`; `:469` both `#44688E` → `var(--color-accent, #44688E)`. Use the `var(--token, #hex)` form throughout — that is the file's own established pattern at `:484-485`, and the fallback matters because these rules live in an inline `<style>` block.

**Acceptance checklist:** `grep -rn "bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-\|text-gray-[0-9]" src` returns **zero** hits; no `h-1 w-full bg-primary` remains anywhere; `/login`, `/signup`, `/set-password` and `/share/[token]` all sit on the same Paper canvas as `/investors`; a blockquote typed into an update renders with a Sky-family left border and Tide text in **both** the editor and the published view; the share page's DOM structure is unchanged (diff shows colour classes only); `npm run lint` clean.

**UX impact:** **visible and intentional, all of it corrective.** Four pages change background from Bone to Paper and two lose a 1px stripe the brand guide prohibits; the share page — the one surface external investors see — moves onto the house palette. No layout, copy, control or behaviour changes anywhere, so no user has to relearn anything. Founder/admin/LP flows are untouched. **Cost impact:** none.

## WS81 — Copy & naming batch, plus the `"Molly team"` regression guard — ~0.25 day

**Goal.** Stop the product's name standing in for the DFS staff, and make the mistake un-repeatable.

**Covers:** N-F22, N-F44, N-F09 (all three **already decided** by Nosa — exact strings below, no further copy work), plus N-C03 / N-FK2.

**File-by-file steps:**

1. **`src/app/updates/[id]/page.tsx:762`** (N-F22) — one line. `ORG_NAME` is **already imported** at `:35`:
   ```tsx
   <Badge variant="info">{ORG_NAME}</Badge>   {/* was: <Badge variant="info">Molly</Badge> */}
   ```
   Renders "DFS". A founder reading a staff comment can no longer think the software is talking to them.
2. **`src/app/company/profile/page.tsx:173`** (N-F44) — add `import { ORG_NAME } from "@/lib/org";` (**not currently imported in this file**), then:
   ```tsx
   description={`Manage your company information visible to the ${ORG_NAME} team.`}
   ```
3. **`src/app/company/documents/page.tsx:151`** (N-F44) — same import addition, then:
   ```tsx
   description={`Files shared with the ${ORG_NAME} team — cap tables, financials, legal documents, and more.`}
   ```
4. **`src/app/admin/diligence/page.tsx:265-266`** (N-F09) — title unchanged, description replaced verbatim:
   ```tsx
   <EmptyState
     icon={<Inbox className="h-10 w-10" />}
     title="No companies in due diligence"
     description="Nothing is waiting on you right now. Turn on due diligence when you add a company to route it into this queue."
   />
   ```
   This follows the N-F19 model in the register above: reassure first, instruct second.
5. **`src/lib/__tests__/org-naming.test.ts`** (new — N-C03 / N-FK2, JC-UI-D/E):
   ```ts
   // Part 32, WS81 — the same mistake was made independently in three files:
   // "the Molly team" where "the DFS team" was meant. ORG_NAME exists for
   // exactly this and is used correctly in ~40 other places. This guard is
   // deliberately narrow: it matches the literal "Molly team" only, NOT bare
   // "Molly" — there are 44 legitimate product-name uses in src/ (page titles,
   // email subjects, "Sign in to your Molly account") and a broader rule would
   // be permanently suppressed and therefore useless.
   //
   // NOTE: this guard CANNOT catch the third case it was written for —
   // <Badge variant="info">Molly</Badge> (updates/[id]/page.tsx:762) is a bare
   // product name in a staff-attribution slot. That class needs a human reviewer.
   ```
   Walk `src/**/*.{ts,tsx}` with `fs.readdirSync` (no new dependency — follow whatever traversal the existing `src/lib/__tests__/` files use, or a small local recursive helper) and assert no file contains `"Molly team"` case-insensitively. Failure message points at `src/lib/org.ts`.

**Acceptance checklist:** `grep -rni "molly team" src/` returns **zero** hits; the new test fails if any of the three strings is reintroduced (verify by temporarily reverting one); both `company/` files import `ORG_NAME` and compile; the diligence empty state renders the new description; `npx vitest run` fully green.

**UX impact:** three founder-facing strings and one admin empty state read correctly instead of naming the software as a person. Strictly an improvement; no layout, control or flow change. **Cost impact:** none.

## WS82 — Layout & affordance micro-batch — ~0.5 day

**Goal.** Four small inconsistencies that individually don't justify a ticket and collectively make the app feel hand-built screen-by-screen.

**Covers:** N-F42, N-F20 / N-C05, N-F15 / N-F17b, N-F35.

**File-by-file steps:**

1. **`src/app/updates/new/page.tsx:306`** (N-F42) — `<option value="">Start from a template ▾</option>` → `<option value="">Start from a template</option>`. The browser draws the select's own chevron; the typed one is a second, misaligned arrow inside the option text. (Verified: the only `▾` in `src/`.)
2. **`src/app/admin/portfolio/[id]/page.tsx`** (N-F20 / N-C05) — move the "Record mark" form (`:757-784`) to sit **below** the `EmptyState` / marks list (`:786`), matching Contacts on the same page (`EmptyState` `:513`, form `:536`). **Convention, stated once for reuse: list-or-empty-state first, then the add-form below it.** **Leave Financing Rounds alone** — its form is in a modal (`:811`), which is a different, legitimate pattern.
3. **`src/app/admin/companies/page.tsx:240-247` and `src/app/admin/portfolio/page.tsx:493-499`** (N-F15 / N-F17b) — the permanently-visible CSV column instructions move behind `ComposerDisclosure` (`src/components/composer/composer-disclosure.tsx`), which is already used outside the composer at `src/components/admin/sync-panel.tsx:265`:
   ```tsx
   <ComposerDisclosure label="CSV format">
     <p className="text-sm text-muted-foreground">…existing copy, unchanged…</p>
   </ComposerDisclosure>
   ```
   Copy is not rewritten — this is placement only. CSV import is a rare secondary action; its instructions should not sit above the search bar an admin uses daily.
4. **`src/components/composer/composer-top-bar.tsx:65`** (N-F35) — the action group is `flex items-center gap-2` with **no** `flex-wrap`, inside a `flex-wrap` parent, so the buttons cannot wrap among themselves and get squeezed at 390px and below. Add `flex-wrap justify-end` to that group. **Verify at 360px, not just 390** — "Send test to me" (`src/app/admin/broadcasts/[id]/page.tsx:336`) is the longest label and the first to break. If wrapping alone still looks cramped, the component already has an `overflowItems` menu (`:23`, `:71-80`) and moving "Send test to me" into it below `sm:` is the sanctioned fallback — no new component needed.

**Acceptance checklist:** no `▾` remains in `src/`; the valuation-history section reads empty-state-then-form, matching Contacts, with Financing Rounds untouched; both CSV hints are collapsed by default and still fully readable when opened; the composer action row wraps cleanly at 360px and 390px with no horizontal overflow (per Part 6, measure at true device width rather than reading the code — the WS14.7 lesson); ≥`sm:` renders identically to today.

**UX impact:** additive/neutral. The one thing that *disappears* by default is the CSV instruction paragraph, which remains one click away on the same page — and both pages already carry a visible "Import CSV" button, so the affordance is not lost. Everything else is either invisible above `sm:` or a strict improvement. **Cost impact:** none.

## WS83 — Horizontal-scroll affordance for wide tables — ~0.5 day

**Goal.** Make a table that scrolls *look* like a table that scrolls. **N-F27 is a missing-affordance problem, not a missing-implementation one — `overflow-x-auto` is already there** (`src/app/admin/audit/page.tsx:50`), and this must not be re-triaged as "just add overflow-x-auto."

**Covers:** N-F27, N-F27b.

**File-by-file steps:**

1. **`src/components/ui/table.tsx:17-22`** (JC-UI-A/B) — the shared wrapper gains a pure-CSS right-edge fade, applied only when content actually overflows. No JS, no scroll listener, no client boundary:
   ```tsx
   <div
     className={cn(
       "overflow-x-auto rounded-md border border-border",
       // Right-edge fade signalling more content horizontally. Pure CSS via
       // background-attachment: local/scroll — the gradient is painted against
       // the scroll container, so it fades out on its own once you reach the
       // right edge. No JS, so this stays usable inside Server Components
       // (e.g. /admin/audit). Part 32, WS83 / JC-UI-B.
       "[background:linear-gradient(to_left,var(--color-bg),transparent)_right/24px_100%_no-repeat_local]",
       className
     )}
   >
   ```
   The implementer should confirm the exact `background-attachment: local` shorthand renders correctly in the arbitrary-value syntax; if it fights Tailwind's parser, move the three background declarations into a small named class in `globals.css` next to the existing `@layer base` block rather than fighting the escape syntax. Either is fine — the requirement is "no JavaScript", not "one Tailwind class".
2. **`src/app/admin/audit/page.tsx:50`** — replace the hand-rolled `<div className="overflow-x-auto rounded-xl border border-border bg-card">` + bare `<table>` with the shared `Table` primitive, passing a `tableClassName="min-w-[880px]"` (the primitive's documented per-page min-width knob, `table.tsx:11-14`). This both picks up the affordance and removes one of the ten independent `overflow-x-auto` sites.
3. **Mobile caption (N-F27b — the higher-priority viewport, since touch has no hover to hint with).** Below `sm:` only, render one line under the table:
   ```tsx
   <p className="mt-2 text-xs text-muted-foreground sm:hidden">Scroll horizontally to see all columns.</p>
   ```
   Put it in the `Table` primitive so every adopter gets it, guarded so it renders only when a `tableClassName` min-width was supplied (i.e. the page has declared itself wide).
4. **Regression-check the other eight `overflow-x-auto` sites** — `src/app/admin/page.tsx`, `src/app/admin/settings/orphaned-documents-panel.tsx`, `src/app/admin/updates/page.tsx`, `src/app/admin/portfolio/page.tsx`, `src/app/admin/funds/page.tsx`, `src/app/admin/funds/[id]/page.tsx`, `src/app/admin/companies/[id]/page.tsx`, `src/app/company/documents/page.tsx`. Those that already use `Table` inherit the fade for free; confirm none of them looks wrong with it, particularly `company/documents` (the only **founder-facing** one).

**Acceptance checklist:** `/admin/audit` at 1456px shows a visible right-edge fade while columns remain off-screen, and the fade is gone once scrolled fully right; same on mobile, plus the caption; the audit table uses the shared `Table` primitive; no client-component boundary was added to `/admin/audit` (it stays a Server Component); the founder documents table is checked at 375px and is not made worse; every other adopting table renders unchanged apart from the fade.

**UX impact:** additive affordance only — no column, row, control or behaviour changes, and nothing is hidden. One founder-facing table (`/company/documents`) gains the same hint, which is why step 4 exists. **Cost impact:** none (CSS).

## WS84 — Fix the dead chart tokens (F69; resolves N-F06) — ~0.4 day

**Goal.** Make both Recharts surfaces actually render in DFS colours. This is the one workstream in the Part fixing a genuine bug rather than a fidelity gap.

**File-by-file steps (JC-UI-G — replace with real tokens; do **not** back-fill shadcn aliases into `globals.css`):**

1. **`src/app/admin/page.tsx`** — seven substitutions:
   - `:310` `stroke="hsl(var(--border))"` → `stroke="var(--color-border)"`
   - `:313`, `:319` tick `fill: "hsl(var(--muted-foreground))"` → `fill: "var(--color-text-muted)"`
   - `:327-330` tooltip `border: "1px solid hsl(var(--border))"` → `var(--color-border)`; `background: "hsl(var(--background))"` → `var(--color-surface)` (a tooltip is a surface, not the page canvas — deliberate, not a transcription of the old name); `color: "hsl(var(--foreground))"` → `var(--color-text-primary)`
   - `:333` `<Bar … fill="hsl(var(--primary))" />` → `fill="var(--color-accent)"` ← **the invisible bars**
   - While here: the tooltip's `borderRadius: "6px"` (`:326`) contradicts the flat 0–2px corner system that `tailwind.config.ts:70-77` enforces everywhere else. Set it to `2px`.
2. **`src/components/ui/metric-chart.tsx`** — the same eight substitutions at `:45, 49, 55, 68, 69, 70, 76, 78`, with `stroke`/`dot.fill` → `var(--color-accent)`. **This one is founder-facing** — the metric chart on the founder metrics page and on company detail views. Check it against a company with real metric history, not just an empty one.
3. **Add a guard so this cannot silently recur.** A one-assertion Vitest test that greps `src/**/*.{ts,tsx}` for `hsl(var(--` and fails on any hit, with a comment naming the cause (shadcn-era variables that this project's token system never defined). Cheap, and it is the same shape as WS81's guard.

**Acceptance checklist:** `grep -rn "hsl(var(" src` returns **zero** hits; the `/admin` dashboard bar chart renders Sky-accent bars, Bone grid lines and readable muted tick labels against real data; the founder metric chart renders an accent line with visible dots; the `updatesByMonth.every(count === 0)` empty-state fallback at `:305-306` is **left exactly as it is** — it was verified correct and is not the bug; the new test fails if a `hsl(var(--…))` string is reintroduced.

**UX impact:** **two charts that currently render wrong start rendering right, one of them founder-facing.** Strictly corrective — no data, axis, scale, interaction or layout change; the same charts with visible colours. **Cost impact:** none.

## WS85 — One definition of "behind on updates" (D1) — ~0.75–1 day

**Goal.** Make the companies list and the dashboard agree, and make the badge mean something. **Unblocked — D1 is confirmed** (option B, neutral "No updates yet" badge); the steps below are written directly against it.

**Covers:** N-F14, N-F07, N-C02. **Implements:** D1.

**File-by-file steps:**

1. **`src/lib/update-cadence.ts`** (new) — lift `isCompanyOverdue()` and its three constants **verbatim** out of `src/app/api/admin/dashboard/route.ts:7-39`. Pure, DB-free, no imports from `@/lib/db`; the caller passes company age and published-update dates. Export a richer status alongside the existing boolean so both call sites are served by one rule:
   ```ts
   // Part 32, WS85 — ONE definition of "behind on updates". Lifted verbatim
   // from api/admin/dashboard/route.ts, which had the considered version
   // (30-day grace, min-3-updates, learned cadence over the last 5) while
   // admin/companies/page.tsx had a naive 90/30/null rule. F68: the two
   // could disagree about the same company on the same day.
   // Convention (Part 32, C02): danger/laterite = requires intervention.
   // A never-happened-yet state is neutral or info, NEVER danger.
   export type CadenceStatus = "NEW" | "CURRENT" | "AGING" | "BEHIND";
   export function isCompanyOverdue(c: { createdAt: Date; publishedUpdates: { sentAt: Date | null }[] }): boolean;
   export function cadenceStatus(c: { createdAt: Date; publishedUpdates: { sentAt: Date | null }[] }): CadenceStatus;
   ```
   `isCompanyOverdue` must stay **byte-identically behavioural** — the dashboard tile's number must not move as a side effect of this refactor. `cadenceStatus` maps: inside the grace period → `NEW`; overdue by the shared rule → `BEHIND`; else past ~⅔ of the learned cadence → `AGING`; else `CURRENT`.
2. **`src/lib/__tests__/update-cadence.test.ts`** (new) — synthetic fixtures only (`Acme`, `Northwind`; Part 27/28 discipline, and a cadence-test file is a tempting place to paste real portfolio data — it must not happen). Cases: a company inside the grace period with zero updates → `NEW` and `isCompanyOverdue === false`; past grace with fewer than three updates → `BEHIND`; a steady monthly cadence just met → `CURRENT`; the same cadence missed → `BEHIND`; a company with exactly three updates (the boundary); and an explicit regression test asserting `isCompanyOverdue` agrees with the pre-refactor implementation on a table of inputs.
3. **`src/app/api/admin/dashboard/route.ts`** — delete the local copy, import from the lib. `companiesOverdue` and `overdueCompanies` must be unchanged.
4. **`src/app/api/admin/companies/route.ts`** — the list endpoint must return what the badge now needs. Verify what it selects today; if it returns only `lastUpdateDate`, extend it to carry the company's `createdAt` and enough published-update dates for the cadence window (a `take: 5` on published updates ordered by `sentAt desc`), **as an additive field**. Do not change or remove any existing field.
5. **`src/app/admin/companies/page.tsx:42-49`** — `getUpdateStatus()` is deleted and replaced by `cadenceStatus()`, mapped to badges: `NEW` → `variant="info"`, **"No updates yet"** (**settled by D1 — this exact label, this exact variant; do not substitute "New" or drop the badge**); `CURRENT` → `success`, "Current"; `AGING` → `warning`, "Aging"; `BEHIND` → `danger`, "Behind".
6. **`src/app/admin/page.tsx:234-238`** (N-F07) — the "Companies Overdue" tile stops rendering in plain black. Give it the same semantic treatment the list badge uses for `BEHIND` (`text-destructive` when the count is greater than zero, muted when zero), so one fact has one colour on both screens.
7. **Write the C02 rule down** — D1 confirmed it, so add it to the "Protected patterns register" section above as part of this workstream, giving future call sites something to cite: *"danger/laterite is for a state requiring intervention; a brand-new, never-happened-yet state is neutral or info, never danger."*

**Acceptance checklist:** the dashboard's "Companies Overdue" number is **identical** before and after the refactor on real data (this is the regression that matters — check it first); a company created within the grace period with no updates shows a neutral badge, not red; a genuinely delinquent company still shows red on both screens; the two screens never disagree about the same company; `src/lib/update-cadence.ts` imports nothing from `@/lib/db`; `npx vitest run src/lib/__tests__/update-cadence.test.ts` green; all fixtures synthetic; no founder-facing surface changed.

**UX impact:** admin-only, and the visible change is that a red badge stops being applied to companies that have done nothing wrong. Every existing label an admin already recognises ("Current", "Aging") is preserved; only "No updates"→"No updates yet"/neutral and "Overdue"→"Behind" change. **Cost impact:** none (one `take: 5` include on an admin-only endpoint).

## WS86 — List-page search standard (D2) — ~1–1.25 day

**Goal.** Five admin list pages converge on the pattern the other four already use, and all nine end up identical. **Unblocked — D2 is confirmed** (universal, no row-count threshold, and the standardisation pass across all nine pages is part of the decision).

**Covers:** N-C01, N-F31, N-F31a, N-F31c. **Implements:** D2.

**File-by-file steps:**

1. Read the reference implementation first: `src/app/admin/updates/page.tsx` (N-F18, the most complete list pattern in the app) and `src/app/admin/companies/page.tsx:249-256` (the minimal one). Adopt the minimal one unless a page already has filters.
2. Add the same client-side search row — `<Input placeholder="Search …" value={search} onChange={…} />` plus a `filter()` over the loaded rows, no server round-trip — to: **`src/app/admin/funds/page.tsx`** (name), **`src/app/admin/reports/page.tsx`** (title + fund name), **`src/app/admin/lps/page.tsx`** (name + any email address — note Part 26: an LP has **many** `LpEmail` rows, so search all of them, not just the primary mirror), **`src/app/admin/links/page.tsx`** (label/recipient/company), **`src/app/admin/broadcasts/page.tsx`** (subject).
3. Standardise placement and wording across all nine list pages: the search row sits directly above the list and below any page-level notice or stat block; placeholder is `Search by <the thing>…`. Fix the existing four if they diverge.
4. Each page keeps its existing empty state for "no rows at all", and gains a distinct one for "no rows matched your search" — otherwise a filtered-to-nothing list reads as data loss. Reuse `EmptyState` with `title="No matches"`.

**Acceptance checklist:** all nine admin list pages have a search input in the same position with the same wording; searching is client-side and does not refetch; LP search matches on a **non-primary** email address (regression against Part 26's `LpEmail` model); a search matching nothing shows "No matches", not the page's empty-list state; clearing the box restores the full list; 375px clean (Part 6 pattern D — the search row must not push controls off-screen).

**UX impact:** additive on five pages, cosmetic-only on the four that already have search. Nothing is removed, no default filter is applied, and every list still renders complete on load. **Cost impact:** none (client-side filtering over already-loaded rows).

## WS87 — Audit Log `Details` column (D3) — ~0.5 day

**Goal.** Make the audit log's most useful column readable. **Unblocked — D3 is confirmed** (pretty-print in place, full object behind a native `<details>`; the per-action summary map is rejected and must not be built).

**Covers:** N-F28. **Implements:** D3. **Sequence after WS83**, which narrows the table and is the reason this column stops being the first casualty of a narrow viewport.

**File-by-file steps:**

1. **`src/app/admin/audit/page.tsx`** — replace `formatMetadata()`'s raw `JSON.stringify` with a small renderer producing `key: value · key: value` pairs, values truncated to a sane length, keys in mono and values in normal weight. Skip null/undefined entries.
2. Full detail moves behind a native `<details>` element (**no client component** — this page is a Server Component and should stay one, same reasoning as JC-UI-B), rendering the pretty-printed JSON on expand.
3. Nothing about `logAdminAction` or the stored metadata shape changes. The action string continues to render raw (`:70`) so future Parts can add new audit actions with no UI work — that property is deliberate and must be preserved.

**Acceptance checklist:** a `{"subject":"Test","companyCount":0}` row renders as readable pairs; the full object is one click away; the page remains a Server Component; rows with `null` metadata render "—" as today; no change to what is written to the `AuditLog` table; 375px clean.

**UX impact:** admin-only; strictly more readable, nothing removed (the raw object stays reachable). **Cost impact:** none.

## WS88 — Fork theming: give the LP-portal logo a config layer — ~0.25 day

**Goal.** Close the last brand touchpoint that a fork cannot change without editing a committed binary at a fixed path.

**Covers:** N-F40, N-FK3.

**File-by-file steps (JC-UI-F):**

1. **`src/lib/org.ts`** — add, in the file's existing documented style:
   ```ts
   /** Logo image shown in the LP portal header. Server-side only (the LP
    *  layout is a Server Component), so no NEXT_PUBLIC_ prefix and no rebuild
    *  needed to change it. Mirrors EMAIL_LOGO_PATH in src/lib/email.ts. */
   export const ORG_LOGO_PATH = process.env.ORG_LOGO_PATH || "/brand/dfs-logo-primary.png";
   ```
2. **`src/app/lp/layout.tsx:26`** — `src="/brand/dfs-logo-primary.png"` → `src={ORG_LOGO_PATH}`, importing it beside the existing `ORG_NAME` import at `:5`. `alt={ORG_NAME}` is already correct and stays. The `width={72} height={30}` attributes stay as-is; a fork supplying a different aspect ratio is a fork's problem to solve, and hard-coding a max-height instead would change DFS's own rendering (a UX regression on a live LP surface for a hypothetical benefit).
3. **`.env.example`** — add a commented `# ORG_LOGO_PATH="/brand/dfs-logo-primary.png"` line directly beside the existing `EMAIL_LOGO_PATH` entry at `:35`, so the two brand-asset knobs sit together.
4. **`README.md`** — in the fork-configuration section (wherever `NEXT_PUBLIC_ORG_NAME` and `EMAIL_LOGO_PATH` are documented), add `ORG_LOGO_PATH` with one sentence: a fork drops its own file in `public/brand/` and points this at it. **This is the deliverable that actually closes N-FK3** — the code change alone just moves the hardcode; the docs line is what means a fork does not have to discover the path by reading `lp/layout.tsx`.

**Acceptance checklist:** `/lp` renders the identical logo with `ORG_LOGO_PATH` unset (byte-identical DOM apart from the attribute source); setting the env var to another path in `public/brand/` swaps it with no rebuild; `grep -rn "dfs-logo-primary" src/` returns only the two **defaults** in `org.ts` and `email.ts`, no direct uses; README documents it beside the other fork knobs.

**UX impact:** **none** — the default is the current path, so every existing LP sees exactly what they see today. **Cost impact:** none (one env var, no service).

---

## Sequencing & handoff (Part 32)

- **Nothing is blocked. D1–D4 are confirmed and this Part requires no schema change, so WS80 can start immediately.**
- **Recommended order — by value, not by dependency** (all nine workstreams are mutually independent except the one constraint below): **WS80** (the public-facing share page, highest value) → **WS84** (the only real bug, and it reaches the founder app) → **WS81** → **WS82** → **WS83** → **WS87** → **WS85** → **WS86** → **WS88**.
- **The one ordering constraint: WS87 after WS83.** The scroll affordance is what stops the `Details` column being the first thing clipped; reformatting the column first would hide the symptom that motivates it.
- **D4 produces no workstream** — WS80 is the entirety of the login/signup change.
- **Hard file-level exclusion (F71): do not touch `src/app/api/updates/[id]/pdf/route.ts` or `src/lib/pdf.ts`.** The HIGH-severity IDOR on that route was fixed standalone and ahead of this Part (commit `39003e3`) and carries a new regression test. **F76** notes that `pdf.ts` is stuffed with exactly the off-brand colours WS80 removes — that is a deliberate deferral, not an oversight, and it is the one place a brand-fidelity pass is most likely to wander by accident.
- **Also for Joseph, two minutes, not an Alvin task (F75):** wire up the confidentiality pre-commit hook and create `.confidential-terms` locally — the Part 28 guardrail is currently installed nowhere and skipping every scan.
- **Total effort: ~4.25–4.9 days** (WS80 0.5 + WS81 0.25 + WS82 0.5 + WS83 0.5 + WS84 0.4 + WS85 0.75–1 + WS86 1–1.25 + WS87 0.5 + WS88 0.25). **No schema change** (JC-UI-H).
- **Splittable if the work spans sessions:** WS80 + WS84 + WS81 alone (~1.15 days) deliver the public-facing brand fix, the only real bug, and all three copy fixes — the highest-value third of the Part.

## Part 32 — decisions summary

| | Decision (locked 2026-09-02) | What it means for the implementer |
|---|---|---|
| **D1** (Q78) | Extract the already-shipped grace + learned-cadence rule out of `dashboard/route.ts:11-39` into a shared pure lib both admin screens call; a never-yet-updated company gets a **neutral `info` "No updates yet"**, never red | WS85. The label and variant are settled — do not substitute "New" or drop the badge. The dashboard's overdue count must be **identical** before and after the refactor; that is the regression to check first. Folding in `reminderFrequencyDays` (option C) is deferred, not rejected |
| **D2** (Q79) | **Every** admin list page gets a search row, unconditionally — no row-count threshold | WS86. Five pages to add, and the standardisation of placeholder wording and row position across **all nine** is part of the decision, not an extra. LP search must match non-primary `LpEmail` addresses (Part 26) |
| **D3** (Q80) | Pretty-print `Details` in place; full object behind a **native `<details>`** | WS87. The per-action summary map is **rejected** — the audit action is deliberately a free string, and a map would put a maintenance obligation on every future Part that logs anything. `/admin/audit` stays a Server Component |
| **D4** (Q81) | **Nothing** beyond WS80's token fixes on login/signup | **No workstream.** Do not add a Sky eyebrow, right-hand panel, quote or stat to `/login`, `/signup` or `/set-password`. Option B was offered and not taken |
| **Nosa N-F22 / N-F44 / N-F09** | Three copy fixes, exact replacement strings supplied | **DECIDED — folded into WS81 verbatim, no further copy work** |
| **N-F33** | Ochre "0 contacts" in the broadcast audience list | **DEFERRED** — transient symptom of an empty contacts table that Parts 30/31 just built the tools to fill; revisit with real data |
| **F71** | PDF-route IDOR | **FIXED outside this Part** (commit `39003e3`, verified in the tree). **No workstream here may touch `src/app/api/updates/[id]/pdf/route.ts` or `src/lib/pdf.ts`** |
| **F76** | The update-export HTML is a fourth off-brand surface | **DEFERRED to a follow-up after Part 32** — it needs literal hex (a detached document; `globals.css` variables do not reach it), which is a different fix from WS80's |

**Constraints honored:** **no schema change** (JC-UI-H — nothing in this Part touches `prisma/`); **no new cost line** (CSS, copy, one env var, two Vitest guards, client-side filtering — no service, no dependency, no cron, no new API call pattern); **no UX regression** — every change is corrective (WS80, WS84), additive (WS83, WS86), invisible by default (WS88), or a strictly better string (WS81). The three surfaces with external or founder audiences are handled explicitly: the **investor share link** gets a colour-only pass with its structure protected by N-F45; the **founder metric chart** and **founder documents table** are named as regression-check targets in WS84 and WS83; the **LP portal** default is byte-identical. **Zero LP-visible change.**

---
