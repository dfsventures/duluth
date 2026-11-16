# Molly redesign, concept v1

Status: **for Joseph's approval. Nothing is built.** Author: Nisat. Board card B-125 (WS155 in `docs/PLAN-1.md`). Mockup: `docs/design/redesign-v1.html` (open it in a browser; no build step; Inter loads from Google Fonts and falls back to the system sans if offline). All names, companies, emails and figures are placeholders.

The brief, in Joseph's words: Molly should "look more modern", with "the same UI and UX of Lou". Decisions already made (2026-11-16): the team (admin) screens first, founders and LPs in a later stage; take Lou's layout, density, type (Inter) and neutral greys, but keep Molly's Sky blue and the `_Molly` wordmark; light by default with a per-person dark switch; ship in stages behind an admin-only "Try the new look" switch; mockup first.

Lou's repo is private and this one is public. Everything here is described and re-made in Molly's own values. Colours, class names, copy and content were not copied.

## 1. What to look at

The strip at the top of the page switches **screen**, **light/dark**, and **desktop/phone**. "Show new labels" outlines every new word for Nosa. "Empty state" shows the empty Needs you screen.

Try this: press `j`/`k` to move the cursor, `Enter` to open the pane, `j`/`k` again to step through records in the pane, `Esc` to close it, `⌘K` for the palette, `A` on an approval to approve (the toast has Undo), `D` on an alert to dismiss it (the row fades and collapses).

| # | Screen | What it shows |
|---|---|---|
| 1 | Admin **Needs you** | Sidebar with counts (only "needs you" counts are bold), a 44px header, a filter-chip bar, sticky collapsible groups of one-line rows (Waiting on you, On the board, Alerts, Behind on updates), and the Portfolio KPIs below the inbox. The pane is open on an approval: crumb with 1 of 3 and previous/next/expand/close, title, property chips, one action card with one primary button, then why, details and history. Rows are the same items `buildAttention` produces today (queue rows, not one row per signup), so no new API is needed. |
| 2 | **Companies** with the pane open on Acme Ltd | The same shell. A set chip (Owner), an unset dashed chip, "Clear all". Rows have a company square, name, stage, owner disc, cadence, last update. Columns drop out as the list narrows (container query, not viewport). The pane shows a "75 days behind" action card with Send a reminder as the one primary, then latest figures and recent updates. |
| 3 | **Team Board** with one waiting card and its pane | Tiles are a title and one marker. Only "Waiting on you" is loud: a red left edge on the tile and a red count on its column header. A hover "⋯" on tiles. The pane uses the same anatomy as the others. |
| 4 | **Founder dashboard on a phone** | Stage 2 preview. The one next step is the hero, with a full-width 44px button. Latest figures, From DFS and Recent updates are two-line rows of 56px. The menu opens a drawer holding the company switcher. No bottom tab bar (still deferred). |

On a phone the admin screens turn rows into two lines (56px), the pane into a full screen with a back chevron, the board into horizontally scrolling 264px columns, and the sidebar into a drawer over a scrim.

## 2. The decisions, and why

**Take Lou's structure, not its decoration.** One shell (sidebar, list, pane), dense 38px rows, a keyboard that runs everything, depth from tone rather than shadow, one typeface at 13px. These are the fourteen patterns in PLAN-1 section 1. The design here is those patterns drawn with Molly's own tokens.

**Keep Sky as the one accent.** Molly's accent is the Sky family as already darkened for text (`#44688E`, 5.8:1 on white). It marks the primary button, the cursor bar on the row's left edge, focus, selected filter chips and links, and nothing else. In dark it lightens to `#7BA9DD` (7.3:1 on the page), and the primary button inverts to dark ink on the light blue (7.5:1). Everything else is grey, so the accent reads as the one thing to do.

**Greys: cool neutrals, not Paper.** Today's greys are warm (Paper `#EBE8DE`, Bone). The new tiers are neutral with a whisper of blue (hue about 215, saturation under 8%), so Sky sits on them without clashing. Paper is retired as a surface in the admin look. Four tiers: page, sidebar, pane, raised (plus a pressed tier for segmented controls). Hairlines are translucent, so they work on every tier.

