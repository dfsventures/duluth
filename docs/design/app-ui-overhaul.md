# Molly UI/UX overhaul: proposal

Status: PROPOSAL for Joseph's decision. No product code changed. Author: Nisat. Date: 2026-10-10.
Implementer: Alvin, phase by phase, after Joseph picks a scope (section 9).
**Decided 2026-10-10 (Joseph): Direction A+** (decision 13): A's square 1-2px corners and mono-caps primary button, plus B's tinted status/stage/column colour pairs (11.1) and the soft `float` elevation on floating layers only. Scope and the other open decisions are still pending.
Mockup (interactive, before and after of the companies list, company detail and Team Board): https://claude.ai/artifact/QAQugTLN61T3FVkETz6EhB
All names in this doc and the mockup are synthetic (AcmeHQ, Jane Founder, Sam Partner).

Method note: no running app was available. Everything below is read from code (`src/app/**`, `src/components/**`, `globals.css`, `tailwind.config.ts`). Where I describe a screen I did not read line by line (company detail, founder dashboard), I say so.

---

## 1. Summary

Molly is not ugly. The brand foundation is good and should stay: Paper and Bone surfaces, Obsidian text, Sky accent, flat 0-2px corners, mono uppercase labels. What makes it feel dated is not the palette. It is **how it behaves**:

1. It tells you things went wrong or right with browser dialogs and inline banners. 19 `window.confirm`/`alert` calls, zero toasts.
2. Pages load by flashing "Loading..." (34 sites, zero `loading.tsx`, only ~10 files with a skeleton), then pop in.
3. Lists are walls of boxed cards (266 `<Card>` uses) where a dense, sortable table would let you scan ten times faster.
4. Everything animates all the time, so nothing animation actually says anything.
5. There is no way to move through it fast: no search, no shortcuts, a 17-item sidebar, tabs that are not in the URL.
6. Numbers (the whole product is numbers) are set in proportional figures: `tabular-nums` is used zero times.

"Modern" here does not mean rounder, softer, or gradient-y. The brand is deliberately flat and editorial, and that is a strength: it already looks unlike every default SaaS template. Modern means **dense, fast, keyboard-friendly, and honest about state**: the interface acknowledges every action, never makes you wait blind, and uses motion only to show what changed.

Recommended scope: phases 1 to 4 (about 3 to 4 weeks of Alvin time) get roughly 80% of the perceived modernity. Phases 5 to 7 are polish and structure and can be cherry-picked.

---

## 2. Assumptions (flagged, since Joseph was not available)

1. **Typography is Space Grotesk (display), IBM Plex Sans (body), JetBrains Mono (labels).** The brief said Archivo. The code (`src/app/layout.tsx`) and the brand skill both say otherwise. I am designing against what ships. If Archivo is a planned brand change, that is a separate decision (Decision 8), not folded into this.
2. **Light theme only.** The brand skill and the Part 37 spec commit to light. No dark mode in this proposal. Tokens are structured so one could be added later.
3. **Admins are daily users on desktop; founders are occasional users, often on a phone; LPs read a few reports a year.** So density and keyboard speed go to admin; clarity and touch targets go to founder and LP.
4. **Scale:** tens of companies, hundreds of deals/cashflows, a handful of admins. Not thousands of rows. That means client-side sort and filter is fine; no server-side table engine.
5. **No new infrastructure.** New dependencies are limited to ones I list as decisions (a toast layer uses the already-installed `@radix-ui/react-toast`; a command palette suggests `cmdk`; a data cache suggests `swr`).
6. **Part 37 decision Q94 stands: no drag-and-drop library.** The board work uses native HTML5 drag, which the board already uses at column level.
7. **Production safety:** every phase ships independently, behind no flags, and changes presentation and interaction only. No schema or API changes in phases 1 to 5.

---

## 3. What feels dated today (with references)

