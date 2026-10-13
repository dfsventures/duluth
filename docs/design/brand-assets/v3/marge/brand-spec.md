# Marge brand kit, round 3

Status: direction decided (2026-10-13), files not committed. Marge's repo (dfsventures/marge) is untouched; the files are installed there by `../MANIFEST.md`.
Preview: https://claude.ai/artifact/Trth4wZeZqTuXPBgZbJbWr (round 3 is the top section; the three colour options are shown side by side there, each on Slack light and Slack dark).
Family rules, the DFS module and where round 3 bends the system: `../brand-spec.md`. Molly's kit: `../molly/brand-spec.md`. Round 2's kit (the face) is in git history (`408f948`, `docs/design/brand-assets/v2/`).

## Concept: Dog-ear
Marge is a teammate: she remembers what the team says, answers in channels, keeps DMs private. Her voice is plain, direct, a little dry (unchanged).
Her mark is a note. The head is the DFS D as a speech bubble: radius 28 on three corners, the bottom-left kept square (the DFS corner). That square corner folds down into the tail, a dog-ear turned outward, "I will come back to this". Inside, one line of text: the DFS underscore, written as the first line of the note.
There is no face. The face in round 2 was judged not welcoming, and a smirk I tested read as smug. Warmth now comes from four things: the soft bubble, the fold, the colour, and her voice.
Round 3b (after review): the first version folded the corner in over a round body, and it read as a peeled sticker. Now the body is a rounded rectangle and the fold is the tail, so the silhouette says speech first. Checked at 512, 36 and 20 pixels on Slack light and dark.
Twelve shapes are in `../concepts/marge/` with the reason each lost. Round 3a: rounded page r34 (a sticky note, the original problem), softer page r44 (warmer, still a page), wide message (a cloud, the fold gets lost), squircle (iOS-flavoured, anonymous), Obsidian note (a dark disc with a bar is a no-entry sign), bubble with a centred line (a minus sign in a circle), and the folded corner on a round body (the first pick, superseded: a peeled sticker). Round 3b: the chosen folded tail (rounded body, Cocoa tail), a Paper tail (the strongest silhouette, but the fold is gone, so it is the small cut), a round body with a tail (the tail is a sliver and the circle is a generic chat glyph), a capsule body (softer, more generic) and a tail split along its axis (reads as two small triangles).

## Colour: Clay (#B56D44), with two options
The tile must be warm and welcoming, not the mustard of round 2, and keep its edge on Slack light and on Slack dark. The three options use the same art and are exported side by side in `options/`.

| Option | Hex | On white | On Slack dark | On Paper (same ratio as Paper on it) | Obsidian on it | Verdict |
|---|---|---|---|---|---|---|
| Baobab (DFS palette) | #C3804A | 3.2 | 5.2 | 2.6 | 5.7 | Brightest, closest to the old mustard. Paper on it is only 2.6:1, so the bubble is weak against the field |
| **Clay (recommended)** | #B56D44 | 4.0 | 4.2 | 3.3 | 4.6 | Earthy, warm, not mustard. The most even of the three |
| Laterite (DFS palette) | #A65A3E | 5.1 | 3.3 | 4.1 | 3.7 | Deepest and richest, clears 3:1 everywhere. But in the product Laterite already means risk and rejection, which is the wrong thing for her to wear |

Clay is a new tint: the midpoint of Baobab and Laterite. It was not a DFS colour; it is now accepted as a named DFS tint (decided 2026-10-13). Slack dark is approximated as #1A1D21, from memory of the theme and not sampled from a real workspace.
Ruled out, with the measured contrast on white and on Slack dark: Ochre, round 2 (2.7 and 6.4; fails 3:1 on white, and the colour was disliked), Cocoa (2.1 and 8.1; no edge on Slack light), Tuareg (7.4 and 2.3; loses its edge on Slack dark), Ink #3B2A1C (13.7 and 1.2; no edge on dark at all), Sky (3.5 and 4.9; fine on contrast but cool, and it is DFS's own signature), Acacia (4.6 and 3.6; holds its edge, but olive is not warm or welcoming).

## 1. Logo
| File | Use |
|---|---|
| `marge-wordmark.svg`, `-reverse.svg` | **Primary logo**: `_Marge`. Underscore prefix like every DFS name. Identical to round 2 |
| `marge-wordmark-plain.svg` | no underscore, for lockups. Identical to round 2 |
| `marge-mark.svg` | on Paper: Clay bubble, Laterite fold, Paper line |
| `marge-mark-reverse.svg` | on Obsidian: Paper bubble, Cocoa fold, Sky line |
| `marge-mark-mono.svg` | one colour: the tail is set 2.5 units below the body and the line is a hole, so it reads on any single ink (stamp, emboss, fax) |
| `marge-lockup.svg`, `-reverse.svg` | Clay tile (radius 0.22 of the tile) with the note at 66%, then `Marge` with no underscore: the cap height (100) is centred on the tile (130), gap 34 units. The reverse sets the name in Paper; the tile stays Clay |
| `marge-bubble-construction.svg`, `marge-fold-states.svg`, `marge-wordmark-guides.svg` | the drawing, the five motion states and the wordmark guides, for handoff |

