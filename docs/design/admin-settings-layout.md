# Admin Settings: restructure spec

Status: PROPOSAL for Joseph's reaction. No app code changed. Author: Nisat. Date: 2026-10-09.
Target: `/admin/settings` (`src/app/admin/settings/page.tsx` plus panels in `src/app/admin/settings/`).
Implementer: Alvin, after Joseph approves a direction.

## 1. The problem in one paragraph

Settings is a single 672px-wide column of five equal-weight cards (Email, Storage, Reminders, Integrations, Digest Recipients). Only one thing on it is something an admin does regularly: choose who gets the weekly digest. Everything else is setup-once or diagnostic, yet it is stacked above that one useful control, so the thing people come for is the last thing on the page, below ~250 words of reference prose. Every card carries the same icon tile and the same weight, so nothing signals "this is the part you use".

## 2. Inventory

Frequency key: ROUTINE (touched during normal operation), SETUP (configured once, revisit on infra change), DIAG (opened when something seems broken), REF (read-only reference, nobody acts on it).

| # | Section (today's order) | What it does | Component / source | Who | Frequency | Notes |
|---|---|---|---|---|---|---|
| 1 | Email: "Emails sent by Molly" list | Static prose list of 6 email types and recipients | inline in `page.tsx` L68-90 | Admin curious who gets what | REF | Stale: lists 6 types, `email.ts` has ~10+ templates (invites, diligence invite, broadcasts, weekly digest are missing). Interpolates `TEAM_EMAIL` (F113). |
| 2 | Email: missing-key warning | Warns when `RESEND_API_KEY` unset | `EmailSettingsPanel` | Admin at setup | SETUP (only visible when broken) | Good pattern, keep. |
| 3 | Email: "Sending from" line | Shows `FROM` from `email.ts` | `EmailSettingsPanel` | Admin | REF | |
| 4 | Email: Send Test Email | POST `/api/admin/test-email` | `EmailSettingsPanel` | Admin | DIAG | |
| 5 | Storage: upload-failure banner | 7-day `DOCUMENT_UPLOAD_FAILED` count, links to `/admin/audit`; renders only when > 0 | `StorageSettingsPanel` prop from `page.tsx` | Admin | DIAG, but should be ambient | This is the only alert on the page. It is currently hidden mid-page. |
| 6 | Storage: Send Test Upload | Presign, PUT from browser, HEAD-verify, delete (credentials + CORS). Referenced by SETUP.md and the R2 CORS warning in memory | `StorageSettingsPanel` | Admin after domain/bucket change | DIAG | Must stay findable by name. |
| 7 | Storage: Orphaned documents scan + delete list | Scans DB rows with no object; per-row delete | `OrphanedDocumentsPanel` | Admin | DIAG (rare) | Table can get long. |
| 8 | Reminders | Prose: daily 9:00 UTC cron, per-company cadence lives elsewhere, `CRON_SECRET` Configured/Not set | inline L121-139 | Admin | REF | The only actionable fact is "CRON_SECRET not set". No control here. |
| 9 | Integrations: Granola | Three env-var statuses, webhook URL to register, key-type guidance, last intake status + "Open Intake" link | inline L152-184 | Admin at setup; later glance | SETUP then REF | Webhook URL is referenced by SETUP.md L158. |
| 10 | Integrations: Slack | One env-var status, one-line explanation | inline L186-190 | Admin at setup | SETUP | |
| 11 | Integrations: Send test post | POST `/api/admin/integrations/slack/test`; disabled when unconfigured | `SlackTestPanel` | Admin | DIAG | |
| 12 | Weekly Digest Recipients | Per-admin toggles (`receivesDigest`) plus extra external recipient emails, add/remove | `DigestRecipientsPanel` (client-fetches `/api/admin/users`, `/api/admin/digest-recipients`) | Admin | ROUTINE (the only one) | Currently last on the page. |

