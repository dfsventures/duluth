# Molly redesign: density review

Status: **proposal for Joseph, 2026-11-16. Nothing is built.** Author: Nisat. It follows Joseph's note after using the new look: "Everything seems so close together." It is a follow-up to `redesign-v1.md` (the approved concept) and `docs/PLAN-1.md`. Mockup: `docs/design/redesign-v1.html`. It now has a **Density: Approved / Proposed** toggle in the top strip, and a **Wide** window option. All names are placeholders. Every number is Molly's own, taken from the old look and a 4px grid.

## 1. The short answer

Joseph is right, and the numbers show why. The new look is 10 to 60 percent tighter than the old look in nearly every dimension, all at once. The biggest loss is the space between groups.

**Recommendation: one density, "Comfortable", as the default for the whole new look. No user toggle.** Text goes from 13px to 14px for rows, nav and buttons. Molly's lists are short (15 companies, about a dozen late updates), so density was buying nothing and costing calm.

The top five changes:

1. **Space between groups: 24px** in the sidebar and in lists (was 12 and 0), and 48px between page sections.
2. **Row 44px** (was 38), nav item 32 (was 28), chip 28 (was 24), button and input 36 (was 32). Button side padding 16 (was 12).
3. **One 24px gutter** on every edge (was 16), and on a wide window the content stays in a 1104px column.
4. **The logo row, header bar and pane crumb are all 52px**, so the wordmark, the page title and the two hairlines line up (they were 52, 44, 44).
5. **Type 14/20 for rows** with 12px metadata, and the page title semibold with a hairline before its description.

What it costs: about 15 percent fewer rows per screen. On a window around 1,000px tall (his screenshots suggest about that), the whole Needs you screen, Portfolio tiles included, still fits. On a 13-inch laptop the tiles sit one scroll down.

## 2. Diagnosis, ranked by how much each adds to the "tight" feeling

First the evidence. This is how far the new look moved from the old look, measured in the code as built:

| Thing | Old look | New look today | Change |
|---|---|---|---|
| Space above a sidebar group heading | 33 (16 + rule + 16) | 12 | −64% |
| Top of page to first content, page mode, with a description | 120 (32 pad + 56 title block + 32 gap) | 68 (44 bar + 24 gap) | −43% |
| Sidebar item pitch (height + gap) | 40 (36 + 4) | 28 | −30% |
| Filter chip height | 32 | 24 | −25% |
| Input height | 40 | 32 | −20% |
| Logo row | 64 | 52 (44 before the interim fix) | −19% |
| Table row | 44 | 38 (WS160 spec) | −14% |
| Button height, side padding | 36, 20 | 32, 12 | −11%, −40% |
| Menu and palette item | 36 | 32 | −11% |
| Tab | 40 | 36 | −10% |

1. **The gaps between groups collapsed, so every gap looks the same.** When the space between unlike things is about the same as the space between like things, the eye sees one mass. Look at Joseph's screenshot 4: the wordmark, the search row, "Dashboard" and the "Company Operations" heading are four different things, 8 to 12px apart. The group gap fell from 33px to 12px. The same thing happened between the header and the page, and between dashboard sections. This is the largest single cause.
2. **Everything shrank together.** See the table. Halving the side padding on buttons (20 to 12) is what makes a label look squeezed. A person who has used the old look for months feels all of it at once, and nothing was kept roomy to balance the rest.
3. **One 16px gutter, and lists with no maximum width.** Text starts 16px from the window edge and from the pane edge. On a wide window a one-line row stretches more than 1,400px, so the title and its age are far apart and the eye cannot follow the row. Hairlines also come often: header, filter bar, group header, then every row.
4. **The type steps are too close.** Row text is 13px and metadata is 12px. One pixel cannot carry a hierarchy, so grey level does all the work. In the header bar, the title (13px, medium) and its description (12px, grey) read as one sentence, as in screenshot 3: "Pending Approvals Review and approve new sign-up requests…".
5. **The density was set for a list length Molly does not have.** 38px rows pay off when a list has hundreds of items. Molly's admin lists have about 15. Nothing here needs to scroll that did not scroll before.
6. **Two smaller defects.** (a) The interim fix made the logo row 52px but the header bar is 44px, so the wordmark and the page title no longer sit on one line. (b) On Needs you, titles start at different positions: a row with a company mark starts about 26px further right than one with only a glyph.

