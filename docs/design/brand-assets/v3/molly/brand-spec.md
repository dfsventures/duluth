# Molly brand kit, round 3

Status: direction decided (2026-10-13), files not committed. Preview: https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr (round 3 is the top section).
Family rules, the DFS module and where round 3 bends the system: `../brand-spec.md`. Marge's kit: `../marge/brand-spec.md`. Round 2's kit (the LL block): `../../v2/molly/brand-spec.md`.

## Concept: Mosaic, calm
Molly is where the firm and its companies meet: founders update it, investors read it, the team runs it. A place, not a person.
The mark is a fragment of the Mosaic, the tile device DFS decks already use: one large tile for a company, one small tile, and a Sky tile where the underscore lives (bottom-left, as the DFS underscore sits at the foot of the letters). Three tiles on one 3 x 3 grid.
Round 2's version had five tiles and a floor row, and it read as a layout icon (a dashboard, a window). The brief for round 3 was fewer parts, nothing to read twice. The work was subtraction: five tiles became three, every edge sits on one grid, and the small tile shares the large tile's bottom edge, which is the only alignment in the mark.
Eight candidates are in `../concepts/molly/` with the reason each lost: Round 2's five tiles (a layout), uneven 2 x 2 (Windows, a dashboard, Mondrian), pinwheel (handsome and busy), slab on a floor (an image with a caption), small tile top-right (a header row plus one), diagonal (close second, weaker anchor), Sky bottom-middle (reads as a face), and the chosen three.

## 1. Logo
| File | Use |
|---|---|
| `molly-wordmark.svg`, `-reverse.svg` | **Primary logo**: `_Molly`. Underscore prefix, DFS proportions, always Sky. Identical to round 2 |
| `molly-wordmark-plain.svg` | no underscore, for lockups where the underscore is the seam between two names. Identical to round 2 |
| `molly-mark.svg`, `-reverse.svg`, `-mono.svg` | the mark: icons, avatars, the corner of the OG card. Obsidian and Sky on Paper; Paper and Sky on Obsidian; one colour |
| `molly-lockup.svg`, `-reverse.svg` | secondary: mark + name |
| `molly-mark-construction.svg`, `molly-wordmark-guides.svg` | the drawing, for handoff |