Not on this page (do not move, but note so nobody hunts for them): the fund-metrics sheet sync (`FundMetricsSyncPanel`) and the original sheet sync (`SyncPanel`) live on `/admin/funds`; update templates (`TemplatesPanel`) live on `/admin/updates`. The inventory request mentioned fund metrics sync under Settings; it is not there and should stay with the funds it syncs.

Totals: 1 routine item, 6 diagnostic/setup controls, 3 reference blocks. Roughly 80% of the page is reference or diagnostic.

## 3. Proposed information architecture

One page, a status strip, then three URL-addressable tabs. Ordered by how often people come for them.

```
Settings
Platform configuration and diagnostics.

[ System status strip: one line per subsystem, dot + label + state ]

 EMAIL & DIGEST  |  STORAGE  |  INTEGRATIONS
```

### 3.1 System status strip (new, above the tabs, always visible)

A single bordered block (1px Bone border, no fill, 0 radius) with five rows laid out as a 2-column grid on desktop and a single column at 375px. Each row: 8px square marker (not round: flat system) in Acacia (ok), Ochre (attention), Laterite (broken), then label, then short state text. Each row is a link to the tab that fixes it.

| Row | Source | States |
|---|---|---|
| Email (Resend) | `RESEND_API_KEY` presence | Configured / Not set (Ochre) |
| Cron secret | `CRON_SECRET` presence | Configured / Not set (Ochre) |
| Storage uploads | `uploadFailureCount` | "No failures in 7 days" / "N failures in 7 days" (Ochre, links to Storage tab) |
| Granola intake | `granolaOn` and `lastIntake` | Not configured (neutral grey, not Ochre, it is optional) / "Last intake: status, date" |
| Slack digest post | `slackConfigured` | Not configured (neutral) / Configured |

Rules: optional integrations show a neutral marker when unset, never Ochre. Ochre/Laterite is reserved for "a thing you need is missing or broken". When everything is healthy the strip is quiet; when not, the eye lands on the one Ochre row. This replaces the Reminders card entirely (its only live fact, CRON_SECRET, becomes a row) and promotes the upload-failure alert from mid-page to the top.

The strip is computed from data `page.tsx` already loads (env presence, failure count, last intake). All env reads stay server-side and values are never rendered (presence only), same as today. Note the Granola last-intake query and the failure-count query now run on every tab because the strip needs them; both are cheap single-row/count queries.

### 3.2 Tab 1: Email & digest (default; `?tab=email` or no param)

Order inside the tab (top to bottom):
1. **Weekly digest recipients** (`DigestRecipientsPanel`, unchanged). Heading-level section, first, because it is the only routine task.
2. **Outgoing email**: "Sending from" line, `RESEND_API_KEY` missing warning (unchanged), Send Test Email button (`EmailSettingsPanel`, unchanged).
3. **Update reminders** (new compact replacement for the Reminders card): two sentences of copy, no status (status lives in the strip): "Runs daily at 9:00 AM UTC. Cadence is set per company on its detail page." plain text link "Open companies" to `/admin/companies`.
4. **Emails sent by Molly**: collapsed `<details>` disclosure, closed by default. Summary text: "Which emails does Molly send? (6)". Content is the current list, with the team inbox described by role, not address (see section 6). Optional improvement for Alvin: reconcile the list against `src/lib/email.ts` exports and add missing templates; flag to Joseph rather than guessing the wording.

### 3.3 Tab 2: Storage (`?tab=storage`)

1. Upload-failure banner (unchanged component behavior, still renders only when count > 0). Also appears in the status strip; here it sits directly above the button that diagnoses it.
2. Send Test Upload (`StorageSettingsPanel`, unchanged). Section title "Upload health check".
3. **Orphaned documents**: section title plus one-line description, then the scan button and results (`OrphanedDocumentsPanel`, unchanged). Results table keeps its own `overflow-x-auto`. Not collapsed: it is action-oriented and already empty until scanned.

### 3.4 Tab 3: Integrations (`?tab=integrations`)