**Old-look leftovers that make it feel worse.** Do not tune these. WS160 to WS163 replace them.

- The dashboard stat strip (`src/app/admin/page.tsx`, around line 219): a capital mono label, then the number 2px under it, with 12px above and below. Capitals look denser than sentence case. WS161 replaces it with KPI tiles.
- The Needs attention list: a bordered grey box, rows with 12px padding, the title and its detail line 2px apart, and the red marker sitting above the title's baseline. WS161 replaces it.
- Tables and sections (Approvals): capital mono column headings at 34px, cells with 12px padding, and a section heading flush with its own description. The heading, description, filter box and table all sit within about 30px. WS160 replaces the table. The section rules in 3.2 cover the rest.

## 3. The proposal

### 3.1 The scale

Seven steps for layout gaps: **4, 8, 12, 16, 24, 32, 48.** In Tailwind these are 1, 2, 3, 4, 6, 8 and 12. Drop 6, 10, 14, 20 and 22 for layout: those odd steps are why the rhythm felt arbitrary. A 2 or 6 is still fine inside a control for optical alignment (the 3px beside a 14px glyph, for example).

### 3.2 Four rules and one section recipe

1. **Space follows meaning.** Inside a thing: 4 to 8. Between neighbours: 8 to 12. Between groups: 24. Between sections: 32 to 48. Never use the same number at two levels next to each other. Each level up is at least double.
2. **One gutter: 24px (20 on a phone).** The header title, the filter bar, group headers, rows and page content all start on the same line. The pane's inner gutter is 32, because the pane is the thing you read.
3. **One family of heights.** Chip 28. Nav item and small button 32. Button and input 36. Row 44. Bar 52. On a phone, nothing you tap is under 44.
4. **Three bars are 52px:** the logo row, the header bar, the pane crumb. The wordmark and title share a line, and the hairlines meet across the sidebar, list and pane.

**Section recipe for pages** (Approvals and the like): heading to description 4. Description to controls 16. Controls to table 12. Table to its count line 8. Section to section 48.

### 3.3 Type: 14px, and why

Decision: **`text-row` becomes 14/20, and prose in the pane and cards uses the existing `text-body` 14/22.** Metadata stays 12/18. The pane title stays 20/28.

- The 13px was not smaller than the old look. Inter at 13px looks about the same size as the old Plex at 14px (nav and body text), because Inter has the taller lowercase letters. So the text did not shrink. The boxes did.
- 13 and 12 together work when rows are 28 to 32px. At 44px rows, 13px text looks small inside the row, and 13 against 12 cannot hold a hierarchy. 14 against 12 can.
- It is one token change (`text-row` in `tailwind.config.ts`). Every new-look component already reads it.
- On a phone, text inputs must be 16px, or iPhones zoom the page on focus. The new look sets 13px today.

### 3.4 Comfortable only, with one escape hatch

**Recommend comfortable only.** Not a user setting.

- Molly's lists are short, so compact buys nothing.
- One density means one set of checks across two themes and phone. A toggle doubles that.
- Joseph is the only user so far, and his feedback is the data.

Keep one escape hatch, chosen by the page and never by the user. WS160 already plans a `density` prop on the DataTable. **Default it to comfortable (44px). Add `compact` (36px rows, 32px group headers, the same 14px text)** for the two or three pages with long tables, such as Audit Log and Deal Ledger. Decide per page when each is built.