**Three colour jobs that never mix.**
1. *State* (red, amber, green) means something happened. It appears only as a small glyph, a short word, or a soft wash behind one. It is never used for identity and never fills a disc.
2. *Identity* (who, which company) is a small mark: a **disc** for a person, a **rounded square** for a company, with the initial in near-black ink. Shape tells the kind, so a pink disc and a pink square cannot be confused.
3. *Accent* is Sky: the one action.

**Identity palette.** Eight fills: lime, teal, indigo, violet, orchid, magenta, stone, slate. They avoid the state bands (red 345–25°, amber 28–58°, green 130–170°) and Molly's own accent band (195–228°). Stone and slate are desaturated on purpose so they never read as amber or as Sky. The initial is `#14161A` on every fill, 6.9:1 or better. The colour is deterministic: lower-case and trim the name, FNV-1a 32-bit (`h = 2166136261; per code point: h ^= cp; h = imul(h, 16777619) >>> 0`), then `pool[h % 8]`, with the pool in the order above. The HTML shows the palette and six sample names at the bottom (Acme Ltd, Example Co, Sample Labs, Sam Admin, Jo Admin, Alex Admin); WS159's unit test should assert those results. The fills are the same in both themes (a disc is a mark, not a surface). A fill against the page is under 3:1 (1.6–2.6 on white); that is acceptable because a mark never stands alone: its name is always next to it, and the initial inside it passes. The mark has a 1px inset ring of ink at 14%.

**Wordmark on dark.** `_Molly` letters are drawn with `currentColor`, the underscore is the fixed brand Sky `#5B8DC5`. On the light page the letters are text-primary; on dark they are the dark theme's text-primary. This matches the kit's reverse version (`docs/design/brand-assets/v3/molly/molly-wordmark-reverse.svg`, same paths, Paper-coloured letters); we use `currentColor` so one component serves both. Sky on the dark sidebar is 5.5:1; on white it is 3.5:1, which is the brand's own value and is acceptable for a logo.

**Type.** Inter 400/500/600. Rows, nav and buttons 13/20. Metadata 12/18. Pane title 20/28, −0.012em, 600. kbd 11/16 in the mono font. No uppercase mono labels (the old tracked caps become sentence-case 12px grey). Tabular figures everywhere, because Molly is a finance product.

**Sizes.** Sidebar 224px; header 44px; chip bar 40px; group header 32px; row 38px (phone 56px); sidebar item 28px (phone 44px); page gutter 16px; pane gutter 24px; pane content max 720px; pane is `min(58%, 620px)`; phone targets 44px minimum. Radii: 4 kbd; 6 buttons, chips, nav; 8 board tiles; 10 action card; 12 floating layers (palette, toast, dialog). Only floating layers have a shadow.

**Motion.** Hover and selection 80ms. Pane slide 160ms (12px translate plus fade, `cubic-bezier(.2,.7,.2,1)`), and it tells you the record opened beside the list. A removed row fades 120ms then collapses 160ms, so the list closes the gap you can see. Group collapse 160ms. Drawer 200ms. Primary buttons press 1px down. Reduced motion removes all of it (in the mockup too).

**Keyboard** (all shown, none taught): `j`/`k` or arrows move the cursor, `Enter` opens, `j`/`k` in the pane steps to the next record (inside Approvals it steps the signups first), `Esc` closes one layer at a time (palette, then drawer, then pane), `⌘K` opens a palette with actions and places, and the pane's primary has its letter inside the button (`A`, `D`, `R`, `U`, `E`, `O`). Nothing fires while typing in a field.

## 3. Token table (Molly's own values)

Rules: text pairs at least **4.5:1**, glyph pairs at least **3:1**. "Role" is the pattern 8 role in PLAN-1. "Variable" is where Alvin puts it in the scoped block (existing variables are redefined; new ones are marked *new*, and `tailwind.config.ts` gets `pane`, `sel`, `open`).

How ratios were made: dark values by the script `docs/design/redesign-v1-contrast.js` (WCAG 2.x formula). Light values for the new tiers were computed by hand from the same formula, because the light half of the script output was cut off in the session that ran it. **Alvin: run `node docs/design/redesign-v1-contrast.js` once before WS156 and compare; WS156's test must enforce these.** Translucent tiers (hover, selected, open) are composed over the tier they sit on before measuring.