**Bubble construction** (100-unit box): the body is 100 x 72, a rounded rectangle with radius 28 (four gaps) on three corners and a square bottom-left. The tail is a 45-degree right triangle with 28-unit legs (four gaps) hanging from the square corner: its left leg continues the body's left edge and its hypotenuse is the old 45-degree crease. The line is 42 x 11.4 at (21, 21): the DFS bar (66.5 x 18.1) at 63%, left-aligned, three gaps in from the left and top, as the first line of text. Centred it reads as a minus sign (tested); two lines read as text but double the parts. The whole mark is nudged 2.5% of the tile down because the tail is light.
**Colour on the tile**: Paper bubble, Cocoa tail (the fold, a warm shadow), Sky line. Three hues on a Clay field, with Sky appearing once.
**Wordmark**: unchanged from round 2. The capital M is Molly's drawing scaled to Space Grotesk's cap height. The lowercase is Space Grotesk: its single-storey `a` (stylistic set ss01, foot cut flush with the stem), `r`, `g` (descender compressed so the tail's bottom sits on the underscore line, 25.5 below the baseline) and `e`, interpolated 1.5x beyond the 600 to 700 master step (about weight 850; the axis stops at 700) so the stems equal the M's at 0.205 of cap. Spacing by closest approach: M-a 7.8%, a-r 11.1%, r-g 8.5%, g-e 8.9% of cap. This exists only as outlines; it cannot be live text.
- **Clear space**: 0.5 of the bubble on every side. **Minimum size**: 16px using the whole-pixel cut below; wordmark cap height 9px.

## 2. Avatars and icons
| File | Use |
|---|---|
| `marge-slack-avatar-512.svg`, `png/marge-slack-avatar-512.png` | **Slack app icon.** Full-bleed Clay square (Slack rounds it), the note at 66% of the tile. `png/marge-slack-avatar-{72,36}.png` are previews |
| `marge-slack-avatar-small-512.svg`, `png/marge-slack-avatar-small-{40,20}.png` | cut for 24px and under: the note at 72%, the tail in Paper (the fold tone blurs away at 20px, and a Paper tail keeps the silhouette), the line in Obsidian (Sky on Paper is 2.8:1 and blurs at 20px) |
| `marge-telegram-avatar-512.svg`, `png/marge-telegram-avatar-512.png` | the note at 56% so the tail tip stays well inside Telegram's circle crop. Upload the square |
| `marge-icon-512.svg`, `png/marge-icon-512.png`, `png/marge-apple-touch-180.png` | web icon, same art as the Slack avatar |
| `marge-icon-favicon-16.svg`, `marge-icon-favicon.svg` (32), `marge-icon-favicon-48.svg`, `png/marge-favicon-{16,32,48}.png`, `marge-favicon.ico` | favicon on a 16 grid, whole pixels: Clay tile 16 (radius 3), Paper bubble 12 x 9 at (2, 2) with radius 3 on three corners, a 3 x 3 pixel Paper tail (the fold tone drops out at this size), Obsidian line 4 x 1 at (5, 5). 32 and 48 are exact multiples. The `.ico` holds 16, 32 and 48 as PNGs |
| `options/marge-avatar-{baobab,clay,laterite}-512.svg`, `-small-512.svg`, `png/options/` | the three colour options, full size and small cut, for a side-by-side in the real Slack app |

Notes: Slack asks for a square PNG for the app icon (I recall 512 to 2000px; check the app config page). Display name **Marge**, handle **@marge**. The short and long descriptions for the Slack app and the Telegram About and Description texts are in `../COPY.md`. There is no dark alternate this round: Clay keeps its edge on both Slack themes, so round 2's Obsidian-tile alternate is not needed.

## 3. Colour roles
| Role | Token | Hex |
|---|---|---|
| Field of the avatar and tile | Clay | #B56D44 |
| The bubble (on the tile and on Obsidian) | Paper | #EBE8DE |
| The fold (on the tile and on Obsidian) | Cocoa | #C9B08A |
| The fold when the bubble is Clay, on Paper | Laterite | #A65A3E |
| The line (the DFS bar) | Sky | #5B8DC5 |
| Small-cut line, wordmark ink | Obsidian | #14140F |

Paper on Clay is 3.3:1, which clears the 3:1 graphic bar for the bubble. Sky on Paper is 2.8:1, so the line is an accent, and the small cut moves it to Obsidian (15.1:1). The Paper bubble must never sit on Paper: on Paper use `marge-mark.svg` (the Clay bubble).

## 4. Type and voice
She writes in the host font in Slack and Telegram. On pages we own: Space Grotesk for display, IBM Plex Sans for body, JetBrains Mono only for ids and quoted numbers. No mono caps (that is Molly's voice).
Voice, unchanged: first person, short sentences, no emoji, no exclamation marks, no "as an AI". She says what she knows, how sure she is and where it came from. She keeps private things private and says so. Without a face, this voice is what makes her a teammate, so it has to be consistent.
Her lines, as set in `../COPY.md` (which also has the voice guide, eight sample replies and the Slack and Telegram store texts):
- First DM: "Hi, I'm Marge, DFS Lab's team agent. I keep track of the thesis, the portfolio, the people and the meetings. Ask me about any of them, here or in a channel. What you tell me here stays with you. I won't repeat it in a channel or to anyone else unless you ask me to, and I'll say when an answer comes from something private. The few people who can technically see stored data are listed at marge.dfs.vc. To start, link your account: [link]"
- Unknown: "I don't have that. The closest I can see is the Tuesday call, and it doesn't settle it. Want me to flag it for the next meeting?" (an example: the shipped line should name the actual meeting, not a fixed weekday)
- Private-source answer, in a DM: "That answer draws on something you told me privately, so I'm keeping it here with you. Want me to post it in the channel?"
- Asked for someone else's private information: "That's not mine to share. If it's yours, ask me in a DM and I'll answer there."

## 5. Motion: fold, write, keep (one idea)
Five states (`marge-fold-states.svg`): flat, folded, writing, written, kept.
- The corner folds when she saves something: the tail unfolds from the body's bottom edge, scaling from nothing to full over 260ms, `cubic-bezier(.2,.8,.2,1)`, hinged on its top edge. In the flat state the bubble has no tail.
- The line is written when she answers: it grows from the left over 320ms in eight steps (`steps(8)`); "writing" is the line at 45%.
- A Sky block cursor (6 x 11.4, five units after the line) blinks after the finished line at 1.1s per cycle (`steps(1)`) while she is working or waiting. That state is "kept".
Without a face, motion is the only expression she has, so it stays small. Slack and Telegram cannot animate an avatar, so this lives on marge.dfs.vc and any web surface. Reduced motion: show the final state, no loop.

## 6. Do and don't
Do: Paper bubble, Cocoa fold, Sky line on Clay; on Paper use the Clay bubble with the Laterite fold; keep the line left-aligned; use the small cut at 24px and under.
Don't: add a face (it was tried and did not feel welcoming); centre the line (it becomes a minus sign); go back to a mustard tile (it fails 3:1 on white); flip the corner (it is the DFS corner); put the Paper bubble on Paper; use Clay in Molly's marks; recolour the Sky line.

## Implementation notes
Marge's repo has no product code yet. Slack app config: icon, name, description. Telegram bot: avatar. marge.dfs.vc: favicon, apple-touch, the wordmark in the header, motion states. No OG card was designed for Marge.

## Decisions
Locked 2026-10-13:
1. Colour: Clay (#B56D44). Baobab and Laterite stay in `options/` for reference.
2. Clay is accepted as a named DFS tint.
3. The Sky line inside the avatar stays (the small cut uses Obsidian).

Still recommendations:
4. Name display "Marge" alone (Slack shows the workspace anyway): yes.
5. Expression in a Slack status: static; Slack has no API for avatar state.
6. 16px legibility of the fold: check in a real tab. Fallback: the 16px favicon already drops the fold tone (a plain Paper tail), and the wordmark carries the name.

## Still weak
- She is less characterful than the face was. The bubble now reads as speech at 512, 36 and 20, but at 24px and under the fold tone is dropped on purpose, so she is a plain bubble with a line there. The voice, the colour and the one motion idea have to do what the face did. Her voice is written out in `../COPY.md` and is untested with the team.
- The fold tone is low-contrast on purpose (Cocoa on Clay 1.9:1). In the main cut the tail is faint at 36px; at 24px and under it is Paper, so she loses the fold there.
- Nothing has been seen in a real Slack workspace or Telegram. The Slack panel is from memory of its layout. Upload the 512 and the three options to the real app and look.
- The `.ico` is three PNGs, untested across browsers. The motion is a demo, not code.
