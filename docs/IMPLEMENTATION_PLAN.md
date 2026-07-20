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

## WS26 — Derived metrics engine, admin-only (~1.5–2 days)

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

## WS27 — Google Sheets one-way sync + staleness affordances (~2.5–3 days) — gated, ships LAST

**Goal:** the Deals sheet becomes a recurring one-way input (Q22-B): weekly cron + manual "Sync now", diff-first with a persistent run/diff surface at `/admin/sync`, sheet-owned fields read-only while enabled, staleness banner on publish (Q27). Entirely env-gated (ground rule 4).

**Gates (all three, before the first line of code):** (1) the team has added the stable **ID column** to the Deals sheet and backfilled it for all 76 rows (Q26); (2) a Google Cloud service account exists, the sheet is shared with its email read-only, and `GOOGLE_SA_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` / `SHEETS_SPREADSHEET_ID` are set in Vercel (user provisions; names-only in `.env.example`); (3) the new go-forward columns for round size / ownership are named and positioned (Q24 — sync maps them to `FinancingRound.raisedUsd` / `Deal.ownershipPct` when present, skips them cleanly when absent).

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

### WS27.2 `src/lib/sheets.ts` — env gate + zero-dep client (JC15)

`sheetsSyncEnabled()` = all three env vars present (the single switch every UI/route checks); `getSheetRows()` = SA-JWT → token → `values.get` on the Deals range; returns raw string rows. ~60 lines; scope `spreadsheets.readonly`.

### WS27.3 `src/lib/sheet-sync.ts` — pure diff engine + tests

`computeSheetDiff(sheetRows, dbDeals, knownFunds, knownCompanies)` → `{ creates, updates: [{ sheetRowId, field, from, to }...], newCompanies, errors: { duplicateIds, missingIds, unknownVehicles, badCells } }`. Carries the F17 lessons as code: Deals-sheet layout (header row 15, cols C–N + the new ID/round-size/ownership columns), `"Follow-On"` literal, the `=TODAY()` as-of column ignored, free-text instruments preserved. Unit-tested on synthetic rows (ground rule 1) including: duplicate ID → error not mutation; reordered rows → zero diff (identity is the ID, not position); a valuation change → one field-level update.

`applySheetDiff(diff, actor)` — per JC19 never destructive: creates deals (+ exact-name `PortfolioCompany` auto-creates, flagged), applies field updates; a `Current Valuation` change writes `ValuationMark { source: "SHEET" }` + JC16 fan-out + `DEAL_UPDATED` audit metadata, all in a transaction per company; unknown vehicles/missing IDs stay in the report. Writes the `SheetSyncRun` row (status, summary) win or lose.

### WS27.4 Routes

- `GET+POST /api/cron/sheets-sync` — alerts-cron skeleton (shared `CRON_SECRET` handler); no-ops with a logged skip when `!sheetsSyncEnabled()`. `vercel.json` gains `{ "path": "/api/cron/sheets-sync", "schedule": "0 8 * * 1" }` (weekly, Monday 08:00 UTC — before the 09:00 daily crons). Audit actor per JC20.
- `POST /api/admin/sheets-sync` — `requireAdmin`; body `{ dryRun?: boolean }`; dry-run computes + stores the diff (`trigger: "DRY_RUN"`) without applying — the preview affordance; returns the run id + summary counts.

### WS27.5 Read-only enforcement (Q22-B/Q26) — the transition contract

When `sheetsSyncEnabled()` **and** `deal.sheetRowId != null`: `api/admin/deals/[id]` PATCH rejects sheet-owned fields (`investmentType`, `dealDate`, `amountUsd`, `instrument`, `entryValuation`, `currentValuation`, `notes`) with 409 "This deal is synced from the tracker sheet — edit it there; changes arrive on the next sync." and DELETE 409s likewise; `roundId`/`convertedInRoundId`/`ownershipPct` (ledger-side, WS25) stay editable. Marks POST (WS25.1) similarly 409s for companies whose deals are all sheet-synced (valuations are sheet-owned). UI: fund-page inline valuation edit and the deal edit/delete buttons are replaced by a muted "synced from sheet" chip for such deals. **Deals without `sheetRowId` (manually created — e.g. a future fund not in the sheet) keep full CRUD, and forks with sync disabled see zero change** (ground rule 4 — this conditional is the no-UX-regression proof).

### WS27.6 `/admin/sync` page + Q27 publish affordance

- `/admin/sync` (sidebar item, rendered only when enabled): status header (last successful run, next cron slot), "Sync now" + "Preview changes (dry run)" buttons, run-history table (Pattern A), expandable latest-diff detail (field-level old→new rows, new companies, error list).
- Publish confirm (`admin/reports/[id]/page.tsx`, the existing `confirmPublish` dialog): when enabled, a line "Portfolio data last synced {date} ({n} days ago)" — `text-ochre` when >7 days or never — with an inline "Sync now" button that runs the manual sync and refreshes the preview numbers before the admin confirms (Q27). Absent entirely when sync is disabled.

### WS27.7 Docs + bookkeeping

`SETUP.md`: an optional "Google Sheets ingestion" section (SA creation, share-the-sheet, the three env vars, the ID-column contract, explicit "skip this entirely if you don't use Sheets"). `.env.example`: the three names with placeholder values. `ROADMAP.md` per the Part 10 bookkeeping note below.

**WS27 acceptance checklist**
- [ ] `sheet-sync.test.ts` green (synthetic rows: reorder-invariance, duplicate-ID error, field-level valuation diff)
- [ ] **Fork story (ground rule 4):** with the three env vars absent on a preview deploy — cron route 200-no-ops, `/admin/sync` nav absent, publish dialog banner absent, all deals fully editable (byte-identical to pre-WS27 behavior)
- [ ] Live with creds: dry-run against the real sheet → diff of 0 changes after the team's ID-column backfill (or exactly the expected deltas); "Sync now" applies; run row + audit rows visible; `curl` cron route with `CRON_SECRET` → 200, without → 401
- [ ] Edit a real sheet valuation → manual sync → `ValuationMark(source: "SHEET")` created, deals fan-out updated, `/admin/audit` shows the change, next report *draft preview* reflects it while an already-published report's frozen card does not (ground rule 2 proof)
- [ ] Synced deal PATCH on a sheet-owned field → 409 with the pointer message; `ownershipPct` PATCH on the same deal → 200; a manually-created deal keeps full CRUD
- [ ] Publish confirm shows the staleness line; inline Sync now refreshes it; >7-day staleness renders the warning tint (backdate a run row to verify)
- [ ] No spreadsheet ID/valuations in any commit, PR body, or client bundle (grep the build output for the env names)
- [ ] `npm run typecheck && npm run lint && npm test` green

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