If a user-level compact switch is ever wanted, it is one block of variables, because every value in section 4 can come from the tokens in 5.1. Revisit when a list regularly passes about 60 rows.

## 4. Every value

"Current" is as built unless it says "concept". "Old" means the old look. Heights are in px.

### Scale and type

| Element | Current | Proposed | Why |
|---|---|---|---|
| Spacing steps used | 4 6 8 10 12 14 16 20 22 24 | 4 8 12 16 24 32 48 | Fewer steps, further apart, so levels are visible |
| Row, nav, button, input text | 13/20 | 14/20 | Section 3.3 |
| Prose in pane and cards | 13/20 | 14/22 (`text-body`) | Paragraphs need more leading than one-line rows |
| Metadata, group headings, chips | 12/18 | 12/18 | Unchanged |
| Page title in the header bar | 13, medium | 14, semibold | Separates the title from its description |
| Pane title | 20/28 | 20/28 | Unchanged |

### Sidebar

| Element | Current | Proposed | Why |
|---|---|---|---|
| Width | 224 | 224 | Width is not the problem |
| Logo row | 52 (44 in the concept) | 52, wordmark left edge 24 | Same height as the header bar |
| Search row | 30 high, 12 under, 8 side padding | 36 high, 4 above, 16 under, 12 side padding | Same height as an input. Stops crowding the logo and the first item |
| Home item to first group heading | 12 | 24 | The spot Joseph marked |
| Nav item | 28 high, 8 side padding, 8 icon gap | 32 high, 12 side padding, 8 icon gap | Old look was 36. 32 is the next clean step. Phone stays 44 |
| Nav inset, text start | 8, 16 | 12, 24 | The highlight pill needs air at the sides. Text lines up with the logo |
| Group heading | 12 above, 4 below | 24 above, 4 below | Rule 1: close to its own items, far from the last group |
| Counts | 12 | 12 | Unchanged |
| Footer | 8 padding, person 32, "old look" 24, icon buttons 28, avatar 24 | 12, 36, 28, 32, 24 | Same family as the nav |
| Short windows (optional, later) | none | at 820px tall or less: item 30, group gap 16 | The full sidebar needs about 970px. A 13-inch laptop would hide Admin Tools |

### Header bar, filter bar, groups

| Element | Current | Proposed | Why |
|---|---|---|---|
| Header bar | 44 min, 16 side padding | 52, 24 side padding | Aligns with logo row and pane crumb |
| Title to description | 12 apart, both grey-ish | 16 each side of a 1px hairline | Screenshot 3 |
| Page mode: header to content | 24 (the interim fix; was 16) | 32 | Joseph's "gap under the title bar" |
| List mode: header to content | filter bar follows at once | same | The filter bar is the content |
| Filter bar | 40 high, 16 side padding, 6 gap | 44, 24, 8 | One gutter. Chips get room |
| Filter chip | 24 high, 8 side padding | 28, 12 | Clears the 24px minimum with room to spare |
| Filter bar on a phone | 40 bar with 44 chips (the chips overflow the bar, a latent bug) | 52 bar, 32 chip with a 44px tap area | The tap area can extend above and below the chip without taller chips |
| Group header | 32, nothing above, hairline under | 36, 24 above, no hairline | The tinted band is already the line. Fewer lines is calmer |
| Sticky stack in a list | 44 + 32 | 52 + 44 + 36 | Set `scroll-padding-top` to the sticky height, so `j` and `k` never park the cursor row under the bars |

### Page

| Element | Current | Proposed | Why |
|---|---|---|---|
| Gutter | 16 (header bar and lists), 24 (page box, md and up) | 24 everywhere, 20 on a phone | One line for everything |
| Page-mode box | `max-w-6xl` (1152) with 24 padding, so 1104 inside | unchanged | Pages already have a measure |
| List pages on a wide window | no cap, rows run the full width (concept) | content in the same 1104 column, centred. Row hover and selected bands, hairlines and group bands still run edge to edge | A 1,400px row loses the eye. Same trick as the built header: `padding-inline: max(24px, (100cqw − 1104px) / 2)` |

