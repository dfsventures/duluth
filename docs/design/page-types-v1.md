# Molly admin: the three page types (v1)

Status: **proposal for Joseph, 2026-11-19. Nothing is built.** Author: Nisat. Card B-216.
Mockup: `docs/design/page-types-v1.html`. All names are placeholders.

Joseph, comparing the old and new look on a ~2000px screen: "See how the old look is so much cleaner? … I feel the attention to detail is bad." He is right. This document fixes it at the level of **page types**, not pages. Every admin page becomes one of three types: **List**, **Detail** or **Editor**. Each type has one header, one set of sizes and one set of alignment rules. Alvin then moves every page onto its type in one go.

## 1. The short answer

1. **The page title comes back down into the page.** On List and Detail pages the title is a real 24/32 heading with its description under it, as in the old look. The 52px top bar goes away on those pages. A slim bar slides in only after the title has scrolled off, carrying the title and the main action.
2. **Filters stay together on the left.** The search box is 320px wide (never less than 280), so its placeholder always fits. Selects and chips sit right after it, 8px apart. The right end of the row holds only the count and view controls, never a filter. That ends "All companies" drifting to the far side.
3. **The Editor bar is one row on one baseline.** Every word in it is 14/20 and centred in the 52px bar. Its buttons are 32px, with 10px above and below. There is no third text size and no title inside the bar.
4. **Everything else is the approved language, unchanged.** Inter, the cool greys, the Sky accent, hairline rows, 44px rows, 36px controls, the d078cad frame widths.

What caused the problem was not the design language. It was three mechanical things, each in one component (section 2). That is good news: the fix is a handful of component changes.

## 2. What went wrong, exactly

Measured from Joseph's screenshots and the code as built.

| Symptom | Cause in the code | Fix in this spec |
|---|---|---|
| Updates has no page title, just small text in the top bar | `PageHeader` under the new look turns the h1 into `text-row` (14px) inside `.shell-header`. On a list, the bar is the only heading | Title is a 24/32 heading in the content (§4.1) |
| The search box truncates its own placeholder ("Filter by title or compar…") | `DataTable` gives the search `w-56` (224px). After the 36px icon padding and 32px `/` padding, 156px is left for text. "Filter by title or company" needs about 172px at 14px Inter | Search is 320px (minimum 280, maximum 400). Placeholders are capped at 28 characters (§4.2) |
| "All companies" sits at the far right, away from the search | `FilterBar` puts page filters (`toolbarExtra`) in `trailing`, which has `ml-auto` | Filters go in the left group. Only the count and view controls go at the right end |
| Report editor bar: "‹ Fund Reports" and "Published in Example Fund I" on different baselines | `composer-top-bar` sets 14px for the link and 12px (`text-meta`) for the status, in a row aligned by baseline. The link is an `inline-flex` with an svg, so its baseline is computed from the icon box, not the text | One size (14/20) for everything in the bar. The row aligns centres, not baselines. Every item has a 20px line box (§4.3) |
| Buttons look too big for the bar | The bar's buttons are 32 to 36 (the ⋯ is `v2:h-9`, 36), in a 52px bar with `padding-block: 2px`. There's 8px or less above and below, and it changes from button to button | Bar buttons are all 32 (the ⋯ too): 10px above and below |
| Preview bar: "‹ Report", "Preview" and the description on three baselines; "Edit report" taller than everything else | Three sizes (14, 14 semibold, 12) aligned by baseline, plus a 36px `md` button | Back link, divider, then one status sentence. No separate title. The "Edit report" button is dropped, because the back link goes to the same place (§9, question 3) |

**A deeper reason, on the list pages.** The old look reads clean on a wide screen partly because its content was a 1104px column. At 1920 the new list fills 1568px, so the title column is about 900px wide while the titles are about 300px. The eye has to jump across a void to find the company. See question 1 in §9.

## 3. Decisions (one line of reason each)