| # | Symptom | Where | Why it reads as dated |
|---|---|---|---|
| D1 | **Native `confirm()`/`alert()` for destructive actions** | 19 calls across `admin/lps/page.tsx`, `admin/funds/[id]/page.tsx`, `admin/portfolio/[id]/page.tsx`, `admin/providers`, `admin/reports/*`, `admin/broadcasts/*`, `updates/new`, `updates/[id]`, `planner/*`, `ui/rich-editor.tsx`, `admin/settings/orphaned-documents-panel.tsx`, `components/admin/board/card-dialog.tsx` | OS-chrome dialogs break the brand, can't explain consequences, can't be styled, and are blocked in some embedded views. |
| D2 | **No toast or success layer** | `@radix-ui/react-toast` is in `package.json` and imported nowhere. Success is shown by inline `setMessage`/`setSuccess` banners (e.g. `admin/companies/page.tsx` import result) | Feedback is positional and shoves layout. Quick actions (Remind, Dismiss) give no confirmation at all (`admin/page.tsx` `sendReminder` only flips the "Last reminded" cell). |
| D3 | **Blind loading** | 34 "Loading..." strings; zero `loading.tsx`; ~10 files use `animate-pulse` rows; 92 `useEffect` fetches in `src/app`. Login fallback is literally the word "Loading..." (`login/page.tsx`) | Screens go blank, then pop. No layout reservation, so content jumps. |
| D4 | **Card walls instead of tables** | `admin/companies/page.tsx` renders 3-up cards with five lines each; `admin/page.tsx` KPI row is four identical icon-plus-number cards | A list of 50 companies cannot be sorted, scanned for "who is behind", or compared. Cards waste the 1152px content width. |
| D5 | **Table primitive is thin, and not used everywhere** | `ui/table.tsx` has sticky head and sort, but no numeric alignment, no density, no row actions, no empty/loading states. Raw `<table>` still hand-built in `admin/page.tsx` (Metric Alerts, Overdue) and `admin/companies/[id]/page.tsx` (metrics, documents) | Inconsistent padding and head styles across the app; figures don't line up. |
| D6 | **No tabular figures** | `tabular-nums` count: 0. A finance product. | Deal ledger, fund tables and KPIs jitter column to column. |
| D7 | **Global transition on everything** | `globals.css` `@layer base { * { transition-duration: 180ms; transition-timing-function: ease } }` | Every property on every element eases, including layout shifts and focus outlines, and there is no `prefers-reduced-motion` guard. Motion that fires on everything communicates nothing. |
| D8 | **Button typography shouts** | `ui/button.tsx` and `.btn-*`: every button, including row-level "Dismiss" and "Remind", is mono, uppercase, `tracking-widest`. `size="sm"` is `h-7 text-[10px]` | One loud style for all actions means no hierarchy. 28px / 10px is under comfortable touch and reading size. |
| D9 | **Navigation is a long flat list with no wayfinding** | `layout/sidebar.tsx`: 17 admin entries in 4 groups; active item shows a chevron; no counts (Approvals, Diligence, "needs review" are invisible until you click); no search | Admin has to know where things live. Detail pages have no breadcrumb. |
| D10 | **State not in the URL** | `admin/companies/[id]/page.tsx` (1,886 lines, tabs in `useState`, only `diligence` is written to the URL). Radix Tabs is installed and unused. Settings is the one page already on URL tabs | Back button and shared links lose your place; the file is unmaintainably large. |
| D11 | **Dialogs hand-rolled** | 17 `fixed inset-0` overlays; Radix Dialog used only in 3 board files, each re-styled by hand | Inconsistent backdrop, focus and escape behaviour, no enter/exit motion. |
| D12 | **Board interaction is form-like** | `components/admin/board/board-card.tsx`: every card carries a "Move to" select plus up/down arrows; drag exists only to drop at the end of a column (`board-column.tsx`) | Controls on every card crowd the content. No insertion position, no undo. |
| D13 | **Charts contradict the system** | `admin/page.tsx` bar chart has `radius={[3,3,0,0]}` (the system is 0 to 2px); tooltip hard-codes `2px` | Small, but it is the only rounded thing on a flat page. |
| D14 | **Login is the generic template** | `login/page.tsx`: centered bordered card, "Welcome back". The LP login (`lp/page.tsx`) is far better: left-aligned display headline, mono eyebrow | The first screen every founder sees is the least branded one. |
| D15 | **Status badges are heavy** | `.badge`: bordered, tinted, `px-3` pill-ish chip on every status, plus a second neutral badge for sector, plus an info badge for stage (see company cards) | Three bordered chips per row is noise. A dot plus a word carries the same meaning. |

What is **not** dated and should be kept: the Paper/Bone/Obsidian palette, 1-2px corners, mono uppercase section labels, the Sky accent, the status-strip pattern from the Settings redesign, the global select rule, URL tabs on Settings, `EmptyState`'s structure, the optimistic/refresh fixes already in Part 37.

---

## 4. Design principles

1. **Flat is the brand, so depth comes from tone, not shadow.** Paper page, white work surface, a slightly darker well for containers. Shadow exists for exactly one case: things that float above the page (dialogs, menus, toasts, palette).
2. **Every action is acknowledged within 100ms.** Button press state, optimistic update, toast. Silence is a bug.
3. **Motion tells you what changed.** A row that was added is washed briefly in Sky; a removed row collapses; a moved card lands with the same wash; a sheet slides from where it was opened. Nothing animates just because a property changed.
4. **One loud thing per screen.** The primary action keeps the mono-caps treatment. Everything else is sentence-case Plex. Ochre and Laterite are reserved for "needs attention" and "broken".
5. **Density is a feature for admin, comfort is a feature for founders.** Same components, two densities (section 5.5).
6. **Numbers are first-class.** Tabular figures everywhere a figure appears; right-aligned numeric columns; units and deltas in mono.
7. **State lives in the URL.** Tab, filter, sort, search, open record. Back works, links share.
8. **Keyboard is a first-class input** for admin: jump, filter, move.
9. **Say less, point to the next step.** Empty states say what the screen is for and offer the one action. Errors say what to do.

---

## 5. Design-system changes

All changes land in `globals.css` (CSS variables) and `tailwind.config.ts` (names). Existing token names are kept; new ones are additive, so nothing breaks.

### 5.1 Colour and surface tiers

Keep the existing palette and the AA-safe accent/muted blends. Add:

| Token | Value | Use |
|---|---|---|
| `--color-well` | `#E2DFD4` | Container wells (board columns, grouped inputs). One step below Paper's Bone border; replaces `bg-muted/40` scattered ad hoc. |
| `--color-row-hover` | `#F6F4EE` | Table row hover on a white surface (today `hover:bg-muted/50` on white is a heavy grey). |
| `--color-row-divider` | `#EFEDE5` | Lighter intra-table dividers; Bone stays for outer borders. |
| `--color-wash` | `rgb(91 141 197 / .10)` | Selected row, drop target, "just changed" highlight. |
| `--color-attention` / `-bg` | Ochre border / Ochre `/10` | Attention strips. Ochre is a **border and marker only**, text stays Obsidian (carries the earlier 246ad16 rule). |

Rule: no new hues. Status = Acacia (ok), Ochre (attention), Laterite (broken/overdue), Sky (informational/new), neutral grey.

### 5.2 Type scale

Fonts unchanged. Today type sizes are ad hoc (`text-2xl`, `text-sm`, `text-xs`, `text-[10px]`, `text-[11px]`). Replace with named roles:

| Role | Spec | Used for |
|---|---|---|
| `display` | Space Grotesk 600, 32/36, -0.015em | LP headline, login, empty hero |
| `title` | Space Grotesk 600, 24/30, -0.01em | Page H1 (today `text-2xl`, keep) |
| `heading` | Space Grotesk 600, 16/22 | Section and dialog titles |
| `body` | Plex 400, 14/22 | Default |
| `body-sm` | Plex 400, 13/20 | Tables, dense admin lists |
| `label` | JetBrains Mono 600, 11/16, +0.08em, uppercase | Section eyebrows, column headers, primary buttons. (Today `tracking-widest` is 0.1em at `text-xs`; dropping to 11px / 0.08em reads less shouty at the same legibility.) |
| `figure` | Plex 500, `font-variant-numeric: tabular-nums` | **Every number.** Ship a `.num` utility and apply in tables and KPIs. |
| `caption` | Plex 400, 12/16 | Hints, timestamps. Floor is 12px: remove `text-[10px]` and `text-[11px]` except mono labels at 11. |

### 5.3 Spacing and layout

- 4px base. Allowed steps: 4, 8, 12, 16, 24, 32, 48. Page gutter 24 desktop / 16 mobile (today `px-4 md:px-6`, keep).
- Page header: `mb-8` becomes `mb-5` for admin list pages (the header was taking a screenful before content). Detail pages get a breadcrumb line above the title.
- Content max width: lists use full width up to 1280 (today `max-w-6xl` = 1152); reading pages (updates, reports, LP) stay narrow (`max-w-2xl`/`3xl`). Introduce two shell widths: `shell-wide` and `shell-read`.
- Cards stop being the default container. Use: **flat section** (label, hairline rule, content), **well** (tone step), **card** only for self-contained objects (a company on a founder dashboard, an LP report entry). The Settings redesign already did this; extend it.

### 5.4 Radius and elevation

- Radius: **keep 1-2px.** Do not round. Add `rounded-none` as a first-class option for tables and wells. Fix the one outlier (chart bars to 0).
- Elevation, two levels only:
  - `flat` (default): hairline border, no shadow.
  - `float`: `0 12px 32px -12px rgb(20 20 15 / .28), 0 0 0 1px var(--color-border)` for dialogs, popovers, dropdowns, toasts, palette. One shadow in the whole app, tinted Obsidian not black.
- Scrim: Obsidian at 35% (today `bg-black/40`).

### 5.5 Density

Two modes via a wrapper class, not per-component props:

| | `density-compact` (admin tables) | `density-comfortable` (founder, LP, forms) |
|---|---|---|
| Row height | 40 to 44px | 52 to 56px |
| Cell padding | 12px x | 16px x |
| Control height | 32px | 40px (today's inputs) |
| Min touch target | 32px with 8px hit-slop on mobile | 44px |

Default: admin tables compact, everything on founder/LP comfortable. `Button size="sm"` becomes 32px (from 28) with 11px mono or 13px sans.

### 5.6 Motion

Replace the global `* { transition-duration: 180ms }` with scoped, named motion.

Tokens:
```
--ease-out:  cubic-bezier(.2,.8,.2,1)   /* enters, hovers */
--ease-in:   cubic-bezier(.4,0,1,1)     /* exits */
--dur-fast:  120ms   /* hover, press, focus */
--dur-base:  200ms   /* appear/disappear, toasts, popovers */
--dur-slow:  280ms   /* sheets, panel slides, list reflow */
```
Rules:
- Transition only `color, background-color, border-color, opacity, transform, box-shadow`, only on interactive elements. Never `all`, never layout properties. This also removes the focus-ring easing flash.
- Honour `prefers-reduced-motion`: durations to 0, wash highlights become instant outlines.
- Meaningful motion inventory (these are the only animations in the app):
  1. Dialog and sheet: scrim fades, panel rises 6px and fades (dialog) or slides from the right (sheet), 200 / 280ms.
  2. Toast: slides up 16px and fades; swipe or timeout to leave.
  3. Row added or card moved: 1.4s Sky wash fading to white. Row removed: height collapses over 200ms.
  4. Optimistic button: label swaps to a check for 800ms, then back.
  5. Skeleton: slow 1.4s opacity pulse, not a shimmer sweep.
  6. Nav and tab indicator: the 2px indicator slides between items (transform only).
  7. Numbers on the dashboard do not tick or count up. Counting animations are decoration.

---

## 6. Component-level upgrades

Build once in `src/components/ui/`, then adopt page by page. Each is independently shippable.

### 6.1 Buttons
- Hierarchy: **primary** (Sky fill, mono caps, one per view), **secondary** (bordered, sentence-case Plex 500 13px), **ghost** (text only, row-level), **destructive**. Row-level actions (Remind, Dismiss, Retry, Edit) use ghost or secondary, not primary.
- `loading` prop: disables, shows a 14px spinner in place of the leading icon, keeps width stable (no layout jump). Replaces the 100+ ad hoc `{x ? "Sending…" : "Send"}` swaps.
- Sizes: sm 32 / md 36 / lg 44. Pressed state: 1px translateY, 120ms.
- Icon-only variant with required `aria-label` and 32px target.

### 6.2 Tables (`ui/table.tsx` becomes `DataTable`)
- Props: column defs with `align: "num"`, `sortable`, `sticky` (first column on horizontal scroll), `width`.
- Visual: header row mono-label 10/11px on the surface (no grey fill), 1px bottom rule, rows with `row-divider` and `row-hover`; no outer rounded box; compact density.
- Toolbar slot above: search input (with `/` shortcut hint), filter chips with live counts, optional "Group by", result count and sort summary below.
- Row behaviour: whole row clickable when it has a detail page (with real `<a>` in the first cell for accessibility, middle-click and keyboard); **row actions revealed on hover and on focus-within**, always visible on touch.
- Sort, filter and search state read/written to the URL query (`?q=&status=&sort=`), debounced for text.
- Built-in empty (filtered vs none-yet), loading (skeleton rows with the same column widths) and error states.
- Mobile: below `md`, rows collapse to a two-line list item (name + status, then 2 key facts). No horizontal-scroll hint needed.
- Numbers: `.num` right-aligned, tabular; currency and percentage formatting through the existing `lib` helpers; negatives in Laterite only where the sign is the point (returns), never for neutral deltas.

### 6.3 Forms
- Field = label (mono 11) + control + hint + error in one `Field` component with correct `aria-describedby`. Error text appears under the control with a 120ms fade; the control gets a Laterite border.
- Inline validation on blur, not per keystroke. Submit button `loading`, disabled only while submitting.
- Long forms (company, fund, portfolio detail, update composer): **sticky action bar** at the bottom with "Unsaved changes" status, Save and Discard. Warn on navigate-away only when dirty.
- Keep the global select rule and `Select` as is. Add `Combobox` (the sector combobox in `ui/sector-combobox.tsx` is already one; generalise it for owner/project/company pickers).
- Date and currency inputs: type-ahead formatting, tabular figures.

### 6.4 Dialogs, sheets, confirmations
Three primitives over Radix Dialog (already installed), replacing all 17 hand-built overlays:
- **Dialog** (focused task, max 480/640px).
- **Sheet** (right side, 440px; record preview and edit without leaving the list: edit an LP, a deal, a board card).
- **ConfirmDialog**, replacing every `window.confirm`. States the object ("Delete the AcmeHQ Seed deal"), the consequence in one sentence, and a Laterite confirm button named for the action ("Delete deal", not "OK"). For high-impact deletes (LP, fund, company) require typing the name.
- Shared: focus trap, Escape, return focus, scroll lock, 200ms enter, exit animation, mobile = full-width bottom sheet.

### 6.5 Feedback: toasts, optimistic UI, undo
- **Toaster** on `@radix-ui/react-toast` (already installed, unused), bottom-center on desktop, bottom on mobile. Four kinds: success (default, 4s), error (stays until dismissed, with the server message and a Retry when the action is idempotent), info, and **undo** (6s with an Undo button).
- Policy, so the team stops deciding case by case:
  - Reversible or low-stakes (move a card, dismiss an alert, toggle a recipient, mark a todo): **optimistic**, toast with Undo.
  - Server-confirmed (send reminder, publish report, send broadcast): button shows `loading`, toast on success ("Reminder sent to AcmeHQ"), error toast on failure with Retry. Never optimistic.
  - Destructive and not undoable: `ConfirmDialog`.
- Inline banners stay only for **persistent** conditions (the Needs-review banner, missing API keys).

### 6.6 Loading
- `Skeleton` primitive (`bg-well`, 1.4s slow pulse), plus `TableSkeleton`, `CardSkeleton`, `KpiSkeleton` that match real dimensions so the page does not shift.
- Add a `loading.tsx` per route group (`admin`, `dashboard`, `lp`, `updates`, `company`) so navigation shows the shell and skeleton immediately.
- Replace all 34 "Loading..." strings. Replace the login `Suspense` fallback with the skeleton of the card.
- Keep stale data visible during refetch (dim 60%, small spinner in the header) instead of blanking.

### 6.7 Empty states
- Today: icon, 18px title, one grey sentence. Upgrade to: mono eyebrow naming the screen, one-line title, one-line "what this is for", **one primary action and at most one secondary**, and for first-run states the exact CSV/column format or an example row (the Companies CSV hint is a good model).
- Two variants: `none-yet` (invites the action) and `filtered` (offers "Clear filters", shows the active filters).

### 6.8 Status and badges
- `StatusDot`: 7px square (flat system, not a circle) + label, for status in tables and headers. Colour mapping lives in one `statusTone()` map (the cadence status, approvals status, report status all currently re-map colours in each page).
- Keep bordered `Badge` for counts and categories only, shrink to `px-2`. One chip per row maximum.

### 6.9 Navigation and wayfinding
- **Sidebar:** keep the four groups. Add count markers (Approvals 3, Diligence 2, Team Board "2 to review") as small mono numerals, solid Obsidian for "needs you", quiet grey for informational. Active state becomes a 2px Sky left rule plus Obsidian text on a white tab (drops the chevron). Groups collapse (state remembered per browser). Hover 120ms.
- **Command palette (Ctrl/Cmd+K):** jump to any company, fund, LP, deal, page; run a few actions ("New update for...", "Add company"). Backed by one `/api/admin/search` index of names. Admin only in v1. Shown in the mockup.
- **Keyboard:** `/` focus the list filter, `g` then letter to go (g c = companies, g b = board), `j/k` move row focus, `Enter` open, `?` shows the cheat sheet. Board: `m` opens Move-to, `e` edits. Disabled inside inputs.
- **Breadcrumbs** on every detail page; **URL tabs** on company, fund and portfolio detail (extending the pattern already in Settings).
- Founder mobile: a 4-item bottom tab bar (Dashboard, Updates, Metrics, More) replaces the hamburger-only pattern. Optional (Decision 7).

### 6.10 Charts
- Flat bars (radius 0), Sky for the primary series, Ochre only for threshold lines, tooltips on the `float` elevation with tabular figures, no grid dash on the y-axis (a single baseline plus light horizontal rules), axis labels 11px mono. Add accessible text summary under each chart.

---

## 7. Page-by-page highlights

Priority: ★★★ biggest visible change, ★★ solid, ★ polish.

### Admin
- **/admin dashboard ★★★** (`admin/page.tsx`). Today: four equal KPI cards, then alert table, chart, sector list, overdue table. The job of this page is "what needs me today". Invert it: a **Needs attention** worklist at the top (pending approvals, diligence awaiting review, metric alerts, overdue companies, board items to review), each row with its action inline (Review, Remind, Dismiss) and optimistic completion. The four KPIs shrink to one quiet stat strip (inline numbers with mono labels, no icons, no boxes). The chart and sector list sit below as reference. Dismiss and Remind get toasts with Undo or confirmation.
- **Companies list ★★★** (`admin/companies/page.tsx`). Cards to DataTable (mockup). Status chips with counts at the top answer "who is behind". CSV import becomes a Dialog with a preview of parsed rows and errors before commit (today it commits on file pick).
- **Company detail ★★★** (`admin/companies/[id]/page.tsx`, 1,886 lines, not read in full). Breadcrumb, status in the header, a one-line facts row, an attention strip when overdue with the Remind action right there, URL tabs with counts, a right rail with the numbers admins always check. Mechanically also split the file by tab into route segments or tab components; that split is the enabling work, and is the biggest single maintainability win in the repo.
- **Approvals ★★** (`admin/approvals/page.tsx`, 795 lines). Make it a triage queue: list on the left, detail on the right (or Sheet), `j/k` to move, `a` approve, `r` reject, toast with Undo for approve. Bulk select for the common case.
- **Diligence ★★** (`admin/diligence`). Same queue pattern; progress as segmented bar (passports 2 of 3) rather than a text count.
- **Updates, Investor Links, Providers, Portfolio contacts ★★**. DataTable adoption with the shared toolbar; row actions to hover; delete via ConfirmDialog.
- **Funds, Fund detail ★★** (`admin/funds`, `funds/[id]` 992 lines). Tabular figures and right-aligned money everywhere; deals and cashflows as DataTables with inline edit in a Sheet; sticky action bar on forms. Fund header gets a strip of the four fund metrics.
- **Deal Ledger ★★★** (`admin/portfolio`). The densest table in the product and the most numeric: compact density, sticky first column (company) on horizontal scroll, tabular figures, group-by fund with subtotals, column visibility menu, CSV export. Biggest gain per row of any page.
- **LPs, Fund Reports, Broadcasts ★★**. Tables as above; Broadcast composer gets a preview pane beside the editor on wide screens and a sticky send bar with recipient count.
- **Team Board ★★★** (mockup). Drag to a precise position with an insertion line; card face carries only title, owner tile, project tag, due date, review marker. Move-to select and arrows leave the face, remain in the card Dialog and in a card context menu (`m`), and stay visible on touch as the accessible path. Optimistic move with Undo toast. Keep the Needs-review banner as shipped. Column wells use the new `well` tone. Quick-add at the bottom of a column (title only, Enter to save).
- **Weekly Digest ★**. Composer: sticky status bar (Draft, N todos linked to board), todo rows with the shipped select fix; side-by-side preview on wide screens.
- **Settings ★**. Already redesigned; adopt the new toasts for test-email, test-upload, test-post results instead of inline result blocks.
- **Audit log ★★**. Filter chips (All, Sign-ins, Failures, Documents) with counts, relative time with absolute on hover, expandable row for metadata.

### Founder
- **Dashboard ★★** (`dashboard/page.tsx`, 365 lines, skimmed). Lead with the single next action ("Your Q3 update is due in 4 days. Start it."), then last update status and a metrics glance. Comfortable density, 44px targets.
- **Update composer ★★** (`updates/new`, `updates/[id]`). Autosave with a visible "Saved 2 s ago" indicator replacing the Save button's anxiety, template picker as a Sheet, `confirm()` removal, preview as a toggle not a separate screen.
- **Metrics ★★**. Sparklines in the table, tabular figures, add-metric as inline row, chart on the shared chart spec.
- **Dilution Planner ★★** (`planner/*`). Results update live as inputs change with a quiet highlight on changed cells; `confirm()` removal; scenario compare as columns.
- **Documents, Profile, Team, Providers ★**. Forms on the new `Field`; documents as a DataTable with upload progress rows, Retry in-row (the shipped Retry pattern, moved into the row).
- **Diligence (founder) ★★** (`diligence/page.tsx`). A checklist with a single progress line and per-item states (done, needed, optional) rather than card per item.

### LP portal
- **/lp ★★**. The LP landing already has the best typography in the app. Extend it: fund-grouped report list as a flat dated list with a Sky "New" marker for unread; report view keeps its reading column; sticky mini header with fund name and a "Download PDF" (print stylesheet exists).
- **Report view ★**. Fund metrics in a stat strip with tabular figures; mention hover cards on the `float` elevation.

### Auth
- **Login ★★** (`login/page.tsx`). Adopt the LP treatment: left-aligned display headline ("Sign in to Molly."), mono eyebrow, Google as the primary route for team (with the @domain note), password form beneath; drop the bordered centered card and the shadow. Inline field errors; the `loading` button state; skeleton fallback.
- **Signup, set-password ★**. Same layout, step indicator on set-password.

### Cross-cutting
- Page header: eyebrow (mono, section name) above the title on detail pages, actions right-aligned and wrapping on mobile (already does).
- Global: replace remaining `animate-spin` ad hoc loaders with the button `loading` or `Skeleton`.
- Accessibility: the 11px/10px floor, 32px minimum targets, visible focus (keep the 2px Sky outline, remove `outline-none` + ring combos that disagree), `aria-sort`, `aria-live` toasts, dialogs with correct focus return, `prefers-reduced-motion`.

---

## 8. Phased rollout

Ordered by impact against effort. Each phase is independently deployable, has no schema change unless stated, and lists its acceptance check for Joseph's click-through. Sizing is Alvin-days (one engineer, includes tests and a live-deploy smoke).

| Phase | Name | What ships | Visible impact | Effort | Risk |
|---|---|---|---|---|---|
| **1** | **Foundations and feel** | Tokens (well, row-hover, wash), type roles, `.num`/tabular figures applied to all money and counts, replace the global `*` transition with scoped motion + reduced-motion, button hierarchy (ghost/secondary for row actions, sm to 32px), `loading` prop on `Button`, status dot component, chart radius fix | High: the app immediately feels calmer and numbers line up, with zero layout change | 2 to 3 days | Low (CSS and small component props). Needs a visual pass on the ~30 screens that use `btn-*`. |
| **2** | **Feedback layer** | Toaster, Dialog/Sheet/ConfirmDialog primitives, replace all 19 `confirm`/`alert`, convert inline success banners to toasts, Undo on reversible actions, Skeleton primitives and `loading.tsx` per route group | Very high: removes the most dated behaviours, kills blank-then-pop | 4 to 5 days | Low to medium: touches ~15 files for the confirm swap; each is mechanical. |
| **3** | **Tables** | `DataTable` (toolbar, sort/filter in URL, numeric alignment, row actions on hover, empty/loading/error, mobile list mode). Adopt in order: Companies (card to table), Deal Ledger, Approvals list, LPs, Audit, Updates, Funds deals/cashflows | Very high on the pages admins live in | 5 to 7 days (primitive 2, then ~0.5 to 1 per page) | Medium: highest-traffic pages. Ship page by page. |
| **4** | **Navigation** | Sidebar counts + collapse + new active state, breadcrumbs, URL tabs on company/fund/portfolio detail, Ctrl+K palette + `/search` endpoint, `g`-key shortcuts and `?` sheet | High for speed | 4 to 5 days | Medium: one new read-only endpoint (admin only) and the dependency decision. |
| **5** | **Dashboards and first impressions** | Admin "Needs attention" dashboard; founder next-action dashboard; login/signup/set-password restyle; empty-state upgrade app-wide | High at first impression, moderate daily | 4 to 5 days | Low to medium: dashboard queries already exist; restructuring only. |
| **6** | **Team Board interactions** | Drag-to-position with insertion line, optimistic move + Undo, quick-add, card face de-cluttered, keyboard moves, well tone | High on one page the team uses constantly | 3 to 4 days | Medium: touches `board-client.ts` ordering logic (`beforeId`/`afterId` contract from WS106 already supports it); needs careful touch fallback. No schema change. |
| **7** | **Structure and depth** | Split `admin/companies/[id]` (1,886 lines) by tab; Sheet-based inline edit on LPs/deals/providers; sticky save bars and dirty tracking on long forms; autosave on the update composer; SWR (or equivalent) with optimistic mutations to replace the 92 effect-fetches on chosen screens | Moderate visible, high maintainability | 8 to 10 days (split into 3 deploys) | Medium to high: structural. Do after 1 to 5 prove the primitives. |
| **8** | **Optional polish** | Founder mobile bottom tab bar, LP "new" markers, column visibility/CSV export on the ledger, saved views | Nice-to-have | 3 to 4 days | Low |

Total core (phases 1 to 6): about 22 to 29 Alvin-days, roughly 5 to 6 weeks end to end with review cycles; **phases 1 to 4 alone are ~15 to 20 days** and deliver most of the "modern" feel. If Joseph wants a first deploy within days, ship Phase 1 plus the Toaster/ConfirmDialog half of Phase 2.

Ordering rationale: 1 is cheap and lifts everything; 2 removes the most jarring dated behaviour and creates the primitives phases 3 to 6 rely on (toasts for Undo, Sheet for row edit, Skeleton for table loading); 3 and 4 are where daily admin time is spent; 5 and 6 are targeted wins; 7 is the investment that makes future work cheaper.

Testing posture (no localhost): each phase gets pure-helper unit tests where logic exists (sort, filter, ordering, status tone map), a post-deploy curl smoke for the touched routes, and a screenshot checklist for Joseph. I will write the checklist per phase when Alvin starts it.

---

## 9. Decisions for Joseph (with my recommendation)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Overall scope.** | (a) Phases 1 to 4 only. (b) Phases 1 to 6. (c) Everything incl. structural phase 7. (d) Phase 1 + 2 as a trial, then decide. | **(d) then (b).** Phases 1 and 2 are low-risk and show the direction on live screens within a week; decide on tables and nav after you have seen them. Defer 7 until 1 to 6 land. |
| 2 | **How far to go on "modern".** Keep the flat, near-square, Paper-and-Bone look, or move to a softer, rounder, shadowed SaaS look. | Keep flat / Soften | **Keep flat.** It is the brand and it is what makes Molly not look like a template. The dated feel comes from behaviour, not corners. The proposal adds exactly one shadow (floating layers). |
| 3 | **Command palette dependency.** | `cmdk` (~5 kB) / hand-built on Radix Dialog / skip palette | **`cmdk`.** Mature, accessible, one afternoon of work. Admin only in v1. |
| 4 | **Client data layer.** | Add `swr` for cache + optimistic mutate / keep `useEffect` + `fetch` / TanStack Query | **`swr`, introduced only in phase 7 and only on chosen screens.** It also directly fixes the "board doesn't refresh after edit" class of bugs. Not needed for phases 1 to 6. |
| 5 | **Confirmations for destructive actions.** | Type-the-name for company/fund/LP deletes / plain confirm dialog everywhere | **Type-the-name for company, fund, LP; plain ConfirmDialog for the rest.** Matches the existing wording in `admin/lps` ("signs them out everywhere"). |
| 6 | **Companies as table vs cards.** Cards read nicely at 6 companies and badly at 40+. | Table / keep cards with a toggle | **Table by default, with a card-view toggle only if you want one.** Remembering the choice per browser is trivial. |
| 7 | **Founder mobile bottom tab bar.** | Yes / no (hamburger only) | **Yes, but phase 8 and only after you check how many founders use phones** (the sign-in audit log has user agents). |
| 8 | **Typeface.** The brief said Archivo; the app ships Space Grotesk / IBM Plex Sans / JetBrains Mono, as does the brand skill. | Keep / change brand fonts | **Keep.** No evidence of a brand change; the overhaul does not need one. If Archivo is intended, tell me and I will redo the type scale (section 5.2) against it before phase 1. |
| 9 | **Button label case.** Keep mono uppercase for every button, or only for the primary. | All caps / primary only | **Primary only.** Secondary and ghost in sentence-case Plex. The single biggest hierarchy win for the least effort. |
| 10 | **Undo vs confirm policy.** Adopt the policy in 6.5 (optimistic + Undo for reversible, loading + toast for server-confirmed, ConfirmDialog for irreversible). | Adopt / decide per case | **Adopt.** It stops the endless per-feature debate and gives Alvin a rule. |
| 11 | **Dark mode.** | Add later / never | **Not in this effort.** Tokens are structured to allow it, but the brand is light and the LP print path assumes it. |
| 12 | **Rollout order of pages within Phase 3.** | Companies first / Deal Ledger first | **Deal Ledger first if you live in numbers; Companies first if you live in who-is-behind.** Defaulting to Companies because it is the simpler, lower-risk template for the primitive. |

---

## 10. Handoff notes for Alvin

- Branch: one PR per phase (phase 3 per page group). Do not bundle.
- New files only for primitives: `ui/toaster.tsx`, `ui/dialog.tsx`, `ui/confirm-dialog.tsx`, `ui/sheet.tsx`, `ui/skeleton.tsx`, `ui/status-dot.tsx`, `ui/data-table.tsx`, `ui/field.tsx`, `lib/status-tone.ts`. Keep existing exports working until each page is migrated, then delete the old.
- `globals.css`: new tokens go in `:root`; the unlayered `select` rule stays unlayered (Part 37 reason). The new motion rule replaces the `*` transition inside `@layer base`.
- Tailwind: add `well`, `row-hover`, `wash` colours, `boxShadow.float`, `transitionTimingFunction.out`, and `fontSize` roles; do not remove existing keys.
- Run the `confirm`/`alert` replacement as a single mechanical sweep (grep list in section 3, D1) so none are left behind.
- The Part 37 board contract (`beforeId` = card directly above, `afterId` = directly below, none = end of column) already supports precise drag placement; Phase 6 needs no API work.
- Confidential-terms hook: this doc and the mockup use only synthetic names.

---

## 11. Direction B: colour and rounded corners

Added 2026-10-10 at Joseph's request ("colours and rounded corners, not too far off our identity"). Direction A (sections 4 to 10) stays the baseline. B is a different **skin** on the same behaviour: toasts, Undo, DataTable, Cmd+K, board drag, skeletons, URL tabs, density all apply unchanged. The mockup's top toggle switches Before, After A and After B on every screen at once: https://claude.ai/artifact/QAQugTLN61T3FVkETz6EhB

Additional assumptions: (1) Ochre keeps its current meaning as the "attention" hue in status UI, and the primary action stays Tuareg/Sky. Using Ochre as the primary brand colour would collide with warning semantics (see Decision 14). (2) Light theme only. (3) No new fonts. (4) All text and tint pairs below were chosen for at least 4.5:1; Alvin should run a contrast check on final values in phase 1.

### 11.1 Token deltas against Direction A

**Colour: tinted pairs (soft fill + deep ink), derived from the existing brand hues, nothing new in hue family**

| Role | Fill | Ink (text) | Approx. contrast | Used for |
|---|---|---|---|---|
| Stone (neutral) | `#E7E4DA` | `#46443C` | 7.7 | To do, neutral tags, facts chips |
| Sky | `#DCE7F3` | `#2C4459` | 8+ | Informational, In progress, Seed |
| Sage (Acacia) | `#E3E8D0` | `#4A5524` | 6.5 | Current, Done, Series A |
| Clay (Laterite) | `#F4E0D6` | `#8F4A30` | 5.0 | Behind, Blocked, overdue, negative delta |
| Sand (Ochre/Cocoa) | `#F1E4C8` | `#6B4A0E` | 6.1 | Pre-seed, active nav, signature warm accent |
| Amber (attention) | `#F8EBC9` | `#6B4A0E` | 6+ | Aging, attention strips, review banners |

Solid hues stay the brand ones (Acacia, Laterite, Ochre, Sky) for dots, markers, drop rings and chart series; **tinted fills with deep ink carry all text**. Ochre solid (`#C9963A`) takes Obsidian text (about 8:1) for nav count pills. Never Ochre or Sky-light as text on Paper or on a tint.
Column accents on the board: To do = Stone, In progress = Sky, Blocked = Clay, Done = Sage. Stage accents in tables: Pre-seed = Sand, Seed = Sky, Series A = Sage. Company tiles rotate through Sand/Sky/Sage/Clay by a stable hash of the name so a company keeps its colour.

**Radius scale** (replaces the 1/2px scale)

| Token | Value | Where |
|---|---|---|
| `r-sm` | 6px | chips, tags, kbd, avatars/tiles, count badges, row hover, inline code |
| `r-md` | 10px | buttons, inputs, selects, cards, table container, board cards and column wells, banners, tab group |
| `r-lg` | 14px | dialogs, sheets, command palette, toasts, popovers |
| `pill` | 999px | status pills and filter chips only; never buttons |

Nested radius rule: inner = outer minus padding, never larger than the parent (a 6px tag inside a 10px card).

**Elevation: soft returns, in three steps**
- `soft` (resting): `0 1px 0 rgb(20 20 15 / .04), 0 1px 3px rgb(20 20 15 / .07)`, on cards, table container, inputs without borders.
- `lift` (hover on draggable/clickable cards): `0 6px 16px -8px rgb(20 20 15 / .28)` plus `translateY(-1px)`.
- `float` (dialogs, menus, toasts, palette): `0 18px 44px -14px rgb(20 20 15 / .35)` plus a 1px Obsidian/5% ring.
Borders get quieter: Bone borders drop off cards and inputs where the shadow already defines the edge; they remain on tables' internal dividers and on focus. Sidebar becomes a slightly darker Paper (`#E6E3D8`) instead of a hairline-divided one.

**Type and labels in the softer look**
- Fonts and roles unchanged. Mono uppercase **stays for eyebrows, column headers, counts and board column titles**, but tracking drops to 0.06em and weight stays 600 at 11px. Buttons leave mono: **all buttons, including primary, are sentence-case Plex 600 13px**. This is the biggest tonal shift from the current brand and is the one I would watch most closely (Decision 15).
- Display headings keep Space Grotesk; title tracking -0.015em.

**Motion** unchanged, with two additions: card lift on hover (160ms) and column-hue glow on drop target.

### 11.2 What changes per phase (versus A)

| Phase | Change under B |
|---|---|
| **1 Foundations** | The only phase that really differs. Token set above instead of A's well/wash/hover tokens; radius scale in `tailwind.config.ts` (`sm 6, md 10, lg 14`) and removal of the flat 1-2px overrides; shadow tokens; `Button` loses mono caps entirely and gains radius 10; `StatusPill` replaces `StatusDot`; `badge-*` classes become tint+ink pairs; `statusTone()` returns `{fill, ink, dot}`. Add 3 to 4 days over A because every raw `rounded-*`, bordered box and hard-coded colour class meets the new scale: ~5 to 6 days total vs 2 to 3 for A. |
| **2 Feedback** | Same primitives; Dialog/Sheet/Toast/Palette use `r-lg` + `float`. +0.5 day. |
| **3 Tables** | DataTable gets a tinted stage/status column helper (`ChipCell`) and rounded container. +1 day over the phase. |
| **4 Navigation** | Active item is a Sand pill, count pills Ochre. +0.5 day. |
| **5 Dashboards, auth** | Attention worklist rows become tinted panels per type (approvals Sky, overdue Clay). Login can carry a warm Sand/Paper panel. +1 day. |
| **6 Board** | Column wells tinted per status; drop-target glow in column hue. +0.5 day. |
| **7, 8** | No difference. |
Net: B costs about 3 to 5 more Alvin-days overall (5 to 6 days for phase 1 alone), and its Phase 1 is a visible app-wide change, so it needs a screen-by-screen visual pass; A's Phase 1 is nearly invisible apart from alignment and button hierarchy.

### 11.3 Honest comparison

| | A: flat, square | B: colour, rounded |
|---|---|---|
| Fit with DFS identity | Strong: the 1-2px corners, Paper/Bone and mono caps are the identity | Moderate: palette and fonts intact, but square corners and mono-cap buttons were distinctive and go away |
| Scanning speed | Good; colour only for exceptions, so exceptions stand out | Better for categories (stage, status, column) at a glance; risk that everything has a colour and nothing stands out |
| Distinctiveness | High. Rare among SaaS tools | Lower. Soft tinted pills on rounded cards are the current default of the category |
| Perceived "modern" | Modern through behaviour and density; some will still read it as austere | Reads modern and friendly immediately, especially to founders |
| Fit by audience | Admin power use, LP report reading, finance feel | Founder-facing screens, Team Board, onboarding |
| Accessibility | Highest contrast by construction | Fine if tint/ink pairs are enforced; more pairs to maintain |
| Cost | 1.0x | about 1.15 to 1.25x; and phase 1 is riskier |
| Reversibility | n/a | Tokens make a later shift to A or back cheap if done as tokens, expensive if hard-coded |

**Recommendation: A for the admin product and LP portal, with B's *colour system* adopted selectively; rounded corners only in founder-facing surfaces, if at all.** Concretely, "Direction A+": keep square 1-2px corners and mono-cap primary buttons, but add the tinted status/stage/column pairs from 11.1 (they are the part of B that adds real information), soft `float` elevation only on floating layers, and a one-step radius bump to 4px on founder-facing cards if Joseph wants warmth there. This gets most of B's scannability without losing what makes Molly look like DFS. If Joseph prefers the full B look anyway, it is a legitimate and safe choice because everything is tokenised; the cost is the extra phase 1 time and some loss of distinctiveness.

### 11.4 Added decisions

| # | Decision | Recommendation |
|---|---|---|
| 13 | **Which direction.** A, B, or A+ (A's shapes with B's tinted colour pairs). | **A+** (see 11.3). Decide after clicking through the mockup on a real screen at 100% zoom. |
| 14 | **Ochre's role.** Keep Ochre as the attention hue and Tuareg as primary (as mocked), or make Ochre the primary brand accent (primary button, active nav) and move attention to a different hue. | **Keep as mocked.** Making Ochre primary overloads "warning" with "go"; attention states would need a new hue and the system would drift from the identity. |
| 15 | **Button case under B.** Drop mono caps even for the primary, or keep for the primary only. | **Keep mono caps on the primary only** (same as Decision 9), even in B; it is the thread that keeps B recognisably DFS. The mockup shows B without it so the contrast is visible. |
| 16 | **Surface split.** Same skin across admin, founder and LP, or B-style warmth only for founder and LP. | **Split if you choose B or A+:** admin stays denser and squarer; founder and LP can take the rounder, more colourful treatment. |