### Lists (WS160)

| Element | Current | Proposed | Why |
|---|---|---|---|
| One-line row | 38 (WS160 spec) | **44** | The table row today is already 44 (`h-11`). Matches a phone tap target |
| Row side padding, gap between cells | 16, 10 | 24, 12 | One gutter |
| Title to its detail text | 8 | 12 | |
| Gap between metadata columns | 14 | 24 | The right side reads as columns |
| Age column | 28 | 32 | |
| Identity mark | 16 (pane title 28) | 20 (pane title 32) | In balance with 14px text in a 44px row |
| State glyph | 14, no fixed slot | 14 inside a 20px slot | Titles start on one line whether or not a row has a glyph |
| Divider, cursor underscore | hairline, 18 × 3 at 16 | same, underscore at the gutter | |
| Row actions (hover) | 28 | 32 | |
| Phone two-line row | 56, padding 9 × 16 | 64, padding 12 × 20, lines 4 apart | Keeps targets above 44 |
| Columns drop out at | 560, 430 | about 600, 480 (re-tune in the build) | Bigger gaps need more width per column |

### Side pane

| Element | Current | Proposed | Why |
|---|---|---|---|
| Width | `min(58%, 620px)` | same | |
| Crumb bar | 44, padding 16 and 8 | 52, padding 24 and 12 | Meets the header hairline |
| Body padding | 24 (phone 20 × 16) | 32 top and sides, 48 bottom (phone 24 × 20) | The pane is the thing you read |
| Title to chips, chips to card | 12, 20 | 16, 24 | |
| Property chip | 24 high, 6 apart, 8 side padding | 28, 8, 12 | Same as filter chips |
| Action card | padding 16. Heading to text 4. Text to buttons 12. Space below 24 | 24. 8. 16. 32 | The one thing to do gets the most room |
| Between sections, heading to content | 22, 6 | 32, 12 | Rule 1 |
| Detail rows | 4 apart, label column 132 | 8, 148 | |
| History rows | 6 apart, time column 56 | 8, 64 | |

### Needs you and the dashboard (WS161)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Inbox groups | as lists | as lists | |
| Space above the Portfolio section | 20 | 48 | A new section, not a new group |
| Section heading to its content | 8 | 12 | |
| KPI tile | 10 × 12 padding, 8 gap, label touching number | 16 padding, 16 gap, 4 between label and number | |
| Empty state | concept: centred block with 72 above and below. Built (WS159): one line, 12 padding | one line, 44 high, left to the gutter | Joseph asked "do we need it?". The built version already fits |

### Board (WS162)

| Element | Current | Proposed | Why |
|---|---|---|---|
| Column header | 28 | 36 | |
| Tile padding, gap between tiles | 10 × 12, 8 | 12 × 16, 12 | Tiles have no borders, so the gap has to separate them |
| Board padding, column gap | 12 × 16, 12 | 16 × 24, 16 | |
| Add item | 28 | 36 | |
| Hover "⋯" | 20 | 24 | |

### Controls and overlays

| Element | Current | Proposed | Why |
|---|---|---|---|
| Button | md 32 with 12 side padding. sm 28. lg 36. (Old: 36 with 20, 32, 44) | md 36 with 16. sm 32 with 12. lg 40 with 20 | The ladder. Side padding 16 is halfway back to the old 20 |
| Input, select, search | 32 | 36 | Equal to a button, so they align in a row |
| Tab | 36 high, 20 apart, 16 below | 40, 24, 24 | |
| Menu and palette item | 32 (old 36) | 36 | |
| Palette | input 48, item 32, 520 wide, 12vh from top | input 52, item 36, 560 wide, 96px from top | |
| Dialog | header 24 × 16, body 24 × 20, footer 24 × 16 | same. Footer button gap 8 to 12 | Dialogs were never tightened |
| Toast action | 28 | 32 | |