Two sub-sections separated by a hairline, not nested cards:
1. **Granola (call intake)**: a definition-style status list (three env vars, each with Configured/Not set), then "Last intake" line with "Open Intake" link (`/admin/board?tab=intake`, unchanged, shown only when `granolaOn`).
   - Webhook URL: show in a visible, selectable, copy-friendly block (it is the thing SETUP.md tells people to come here to copy). Keep `select-all break-all font-mono`.
   - Key-type guidance (personal vs workspace key): collapse into `<details>` "Which API key should I use?" closed by default. It is read once.
2. **Slack (digest post)**: one status row, one-line explanation, Send test post button (`SlackTestPanel`, unchanged).

Env var names (`GRANOLA_API_KEY`, etc.) stay visible as mono text because an implementer or the owner needs to know exactly which variable to set. This is reference content, but short, so it earns its place without a disclosure.

## 4. Tab mechanics (URL-addressable)

Recommendation: server-rendered tabs driven by `searchParams`, not Radix state.

- `page.tsx` is already a Server Component. Accept `{ searchParams }: { searchParams: { tab?: string } }`, normalize with `const TABS = ["email","storage","integrations"] as const; const tab = TABS.includes(sp.tab) ? sp.tab : "email"`.
- Render the tab strip as `<nav aria-label="Settings sections">` of `next/link` elements (`href="/admin/settings?tab=storage"`, `scroll={false}`, `aria-current="page"` on the active one). Each tab is a real link: back button works, copying the URL deep-links, and no client wrapper is needed, so the panels stay exactly as they are.
- Why not Radix `Tabs.Root` as on the board: the board needs client state because tabs swap client-fetched data without navigation. Here every tab is static server content with a few self-contained client panels; links are less code, free deep-linking, and the server renders only the active tab (skips the orphan/digest JS for tabs not shown). Radix remains an acceptable alternative if Joseph prefers visual parity of behavior; the markup/classes below are identical either way.
- Tab strip classes: copy the board's exactly so the two pages feel like siblings: container `mb-6 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]`; each tab `shrink-0 border-b-2 border-transparent px-1 pb-2.5 pt-1 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground`; active adds `border-foreground text-foreground`. Labels: "Email & digest", "Storage", "Integrations".
- Unknown or missing `?tab=` falls back to `email`. Do not 404.
- Status strip row links use the same hrefs.

## 5. Visual treatment and the brand system

The current page breaks the system in two small ways, worth fixing as part of this change:
- Cards use `rounded-xl bg-card p-6` and icon tiles use `rounded-lg bg-primary-50`. The brand is flat, 0-2px corners. Replace card chrome with hairline-ruled sections: no card background, no radius, `border-t border-border pt-6` between sections. The Paper ground is the surface.
- Drop the per-section icon tiles. Seven decorative icon tiles are the main source of the "cluttered" feeling and carry no information the heading does not. Keep icons only inside buttons and status messages (already the case).
- Section heading: `font-display text-sm font-semibold` plus a one-line `text-xs text-muted-foreground` description, matching `PageHeader` scale. Sections inside a tab are separated by whitespace and a top hairline, not boxes.
- Disclosures: native `<details>`/`<summary>` (already the house pattern from the audit-log work, Part 32). Summary styled as `font-mono text-xs uppercase tracking-widest text-muted-foreground`, with a rotating chevron (`group-open:rotate-90`). Content inset with `border-l border-border pl-4`.
- Status marker: 8x8 square `bg-acacia` / `bg-ochre` / `bg-laterite` / `bg-border` (neutral). Always paired with text, never colour alone.
- Container: widen from `max-w-2xl` to `max-w-3xl` so the status strip's two columns breathe on desktop. Body text stays at the measure already used.
- Where `bg-muted/50` reference panels exist today (L68, L121, L152, L186) replace with plain text on Paper using a definition-list layout (`dl` with `grid-cols-[auto_1fr] gap-x-4 gap-y-1`) so env-var rows align instead of reading as a paragraph.

