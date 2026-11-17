# PLAN-1 — Molly redesign in Lou's layout and feel (WS155–WS172, F161–F177, Q143–Q146, 2026-11-16; WS169–WS172 and F168–F177 added 2026-11-17)

Author: Felix. Plan only; nothing here is built. Board card B-124. The owner asked for "a big redesign of Molly so it looks more modern and has the same UI and UX as Lou". Lou is DFS's own agent inbox app, a separate private product. This plan describes Lou's patterns in Molly's own words and builds them from Molly's own code. **No Lou code, class names, token values or content may be copied into this repo** (the repo is public). Every company, person, fund and amount in mockups, tests and copy is a placeholder (Acme, example.com, round numbers).

This file continues the numbering in `docs/IMPLEMENTATION_PLAN.md` (that file ends at WS154, F160, Q142). It is a new file at the owner's request; it is not appended to the old one.

Status lives on the Lou board, not here.

---

## 1. What "Lou's UI and UX" means for Molly

Lou's look comes mostly from structure and discipline, not from decoration. In Molly terms, these are the fourteen patterns:

1. **One shell, three panes.** A slim sidebar, a main list, and a detail pane that slides in from the right while the list stays visible. A record opens beside the list rather than on a new page. A second action (or a button) widens the pane to a full page at the same address.
2. **A quiet sidebar.** A product mark at the top, then a "Search or jump" row that opens the palette. After that come short sections under plain sentence-case headings, with 32px items (28px in the concept; see "Density" below). Each count sits right-aligned in muted grey, and only counts that mean "this needs you" are emphasised. Theme and settings sit in the footer.
3. **A thin header and a chip bar.** Each view has a 52px header (the title plus a muted count, and actions on the right). Under it is a 44px bar of 28px filter chips: an unset chip is dashed with a plus, a set chip is tinted and shows its value with an ×, and "Clear all" appears when any filter is set.
4. **Dense one-line rows.** Rows are 44px with hairline dividers and no boxes around them. Group headers are sticky, carry a muted count, and collapse. The title gets the width, and the metadata (who, which company, age) is small, muted and on the right. Columns drop out as the list narrows.
5. **The keyboard runs everything.** A visible cursor (a short accent bar on the row's left edge) moves with `j`/`k`. `Enter` opens the pane, and `Esc` closes one layer at a time. `g` then a letter goes somewhere, and ⌘K opens a palette that holds actions as well as places. The shortcuts are shown, not taught: a faint key hint sits inside buttons and in the palette.
6. **Colour has two jobs that never mix.** *State* colours (red, amber, green) carry meaning, and appear only as small glyphs and short text. *Identity* colours (who, which company) appear only as small marks: a disc with an initial for a person, a rounded square for a company. There is one accent, used for the primary button, the cursor and focus.
7. **One typeface, small and even.** One sans (Inter) at a 14px base, 12px for metadata, and about 20px for a pane title. No uppercase mono labels. Molly keeps tabular figures, because it is a finance product.
8. **Depth from tone, not shadow.** Three or four grey surface tiers (page, sidebar, pane, raised) with hairline borders. Shadows appear only on things that float (palette, menus, toasts, dialogs). Radii are 6–10px.
9. **Light and dark.** The theme is applied before the first paint, so it never flashes, and each person picks it in the sidebar footer or the palette.
10. **The detail pane has a fixed order.** A header crumb with previous/next and close, then the title, then property chips. The one thing to do comes next, in a card with a single primary button, and only after it the explanation, related items and history.
11. **Motion is small and means something.** 80–160ms for hover, selection and pane slides. A row that leaves fades and collapses. Reduced motion removes all of it.
12. **Empty states are one or two plain sentences**, plus the single action that fills the screen.
13. **Board tiles are a title and one marker.** Only "waiting on you" is loud (a red edge, plus a red count on the column header). The tiles have no buttons except a "⋯" that appears on hover, and the card opens in the pane.
14. **Settings are the back of the object you're looking at.** They use the same shell and save on change, with a quiet "Saved" tick.

**Density: comfortable (owner decision, 2026-11-16, H-490 A).** After using WS156–WS159 the owner found the concept's spacing too tight. Nisat's review, `docs/design/redesign-v1-density.md`, is now the source of truth for every size in the new look: spacing steps 4/8/12/16/24/32/48 only; rows 44px (compact 36px, chosen per page for long tables such as Audit Log and Deal Ledger, never by the user); sidebar items 32px; buttons and inputs 36px; chips 28px; bars (logo row, header, pane crumb) 52px; gutter 24px (20px on phones); lists held in a 1104px column on wide windows; `text-row` 14/20. No user density setting. Where a workstream below gives a different number, section 4 of that file wins. The tokens are in the v2 block of `globals.css` (`--bar-h`, `--filter-h`, `--group-h`, `--list-row-h`, `--gutter`, `--column`, `--pane-gutter`); new layouts read them rather than repeating numbers. Already applied to the built shell and components (898288f).

What Molly already has (verified, F166): an admin ⌘K palette and `g` shortcuts (`src/components/layout/command-palette.tsx`, `src/components/layout/shortcuts.tsx`). Both are mounted for admins only (`src/components/layout/app-shell.tsx:19-20,35`). There is also `j`/`k`/`Enter` row movement in the shared table (`src/components/ui/data-table.tsx:281-311`), and a right-hand Sheet for board cards (`src/components/admin/board/card-sheet.tsx`). So patterns 5 and 13 are extensions of existing work, not new builds. Patterns 1, 3, 4, 6, 7, 8, 9 and 10 are new.

What Molly must keep, and Lou has no need for, because Molly has three audiences:
- The **investor link page** (`/share/[token]`) and **all emails** keep their current look. They carry each company's own theme (`globals.css:520-556`, `co-*` rules), and the people who read them are outside DFS. The PDF/print views are also unchanged (`globals.css:414-498`).
- **Founders** use Molly occasionally, often on a phone, so they need large touch targets and the "one next step" dashboard. **LPs** read a few reports a year and need calm reading pages. Density is an admin feature.

## 2. Screens affected

| Audience | Screens | Stage |
|---|---|---|
| Admin (DFS team) | Shell and sidebar (all `/admin/**`), dashboard → "Needs you", Approvals, Diligence, Companies + company detail, Updates + update detail, Investor Links, Memos (list, board, memo page), Funds + fund detail, Deal Ledger + portfolio detail, Portfolio Contacts, LPs, Fund Reports, Broadcasts, Team Board, Weekly Digest, Service Providers, Audit Log, Settings; palette, dialogs, sheets, toasts | 1 |
| Founder | Shell, Dashboard, Updates (list, composer, detail), From DFS, Metrics, Dilution Planner, Investor Links, Company Profile, Documents, Team, Service Providers, Diligence, setup wizard | 2 (Q143) |
| LP | `/lp` layout, sign-in, report list, report page | 2 (Q143) |
| Auth | `/login`, `/signup`, `/set-password`, LP sign-in | 2 (Q143) |
| Unchanged | `/share/[token]`, `/share/m/[token]`, every email template, update PDF export (`src/lib/pdf.ts`), print stylesheets | never |

## 3. Decisions for the owner (Q143–Q146)

Filed on the Lou board against B-124. Each has a recommendation; none is decided here.

| Q | Lou ask | Question | Recommended |
|---|---|---|---|
| Q143 | H-458 | Who gets the new look first? | **A**: the DFS team's screens first, with founders and LPs as a later stage that needs a fresh go-ahead. The investor link page and emails never change. |
| Q144 | H-459 | How much of Lou's look? | **B**: Lou's layout, density, type (Inter) and neutral greys, with Molly's Sky blue as the accent and the `_Molly` wordmark. Light by default, with a dark switch per person. |
| Q145 | H-460 | Ship behind a switch, or all at once? | **A**: in stages, behind an admin-only "Try the new look" switch. The new look becomes the default only when the owner says so, and the old look is then deleted. |
| Q146 | H-461 | Nisat mockup first? | **A**: yes. Nisat mocks up four screens and the owner approves them before any build. |

The plan below is written for the recommended answers. Where an answer changes the plan, the workstream says how (see "If Q… is not A").

## 4. Findings (F161–F167)

- **F161 (docs drift).** ROADMAP "Design & Branding" says the brand system is applied app-wide with "flat/structured corners (no pill/rounded shapes)". That stopped being true on 2026-10-11. Direction B gives founder, LP and auth pages 6–14px radii and pill chips (`src/app/globals.css:107-127`, `--r-chip: 9999px`). The line is annotated in ROADMAP in this pass.
- **F162 (shell constraint).** Every page imports `AppShell` itself (about 50 files under `src/app`, no route-group layout). The shell wraps all content in `mx-auto max-w-6xl px-4 py-6` (`app-shell.tsx:64`), so a full-width list plus pane cannot be built inside it today. WS158 adds an opt-out prop instead of moving the shell into layouts, which would touch every page.
- **F163 (hard-coded colour).** 82 colour usages across 41 `.tsx` files bypass the tokens: brand-name classes (`bg-paper`, `text-obsidian`, `border-bone`, `text-tide`, `bg-sky`…), `bg-white`/`text-white` and raw hex. Examples: the LP layout (`src/app/lp/layout.tsx:23,25,35`), the sidebar's active rule (`sidebar.tsx:207`, `before:bg-sky`), `toaster.tsx` (7), `lp-login-form.tsx` (6) and `admin/portfolio/[id]/page.tsx` (5). None of them follows a theme change, and in dark mode several become unreadable. WS157 sweeps them.
- **F164 (wordmark in dark).** The `_Molly` letters are a hard-coded `#14140F` fill (`src/components/ui/logo-mark.tsx:20`), so they disappear on a dark surface. The brand kit already has `molly/molly-wordmark-reverse.svg` ("The product has no dark mode, so nothing uses it yet", `docs/design/brand-assets/v3/MANIFEST.md:41`). WS157 makes the letters `currentColor` and keeps the Sky underscore.
- **F165 (test blind spot).** `design-tokens.test.ts` reads a variable's value with a first-match regex over `globals.css` (`src/lib/__tests__/design-tokens.test.ts:23-27`). If the new look redefines existing variables in a later scoped block, the test keeps checking the old values and passes, whatever the new ones are. WS156 adds a parser for the scoped block and a separate AA suite.
- **F166 (already there).** Palette, `g` shortcuts, the `?` sheet and table `j`/`k` exist (see section 1), but they are admin-only and have no layered `Esc`, no pane, and no key hints in buttons. The keyboard work is an extension of these.
- **F167 (no new API for the inbox).** The admin dashboard's "Needs attention" list is built from a pure function, `buildAttention` (`src/lib/attention.ts:10,41`; kinds `approvals`, `diligence`, `board`, `alert`, `overdue`), and rendered at `src/app/admin/page.tsx:237-337`. A Lou-style "Needs you" inbox can reuse it with no new route or query.

Added 2026-11-17, from the sweep of the admin pages no workstream covered (WS169–WS172). Pages swept: every `page.tsx` under `src/app/admin` (33 files). `/admin/templates` and `/admin/sync` are redirects only (to the Updates and Funds tabs). Besides the ten pages the owner listed, five more had no workstream: LPs, Add company (`companies/new`), the admin-filed update composer (`companies/[id]/updates/new`), New memo and Memo template. The Memos list view is already on `DataTable`, so it took the WS160 restyle and is not repeated here.

- **F168 (LPs is on DataTable but still looks old).** Three things, all in `src/app/admin/lps/page.tsx`. (1) It uses the default `AppShell` width (`:296`), so it sits in the 1104 text-page column, while every list page built so far passes `"wide"` or `"full"` and is capped at 1440 (`app-shell.tsx:111-117`; density doc §4 "Page", update of 2026-11-17). The list-page header rules (`globals.css:342-345`, `:534-536`) only match those two widths. (2) The email column is `font-mono text-xs` (`:56`), the one mono column left in a new-look list. (3) The fund slugs are `badge-neutral` with `!px-1.5 !py-0.5 !text-xs` (`:75`); the `!important` padding beats the new-look badge reset (`globals.css:418-427`, padding 0). The edit sheet's fund toggles are mono with a `primary-50` fill (`:427-429`). Found by reading the code; WS169 confirms it with a screenshot before and after.
- **F169 (the sweep's inventory, corrected).** Funds (`funds/page.tsx:146-169`) and Portfolio Contacts (`portfolio-contacts/page.tsx:244-267`) each have their own tab strip; the Funds one still draws its baseline under the new look (no `v2:border-b-0`). Funds, Fund Reports, Broadcasts and Weekly Digest show a box per record (`Link` or `Card` with a border), not rows. The Audit Log does have filters: five server-side chips with counts from the database (`audit/page.tsx:37-43,106-153`), so DataTable's own chips, which count only the loaded rows, cannot replace them. The Service Providers status filter and search are server-side too (`providers/page.tsx:75-78`). The Weekly Digest list (`digest/page.tsx`, 130 lines) is a simple list and belongs with the lists, not with the bigger pages. The Board tabs are Radix tabs (`board-client.tsx:400-413`), not `TabBar`, and the Settings tabs are server-rendered links (`settings-tabs.tsx`). The digest list wraps a `Button` inside a `Link` (`digest/page.tsx:67-72,110-112`), a button inside a link.
- **F170 (colour guard gap).** The three earth colours are fixed hex values (`tailwind.config.ts:65-67`: laterite, ochre, acacia), and the WS157 guard does not look for them (`no-hardcoded-colour.test.ts:32-33` lists only paper, bone, obsidian, tide and sky). There are 30 matching lines in 14 files under `src/app/admin` (Grep `(bg|border|text|ring)-(ochre|laterite|acacia)`), mostly hand-made notice boxes (`border-ochre/30 bg-ochre/10`) and the Settings status markers (`settings-status-strip.tsx:8-9`). They do not follow the dark theme. WS169–WS172 give each one on their pages a new-look class (the tone fills, or `var(--color-done)` / `var(--color-warn)` for state markers) and leave the old classes in place, so the old look is unchanged. Widening the guard to these names is left to WS167, once the stragglers outside these pages (Approvals, Deal Ledger, portfolio detail, Board) are listed.
- **F171 (the report preview is not what LPs see).** `ReportView` promises "whatever the admin sees here is exactly what an LP would see" (`src/components/report-view.tsx:24-30`). The admin preview renders it inside `AppShell` (`reports/[id]/preview/page.tsx:96`), so on the admin surface; the LP report page renders it under `lp/layout.tsx:23`, `data-surface="founder"` (Direction B). Even in the old look the two differ: the banner's founder-only fill (`report-view.tsx:35`), and Direction B radii and shadows on the mention and snapshot cards. With the new look on, the preview also takes Inter, the cool greys and the new-look badge rules, because the v2 token block and the `v2:` variant match anything inside the admin surface (`globals.css:143-144`; `tailwind.config.ts:235`). The snapshot table is the shared `Table` (`fund-snapshot-block.tsx:4` → `fund-performance-card.tsx:1`), so any future new-look styling on `Table` would reach the preview too. A `data-surface="founder"` wrapper inside the page cannot undo this. The founder block (`globals.css:112-132`) resets only radii, shadows and a few row and well colours. It does not reset `--font-sans`, `--color-bg`, `--color-surface`, the text tiers, the accent or the border, so the wrapper would inherit Inter and the new-look greys from the admin ancestor. The `v2:` variant and the `.badge-*` rules also match on any admin ancestor. WS172 therefore shows the preview in a same-origin frame that has no admin surface.
- **F172 (pages whose header never becomes the bar).** The 52px sticky bar forms only when `PageHeader` is the first child of `.shell-page` (`globals.css:328`). Settings wraps its header in `<div className="max-w-3xl">` (`settings/page.tsx:76`). New memo and Memo template put a `Breadcrumb` first (`memos/new/new-memo-form.tsx:50-51`, `memos/template/template-editor.tsx:70-71`). The Broadcast, Fund Report and admin update composers have no `PageHeader` at all, only `Breadcrumb` + `ComposerTopBar` (`broadcasts/[id]/page.tsx:323-325`, `reports/[id]/page.tsx:264-266`, `companies/[id]/updates/new/page.tsx:150`). The digest page and New digest draw their own `h1` (`digest/[id]/page.tsx:228-256`, `digest/new/page.tsx:203`). Under the new look none of these pages has a bar, so their titles sit at a different height from every other page. WS171 fixes Settings. WS172 gives the editors and forms WS163's record header.
- **F173 (two glyphs on some badges).** The new-look badge draws its own state glyph (`globals.css:428-453`). Three admin pages also put a lucide icon inside the badge: Service Providers (`providers/page.tsx:486-501`), the digest list (`digest/page.tsx:99-107`) and the digest page (`digest/[id]/page.tsx:260-268`). Under the new look these show a dot or triangle and an icon side by side. (The founder Service Providers page has the same markup, `src/app/providers/page.tsx:503-510`, but it is not on the admin surface, so it is unaffected.) Fix: `v2:hidden` on each icon inside a badge (WS169 digest list, WS171 Providers, WS172 digest page). The old look keeps its icons.
- **F174 (a button inside a link).** The Broadcasts and Fund Reports lists put the "Delete draft" `<button>` inside the row's `<Link>` (`broadcasts/page.tsx:151-180`, `reports/page.tsx:181-210`), the same fault F169 noted on the digest list. Interactive content inside `<a>` is invalid HTML and is announced badly. Under the new look WS169 moves Delete draft to a DataTable row action, which fixes it there. The old-look markup keeps the fault until WS168 deletes the old branch. That is acceptable, because it is not new.
- **F175 (the plain table has no new look).** `Table`, `Th` and `TableRow` (`src/components/ui/table.tsx`) carry no `v2:` classes: mono uppercase headings at 34px (`:60`) and a boxed card (`:24`). They are used by Audit Log, Portfolio Contacts, the broadcast delivery table, portfolio company detail and `FundPerformanceCard` (fund detail and the report snapshot). The founder Dilution Planner uses them too (`src/app/planner/[id]/page.tsx`), but `v2:` cannot reach founder pages. WS170 and WS172 move the Audit Log, Contacts and Delivery tables to `DataTable` under the new look and leave `Table` itself alone. Its two remaining admin users, portfolio detail and `FundPerformanceCard` on fund detail, belong to WS163. Restyling `Table` itself would also restyle the report preview's snapshot (F171), so WS163 must check the preview if it chooses that route.
- **F176 (the screenshot toolkit cannot see these pages yet).** `scripts/visual/shoot.ts:22-31` knows eight pages, none of them in WS169–WS172. `scripts/visual/setup.ts` seeds no service providers, LP users, investor links, broadcasts, digests or fund reports, so those lists would only screenshot as empty states, and the check would prove nothing about their rows. The rules before WS169 add placeholder rows to the seed.
- **F177 (outside this plan: any page can be framed).** Only the memo share page sends `frame-ancestors` (`src/lib/memo-share-page.ts:53`). `next.config.js:16-24` sets only noindex and cache headers, and nothing else in `src` sets `X-Frame-Options` or `frame-ancestors`. So another site can load an admin page in a frame (clickjacking). It is not fixed here, because it is a config change for its own card. WS172's frame is same-origin, so a later `frame-ancestors 'self'` will not break it.

A conflict to note, not a drift: the October overhaul spec chose "light theme only" and a flat, editorial, no-gradient look on purpose (`docs/design/app-ui-overhaul.md` §2 assumption 2, §1 "Modern … does not mean rounder, softer, or gradient-y"). It also kept mono uppercase labels (§3 "What is not dated"). Q144 A or B reverses those choices. If the owner agrees, WS168 marks that spec superseded.

## 5. Technical approach and judgment calls

**JC-RD-A: the new look redefines the existing variables under a scoped selector.** It adds no new class names. Molly's Tailwind colours, radii and shadows already read CSS variables (`tailwind.config.ts:12-137`). So a block like `html[data-look="v2"] [data-surface="admin"] { --color-bg: …; --color-surface: …; --r-md: … }` restyles every page that uses tokens with no component edits. Hard-coded colours (F163) are the exception, which is why WS157 exists. Reversal: delete the block.

**JC-RD-B: the switch is saved in the browser.** It lives in `localStorage` (`molly.look`, `molly.theme`), and a pre-paint inline script in `src/app/layout.tsx` sets `data-look` and `data-theme` on `<html>`. There is no schema change. Reversal: add a nullable `User.look` column later if the choice should follow a person across devices.

**JC-RD-C: scoped by surface.** In stage 1 the v2 tokens match only `[data-surface="admin"]`. The admin shell sets that attribute (`app-shell.tsx:24`), and `SurfaceSync` mirrors it onto `<body>` for portals (`surface-sync.tsx:17-24`). Founder, LP and auth pages keep `data-surface="founder"` and are untouched even when the switch is on. The share pages have no `data-surface`, so they stay on the `:root` defaults. Stage 2 widens the selector.

**JC-RD-D: no new dependency.** Inter comes from `next/font/google`, as Molly's three fonts do today. Radix, cmdk, lucide and swr are already installed.

**JC-RD-E: font override.** *As built (WS156):* Inter is set inside the admin block, not on `<html>`: `--font-sans` and `--font-display` both become `var(--font-inter)` under `html[data-look="v2"] [data-surface="admin"]` (and the `body[data-surface="admin"]` twin for portals). This keeps founder, LP, auth and share pages on Plex even with the switch on. Specificity is not an issue because the variable is redefined on a descendant of `<html>`, closer than the next/font class. (The first draft set `--font-sans` on `html[data-look="v2"]`; that would have reached every surface.)

**JC-RD-F: neutral greys and the accent are Molly's own values.** Nisat sets them in WS155 and the WS156 test enforces them. The accent is Molly's Sky family, as darkened for text today (`globals.css:12`, `#44688E`), with a lighter Sky for dark mode. Lou's values are not copied.

## 6. Order and stages

```
Stage 0  WS155 concept (Nisat + Nosa)  ── owner approves
Stage 1  WS156 tokens + switch ─ WS157 colour sweep ─ WS158 shell ─ WS159 components
         ─ WS160 lists + pane ─ WS169 simple lists ─ WS170 Audit Log + Portfolio Contacts
         ─ WS161 Needs you ─ WS162 boards ─ WS163 detail pages
         ─ WS171 Providers, Links, Diligence, Settings ─ WS172 editors and forms
         ─ WS164 keyboard ─ WS167 a11y pass (admin)       [all behind the switch]
         owner uses it for a week or two
Stage 2  WS165 founder ─ WS166 LP + auth ─ WS167 a11y pass (founder/LP)   [needs a fresh go-ahead, Q143 A]
Finish   WS168 make it the default, remove the old look
```

WS156 → WS157 → WS158 → WS159 must run in that order. WS160–WS164 and WS169–WS172 can run one at a time after WS159, but never two at once, because they share `data-table.tsx`, `globals.css` and the shell. Each workstream is one commit and can ship alone behind the switch.

**Order note (owner, 2026-11-17).** The simple lists come next after WS160: WS169, then WS170, then WS161. WS171 and WS172 come after WS163, because they reuse the record header WS163 builds. On the board, the WS169 and WS170 cards sit ahead of WS161.

**Concept ≈ 1 day, stage 1 ≈ 20.75 days, stage 2 ≈ 4.5 days, finish ≈ 1 day. Total ≈ 27.25 days.** With Q143 = C (admin only), the total is ≈ 22.75 days. (WS169–WS172 added 6.5 days to stage 1, including 0.25 day for the report-preview frame in WS172.)

## 7. Risks

1. **Founders and LPs see a big change (high).** This is handled by Q143 A (they come last, after the owner has lived with the admin look) and JC-RD-C (no founder page can change in stage 1). For stage 2, the founder dashboard keeps its single "next step" and its touch sizes (min 44px targets), whatever the density elsewhere.
2. **Contrast (AA) in two themes (high).** Every text/surface pair is checked in both themes by a test (WS156). There are about 149 legacy coloured-text usages that might fail AA (Oct follow-up list); WS157 reviews them and WS167 confirms them. Dark mode is where most failures hide: tone fills (`--tone-*`) need dark pairs.
3. **Two looks during the build (medium).** Both must keep working. To limit the surface: v2 is tokens plus a few `[data-look="v2"]` component rules in one marked section of `globals.css`, plus shell and pane components that render only when v2 is on. No page forks its markup.
4. **Tests (medium).** Only two test files render markup (`memo-components.test.tsx`, `data-table-render.test.tsx`), so most of the suite (1853 tests) is unaffected. The token tests need the new parser (F165). The surface-scoping test (`src/lib/__tests__/surface-scoping.test.ts`) must be extended so v2 never matches `/share` or emails. There are no browser or visual tests, so every stage ends with an owner click-through.
5. **tailwind-merge (low but has bitten before).** Any new `fontSize` role (WS156 adds `text-row`, `text-meta`, `text-pane-title`) must also be added to `extendTailwindMerge` in `src/lib/utils.ts:8-15`, or `cn()` silently drops it (the 2026-10-11 bug, `f4db3a4`).
6. **Print and PDF (low).** The LP and memo print rules force white and Obsidian (`globals.css:418-498`). WS167 checks print in dark mode: it must still print light.
7. **Scope creep (medium).** This is presentation only. No API, schema or permission change is allowed in any workstream except where it is named (none are).

---

## WS155 — Design concept: four screens, light and dark, ~1 day

**Goal.** Before anything is built, the owner sees what "Molly in Lou's layout and feel" looks like, on Molly's real screens with made-up data.

**Confirmed decisions.** None yet. This workstream exists if Q146 = A.

**Steps (Nisat, then Nosa).**
- `docs/design/redesign-v1.md` and `docs/design/redesign-v1.html`: a self-contained mockup (no build step). It has a switch for light/dark and desktop/phone, and covers four screens:
  1. Admin "Needs you" (WS161): sidebar with counts, header, chip bar, grouped one-line rows, pane open on an approval.
  2. Companies list with the pane open on "Acme Ltd" (WS160).
  3. Team Board with one waiting card and the card pane (WS162).
  4. Founder dashboard on a phone (WS165, for stage 2).
- A token table with Molly's own values for every role in section 1 pattern 8 (page, sidebar, pane, raised, hover, selected, hairline, control border, three text tiers, accent, accent-soft, done, stuck, warn, their soft fills, tone fill/ink pairs for dark) in light and dark. Each pair carries its contrast ratio.
- The identity marks: a person disc and a company square, with a deterministic colour from the name, and a palette that stays clear of the red, amber and green hue bands.
- Nosa: a words list for new labels ("Needs you", "Try the new look", "Back to the list", empty states, pane headings), in `docs/design/redesign-v1-copy.md`. The brand is "DFS"; never "DFS Lab".

**Acceptance.** The owner has opened the HTML and approved or marked changes. All names and figures are placeholders. Nothing is copied from Lou's repo. Every text pair in the token table is at least 4.5:1, and every glyph pair at least 3:1.

**If Q146 is not A.** Skip it. WS156 uses the role list in section 1 and Alvin picks values, which the test then checks.

**UX impact.** None (docs only). **Cost impact.** None.

## WS156 — New-look switch, tokens, Inter and the AA test, ~1.5 days

**Goal.** An admin-only "Try the new look" switch that restyles admin pages through tokens alone, in light and dark, with no flash on load.

**Confirmed decisions.** JC-RD-A, B, C, D, E, F (section 5).

**Steps.**
- `src/app/layout.tsx`: add `Inter` from `next/font/google` (`variable: "--font-inter"`, weights 400/500/600, `display: "swap"`), next to the three existing fonts. Add `suppressHydrationWarning` on `<html>`, and a pre-paint script as the first child of `<body>`:
  ```tsx
  <script
    dangerouslySetInnerHTML={{
      __html: `try{var l=localStorage.getItem("molly.look");var t=localStorage.getItem("molly.theme");if(l==="v2"){var d=document.documentElement;d.dataset.look="v2";d.dataset.theme=t==="dark"?"dark":"light";}}catch(e){}`,
    }}
  />
  ```
  Without v2, nothing is set and the page renders exactly as today.
- `src/lib/look.ts` (new, pure): `readLook()`, `setLook(look: "v1" | "v2")`, `setTheme(theme: "light" | "dark")`. These guard storage access the way `sidebar.tsx:165-185` does, and set the `<html>` attributes.
- `src/app/globals.css`: one new marked section, `/* ── New look (PLAN-1, WS156) ── */`, placed after the Direction B block:
  ```css
  html[data-look="v2"] [data-surface="admin"],
  html[data-look="v2"] body[data-surface="admin"] {
    --font-sans: var(--font-inter); --font-display: var(--font-inter);   /* as built: inside the admin block */
    --color-bg: …; --color-surface: …; --color-border: …;
    --color-text-primary: …; --color-text-secondary: …; --color-text-muted: …;
    --color-accent: #44688E; --color-accent-rgb: 68 104 142; --color-muted-rgb: …;
    --color-well: …; --color-row-hover: …; --color-row-divider: …; --color-sidebar: …;
    --color-pane: …; --color-sel: …; --color-open: …;          /* new roles */
    --r-sm: 4px; --r-md: 8px; --r-lg: 10px; --r-def: 6px; --r-ctl: 6px; --r-chip: 6px; --r-float: 12px; --r-sheet: 0px;
    --tracking-label: 0; --shadow-soft: none; --shadow-lift: none;
  }
  html[data-look="v2"][data-theme="dark"] [data-surface="admin"],
  html[data-look="v2"][data-theme="dark"] body[data-surface="admin"] { /* dark values, incl. --tone-* pairs, the dark primary scale (--color-primary-50/100/500/600/700) and the destructive pair (--color-destructive-rgb/-foreground), which the first draft left out */ color-scheme: dark; }
  ```
  Values come from WS155. `body { font-size }` is not changed globally. Base sizes change through the new type roles below.
- `tailwind.config.ts`: add colours `pane`, `sel`, `open` (pointing at the new variables), and three type roles: `row: ["13px", { lineHeight: "20px" }]`, `meta: ["12px", { lineHeight: "18px" }]`, `"pane-title": ["20px", { lineHeight: "28px", letterSpacing: "-0.012em", fontWeight: "600" }]`.
- `src/lib/utils.ts:11`: add `"row", "meta", "pane-title"` to the `font-size` class group (risk 5).
- Switch UI: a "Try the new look" item in the sidebar footer and in the palette (`src/lib/command-palette.ts`), for admins only. In v2 there is also a Light/Dark item. Nosa's words apply.
- Tests:
  - `src/lib/__tests__/design-tokens-v2.test.ts` (new): extract the v2 light and dark blocks by their marker comment, parse the variables, and assert AA for every text/surface pair in both themes. Required: text tiers on bg, surface, pane, well and row-hover; accent on bg and surface; on-accent on accent; every tone ink on its fill, in both themes (F165).
  - `surface-scoping.test.ts`: assert that every v2 selector contains `[data-surface="admin"]` (stage 1) and that none matches `:root` alone.
  - `look.test.ts`: storage failures fall back to v1.

**Acceptance.** With the switch off, a page diff is impossible (no attribute set; screenshots identical by eye). With it on, every admin page takes the new greys, radii and Inter, and founder, LP, auth and share pages are unchanged. A reload in dark shows no light flash. The tests pass, and `tsc` is clean.

**If Q145 is not A.** B: no switch, and the v2 block is written against `[data-surface="admin"]` directly, live on push. C: same as A, but the switch is removed only at WS168.

**UX impact.** Invisible unless an admin turns the switch on. **Cost impact.** None (one more Google font through next/font, self-hosted by Next).

## WS157 — Hard-coded colour sweep and the wordmark, ~1 day

**Goal.** Every colour on admin pages comes from a token, so both themes render correctly (F163, F164).

**Steps.**
- Replace the brand-name colour classes and `bg-white`/raw hex in the 41 files that Grep finds with `bg-white|text-white|bg-black|#[0-9A-Fa-f]{6}\b|bg-(paper|bone|…)|text-(paper|…)`, using token classes (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`). Two kinds stay: hex inside `share/**` and `company-brand.tsx` (the company theme), and the print stylesheets. Founder and LP files are swept too, because the change is invisible under v1: the token values equal the old literals. Example: `lp/layout.tsx:23` `bg-paper text-obsidian` → `bg-background text-foreground`. Under v1, `--color-bg` is `#EBE8DE` (Paper) and `--color-text-primary` is `#14140F` (Obsidian), so the rendering is the same.
- `src/components/ui/logo-mark.tsx:20`: the letters' `fill="#14140F"` → `fill="currentColor"`, with `text-foreground` on the `<svg>`. The underscore stays `#5B8DC5`. Under v1, `text-foreground` is Obsidian, so it is unchanged.
- `sidebar.tsx:207` `before:bg-sky` → `before:bg-mark` (only the v2 sidebar in WS158 drops the rule). *As built:* not `bg-primary`. Under v1 `--color-accent` is `#44688E`, but the old `sky` is `#5B8DC5`, so `bg-primary` would change the old look. WS157 adds a `--color-mark` token (`#5B8DC5` in `:root` and v2 light, `#7BA9DD` in v2 dark) and a `mark` Tailwind colour, and every Sky dot, insertion line, toast bar, outline and focus border uses it. The same applies to the toast (new `--color-toast` / `--color-toast-ink` tokens, dark in both themes), the scrim (`bg-obsidian/35` → `bg-[color:var(--scrim)]`, same value) and the select chevron (`--select-chevron`, stroke follows the muted text colour).
- Review the ~149 "legacy coloured-text" usages flagged in October. Any that uses a fixed palette colour as text moves to a tone ink token.
- Test: `src/lib/__tests__/no-hardcoded-colour.test.ts`, a guard in the style of the Part 32 "Molly team" test. It scans `src/app/admin/**` and `src/components/{ui,layout,admin}/**` for the regex and allows only listed exceptions.

**Acceptance.** Under v1, the founder, LP, admin and share pages look identical (owner spot-check of the dashboard, `/lp` and `/updates/[id]`). Under v2 dark, no Obsidian text sits on a dark surface. The guard test passes.

**UX impact.** None under v1 (same values through tokens). **Cost impact.** None.

## WS158 — App shell: sidebar, header bar, full-width main, ~1.5 days

**Goal.** Under v2, admin pages sit in the Lou-style shell: a quiet sidebar with counts, a 44px header per page, and a main area that can be full width (patterns 1–3).

**Steps.**
- `src/components/layout/app-shell.tsx`: add `width?: "page" | "full"` (default `"page"`, today's `max-w-6xl` box; F162). Under v2, `"full"` drops the box and the padding, so a page can render a split list and pane. Read the look from a `useLook()` hook in `src/lib/look.ts`, and keep v1 markup byte-for-byte when the look is v1.
- `src/components/layout/sidebar.tsx`: a v2 branch that keeps the nav data (`ADMIN_NAV_GROUPS`, `src/lib/admin-nav.ts:24`) and the counts (`NAV_COUNTS_KEY`, `sidebar.tsx:152`). It changes:
  - width 240px → 224px, items `h-7` (28px) and `text-row`;
  - the active item is `bg-sel` with no left rule;
  - group headings are sentence case `text-meta text-muted-foreground` (no mono caps);
  - counts are right-aligned and tabular, emphasised (`text-foreground`) for "needs you" (approvals, diligence) and muted for review counts. This reuses `countMarker` (`sidebar.tsx:112`);
  - the "Search or jump to" row is restyled, with `⌘K` as a faint `kbd`;
  - the footer has the person's disc, name, theme toggle and sign-out.
  The 4 groups and 17 items stay where they are. Re-ordering the nav is not in scope.
- `src/components/layout/page-header.tsx`: a v2 variant, a 44px bar with the title (`text-row font-medium`), a muted count, and actions on the right. Today's `PageHeader` props stay the same, so pages don't change.
- `src/components/ui/filter-bar.tsx` (new): chips as in pattern 3. DataTable's existing filter chips (`data-table.tsx`) render through it under v2.
- Mobile (under `md`): the sidebar becomes a drawer over a scrim, as today (`app-shell.tsx:27-34`), restyled.

**Acceptance.** Under v2, every admin page has the new sidebar and header, counts update after an approval (the `NAV_COUNTS_KEY` mutate path still works), and the drawer works at 390px. Under v1 nothing changes. Keyboard focus is visible on every sidebar item.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS159 — Core components in the new look, ~1.5 days

**Goal.** Buttons, inputs, chips, badges, tabs, dialogs, sheets, toasts, the palette and `kbd` follow patterns 6–8 under v2.

**Steps** (each a `[data-look="v2"]` rule or a small variant inside the existing component, so call sites don't change):
- `ui/button.tsx` and `.btn-*` (`globals.css:230-244`): under v2 the primary is sentence case, `text-row font-medium`, 32px high, solid `bg-primary`, and presses 1px down. Secondary is a ghost with a `line` border. An optional `kbd` prop shows a faint shortcut inside the button.
- `ui/badge.tsx` and `.badge-*`: under v2 a status becomes a small glyph plus a word (`text-meta`). Tinted fills stay only for stages and columns. `status-dot.tsx` works the same way.
- `ui/tab-bar.tsx`: underline tabs in `text-row`. The founder segmented style is untouched (it is founder-scoped).
- `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/toaster.tsx`, `ui/dropdown-menu.tsx`, `layout/command-palette.tsx`: `pane` surface, 12px radius on floating layers, the single float shadow, 120–160ms motion.
- `ui/name-tile.tsx`: an identity variant, a disc for people and a rounded square for companies, coloured by a deterministic hash of the name into Molly's identity palette from WS155. Pure helper `src/lib/identity-colour.ts` with a unit test of fixed sample names (`Acme`, `Example Co`).
- `.label` (`globals.css:252`): under v2, sentence case `text-meta text-muted-foreground`, not mono.
- `ui/empty-state.tsx` (added after the owner's WS158 check, 2026-11-16: the Approvals empty box "takes too much space"): under v2, pattern 12. No icon and no eyebrow; the title in `text-row` and the description in `text-meta` muted, left-aligned, about 12px of vertical padding, with the action (if any) on the same line or just below. Same props and the same words, so the ~37 pages that use it change together and no call site is edited.
- Buttons never wrap (same check: "Resend link" broke onto two lines in a table row): under v2 every `Button` and `.btn-*` is `whitespace-nowrap` with a `shrink-0` icon.

**Acceptance.** Under v2, a sample of pages (dashboard, Companies, a dialog, a toast with Undo) uses the new components, and there is one primary button per view. An empty Approvals queue is a short grey line, not a centred box, and "Resend link" stays on one line. `design-tokens-v2.test.ts` covers the button and chip pairs. Under v1, there is no visual change.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS160 — Dense lists and the side pane, ~2.5 days

**Goal.** Admin lists become dense one-line rows with sticky groups and a cursor, and opening a record shows it in a right-hand pane beside the list (patterns 1, 4, 10).

**Steps.**
- `ui/data-table.tsx`: a `density` prop under v2, default `"comfortable"` (44px rows, `--list-row-h`), with `"compact"` (36px rows, 32px group headers, same 14px text) chosen per page for long tables. Hairline dividers and `text-row`; row side padding 24 (the gutter), 12 between cells, 24 between metadata columns; metadata is `text-meta` muted and right-aligned; identity mark 20px; state glyph in a 20px slot so titles line up. Sticky group headers 36px with 24px above and no hairline, a count, collapse on click; `scroll-padding-top` equals the sticky stack so `j`/`k` never hide the cursor row. The cursor row gets `bg-sel` and the Sky underscore marker at the gutter (option A; no left-edge bar). On a wide window content sits in the 1104px column while row bands and hairlines run edge to edge. It keeps the existing `j`/`k`/`Enter` handler (`data-table.tsx:281-311`) and adds `o` = open full page. Container queries drop secondary columns under about 600px and 480px. Phone rows are 64px two-line. Sizes per `docs/design/redesign-v1-density.md` §4 "Lists".
- The filter chips stay single-choice (as DataTable has them today) and are restyled through `ui/filter-bar.tsx`: tinted with an × when set, "Clear filters" when any is set. Stacking several filters is not in scope (lead's call, told to the owner 2026-11-16).
- `src/components/layout/split-view.tsx` (new): `<SplitView list={…} pane={…} open={id} onClose={…} />`. The pane is `min(58%, 620px)`, on the `pane` surface, and slides in over 160ms. The open id lives in the URL (`?open=<id>`, via `router.replace`, no navigation). It has an expand button that goes to the record's full page (the existing route), and `Esc` closes it.
- `src/components/layout/detail-pane.tsx` (new): pattern 10, a header crumb with previous/next (the `j`/`k` pair) and close, then the title in `text-pane-title`, property chips, the action card, and the sections. Sizes: crumb 52px; body padding 32 top and sides, 48 bottom (phone 24 × 20); title to chips 16, chips to card 24; chips 28px; action card padding 24 with 32 below; 32 between sections, 12 under a section heading (density doc §4 "Side pane").
- Apply to: **Companies** (`src/app/admin/companies/page.tsx`; the pane shows the company summary: stage, owner, last update, cadence, the next action, "Open company"), **Updates** (`admin/updates/page.tsx`; the pane shows the update body read-only with its figures), and **Approvals** (`admin/approvals/page.tsx`, 907 lines: the pane shows the signup and its link suggestion, with Approve as the primary and the "Link & approve" path unchanged). These pages pass `width="full"` to `AppShell` under v2.
- Panes read existing endpoints only (the same fetches the full pages use). They add no new route.

**Acceptance.** Under v2, on Companies: `j`/`k` moves, `Enter` opens the pane, `j` in the pane steps to the next company, `Esc` closes it, and reloading `?open=` reopens it. Approve in the pane approves and the row leaves with a fade. Nav counts drop. A screen reader announces rows as options, with `aria-selected`. Under v1 nothing changes.

**UX impact.** Admin-only, behind the switch; full pages still exist at their old URLs. **Cost impact.** None.

## WS161 — "Needs you": the admin home as an inbox, ~1.5 days

**Goal.** Under v2, `/admin` opens on a Lou-style inbox of what needs the team today, with the KPIs below it.

**Steps.**
- `src/app/admin/page.tsx`: under v2, render the `buildAttention` items (F167) as grouped one-line rows: **Waiting on you** (approvals, diligence), **On the board** (board review), **Alerts** (metric alerts), **Behind on updates** (overdue). Each group is sticky, with a count, and collapses. `Enter` opens the item in the pane: approval → the WS160 approval pane, overdue company → company pane with Remind as the primary, alert → alert with Dismiss (the existing Undo, `PATCH /api/admin/alerts/[id]`).
- The existing KPI cards and chart move under the inbox in a "Portfolio" section, unchanged in data. Spacing: the section starts 48px below the last row, 12 under its heading; KPI tiles 16 padding, 16 gap, 4 between label and number. The page keeps its description beside the title.
- An empty state of two sentences from Nosa (WS155).
- `src/lib/attention.ts` stays as it is. Any grouping helper goes in a new pure function with tests next to `attention`'s.

**Acceptance.** Under v2, every item from today's "Needs attention" appears exactly once, the counts match the sidebar, and Remind/Dismiss behave as today, with toast and Undo. Under v1, the dashboard is unchanged.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS162 — Team Board and Memo board in Lou's board style, ~1.5 days

**Goal.** Board tiles become a title plus one marker. Only "waiting" is loud, and the card opens in the pane (pattern 13).

**Steps.**
- `components/admin/board/board-card.tsx`, `board-column.tsx`, `src/app/admin/board/board-client.tsx`: under v2, a tile is on the `raised` surface with an 8px radius. The top line holds the owner discs and, on the right, the due date or a hover "⋯" (the existing card menu). The title is up to 3 lines, with one marker line: Blocked or overdue (stuck colour, the red dog-ear and the column header count; no left edge, see the decisions below), To review (done ring), proof links count (quiet). Column headers are sticky with a count. Drag, keyboard moves, Undo and quick-add work exactly as today (Part 37 / `14fe9e2`).
- Spacing (density doc §4 "Board"): column header 36px; tile padding 12 × 16 with 12 between tiles; board padding 16 × 24; column gap 16; add item 36px; hover "⋯" 24px.
- `components/admin/board/card-sheet.tsx`: restyle it as the WS160 `DetailPane` (crumb, title, chips, Edit as the primary). `e` still edits.
- Owner decisions at concept review (2026-11-16, see `docs/design/redesign-v1.md` and `redesign-v1-copy.md`): columns are the four real statuses (To do, In progress, Blocked, Done); a stuck item reads "Blocked", never "Waiting on you". On a Blocked item the pane's primary is "Mark as unblocked", one click that moves it to In progress with Undo (audit-logged like any status move); Edit is secondary with `e`. Markers are option A: the Sky underscore block for the cursor on tiles and rows, and a red dog-ear for a blocked tile and for the pane's action card. No left-edge bars anywhere.
- `components/admin/memos/memo-board*.tsx`: the same tile anatomy. The Idle amber time and the Stage moves are unchanged (Parts 43–44).
- The Board's section tabs (`board-client.tsx:400-413`, Radix `Tabs.List` with mono caps triggers): under v2, no baseline and `TabBar`'s look, by `v2:` classes on the existing elements (they stay Radix tabs): the list gets `v2:border-b-0 v2:gap-6`, each trigger `v2:px-0 v2:py-2.5 v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal`. The active trigger keeps its 2px underline; that is the indicator, not a baseline (the same rule bf38e57 applied elsewhere). Density doc §4 "Controls": tabs 40 high, 24 apart, 24 below.

**Acceptance.** Under v2, drag, keyboard move and Undo work on both boards, a blocked card is the loudest tile, and the card sheet opens in the pane style. There is no data or API change.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS163 — Detail pages: company, update, memo, fund, ~2 days

**Goal.** Full-page records follow the pane anatomy at a 720px content column, so the pane and the full page look like one thing.

**Steps.**
- `admin/companies/[id]/page.tsx` and its tabs (`components/admin/company/*`), `updates/[id]/page.tsx` (admin view), `admin/memos/[id]/memo-client.tsx`, `admin/funds/[id]/page.tsx`, `admin/portfolio/[id]/page.tsx`: under v2, a header crumb with a back link to the list, then the title, a property-chip row, and the primary action. Tabs become underline tabs in `text-row`. Sections get `text-meta` headings, not mono caps. Tables inside use DataTable (comfortable unless the table is long). Spacing follows the pane: 32 gutter inside the 720 column, 32 between sections, 12 under a section heading.
- Founder-update provenance (the "From email · via Marge" line, figure tags and quote lines, B-113/B-116/B-117) keeps its content and order. Only the styling changes.
- The memo page keeps its print scope (`memo-print-scope`), and printing is checked in WS167.
- The memo section editor's Write / Preview tabs (`components/admin/memos/section-card.tsx:205-220`) draw a baseline (`border-b border-border` on the tab list). Under v2: `v2:border-b-0` on the list and `v2:text-row` on the tabs; the active tab's underline stays.

**Acceptance.** Under v2, each of the five pages renders with the new header and chips, nothing is lost relative to v1 (owner side-by-side check), and memo print still produces white pages.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS164 — Keyboard and palette parity, ~0.75 day

**Goal.** Pattern 5 everywhere in admin under v2.

**Steps.**
- `src/lib/shortcuts.ts` and `layout/shortcuts.tsx`: a layered `Esc` (palette → menu → drawer → full page back to split → pane → filters), `f` opens the palette prefilled with "Filter: ", and `?` stays. `g` keys are unchanged (`admin-nav.ts` goto keys).
- `src/lib/command-palette.ts`: actions alongside places. These are toggle theme, try or leave the new look, "Filter: …" on the current list, and "Open <company>" in the pane when on Companies.
- Buttons with a shortcut show a faint `kbd` (WS159 prop): Approve `A` in the approval pane, Remind `R`, Edit `E` on a board card.
- Tests: extend `src/lib/__tests__/navigation.test.ts` (which covers `stepShortcut` and `isTypingTarget`) for the `Esc` order and `f`.

**Acceptance.** All listed keys work under v2, nothing fires while typing in a field (`isTypingTarget`), and the `?` sheet lists the new keys.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS165 — Founder screens (stage 2), ~3 days

**Goal.** Founders get the new look, keeping what suits occasional and phone users.

**Confirmed decisions.** Needs Q143 = A or B, and a fresh go-ahead after stage 1.

**Steps.**
- Widen the v2 selectors from `[data-surface="admin"]` to `[data-surface]` for the founder pages. Direction B's founder block (`globals.css:107-127`) is overridden under v2, not edited. Show the switch to founders only if the owner wants a founder trial (else the owner flips the default in WS168).
- `sidebar.tsx` founder branch: the same v2 sidebar, with the company switcher kept at the top (`CompanySwitcher`, `sidebar.tsx:251`) and touch targets of at least 44px under `md`.
- `dashboard/page.tsx`: keep the single next action as the hero. Recent updates and metrics become dense rows on desktop and two-line rows on phones.
- `updates/**` (composer, list, detail), `company/**`, `planner/**`, `links`, `team`, `providers`, `from-dfs/**`, `diligence`, `setup-wizard`: the WS159 components and WS163 headers. The composer's chromeless editor (a "protected pattern", Part 32) keeps its layout.
- Lists keep full-page navigation on phones (no side pane under 760px; the pane becomes a full-screen sheet with a back chevron).

**Acceptance.** At 390px, every founder screen has no horizontal scroll and every target is at least 44px. The founder dashboard still shows one next step. The investor link page is unchanged.

**If Q143 = C.** Drop WS165 and WS166. WS168 then keeps Direction B for founder and LP pages.

**UX impact.** Visible to founders once the default flips: same content and places, new look. **Cost impact.** None.

## WS166 — LP portal and sign-in pages (stage 2), ~1 day

**Goal.** The LP portal and the auth pages take the new look as calm reading pages.

**Steps.**
- `src/app/lp/layout.tsx`: the header and footer in the new tokens (the WS157 sweep already moved them to token classes). Report pages use a 720px reading column with `text-body` (14px/22px) for report prose, not the 13px admin base. The `lp-print-scope` print rules are unchanged.
- `components/auth/auth-layout.tsx`, `/login`, `/signup`, `/set-password`, `components/lp/lp-login-form.tsx`: the new tokens, the `_Molly` wordmark, and one primary button. Copy is unchanged (Nosa checks).
- `src/app/page.tsx` (public landing, `data-surface="founder"` at line 36): new tokens.

**Acceptance.** An LP can sign in, open a report and print it (white pages, Obsidian text) in both themes. AA holds on every auth screen.

**UX impact.** Visible to LPs and anyone signing in once the default flips. **Cost impact.** None.

## WS167 — Accessibility and regression pass, ~1 day (0.5 per stage)

**Goal.** The new look meets WCAG 2.2 AA in both themes, and nothing outside scope moved.

**Steps.**
- Run `design-tokens-v2.test.ts` and `no-hardcoded-colour.test.ts` across the widened scope.
- Keyboard-only walk of every admin screen (stage 1) and founder/LP screen (stage 2), with the owner or Nisat. Check visible focus, layered `Esc`, `j`/`k`, and that the pane traps no focus.
- Reduced motion: pane slides, row fades and toasts are instant.
- Screen reader spot-check (VoiceOver): rows as options, pane headings, counts read with their meaning (`sr-only` text as in `sidebar.tsx:221`).
- Print: LP report and memo in dark mode print light.
- `surface-scoping.test.ts`: `/share/[token]`, `/share/m/[token]` and emails never match a v2 selector.
- `npx vitest run --exclude '.claude/**'` green, and `npx tsc --noEmit` clean.

**Acceptance.** The checklist is ticked for each stage, and any AA failure is fixed before the stage is called done.

**UX impact.** None (checks and fixes only). **Cost impact.** None.

## WS168 — Make it the default and remove the old look, ~1 day

**Goal.** One look again.

**Confirmed decisions.** Runs only when the owner says the new look is ready (Q145 A).

**Steps.**
- Move the v2 values into `:root` and the dark block to `html[data-theme="dark"]`. Delete the old `:root` values and the Direction B founder block (`globals.css:10-127` replaced), the `data-look` attribute, the switch and its palette item. Keep the theme toggle. Keep `data-surface` only if founder and LP pages still need a different density (decided at the time).
- Remove the v1 branches added in WS158–WS166.
- Remove IBM Plex Sans and Space Grotesk from `layout.tsx` if nothing uses them. Keep JetBrains Mono for code and figures if WS155 kept it. Grep every usage form (`font-display`, `font-mono`, `--font-display`, `var(--font-`) before removing anything.
- Update `design-tokens.test.ts` to the new values, and fold `design-tokens-v2.test.ts` into it.
- Docs: mark `docs/design/app-ui-overhaul.md` §2 (light only) and §11 (Direction B) as superseded by `docs/design/redesign-v1.md`. In ROADMAP, move the redesign into Existing Features → Design & Branding and correct "Dark mode removed" and "flat/structured corners".
- People who had the switch on keep their theme choice. `molly.look` is ignored from then on.

**Acceptance.** No `data-look` remains in `src`. The pages look as they did with v2 on. The tests and `tsc` pass. The owner does a final click-through of one page per audience.

**UX impact.** Everyone sees the new look from this push. This is the one visible moment, and the owner chooses when it happens. **Cost impact.** None.

---

## The remaining admin pages (WS169–WS172, added 2026-11-17)

The owner found that these admin pages still render in the old look with the switch on. No earlier workstream covered them. They are listed in F168–F170. The run order is in section 6: WS169 and WS170 come straight after WS160, and WS171 and WS172 come after WS163.

**Rules for all four** (the same as the earlier pieces):
- **The old look stays exactly as it is.** A page that moves to `DataTable` under the new look branches on `useNewLook()` (`src/lib/use-new-look.ts:13`) and keeps its current markup for the old look, as Approvals does (`approvals/page.tsx:796`). Class changes are `v2:` variants only. `data-table-v1-markup.test.tsx` stays green without its snapshot being re-recorded. WS168 deletes the old branches.
- **No database, package or cost change. No new API route.** Every list and pane reads the endpoint or server query the page already uses.
- **Sizes come from `docs/design/redesign-v1-density.md` §4.** List and table pages pass `width="wide"` (capped at 1440) or `"full"` (list plus pane). Text and form pages keep the default `"page"` (1104) and put records in a 720 column, as WS163 does. Under the old look all three widths are the same box (`app-shell.tsx:104-118`), so passing one is safe.
- **Lists have one line before the data** (bf38e57): no box around the table, no border under the filter bar, no tab baseline. A tab strip that is not `TabBar` copies the Updates page's `v2:` classes (`updates/page.tsx:224-246`).
- **Notice boxes and state markers** in the earth colours (F170) get a `v2:` tone class next to the old one: amber notices `v2:border-transparent v2:bg-tone-amber`, red `…bg-tone-clay`, green `…bg-tone-sage`; a state dot `v2:bg-[color:var(--color-done)]` or `--color-warn`. The text keeps its `text-tone-*-ink`.
- **Empty states** are `EmptyState` as they are (WS159 already restyles them under v2). The "No matches" box each page draws after its own search goes away under v2, because DataTable shows its own (`data-table.tsx:938-948`).
- **Checked with the screenshot toolkit before handover.** Every page is added to the `PAGES` map in `scripts/visual/shoot.ts:22-31`, and each workstream ends with a run in both looks and all three sizes (`npx tsx scripts/visual/shoot.ts --pages … `). The old-look pictures must match the ones taken before the change. Detail pages have random ids, so their keys open the list and follow the first row's link, as the `fund` key does (`shoot.ts:245-250`). If the local seed has no record of a kind, the shot shows the empty state, and the handover says so. No seeding against production.
- **Seed the records first (F176).** The local seed has none of the records these pages list. Each workstream adds placeholder rows for its own pages to `scripts/visual/setup.ts`, with the existing guard and names (Acme, Globex, `example.com`, round numbers), and enough of them to show a group, a long name and a phone wrap. WS169 adds two LP users, two fund reports (one draft, one published), two broadcasts (one draft, one sent with three recipients, one of them failed) and two digests (one sent). WS171 adds three service providers (pending, vetted, rejected), two investor links (one expired, with two views) and one diligence item that is ready for review (the seed already has one awaiting the founder). WS170 and WS172 need nothing new beyond these and the existing audit rows. Without these rows the screenshot check only shows empty states.
- **No second glyph on badges (F173).** Under the new look the badge draws its own state glyph. An icon inside a badge gets `v2:hidden`.

## WS169 — Simple lists on the shared table: Funds, Fund Reports, Broadcasts, Weekly Digest, and LPs, ~1.25 days

**Goal.** Under the new look, these five lists are one-line rows in the shared table, with search and filters in the filter bar, like Companies and the Deal Ledger.

**Confirmed decisions.** Owner, 2026-11-17: this comes next, before WS161. No pane on these pages: a row opens the record's existing page (`rowHref`), because each record already has a full page and none has a summary worth a pane.

**Steps.**
- `src/app/admin/lps/page.tsx` (F168): `AppShell width="wide"`. Email cell: `v2:font-sans v2:text-meta` on the span at `:56`. Funds cell: under v2, the slugs as plain muted text joined by " · ", with the column's `title` returning the full list, instead of the `badge-neutral !px-1.5 …` spans (`:73-79`). In the edit sheet, the fund toggles (`:427-429`) take the filter-chip look under v2: `v2:font-sans v2:rounded`, and when picked `v2:border-transparent v2:bg-[var(--color-accent-soft)] v2:text-primary` (the set chip in `filter-bar.tsx:64`).
- `src/app/admin/funds/page.tsx` (131-229): `width="wide"`. The tab strip (`:146-169`) takes the Updates page's `v2:` classes, which removes its baseline. Under v2 the Funds tab is a `DataTable<Fund>`: Name (with the slug after it in muted text), Group, Deals (num), LPs (num), AUM (num), First deal. `rowHref` `/admin/funds/${id}`, `searchText` name, slug and group, `defaultSort` name ascending, `empty` the existing EmptyState. The Sync tab is unchanged apart from sitting in the column.
- `src/app/admin/reports/page.tsx` (131-213): `width="wide"`. Under v2, `DataTable<Report>`: Title, Status (the existing `Badge`), Fund, Period, Mentions (num), Published. `searchText` title and fund name. `chips` Draft and Published (`test: r => r.status === "DRAFT"`). The fund `Select` moves into `toolbarExtra` (`data-table.tsx:110-111`) and keeps refetching with `?fundId=` (`:47,76-77`), so links from a fund page still land filtered. Delete draft becomes a `rowActions` button for drafts, calling the existing `handleDeleteDraft`.
- `src/app/admin/broadcasts/page.tsx` (117-183): `width="wide"`. Under v2, `DataTable<Broadcast>`: Subject ("Untitled" when empty), Status (Sent / Draft badge), Companies (num), Recipients (num, blank for drafts), Sent, By. `searchText` subject and sender. `chips` Draft and Sent. Delete draft as a row action, as on Reports.
- `src/app/admin/digest/page.tsx` (62-129): `width="wide"`. Under v2, `DataTable<DigestSummary>`: Title, Week of, Status (Sent / Draft badge; "From Granola" as a muted word after it), To-dos ("3 of 5", num), with `rowHref` `/admin/digest/${id}`. The per-row View button is dropped under v2 (the row is the link). Under v2 the header's "New Digest" is the `Link` itself with the `.btn-primary` class (WS159 restyled `.btn-*`; `Button` has no `asChild`), so there is no button inside a link (F169). The old look keeps its markup.
- `scripts/visual/shoot.ts`: add `lps`, `funds` (the list itself; the existing `fund` key keeps opening a fund's page), `reports`, `broadcasts` and `digest`.

**Acceptance.** Under v2, each of the five pages has the header, one filter bar and one-line rows, capped at 1440 on a wide window. Search, the chips and (on Reports) the fund select filter the rows. A row opens the record. Delete draft works and asks first, as today. LPs looks like the other lists: no mono, no boxed slugs. The Funds tabs have no baseline. On a phone the rows are two-line and nothing scrolls sideways. Under v1, the five pages are unchanged (screenshots match) and the v1 snapshot test passes. `tsc` is clean.

**UX impact.** Admin-only, behind the switch. Under v2 the boxes become rows and the search box moves into the filter bar; the content and actions are the same. **Cost impact.** None.

## WS170 — Audit Log and Portfolio Contacts on the shared table, ~1 day

**Goal.** The two table pages that still use the old `ui/table` take the new list look, without losing the Audit Log's server-side filters or the Contacts import.

**Steps.**
- `src/app/admin/audit/page.tsx`: the page stays a server component and keeps its query, its five filters and their database counts (`:93-123`). Under v2 it renders a new client component, `src/app/admin/audit/audit-table.tsx`, which gets the rows as plain data (dates as ISO strings) and the counts. It needs no new fetch. It must be a client component because DataTable's columns are functions, which a server component cannot pass down.
  - Filters: a `FilterBar` (`ui/filter-bar.tsx`) with the five filters as single-choice chips and their server counts. Picking one does `router.push("/admin/audit?filter=<key>")`, and the × and "Clear filters" go to `/admin/audit`. The old look keeps the link chips at `:132-153`.
  - Table: `DataTable` with `density="compact"` (the density doc names Audit Log for it, §3.4), `urlState={false}` (DataTable keeps its own `filter` value in the address, which would fight the page's `?filter=`), no search (the page shows only the last 100 events, so a search box would suggest it searches everything), and `defaultSort` time descending. Columns: Time (relative, with the full timestamp as `title`), Actor, Action (the friendly label if there is one, else the raw action, in the sans font under v2), Target, Details.
  - Details keeps its native `<details>` (`:52-81`). Judgment call: a row with an open `<details>` may grow, using one marked rule in the WS160 section of `globals.css`: `[data-datatable][data-density] tbody tr[data-row]:has(details[open]) { height: auto }`, with the cell allowed to wrap while it is open. Reversal: show the JSON in a side pane instead.
  - `width="wide"`.
- `src/app/admin/portfolio-contacts/page.tsx`: `width="wide"`. The tab strip (`:244-267`) takes the rest of the Updates page's `v2:` classes (it already has `v2:border-b-0`).
  - Contacts tab, under v2: `DataTable` with Company (`rowHref` `/admin/portfolio/${id}`), Contacts (num, amber ink when 0, as today), Molly account (the existing link, or "Not linked"), and Deals (num). `searchText` is the name. The "Only companies with no contacts" checkbox (`:332-340`) becomes a chip, "No contacts" (`test: c => c.contactCount === 0`). The "X of Y portfolio companies have at least one contact" line stays above the table as a `text-meta` line. The import result and error boxes (`:271-299`) take the F170 tone classes. The CSV format disclosure stays where it is.
  - Links tab, under v2: the two tables (`:399`, `:460`) become two `DataTable`s with `urlState={false}` (the prop is for pages with two tables). The existing Link button stays as a row action with `actionsAlwaysVisible`, since these rows exist to be acted on. The section headings use the section recipe (density doc §3.2: heading to description 4, description to table 12, section to section 48).
- `scripts/visual/shoot.ts`: add `audit` and `contacts`, and `contacts-links` (`/admin/portfolio-contacts?tab=links`).

**Acceptance.** Under v2, picking a filter on the Audit Log reloads with that filter and the counts match today's. Rows are 36px, and opening Details shows the full JSON without breaking the row below. On Portfolio Contacts, search, the "No contacts" chip, the CSV import and Link work as today, and the tabs have no baseline. Under v1, both pages are unchanged (screenshots match). `tsc` is clean.

**UX impact.** Admin-only, behind the switch. The checkbox becomes a chip under v2; nothing else moves. **Cost impact.** None.

## WS171 — Service Providers, Investor Links, Diligence and Settings, ~2 days

**Goal.** The four admin pages with their own layouts take the new look. Two of them get the list-plus-pane pattern, because each of their records has more detail than fits on one row.

**Confirmed decisions.** None needed beyond the rules above. Two judgment calls are flagged in the steps.

**Steps.**
- `src/app/admin/providers/page.tsx` (183-287): `width="wide"`.
  - Judgment call: under v2 the page loads once with `status=ALL` (already supported, `:78`), and the status filter and search run in the browser through DataTable's `chips` (Pending, Vetted, Rejected) and `searchText` (name, category). Today each keystroke refetches. The directory is small. Reversal: keep the server fetch and pass the status `Select` through `toolbarExtra`.
  - "Pending review" stays its own section above the rest, as a `DataTable` with `actionsAlwaysVisible` (Approve, Reject, Edit, Delete; the existing handlers). "All providers" is a second table with `urlState={false}`. The headings are sentence case `text-meta`, not mono caps (`:244`, `:267`), and the counts are muted numbers.
  - The Pending count pill (`:226`, `bg-ochre text-obsidian`, a listed exception in the colour guard) becomes the chip's own count under v2. The Reject button's laterite classes (`:470`) get the F170 treatment.
- `src/app/admin/links/page.tsx` (236-515): `width="full"`, using `SplitView` and `DetailPane` from WS160, like Companies.
  - The list: Label ("Untitled link"), Companies (the names as muted text, with the full list as `title`), Expires, Views (num), Created. Expired rows are muted (`rowClassName`). `chips` Active and Expired, and `searchText` label and company names.
  - The pane: a crumb, then the label as the title. Chips for the companies and the expiry. The action card has "Copy link" as the primary (the existing `copyLink`) and Revoke as secondary, with the existing two-step confirm. The Views section comes next, read from the existing `GET /api/links/${id}` (`:194`).
  - The "New Link" form stays inline above the list, toggled by the header button. It sits in the 720 column and loses its `Card` box under v2.
  - The error box (`:250`) takes the F170 tone class.
- `src/app/admin/diligence/page.tsx` (251-302): `width="full"` with `SplitView`, like Approvals, because each item carries badges, document counts and the questionnaire answers (`:159-248`).
  - Rows: Company, Founder, Progress ("3 of 5"), Created. They sit under two sticky groups, "Ready for review" and "Awaiting founder", split the same way as today (`:156-157`).
  - The pane: the founder line, the incorporation and essay badges, and the document counts as property chips. The action card has Promote as the primary for ready items and Decline as secondary, with the existing confirm and the `founderAccountsRetained` notice. Then "Open company", and the questionnaire answers (`DiligenceAnswers`, shown open in the pane).
  - The group headings lose the uppercase (`:275`, `:289`), and the notice (`:259`) takes the tone class.
  - Judgment call: the WS161 "Needs you" inbox links diligence items to this page rather than building a second diligence pane. Reversal: export the pane body and reuse it there.
- Settings (`src/app/admin/settings/*`):
  - `page.tsx:75-80` (F172): render `PageHeader` as the first child of `AppShell` and open the `max-w-3xl` wrapper after it, so the header becomes the 52px bar like every other page. In the old look the header has no action and a short description, so it looks the same outside the wrapper; confirm with the old-look screenshot.
  - `settings-tabs.tsx`: the tab baseline goes under v2, with the classes on the existing links: `v2:border-b-0` on the nav, and on each link `v2:px-0 v2:py-2.5 v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal`. The active link keeps its underline. It stays a server component.
  - `settings-status-strip.tsx`: under v2, no outer box (`v2:border-0`). It becomes a one-column list of 44px rows with hairlines, at most 720 wide. The markers become the state colours (`v2:bg-[color:var(--color-done)]`, `--color-warn`, and `--color-ctl` for neutral) and 6px round, like `StatusDot`.
  - `page.tsx`: the `<summary>` at `:173` and the one in `emails-sent-list.tsx:31` lose the mono caps under v2 (`v2:font-sans v2:text-meta v2:normal-case v2:tracking-normal`). Sections follow the section recipe. The same goes for the uppercase labels in `digest-recipients-panel.tsx:96,125`.
  - `orphaned-documents-panel.tsx:77`: the raw `<table>` becomes a `DataTable` under v2, with `urlState={false}`, the same columns and its existing actions. The storage and email notices (`storage-settings-panel.tsx:63`, `email-settings-panel.tsx:43`) take the tone class.
- `scripts/visual/shoot.ts`: add `providers`, `links`, `diligence`, `settings`, `settings-storage` and `settings-integrations` (via `?tab=`). For `links` and `diligence`, take a second shot with the first row open in the pane, as `companies-hover` does (`:267`).

**Acceptance.** Under v2, Providers filters by status and search, and Approve or Reject moves a provider between the sections. Investor Links opens a link in the pane: Copy copies it, Revoke asks and then removes it, and the views load. `?open=` survives a reload. Diligence opens an item in the pane, and Promote and Decline behave as today (including the retained-account notice). Settings has no tab baseline and no mono caps, and its status markers are the state colours in both themes. Under v1, all four pages are unchanged (screenshots match). `tsc` is clean.

**UX impact.** Admin-only, behind the switch. Under v2, Investor Links and Diligence open records beside the list instead of in boxes down the page. The actions and their confirms are the same. **Cost impact.** None.

## WS172 — Editors and forms: digest, broadcast and report pages, and the create forms, ~2.25 days

**Goal.** The admin editor and form pages use WS163's record header and a 720 column under the new look, so writing a digest, a broadcast or a report feels like the rest of the new look.

**Confirmed decisions.** Runs after WS163 and reuses its header (crumb back to the list, title, property chips, the one primary action).

**Steps.**
- Columns: the editors centre a `max-w-3xl` column today (`broadcasts/[id]/page.tsx:381`, `reports/[id]/page.tsx:349`, `companies/[id]/updates/new/page.tsx:164`). Under v2 they add `v2:mx-0 v2:max-w-[720px]`, left-aligned like WS163. `AppShell` keeps the default `"page"` width.
- One primary per view: the page's forward action (Send on a broadcast, Publish on a report, Send on a digest, Create on a form) is the only primary `Button`. The rest become secondary or ghost under v2. Each page's actions are listed in the handover, so the owner can check that none was lost.
- `src/app/admin/digest/[id]/page.tsx` (226-449): the section `Card`s (`:338`, `:362`) lose their `border-b` heading rule under v2 (`v2:border-b-0 v2:pb-0`), with `text-meta` headings and the section recipe. The prose stays as it is.
- `src/app/admin/digest/new/page.tsx` (193-424): the same treatment for its cards (`:208`, `:255`, `:279`, `:293`). The notice (`:248`), the to-do dots (`:303`) and the source chips (`:334`) take the F170 tone and state classes.
- `src/app/admin/broadcasts/[id]/page.tsx` (322-532): header and column as above. The notice at `:363` takes the tone class. The Delivery table (`:504`, `ui/table`) becomes a `DataTable` under v2 (`urlState={false}`, the same columns), and its heading (`:497`) becomes `text-meta`.
- `src/app/admin/reports/[id]/page.tsx` (263-413): header and column as above. The notice at `:296` and the mention chips at `:390` (mono, laterite) take the new-look classes.
- `src/app/admin/reports/[id]/preview/page.tsx`: this preview renders the LPs' own `ReportView` inside the admin shell (`:96-107`). Under v2 the admin tokens restyle it, so it no longer shows what LPs see (LP pages stay in the old look until WS166). It must keep the LP look (owner's brief, 2026-11-17). A `data-surface="founder"` wrapper is not enough (F171): it would still inherit Inter and the new-look greys, and the `v2:` and badge rules still match through it. Judgment call (corrected 2026-11-17): show the preview in a same-origin frame under v2.
  - Move the data loading at `:17-93` into a server helper, `src/lib/report-preview.ts` (`loadReportPreview(id)` → `{ report, mentions, fundSnapshot } | null`). Both routes call it, so the frame cannot drift from the page.
  - New route `src/app/admin/reports/[id]/preview/frame/page.tsx`. It has the same admin check as the page (`:11-14`), no `AppShell`, and the LP layout's own wrapper and padding (`lp/layout.tsx:23,33`):
    ```tsx
    return (
      <div data-surface="founder" className="lp-print-scope min-h-screen bg-background px-6 py-12 text-foreground sm:px-10 sm:py-16">
        <SurfaceSync surface="founder" />
        <ReportView {...props} previewBanner />
      </div>
    );
    ```
    With no admin surface anywhere in the frame's document, no new-look rule can match. It renders exactly as `/lp/reports/[id]` does, in both looks.
  - `preview/page.tsx`: keep today's `ReportView` and add `v2:hidden` on a wrapper around it, so the old look is byte-for-byte unchanged. Next to it:
    ```tsx
    <iframe
      src={`/admin/reports/${id}/preview/frame`}
      title="Report as LPs see it"
      loading="lazy"
      className="hidden w-full border-0 v2:block v2:h-[calc(100dvh-var(--bar-h)-48px)]"
    />
    ```
    The old look never shows it (`hidden`), and Chrome does not load a lazy frame that is not displayed. The frame scrolls on its own, and the page itself does not scroll.
  - Read-only: the frame route has no actions and no new API. F177 does not block it, because nothing forbids same-origin framing.
  - Reversal: delete the frame route and the iframe; the preview then takes the new look. Once WS166 has moved LP pages to the new look, WS168 replaces both with a single plain render.
  - Acceptance for this step: in the screenshots, the new-look preview of a published report looks the same as `/lp/reports/[id]` for that report, including the fund snapshot table and the mention cards. The LP page needs an LP session (`getLp`, `lp/layout.tsx:20`). If the toolkit cannot sign in as an LP, the handover says so and the owner compares the two by eye. The old-look screenshots are unchanged.
- Create forms: `companies/new/page.tsx` (113-305; two `Card`s at `:128`, `:191`), `memos/new/new-memo-form.tsx` (`Card` at `:52`), `memos/template/template-editor.tsx` (a `Card` per section at `:84`) and `companies/[id]/updates/new/page.tsx` (199). Under v2 they keep their fields and order. The cards become sections in the 720 column (section recipe; `v2:border-0 v2:bg-transparent v2:shadow-none v2:p-0` on the card). Check that inputs and selects are 36px (density doc §4 "Controls"); if the shared `Input` and `Select` are not, fix them there with `v2:` classes, not per page. The submit row stays at the bottom with one primary.
- `scripts/visual/shoot.ts`: add `digest-detail`, `broadcast-detail` and `report-detail` (each opens its list and follows the first row, as `fund` does), plus `report-preview`, `digest-new`, `company-new`, `memo-new` and `memo-template`.

**Acceptance.** Under v2, each page has the WS163 header and sits in the 720 column. Every action that exists under v1 is still there, and there is one primary per view. The report preview looks like the LP report page. Sending, publishing and creating work as today. Under v1, the pages are unchanged (screenshots match). `tsc` is clean.

**UX impact.** Admin-only, behind the switch. The same fields and actions, in the new layout. **Cost impact.** None.