### 3.1 Surfaces and lines

| Role | Variable | Light | Dark |
|---|---|---|---|
| Page (list) | `--color-bg` | `#FFFFFF` | `#14171B` |
| Sidebar | `--color-sidebar` | `#F4F5F7` | `#0E1013` |
| Pane | `--color-pane` *new* | `#FAFBFC` | `#191C21` |
| Raised (cards, tiles, inputs fill) | `--color-surface` | `#F0F2F4` | `#20242A` |
| Pressed / segmented | `--color-well` | `#E6E9ED` | `#292E36` |
| Hover | `--color-row-hover` | `rgba(18,24,38,.035)` | `rgba(255,255,255,.04)` |
| Selected / cursor row | `--color-sel` *new* | `rgba(18,24,38,.06)` | `rgba(255,255,255,.07)` |
| Open (row shown in pane) | `--color-open` *new* | `rgba(18,24,38,.085)` | `rgba(255,255,255,.10)` |
| Hairline | `--color-row-divider` / `--color-border` | `rgba(18,24,38,.09)` | `rgba(255,255,255,.08)` |
| Hairline, stronger (ghost button edge) | `--color-border-hover` | `rgba(18,24,38,.17)` | `rgba(255,255,255,.14)` |
| Control border (inputs, checkboxes) | `--color-ctl` *new* | `#858C97` | `#6E7681` |
| Float shadow | `--shadow-float` | `0 12px 32px -8px rgb(18 24 38 / .22)` + 1px ring | `0 14px 36px -8px rgb(0 0 0 / .6)` + 1px ring |
| Scrim | `--scrim` | `rgb(18 24 38 / .30)` | `rgb(0 0 0 / .5)` |

Control border against its surface: light 3.4:1 on page, 3.3:1 on pane; dark 3.9:1, 3.7:1 (glyph rule, 3:1). The stronger hairline is decoration on a button that also has a label and a fill on hover, so it is not held to 3:1.

### 3.2 Text and accent, with contrast

| Pair (text on surface) | Light | Dark |
|---|---|---|
| Text primary on page / sidebar / pane / raised / pressed | 17.8 / 16.3 / 17.2 / 15.9 / 14.6 | 15.2 / 16.1 / 14.4 / 13.2 / 11.5 |
| Text secondary on page / sidebar / pane / raised / pressed | 8.5 / 7.8 / 8.2 / 7.6 / 7.0 | 8.1 / 8.5 / 7.6 / 7.0 / 6.1 |
| Text muted on page / sidebar / pane / raised / pressed | 6.3 / 5.7 / 6.0 / 5.6 / 5.1 | 6.9 / 7.3 / 6.6 / 6.0 / 5.2 |
| Muted on the open row (worst case) | 5.2 | 5.2 |
| Accent as text/link/focus on page / sidebar / pane / raised / pressed / open row | 5.8 / 5.3 / 5.6 / 5.2 / 4.8 / 4.9 | 7.3 / 7.8 / 7.0 / 6.4 / 5.6 / 5.6 |
| On-accent on accent (primary button) | 5.8 (`#FFFFFF` on `#44688E`) | 7.5 (`#0C1522` on `#7BA9DD`) |
| On-accent on accent hover | 7.4 (`#3A5876`) | 9.1 (`#93BAE6`) |
| Accent on accent-soft (selected chip) | 5.1 | 5.6 |

Values: text primary `#15181D` / `#E9ECF0`; secondary `#474D57` / `#A7AEB9`; muted `#5A616C` / `#9AA1AC`; accent `#44688E` / `#7BA9DD` (`--color-accent`, `--color-accent-rgb` 68 104 142 / 123 169 221); accent hover `#3A5876` / `#93BAE6`; accent-soft `rgba(68,104,142,.10)` / `rgba(123,169,221,.16)` (*new* `--color-accent-soft`); on-accent `#FFFFFF` / `#0C1522` (`--color-accent-foreground`). Muted was raised in dark from `#8C94A0` to `#9AA1AC` after the first run showed 4.46:1 on the pressed tier.

