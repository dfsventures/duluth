# Molly brand kit

Status: proposal, not committed. Preview of both kits: https://claude.ai/artifact/QiNs61skWkvzaDLxs5yGMQ
Marge's kit lives in `marge/brand-spec.md`. The two are drawn as siblings.

## Family grammar (shared by Molly and Marge, inherited from DFS)
- Square-cut geometry, Obsidian and Paper first, **one Sky bar** (the DFS underscore, bottom-left) on every mark.
- Molly is a place: square corners, mono caps, ink. Marge is a teammate: one rounded bubble, Space Grotesk, one ochre dot.
- Wordmark text is outlined to paths (JetBrains Mono 700 for Molly), so SVGs need no installed fonts.

## 1. Logo
Mark: a square-cut M (three stems and a notch, 100x80 units) with the sky bar (34x12) at y 88, x 0, directly under the left stem, as in the DFS logo.

| File | Use |
|---|---|
| molly-mark.svg / -reverse.svg | Mark on Paper / on Obsidian |
| molly-wordmark.svg | MOLLY, JetBrains Mono 700, caps, 0.14em tracking |
| molly-lockup.svg / -reverse.svg | Mark + wordmark, cap height of the wordmark = height of the M |

- **Clear space:** 25% of mark height (25u of 100u) on all sides. Nothing enters it, including the DFS logo (put a divider or 2x the gap between them).
- **Minimum size:** mark 16px (use the favicon cut below 24px), lockup 96px wide, print 6mm mark.
- The lockup repeats the letter M. That is deliberate (mark = monogram, wordmark = name). Do not drop the first letter of the wordmark.

## 2. Icon set
Obsidian tile, Paper M at 52% of the tile, sky bar. Square corners (A+). Full-bleed for 180 and 512; the OS applies its mask.
- `molly-icon-favicon.svg` (32 viewBox, M at 75%), `png/molly-favicon-{16,32,48}.png`, `molly-favicon.ico` (16/32/48; name it `favicon.ico` when shipping)
- `png/molly-apple-touch-180.png`, `png/molly-icon-512.png`, `molly-icon-512.svg`
- Replaces the current `public/favicon.png` (a bare sky bar). Implementation note for Alvin: `layout.tsx` icons metadata, `app/icon.svg` + `app/apple-icon.png` convention.
- At 16px the bar renders about 1.5px tall and blurs; it still reads as a colour accent. If it looks muddy in review, drop the bar at 16 only.

## 3. Email header and OG card
- `molly-email-header.svg` and `png/molly-email-header@2x.png`: DFS logo, 1px Bone divider, Molly lockup, in one image, display width 256, height 40, transparent background so it sits on Paper. Email clients do not render SVG, so ship the PNG. Replaces the `<img>` plus "Molly &middot; Portfolio Platform" span in `src/lib/email.ts` (alt text "DFS Lab Molly"). The 54x22 DFS image is currently served from `EMAIL_LOGO_PATH`; this would be a second env-overridable path.
- `molly-og-card.svg` / `png/molly-og-card.png` (1200x630): Obsidian ground, small lockup top-left, oversized M bleeding right, Space Grotesk 600 headline "Investor updates, fund reports, one portfolio.", mono caps descriptor in Sky. The headline is placeholder copy, decide in open decision 3. Login and shared report pages are behind auth, so OG applies to the root/login only.

## 4. Colour roles (inside the DFS palette)
| Role | Token | Hex |
|---|---|---|
| Mark ink, icon tile, OG ground | Obsidian | #14140F |
| Reverse ink, light ground | Paper | #EBE8DE |
| The bar, always, graphic use only | Sky | #5B8DC5 |
| Text-size blue (links, buttons) | DFS blue | #44688E |
| Attention in product, never in marks | Ochre | #C9963A |

Molly is the quiet sibling: ink and paper, sky appears once per surface. Ochre never appears in Molly's marks or icons (it is Marge's signature).

## Typography usage
- Wordmark and primary CTAs: JetBrains Mono 700, caps, 0.14em (wordmark) / 0.06em (CTA role).
- Headlines: Space Grotesk 600. Body and UI: IBM Plex Sans 400/500.
- Admin surfaces keep A+ (square, mono caps primary); founder and LP surfaces keep Direction B. The logo is the same on both: it is always square.

## 5. Voice (short)
Molly speaks inside the product, not as a character: no first person, no sign-offs, errors say what happened and what to do. Questions to a human go to the reply-to address.

## 6. Do and don't
Do: keep the bar bottom-left under the left stem; use Paper-on-Obsidian reverse; respect clear space; ship the PNG in email.
Don't: recolour the bar, use ochre in the mark, stretch or skew, round the tile, drop the bar, put the mark on a busy photo, redraw the wordmark in another face.

## Open decisions (recommendations)
1. **Wordmark case.** Mono caps MOLLY (matches A+, recommended) vs sentence-case "Molly" in Space Grotesk (friendlier, closer to Marge). Recommend caps: it keeps Molly the quiet place and Marge the voice.
2. **Replace the favicon site-wide.** The current favicon is the bare DFS bar. Recommend replacing with the Molly icon, and keeping the bar as the in-mark accent so DFS lineage survives.
3. **OG headline.** Copy is a placeholder. Recommend using a plain descriptor, since only login and the root are public.
4. **PNG delivery.** The favicon-16 cut may need a barless variant after seeing it in a real tab (see section 2).
5. **Dark mode.** The reverse lockup exists but the product has no dark mode (decided earlier); no UI uses it yet except the OG card.
