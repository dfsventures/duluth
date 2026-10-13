# Molly and Marge, round 2: family spec

Status: proposal, not committed. Preview with every asset, the three concepts per product and the context mockups:
https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr (private; sharing is the owner's call).
Kits: `molly/brand-spec.md` and `marge/brand-spec.md`. Round 1 (`../brand-spec.md`, `../marge/`) is untouched, kept for comparison.

## The idea
DFS's signature is the underscore, a cursor: ready, mid-thought (dfs-brand-style skill). On dfs.vc/brand.html it is also "the seam between firm and company", and partners are written `_PartnerCo`. So the family is built from characters you could type:

| | Mark | Reads as |
|---|---|---|
| DFS | `_` | the underscore. Also today's favicon (`public/favicon.png`, a bare Sky bar on white) |
| Molly | `LL` + a block cursor | the name's two L's, one stepped inside the other, and the block cursor landing. The record you move around in |
| Marge | `•_•` | two dots and the same underscore, as a mouth. The cursor that learned to talk |

Round 1's faults: the lockup stuttered (M next to MOLLY, drawn in two different hands), the OG card was one big letter, Marge was a bubble, a dash and a dot, both marks were "DFS palette plus a bar", and it ignored the `_Molly` wordmark the app already ships. The preview has the full critique.

## The module (measured from `public/brand/dfs-logo-primary.svg`, cap height 64.26)
| Part | Measured | In cap units |
|---|---|---|
| Stem | 13.45 | 0.209 |
| Horizontal arms | 12.3 | 0.19 |
| Underscore | 42.72 x 11.65 | 0.665 x 0.181 |
| Baseline to underscore | 4.76 | 0.074 |
| Underscore to first letter | 9.71 | 0.151 |
| Closest approach D to F | 9.4 | 0.146 |

The DFS letters match JetBrains Mono ExtraBold (stem 0.205 of cap), tightened. Molly's mark and both wordmarks are drawn on this module: stem 21, gap 7 (a third of a stem), in a 100-unit box.

## Rules the siblings share
1. **One module.** Stem 0.21 of cap, one gap = a third of a stem. Marge's head is the soft exception.
2. **The underscore keeps its jobs.** Prefix on every name (`_Molly`, `_Marge`), the seam between names in lockups, always Sky, always in DFS proportions. The one exception is Marge's avatar, where the mouth is Ochre or Obsidian because Sky on Ochre is 1.3:1.
3. **Three grounds.** Paper is DFS, Obsidian is Molly, Ochre is Marge. Sky appears once per surface. Ochre never touches Molly's marks. Marge's Ochre never sits directly on Paper (2.2:1): on Paper she is an Obsidian head with Ochre features.
4. **Radius is the dial.** Molly is square (admin A+). Marge is round (founder direction B). Same bones, softer skin. Both names begin with the same drawn capital M (flat vertex on the baseline, 150-unit diagonals at cap 730).

## Colour roles and contrast
| Token | Hex | Molly | Marge | DFS |
|---|---|---|---|---|
| Obsidian | #14140F | ground, corners, ink | head, ink | ink |
| Paper | #EBE8DE | reverse ink, canvas | reverse wordmark, Paper features in the small cut | ground |
| Sky | #5B8DC5 | the block, the underscore | the underscore in the wordmark only | the underscore |
| Ochre | #C9963A | never in marks | field of the avatar, features on a dark head | not used |
| DFS blue | #44688E | links and buttons, never the mark | same | same |

Measured contrast: Paper/Obsidian 15.1:1, Ochre/Obsidian 7.0:1, Sky/Obsidian 5.3:1, Sky/Paper 2.8:1 (below 3:1, so Molly's block is an accent and the L's carry the mark), Ochre/Paper 2.2:1, Paper/Ochre 2.2:1, Sky/Ochre 1.3:1.

## Type
Wordmarks are outlines; never retype them. Headlines Space Grotesk 600, body IBM Plex Sans, labels and primary CTAs JetBrains Mono 700 caps. JetBrains Mono and Space Grotesk are both SIL OFL, which allows modified outlines in a logo; no font files ship.

## Files
| File | Use |
|---|---|
| `family-lockup.svg`, `family-lockup-reverse.svg` | `_DFS _Molly _Marge` at one cap height. DFS letters are the untouched logo paths |
| `png/family-lockup@2x.png` | presentation use |
| note on the DFS letters | In `family-lockup*.svg` and `molly/molly-email-header.svg` the DFS letters are the logo's own paths filled Obsidian or Paper instead of #000 or #FFF (visually identical on these grounds). Dfs.vc/brand says not to recolour the logo, so where DFS's official file sits next to Molly in the product (nav, email), place `public/brand/dfs-logo-primary.*` unchanged |
| `concepts/` | the six concepts that were not chosen (A, B, C per product, tile and mark), so they survive if a direction changes |

## Handoff for Alvin (once a direction is approved)
1. Favicons and app icons for molly.dfs.vc: `molly/molly-favicon.ico`, `molly-icon-favicon.svg` (as `src/app/icon.svg`), `png/molly-apple-touch-180.png` (as `src/app/apple-icon.png`). Replaces `public/favicon.png`.
2. `src/components/ui/logo-mark.tsx`: replace the typed `_Molly` with an inline SVG of `molly/molly-wordmark.svg`, sized by height. 20px for nav, 22px for the login header.
3. `src/lib/email.ts`: one header image, `molly/png/molly-email-header@2x.png`, displayed 160 x 29, replacing the DFS logo `<img>` plus the "Molly · Portfolio Platform" span. Make the path env-overridable like `EMAIL_LOGO_PATH`.
4. OG: `molly/png/molly-og-card.png` (1200 x 630) as the root and login `openGraph.images`.
5. Marge is outside this repo. Her files are for the Slack app, the Telegram bot and marge.dfs.vc (see `marge/brand-spec.md`).
6. Do not retype either wordmark in CSS, and do not add Ochre to Molly's UI chrome beyond the existing attention marker.

## Open decisions (recommendation first)
1. Primary logo: wordmark `_Molly`, mark for icons. Recommend wordmark first, as DFS does.
2. Marge gets a face. Recommend yes (Deadpan); fallback is concept C (beam bubble), and nothing else changes.
3. Marge's tile: Ochre (survives Slack dark) over Obsidian-with-Ochre-head. Recommend Ochre.
4. Replace `public/favicon.png` and `LogoMark` in one change. Recommend yes.
5. OG headline "Portfolio updates and reports." is placeholder. Recommend keeping it plain.
6. Email header: opaque PNG on Paper, not transparent. Recommend opaque (dark-mode clients).
7. The Mosaic (concept B) as a secondary pattern for the login hero and empty states. Recommend building it next, from real holdings. Not in this round.
8. Dot's lineage: Marge's eyes are two dots and she replaces Dot. Recommend leaving it unmentioned publicly until Dot is retired.
9. Marge's lowercase is Space Grotesk extrapolated past its axis (outlines only). Recommend shipping the SVG and never live text.

## Still weak
- The LL reading is a story. People see corners first. If the lockup still reads as a stutter, use the wordmark everywhere.
- Sky on Paper is 2.8:1, so the block is decorative on light grounds.
- The face is a risk I chose; at 16px it is dot, dot, dash. A smirk I tested read as smug, so she stays level.
- Nothing has been seen in a real Slack workspace, Telegram, Gmail or a browser tab. The Slack, login and email mockups are rebuilt from the repo's code and from memory of Slack's layout.
- The .ico files are three PNGs, not opened in every browser. The email header is untested in clients.
- Motion is a demo, not a spec in code. The Mosaic has no pattern file.