### Phone

| Element | Current | Proposed | Why |
|---|---|---|---|
| Tap targets | 44 | 44 | Unchanged |
| Header, drawer width | 52, 292 | 52, 292 | Unchanged |
| Gutter | 16 | 20 | |
| Text inputs | 13px | 16px | Stops iPhone zoom on focus |
| Founder dashboard | page 20 × 16, hero 16, section gap 24, row 56 | 24 × 20, 24, 32, 64 | Stage 2 preview, same scale |

**Not changed:** colours, radii, motion, markers (the Sky underscore and the dog-ear), copy, sidebar width, pane width, pane content max 720, focus rings, hairline strength.

## 5. Plan impact

### 5.1 One small commit now (tokens, CSS and class strings; no logic)

Everything the new look has built so far reads these values, so most of this is one-line changes.

| File | Change |
|---|---|
| `tailwind.config.ts` | `row` role 13/20 becomes 14/20. Nothing else. `text-meta` and `text-pane-title` stay |
| `src/app/globals.css`, `.shell-header` | `min-height: 52px` (was 44). `margin-bottom: 32px` (was 24) |
| `src/app/globals.css`, `.shell-page > .shell-header:first-child` | `margin-bottom: 32px`. `padding-inline: max(calc((100cqw - 100%) / 2), 24px)` (was 16px) |
| `src/app/globals.css`, `.btn-primary / -secondary / -destructive` | `min-height: 36px; padding: 0 16px` (was 32 and 12) |
| `src/app/globals.css`, single-line `.input-field` | `height: 36px` (was 32) |
| `src/components/ui/button.tsx` | v2 sizes: sm `h-8 px-3` (was `h-7`), md `h-9 px-4` (was `h-8 px-3`), lg `h-10 px-5` (was `h-9 px-4`). Phone `h-11` stays |
| `src/components/layout/sidebar.tsx` | Logo row `v2:px-6`. Nav `v2:px-3`. Search `v2:h-9 v2:mt-1 v2:mb-4 v2:px-3`. Items `v2:h-8 v2:px-3`. Group heading `v2:pt-6 v2:px-3`. Footer `v2:p-3`, person row `v2:h-9`, "old look" `v2:h-7`, icon buttons `v2:h-8 v2:w-8`. Phone `h-11` stays |
| `src/components/layout/page-header.tsx` | Title `v2:font-semibold`. Left block `v2:gap-4`. Description gets a 1px hairline on its left and 16px of padding |
| `src/components/ui/filter-bar.tsx` | Bar `h-11 px-6 gap-2`. Chips `h-7 px-3`. Clear all `h-7 px-2`. Phone: bar `h-[52px]`, chips `h-8` with a pseudo-element tap area to 44 |
| `src/components/ui/tab-bar.tsx` | `v2:py-2.5 v2:gap-6 v2:mb-6` |
| `src/components/ui/dropdown-menu.tsx`, `src/components/layout/command-palette.tsx` | Items `v2:py-2` (36). Palette input `h-[52px]`, width 560 |
| `src/components/ui/empty-state.tsx` | No change. `py-3` plus a 20px line is already 44 |
| `src/lib/__tests__/app-shell-v2.test.tsx` | Line 57 to 59: the test name says "items 28px" and expects `v2:h-7`. Change to 32px and `v2:h-8`. This is the only test that pins a size |

**Recommended with it (optional):** put the shared numbers in the v2 token block in `globals.css`, so WS160 to WS163 read them instead of repeating numbers.

```css
/* Density: comfortable. The numbers every new-look layout reads. */
--bar-h: 52px;        /* header bar, logo row, pane crumb */
--filter-h: 44px;
--group-h: 36px;
--row-h: 44px;
--gutter: 24px;       /* 20px under md */
--column: 1104px;
--pane-gutter: 32px;
```