### 3.3 State colours (glyphs and short text)

| Role | Variable | Light | Dark | On page / sidebar / pane / raised / pressed / open row, light | Same, dark |
|---|---|---|---|---|---|
| Done | `--color-done` *new* | `#1B7448` | `#5BC48E` | 5.8 / 5.3 / 5.6 / 5.1 / 4.7 / 4.8 | 8.3 / 8.8 / 7.9 / 7.2 / 6.3 / 6.3 |
| Stuck (waiting on you) | `--color-stuck` *new* | `#B3362A` | `#F2877C` | 6.0 / 5.5 / 5.8 / 5.4 / 5.0 / 5.1 | 7.3 / 7.7 / 6.9 / 6.3 / 5.6 / 5.5 |
| Warn (aging) | `--color-warn` *new* | `#8A5A0B` | `#E0A640` | 5.9 / 5.4 / 5.7 / 5.3 / 4.9 / 5.0 | 8.3 / 8.8 / 7.9 / 7.2 / 6.3 / 6.3 |

All three clear 4.5:1 as text, so a state word and its glyph use the same value.

| Soft fill (10% in light, 14–16% in dark) | Variable | Light | Dark | Text on its own fill, light | dark |
|---|---|---|---|---|---|
| Done soft | `--color-done-soft` *new* | `rgba(27,116,72,.10)` | `rgba(91,196,142,.16)` | 5.0 | 6.2 |
| Stuck soft | `--color-stuck-soft` *new* | `rgba(179,54,42,.08)` | `rgba(242,135,124,.14)` | 5.4 | 5.8 |
| Warn soft | `--color-warn-soft` *new* | `rgba(138,90,11,.10)` | `rgba(224,166,64,.14)` | 5.2 on page, 5.0 on pane | 6.5 / 6.1 |

Deviation to note: Molly's brand "destructive" is Laterite (`#8F4A30`), a brown-red. A brown red does not read as an alarm at 14px, so "stuck" is a truer red, `#B3362A`, still deep enough to sit in the same family. Laterite stays in the clay tone pair.

### 3.4 Tone pairs (stage chips, column fills: fill and ink)

Light pairs are Molly's existing ones, unchanged. Dark pairs are new. Each pair is ink on its fill.

| Tone | Light fill / ink | Ratio | Dark fill / ink | Ratio |
|---|---|---|---|---|
| Stone (neutral, To do) | `#E7E4DA` / `#46443C` | 7.7 | `#2A2D33` / `#C9CDD4` | 8.7 |
| Sky (info, In progress, Seed) | `#DCE7F3` / `#2C4459` | 8.1 | `#1F3249` / `#B9D3F0` | 8.5 |
| Sage (current, Done, Series A) | `#E3E8D0` / `#4A5524` | 6.4 | `#27301D` / `#C5D69A` | 8.8 |
| Clay (behind, Blocked) | `#F4E0D6` / `#8F4A30` | 5.2 | `#3D2620` / `#F0B5A0` | 7.9 |
| Sand (Pre-seed) | `#F1E4C8` / `#6B4A0E` | 6.4 | `#38301A` / `#E8CF93` | 8.6 |
| Amber (aging strips) | `#F8EBC9` / `#6B4A0E` | 6.8 | `#3A2F14` / `#EDCB7E` | 8.4 |

### 3.5 Identity fills (same in both themes)

| Name | Fill | Hue | Initial `#14161A` on fill |
|---|---|---|---|
| Lime | `#B7D86A` | 78° | 11.3 |
| Teal | `#6CCBC6` | 177° | 9.5 |
| Indigo | `#9A96F0` | 243° | 6.9 |
| Violet | `#B493F0` | 261° | 7.2 |
| Orchid | `#D08CE6` | 285° | 7.4 |
| Magenta | `#EA8DC3` | 325° | 7.9 |
| Stone | `#C9C2B6` | 38°, saturation 15% | 10.2 |
| Slate | `#A9B6C6` | 213°, saturation 20% | 8.8 |

### 3.6 Radii and type roles (for WS156)

