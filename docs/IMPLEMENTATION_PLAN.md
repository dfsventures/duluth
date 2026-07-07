# Molly — Roadmap Review & Implementation Plan

_Prepared: 2026-07-03 · Reviewed against `ROADMAP.md` (last updated 2026-07-02)_

> **Status (2026-07-03, end of day): Parts 1–3 are complete.** All six workstreams (WS0–WS5) shipped to production the same day and were verified live on `molly.dfslab.net`. One bug beyond this plan was found during WS0's live verification: `/api/cron/reminders` was **also** blocked by the auth middleware itself (Vercel Cron requests carry no session, so every invocation was 307-redirected to `/login` before the route's `CRON_SECRET` check ran) — independent of, and stacked on, the GET/POST bug F1 describes. Fixed by adding `/api/cron` to the middleware public-path list (commit `b6cb846`); the route-level secret check remains the real gate, confirmed live (200 with secret, 401 without).
>
> **Part 4 (added later the same day)** contains the follow-up batch WS6–WS8, from a follow-up product review. **Shipped and verified on production 2026-07-03.**
>
> **Part 5 (added 2026-07-06)** is the plan for the P2 tier of `ROADMAP.md` (WS9–WS12, with Comment Threading explicitly deferred). **Shipped and verified on production 2026-07-06** — all four workstreams (WS9 → WS10 → WS11 → WS12) live on `molly.dfslab.net`.

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

> **Status (2026-07-07): WS15.1–WS15.3 shipped and verified live.** JC2 (diff-modal stacking) adopted as recommended. Quality gates (`typecheck`, `lint`, `test`, `build`) passed; no new lint errors. WS15.4 (device walk) was **not performed** — no code, and the implementing agent cannot render mobile layouts on a physical device; the checklist is handed to the user in the final report instead.

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

`ROADMAP.md` updated alongside this plan: a **Mobile-Width Layout Hardening** row added to P2 (pointing here), and the P3 **Mobile-Optimized Update Flow** row annotated to reconcile the two — that item is a founder-flow *interaction redesign* (simplified metric entry, mobile-first composer); this Part is app-wide *layout correctness* at phone widths and neither replaces nor depends on it. When WS14/WS15 ship, fold the row into "Existing Features" per the file's convention.
