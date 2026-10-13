# Molly brand kit, round 2

Status: proposal, not committed. Preview: https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr
Family rules and the DFS module: `../brand-spec.md`. Marge's kit: `../marge/brand-spec.md`.

## Concept: Ledger Corner
Molly is where the firm and its companies meet: founders update it, investors read it, the team runs it. A place, not a person.
The mark is the name's two L's: two corners, one stepped inside the other, and a Sky block where the cursor lands. In the cursor family, DFS is the underscore (it is ready), Molly is the block (you are in the record, selecting, not typing), Marge is the underscore as a mouth.
Alternatives drawn and rejected, with reasons, are in the preview and in `../concepts/`: Mosaic (best as a pattern, a layout icon as a mark), Double rule (an equals sign), and six killed sketches.

## 1. Logo
| File | Use |
|---|---|
| `molly-wordmark.svg`, `-reverse.svg` | **Primary logo**: `_Molly`. Underscore prefix, DFS proportions, always Sky |
| `molly-wordmark-plain.svg` | no underscore, for lockups where the underscore is the seam between two names |
| `molly-mark.svg`, `-reverse.svg`, `-mono.svg` | the mark: icons, avatars, the corner of the OG card |
| `molly-lockup.svg`, `-reverse.svg` | secondary: mark + name |
| `molly-mark-construction.svg`, `molly-wordmark-guides.svg` | the drawing, for handoff |

**Mark construction** (100-unit box): stem 21, gap 7, so each step is 28. L1 is the full L. L2 is L1 moved up and right by one step and cropped by the frame. The block is the third step: 21 square at (56, 23), with a 7 gap to L2 on both sides.
**Wordmark**: Title-case `Molly`, cap 100, x-height 75, y tail 25 below the baseline. Drawn on the DFS logo's own letters (JetBrains Mono ExtraBold, stem 0.205 of cap): custom M (width 0.82 of cap, flat vertex on the baseline, 150-unit diagonals at cap 730), the two l's as plain stems at cap height, the o and y from the font. Spacing is by closest approach, not cells: M-o 11.0%, o-l 11.0%, l-l 12.6%, l-y 12.6% of cap (DFS's D to F is 14.6%). The underscore is 66.5 x 18.1, 7.4 below the baseline, 15.1 to the M.
**Lockup**: gap 0.44 of the mark (44 units); the name's cap height equals the mark; baselines align. The primary logo is the wordmark alone because the mark's L's rhyme with the "ll" in the name.
- **Clear space**: 0.5 of the mark or of the cap height on every side in product; 1.0 for press (DFS's own rule is one D height). Nothing, including the DFS logo, enters it. Put a divider or twice the gap between Molly and DFS.
- **Minimum size**: mark 16px using the pixel-grid cut; wordmark cap height 9px; print mark 6mm.

## 2. Icon set
Obsidian square tile (A+: no radius; the OS masks 180 and 512), mark in Paper with the Sky block at 60% of the tile.
- `molly-icon-512.svg`, `png/molly-icon-512.png`, `png/molly-apple-touch-180.png`
- Favicon on a 16 grid: tile 16, mark 10 x 10 at (3, 3), stems 2, gaps 1, block 2. Sizes 32 and 48 are exact multiples. `molly-icon-favicon-16.svg`, `molly-icon-favicon.svg` (32), `molly-icon-favicon-48.svg`, `png/molly-favicon-{16,32,48}.png`, `molly-favicon.ico` (ship as `favicon.ico`).
- Replaces `public/favicon.png`, the bare DFS bar, which makes every DFS tab look the same.

## 3. Email header and OG card
- `molly-email-header.svg`, `png/molly-email-header@1x.png` (160 x 29), `@2x.png` (320 x 58). The DFS logo untouched, then `_Molly` at the same cap height: the equal-billing pattern from dfs.vc/brand.html. Opaque on Paper (not transparent) so dark-mode clients keep a readable light block. Replaces the logo `<img>` and the "Molly · Portfolio Platform" span in `src/lib/email.ts` (alt "DFS Molly"). Make the path env-overridable like `EMAIL_LOGO_PATH`.
- `molly-og-card.svg`, `png/molly-og-card.png` (1200 x 630). The nested L's drawn at 5.6x, touching the left and bottom edges like the corner of a room, the Sky block as the cursor. The wordmark's cap line is the top of the L's; the descriptor stands on the outer foot's top edge. Headline "Portfolio updates and reports." is placeholder, mirroring the login description. Only login and the root are public.

## 4. Colour roles
| Role | Token | Hex |
|---|---|---|
| Ground, corners, ink | Obsidian | #14140F |
| Reverse ink, canvas | Paper | #EBE8DE |
| The block and the underscore, graphic use only, once per surface | Sky | #5B8DC5 |
| Text-size blue (links, buttons), never the mark | DFS blue | #44688E |
| Never in Molly's marks | Ochre | #C9963A |

Sky on Paper is 2.8:1, below 3:1, so the block is an accent and the L's carry the mark alone. On Obsidian it is 5.3:1.

## 5. Type
Wordmark: custom outlines, never retype. Headlines Space Grotesk 600. Body and UI IBM Plex Sans 400/500. Primary CTAs and labels JetBrains Mono 700 caps (0.06em, the existing `cta` role). The logo is square on admin (A+) and on founder and LP surfaces (direction B): it never rounds.

## 6. Motion: steps (one idea)
The first L settles; the second steps up and right 120ms later; the block lands 300ms in and blinks twice like a cursor. 480ms ease-out (`cubic-bezier(.2,.8,.2,1)`), 520ms for the block. Use on login first paint and as a single block blink when something is saved or published. Nowhere else. Motion says what changed: a step is a quarter added to the record. Reduced motion shows the final frame.

## 7. Voice (short)
Molly speaks inside the product, not as a character: no first person, no sign-offs, errors say what happened and what to do. Questions to a human go to the reply-to address.

## 8. Do and don't
Do: lead with `_Molly`; reverse on Obsidian with the block still Sky; keep clear space; ship the PNG in email.
Don't: recolour the block (Ochre is Marge's); put the mark tight against the name (it stutters); stretch, skew or round it; put it on a busy photo; add Ochre to the mark.

## Implementation notes for Alvin
See `../brand-spec.md`, handoff items 1 to 4 and 6. Nothing here touches product code yet.

## Open decisions (recommendations)
1. Wordmark first or mark plus name: wordmark first.
2. Replace `public/favicon.png` and `LogoMark` together: yes.
3. OG headline: keep it plain.
4. Email header opaque: yes.
5. Mosaic as a secondary pattern: build next, not now.
6. Dark mode: the reverse exists; the product has no dark mode and none is proposed.