`--r-sm` 4px, `--r-ctl` 6px, `--r-def` 6px, `--r-chip` 6px, `--r-md` 8px, `--r-lg` 10px, `--r-float` 12px, `--r-sheet` 0. `--shadow-soft` and `--shadow-lift` none. `--tracking-label` 0. Type roles `text-row` 13/20, `text-meta` 12/18, `text-pane-title` 20/28 −0.012em 600 (and add all three to `extendTailwindMerge`, PLAN-1 risk 5).

## 4. What is deliberately not in the mockup

- **Sidebar icons.** The nav is text only here to keep the study about type, tone and spacing. Production keeps Molly's existing lucide icons at 14px, 1.5 stroke, in muted grey.
- **The 17 nav items, their order and the four group names are Molly's current ones.** Only the first item changes (Dashboard becomes Needs you).
- Focus ring: 2px accent, 1px offset (5.8:1 or better against every surface in both themes).
- **Dark by default?** No. Light is the default, as decided; the switch is per person.

## 5. New labels for Nosa

Every new or changed word is wrapped in `data-nl` in the HTML (press "Show new labels"). Grouped here so Nosa can work down the list. Wording below is my placeholder, not a proposal; the words list is Nosa's.

- **Sidebar/shell:** Needs you; Search or jump to; Use the old look; the palette headings Actions and Go to.
- **Needs you groups:** Waiting on you; On the board; Alerts; Behind on updates; Portfolio.
- **Empty state:** "Nothing needs you right now." and "When someone signs up or an update runs late, it shows here."
- **Filters:** Kind; Company; Owner; Stage; Status; Due; Clear all.
- **Pane headings:** Why you're seeing this; Details; History; Latest figures; Recent updates; Notes; Proof links.
- **Pane actions:** Approve; Link to a company…; Open diligence; Open the board; Dismiss alert; Open company; Send a reminder; Mark as unblocked; Edit; Back to the list (screen-reader label); Undo.
- **Toasts:** "{name} approved"; "Alert dismissed"; "Reminder sent to {name}"; "Card unblocked".
- **Board:** To do; In progress; To review; Done; Waiting on you; Add a card.
- **Founder (stage 2):** Your next step; Start the update; Latest figures; From DFS; Recent updates; Switch company.
- **Action-card sentences** (approval, diligence, alert, overdue, waiting card) are written inline in the mockup and need Nosa's pass too.

The brand is "DFS", never "DFS Lab".

## 6. Things I was not sure about (decide at review)

1. **Needs you rows are queue rows** ("3 signups are waiting for approval"), as `buildAttention` gives today. A row per signup would read better but needs the pending list on the dashboard (the Approvals page already fetches it). I kept the no-new-API rule and let the pane step through the three signups. Say if you want per-signup rows.
2. **The waiting card's primary is "Mark as unblocked", not Edit.** PLAN-1 WS162 says Edit is primary; for a card that is waiting on you, the one thing to do is clear the wait. Edit becomes the secondary with `E`. That is a product behaviour: confirm the board has an "unblock" action today.
3. **"Stuck" red is truer than Laterite** (section 3.3).
4. **Light neutrals are cool, not Paper.** If you would rather keep a hint of warmth under the Sky, tell me; the tiers would shift a few points toward yellow and every ratio would need re-running.
5. **Dark primary button inverts** (dark ink on light blue). The alternative, white on `#44688E`, is 5.8:1 but looks heavy on a dark page.
6. Founder screens appear as a stage-2 preview only. Admin tokens are scoped to `[data-surface="admin"]` in stage 1; the founder phone screen shows what stage 2 would become, so approving it does not approve building it.

## 7. Handoff notes for Alvin

- Everything is token-driven under the scoped selector in PLAN-1 JC-RD-A; the three new Tailwind colours and three type roles are in 3.6.
- The mockup's `.row`, `.tile`, `.pane`, `.card`, `.chip` rules are a reference for geometry and states only, not class names to copy.
- Container queries (not viewport) decide which list columns drop out, because the list narrows when the pane opens (560px, 430px).
- `docs/design/redesign-v1-contrast.js` re-runs the numbers in this table. WS156's `design-tokens-v2.test.ts` should enforce the same pairs.
- If approved, WS168 marks `docs/design/app-ui-overhaul.md` §2 and §11 as superseded by this file.