Colour roles: Acacia = healthy, Ochre = needs attention (required thing missing, or failures), Laterite = errors from a button action, neutral Bone/muted = optional and off. Existing warning banners (`border-ochre/30 bg-ochre/10`) stay as they are; the brand notes from the latest commit say notice body text uses foreground, not ochre, and those panels already do.

## 6. F113: hardcoded team email (flag only; remove from UI)

Flagged, not fixed here: `src/app/admin/settings/page.tsx` line 30 hardcodes a real team member's address as the `TEAM_EMAIL` fallback and prints it in the "Emails sent by Molly" list (lines 75 and 79). The same fallback pattern is also at `src/lib/email.ts:12`, which is the value actually used to send, so removing the UI display does not remove the exposure; that file is outside this design pass and remains an F113 item for Felix/Alvin.

Design requirement for this restructure:
- The Settings UI must not display any literal address. In the "Emails sent by Molly" list, replace the address span with the role: "to the team inbox (set by the `TEAM_EMAIL` environment variable)".
- Delete the `teamEmail` constant from `page.tsx` entirely. Do not import it from `email.ts`.
- Do not add a replacement display of the resolved address, masked or otherwise.
- Net effect of this part of the change: the confidentiality-hook finding at `page.tsx:20/30` disappears from this file when Alvin implements the restructure.

## 7. Mobile (375px, Part 6 patterns)

