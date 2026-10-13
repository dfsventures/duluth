# Molly and Marge, round 3: family spec

Status: directions decided (2026-10-13), files not committed. Preview with every asset, the exploration, the colour options and the four context mockups:
https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr (private; sharing is the owner's call). Round 3 is the top section; rounds 2 and 1 are kept below it.
Kits: `molly/brand-spec.md` and `marge/brand-spec.md`. Rounds 1 and 2 were removed from the tree on 2026-10-13; see git history (commit `408f948`) and the brand artifact for comparison.

## What round 3 did
The round-2 review chose concept B for both products and named three faults: Molly's mark was too busy, Marge's colour was wrong, and the face on Marge was not welcoming. So round 3 is subtraction and a new colour, not a new idea.

| | Recommended in round 2 | Chosen after round 2 | Round 3 (this folder) |
|---|---|---|---|
| Molly | LL block: two stepped L's and a Sky block | Mosaic (B): five tiles and a floor row | Three tiles on one 3 x 3 grid |
| Marge | Deadpan (A): a face in a bubble on an Ochre tile | Dog-ear (B): a folded note | The DFS D as a speech bubble, its square corner folded down into the tail, one line of text, no face, on a Clay tile |

Round 3b (after review of the 512 render): the first Marge, a round body with the corner folded in, read as a peeled sticker. Her body is now a rounded rectangle (radius 28) and the fold is her tail (45 degrees, 28-unit legs, Cocoa). Only Marge's files changed. Molly's OG card was also regenerated with the final copy from `COPY.md` (headline "Founder updates in. Fund reports out.", descriptor "DFS LAB PORTFOLIO PLATFORM").

Unchanged and byte-identical to round 2: both wordmarks (`_Molly`, `_Marge`, with and without the underscore), the wordmark guides, `family-lockup*.svg` and its PNG, the Molly email header (SVG, @1x, @2x), the wordmark PNGs, and the shared capital M.

## The idea
DFS's signature is the underscore, a cursor: ready, mid-thought. On dfs.vc/brand.html it is also "the seam between firm and company", partners are written `_PartnerCo`, and decks use a Mosaic of tiles. The family keeps one grammar and gives each sibling its own idea.

| | Mark | Reads as |
|---|---|---|
| DFS | `_` | the underscore. Also today's favicon (`public/favicon.png`, a bare Sky bar on white) |
| Molly | three tiles | a fragment of the Mosaic: one large company, one small, and the Sky tile that sits where the underscore lives. The place where the portfolio is laid out |
| Marge | a bubble, a fold, a line | the D of DFS as a speech bubble, its square corner folded down into the tail ("to come back to"), with the DFS bar written in it as the first line of a note. The teammate who keeps notes |

## Where B bends the family system
Round 3 keeps the system and bends it in five places. Nothing here was forced silently.
1. **Marge's ground changes from Ochre to Clay (#B56D44).** Clay is the midpoint of Baobab (#C3804A) and Laterite (#A65A3E). It was not a DFS colour; it is now accepted as a named DFS tint (decided 2026-10-13). It is justified by contrast (4.0:1 on white, 4.2:1 on Slack dark, 3.3:1 on Paper; Ochre was 2.7:1 on white). "Three grounds" becomes: Paper is DFS, Obsidian is Molly, Clay is Marge.
2. **"Everything is a typed character" loosens.** It holds for DFS (the underscore). For Molly it holds only by extension: the block cursor repeated on a grid. For Marge it is the underscore written down as the first line of a note. The names stay typed (`_Molly`, `_Marge`).
3. **Sky returns inside Marge's avatar**, as her line, on a Paper bubble (2.8:1). Round 2 said "never in the avatar" only because Sky on Ochre is 1.3:1. The small-size cut swaps the line to Obsidian.
4. **Molly's mark stops being a letterform.** Round 2's mark was the name's two L's. Round 3's is blocks on a grid, so the "LL" story is gone and the mark relies on proportion, the shared edge and the Sky tile.
5. **The module is unchanged**, and it is what holds the siblings together: stem 0.21 of cap, one gap = a third of a stem (7 units in a 100-unit box, which is Molly's gutter), and the DFS bar (0.665 x 0.181 of cap) is Marge's line at 63%. Marge's corner radius and her tail are both four gaps (28).

## The module (measured from `public/brand/dfs-logo-primary.svg`, cap height 64.26)
| Part | Measured | In cap units |
|---|---|---|
| Stem | 13.45 | 0.209 |
| Horizontal arms | 12.3 | 0.19 |
| Underscore | 42.72 x 11.65 | 0.665 x 0.181 |
| Baseline to underscore | 4.76 | 0.074 |
| Underscore to first letter | 9.71 | 0.151 |
| Closest approach D to F | 9.4 | 0.146 |

## Rules the siblings share
1. **One module.** Stem 0.21 of cap, one gap = a third of a stem. Molly's gutter is that gap. Marge's line is the DFS bar at 63%. Marge's bubble is the soft exception.
2. **The underscore keeps its jobs.** Prefix on every name, the seam between names in lockups, always Sky and in DFS proportions. Each mark also carries one Sky element that stands for it: Molly's Sky tile, Marge's line.
3. **Three grounds.** Paper is DFS, Obsidian is Molly, Clay is Marge. Sky appears once per surface. Clay never touches Molly's marks. Ochre is not used by the family marks (it stays a DFS palette colour).
4. **Radius is the dial.** Molly is square (admin A+). Marge is soft: bubble radius 28 on three corners, tile radius 0.22 of the tile for rounded uses; Slack, Telegram and the OS round full-bleed squares themselves. Both names begin with the same drawn capital M (flat vertex on the baseline, 150-unit diagonals at cap 730).

## Colour roles and contrast
| Token | Hex | Molly | Marge | DFS |
|---|---|---|---|---|
| Obsidian | #14140F | ground, tiles on Paper, ink | small-cut line, wordmark ink | ink |
| Paper | #EBE8DE | reverse tiles, canvas | the bubble | ground |
| Sky | #5B8DC5 | the Sky tile, wordmark underscore | the line, wordmark underscore | the underscore |
| Clay (new) | #B56D44 | never | the field of the avatar and tile; the bubble on Paper | not used |
| Cocoa | #C9B08A | never | the fold on Clay and on Obsidian | not used |
| Laterite | #A65A3E | never | the fold when the bubble is Clay, on Paper | not used |
| DFS blue | #44688E | links and buttons, never the mark | same | same |
| Ochre | #C9963A | never | not used (round 2's field) | not used |

Measured contrast (WCAG ratio): Paper/Obsidian 15.1, Sky/Obsidian 5.3, Sky/Paper 2.8 (below 3:1, so Sky is an accent on light grounds and never the only carrier of a mark). Clay on white 4.0, on Slack dark 4.2, on Paper 3.3; Obsidian on Clay 4.6; Paper on Clay 3.3. Cocoa on Clay 1.9 and on Paper 1.7: the fold is a soft shadow by design, not a carrier of meaning. Laterite on Paper 4.1. Slack dark is approximated as #1A1D21, from memory of the theme and not sampled from a real workspace.

## Type
Wordmarks are outlines; never retype them. Headlines Space Grotesk 600, body IBM Plex Sans, labels and primary CTAs JetBrains Mono 700 caps. JetBrains Mono and Space Grotesk are both SIL OFL, which allows modified outlines in a logo; no font files ship. The OG card's headline and descriptor are outlined too.

## Files
| File | Use |
|---|---|
| `family-lockup.svg`, `family-lockup-reverse.svg` | `_DFS _Molly _Marge` at one cap height. DFS letters are the untouched logo paths. Identical to round 2 |
| `family-icons.svg`, `png/family-icons@2x.png` | the three icon tiles side by side: DFS bar on white, Molly's tiles on Obsidian, Marge's bubble on Clay |
| `png/family-lockup@2x.png` | presentation use |
| `molly/`, `marge/` | the two kits, each with `brand-spec.md`, SVGs, `png/` and an `.ico` |
| `COPY.md`, `MANIFEST.md` | the final copy (Molly and Marge strings) and the list of every final file with where it is installed |
| `concepts/` | the exploration, so it survives if a direction changes: 8 Molly candidates, 7 earlier Marge shapes (the last is the superseded folded corner) and 5 round 3b speech-bubble variants (tile art only) |
| note on the DFS letters | In `family-lockup*.svg` and `molly/molly-email-header.svg` the DFS letters are the logo's own paths filled Obsidian or Paper instead of #000 or #FFF (visually identical on these grounds). Dfs.vc/brand says not to recolour the logo, so where DFS's official file sits next to Molly in the product (nav, email), place `public/brand/dfs-logo-primary.*` unchanged |

## Handoff for Alvin (directions approved; `MANIFEST.md` lists every file and its destination)
1. Favicons and app icons for molly.dfs.vc go under `public/`, not `src/app/`: `molly/molly-favicon.ico` as `public/favicon.ico`, `molly/molly-icon-favicon.svg` as `public/brand/molly-icon.svg`, `molly/png/molly-apple-touch-180.png` as `public/brand/molly-apple-touch-180.png`, and `metadata.icons` in `src/app/layout.tsx` points at them. Reason: `src/middleware.ts` exempts only `favicon.ico`, `favicon.png` and the `/brand` prefix, so Next's `src/app/icon.svg` and `apple-icon.png` routes would redirect signed-out visitors to /login. Replaces `public/favicon.png`.
2. `src/components/ui/logo-mark.tsx`: replace the typed `_Molly` with an inline SVG of `molly/molly-wordmark.svg`, sized by height. 20px for nav, 22px for the login header. The wordmark did not change in round 3.
3. `src/lib/email.ts`: the header image is unchanged since round 2: one image, `molly/png/molly-email-header@2x.png` installed as `public/brand/molly-email-header.png` (no `@` in a served URL), displayed 160 x 29, with alt "Molly, from DFS Lab" (round 2 proposed "DFS Molly", which reads as a product name; the code today uses the org name). It replaces the DFS logo `<img>` plus the "Molly · Portfolio Platform" span. Make the path env-overridable like `EMAIL_LOGO_PATH`.
4. OG: `molly/png/molly-og-card.png` (1200 x 630, new design, final copy) installed as `public/brand/molly-og-card.png` and used as the root and login `openGraph.images` (absolute URL, so `metadataBase` is needed).
5. Marge is outside this repo. Her files go to `/Users/josephbenson/GitHub/marge` for the Slack app, the Telegram bot and marge.dfs.vc (see `MANIFEST.md` and `marge/brand-spec.md`).
6. Do not retype either wordmark in CSS, do not use Clay in Molly's UI, and do not add Ochre to Molly's chrome beyond the existing attention marker.
7. Clay is accepted: add it to the brand spec as a named token (`Clay #B56D44`, Marge's field). The product's own palette needs nothing until Marge has a UI here.
8. Product strings (page title, meta description, login line, email footer) come from `COPY.md`.

## Decisions (locked 2026-10-13)
1. Marge's colour: Clay (#B56D44). Baobab and Laterite stay in `marge/options/` for reference.
2. Clay is accepted as a named DFS tint. Add it to the brand spec.
3. The Sky line inside Marge's avatar stays (the small cut uses Obsidian).
4. Molly's mark is the three-tile mosaic as drawn. The lockup runs cap line to underscore line with a 0.56-of-cap gap, and `_Molly` leads wherever there is no icon.
5. The Mosaic wall as a pattern file (a treemap of real holdings for the login hero and empty states) is a later round.
6. `public/favicon.png` and `LogoMark` are replaced in one change.
7. Carried from round 2, unchanged: email header opaque on Paper; Marge's lowercase is Space Grotesk extrapolated past its axis (ship the SVG, never live text). The OG card now carries the final copy from `COPY.md`, so "Portfolio updates and reports." is gone. Dot's lineage is moot as a design question, because it rested on Marge's two dot eyes. What remains is whether to mention Dot at all; recommend not until Dot is retired.

## Still weak
- Molly's mark is three squares. It is calm and grid-true and carried by proportion, the Sky tile and the shared edge, but on its own it is not unmistakable. It becomes unmistakable only with the wall around it (the OG card, the future pattern). If it still feels generic, the fix is the wall, not more tiles.
- The mark is lighter than the wordmark. That is deliberate. In the lockup it is sized to run cap line to underscore line to compensate.
- Marge is warmer and less characterful than the face was. The bubble now reads as speech at 512, 36 and 20, but at 24px and under the fold tone is dropped on purpose, so she is a plain bubble with a line there. The fold, the colour and the voice have to do the work the face did. Her voice is written out in `COPY.md` and is untested with the team.
- Clay is a new named tint: it has to be added to the brand spec and to anywhere the DFS palette is listed.
- Nothing has been seen in a real Slack workspace, Telegram, Gmail or a browser tab. The Slack, login and email mockups are rebuilt from the repo's code and from memory of Slack's layout. Upload the 512 files to the real apps before trusting any of it.
- The `.ico` files are three PNGs, not opened in every browser. The email header is untested in clients.
- Motion is a demo, not a spec in code. The Mosaic wall has no pattern file.