| # | Decision | Why |
|---|---|---|
| D1 | List and Detail: the title is an h1 **in the content**, 24/32 semibold, with the description or status line 4px under it | Joseph's preference, and the old look's main strength: the title is the largest thing on the page, so the page has a top |
| D2 | List and Detail lose the permanent 52px top bar | An empty bar is decoration. Without the title in it, it only held a hairline |
| D3 | A **condensed bar** (52, title 14/20 semibold, main action at 32) slides in once the h1 has scrolled away: 140ms, opacity plus a 4px drop | You keep the context and the main action on long pages, and the motion says what happened: the title moved up |
| D4 | Editors and forms keep a **permanent** 52px bar | They are tools. Save, Preview and Publish must stay in reach while you write |
| D5 | Editor bar: back link, a 16px divider, one status sentence on the left, actions on the right; **all 14/20, centred, one line** | One size and one alignment rule cannot drift. Two sizes on a baseline drifted twice |
| D6 | Buttons are 36 in page content and 32 inside any 52 bar (condensed or editor). Icon-only buttons are square at the same height | A bar button needs air above and below, or it looks pasted on (10px each side) |
| D7 | **Filter row order:** search, then one-choice filters, then selects, then set filters, then "+ Filter", then Clear. **The right end holds only the count and view controls** (Group, Columns, Export) | Filters are one thought and should read as one group. The count is a result, not an input |
| D8 | Search 320 (minimum 280, maximum 400). Placeholders "Filter by …" are at most 28 characters | 280 fits 28 characters at 14px with the icon and `/` hint. It never truncates |
| D9 | **One-choice chips become a segmented control** (36, a 2px inset well, 32px segments) | They are one choice out of several (All, Current, Behind), so draw them as one control. That also retires the confusing "All ×" (audit #4) |
| D10 | Every control in the filter row is **36px high** (search, select, segmented, chips, + Filter, Clear) | Mixed 28 and 36 controls on one row was the second thing that made it look unfinished |
| D11 | When filters don't fit on one line, the row **wraps** (8px between lines); the search never shrinks below 280 | Wrapping is honest. Truncated or squeezed controls are not |
| D12 | **Tabs get their hairline back** (1px under the whole tab row, 2px Sky under the active tab) | The hairline was removed (bf38e57) because it stacked with the bar's hairline. With the bar gone, the tabs need it to read as a set, as in the old look |
| D13 | **Every table cell is 14/20.** The first column is 500 primary; the other columns are 400 secondary | Today's 12px secondary columns made Company and Author look like footnotes. A cell is content, not metadata |
| D14 | Table text starts on the content edge (no inset); the row hover band reaches 12px past each edge | Title, filters, table head and rows share one left line, and the hover still feels like a row |
| D15 | Detail: back link **above** the title on its own 20px line, 12px gap; actions **on the title row** | Today the actions sit on the back-link row and the back link is a 12px arrow. The action belongs to the thing it acts on |
| D16 | Back links are always "‹ Label": chevron 16, text 14/20 secondary, pulled 4px left so the chevron's ink sits on the content edge | Today there are three back-link styles (← 12px, ‹ 14px, breadcrumb) |
| D17 | Detail panel: 296 wide, `--color-surface` fill, radius 8, padding 24, sticky at 76 (52 condensed bar + 24) | Keeps the approved Dossier panel. The sticky top clears the condensed bar |
| D18 | Editor title field 28/36 semibold, grows with its text, never clips. Body 16/28 | The document's own title should outrank page chrome. 16/28 is a writing measure for LP-facing text, and 14px felt like a form |
| D19 | Forms (Add company, New memo, digest new) are the Editor type: the bar holds the actions, and the content opens with a 24/32 heading, then fields | One place for actions on every page that saves. No second Save at the foot |
| D20 | One spacing ladder, as approved: 4, 8, 12, 16, 24, 32, 48 | Nothing in this spec uses another value, except the 2px insets inside controls and the title's 2px optical centring |

## 4. Every measurement

Pixels. "Content edge" means the frame's left edge: gutter 48 from 1024px wide and 64 from 1600px, as in d078cad. Positions are at 1440 wide, measured from the top of the main area.

### 4.1 List page

| Element | Value |
|---|---|
| Frame | Fills between the gutters (`wide`). See question 1 for a 1296 centred option |
| Top of main area to the header row | 40 |
| Header row | min-height 36, flex, items at the top. h1 24/32, weight 600, letter-spacing −0.012em, primary, 2px top padding, so the title's line centres on a 36 button |
| Primary and secondary actions | Right end of the header row. Buttons 36, side padding 16 (12 on the icon side), 14/20 weight 500, gap 8. Primary is the rightmost |
| Description | 14/20 secondary, 4 under the header row, max-width 720, one or two lines |
| Description to tabs | 24 |
| Tabs | Each 40 high, 14/20 weight 500, 24 apart. Count 12/18 muted, 6 after the label. 1px hairline under the row; active tab is primary text plus a 2px Sky bar on the hairline |
| Tabs (or description, if no tabs) to the filter controls | 16 (or 24 with no tabs) |
| Filter row | Controls 36 high, 8 apart, 8 between wrapped lines. The row is sticky at top 52, with 8 of background above and below the controls |
| Search | Width 320 (min 280, max 400). Icon 16 at 12 from the left. Text starts at 36. "/" hint 20×20, 8 from the right. 1px `--color-ctl` border, radius 6, transparent fill |
| Select | Fits its content, min 160, max 240, 12 left, 36 right (chevron 16 at 12). Long values truncate with an ellipsis inside the select, never the row |
| Segmented (one choice) | 36 high, 2 inset, `--color-surface` well, radius 8. Segments 32, side padding 12, 14/20 weight 500 (the same weight on and off, so nothing shifts). Selected: page background, a 1px edge shadow, primary text. Count 12/18 muted |
| Set filter chip | 36, Sky soft fill, label 500 Sky, value 400 primary, × in a 28 square |
| + Filter | 36, 1px dashed `--color-ctl`, 12 side padding, 14px plus icon |
| Clear filters | 36, ghost, 8 side padding; only when something is set |
| Right end | `margin-left: auto`, 16 from the last filter. Count 14/20 muted, tabular ("48 updates", "6 of 15 companies"). Then view controls as ghost 36 buttons, 16 apart |
| Filter controls to table head | 16 |
| Table head | 40, 12/18 weight 500 secondary, sentence case, hairline under. Sticky under the filter row |
| Row | 44. Cells 14/20, 12 side padding (24 between columns); the first cell has no left padding, the last no right |
| First column | Takes the spare width; one line, ellipsis; 500 primary; full text in a tooltip |
| Other columns | Fit their content; 400 secondary; any text column max 280 with an ellipsis; dates and numbers tabular, dates right-aligned |
| Row divider and hover | 1px `--color-row-divider`. The hover fill reaches 12 past each content edge |
| Bottom of the page | 96 of space after the last row |
| Paging (only if a list pages) | A 44 row under the table: "1–50 of 120" 14/20 muted on the left, Previous and Next as ghost 32 buttons on the right |

Positions at 1440: header row 40–76; description 80–100; tabs 124–164; filter controls 180–216; table head 232–272; first row 272–316. The old look's Updates has its tabs at 120, filters at 187 and table head at 232, so this keeps the old rhythm to within 8px. Today's new look has tabs at 76 and the table head at 165.

### 4.2 Detail page (Dossier)

| Element | Value |
|---|---|
| Frame | `detail` 1056 = main 720 + gap 40 + panel 296; the fund page is `detail-wide` 1296 = 960 + 40 + 296. Centred |
| Top to back link | 40 |
| Back link | "‹ Companies": 20 line, 14/20 secondary, chevron 16 muted, gap 4, shifted 4 left. Hit area 32 high (6 above and below, invisible) |
| Back link to header row | 12 |
| Header row | As the list: 36, h1 24/32 600 with 2 top padding. It spans the whole frame, so the actions end on the panel's right edge |
| Actions | Secondary 36, primary 36, then ⋯ (36 square, ghost). Gap 8. Top-aligned to the title's first line when the title wraps |
| Long title | Wraps, with no limit on lines. Actions stay on the first line; the title column never goes under 50% of the frame |
| Status line | 4 under the header row, 14/20 secondary. Items are separated by " · " in muted, 8 apart. A state comes first, with its 8px glyph (dot or triangle) 6 before the word. Wraps on long values |
| Header to body | 32 |
| Main column | 720. Sections are 48 apart. Section heading row: min 32, heading 16/24 600, optional right meta 12/18 muted or a 32 button; 12 to the section's content |
| Prose in the main column | 14/22 primary |
| Stats | 3 columns, 24 gap. Label 12/18 muted, 4, number 20/28 600 tabular, change line 12/18 muted. No boxes |
| Tabs inside the main column | As the list's tabs; the table starts 16 under them; rows 44; no filter row on short lists (audit #14) |
| Panel | 296, `--color-surface`, radius 8, padding 24, sticky at 76. Facts as a grid: label column 96 (12/20 muted), 12 gap, value 14/20 primary (one line, ellipsis); rows 8 apart. Groups are split by 16, a hairline, then 16. Group label 12/18 500 muted, 12 above its content |
| Panel top | Level with the top of the main column's first section |

Positions at 1440: back 40–60; header row 72–108; status 112–132; body from 164. Content edge at x = 304, the same as today.

### 4.3 Editor and form page

| Element | Value |
|---|---|
| Frame | `narrow` 720, centred. The bar's contents use the same 720 column |
| Bar | 52 including its 1px bottom hairline, sticky at top 0, page background. **No vertical padding.** Contents flex, `align-items: center`, gap 12 |
| Left group | Back link ("‹ Fund Reports", the D16 style), 12, a 1×16 divider (`--border-2`), 12, the status sentence. **All 14/20.** The status is one line and truncates with an ellipsis. The left group shrinks first |
| Status sentence | The state word in 500 secondary, the rest 400 muted: "**Draft** in Example Fund I · Saved 2:41 PM". Unsaved: "Unsaved changes" in the warn colour. Published: "**Published** in Example Fund I" |
| Right group | Buttons 32 (side padding 12; 8 on the icon side), gap 8, order: quiet to loud, then ⋯ last. Preview (with eye icon), Save, Publish (primary), ⋯ (32 square ghost). Never wraps |
| Bar to title | 40 |
| Title field | 28/36, 600, −0.015em, primary; the placeholder ("Untitled report") muted. It grows to fit and never clips. Read-only states show the same text, not a disabled input |
| Meta line | 8 under the title, 14/20 secondary ("H1 2026 · Example Fund I · 12 LPs") |
| Hint | 8 under, 12/18 muted, max 600, one sentence |
| Toolbar | 24 under, 40 high, sticky at 52. Icon buttons 32, icons 16 muted. Group divider 1×16 with 8 each side. Pulled 8 left, so the first icon's ink sits on the content edge. When stuck: a 1px hairline under it, fading in over 140ms |
| Toolbar to body | 16 |
| Body | 16/28 primary; paragraphs 16 apart; h3 18/28 600, 32 above, 8 below; lists 24 indent. Minimum height 320 |
| Bottom sections | 48 above, then a hairline, then 24 to the section heading row (as in Detail: 16/24 600 plus right meta). Controls row: search 240, buttons 36, gap 8, 12 above the list. Picker rows 40 with a 16 checkbox, label 14/20, meta 12/18 muted on the right; hairlines only (audit #1) |
| Space after the last section | 96 |
| Form variant | Same bar (status "Not saved yet" or "Saved …"; actions Cancel as ghost, then the primary). Content: h1 24/32 heading, 4, description 14/20, 32, then fields. Field: label 14/20 500, 8, control 36 (textarea minimum 88), help 12/18 muted 4 under. 24 between fields, 48 between groups, groups titled 16/24 600 |
| Preview variant | Back "‹ Report"; status "**Preview** · How LPs will see it. Numbers aren’t frozen until you publish." No right-hand button. The LP-look report renders in the 720 column with no box, border or radius (audit #29) |

Bar positions: buttons 10–42 within the 52 (the hairline is the 52nd px). Text line boxes 16–36. At 1440 the content edge is x = 472.

### 4.4 Type scale (all three types)

| Role | Size/line | Weight | Token |
|---|---|---|---|
| Editor title field | 28/36 | 600 | new `doc-title` |
| Page title | 24/32 | 600 | `title` (change its line height 30 → 32) |
| Page title, phone | 20/28 | 600 | `pane-title` |
| Body prose in editors | 16/28 | 400 | new `prose` (or `text-base leading-7`) |
| Section heading | 16/24 | 600 | `heading` (change its line height 22 → 24) |
| Stat number | 20/28 | 600 | `pane-title` with tabular figures |
| Description, status line, back link, every bar word, tab, button, cell, select, search | 14/20 | 400 or 500 | `row` |
| Prose in detail pages | 14/22 | 400 | `body` |
| Table head, counts in tabs, meta, hints, panel labels | 12/18 | 400 or 500 | `meta` |

Nothing is mono in any of the three types.

## 5. Header alignment rules (the "one baseline" rules)

1. **A bar has one text size: 14/20.** No 12px status beside a 14px link, and no semibold title beside regular text.
2. **Align centres, not baselines.** The bar is `display:flex; align-items:center`. Every text item is a 20px line box; every icon is 16 inside a 20 box or a 32 button. With one size, centred items share a baseline exactly, and icons can't move it.
3. **Buttons in a 52 bar are 32.** 10 above, 10 below, all of them, including ⋯.
4. **In-page header rows are 36 high, items at the top.** The h1's 32 line sits 2px down, so a one-line title centres on the 36 buttons; a wrapped title keeps the buttons level with its first line.
5. **The left edge is one line.** The chevron's ink (not its box), the title's first letter, the tab labels, the search box, the table head and the first column all start on the content edge.
6. **The right edge is one line.** The last button, the end of the filter row (count) and the last column end on the content's right edge (on Detail, the panel's right edge).

## 6. Phone (390)

| | List | Detail | Editor |
|---|---|---|---|
| Top | App bar 52 (menu 44, wordmark, search 44), then 24 | Same, then 24 | App bar 52, then the editor bar 52 (sticky) |
| Title | 20/28 h1 in a 36 row. Primary on the right at 36 (44 tap), secondary actions in ⋯ | Back link, 12, then h1 20/28, wrapping. Status line wraps. Actions on their own row 16 under the status: primary fills the row, then the secondary and ⋯, all 44 | Back is a 44 icon-only chevron (the label is for screen readers). Status truncates. Right: the primary 32 and ⋯ 32 (Preview and Save fold into ⋯) |
| Filters | Search on its own line, 44 high, 16px text (no iOS zoom). The rest on a second line, 44 high, scrolling sideways to the screen edge. Count as a 12/18 line 8 under | n/a | n/a |
| Body | Rows become two lines: 64 min, 12 padding, title 14/20 500, then 4, then meta 12/18 muted ("Acme Robotics · Nov 14") | Panel first (padding 16, not sticky), 32, then the sections. Stats stay three across | Title 24/32. Toolbar scrolls sideways. Bottom-section controls wrap: search full width |
| Gutter | 20 | 20 | 20 |

## 7. States

| State | List | Detail | Editor |
|---|---|---|---|
| Empty (filtered) | Filter row stays, with the count "0 updates" and Clear filters. Table head stays. One 44 row: "No updates match “zebra”." plus a Clear filters link | n/a | n/a |
| Empty (no data yet) | No filter row and no table head. One 44 line under the description: what will appear and when ("Updates appear here when founders publish them.") with the primary action, if any, still in the header | Each section shows one quiet 14/22 line in secondary ("No figures yet. They appear when …"). Tabs show 0 | A new document: the title placeholder "Untitled report", the body placeholder, Publish disabled with a tooltip giving the reason |
| Long text | Title column ellipsis; other text columns ellipsis at 280; tooltip shows all | The title wraps with no limit; actions stay on its first line; the status wraps | The title field grows; the bar status truncates; buttons never wrap |
| Many filters | Up to four inline filters after the search; the rest sit behind "+ Filter" and appear as set chips. The row wraps when it must; the count stays at the end | n/a | n/a |
| Scrolled | Condensed bar with title and primary; filter row and table head stick under it | Condensed bar with chevron, title, actions at 32; panel sticks at 76 | The bar never changes; the toolbar sticks under it with a hairline |

## 8. Light and dark

There are no new colours. Every value is a v2 token in `globals.css`. Two token uses are new:

- The selected segment is `--color-bg` in light and `--color-well` in dark. In dark the page background is already the darkest surface, so a "lifted" segment has to be lighter, not darker.
- Secondary button borders and the bar divider use `--color-border-hover` (0.17 light, 0.14 dark), so a 32px button reads as a button in a 52px bar in both themes.

The panel stays `--color-surface` in both themes.

## 9. Questions for Joseph

1. **List width on wide screens.** My recommendation: a 1296 frame, centred, the same width as the fund page. Today lists fill the screen (Joseph's call on 2026-11-18). At 1920 that makes the title column about 900px wide for 300px titles, and that empty run is a large part of why the old look feels calmer. A centred 1296 frame still uses the width, keeps the same gutters, and puts lists, the fund page and the old look's proportions on one family of widths. The mockup has a "List width: Fill / 1296" switch at 1920.
2. **The condensed bar on scroll.** My recommendation: yes. It keeps the title and the main action in reach on long lists and records. If you'd rather not, the page simply scrolls, as in the old look.
3. **Report preview: drop the "Edit report" button.** My recommendation: yes. The back link "‹ Report" goes to the same place, so the second button only adds weight to the bar.
4. **One-choice chips become a segmented control** (All, Current, Behind). My recommendation: yes. This changes how the approved chips look. The dashed "+ Filter" chip stays for adding filters.

Tell, no decision needed: the tab hairline comes back (D12); every table cell becomes 14px (D13); forms keep their actions only in the bar (D19).

## 10. Every admin page, by type

| Page | Route | Type | Notes |
|---|---|---|---|
| Needs you | /admin | List | Title "Needs you" as the h1; grouped inbox rows; KPI tiles follow the Stat rule |
| Approvals | /admin/approvals | List | One filter (audit #18); opens the side pane |
| Diligence | /admin/diligence | List | Side pane |
| Companies | /admin/companies | List | Primary Add company, secondary Import CSV; side pane |
| Updates | /admin/updates | List | Tabs Updates and Templates (/admin/templates is the second tab) |
| Investor Links | /admin/links | List | Side pane; Copy link in the row (audit #37) |
| Memos | /admin/memos | List | Board or list switch is a view control at the right end |
| Funds | /admin/funds | List | |
| Deal Ledger | /admin/portfolio | List | Stat strip between the description and the filter row, 24 above and below; compact rows allowed (36) |
| Portfolio Contacts | /admin/portfolio-contacts | List | Tabs Contacts and Links |
| LPs | /admin/lps | List | |
| Fund Reports | /admin/reports | List | |
| Broadcasts | /admin/broadcasts | List | |
| Team Board | /admin/board | List | The board replaces the table; the filter row is the same |
| Weekly Digest | /admin/digest | List | |
| Service Providers | /admin/providers | List | One table with a pending group (audit #40) |
| Audit Log | /admin/audit | List | Compact rows allowed (36) |
| Sync | /admin/sync | List | Check: not in the audit shots |
| Memo | /admin/memos/[id] | Detail | Dossier as approved; panel holds the contents |
| Company | /admin/companies/[id] | Detail | As drawn |
| Update | /updates/[id] (admin view) | Detail | Founder and LP views unchanged |
| Fund | /admin/funds/[id] | Detail, `detail-wide` | Tabs and tables span the whole frame (audit #30) |
| Deal Ledger company | /admin/portfolio/[id] | Detail | Contacts inputs hidden until Add contact (audit #33) |
| Digest | /admin/digest/[id] | Detail, no panel (720) | Primary Send to team, Edit and Delete in ⋯ (audit #46) |
| Sent broadcast | /admin/broadcasts/[id] (sent) | Detail, no panel (720) | Message and Delivery tabs; no Send (audit #24, #25) |
| Settings | /admin/settings | Detail, rail variant | h1 and description in the content; left rail 168 + 40 + 720 (as built in 25af171) |
| Report editor | /admin/reports/[id] | Editor | As drawn. Published: status "**Published** in …", actions Preview and "Unpublish to edit" (secondary) |
| Report preview | /admin/reports/[id]/preview | Editor, preview variant | As drawn |
| Broadcast editor (draft) | /admin/broadcasts/[id] (draft) | Editor | Audience is a bottom section |
| New digest | /admin/digest/new | Editor, form variant | |
| New memo | /admin/memos/new | Editor, form variant | |
| Memo template | /admin/memos/template | Editor, form variant | |
| Add company | /admin/companies/new | Editor, form variant | |
| Update composer | /admin/companies/[id]/updates/new, /updates/new (admin) | Editor | Founder view unchanged |

## 11. For the build (Alvin)

This is a direction, not code. These are the places it touches, so nothing gets lost in the handoff.

- **`PageHeader`**: under the new look it becomes the in-page header (back link above, header row, description or status). It is no longer `.shell-header`. Add a `status` slot (the Detail status line). Back moves out of the title row onto its own line above it.
- **New condensed bar**: one small client component that watches the h1 (an IntersectionObserver on the main scroll area) and toggles a sticky 52 bar. It is used by List and Detail.
- **`.shell-header` (globals.css)** stays only for the editor bar: `height: 52px`, no `padding-block`, `align-items: center`.
- **`composer-top-bar`**: the left group goes from `items-baseline` to `items-center`, and everything is `text-row` (drop `v2:text-meta`). Add the 1×16 divider after the back link. The ⋯ becomes `v2:h-8 v2:w-8`. Buttons stay `size="sm"` (check that sm is 32 under v2).
- **`FilterBar`**: a new left group for filters. `trailing` (with `ml-auto`) is only for the count and view controls. Controls are 36. The fixed `h-11` goes; use `py-2` plus `flex-wrap` with an 8px row gap.
- **`DataTable`**: the search becomes `w-80 min-w-[280px] max-w-[400px]` (it is `w-56` today). `toolbarExtra` moves into the left group. The count goes to the right end. One-choice chips render as a segmented control. Cells are `text-row`; the head is 12/18 weight 500.
- **`TabBar`** and the inline tabs: the hairline under the row is back.
- **Dossier pages**: actions move from the back-link row to the title row; the back arrow becomes the chevron style; the panel sticks at 76.
- **`tailwind.config.ts`**: `title` line height 32, `heading` line height 24, new `doc-title` 28/36.
- **Phone**: the List primary stays in the header row; Detail actions move to their own row; Editor secondary actions fold into ⋯.

## 12. How to look at it

Open `docs/design/page-types-v1.html` in a browser. The strip at the top has:

- **Page:** List, Detail, Editor (`data-g="dir"`: `list`, `detail`, `editor`)
- **Theme:** Light, Dark (`theme`: `light`, `dark`)
- **View:** 1440, 1920, Phone (`view`: `desktop`, `wide`, `phone`). The frame is drawn at true size and scaled to fit the window
- **State:** Normal, Long text, Empty, Many filters (List shows Companies), Scrolled, Preview (Editor only). A state that doesn't apply falls back to Normal, with a note in the strip
- **Look:** Proposed, Today, Old look. Today and Old look show the real screenshots from `.visual/` (light only), so you can flip between them at the same size. Those files are git-ignored, so they exist only on this Mac
- **Guides:** On draws every measured box with its number, and the frame in blue
- **List width:** Fill or 1296 (question 1)

A hash opens a view directly, for example `page-types-v1.html#dir=editor&theme=dark&view=wide&state=scrolled&look=new&guides=off&lw=fill`.

Limits: the sidebar is static, nothing is clickable except the strip, and the pane on List pages is not drawn (it is unchanged).