- Page keeps `AppShell` and `PageHeader` (already stack on phones).
- Tab strip: horizontally scrollable, `shrink-0` triggers, hidden scrollbar (board's pattern). Three short labels fit at 375px without scrolling in practice; scroll is the safety net.
- Status strip: single column below `sm`, two columns from `sm`. Each row is a full-width tap target with min height 44px (`py-3`).
- Buttons stay full-size controls; button + result message rows use `flex flex-wrap items-center gap-3` so success/error text wraps below the button instead of overflowing (the current `flex items-center gap-3` rows risk overflow with the long storage error messages; this is the one small change inside the existing panels: add `flex-wrap` to the result rows in `EmailSettingsPanel`, `StorageSettingsPanel`, `SlackTestPanel`).
- Webhook URL: `break-all` (already), on its own line, with `select-all`.
- Orphaned documents list: keep the existing `overflow-x-auto` wrapper (it is one of the eight regression-checked sites in the Part 6 notes).
- Digest recipients: toggles and the extra-email input row must stack (`flex-col sm:flex-row`) if they do not already; verify at 375px while there.
- Add `min-w-0` to any flex child holding long text (env var names, URLs).

## 8. Files and exact changes (for Alvin)

No schema change, no new dependency, no API change.

1. `src/app/admin/settings/page.tsx` (rewrite layout; keep auth guard and data loading)
   - Accept `searchParams`; compute `tab`.
   - Keep the three data loads (env flags, `uploadFailureCount`, `lastIntake`) at top; they feed the status strip.
   - Remove `teamEmail`, the `Status` helper may stay (reused in Integrations) or move into a small shared file.
   - Remove the icon imports (`Mail`, `Bell`, `BookOpen`, `HardDrive`, `Plug`) and all card/icon-tile wrappers.
   - Render: `PageHeader`, `<SettingsStatusStrip .../>`, tab nav, then one of three tab bodies.
   - Keep `max-w-` on the wrapper (change to `max-w-3xl`).
2. New `src/app/admin/settings/settings-status-strip.tsx` (server component, no state). Props: `{ resendOn: boolean; cronOn: boolean; uploadFailureCount: number; granola: { on: boolean; last: {status: string; createdAt: Date} | null }; slackOn: boolean }`. Presence booleans only, no values.
3. New `src/app/admin/settings/settings-tabs.tsx` (server component): the link-based tab nav, props `{ active: "email"|"storage"|"integrations" }`, exports the `SETTINGS_TABS` constant so the strip and page share hrefs.
4. New (optional, small) `src/app/admin/settings/disclosure.tsx`: wrapper around `<details>` with the styling from section 5, used for "Emails sent by Molly" and the Granola key guidance. Or inline the markup twice; either is fine.
5. Unchanged logic, small class tweaks only: `email-settings-panel.tsx`, `storage-settings-panel.tsx`, `slack-test-panel.tsx` (add `flex-wrap` to result rows). `digest-recipients-panel.tsx` and `orphaned-documents-panel.tsx`: wrapper only, verify 375px.
6. Docs to update in the same change:
   - `SETUP.md` L100 and L110: `/admin/settings` becomes `/admin/settings?tab=storage` ("Storage" tab) in both places.
   - `SETUP.md` L158: "the URL shown on the Settings page" becomes "shown on Settings, Integrations tab (`/admin/settings?tab=integrations`)".
   - `ROADMAP.md`: add a new additive note line only. Do not edit existing status lines (they contain blocklisted terms).
   - `docs/IMPLEMENTATION_PLAN.md`: historical; do not rewrite. Optionally add a short pointer to this doc.
   - Memory/board per the end-of-session convention.
7. `src/components/layout/sidebar.tsx` L111: no change (links to `/admin/settings`, which lands on the default tab).
8. Tests: add a small unit test for the tab normalizer if it is extracted as a pure function (`normalizeSettingsTab(raw?: string)`); `route-access.test.ts` needs no change (path unchanged, only query added; `decideRoute` is passed the path and query-less cases still hold).

## 9. Deep links and references to preserve

| Reference | Where | Today | After |
|---|---|---|---|
| Sidebar "Settings" | `src/components/layout/sidebar.tsx` L111 | `/admin/settings` | unchanged, lands on Email & digest |
| "Send Test Upload" instructions (x2) | `SETUP.md` L100, L110 | `/admin/settings` | `/admin/settings?tab=storage` |
| Granola webhook URL | `SETUP.md` L158 | "the Settings page" | `/admin/settings?tab=integrations` |
| Storage failure banner links to audit | `StorageSettingsPanel` | `/admin/audit` | unchanged |
| "Open Intake" from Settings to the board | `page.tsx` L178 | `/admin/board?tab=intake` | unchanged, now inside Integrations tab. (The board does not link back to Settings; the reverse direction in the brief is the existing outbound link.) |
| Route guard test | `route-access.test.ts` L127 | path-only | unchanged |
| R2 CORS reminder, "Send Test Email" in docs/memory | `docs/IMPLEMENTATION_PLAN.md`, memory | prose | still true: both buttons keep their exact labels ("Send Test Upload", "Send Test Email") and still exist on Settings |
| Anchors | none exist (`grep` found no `#section` links) | n/a | n/a |

Because any bare `/admin/settings` still works and the button labels are unchanged, nothing breaks if a link is missed.

## 10. What Joseph will notice

- Opening Settings, the first thing you see is the weekly digest recipients, not a paragraph about email types.
- A compact status strip at the very top tells you in five lines whether anything is wrong. When all is fine it is calm; if uploads are failing or a key is missing, one line turns amber and takes you straight to the fix.
- Three tabs (Email & digest, Storage, Integrations) instead of one long page. Same tab look as the Team Board.
- The Reminders card is gone; its one live fact (cron secret) moved into the status strip and its explanation became two sentences.
- "Emails sent by Molly" and the Granola key-type guidance are folded away behind a "Show" line.
- The cards, rounded corners and seven icon tiles are gone; sections are ruled by thin lines on the Paper background, matching the rest of the brand.
- No email address appears anywhere on the page any more (the team inbox is described by role).
- Every button and its label is unchanged; nothing was removed, only regrouped. Existing bookmarks to `/admin/settings` still work.
- Open for Joseph: (a) is Email & digest the right default tab; (b) do you want the "Emails sent by Molly" list brought up to date (it names 6 of the ~10+ emails Molly sends), which is a content task, not layout; (c) the same hardcoded address also lives in `src/lib/email.ts` (F113), untouched here.
