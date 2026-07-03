# Molly — Roadmap Review & Implementation Plan

_Prepared: 2026-07-03 · Reviewed against `ROADMAP.md` (last updated 2026-07-02)_

> **Status (2026-07-03, end of day): Parts 1–3 are complete.** All six workstreams (WS0–WS5) shipped to production the same day and were verified live on `molly.dfslab.net`. One bug beyond this plan was found during WS0's live verification: `/api/cron/reminders` was **also** blocked by the auth middleware itself (Vercel Cron requests carry no session, so every invocation was 307-redirected to `/login` before the route's `CRON_SECRET` check ran) — independent of, and stacked on, the GET/POST bug F1 describes. Fixed by adding `/api/cron` to the middleware public-path list (commit `b6cb846`); the route-level secret check remains the real gate, confirmed live (200 with secret, 401 without).
>
> **Part 4 (added later the same day)** contains the next approved batch: WS6–WS8, from a follow-up product review. These are planned, not yet implemented.

This document is the output of a full codebase-vs-roadmap review. It has four parts:

1. **Review findings** — where the code and the roadmap agree, where they drift, and issues found during review that the roadmap doesn't know about yet.
2. **Implementation plan** — step-by-step workstreams for all P0 and P1 items (plus a small bug-fix/hygiene workstream), written so a junior engineer can execute them without further design decisions. P2/P3 get recommendations only.
3. **P2/P3 recommendations** — sketches only.
4. **Follow-up batch (WS6–WS8)** — homepage login CTA consolidation, admin provider management + real vetting, and a cross-portfolio updates page for admins.

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

## WS7 — Admin provider management + real vetting (1–1.5 days)

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

## WS8 — Cross-portfolio updates page for admins (1 day)

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