**Mark construction** (100-unit box on a 3 x 3 module): gutter 7 (one gap, a third of the 21-unit stem), cell (100 - 2 x 7) / 3 = 28.667, step 35.667. The large tile is 2 x 2 cells (64.33 square) at (0, 0). The small tile is one cell at (71.33, 35.67), right column, middle row, so its bottom edge (64.33) is the large tile's bottom edge. The Sky tile is one cell at (0, 71.33), bottom-left.
**Wordmark**: unchanged. Title-case `Molly`, cap 100, x-height 75, y tail 25 below the baseline, drawn on the DFS logo's own letters (JetBrains Mono ExtraBold, stem 0.205 of cap): custom M (width 0.82 of cap, flat vertex on the baseline, 150-unit diagonals at cap 730), the two l's as plain stems at cap height, the o and y from the font. Spacing is by closest approach: M-o 11.0%, o-l 11.0%, l-l 12.6%, l-y 12.6% of cap. The underscore is 66.5 x 18.1, 7.4 below the baseline, 15.1 to the M.
**Lockup**: the mark runs from the cap line to the underscore line (125.5 units when the cap is 100), so the Sky tile sits in the underscore zone, the way DFS's own bar does. Gap 56 units (0.56 of the cap). The primary logo is still the wordmark alone; use the lockup where the mark is wanted next to the name.
- **Clear space**: 0.5 of the mark or of the cap height on every side in product; 1.0 for press (DFS's own rule is one D height). Nothing, including the DFS logo, enters it. Put a divider or twice the gap between Molly and DFS.
- **Minimum size**: mark 16px using the pixel-grid cut below; wordmark cap height 9px; print mark 6mm.

## 2. Icon set
Obsidian square tile (A+: no radius; the OS masks the 180 and 512), mark in Paper with the Sky tile, filling 62% of the tile and nudged 2.5 right and 1.5 down (percent of the tile), because the mass sits top-left (centroid at 37, 42 of 100).
- `molly-icon-512.svg`, `png/molly-icon-512.png`, `png/molly-icon-72.png`, `png/molly-apple-touch-180.png`
- Favicon on a 16 grid, whole pixels: tile 16, mark 12 x 12 at (2, 2). In mark coordinates: large tile 7 x 7 at (0, 0), small tile 4 x 4 at (8, 3) (its bottom edge, y 7, is the large tile's), Sky tile 4 x 4 at (0, 8), gutter 1. Sizes 32 and 48 are exact multiples. Files: `molly-icon-favicon-16.svg`, `molly-icon-favicon.svg` (32), `molly-icon-favicon-48.svg`, `png/molly-favicon-{16,32,48}.png`, `molly-favicon.ico` (16, 32, 48 as PNGs; ship as `favicon.ico`).
- Replaces `public/favicon.png`, the bare DFS bar, which makes every DFS tab look the same.
- Checked as PNGs at real size on white and on a dark browser bar: three tiles stay distinct at 16px, the Sky tile is the only colour.

## 3. Email header and OG card
- **Email header, unchanged since round 2**: `molly-email-header.svg`, `png/molly-email-header@1x.png` (160 x 29), `@2x.png` (320 x 58). The DFS logo untouched, then `_Molly` at the same cap height: the equal-billing pattern from dfs.vc/brand.html. Opaque on Paper (not transparent) so dark-mode clients keep a readable light block. Replaces the logo `<img>` and the "Molly · Portfolio Platform" span in `src/lib/email.ts` (alt "Molly, from DFS Lab"; round 2 proposed "DFS Molly", which reads as a product name). The mosaic mark does not appear in the email; it shows only where a client displays a sender icon.
- **OG card, new**: `molly-og-card.svg`, `png/molly-og-card.png` (1200 x 630). The mark is three lit tiles in an unlit wall. Obsidian ground; wall tiles in #25251D (cell 116, gutter 28, origin 588, 48, bleeding off the right and bottom edges); the three lit tiles are Paper (2 x 2), Paper (1 x 1) and Sky (1 x 1) in the mark's positions. Everything stands on the grid: the wordmark's cap line is the wall's top (y 48), the headline's first line stands on the large tile's bottom edge, and the descriptor stands on the Sky tile's bottom edge. Wordmark at cap height 44. Headline "Founder updates in." and "Fund reports out." on two lines (64px apart), Space Grotesk 600 at 50px (the longer final headline needed 50px to clear the wall by 31px; the placeholder was 56px). Descriptor "DFS LAB PORTFOLIO PLATFORM" in JetBrains Mono 700 at 15px with 0.1 em tracking, in Sky. All of it is outlined, so changing the copy means regenerating the card. The copy is final and comes from `../COPY.md`. Only login and the root are public.

## 4. Colour roles
| Role | Token | Hex |
|---|---|---|
| Ground, tiles on Paper, ink | Obsidian | #14140F |
| Reverse tiles, canvas | Paper | #EBE8DE |
| The Sky tile and the underscore, once per surface | Sky | #5B8DC5 |
| OG wall tiles (OG card and the future wall only) | Wall | #25251D |
| Text-size blue (links, buttons), never the mark | DFS blue | #44688E |
| Never in Molly's marks | Clay (Marge's), Ochre | #B56D44, #C9963A |

Sky on Paper is 2.8:1, below 3:1, so the Sky tile is an accent and the Obsidian tiles carry the mark alone on light grounds. On Obsidian it is 5.3:1. Paper on Obsidian is 15.1:1.

## 5. Type
Wordmark: custom outlines, never retype. Headlines Space Grotesk 600. Body and UI IBM Plex Sans 400/500. Primary CTAs and labels JetBrains Mono 700 caps (0.06em, the existing `cta` role). The logo is square on admin (A+) and on founder and LP surfaces (direction B): it never rounds.

## 6. Motion: laying tiles (one idea)
The large tile settles (scale 0.88 to 1 from its top-left corner, fading in, 420ms). The small tile slides in 16px from the right 110ms later (420ms). The Sky tile drops in 16px from above 260ms in (460ms) and then blinks twice like a cursor (700ms per blink, `steps(1)`, starting 800ms in). Ease-out `cubic-bezier(.2,.8,.2,1)`. Use on login first paint, and as a single Sky blink when something is saved or published. Nowhere else. Motion says what changed: a tile is a company added to the wall. Reduced motion shows the final frame.

## 7. Voice (short)
Molly speaks inside the product, not as a character: no first person, no sign-offs, errors say what happened and what to do. Questions to a human go to the reply-to address.

## 8. Do and don't
Do: lead with `_Molly`; reverse on Obsidian with the Sky tile still Sky; keep clear space; ship the PNG in email; use the mark where there is no room for the name (icons, avatars, the OG wall).
Don't: add a fourth tile (three is the rule); move the tiles off the grid or off their shared edge; recolour the Sky tile (Clay is Marge's); round the tiles (Molly is square); put the mark tight against the name (gap 0.56 of the cap); stretch, skew or put it on a busy photo.

## Implementation notes for Alvin
See `../brand-spec.md`, handoff items 1 to 4 and 6, and `../MANIFEST.md` for every file's destination. Nothing here touches product code yet.

## Decisions (locked 2026-10-13)
1. `_Molly` leads wherever there is no icon; the lockup (mark plus name) is secondary.
2. `public/favicon.png` and `LogoMark` are replaced together.
3. Lockup mark size: cap line to underscore line, gap 0.56 of the cap.
4. OG card copy: set from `../COPY.md` ("Founder updates in. Fund reports out." / "DFS LAB PORTFOLIO PLATFORM"). The placeholder is gone.
5. Email header opaque on Paper, alt "Molly, from DFS Lab".
6. The Mosaic wall as a pattern for the login hero and empty states is a later round, built from real holdings.
7. Dark mode: the reverse exists; the product has no dark mode and none is proposed.

## Still weak
- Three squares are generic on their own. The wall around them (OG card, future pattern) is what makes the mark Molly's.
- The mark is lighter than the wordmark by design; in a lockup at small sizes it can look under-weight.
- Nothing has been checked in a real browser tab, Gmail or a social preview. The `.ico` is three PNGs, untested across browsers. The motion is a demo, not code.
