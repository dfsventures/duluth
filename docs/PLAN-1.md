# PLAN-1 — Molly redesign in Lou's layout and feel (WS155–WS168, F161–F167, Q143–Q146, 2026-11-16)

Author: Felix. Plan only; nothing here is built. Board card B-124. The owner asked for "a big redesign of Molly so it looks more modern and has the same UI and UX as Lou". Lou is DFS's own agent inbox app, a separate private product. This plan describes Lou's patterns in Molly's own words and builds them from Molly's own code. **No Lou code, class names, token values or content may be copied into this repo** (the repo is public). Every company, person, fund and amount in mockups, tests and copy is a placeholder (Acme, example.com, round numbers).

This file continues the numbering in `docs/IMPLEMENTATION_PLAN.md` (that file ends at WS154, F160, Q142). It is a new file at the owner's request; it is not appended to the old one.

Status lives on the Lou board, not here.

---

## 1. What "Lou's UI and UX" means for Molly

Lou's look comes mostly from structure and discipline, not from decoration. In Molly terms, these are the fourteen patterns:

1. **One shell, three panes.** A slim sidebar, a main list, and a detail pane that slides in from the right while the list stays visible. A record opens beside the list rather than on a new page. A second action (or a button) widens the pane to a full page at the same address.
2. **A quiet sidebar.** A product mark at the top, then a "Search or jump" row that opens the palette. After that come short sections under plain sentence-case headings, with 28px items. Each count sits right-aligned in muted grey, and only counts that mean "this needs you" are emphasised. Theme and settings sit in the footer.
3. **A thin header and a chip bar.** Each view has a 44px header (the title plus a muted count, and actions on the right). Under it is a 40px bar of filter chips: an unset chip is dashed with a plus, a set chip is tinted and shows its value with an ×, and "Clear all" appears when any filter is set.
4. **Dense one-line rows.** Rows are about 38px with hairline dividers and no boxes around them. Group headers are sticky, carry a muted count, and collapse. The title gets the width, and the metadata (who, which company, age) is small, muted and on the right. Columns drop out as the list narrows.
5. **The keyboard runs everything.** A visible cursor (a short accent bar on the row's left edge) moves with `j`/`k`. `Enter` opens the pane, and `Esc` closes one layer at a time. `g` then a letter goes somewhere, and ⌘K opens a palette that holds actions as well as places. The shortcuts are shown, not taught: a faint key hint sits inside buttons and in the palette.
6. **Colour has two jobs that never mix.** *State* colours (red, amber, green) carry meaning, and appear only as small glyphs and short text. *Identity* colours (who, which company) appear only as small marks: a disc with an initial for a person, a rounded square for a company. There is one accent, used for the primary button, the cursor and focus.
7. **One typeface, small and even.** One sans (Inter) at a 13px base, 12px for metadata, and about 20px for a pane title. No uppercase mono labels. Molly keeps tabular figures, because it is a finance product.
8. **Depth from tone, not shadow.** Three or four grey surface tiers (page, sidebar, pane, raised) with hairline borders. Shadows appear only on things that float (palette, menus, toasts, dialogs). Radii are 6–10px.
9. **Light and dark.** The theme is applied before the first paint, so it never flashes, and each person picks it in the sidebar footer or the palette.
10. **The detail pane has a fixed order.** A header crumb with previous/next and close, then the title, then property chips. The one thing to do comes next, in a card with a single primary button, and only after it the explanation, related items and history.
11. **Motion is small and means something.** 80–160ms for hover, selection and pane slides. A row that leaves fades and collapses. Reduced motion removes all of it.
12. **Empty states are one or two plain sentences**, plus the single action that fills the screen.
13. **Board tiles are a title and one marker.** Only "waiting on you" is loud (a red edge, plus a red count on the column header). The tiles have no buttons except a "⋯" that appears on hover, and the card opens in the pane.
14. **Settings are the back of the object you're looking at.** They use the same shell and save on change, with a quiet "Saved" tick.

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

A conflict to note, not a drift: the October overhaul spec chose "light theme only" and a flat, editorial, no-gradient look on purpose (`docs/design/app-ui-overhaul.md` §2 assumption 2, §1 "Modern … does not mean rounder, softer, or gradient-y"). It also kept mono uppercase labels (§3 "What is not dated"). Q144 A or B reverses those choices. If the owner agrees, WS168 marks that spec superseded.

## 5. Technical approach and judgment calls

**JC-RD-A: the new look redefines the existing variables under a scoped selector.** It adds no new class names. Molly's Tailwind colours, radii and shadows already read CSS variables (`tailwind.config.ts:12-137`). So a block like `html[data-look="v2"] [data-surface="admin"] { --color-bg: …; --color-surface: …; --r-md: … }` restyles every page that uses tokens with no component edits. Hard-coded colours (F163) are the exception, which is why WS157 exists. Reversal: delete the block.

**JC-RD-B: the switch is saved in the browser.** It lives in `localStorage` (`molly.look`, `molly.theme`), and a pre-paint inline script in `src/app/layout.tsx` sets `data-look` and `data-theme` on `<html>`. There is no schema change. Reversal: add a nullable `User.look` column later if the choice should follow a person across devices.

**JC-RD-C: scoped by surface.** In stage 1 the v2 tokens match only `[data-surface="admin"]`. The admin shell sets that attribute (`app-shell.tsx:24`), and `SurfaceSync` mirrors it onto `<body>` for portals (`surface-sync.tsx:17-24`). Founder, LP and auth pages keep `data-surface="founder"` and are untouched even when the switch is on. The share pages have no `data-surface`, so they stay on the `:root` defaults. Stage 2 widens the selector.

**JC-RD-D: no new dependency.** Inter comes from `next/font/google`, as Molly's three fonts do today. Radix, cmdk, lucide and swr are already installed.

**JC-RD-E: font override.** next/font puts its variables on `<html>` through a class. `html[data-look="v2"]` has higher specificity (0,1,1) than that class (0,1,0), so `html[data-look="v2"] { --font-sans: var(--font-inter); }` wins without `!important`.

**JC-RD-F: neutral greys and the accent are Molly's own values.** Nisat sets them in WS155 and the WS156 test enforces them. The accent is Molly's Sky family, as darkened for text today (`globals.css:12`, `#44688E`), with a lighter Sky for dark mode. Lou's values are not copied.

## 6. Order and stages

```
Stage 0  WS155 concept (Nisat + Nosa)  ── owner approves
Stage 1  WS156 tokens + switch ─ WS157 colour sweep ─ WS158 shell ─ WS159 components
         ─ WS160 lists + pane ─ WS161 Needs you ─ WS162 boards ─ WS163 detail pages
         ─ WS164 keyboard ─ WS167 a11y pass (admin)       [all behind the switch]
         owner uses it for a week or two
Stage 2  WS165 founder ─ WS166 LP + auth ─ WS167 a11y pass (founder/LP)   [needs a fresh go-ahead, Q143 A]
Finish   WS168 make it the default, remove the old look
```

WS156 → WS157 → WS158 → WS159 must run in that order. WS160–WS164 can run one at a time in any order after WS159, but never two at once, because they share `data-table.tsx`, `globals.css` and the shell. Each workstream is one commit and can ship alone behind the switch.

**Concept ≈ 1 day, stage 1 ≈ 14.25 days, stage 2 ≈ 4.5 days, finish ≈ 1 day. Total ≈ 20.75 days.** With Q143 = C (admin only), the total is ≈ 16.25 days.

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
  html[data-look="v2"] { --font-sans: var(--font-inter); }
  html[data-look="v2"] [data-surface="admin"],
  html[data-look="v2"] body[data-surface="admin"] {
    --color-bg: …; --color-surface: …; --color-border: …;
    --color-text-primary: …; --color-text-secondary: …; --color-text-muted: …;
    --color-accent: #44688E; --color-accent-rgb: 68 104 142; --color-muted-rgb: …;
    --color-well: …; --color-row-hover: …; --color-row-divider: …; --color-sidebar: …;
    --color-pane: …; --color-sel: …; --color-open: …;          /* new roles */
    --r-sm: 4px; --r-md: 8px; --r-lg: 10px; --r-def: 6px; --r-ctl: 6px; --r-chip: 6px; --r-float: 12px; --r-sheet: 0px;
    --tracking-label: 0; --shadow-soft: none; --shadow-lift: none;
  }
  html[data-look="v2"][data-theme="dark"] [data-surface="admin"],
  html[data-look="v2"][data-theme="dark"] body[data-surface="admin"] { /* dark values, incl. --tone-* pairs */ color-scheme: dark; }
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
- `sidebar.tsx:207` `before:bg-sky` → `before:bg-primary` (only the v2 sidebar in WS158 drops the rule).
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

**Acceptance.** Under v2, a sample of pages (dashboard, Companies, a dialog, a toast with Undo) uses the new components, and there is one primary button per view. `design-tokens-v2.test.ts` covers the button and chip pairs. Under v1, there is no visual change.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS160 — Dense lists and the side pane, ~2.5 days

**Goal.** Admin lists become dense one-line rows with sticky groups and a cursor, and opening a record shows it in a right-hand pane beside the list (patterns 1, 4, 10).

**Steps.**
- `ui/data-table.tsx`: a `density="compact"` mode under v2. Rows are 38px with hairline dividers and `text-row`; metadata is `text-meta` muted and right-aligned; sticky group headers with a count collapse on click; the cursor row gets `bg-sel` and a 3px accent edge. It keeps the existing `j`/`k`/`Enter` handler (`data-table.tsx:281-311`) and adds `o` = open full page. Container queries drop secondary columns under 560px and 420px.
- `src/components/layout/split-view.tsx` (new): `<SplitView list={…} pane={…} open={id} onClose={…} />`. The pane is `min(58%, 620px)`, on the `pane` surface, and slides in over 160ms. The open id lives in the URL (`?open=<id>`, via `router.replace`, no navigation). It has an expand button that goes to the record's full page (the existing route), and `Esc` closes it.
- `src/components/layout/detail-pane.tsx` (new): pattern 10, a header crumb with previous/next (the `j`/`k` pair) and close, then the title in `text-pane-title`, property chips, the action card, and the sections.
- Apply to: **Companies** (`src/app/admin/companies/page.tsx`; the pane shows the company summary: stage, owner, last update, cadence, the next action, "Open company"), **Updates** (`admin/updates/page.tsx`; the pane shows the update body read-only with its figures), and **Approvals** (`admin/approvals/page.tsx`, 907 lines: the pane shows the signup and its link suggestion, with Approve as the primary and the "Link & approve" path unchanged). These pages pass `width="full"` to `AppShell` under v2.
- Panes read existing endpoints only (the same fetches the full pages use). They add no new route.

**Acceptance.** Under v2, on Companies: `j`/`k` moves, `Enter` opens the pane, `j` in the pane steps to the next company, `Esc` closes it, and reloading `?open=` reopens it. Approve in the pane approves and the row leaves with a fade. Nav counts drop. A screen reader announces rows as options, with `aria-selected`. Under v1 nothing changes.

**UX impact.** Admin-only, behind the switch; full pages still exist at their old URLs. **Cost impact.** None.

## WS161 — "Needs you": the admin home as an inbox, ~1.5 days

**Goal.** Under v2, `/admin` opens on a Lou-style inbox of what needs the team today, with the KPIs below it.

**Steps.**
- `src/app/admin/page.tsx`: under v2, render the `buildAttention` items (F167) as grouped one-line rows: **Waiting on you** (approvals, diligence), **On the board** (board review), **Alerts** (metric alerts), **Behind on updates** (overdue). Each group is sticky, with a count, and collapses. `Enter` opens the item in the pane: approval → the WS160 approval pane, overdue company → company pane with Remind as the primary, alert → alert with Dismiss (the existing Undo, `PATCH /api/admin/alerts/[id]`).
- The existing KPI cards and chart move under the inbox in a "Portfolio" section, unchanged in data.
- An empty state of two sentences from Nosa (WS155).
- `src/lib/attention.ts` stays as it is. Any grouping helper goes in a new pure function with tests next to `attention`'s.

**Acceptance.** Under v2, every item from today's "Needs attention" appears exactly once, the counts match the sidebar, and Remind/Dismiss behave as today, with toast and Undo. Under v1, the dashboard is unchanged.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS162 — Team Board and Memo board in Lou's board style, ~1.5 days

**Goal.** Board tiles become a title plus one marker. Only "waiting" is loud, and the card opens in the pane (pattern 13).

**Steps.**
- `components/admin/board/board-card.tsx`, `board-column.tsx`, `src/app/admin/board/board-client.tsx`: under v2, a tile is on the `raised` surface with an 8px radius. The top line holds the owner discs and, on the right, the due date or a hover "⋯" (the existing card menu). The title is up to 3 lines, with one marker line: Blocked or overdue (stuck colour, with a red left edge and the column header count), To review (done ring), proof links count (quiet). Column headers are sticky with a count. Drag, keyboard moves, Undo and quick-add work exactly as today (Part 37 / `14fe9e2`).
- `components/admin/board/card-sheet.tsx`: restyle it as the WS160 `DetailPane` (crumb, title, chips, Edit as the primary). `e` still edits.
- `components/admin/memos/memo-board*.tsx`: the same tile anatomy. The Idle amber time and the Stage moves are unchanged (Parts 43–44).

**Acceptance.** Under v2, drag, keyboard move and Undo work on both boards, a blocked card is the loudest tile, and the card sheet opens in the pane style. There is no data or API change.

**UX impact.** Admin-only, behind the switch. **Cost impact.** None.

## WS163 — Detail pages: company, update, memo, fund, ~2 days

**Goal.** Full-page records follow the pane anatomy at a 720px content column, so the pane and the full page look like one thing.

**Steps.**
- `admin/companies/[id]/page.tsx` and its tabs (`components/admin/company/*`), `updates/[id]/page.tsx` (admin view), `admin/memos/[id]/memo-client.tsx`, `admin/funds/[id]/page.tsx`, `admin/portfolio/[id]/page.tsx`: under v2, a header crumb with a back link to the list, then the title, a property-chip row, and the primary action. Tabs become underline tabs in `text-row`. Sections get `text-meta` headings, not mono caps. Tables inside use DataTable compact.
- Founder-update provenance (the "From email · via Marge" line, figure tags and quote lines, B-113/B-116/B-117) keeps its content and order. Only the styling changes.
- The memo page keeps its print scope (`memo-print-scope`), and printing is checked in WS167.

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