Rule for builders: inside new-look layouts use only the gap steps in 3.1 (`gap-1 2 3 4 6 8 12`, `p-` and `space-y-` the same). No `gap-1.5`, `gap-2.5`, `p-5`, `space-y-5`.

### 5.2 What changes in the WS160 to WS163 specs

- **WS160 (dense lists and pane).**
  - Rows 44, not 38. `compact` is 36 and chosen per page.
  - Group header 36 with 24 above and no hairline.
  - Gutter 24, and content in a 1104 column on a wide window.
  - Metadata gap 24, identity mark 20, state glyph in a 20px slot.
  - Container-query breakpoints move to about 600 and 480.
  - `scroll-padding-top` equals the sticky stack (132 with a filter bar).
  - Pane crumb 52, pane padding 32, action card padding 24, section gap 32.
  - Phone rows 64.
  - The cursor underscore sits at the gutter.
  - The "3px accent edge" in the plan text is stale: the approved marker is the Sky underscore.
- **WS161 (Needs you).** Groups follow WS160. Portfolio section starts 48 below the last row. KPI tiles 16 padding and 16 gap. Empty state stays as WS159 built it. The page keeps its existing description beside the title (the mockup now shows it).
- **WS162 (boards).** Column header 36. Tile 12 × 16 with 12 between tiles. Board padding 16 × 24. Column gap 16.
- **WS163 (detail pages).** Full-page records use the pane's rhythm: 32 gutter inside the 720 column, section gap 32, 12 under section headings. Tabs `py-2.5`.
- **WS164 (palette).** Items 36, input 52, width 560.
- **WS165 (founder, stage 2).** Same scale. The founder phone screen in the mockup is already at the new numbers (row 64, hero 24).
- **Documents the lead should update if Joseph approves.** `docs/PLAN-1.md` section 1: pattern 2 ("28px items"), pattern 3 ("44px header", "40px bar"), pattern 4 ("about 38px"), pattern 7 ("13px base"). WS158's steps ("`h-7`", "44px bar"). WS160's "Rows are 38px". `redesign-v1.md` section 2 "Sizes" and "Type". I did not edit the plan or those two paragraphs.

### 5.3 Things to watch in the build

- **Sidebar height.** With everything open the sidebar needs about 970px. The nav scrolls inside itself and the footer stays put, so nothing breaks. A 13-inch laptop will hide the last group until you scroll. The short-window rule in section 4 fixes most of it if it bites.
- **Narrower columns.** 14px text and bigger gaps use more width. Check Companies with the pane open at 1280px wide.
- **Hover and selected bands** should stay full width while the content sits in the column. That needs the list's scroll area to be the container for the column calculation, as the header's is.

## 6. What to look at in the mockup

Open `docs/design/redesign-v1.html`. It opens on **Proposed**.

1. On screen 1, click **Approved**, then **Proposed**, and watch the top left: logo, search, home item, then "Company Operations". Then the header bar, the gap under it, and the space between groups in the list.
2. Click a row. The pane opens. Compare the action card and the space between sections, in both modes.
3. Click **Wide**. Approved rows stretch across the window. Proposed keeps the content in a column, with the bands still edge to edge.
4. Switch to Companies, Team Board and Founder (phone). Flip **Dark** on any of them. Spacing is the same in both themes.
5. Click **Phone** and open a row. Rows are 64 and targets stay 44.
6. Scroll to the bottom. There is a table of every number that changes, with the active column in bold. The contrast table is still there.

A link opens a view directly, for example `redesign-v1.html#density=approved&screen=2&theme=dark&device=wide`.

Limits of the mockup: the pane still overlays the list instead of pushing it, as in the approved version. The sidebar is text only. The frame is as tall as the window (minus the strip), so the sidebar fits or scrolls the way it would in the real app. The page descriptions beside the titles are the existing words from the built pages, now shown in both modes so the title and description spacing can be judged.
